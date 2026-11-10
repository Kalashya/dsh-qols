// Usage: prices, peak schedule, ledger, config validation, meter and routes.
import { appendFileSync, mkdtempSync } from 'node:fs'
import { Readable } from 'node:stream'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { DEFAULT_CONFIG, applyConfig, normalizeConfig } = await import('../features/usage/config.js')
const { priceEntry, usageCost } = await import('../features/usage/prices.js')
const { peakPhase, daySchedule } = await import('../features/usage/peak.js')
const { UsageLedger, dayKey } = await import('../features/usage/ledger.js')
const { UsageMeter } = await import('../features/usage/meter.js')
const { BalanceCache } = await import('../features/usage/balance.js')
const { registerRoutes } = await import('../features/usage/routes.js')

// --- prices -----------------------------------------------------------------
const prices = DEFAULT_CONFIG.prices

const pro = priceEntry(prices, 'deepseek-v4-pro')
if (pro.exact !== true || pro.entry.output !== 1.98) throw new Error('v4-pro price is not exact')
const flash = priceEntry(prices, 'deepseek-flash')
if (flash.entry.cacheMiss !== 0.15 || flash.entry.output !== 0.6) throw new Error('default price is wrong')
const dated = priceEntry(prices, 'deepseek-v4-pro-2026-10')
if (dated.exact !== true || dated.entry.cacheMiss !== 0.66) throw new Error('longest key must win')
const unknown = priceEntry(prices, 'some-other-model')
if (unknown.exact !== false || unknown.entry.cacheMiss !== 0.15) throw new Error('unknown model must fall back to default')

const oneMillion = { input: 1_000_000, output: 0, cacheRead: 0, cacheWrite: 0 }
if (Math.abs(usageCost(flash.entry, oneMillion, 1) - 0.15) > 1e-9) throw new Error('cache-miss pricing is wrong')
if (Math.abs(usageCost(flash.entry, oneMillion, 2) - 0.3) > 1e-9) throw new Error('peak multiplier is ignored')
const cached = { input: 0, output: 0, cacheRead: 1_000_000, cacheWrite: 1_000_000 }
if (Math.abs(usageCost(flash.entry, cached, 1) - 0.006) > 1e-9) throw new Error('cache pricing is wrong')

// --- peak schedule ----------------------------------------------------------
const peakAt = Date.parse('2026-10-29T02:00:00Z') // Thursday, inside 01:00–04:00 UTC
const phasePeak = peakPhase(peakAt, DEFAULT_CONFIG.peak)
if (phasePeak.peak !== true || phasePeak.multiplier !== 2) throw new Error('02:00 UTC must be peak')
if (phasePeak.untilMs !== Date.parse('2026-10-29T04:00:00Z')) throw new Error('peak end is wrong')
if (Math.abs(phasePeak.percent - 1 / 3) > 1e-9) throw new Error('peak progress is wrong, got ' + phasePeak.percent)

const offAt = Date.parse('2026-10-29T05:00:00Z') // Thursday, between windows
const phaseOff = peakPhase(offAt, DEFAULT_CONFIG.peak)
if (phaseOff.peak !== false || phaseOff.multiplier !== 1) throw new Error('05:00 UTC must be off-peak')
if (phaseOff.untilMs !== Date.parse('2026-10-29T06:00:00Z')) throw new Error('off-peak end is wrong')
if (phaseOff.startMs !== Date.parse('2026-10-29T04:00:00Z')) throw new Error('off-peak start is wrong, got ' + new Date(phaseOff.startMs).toISOString())
if (Math.abs(phaseOff.percent - 0.5) > 1e-9) throw new Error('off-peak progress is wrong, got ' + phaseOff.percent)

const lateOffAt = Date.parse('2026-10-29T05:54:00Z') // six minutes before the next peak
const phaseLateOff = peakPhase(lateOffAt, DEFAULT_CONFIG.peak)
if (Math.abs(phaseLateOff.percent - 0.95) > 1e-9) throw new Error('late off-peak progress must approach 1, got ' + phaseLateOff.percent)

const weekendAt = Date.parse('2026-10-31T02:00:00Z') // Saturday in Beijing
const phaseWeekend = peakPhase(weekendAt, DEFAULT_CONFIG.peak)
if (phaseWeekend.peak !== false || phaseWeekend.weekend !== true) throw new Error('weekend must be off-peak')
if (phaseWeekend.multiplier !== 1) throw new Error('weekend must not have a multiplier')
if (phaseWeekend.untilMs !== Date.parse('2026-11-02T01:00:00Z')) {
  throw new Error('weekend must point at the next weekday peak, got ' + new Date(phaseWeekend.untilMs).toISOString())
}

const holidayAt = Date.parse('2026-10-01T02:00:00Z') // Thursday, National Day, inside 01:00–04:00 UTC
const phaseHoliday = peakPhase(holidayAt, DEFAULT_CONFIG.peak)
if (phaseHoliday.peak !== false || phaseHoliday.holiday !== true) throw new Error('a Chinese public holiday must be off-peak')
if (phaseHoliday.multiplier !== 1) throw new Error('a holiday must not have a multiplier')
if (phaseHoliday.untilMs !== Date.parse('2026-10-08T01:00:00Z')) {
  throw new Error('holiday must point past the golden week, got ' + new Date(phaseHoliday.untilMs).toISOString())
}

// --- full-day schedule ------------------------------------------------------
const localNoon = new Date(2026, 9, 29, 12, 0, 0) // Thursday, local time
const schedule = daySchedule(localNoon.getTime(), DEFAULT_CONFIG.peak)
if (schedule.startMs !== new Date(2026, 9, 29).getTime()) throw new Error('the day must start at local midnight')
if (schedule.endMs !== new Date(2026, 9, 30).getTime()) throw new Error('the day must end at the next local midnight')
if (schedule.segments.length < 2) throw new Error('a day with peak windows must have segments')
let cursor = schedule.startMs
let peakMs = 0
for (const segment of schedule.segments) {
  if (segment.startMs !== cursor || segment.endMs <= segment.startMs) throw new Error('day segments must be contiguous')
  cursor = segment.endMs
  if (segment.peak) peakMs += segment.endMs - segment.startMs
}
if (cursor !== schedule.endMs) throw new Error('day segments must cover the whole day')
if (peakMs <= 0 || peakMs >= schedule.endMs - schedule.startMs) throw new Error('day must mix peak and off-peak spans')

const saturday = daySchedule(new Date(2026, 9, 31, 12, 0, 0).getTime(), DEFAULT_CONFIG.peak)
if (saturday.segments.some((segment) => segment.peak)) throw new Error('a local Saturday must be off-peak for the whole day')

const noWindows = daySchedule(new Date(2026, 9, 29, 12, 0, 0).getTime(), { windows: [], weekendsOffPeak: true, holidays: [] })
if (noWindows.segments.length !== 1 || noWindows.segments[0].peak) throw new Error('no windows means one off-peak span')

// --- config -----------------------------------------------------------------
const normalized = normalizeConfig({ peak: { windows: [{ start: 5, end: 5 }] }, prices: 'nope' })
if (normalized.peak.windows.length !== 2) throw new Error('invalid windows must fall back')
if (normalized.prices.default.cacheMiss !== 0.15) throw new Error('invalid prices must fall back')

const config = normalizeConfig(undefined)
const rejected = applyConfig(config, { balanceWarnBelow: -5, showTokens: false, peak: { multiplier: 99 } })
if (!rejected.includes('balanceWarnBelow') || !rejected.includes('peak.multiplier')) throw new Error('invalid settings must be rejected')
if (config.showTokens !== false) throw new Error('valid settings must apply')
if (config.showAmounts !== true) throw new Error('the amounts must be visible by default')
if (normalizeConfig({ showAmounts: false }).showAmounts !== false) throw new Error('a stored amounts preference must survive normalization')
if (normalizeConfig({ showBalance: false }).showAmounts !== false) throw new Error('the legacy showBalance preference must migrate')
const amountsHidden = applyConfig(config, { showAmounts: false })
if (amountsHidden.length !== 0 || config.showAmounts !== false) throw new Error('the amounts must be hideable')
applyConfig(config, { showAmounts: true })
const holidayRejected = applyConfig(config, { peak: { holidays: '2026-10-01' } })
if (!holidayRejected.includes('peak.holidays')) throw new Error('holidays must be an array')
applyConfig(config, { peak: { holidays: ['2026-10-01', 'bad', '2026-10-01'] } })
if (config.peak.holidays.length !== 1 || config.peak.holidays[0] !== '2026-10-01') throw new Error('holiday dates must be validated and deduped')

// --- ledger -----------------------------------------------------------------
const dir = mkdtempSync(join(tmpdir(), 'qols-usage-'))
const ledger = new UsageLedger({ dir, limit: 100 })
const dayOne = '2026-10-29'
const dayTwo = '2026-10-30'
ledger.append({ at: Date.parse('2026-10-29T02:00:00Z'), day: dayOne, session: 's1', turn: 1, model: 'deepseek-flash', input: 1000, output: 100, cost: 0.0012 })
ledger.append({ at: Date.parse('2026-10-29T03:00:00Z'), day: dayOne, session: 's1', turn: 1, model: 'deepseek-v4-pro', input: 500, output: 50, cacheRead: 200, cost: 0.01 })
ledger.append({ at: Date.parse('2026-10-30T02:00:00Z'), day: dayTwo, session: 's2', turn: 1, model: 'deepseek-flash', input: 10, output: 1, cost: 0.0001 })

const today = ledger.aggregate(dayOne)
if (today.calls !== 2) throw new Error('ledger must count two calls')
if (today.models[0].model !== 'deepseek-v4-pro') throw new Error('models must be sorted by cost')
if (today.tokens.input !== 1500 || today.tokens.cacheRead !== 200) throw new Error('token buckets are wrong')
if (today.tokens.total !== 1850) throw new Error('token total is wrong, got ' + today.tokens.total)
if (ledger.daily(7).length !== 2) throw new Error('daily must group by day')
if (dayKey(Date.parse('2026-10-29T02:00:00Z')) !== dayOne) throw new Error('dayKey is wrong')

// A record written before the USD switch has no currency (it was priced in CNY).
// It must stay out of dollar totals instead of inflating Today.
appendFileSync(join(dir, 'ledger.jsonl'), `${JSON.stringify({ at: Date.parse('2026-10-29T04:00:00Z'), day: dayOne, session: 'legacy', turn: 1, model: 'deepseek-flash', input: 10, output: 1, cost: 7 })}`.concat('\n'), 'utf8')
const reloaded = new UsageLedger({ dir, limit: 100 })
if (reloaded.aggregate(dayOne).calls !== 2) throw new Error('yuan-era records must not count as USD calls')
if (reloaded.aggregate(dayOne).cost !== today.cost) throw new Error('yuan-era records must not add to Today cost')

// --- balance retry ----------------------------------------------------------
// At startup the account service can be missing for a few seconds; a failed
// snapshot must retry quickly instead of staying hidden for the whole TTL.
let balanceClock = 0
let balanceCalls = 0
const retryCache = new BalanceCache({
  getAccount: () => ({ getBalance: async () => { balanceCalls += 1; throw new Error('account not ready') } }),
  retryMs: 1000,
  now: () => balanceClock,
})
await retryCache.refresh()
if (retryCache.snapshot().state !== 'failed') throw new Error('a failed balance must be reported as failed')
if (balanceCalls !== 1) throw new Error('refresh must call the account once')
balanceClock = 300
retryCache.snapshot()
await new Promise((resolve) => setTimeout(resolve, 20))
if (balanceCalls !== 1) throw new Error('a fresh failure must not retry before retryMs')
balanceClock = 2000
retryCache.snapshot()
await new Promise((resolve) => setTimeout(resolve, 20))
if (balanceCalls !== 2) throw new Error('a failed balance must retry once retryMs passed')

// Startup: the host mounts the account service after this plugin. `settled`
// must wait for it (bounded) so the first status payload already carries the
// wallet — otherwise Balance pops in five seconds after Today.
let mounted = false
const lateCache = new BalanceCache({
  getAccount: () => (mounted ? { getBalance: async () => ({ status: 'ready', value: [{ currency: 'USD', balance: 3.5 }] }) } : undefined),
  retryMs: 1000,
})
const startedAt = Date.now()
setTimeout(() => { mounted = true }, 60)
const late = await lateCache.settled(1500)
if (late.state !== 'ready') throw new Error('settled must wait for a late account service, got ' + late.state)
if (late.wallets.length !== 1 || late.wallets[0].amount !== 3.5) throw new Error('settled must return the wallet it waited for')
const waited = Date.now() - startedAt
if (waited < 40 || waited > 1400) throw new Error('settled waited ' + waited + 'ms for the first account answer')
if (lateCache.snapshot().state !== 'ready') throw new Error('the waited-for wallet must stay cached')

// No account service at all: bounded, reported as unknown, never throws.
const absentCache = new BalanceCache({ getAccount: () => undefined })
const absent = await absentCache.settled(120)
if (absent.state !== 'unknown') throw new Error('a missing account service must stay unknown, got ' + absent.state)

// --- meter ------------------------------------------------------------------
let clock = Date.parse('2026-10-29T02:00:00Z')
const meter = new UsageMeter({ config, ledger, now: () => clock })
const options = { sessionId: 's1', model: 'deepseek-flash', provider: 'deepseek-account', messages: [{ role: 'user', content: 'hello there' }] }
const usage = { inputTokens: 1000, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 5 }

const first = meter.record(options, usage)
if (first === null || first.cost <= 0) throw new Error('first call must be priced')
if (first.turn !== 1) throw new Error('first call must open turn 1')
if (meter.record(options, usage) !== null) throw new Error('a repeated fingerprint must be deduplicated')

clock += 4000
const nextTurn = meter.record({ ...options, messages: [{ role: 'user', content: 'second question' }] }, { ...usage, inputTokens: 2000 })
if (nextTurn === null || nextTurn.turn !== 2) throw new Error('a new user message must open turn 2')

clock += 4000
const toolStep = meter.record({ ...options, messages: [{ role: 'user', content: 'second question' }] }, { ...usage, inputTokens: 3000 })
if (toolStep === null || toolStep.turn !== 2) throw new Error('a follow-up step must stay in turn 2')

const snapshot = meter.snapshot('s1')
if (snapshot === null || snapshot.totals.calls !== 2) throw new Error('snapshot must total the current turn')
if (snapshot.calls.length !== 2) throw new Error('snapshot must list the current turn calls')
if (meter.snapshot('missing') !== null) throw new Error('unknown session must not invent a turn')

// --- real turn attribution ---------------------------------------------------
// Without session events the meter guesses; those rows must never be used for a
// per-message line, because a guessed number cannot be joined to a chat message.
if (first.turnSource !== 'heuristic') throw new Error('a guessed turn must be marked heuristic')
if (ledger.turnTotals('s1', 1).calls !== 0) throw new Error('heuristic rows must not feed per-turn totals')

meter.observe({ id: 's1' }, { type: 'turn/start', data: { turn: 7 } })
const realTurn = meter.record({ ...options, messages: [{ role: 'user', content: 'real turn seven' }] }, { ...usage, inputTokens: 5000, outputTokens: 500 })
if (realTurn === null || realTurn.turn !== 7 || realTurn.turnSource !== 'session') throw new Error('a session turn must tag the call with the real number')
const liveSnapshot = meter.snapshot('s1')
if (liveSnapshot.open !== true || liveSnapshot.sessionTurn !== 7) throw new Error('an open session turn must be reported as open')

clock += 4000
const sameTurn = meter.record({ ...options, messages: [{ role: 'user', content: 'same turn, second call' }] }, { ...usage, inputTokens: 6000 })
if (sameTurn === null || sameTurn.turn !== 7) throw new Error('calls of the open turn must keep its number')

meter.observe({ id: 's1' }, { type: 'turn/end', data: { turn: 7 } })
if (meter.snapshot('s1').open !== false) throw new Error('turn/end must close the live turn')

const turnSeven = ledger.turnTotals('s1', 7)
if (turnSeven.calls !== 2) throw new Error('per-turn totals must count only the real turn, got ' + turnSeven.calls)
if (turnSeven.tokens.input !== 11_000) throw new Error('per-turn tokens are wrong, got ' + turnSeven.tokens.input)
if (turnSeven.recent.length !== 2) throw new Error('per-turn totals must list the calls')
if (ledger.turnTotals('s1', 1).calls !== 0) throw new Error('a heuristic turn number must not match a real one')
if (ledger.turnTotals('s2', 7).calls !== 0) throw new Error('per-turn totals must not cross sessions')

// --- routes -----------------------------------------------------------------
const routes = new Map()
const ctx = {
  effect(factory) { factory(); return () => {} },
  webServer: { register(route) { routes.set(route.path, route); return () => {} } },
}
const fakeBalance = {
  snapshot() {
    return { state: 'ready', wallets: [{ kind: 'grant', currency: 'CNY', amount: 12.5 }, { kind: 'topup', currency: 'USD', amount: 2.58 }] }
  },
  async settled() {
    return this.snapshot()
  },
}
registerRoutes(ctx, {
  config,
  ledger,
  meter,
  balance: fakeBalance,
  persist: () => {},
  log: () => {},
  now: () => clock,
})

async function call(path, method = 'GET') {
  const route = routes.get(path.split('?')[0])
  if (route === undefined) throw new Error('route was not registered: ' + path)
  if (route.kind !== 'exact') throw new Error('route must be exact: ' + path)
  const state = { status: 0, headers: null, body: null }
  const res = {
    writeHead(status, headers) { state.status = status; state.headers = headers },
    end(body) { state.body = body ?? null },
  }
  const req = new Readable({ read() {} })
  req.method = method
  req.url = path
  req.headers = {}
  if (method === 'POST') req.push(JSON.stringify({ showTokens: true }))
  req.push(null)
  await route.handler(req, res)
  return state
}

const status = await call('/api/dsh-qols/usage/status?sessionId=s1')
if (status.status !== 200) throw new Error('status code ' + status.status)
const payload = JSON.parse(status.body)
if (payload.ok !== true || payload.today.calls !== 7) throw new Error('status must include today totals, got ' + payload.today.calls)
if (payload.peak.phase !== 'peak' || payload.peak.multiplier !== 2) throw new Error('status peak is wrong')
if (payload.peak.hasWindows !== true) throw new Error('status must report whether peak windows exist')
if (payload.balance.wallets.length !== 2) throw new Error('status must include wallets')
if (payload.turn === null || payload.turn.sessionTurn !== 7 || payload.turn.open !== false) throw new Error('status must report the real turn and that it closed')
if (payload.pricesCurrency !== 'USD') throw new Error('prices currency must be USD')
if (payload.settings.showAmounts !== true) throw new Error('status must expose the amounts preference')
const day = payload.peak.day
if (day === null || !Array.isArray(day.segments) || day.segments.length === 0) throw new Error('status must include the local day spans')
const daySpanMs = Date.parse(day.endAt) - Date.parse(day.startAt)
if (daySpanMs < 23 * 3600_000 || daySpanMs > 25 * 3600_000) throw new Error('status day must be one calendar day')
if (!(day.percent >= 0 && day.percent <= 1)) throw new Error('status day percent is out of range')
if (day.segments[0].startAt !== day.startAt || day.segments.at(-1).endAt !== day.endAt) throw new Error('status day spans must cover the day')
if (!day.segments.some((segment) => segment.peak)) throw new Error('status day must mark peak spans')

const saved = await call('/api/dsh-qols/usage/config', 'POST')
if (saved.status !== 200) throw new Error('config POST code ' + saved.status)
const savedPayload = JSON.parse(saved.body)
if (savedPayload.config.showTokens !== true) throw new Error('config POST must apply settings')
if (savedPayload.config.showAmounts !== true) throw new Error('config POST must expose the amounts preference')

const log = await call('/api/dsh-qols/usage/log?days=7')
const logPayload = JSON.parse(log.body)
if (logPayload.days.length !== 2) throw new Error('log route must list two days')

const turnRoute = await call('/api/dsh-qols/usage/turn?sessionId=s1&turn=7')
if (turnRoute.status !== 200) throw new Error('turn route code ' + turnRoute.status)
const turnPayload = JSON.parse(turnRoute.body)
if (turnPayload.ok !== true || turnPayload.calls !== 2 || turnPayload.cost <= 0) throw new Error('turn route must return that turn totals')
if (turnPayload.turn !== 7 || turnPayload.open !== false) throw new Error('turn route must echo the number and the open flag')
if (!Array.isArray(turnPayload.recent) || turnPayload.recent.length !== 2) throw new Error('turn route must list the calls')

const noSession = await call('/api/dsh-qols/usage/turn?turn=7')
if (noSession.status !== 400) throw new Error('turn route must require a session')
const noTurn = await call('/api/dsh-qols/usage/turn?sessionId=s1')
if (noTurn.status !== 400) throw new Error('turn route must require a number')
const zeroTurn = await call('/api/dsh-qols/usage/turn?sessionId=s1&turn=0')
if (zeroTurn.status !== 400) throw new Error('turn route must reject a non-positive number')

const turnMethod = await call('/api/dsh-qols/usage/turn?sessionId=s1&turn=7', 'POST')
if (turnMethod.status !== 405 || turnMethod.headers.allow !== 'GET') throw new Error('turn route must be GET only')

const nope = await call('/api/dsh-qols/usage/status', 'PUT')
if (nope.status !== 405 || nope.headers.allow !== 'GET') throw new Error('PUT must be 405 with allow: GET')

console.log('QOLS USAGE TESTS PASSED')
console.log('- prices pick the longest model key and bill cache misses, cache hits and output')
console.log('- peak windows follow the UTC schedule, weekends and holidays are off-peak')
console.log('- the day schedule covers local midnight to midnight with merged peak spans')
console.log('- invalid settings are rejected, valid ones apply in place')
console.log('- the ledger aggregates days, models and token buckets')
console.log('- the meter deduplicates repeat usage and attributes turns')
console.log('- session turns come from the log, heuristic turns never feed per-turn totals')
console.log('- the exact routes answer status, turn, config, log and reject other methods')
