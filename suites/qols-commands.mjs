// Studio commands: validation, registry file, live registration into ctx.commands.
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const home = mkdtempSync(join(tmpdir(), 'qols-commands-home-'))
process.env.DSH_HOME = home

const { CommandStore, normalizeCommand, COMMANDS_VERSION } = await import('../features/studio/commands.js')
const { createCommandRuntime } = await import('../features/studio/command-runtime.js')
const { feature } = await import('../features/studio/index.js')

const dir = join(home, 'storages', 'qols', 'studio')
const store = new CommandStore({ dir })

function rejects(run, code, label) {
  try {
    run()
  } catch (error) {
    if (error.code !== code) throw new Error(`${label}: expected ${code}, got ${error.code}: ${error.message}`)
    return
  }
  throw new Error(`${label}: expected ${code}, nothing was thrown`)
}

// --- validation -------------------------------------------------------------
rejects(() => normalizeCommand(null), 'INVALID', 'missing body')
rejects(() => normalizeCommand({ name: 'BadName', description: 'x', action: { type: 'say', text: 'x' } }), 'INVALID', 'bad name')
rejects(() => normalizeCommand({ name: 'ok', description: '', action: { type: 'say', text: 'x' } }), 'INVALID', 'no description')
rejects(() => normalizeCommand({ name: 'ok', description: 'x', action: { type: 'exec', text: 'x' } }), 'INVALID', 'unknown action')
rejects(() => normalizeCommand({ name: 'ok', description: 'x', action: { type: 'prompt', text: '  ' } }), 'INVALID', 'empty prompt')
rejects(() => normalizeCommand({ name: 'ok', description: 'x', action: { type: 'tier', tier: 'turbo' } }), 'INVALID', 'bad tier')

const normalized = normalizeCommand({
  name: 'deep-dive',
  description: '  Explain deeply  ',
  action: { type: 'prompt', text: ' Explain {input} ' },
})
if (normalized.description !== 'Explain deeply') throw new Error('description was not trimmed')
if (normalized.action.text !== 'Explain {input}') throw new Error('prompt text was not trimmed')

// --- registry file ----------------------------------------------------------
store.save({ name: 'b-command', description: 'B', action: { type: 'say', text: 'b' } })
store.save({ name: 'a-command', description: 'A', action: { type: 'tier', tier: 'deep' } })
store.save({ name: 'a-command', description: 'A2', action: { type: 'tier', tier: 'eco' } })
const stored = JSON.parse(readFileSync(join(dir, 'commands.json'), 'utf8'))
if (stored.version !== COMMANDS_VERSION) throw new Error('registry version is wrong')
if (stored.commands.length !== 2) throw new Error('upsert did not replace by name')
if (stored.commands[0].name !== 'a-command' || stored.commands[1].name !== 'b-command') throw new Error('commands are not sorted')
if (stored.commands[0].description !== 'A2') throw new Error('update did not win')

// A broken file reads as empty instead of throwing.
writeFileSync(join(dir, 'commands.json'), '{not json', 'utf8')
if (store.read().length !== 0) throw new Error('broken registry must read as empty')
writeFileSync(join(dir, 'commands.json'), JSON.stringify(stored), 'utf8')

rejects(() => store.delete('ghost'), 'NOT_FOUND', 'delete missing')

// --- runtime + route --------------------------------------------------------
const registrations = new Map()
let disposed = 0
const service = {
  register(definition) {
    if (definition.name === 'boom') throw new Error('command "boom" is already registered')
    registrations.set(definition.name, definition)
    return () => { disposed += 1; registrations.delete(definition.name) }
  },
}
const tiers = []
const log = []
const runtime = createCommandRuntime({ store, log: (line) => log.push(line), setTier: (tier) => tiers.push(tier) })
runtime.attach({
  inject(deps, callback) {
    if (!deps.includes('commands')) throw new Error('unexpected dependency')
    callback({ commands: service, effect() { return () => {} } })
  },
})

if (registrations.size !== 2) throw new Error('runtime did not register the stored commands')
const promptDefinition = registrations.get('b-command')
if (promptDefinition.description !== 'B') throw new Error('definition description is missing')

// A say command returns its text.
const said = await promptDefinition.handler({ rawInput: '' })
if (said.kind !== 'success' || said.text !== 'b') throw new Error('say command returned the wrong result')

// A tier command flips the tier and reports it.
const tierDefinition = registrations.get('a-command')
const tierResult = await tierDefinition.handler({ rawInput: '' })
if (tiers.length !== 1 || tiers[0] !== 'eco') throw new Error('tier command did not call setTier')
if (tierResult.kind !== 'success' || !tierResult.text.includes('eco')) throw new Error('tier result is wrong')

// A prompt command hands the text to the agent and substitutes {input}.
const sent = []
store.save({ name: 'explain', description: 'Explain', action: { type: 'prompt', text: 'Explain {input} briefly.' } })
runtime.sync()
if (!registrations.has('explain')) throw new Error('sync did not register the new command')
const explain = registrations.get('explain')
const reply = await explain.handler({
  rawInput: 'peak pricing',
  agent: { followup(message) { sent.push(message) } },
})
if (sent.length !== 1) throw new Error('followup was not called')
if (sent[0].content[0].text !== 'Explain peak pricing briefly.') throw new Error('{input} was not substituted')
if (sent[0].source.kind !== 'user') throw new Error('message source must be user')
if (reply.kind !== 'success') throw new Error('prompt command must succeed')

// Without an agent the command fails instead of throwing.
const noAgent = await explain.handler({ rawInput: 'x' })
if (noAgent.kind !== 'error') throw new Error('prompt command without an agent must error')

// Arguments: {args[0]}, {args[1]} and {input} substitute independently.
store.save({ name: 'fix', description: 'Fix', action: { type: 'prompt', text: 'Fix {args[0]} in {args[1]} ({input})' } })
runtime.sync()
const fix = registrations.get('fix')
const beforeArgs = sent.length
await fix.handler({ rawInput: 'bug.ts src', agent: { followup(message) { sent.push(message) } } })
if (sent.length !== beforeArgs + 1) throw new Error('argument prompt did not reach the agent')
if (sent[beforeArgs].content[0].text !== 'Fix bug.ts in src (bug.ts src)') {
  throw new Error('argument placeholders were not substituted: ' + sent[beforeArgs].content[0].text)
}

// A say command substitutes arguments too.
store.save({ name: 'greet', description: 'Greet', action: { type: 'say', text: 'Hello {args[0]}' } })
runtime.sync()
const greet = registrations.get('greet')
const greeting = await greet.handler({ rawInput: 'Bob' })
if (greeting.kind !== 'success' || greeting.text !== 'Hello Bob') throw new Error('say did not substitute arguments: ' + greeting.text)

// A registration failure is reported per command, not fatal.
store.save({ name: 'boom', description: 'Boom', action: { type: 'say', text: 'x' } })
const state = runtime.sync()
const boom = state.find((command) => command.name === 'boom')
if (boom === undefined || boom.registered !== false || !boom.error.includes('already registered')) {
  throw new Error('a failed registration must be reported with its error')
}

// --- built-in /rule ---------------------------------------------------------
const ruleRegistrations = new Map()
const ruleService = {
  register(definition) {
    ruleRegistrations.set(definition.name, definition)
    return () => { ruleRegistrations.delete(definition.name) }
  },
}
const ruleRuntime = createCommandRuntime({
  store,
  log: () => {},
  setTier: () => {},
  getRules: () => [
    { name: 'answer-short', description: 'Short', body: 'Keep it short.', valid: true, enabled: true },
    { name: 'disabled-rule', description: 'Off', body: 'Nope.', valid: true, enabled: false },
  ],
})
ruleRuntime.attach({
  inject(deps, callback) {
    callback({ commands: ruleService, effect(factory) { factory(); return () => {} } })
  },
})
const ruleDefinition = ruleRegistrations.get('rule')
if (ruleDefinition === undefined) throw new Error('/rule was not registered')
const catalog = await ruleDefinition.handler({ rawInput: '' })
if (catalog.kind !== 'success' || !catalog.text.includes('answer-short') || catalog.text.includes('disabled-rule')) {
  throw new Error('rule catalog is wrong: ' + catalog.text)
}
const ruleSent = []
const applied = await ruleDefinition.handler({
  rawInput: 'answer-short',
  agent: { followup(message) { ruleSent.push(message) } },
})
if (applied.kind !== 'success') throw new Error('/rule did not succeed')
if (ruleSent.length !== 1 || !ruleSent[0].content[0].text.startsWith('# Rule: answer-short')) {
  throw new Error('the rule body was not sent')
}
if (!ruleSent[0].content[0].text.includes('Keep it short.')) throw new Error('the rule body text is missing')
const unknownRule = await ruleDefinition.handler({ rawInput: 'ghost' })
if (unknownRule.kind !== 'error') throw new Error('an unknown rule must error')

// --- route ------------------------------------------------------------------
const routes = new Map()
feature.register({
  effect(factory) { factory(); return () => {} },
  webServer: { register(route) { routes.set(route.path, route); return () => {} } },
  inject(deps, callback) {
    callback({ commands: service, effect() { return () => {} } })
  },
})
const route = routes.get('/api/dsh-qols/studio/commands')
if (route === undefined) throw new Error('commands route was not registered')
if (route.kind !== 'exact') throw new Error('commands route must be exact')

async function call(method, { body, url } = {}) {
  const state = { status: 0, headers: null, body: null }
  const res = {
    writeHead(status, headers) { state.status = status; state.headers = headers },
    end(payload) { state.body = payload ?? null },
  }
  const handlers = new Map()
  const req = {
    method,
    url: url ?? '/api/dsh-qols/studio/commands',
    on(event, handler) {
      const list = handlers.get(event) ?? []
      list.push(handler)
      handlers.set(event, list)
      return req
    },
    destroy() {},
  }
  if (body !== undefined) {
    setImmediate(() => {
      for (const handler of handlers.get('data') ?? []) handler(Buffer.from(body))
      for (const handler of handlers.get('end') ?? []) handler()
    })
  }
  await route.handler(req, res)
  return state
}

async function json(method, options) {
  const result = await call(method, options)
  return { ...result, payload: result.body === null ? null : JSON.parse(result.body) }
}

const listed = await json('GET')
if (listed.status !== 200 || listed.payload.ok !== true) throw new Error('GET failed: ' + listed.body)
if (!Array.isArray(listed.payload.commands)) throw new Error('GET must list commands')
if (listed.payload.storage !== join(dir, 'commands.json')) throw new Error('storage path is wrong')

const created = await json('POST', {
  body: JSON.stringify({ name: 'review', description: 'Review the diff', action: { type: 'prompt', text: 'Review {input}' } }),
})
if (created.status !== 200 || created.payload.ok !== true) throw new Error('POST failed: ' + created.body)
if (!registrations.has('review')) throw new Error('POST did not register the command immediately')

const invalid = await json('POST', { body: JSON.stringify({ name: 'X', description: 'x', action: { type: 'say', text: 'x' } }) })
if (invalid.status !== 400 || invalid.payload.code !== 'INVALID') throw new Error('invalid POST must be 400 INVALID')

const removed = await json('DELETE', { url: '/api/dsh-qols/studio/commands?name=review' })
if (removed.status !== 200 || removed.payload.ok !== true) throw new Error('DELETE failed: ' + removed.body)
if (registrations.has('review')) throw new Error('DELETE did not unregister the command')
const removedAgain = await json('DELETE', { url: '/api/dsh-qols/studio/commands?name=review' })
if (removedAgain.status !== 404 || removedAgain.payload.code !== 'NOT_FOUND') throw new Error('second DELETE must be 404')

const rejected = await call('PUT')
if (rejected.status !== 405 || !String(rejected.headers.allow).includes('DELETE')) throw new Error('PUT must be 405 with allow')

if (!existsSync(join(dir, 'commands.json'))) throw new Error('registry file disappeared')

console.log('QOLS COMMANDS TESTS PASSED')
console.log('- validation rejects bad names, actions and tiers')
console.log('- the registry upserts by name, sorts and survives a broken file')
console.log('- registrations follow save/delete; prompt, tier and say handlers behave')
console.log('- {input}, {args} and {args[n]} substitute; /rule lists and injects a rule')
console.log('- GET/POST/DELETE route, 405 with allow, 404 on a missing delete')
