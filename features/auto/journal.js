/**
 * Auto-mode journal: what the router decided, why, and which route answered.
 *
 * The journal never stores task text. It keeps a short hash of the task so the
 * same prompt can be recognised across restarts, plus the heuristic score and
 * the signal names that produced it.
 *
 * Storage: `<DSH_HOME>/storages/qols/auto/log.jsonl` (append-only, rotated when
 * it grows past twice the configured line budget).
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

import { dshHome } from '../util.js'

/** Short, stable fingerprint of the task text. Never the text itself. */
export function taskHash(text) {
  const slice = typeof text === 'string' ? text.slice(0, 200) : ''
  return createHash('sha256').update(slice).digest('hex').slice(0, 12)
}

function safeParse(line) {
  try {
    const value = JSON.parse(line)
    return value && typeof value === 'object' ? value : undefined
  } catch {
    return undefined
  }
}

export class AutoJournal {
  #entries = []
  #lines = 0

  constructor(options = {}) {
    this.limit = Number.isFinite(options.memory) ? Math.max(1, options.memory) : 200
    this.lineLimit = Number.isFinite(options.fileLines) ? Math.max(this.limit, options.fileLines) : 2000
    this.persist = options.persist !== false
    this.dir = options.dir ?? join(dshHome(), 'storages', 'qols', 'auto')
    this.file = join(this.dir, 'log.jsonl')
    if (this.persist) this.#load()
  }

  #load() {
    try {
      if (!existsSync(this.file)) return
      const raw = readFileSync(this.file, 'utf8')
      const lines = raw.split('\n').filter((line) => line.trim())
      this.#lines = lines.length
      for (const line of lines.slice(-this.limit)) {
        const entry = safeParse(line)
        if (entry) this.#entries.push(entry)
      }
    } catch {
      // A broken journal must never break a model call.
    }
  }

  #append(entry) {
    try {
      mkdirSync(this.dir, { recursive: true })
      appendFileSync(this.file, `${JSON.stringify(entry)}\n`, 'utf8')
      this.#lines += 1
      if (this.#lines > this.lineLimit * 2) this.#rotate()
    } catch {
      // Ignore: the in-memory journal keeps working.
    }
  }

  #rotate() {
    try {
      const raw = readFileSync(this.file, 'utf8')
      const lines = raw.split('\n').filter((line) => line.trim()).slice(-this.lineLimit)
      writeFileSync(this.file, lines.length > 0 ? `${lines.join('\n')}\n` : '', 'utf8')
      this.#lines = lines.length
    } catch {
      // Rotation is best effort.
    }
  }

  /**
   * @param {object} input
   * @param {string} input.sessionId
   * @param {string} [input.taskId]
   * @param {string} input.tier
   * @param {string} input.provider
   * @param {string} input.model
   * @param {string} [input.effort]
   * @param {string} input.source 'selected' | 'heuristic' | 'classifier' | 'fallback' | 'purpose'
   * @param {number} [input.score]
   * @param {string[]} [input.signals]
   * @param {string} [input.taskText] hashed, never stored
   * @param {number} [input.classifierMs]
   * @param {boolean} [input.degraded]
   * @returns {object} the stored entry
   */
  record(input) {
    const entry = {
      at: new Date().toISOString(),
      sessionId: input.sessionId ?? 'unknown',
      taskId: input.taskId,
      tier: input.tier,
      provider: input.provider,
      model: input.model,
      effort: input.effort ?? null,
      source: input.source,
      score: input.score,
      signals: Array.isArray(input.signals) ? input.signals : [],
      taskHash: input.taskText ? taskHash(input.taskText) : undefined,
      classifierMs: input.classifierMs,
      degraded: input.degraded === true ? true : undefined,
    }
    this.#entries.push(entry)
    if (this.#entries.length > this.limit) {
      this.#entries.splice(0, this.#entries.length - this.limit)
    }
    if (this.persist) this.#append(entry)
    return entry
  }

  /** Newest first. */
  list({ sessionId, limit = 20 } = {}) {
    const size = Math.max(1, Math.min(200, Number(limit) || 20))
    const out = []
    for (let i = this.#entries.length - 1; i >= 0 && out.length < size; i -= 1) {
      const entry = this.#entries[i]
      if (sessionId && entry.sessionId !== sessionId) continue
      out.push(entry)
    }
    return out
  }

  /** Newest decision for a session, or null. */
  last(sessionId) {
    if (!sessionId) return null
    for (let i = this.#entries.length - 1; i >= 0; i -= 1) {
      if (this.#entries[i].sessionId === sessionId) return this.#entries[i]
    }
    return null
  }

  stats() {
    const counts = {}
    let degraded = 0
    let lastAt
    for (const entry of this.#entries) {
      counts[entry.tier] = (counts[entry.tier] ?? 0) + 1
      if (entry.degraded) degraded += 1
      lastAt = entry.at
    }
    return {
      entries: this.#entries.length,
      counts,
      degraded,
      lastAt,
      file: this.file,
      fileLines: this.#fileLines(),
    }
  }

  #fileLines() {
    try {
      if (!existsSync(this.file)) return 0
      return readFileSync(this.file, 'utf8').split('\n').filter((line) => line.trim()).length
    } catch {
      return 0
    }
  }
}

/** Size of the journal file in bytes, for the status route. */
export function journalFileSize(file) {
  try {
    return existsSync(file) ? statSync(file).size : 0
  } catch {
    return 0
  }
}
