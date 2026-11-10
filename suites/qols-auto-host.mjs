import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const home = mkdtempSync(join(tmpdir(), 'qols-auto-host-'))
process.env.DSH_HOME = home

const { feature } = await import('../features/auto/host.js')
assert.equal(feature.id, 'auto')

const routes = new Map()
const effects = []
let registeredProvider
let disposeCount = 0

const upstreamCalls = []
const providers = [
  { id: 'deepseek-account', name: 'DeepSeek (account)' },
  { id: 'deepseek-official', name: 'DeepSeek (API key)' },
]
const catalog = {
  'deepseek-account': [
    { id: 'deepseek-flash', name: 'DeepSeek Flash' },
    { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro' },
  ],
  'deepseek-official': [{ id: 'deepseek-flash', name: 'DeepSeek Flash' }],
}
const infos = {
  'deepseek-account/deepseek-flash': { provider: 'deepseek-account', id: 'deepseek-flash', name: 'DeepSeek Flash', reasoning: { efforts: [{ id: 'off' }, { id: 'high' }, { id: 'max' }], defaultEffort: 'high' } },
  'deepseek-account/deepseek-v4-pro': { provider: 'deepseek-account', id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', reasoning: { efforts: [{ id: 'off' }, { id: 'high' }, { id: 'max' }], defaultEffort: 'high' } },
  'deepseek-official/deepseek-flash': { provider: 'deepseek-official', id: 'deepseek-flash', name: 'DeepSeek Flash', reasoning: { efforts: [{ id: 'low' }, { id: 'high' }], defaultEffort: 'high' } },
}
const llm = {
  registerAdapter(providers, adapter) {
    registeredProvider = { providers, adapter }
    return { dispose() { disposeCount += 1 } }
  },
  async listProviders() {
    return providers
  },
  async listModels(provider) {
    return catalog[provider] ?? []
  },
  async resolveModelInfo(provider, model) {
    const info = infos[`${provider}/${model}`]
    if (info === undefined) throw new Error(`unknown model ${provider}/${model}`)
    return info
  },
  async resolveCallConfig({ provider, model, reasoningEffort }) {
    return { provider, model, reasoningEffort }
  },
  async *stream(options) {
    upstreamCalls.push(options)
    yield { type: 'text-delta', index: 0, text: 'hello' }
    yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 2 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  },
}

const ctx = {
  inject(names, callback) {
    assert.deepEqual(names, ['llm'])
    callback({ llm, effect: ctx.effect, on: ctx.on })
  },
  effect(callback, label) {
    const dispose = callback()
    effects.push({ label, dispose })
    return () => {}
  },
  on(name, callback) {
    assert.equal(name, 'llm/adapters-updated')
    return () => {}
  },
  webServer: {
    register(route) {
      routes.set(route.path, route)
      return () => {}
    },
  },
}

feature.register(ctx)

// ---- registration -------------------------------------------------------
assert.ok(registeredProvider, 'provider must be registered')
assert.deepEqual(registeredProvider.providers, ['qols-auto'])
assert.equal(routes.size, 5, `expected 5 routes, got ${[...routes.keys()]}`)
for (const path of routes.keys()) assert.match(path, /^\/api\/dsh-qols\/auto\//)

const adapter = registeredProvider.adapter
assert.deepEqual(adapter.providerInfo('qols-auto'), { id: 'qols-auto', name: 'QoLs Auto' })

const adapterModels = await adapter.listModels('qols-auto')
assert.equal(adapterModels.length, 1)
assert.equal(adapterModels[0].id, 'auto')
assert.deepEqual(adapterModels[0].reasoning.efforts.map((effort) => effort.id), ['auto', 'eco', 'standard', 'deep'])
assert.equal(adapterModels[0].reasoning.defaultEffort, 'auto')

// ---- one real call through the adapter ---------------------------------
const chunks = []
for await (const chunk of adapter.stream({
  provider: 'qols-auto',
  model: 'auto',
  reasoningEffort: 'auto',
  sessionId: 'sess-1',
  messages: [{ role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'привет' }] }],
})) chunks.push(chunk)

assert.deepEqual(chunks.map((chunk) => chunk.type), ['text-delta', 'usage', 'finish'])
assert.equal(upstreamCalls.length, 1)
assert.equal(upstreamCalls[0].provider, 'deepseek-account')
assert.equal(upstreamCalls[0].model, 'deepseek-flash')
assert.equal(upstreamCalls[0].reasoningEffort, 'off')
assert.equal('via' in upstreamCalls[0], false)

// ---- http surface -------------------------------------------------------
async function call(path, query, req) {
  const route = routes.get(path)
  assert.ok(route, `route ${path} must exist`)
  let status = 0
  let body = ''
  const res = {
    writeHead(value) { status = value },
    end(value) { body = value },
  }
  const request = req ?? { method: 'GET', url: `${path}?${query ?? ''}` }
  await route.handler(request, res)
  return { status, json: body === '' ? null : JSON.parse(body) }
}

function postReq(path, payload) {
  const listeners = new Map()
  const request = {
    method: 'POST',
    url: path,
    on(event, callback) {
      listeners.set(event, callback)
      return request
    },
    destroy() {},
  }
  queueMicrotask(() => {
    listeners.get('data')?.(Buffer.from(JSON.stringify(payload)))
    listeners.get('end')?.()
  })
  return request
}

const last = await call('/api/dsh-qols/auto/last', 'sessionId=sess-1')
assert.equal(last.status, 200)
assert.equal(last.json.decision.tier, 'eco')
assert.equal(last.json.decision.source, 'heuristic')
assert.equal(last.json.decision.provider, 'deepseek-account')

const log = await call('/api/dsh-qols/auto/log', 'limit=5')
assert.equal(log.json.entries.length, 1)
assert.equal(JSON.stringify(log.json).includes('привет'), false, 'task text must never reach the client')

const cfg = await call('/api/dsh-qols/auto/config', '')
assert.equal(cfg.json.provider, 'qols-auto')
assert.equal(cfg.json.tiers.deep.model, 'deepseek-v4-pro')
assert.equal(cfg.json.classifier.source, 'default')
assert.equal(cfg.json.classifier.model, 'deepseek-flash')

const status = await call('/api/dsh-qols/auto/status', '')
assert.equal(status.json.registered, true)
assert.equal(status.json.journal.entries, 1)

const journalFile = join(home, 'storages', 'qols', 'auto', 'log.jsonl')
assert.ok(existsSync(journalFile), 'journal file must be persisted')
assert.equal(readFileSync(journalFile, 'utf8').includes('привет'), false)

// unknown session returns null, not an error
const empty = await call('/api/dsh-qols/auto/last', 'sessionId=nope')
assert.equal(empty.json.decision, null)

// ---- model list for the dropdown ---------------------------------------
const models = await call('/api/dsh-qols/auto/models', '')
assert.equal(models.status, 200)
const accountGroup = models.json.groups.find((group) => group.id === 'deepseek-account')
assert.ok(accountGroup, 'deepseek-account must be listed')
assert.deepEqual(accountGroup.models.map((model) => model.id), ['deepseek-flash', 'deepseek-v4-pro'])
assert.equal(accountGroup.models[1].name, 'DeepSeek V4 Pro')
assert.deepEqual(accountGroup.models[1].efforts, ['off', 'high', 'max'])
assert.equal(models.json.groups.some((group) => group.id === 'qols-auto'), false, 'the Auto provider must not judge itself')
assert.equal(models.json.groups.length, 2)

// ---- switching the judge model -----------------------------------------
const badProvider = await call('/api/dsh-qols/auto/config', '', postReq('/api/dsh-qols/auto/config', { classifier: { provider: 'nope', model: 'nope' } }))
assert.equal(badProvider.status, 400)
assert.match(badProvider.json.error, /not available/)

const selfRef = await call('/api/dsh-qols/auto/config', '', postReq('/api/dsh-qols/auto/config', { classifier: { provider: 'qols-auto', model: 'auto' } }))
assert.equal(selfRef.status, 400)
assert.match(selfRef.json.error, /cannot judge itself/)

const unknownModel = await call('/api/dsh-qols/auto/config', '', postReq('/api/dsh-qols/auto/config', { classifier: { provider: 'deepseek-account', model: 'gpt-nope' } }))
assert.equal(unknownModel.status, 400)

const switched = await call('/api/dsh-qols/auto/config', '', postReq('/api/dsh-qols/auto/config', { classifier: { provider: 'deepseek-account', model: 'deepseek-v4-pro' } }))
assert.equal(switched.status, 200)
assert.equal(switched.json.classifier.model, 'deepseek-v4-pro')
assert.equal(switched.json.classifier.source, 'settings')
assert.equal(switched.json.classifier.effort, 'off')

const settingsFile = join(home, 'storages', 'qols', 'auto', 'settings.json')
assert.ok(existsSync(settingsFile), 'settings must be persisted')
const stored = JSON.parse(readFileSync(settingsFile, 'utf8'))
assert.equal(stored.version, 1)
assert.equal(stored.classifier.provider, 'deepseek-account')
assert.equal(stored.classifier.model, 'deepseek-v4-pro')

// the judge call itself now goes to the chosen model
const grayText = 'Please adjust the settings page: the toggle row shows the label before the switch and I would like it the other way round, with a little more spacing between the two parts and a subtle divider under the section header so it reads better on a wide monitor. Nothing else in that screen should move, and the labels can stay exactly as they are today. When you are done, just tell me what changed and I will check it in the app myself, no tests needed.'
const grayChunks = []
for await (const chunk of adapter.stream({
  provider: 'qols-auto',
  model: 'auto',
  reasoningEffort: 'auto',
  sessionId: 'sess-2',
  messages: [{ role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: grayText }] }],
})) grayChunks.push(chunk)

const judgeCalls = upstreamCalls.filter((options) => options.maxTokens === 8)
assert.equal(judgeCalls.length, 1, 'a gray-zone task must consult the judge once')
assert.equal(judgeCalls[0].provider, 'deepseek-account')
assert.equal(judgeCalls[0].model, 'deepseek-v4-pro')
assert.equal(judgeCalls[0].reasoningEffort, 'off')
assert.equal(judgeCalls[0].temperature, 0)

// a model without `off` gets the cheapest level it actually advertises
const relaxed = await call('/api/dsh-qols/auto/config', '', postReq('/api/dsh-qols/auto/config', { classifier: { provider: 'deepseek-official', model: 'deepseek-flash' } }))
assert.equal(relaxed.status, 200)
assert.equal(relaxed.json.classifier.effort, 'low')

// ---- teardown -----------------------------------------------------------
for (const effect of effects) effect.dispose?.()
console.log('HOST SMOKE TESTS PASSED')
