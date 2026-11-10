/**
 * Live usage meter.
 *
 * Wraps the `llm/stream` waterfall (a global listener), passes chunks through
 * untouched, and records the `usage` chunk that arrives before `finish`. That is
 * the same seam cost-meter uses, but this meter keeps a much smaller ledger and
 * prices calls with the built-in CNY table.
 *
 * Nested calls are billed once: a fingerprint of `(session, model, five token
 * buckets)` is admitted only once per ten seconds. Adapting routes such as
 * Auto or a vision wrapper can let the same call reach the waterfall twice.
 *
 * Turn attribution has two sources. The authoritative one is the session log:
 * `session/event` carries `turn/start` and `turn/end` with the real turn number,
 * so every call recorded while a turn is open is tagged with that number and
 * `turnSource: 'session'`, which makes the per-message cost line stable and
 * recoverable from the ledger after a reload.
 *
 * The fallback is a prompt heuristic: a call starts a new turn when the last
 * message in `options.messages` is a user message whose text differs from the
 * previous call, keeping a change within the three-second guard in the same turn
 * (the judge call Auto makes before the main call arrives that way). Those rows
 * are tagged `turnSource: 'heuristic'` and are never used for per-turn totals,
 * because their numbering is per-process and cannot be joined to a message.
 */

import { createHash } from 'node:crypto'

import { priceEntry, usageCost } from './prices.js'
import { peakPhase } from './peak.js'
import { dayKey } from './ledger.js'

const SEEN_TTL_MS = 10_000
const TURN_GUARD_MS = 3_000
const CALLS_PER_TURN = 50

function textOfMessage(message) {
  if (message === null || typeof message !== 'object') return ''
  const content = message.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part) => (part !== null && typeof part === 'object' && typeof part.text === 'string' ? part.text : ''))
      .join(' ')
  }
  return ''
}

function lastUserMessage(messages) {
  if (!Array.isArray(messages)) return null
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message !== null && typeof message === 'object' && message.role === 'user') {
      const text = textOfMessage(message)
      if (text !== '') return { text, index }
    }
  }
  return null
}

function signatureOf(options) {
  const user = lastUserMessage(options?.messages)
  if (user === null) return null
  const hash = createHash('sha256').update(user.text.slice(0, 160)).digest('hex').slice(0, 10)
  return `${Array.isArray(options.messages) ? options.messages.length : 0}:${hash}`
}

function bucket(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

/** The session id of a `session/event` argument, or null. */
function sessionIdOf(session) {
  if (typeof session === 'string' && session !== '') return session
  if (session === null || typeof session !== 'object') return null
  const id = session.id
  if (typeof id === 'string' && id !== '') return id
  return null
}

export class UsageMeter {
  /** @param {{ config: object, ledger: object, log?: (message: string) => void, now?: () => number }} deps */
  constructor({ config, ledger, log, now }) {
    this.config = config
    this.ledger = ledger
    this.log = typeof log === 'function' ? log : () => {}
    this.now = typeof now === 'function' ? now : () => Date.now()
    /** @type {Map<string, { turn: number, signature: string, startedAt: number, endedAt: number, totals: object, calls: object[] }>} */
    this.sessions = new Map()
    /** @type {Map<string, number>} */
    this.seen = new Map()
    /** @type {Map<string, { turn: number, open: boolean }>} Real session turns, newest last. */
    this.turns = new Map()
    this.lastSession = null
  }

  /** Subscribe to the waterfall and to the session log. Returns one disposer. */
  attach(ctx) {
    if (typeof ctx?.on !== 'function') return () => {}
    const disposers = []
    try {
      const dispose = ctx.on('llm/stream', (options, next) => this.wrap(options, next), { global: true })
      if (typeof dispose === 'function') disposers.push(dispose)
    } catch {
      // The waterfall is optional for tests that only exercise record().
    }
    try {
      const dispose = ctx.on('session/event', (session, event) => this.observe(session, event), { global: true })
      if (typeof dispose === 'function') disposers.push(dispose)
    } catch {
      // Without session events the meter falls back to the prompt heuristic.
    }
    return () => {
      for (const dispose of disposers) {
        try {
          dispose()
        } catch {
          // A host-side dispose failure must not keep the other listener alive.
        }
      }
    }
  }

  /** Track the real turn of a session from its log. Safe to call with anything. */
  observe(session, event) {
    if (event === null || typeof event !== 'object') return
    if (event.type !== 'turn/start' && event.type !== 'turn/end') return
    const id = sessionIdOf(session)
    const turn = Number(event.data === null || typeof event.data !== 'object' ? NaN : event.data.turn)
    if (id === null || !Number.isFinite(turn) || turn <= 0) return
    this.turns.set(id, { turn, open: event.type === 'turn/start' })
    while (this.turns.size > 50) {
      const oldest = this.turns.keys().next()
      if (oldest.done === true) break
      this.turns.delete(oldest.value)
    }
  }

  async *wrap(options, next) {
    const iterator = next()
    for await (const chunk of iterator) {
      try {
        if (chunk !== null && typeof chunk === 'object' && chunk.type === 'usage' && chunk.usage !== null && typeof chunk.usage === 'object') {
          this.record(options, chunk.usage)
        }
      } catch (error) {
        this.log(`[qols-usage] could not record usage: ${error instanceof Error ? error.message : String(error)}`)
      }
      yield chunk
    }
  }

  /** Pure enough to unit-test: records one usage chunk. */
  record(options, usage) {
    const at = this.now()
    const session = typeof options?.sessionId === 'string' && options.sessionId !== '' ? options.sessionId : 'unknown'
    const model = typeof options?.model === 'string' ? options.model : ''
    const provider = typeof options?.provider === 'string' ? options.provider : ''
    const buckets = {
      input: bucket(usage.inputTokens),
      output: bucket(usage.outputTokens),
      cacheRead: bucket(usage.cacheReadTokens),
      cacheWrite: bucket(usage.cacheWriteTokens),
      reasoning: bucket(usage.reasoningTokens),
    }
    if (buckets.input === 0 && buckets.output === 0 && buckets.cacheRead === 0 && buckets.cacheWrite === 0) return null

    const fingerprint = `${session}|${model}|${buckets.input}|${buckets.output}|${buckets.cacheRead}|${buckets.cacheWrite}`
    const seenAt = this.seen.get(fingerprint)
    if (seenAt !== undefined && at - seenAt < SEEN_TTL_MS) return null
    if (this.seen.size > 500) {
      for (const [key, stamp] of this.seen) {
        if (at - stamp > SEEN_TTL_MS) this.seen.delete(key)
      }
    }
    this.seen.set(fingerprint, at)

    const signature = signatureOf(options)
    const state = this.#turnOf(session, signature, at)
    const liveTurn = this.turns.get(session)
    const phase = peakPhase(at, this.config.peak)
    const price = priceEntry(this.config.prices, model)
    const cost = price === null ? 0 : usageCost(price.entry, buckets, phase.multiplier)
    const tokens = {
      input: buckets.input,
      output: buckets.output,
      cacheRead: buckets.cacheRead,
      cacheWrite: buckets.cacheWrite,
      reasoning: buckets.reasoning,
      total: buckets.input + buckets.output + buckets.cacheRead + buckets.cacheWrite,
    }

    const entry = this.ledger.append({
      at,
      day: dayKey(at),
      session,
      turn: liveTurn === undefined ? state.turn : liveTurn.turn,
      turnSource: liveTurn === undefined ? 'heuristic' : 'session',
      provider,
      model,
      ...buckets,
      cost,
      priced: price !== null,
      estimated: price !== null && price.exact !== true,
    })

    state.endedAt = at
    state.calls.push({ at, model, cost, tokens })
    if (state.calls.length > CALLS_PER_TURN) state.calls.splice(0, state.calls.length - CALLS_PER_TURN)
    for (const key of ['input', 'output', 'cacheRead', 'cacheWrite', 'reasoning']) state.totals[key] += buckets[key]
    state.totals.total = state.totals.input + state.totals.output + state.totals.cacheRead + state.totals.cacheWrite
    state.totals.cost += cost
    state.totals.calls += 1
    this.lastSession = session
    return entry
  }

  #turnOf(session, signature, at) {
    let state = this.sessions.get(session)
    const freshTurn = signature !== null
      && (state === undefined || state.signature !== signature)
      && (state === undefined || at - state.startedAt > TURN_GUARD_MS)
    if (state === undefined || freshTurn) {
      state = {
        turn: state === undefined ? 1 : state.turn + 1,
        signature: signature ?? (state?.signature ?? ''),
        startedAt: at,
        endedAt: at,
        totals: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0, total: 0, cost: 0, calls: 0 },
        calls: [],
      }
      this.sessions.set(session, state)
    } else if (signature !== null) {
      state.signature = signature
    }
    return state
  }

  /** The current turn of a session, shaped for the card and the live chip. */
  snapshot(sessionId) {
    const id = typeof sessionId === 'string' && sessionId !== '' ? sessionId : this.lastSession
    if (id === null || id === undefined) return null
    const state = this.sessions.get(id)
    if (state === undefined) return null
    const live = this.turns.get(id)
    return {
      session: id,
      turn: state.turn,
      /** Real session turn from `turn/start`, or null before the first one. */
      sessionTurn: live === undefined ? null : live.turn,
      /** True between `turn/start` and `turn/end`. */
      open: live !== undefined && live.open === true,
      startedAt: new Date(state.startedAt).toISOString(),
      endedAt: new Date(state.endedAt).toISOString(),
      totals: { ...state.totals },
      calls: state.calls.slice(-20).map((call) => ({
        at: new Date(call.at).toISOString(),
        model: call.model,
        cost: call.cost,
        tokens: { ...call.tokens },
      })),
    }
  }
}
