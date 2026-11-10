// Diagnostics: registration outcomes, per-feature checks, and the exact route.
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const home = mkdtempSync(join(tmpdir(), 'qols-diag-'))
process.env.DSH_HOME = home

const health = await import('../features/health.js')
const { feature } = await import('../features/diagnostics-host.js')
const { qolsStorage } = await import('../features/util.js')

// --- feature-level report ---------------------------------------------------
health.recordRegistration('usage', null)
health.recordRegistration('auto', new Error('adapter exploded'))
health.recordRegistration('catalog', null)
health.recordRegistration('studio', null)

const rows = health.diagnostics([{ id: 'usage' }, { id: 'auto' }, { id: 'catalog' }, { id: 'studio' }, { id: 'ghost' }])
const byId = new Map(rows.map((row) => [row.id, row]))

if (byId.get('usage').ok !== true) throw new Error('usage must be ok')
if (byId.get('usage').detail !== 'defaults (no saved settings)') throw new Error('usage detail: ' + byId.get('usage').detail)
if (byId.get('auto').ok !== false || byId.get('auto').state !== 'failed') throw new Error('auto must be failed')
if (!byId.get('auto').error.includes('adapter exploded')) throw new Error('auto error text is lost')
if (byId.get('catalog').ok !== true || !byId.get('catalog').detail.includes('entries')) throw new Error('catalog detail is wrong')
if (byId.get('studio').ok !== true) throw new Error('studio must be ok')
if (byId.get('ghost').state !== 'unregistered') throw new Error('unknown feature must be unregistered')

// --- catalog completeness ---------------------------------------------------
const { catalog } = await import('../features/catalog.js')
if (catalog.length !== 4) throw new Error('catalog must describe every user-facing feature, got ' + catalog.length)
for (const entry of catalog) {
  for (const locale of ['en', 'ru']) {
    if (typeof entry.title?.[locale] !== 'string' || entry.title[locale] === '') {
      throw new Error(`${entry.id} has no title.${locale}`)
    }
    if (typeof entry.description?.[locale] !== 'string' || entry.description[locale] === '') {
      throw new Error(`${entry.id} has no description.${locale}`)
    }
  }
}
if (byId.get('catalog').detail !== '4 entries, both locales complete') {
  throw new Error('catalog detail: ' + byId.get('catalog').detail)
}

// --- liked reports the missing subprocess service instead of pretending -----
await import('../features/liked/index.js')
health.recordRegistration('liked', null)
const likedBefore = health.diagnostics([{ id: 'liked' }])[0]
if (likedBefore.state !== 'degraded' || !likedBefore.detail.includes('subprocess')) {
  throw new Error('liked must degrade without the subprocess service: ' + JSON.stringify(likedBefore))
}
const { feature: likedFeature } = await import('../features/liked/index.js')
likedFeature.register({
  webServer: { register: () => () => {} },
  effect: (fn) => fn(),
  get: () => ({ spawn: () => { throw new Error('spawn must not run during registration') } }),
})
const likedAfter = health.diagnostics([{ id: 'liked' }])[0]
if (likedAfter.ok !== true) throw new Error('liked must be ok once the service exists: ' + JSON.stringify(likedAfter))

// The plugin config can switch the updater off; diagnostics must say so.
likedFeature.register({
  webServer: { register: () => () => {} },
  effect: (fn) => fn(),
  get: () => ({ spawn: () => { throw new Error('spawn must not run during registration') } }),
}, { updatesEnabled: false })
const likedDisabled = health.diagnostics([{ id: 'liked' }])[0]
if (likedDisabled.state !== 'degraded' || !likedDisabled.detail.includes('plugin configuration')) {
  throw new Error('a disabled updater must be reported: ' + JSON.stringify(likedDisabled))
}

// A broken settings file degrades usage instead of throwing.
mkdirSync(join(home, 'storages', 'qols', 'usage'), { recursive: true })
writeFileSync(qolsStorage('usage/settings.json'), '{not json')
const degraded = health.diagnostics([{ id: 'usage' }])[0]
if (degraded.ok !== false || degraded.state !== 'degraded') throw new Error('broken settings must degrade usage')
if (!degraded.detail.includes('not valid JSON')) throw new Error('degraded detail: ' + degraded.detail)

// --- route ------------------------------------------------------------------
const routes = new Map()
const ctx = {
  effect(factory) { factory(); return () => {} },
  webServer: { register(route) { routes.set(route.path, route); return () => {} } },
}

feature.register(ctx)
health.recordRegistration('diagnostics', null)
const route = routes.get('/api/dsh-qols/diagnostics')
if (route === undefined) throw new Error('diagnostics route was not registered')
if (route.kind !== 'exact') throw new Error('diagnostics route must be exact')

async function call(method) {
  const state = { status: 0, headers: null, body: null }
  const res = {
    writeHead(status, headers) { state.status = status; state.headers = headers },
    end(body) { state.body = body ?? null },
  }
  await route.handler({ method, url: '/api/dsh-qols/diagnostics' }, res)
  return state
}

const get = await call('GET')
if (get.status !== 200) throw new Error('GET status ' + get.status)
if (get.headers['content-type'] !== 'application/json; charset=utf-8') throw new Error('bad content type')
const payload = JSON.parse(get.body)
if (payload.ok !== true || typeof payload.version !== 'string') throw new Error('report shape is wrong')
if (!Array.isArray(payload.features) || payload.features.length < 5) throw new Error('report lost features')
if (!payload.features.some((row) => row.id === 'diagnostics' && row.ok === true)) throw new Error('diagnostics must report itself')

const post = await call('POST')
if (post.status !== 405 || post.headers.allow !== 'GET') throw new Error('POST must be 405 with allow: GET')

// --- no secrets in the report ----------------------------------------------
const forbidden = new Set(['token', 'prompt', 'prompts', 'messages', 'message', 'key', 'secret', 'authorization'])
function walk(value, path) {
  if (Array.isArray(value)) { value.forEach((item, index) => walk(item, `${path}[${index}]`)); return }
  if (value !== null && typeof value === 'object') {
    for (const [name, child] of Object.entries(value)) {
      if (forbidden.has(name.toLowerCase())) throw new Error(`forbidden field ${path}.${name}`)
      walk(child, `${path}.${name}`)
    }
  }
}
walk(payload, 'report')

console.log('QOLS DIAGNOSTICS TESTS PASSED')
console.log('- registration failure is reported as failed with a clipped error')
console.log('- a broken settings file degrades usage, it does not throw')
console.log('- the exact route answers GET and rejects POST with 405')
console.log('- the report carries no token/prompt/message fields')
