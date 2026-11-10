/**
 * Host tests for the Liked plugins core updater.
 *
 * The real route runs the bundled pnpm against the profile; here the
 * `subprocess` Service is stubbed, so the test only checks argument
 * construction, environment scrubbing, validation and the response contract.
 */

import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'

import { childEnvironment, registerRoutes, UPDATE_CORE } from '../features/liked/index.js'

const root = mkdtempSync(join(tmpdir(), 'qols-liked-core-'))
const profile = join(root, 'profile')
const pnpm = join(root, 'pnpm.cjs')
const node = join(root, 'node.exe')
mkdirSync(profile)
writeFileSync(pnpm, '')
writeFileSync(join(profile, 'package.json'), '{"name":"profile"}\n')

function ctxFor(service) {
  const routes = new Map()
  return {
    routes,
    ctx: {
      webServer: {
        register(route) {
          routes.set(route.path, route.handler)
          return () => {}
        },
      },
      effect(fn) {
        fn()
      },
      get(name) {
        return name === 'subprocess' ? service : undefined
      },
    },
  }
}

function response() {
  return {
    status: 0,
    headers: null,
    body: '',
    writeHead(status, headers) {
      this.status = status
      this.headers = headers ?? null
    },
    end(body = '') {
      this.body = String(body)
    },
  }
}

function request(method, payload) {
  const req = Readable.from(payload === undefined ? [] : [Buffer.from(JSON.stringify(payload))])
  req.method = method
  req.url = UPDATE_CORE
  return req
}

function fakeSubprocess({ exitCode = 0, stdout = '', stderr = '', deferred = false } = {}) {
  const calls = []
  const state = { terminated: 0 }
  let settle
  const service = {
    spawn(spec) {
      calls.push(spec)
      const done = new Promise((resolve) => {
        settle = (code) => resolve({ exitCode: code, signal: null })
        if (!deferred) queueMicrotask(() => settle(exitCode))
      })
      return {
        stdin: undefined,
        stdout: undefined,
        stderr: undefined,
        control: undefined,
        collected: {
          stdout: { readFrom: () => ({ text: stdout, nextOffset: stdout.length, lossy: false }) },
          stderr: { readFrom: () => ({ text: stderr, nextOffset: stderr.length, lossy: false }) },
        },
        done,
        terminate() {
          state.terminated += 1
          settle(null)
        },
        waitForExit: async () => true,
      }
    },
  }
  return { service, calls, state, release: () => settle?.(exitCode) }
}

/* ---- happy path: one managed pnpm run, scrubbed environment ------------- */

{
  process.env.DSH_SECRET_TOKEN = 'leak-me'
  process.env.MY_TOKEN = 'leak-me-too'
  const fake = fakeSubprocess({ stdout: 'added dshmarket@1.73.17\n' })
  const { ctx, routes } = ctxFor(fake.service)
  registerRoutes(ctx, { subprocess: fake.service, nodePath: node, pnpmPath: pnpm, profileDir: profile })

  const res = response()
  await routes.get(UPDATE_CORE)(request('POST', { version: '1.73.17' }), res)

  assert.equal(res.status, 200, 'successful update returns 200')
  const payload = JSON.parse(res.body)
  assert.equal(payload.ok, true)
  assert.equal(payload.version, '1.73.17')
  assert.equal(payload.restart, true)
  assert.match(payload.output, /dshmarket@1\.73\.17/u)

  assert.equal(fake.calls.length, 1, 'one pnpm run')
  const spec = fake.calls[0]
  assert.deepEqual(spec.argv.slice(1), [pnpm, 'add', 'dshmarket@1.73.17', '--config.minimum-release-age=0'])
  assert.equal(spec.argv[0], node)
  assert.equal(spec.cwd, profile)
  assert.equal(spec.env.npm_config_minimum_release_age, '0')
  assert.equal(typeof spec.graceMs, 'number')
  assert.deepEqual(spec.stdio.stdin, 'ignore')
  assert.ok(spec.stdio.stdout.maxBytes > 0, 'stdout is collected through the provider')

  for (const key of Object.keys(spec.env)) {
    assert.ok(!key.startsWith('DSH_'), `harness state must not reach pnpm: ${key}`)
    assert.ok(!/KEY|PASSWORD|SECRET|TOKEN/iu.test(key), `credential must not reach pnpm: ${key}`)
  }
  assert.equal(fake.state.terminated, 0)
  const pathKey = Object.keys(spec.env).find((key) => key.toUpperCase() === 'PATH')
  assert.ok(pathKey !== undefined, 'PATH survives so pnpm can start')
  assert.equal(spec.env[pathKey], process.env[pathKey])
}

/* ---- validation and method handling ------------------------------------- */

{
  const fake = fakeSubprocess()
  const { ctx, routes } = ctxFor(fake.service)
  registerRoutes(ctx, { subprocess: fake.service, nodePath: node, pnpmPath: pnpm, profileDir: profile })
  const res = response()
  await routes.get(UPDATE_CORE)(request('POST', { version: '1.73.17; rm -rf /' }), res)
  assert.equal(res.status, 400, 'unsafe version is rejected')
  assert.equal(fake.calls.length, 0, 'no pnpm run for unsafe input')
}

{
  const fake = fakeSubprocess()
  const { ctx, routes } = ctxFor(fake.service)
  registerRoutes(ctx, { subprocess: fake.service, nodePath: node, pnpmPath: pnpm, profileDir: profile })
  const res = response()
  await routes.get(UPDATE_CORE)(request('GET'), res)
  assert.equal(res.status, 405)
  assert.equal(res.headers?.allow, 'POST')
}

{
  const { ctx, routes } = ctxFor(undefined)
  registerRoutes(ctx, { nodePath: node, pnpmPath: pnpm, profileDir: profile })
  const res = response()
  await routes.get(UPDATE_CORE)(request('POST', { version: '1.73.17' }), res)
  assert.equal(res.status, 503, 'a host without the subprocess service fails loud, not silently')
  assert.match(JSON.parse(res.body).error, /subprocess/u)
}

{
  const fake = fakeSubprocess({ exitCode: 0 })
  const { ctx, routes } = ctxFor(fake.service)
  registerRoutes(ctx, {
    subprocess: fake.service,
    nodePath: node,
    pnpmPath: pnpm,
    profileDir: profile,
    updatesEnabled: false,
  })
  const res = response()
  await routes.get(UPDATE_CORE)(request('POST', { version: '1.73.17' }), res)
  assert.equal(res.status, 403, 'the config gate answers before any work starts')
  assert.match(JSON.parse(res.body).error, /disabled in the plugin configuration/u)
  assert.equal(fake.calls.length, 0, 'a disabled updater never spawns pnpm')
}

/* ---- failure and timeout ------------------------------------------------ */

{
  const fake = fakeSubprocess({ exitCode: 1, stderr: 'ERR_PNPM_FETCH_404\n' })
  const { ctx, routes } = ctxFor(fake.service)
  registerRoutes(ctx, { subprocess: fake.service, nodePath: node, pnpmPath: pnpm, profileDir: profile })
  const res = response()
  await routes.get(UPDATE_CORE)(request('POST', { version: '9.9.9' }), res)
  assert.equal(res.status, 500)
  const payload = JSON.parse(res.body)
  assert.equal(payload.ok, false)
  assert.match(payload.output, /ERR_PNPM_FETCH_404/u)
}

{
  const fake = fakeSubprocess({ deferred: true })
  const { ctx, routes } = ctxFor(fake.service)
  registerRoutes(ctx, { subprocess: fake.service, nodePath: node, pnpmPath: pnpm, profileDir: profile, timeoutMs: 5 })
  const res = response()
  await routes.get(UPDATE_CORE)(request('POST', { version: '1.73.17' }), res)
  assert.equal(fake.state.terminated, 1, 'the timeout terminates the managed child')
  assert.equal(res.status, 500)
  assert.match(JSON.parse(res.body).output, /timed out/u)
}

/* ---- single flight ------------------------------------------------------ */

{
  const fake = fakeSubprocess({ deferred: true })
  const { ctx, routes } = ctxFor(fake.service)
  registerRoutes(ctx, { subprocess: fake.service, nodePath: node, pnpmPath: pnpm, profileDir: profile })
  const first = response()
  const pending = routes.get(UPDATE_CORE)(request('POST', { version: '1.73.17' }), first)
  const second = response()
  await routes.get(UPDATE_CORE)(request('POST', { version: '1.73.18' }), second)
  assert.equal(second.status, 409, 'a second update is refused while one runs')
  fake.release()
  await pending
  assert.equal(first.status, 200)
}

/* ---- environment allow-list in isolation -------------------------------- */

{
  const env = childEnvironment({
    PATH: '/bin',
    DSH_HOME: '/dsh',
    GITHUB_TOKEN: 'x',
    AWS_SECRET_ACCESS_KEY: 'x',
    npm_config_registry: 'https://example.invalid',
    RANDOM_VAR: 'x',
  })
  assert.equal(env.PATH, '/bin')
  assert.equal(env.DSH_HOME, undefined)
  assert.equal(env.GITHUB_TOKEN, undefined)
  assert.equal(env.AWS_SECRET_ACCESS_KEY, undefined)
  assert.equal(env.npm_config_registry, 'https://example.invalid')
  assert.equal(env.RANDOM_VAR, undefined)
  assert.equal(env.npm_config_minimum_release_age, '0')
}

console.log('QOLS LIKED CORE TESTS PASSED')
