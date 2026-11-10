import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'qols-load-'))

const qols = await import('../index.js')
console.log('package name:', qols.name)
console.log('inject:', JSON.stringify(qols.inject))

// The loader renders the Config form from this schema; it must be a static,
// walkable expression and its defaults must be the documented behaviour.
if (typeof qols.Config !== 'function') throw new Error('Config schema missing')
const defaults = qols.Config({})
if (JSON.stringify(defaults) !== JSON.stringify({ updates: { enabled: true } })) {
  throw new Error('Config defaults drifted: ' + JSON.stringify(defaults))
}
const disabled = qols.Config({ updates: { enabled: false } })
if (disabled.updates.enabled !== false) throw new Error('Config does not accept updates.enabled=false')

const routes = []
const adapters = []

const llm = {
  registerAdapter(providers, adapter) {
    adapters.push({ providers, adapter })
    return { dispose() {} }
  },
  async resolveCallConfig({ provider, model, reasoningEffort }) { return { provider, model, reasoningEffort } },
  async *stream() { yield { type: 'finish', reason: { kind: 'stop' } } },
}

const scope = {
  llm,
  effect(fn) { return () => {} },
  on() { return () => {} },
}

const ctx = {
  webServer: { register(route) { routes.push(route); return () => {} } },
  effect(fn) { fn(); return () => {} },
  on() { return () => {} },
  inject(names, callback) { callback(scope) },
  get() { return undefined },
  locale: { register() { return () => {} }, bind() { return (key) => key } },
}

qols.apply(ctx)

console.log('routes:', routes.map((route) => route.path).sort().join(', '))
console.log('adapters:', adapters.map((entry) => entry.providers.join('+')).join(', '))
if (!routes.some((route) => route.path.startsWith('/api/dsh-qols/auto/'))) throw new Error('auto routes missing')
if (!adapters.some((entry) => entry.providers.includes('qols-auto'))) throw new Error('auto adapter missing')
console.log('QOLS LOAD SMOKE PASSED')
