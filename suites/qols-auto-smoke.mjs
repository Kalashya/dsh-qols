import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { evaluate } from '../features/auto/heuristic.js'
import { createRouter, isTaskStart } from '../features/auto/router.js'
import { createAutoAdapter } from '../features/auto/adapters.js'
import { AutoJournal } from '../features/auto/journal.js'
import { config } from '../features/auto/config.js'

const user = (text) => ({ role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text }] })
const tool = () => ({ role: 'tool', source: { kind: 'tool', callId: 'c1' }, content: [{ type: 'text', text: 'ok' }] })

// ---- heuristic ----------------------------------------------------------
const eco = evaluate({ messages: [user('привет, как дела')] })
assert.equal(eco.tier, 'eco', `trivial should be eco, got ${eco.tier} (${eco.score})`)

const deep = evaluate({
  messages: [user('Отрефактори архитектуру роутера и докажи, что миграция безопасна. Оптимизируй производительность.')],
})
assert.equal(deep.tier, 'deep', `complex should be deep, got ${deep.tier} (${deep.score})`)

const gray = evaluate({
  messages: [user('Сделай кнопку красной, поменяй подпись на «Отправить», выровняй отступы в карточке, добавь разделитель между заголовком и текстом, поменяй порядок полей в форме, перенеси иконку вправо и уменьши шрифт подписи на один пункт, чтобы всё влезло в одну строку.')],
})
assert.equal(gray.tier, null, `neutral should be gray, got ${gray.tier} (${gray.score})`)

const shortNeutral = evaluate({ messages: [user('сделай кнопку красной и поменяй подпись на «Отправить»')] })
assert.equal(shortNeutral.tier, 'eco', `a short neutral ask should skip the classifier, got ${shortNeutral.tier} (${shortNeutral.score})`)

// ---- task boundary ------------------------------------------------------
assert.equal(isTaskStart([user('a')]), true)
assert.equal(isTaskStart([user('a'), tool()]), false)
// A harness notice sits after the prompt it belongs to, so it is still a task start.
assert.equal(isTaskStart([user('a'), { role: 'user', source: { kind: 'model-selection' }, content: [] }]), true)

// ---- router -------------------------------------------------------------
const calls = []
const llm = {
  last: undefined,
  async resolveCallConfig({ provider, model, reasoningEffort }) {
    calls.push({ provider, model, reasoningEffort })
    return { provider, model, reasoningEffort }
  },
  async *stream(options) {
    llm.last = options
    yield { type: 'text-delta', index: 0, text: 'ok' }
    yield { type: 'finish', reason: { kind: 'stop' } }
  },
}

const journal = { entries: [], record(entry) { this.entries.push(entry); return entry } }
let classified = 0
const router = createRouter({
  llm,
  config,
  journal,
  log: (message) => console.log('  log:', message),
  classify: async () => { classified += 1; return { tier: 'standard', ms: 7 } },
})

const NEUTRAL = 'Сделай кнопку красной, поменяй подпись на «Отправить», выровняй отступы в карточке, добавь разделитель между заголовком и текстом, поменяй порядок полей в форме, перенеси иконку вправо и уменьши шрифт подписи на один пункт, чтобы всё влезло в одну строку.'
const first = await router.decide({ provider: 'qols-auto', model: 'auto', reasoningEffort: 'auto', sessionId: 's1', messages: [user(NEUTRAL)] })
assert.equal(first.tier, 'standard')
assert.equal(first.source, 'classifier')
assert.equal(classified, 1)
assert.equal(first.route.provider, 'deepseek-account')
assert.equal(first.route.model, 'deepseek-flash')
assert.equal(first.route.effort, 'high')

// Later steps of the same task reuse the decision and never re-classify.
const second = await router.decide({ provider: 'qols-auto', model: 'auto', reasoningEffort: 'auto', sessionId: 's1', messages: [user('сделай кнопку красной'), tool()] })
assert.equal(second.reused, true)
assert.equal(classified, 1)
assert.equal(second.tier, 'standard')

// A new user turn on the same session decides again.
const third = await router.decide({ provider: 'qols-auto', model: 'auto', reasoningEffort: 'auto', sessionId: 's1', messages: [user('привет')] })
assert.equal(third.tier, 'eco')
assert.equal(third.source, 'heuristic')

// Explicit tier wins and sticks for the turn.
const explicit = await router.decide({ provider: 'qols-auto', model: 'auto', reasoningEffort: 'deep', sessionId: 's2', messages: [user('привет')] })
assert.equal(explicit.tier, 'deep')
assert.equal(explicit.source, 'selected')
assert.equal(explicit.route.model, 'deepseek-v4-pro')
assert.equal(explicit.route.effort, 'max')

// Compaction / title calls take the fixed cheap route.
const purpose = await router.decide({ provider: 'qols-auto', model: 'auto', reasoningEffort: 'auto', sessionId: 's3', purpose: 'compaction', messages: [user('x')] })
assert.equal(purpose.tier, 'fixed')
assert.equal(purpose.route.provider, 'deepseek-account')
assert.equal(purpose.route.model, 'deepseek-flash')

// ---- adapter ------------------------------------------------------------
const adapter = createAutoAdapter({ llm, router, config, log: (message) => console.log('  log:', message) })
const chunks = []
for await (const chunk of adapter.stream({
  provider: 'qols-auto',
  model: 'auto',
  reasoningEffort: 'auto',
  sessionId: 's4',
  messages: [
    user('привет'),
    { role: 'assistant', source: { kind: 'model', provider: 'qols-auto' }, content: [{ type: 'text', text: 'hi' }] },
  ],
})) chunks.push(chunk)

assert.equal(chunks.at(-1).type, 'finish')
assert.equal(llm.last.provider, 'deepseek-account')
assert.equal(llm.last.model, 'deepseek-flash')
assert.equal(llm.last.reasoningEffort, 'off')
assert.equal('via' in llm.last, false, 'the wrapper must not leak a via marker upstream')
assert.equal(llm.last.messages[1].source.provider, 'deepseek-account', 'assistant turns must be relabelled to the upstream provider')

// resolveModel rejects unknown model ids
await assert.rejects(() => adapter.resolveModel('qols-auto', 'other'), /unknown model/)

// ---- journal ------------------------------------------------------------
const dir = mkdtempSync(join(tmpdir(), 'qols-auto-journal-'))
const realJournal = new AutoJournal({ persist: true, memory: 10, fileLines: 20, dir })
realJournal.record({ sessionId: 's9', taskId: 's9#1', tier: 'deep', provider: 'deepseek-account', model: 'deepseek-v4-pro', effort: 'max', source: 'heuristic', score: 0.9, signals: ['complex-keyword'], taskText: 'секретная задача про архитектуру' })
const file = join(dir, 'log.jsonl')
assert.ok(existsSync(file), 'journal file must exist')
const raw = readFileSync(file, 'utf8')
assert.equal(raw.includes('секретная'), false, 'journal must not store task text')
assert.ok(raw.includes('complex-keyword'))
const last = realJournal.last('s9')
assert.equal(last.tier, 'deep')
assert.equal(last.taskHash.length, 12)
assert.equal(realJournal.list({ limit: 5 }).length, 1)

rmSync(dir, { recursive: true, force: true })
console.log('ALL SMOKE TESTS PASSED')
