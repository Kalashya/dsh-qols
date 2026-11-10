/**
 * Core updater for the Liked plugins tab.
 *
 * DSH Market cannot update itself through `/dsh-market/update`: that route
 * removes the market from the running composition before reinstalling it, so
 * the reinstall step never runs (#900). The supported workaround is to update
 * the profile with pnpm directly, then restart DSH to load the new code.
 *
 * This route does exactly that, with the pnpm bundled into the DSH runtime.
 * It deliberately accepts only a dshmarket version and never shells out with a
 * caller-controlled package name. The child runs through `ctx.subprocess`, the
 * host-managed service, so the harness owns the process tree and can terminate
 * it with the app; a bare `node:child_process.spawn` would escape that tree.
 */

import { existsSync, readdirSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import { dshHome, json, messageOf, readJsonBody } from '../util.js'

export const UPDATE_CORE = '/api/dsh-qols/liked/update-core'

const VERSION = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/
const OUTPUT_LIMIT = 8000
const TIMEOUT_MS = 5 * 60 * 1000

/**
 * Variables the child legitimately needs. Everything else is dropped: the
 * profile update must not inherit harness state or credentials.
 */
const ENV_KEEP = new Set([
  'PATH',
  'PATHEXT',
  'HOME',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
  'PROGRAMDATA',
  'PROGRAMFILES',
  'PROGRAMFILES(X86)',
  'WINDIR',
  'SystemRoot',
  'ComSpec',
  'TEMP',
  'TMP',
  'TMPDIR',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'XDG_CONFIG_HOME',
  'XDG_CACHE_HOME',
  'XDG_DATA_HOME',
  'PNPM_HOME',
  'NODE_EXTRA_CA_CERTS',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'no_proxy',
])

const ENV_SECRET = /KEY|PASSWORD|SECRET|TOKEN/iu
const ENV_ALLOWED_PREFIX = /^(?:npm_config_|NPM_CONFIG_)/u

let inFlight = null
let routeReady = false
let updatesDisabled = false

/** Diagnostics reads this: the route is only useful with a managed subprocess. */
export function updateState() {
  if (updatesDisabled) {
    return { ok: false, detail: 'updates are disabled in the plugin configuration' }
  }
  return routeReady
    ? { ok: true, detail: 'update route registered' }
    : { ok: false, detail: 'the host exposes no subprocess service, so updates are disabled' }
}

export const feature = {
  id: 'liked',
  register(ctx, runtime = {}) {
    registerRoutes(ctx, { updatesEnabled: runtime.updatesEnabled !== false })
  },
}

export function registerRoutes(ctx, overrides = {}) {
  const subprocess =
    overrides.subprocess ?? (typeof ctx.get === 'function' ? ctx.get('subprocess') : undefined)
  const runtime = resolveRuntime()
  const nodePath = overrides.nodePath ?? runtime.nodePath
  const pnpmPath = overrides.pnpmPath ?? runtime.pnpmPath
  const profileDir = overrides.profileDir ?? resolveProfileDir()
  const timeoutMs = overrides.timeoutMs ?? TIMEOUT_MS
  const updatesEnabled = overrides.updatesEnabled !== false

  const handler = async (req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(405, { allow: 'POST' })
      res.end()
      return
    }
    if (!updatesEnabled) {
      json(res, 403, { ok: false, error: 'core updates are disabled in the plugin configuration' })
      return
    }
    try {
      const body = await readJsonBody(req)
      const version = String(body.version ?? '').trim()
      if (!VERSION.test(version) || version.length > 40) {
        json(res, 400, { ok: false, error: 'a valid dshmarket version is required' })
        return
      }
      if (inFlight !== null) {
        json(res, 409, { ok: false, error: 'an update is already running' })
        return
      }
      if (typeof subprocess?.spawn !== 'function') {
        json(res, 503, {
          ok: false,
          error: 'the host does not expose the subprocess service, so the update cannot run safely',
        })
        return
      }
      if (profileDir === null || !existsSync(join(profileDir, 'package.json'))) {
        json(res, 500, { ok: false, error: 'the DSH profile directory could not be resolved' })
        return
      }
      if (!existsSync(pnpmPath)) {
        json(res, 500, { ok: false, error: `the bundled pnpm was not found at ${pnpmPath}` })
        return
      }

      inFlight = runPnpm({ subprocess, nodePath, pnpmPath, profileDir, version, timeoutMs })
      const result = await inFlight
      if (result.code === 0) {
        json(res, 200, { ok: true, name: 'dshmarket', version, restart: true, output: result.output })
      } else {
        json(res, 500, {
          ok: false,
          error: 'pnpm could not update dshmarket',
          code: result.code,
          output: result.output,
        })
      }
    } catch (error) {
      json(res, 500, { ok: false, error: messageOf(error) })
    } finally {
      inFlight = null
    }
  }

  try {
    ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: UPDATE_CORE, handler }), `qols: liked ${UPDATE_CORE}`)
    routeReady = typeof subprocess?.spawn === 'function'
    updatesDisabled = !updatesEnabled
  } catch (error) {
    routeReady = false
    console.log(`[qols] could not register ${UPDATE_CORE}: ${messageOf(error)}`)
  }
}

function resolveProfileDir() {
  const fromEnv = process.env.DSH_PROFILE_DIR
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') return fromEnv
  const profile = process.env.DSH_PROFILE
  if (typeof profile === 'string' && profile.trim() !== '') return join(dshHome(), 'profiles', profile)
  return null
}

/**
 * The host may run as Electron with ELECTRON_RUN_AS_NODE, so
 * `process.execPath` is not necessarily node.exe. Prefer the runtime's own
 * node and pnpm binaries, which sit next to each other under dsh-runtimes.
 */
function resolveRuntime() {
  const exeDir = dirname(process.execPath)
  if (basename(process.execPath).toLowerCase() === 'node.exe') {
    const candidate = join(exeDir, '..', '..', 'pnpm', 'bin', 'pnpm.cjs')
    if (existsSync(candidate)) return { nodePath: process.execPath, pnpmPath: candidate }
  }

  const runtimes = join(dshHome(), 'dsh-runtimes')
  try {
    for (const entry of readdirSync(runtimes, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const dependencies = join(runtimes, entry.name, 'dependencies')
      const nodePath = join(dependencies, 'node', 'bin', 'node.exe')
      const pnpmPath = join(dependencies, 'pnpm', 'bin', 'pnpm.cjs')
      if (existsSync(nodePath) && existsSync(pnpmPath)) return { nodePath, pnpmPath }
    }
  } catch {
    // Fall through to the electron executable; ELECTRON_RUN_AS_NODE makes it
    // behave like node even when the derived pnpm path is wrong.
  }
  return { nodePath: process.execPath, pnpmPath: join(exeDir, '..', '..', 'pnpm', 'bin', 'pnpm.cjs') }
}

/**
 * The environment handed to pnpm: an allow-list, minus anything that looks like
 * a credential. `DSH_*` is dropped wholesale so harness state cannot leak into
 * a package install.
 */
export function childEnvironment(source = process.env) {
  const env = {}
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue
    const upper = key.toUpperCase()
    if (upper.startsWith('DSH_')) continue
    if (ENV_SECRET.test(key)) continue
    if (!ENV_KEEP.has(upper) && !ENV_ALLOWED_PREFIX.test(key)) continue
    env[key] = value
  }
  env.npm_config_minimum_release_age = '0'
  return env
}

function runPnpm({ subprocess, nodePath, pnpmPath, profileDir, version, timeoutMs }) {
  return new Promise((resolve) => {
    let settled = false
    let timedOut = false
    let handle
    const collectedText = () => {
      const parts = []
      for (const reader of [handle?.collected?.stdout, handle?.collected?.stderr]) {
        if (reader === undefined) continue
        try {
          const text = reader.readFrom(0)?.text
          if (typeof text === 'string' && text !== '') parts.push(text)
        } catch {
          // A reader that cannot be read is not worth failing the update over.
        }
      }
      return parts.join('\n').slice(-OUTPUT_LIMIT).trim()
    }
    const finish = (code) => {
      if (settled) return
      settled = true
      if (timer !== null) clearTimeout(timer)
      const output = collectedText()
      resolve({
        code,
        output: timedOut ? `${output}\npnpm timed out after 5 minutes`.trim() : output,
      })
    }

    try {
      handle = subprocess.spawn({
        argv: [nodePath, pnpmPath, 'add', `dshmarket@${version}`, '--config.minimum-release-age=0'],
        cwd: profileDir,
        env: childEnvironment(),
        stdio: {
          stdin: 'ignore',
          stdout: { maxBytes: OUTPUT_LIMIT },
          stderr: { maxBytes: OUTPUT_LIMIT },
        },
        graceMs: 10_000,
      })
    } catch (error) {
      resolve({ code: null, output: messageOf(error) })
      return
    }

    const timer = setTimeout(() => {
      timedOut = true
      try {
        handle.terminate()
      } catch {
        // The process may already be gone.
      }
    }, timeoutMs)

    handle.done.then(
      (outcome) => finish(outcome?.exitCode ?? null),
      (error) => {
        if (settled) return
        settled = true
        if (timer !== null) clearTimeout(timer)
        resolve({ code: null, output: `${collectedText()}\n${messageOf(error)}`.trim() })
      },
    )
  })
}
