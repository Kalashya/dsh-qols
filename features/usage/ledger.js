/**
 * Append-only usage ledger: one JSON line per model call.
 *
 * Storage: `<DSH_HOME>/storages/qols/usage/ledger.jsonl`, rotated past twice the
 * line budget. Records hold token counts, the model id, a session id and the
 * computed cost — never prompt or message text.
 *
 * The file is loaded once at startup (tail only) and kept in memory, so status
 * reads do not touch the disk on every poll.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { dshHome } from '../util.js'

const BUCKETS = ['input', 'output', 'cacheRead', 'cacheWrite', 'reasoning']

function safeParse(line) {
  try {
    const value = JSON.parse(line)
    return value !== null && typeof value === 'object' ? value : undefined
  } catch {
    return undefined
  }
}

function number(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

/** Local calendar day of an instant, e.g. `2026-10-29`. */
export function dayKey(atMs) {
  const date = new Date(atMs)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export class UsageLedger {
  /** @param {{ dir?: string, limit?: number, currency?: string, log?: (message: string) => void }} [options] */
  constructor(options = {}) {
    this.dir = options.dir ?? join(dshHome(), 'storages', 'qols', 'usage')
    this.file = join(this.dir, 'ledger.jsonl')
    this.limit = Number.isFinite(options.limit) ? Math.max(100, options.limit) : 5000
    this.currency = typeof options.currency === 'string' && options.currency !== '' ? options.currency.toUpperCase() : 'USD'
    this.log = typeof options.log === 'function' ? options.log : () => {}
    /** @type {object[]} */
    this.entries = []
    this.#load()
  }

  #load() {
    try {
      if (!existsSync(this.file)) return
      const lines = readFileSync(this.file, 'utf8').split('\n').filter((line) => line.trim())
      for (const line of lines.slice(-this.limit)) {
        const entry = safeParse(line)
        if (entry !== undefined) this.entries.push(entry)
      }
    } catch (error) {
      this.log(`[qols-usage] ledger ignored (${this.file}): ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /** Persist one call and keep it in memory. Never throws into a model call. */
  append(record) {
    const entry = {
      at: number(record.at),
      day: typeof record.day === 'string' ? record.day : dayKey(record.at),
      currency: this.currency,
      session: typeof record.session === 'string' ? record.session : 'unknown',
      turn: number(record.turn),
      /**
       * `session` when the number came from a `turn/start` event, `heuristic`
       * when the meter guessed it from the prompt. Only session rows can be
       * joined to a chat message, so only they feed per-turn totals.
       */
      turnSource: record.turnSource === 'session' ? 'session' : 'heuristic',
      provider: typeof record.provider === 'string' ? record.provider : '',
      model: typeof record.model === 'string' ? record.model : '',
      input: number(record.input),
      output: number(record.output),
      cacheRead: number(record.cacheRead),
      cacheWrite: number(record.cacheWrite),
      reasoning: number(record.reasoning),
      cost: Number.isFinite(record.cost) && record.cost >= 0 ? record.cost : 0,
      priced: record.priced !== false,
      estimated: record.estimated === true,
    }
    this.entries.push(entry)
    try {
      mkdirSync(this.dir, { recursive: true })
      appendFileSync(this.file, `${JSON.stringify(entry)}\n`, 'utf8')
      if (this.entries.length > this.limit * 2) this.#rotate()
    } catch (error) {
      this.log(`[qols-usage] could not append to ${this.file}: ${error instanceof Error ? error.message : String(error)}`)
    }
    return entry
  }

  #rotate() {
    try {
      const lines = this.entries.slice(-this.limit).map((entry) => JSON.stringify(entry))
      writeFileSync(this.file, lines.length > 0 ? `${lines.join('\n')}\n` : '', 'utf8')
      this.entries = this.entries.slice(-this.limit)
    } catch {
      // Rotation is best effort; the in-memory ledger keeps working.
    }
  }

  /** Aggregates for one local day. */
  aggregate(day) {
    const tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0, total: 0 }
    const models = new Map()
    let calls = 0
    let cost = 0
    let unpriced = 0
    let estimated = 0
    let lastAt = 0
    for (const entry of this.entries) {
      if (entry.day !== day) continue
      // Records written before the USD switch carry no currency (or CNY); their
      // costs are yuan, so adding them to dollar totals would overstate Today.
      if (entry.currency !== this.currency) continue
      calls += 1
      cost += entry.cost
      if (entry.priced === false) unpriced += 1
      if (entry.estimated === true) estimated += 1
      lastAt = Math.max(lastAt, entry.at)
      for (const key of BUCKETS) tokens[key] += number(entry[key])
      tokens.total += BUCKETS.reduce((sum, key) => sum + number(entry[key]), 0)
      const id = entry.model || 'unknown'
      const row = models.get(id) ?? { model: id, calls: 0, cost: 0, tokens: 0 }
      row.calls += 1
      row.cost += entry.cost
      row.tokens += BUCKETS.reduce((sum, key) => sum + number(entry[key]), 0)
      models.set(id, row)
    }
    return {
      day,
      calls,
      cost,
      tokens,
      unpriced,
      estimated,
      lastAt: lastAt === 0 ? null : new Date(lastAt).toISOString(),
      models: [...models.values()].sort((a, b) => b.cost - a.cost),
    }
  }

  /**
   * Totals of one real session turn, from the persisted ledger.
   *
   * Only `turnSource: 'session'` rows count: their number came from the session
   * log and is the same number the chat renders its tail for, so this survives a
   * reload and never mixes in the heuristic numbering.
   *
   * @param {string} session session id.
   * @param {number} turn real turn number.
   */
  turnTotals(session, turn) {
    const wanted = number(turn)
    const tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0, total: 0 }
    const recent = []
    let calls = 0
    let cost = 0
    for (const entry of this.entries) {
      if (entry.session !== session || number(entry.turn) !== wanted) continue
      if (entry.turnSource !== 'session' || entry.currency !== this.currency) continue
      calls += 1
      cost += entry.cost
      const callTokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0, total: 0 }
      for (const key of BUCKETS) {
        tokens[key] += number(entry[key])
        callTokens[key] = number(entry[key])
        callTokens.total += number(entry[key])
      }
      tokens.total += callTokens.total
      recent.push({ at: new Date(entry.at).toISOString(), model: entry.model, cost: entry.cost, tokens: callTokens })
    }
    return { session, turn: wanted, calls, cost, tokens, recent: recent.slice(-20) }
  }

  /** Newest first daily summaries, for the log route. */
  daily(days = 7) {
    const limit = Math.max(1, Math.min(90, Number(days) || 7))
    const keys = []
    const seen = new Set()
    for (let index = this.entries.length - 1; index >= 0 && keys.length < limit; index -= 1) {
      const day = this.entries[index].day
      if (typeof day !== 'string' || seen.has(day)) continue
      seen.add(day)
      keys.push(day)
    }
    return keys.map((day) => this.aggregate(day))
  }

  size() {
    return this.entries.length
  }
}
