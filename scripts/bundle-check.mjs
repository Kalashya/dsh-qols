#!/usr/bin/env node
/**
 * Checks the parts of the bundle that DeepSeek Harness itself relies on:
 * the manifest contract, the loader row, the client factory id, and the
 * runtime files that `package.json#files` promises to ship.
 *
 * This is the static half of `npm run verify`. It never touches the network,
 * the profile or the real DSH_HOME: the client bundle is evaluated against a
 * throwaway `window`/`document` pair so the factory can be inspected.
 *
 * Usage: node scripts/bundle-check.mjs
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const problems = []
const passes = []

function fail(message) {
  problems.push(message)
}

function pass(message) {
  passes.push(message)
}

function read(relative) {
  return readFileSync(join(root, relative), 'utf8')
}

function exists(relative) {
  return existsSync(join(root, relative))
}

const pkg = JSON.parse(read('package.json'))

/* ---- manifest contract -------------------------------------------------- */

if (pkg.type !== 'module') fail('package.json must declare "type": "module"')

const entry = pkg.exports?.['.']
if (typeof entry !== 'string' || !exists(entry)) {
  fail(`exports["."] must point at a shipped file, got ${JSON.stringify(entry)}`)
} else {
  pass(`entry ${entry}`)
}

const clientExport = pkg.exports?.['./client']
if (pkg.dsh?.client !== undefined) {
  if (typeof clientExport !== 'string' || !exists(clientExport)) {
    fail('dsh.client is declared, so exports["./client"] must point at the bundle')
  } else {
    pass(`client export ${clientExport}`)
  }
  if (pkg.dsh.client.platform !== 'web') fail('dsh.client.platform must be "web"')
  if (!Array.isArray(pkg.dsh.client.inject) || pkg.dsh.client.inject.length === 0) {
    fail('dsh.client.inject must list at least one client package')
  }
  if ((pkg.dsh.client.external ?? []).includes(pkg.name)) {
    fail('dsh.client.external must not list the package itself')
  }
}

if (pkg.engines?.dsh === undefined) {
  fail('engines.dsh is missing: the loader cannot decide compatibility without it')
} else {
  pass(`engines.dsh ${pkg.engines.dsh}`)
}

/* ---- loader row --------------------------------------------------------- */

const patchPath = pkg.dsh?.bundle?.patch
if (typeof patchPath !== 'string') {
  fail('dsh.bundle.patch is missing: the bundle would be refused with "not-a-bundle"')
} else if (!exists(patchPath)) {
  fail(`dsh.bundle.patch points at a missing file: ${patchPath}`)
} else {
  const yaml = read(patchPath)
  const body = yaml
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
  if (body.length === 0) fail(`${patchPath} is empty`)
  else if (!body[0].startsWith('-')) {
    fail(`${patchPath} must be a top-level YAML array of loader patch entries`)
  } else if (!/^-\s*(insert|override|remove|group|isolate|disabled)\s*:/mu.test(body[0])) {
    fail(`${patchPath} first row must be a patch mapping such as "- insert:"`)
  } else if (!yaml.includes(pkg.name)) {
    fail(`${patchPath} must name the package it mounts (${pkg.name})`)
  } else {
    pass(`${patchPath} mounts ${pkg.name}`)
  }
}

/* ---- runtime files ------------------------------------------------------ */

const runtimePaths = [
  entry,
  clientExport,
  patchPath,
  pkg.icon?.replace(/^\.\//u, ''),
  'features/index.js',
  'locale/en.json',
  'locale/ru.json',
].filter((value) => typeof value === 'string')

for (const relative of runtimePaths) {
  if (!exists(relative)) fail(`runtime file is missing: ${relative}`)
}
if (runtimePaths.every((relative) => exists(relative))) {
  pass(`${runtimePaths.length} runtime files present`)
}

/* ---- client factory ----------------------------------------------------- */

if (typeof clientExport === 'string' && exists(clientExport)) {
  const source = read(clientExport)

  const loads = source.match(/__ModuleLoader__\.load\(/gu) ?? []
  if (loads.length !== 1) {
    fail(`${clientExport} must register exactly one module, found ${loads.length}`)
  }

  const id = source.match(/__ModuleLoader__\.load\(\s*\{[^}]*?\bid:\s*['"]([^'"]+)['"]/su)?.[1]
  if (id === undefined) fail(`${clientExport} does not declare a module id`)
  else if (id !== pkg.name) fail(`client module id is ${JSON.stringify(id)}, expected ${JSON.stringify(pkg.name)}`)
  else pass(`client module id ${id}`)

  if (/^\s*import\s/mu.test(source)) {
    fail(`${clientExport} must stay a classic script: top-level import statements break the loader`)
  }

  if (!source.includes('__qolsClientApplied')) {
    fail(`${clientExport} has no double-apply guard: a hot reload would register every slot twice`)
  }

  const registrations = []
  const fakeReact = new Proxy(
    {},
    {
      get: () => () => undefined,
    },
  )
  const fakeRequire = (name) => {
    if (name === 'react' || name === 'react-dom') return fakeReact
    throw new Error(`the client bundle required an unexpected module: ${name}`)
  }
  const elementStub = () => ({
    style: {},
    dataset: {},
    classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
    setAttribute() {},
    getAttribute: () => null,
    removeAttribute() {},
    appendChild() {},
    removeChild() {},
    remove() {},
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
  })
  const documentStub = {
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    createElement: elementStub,
    createElementNS: elementStub,
    head: elementStub(),
    body: elementStub(),
    documentElement: elementStub(),
    addEventListener() {},
    removeEventListener() {},
  }

  let definition
  const windowStub = {
    __ModuleLoader__: {
      load(value) {
        definition = value
      },
    },
    setInterval: () => 0,
    clearInterval() {},
    setTimeout: () => 0,
    clearTimeout() {},
    addEventListener() {},
    removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    location: { href: 'http://127.0.0.1/' },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {}, clear() {}, key: () => null, length: 0 },
    fetch: () => Promise.reject(new Error('network is disabled in the bundle check')),
  }

  // The stubs stay installed for the rest of the process: the factory and
  // apply() resolve window/document lazily, and this script exits right after.
  globalThis.window = windowStub
  globalThis.document = documentStub
  globalThis.fetch = windowStub.fetch
  globalThis.localStorage = windowStub.localStorage
  try {
    new Function(source)()
  } catch (error) {
    fail(`evaluating ${clientExport} threw: ${error instanceof Error ? error.message : String(error)}`)
  }

  if (definition === undefined) {
    fail(`${clientExport} did not call __ModuleLoader__.load`)
  } else if (typeof definition.factory !== 'function') {
    fail(`${clientExport} module has no factory function`)
  } else {
    let module
    try {
      module = definition.factory(fakeRequire)
    } catch (error) {
      fail(`client factory threw: ${error instanceof Error ? error.message : String(error)}`)
    }
    if (module !== undefined) {
      if (!Array.isArray(module.inject)) fail('client module must export an inject array')
      if (typeof module.apply !== 'function') fail('client module must export an apply function')
      if (Array.isArray(module.inject) && typeof module.apply === 'function') {
        const fakeCtx = {
          slots: {
            inject(_name, register) {
              return register()
            },
            register(options) {
              registrations.push(options?.id ?? options?.name ?? '?')
              return () => {}
            },
          },
          locale: {
            register: () => ({ bind: () => (key) => key, extend: () => (key) => key }),
            bind: () => (key) => key,
            extend: () => (key) => key,
            t: (key) => key,
          },
          effect: (run) => run(),
          on: () => () => {},
          get: () => undefined,
          consume: () => {},
          provide: () => {},
        }
        // apply() reports problems by logging instead of throwing, so the log
        // is captured and shown as a note; a hard throw is a failure.
        const logged = []
        const originalError = console.error
        console.error = (...args) => logged.push(args.map((value) => String(value)).join(' '))
        try {
          module.apply(fakeCtx)
        } catch (error) {
          fail(`client apply threw: ${error instanceof Error ? error.message : String(error)}`)
        } finally {
          console.error = originalError
        }
        for (const line of logged) pass(`apply log: ${line.slice(0, 200)}`)
        if (registrations.length === 0) fail('client apply registered no slots')
        else pass(`client apply registered ${registrations.length} slots: ${registrations.join(', ')}`)
        if (new Set(registrations).size !== registrations.length) {
          fail('client apply registered the same slot id twice')
        }
      }
    }
  }
}

/* ---- report ------------------------------------------------------------- */

for (const line of passes) console.log(`ok   ${line}`)
for (const line of problems) console.error(`FAIL ${line}`)

if (problems.length > 0) {
  console.error(`\nbundle check failed: ${problems.length} problem(s)`)
  process.exit(1)
}

console.log(`\nBUNDLE CHECK PASSED (${passes.length} checks)`)
