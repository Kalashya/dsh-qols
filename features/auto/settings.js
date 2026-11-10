/**
 * Persisted Auto preferences.
 *
 * `storages/qols/auto/settings.json` holds only what the user can change from the
 * QoL popup (`Edit` on the Auto card): which connected model judges the gray
 * zone. The tier map stays in `config.js` because it is a product decision, not a
 * preference of the session.
 *
 * `createClassifier()` keeps a reference to `config.classifier`, so accepted
 * values are written into that object in place — never replace it.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { messageOf, readOwnJson } from '../util.js'
import { AUTO_PROVIDER } from './config.js'

export const SETTINGS_VERSION = 1

/**
 * The effort the judge should ask for on a given model: the cheapest advertised
 * level, so the judge stays a one-word answer. Models without reasoning get
 * `undefined`, which means "whatever the adapter does by default".
 */
export function judgeEffort(info) {
  const reasoning = info !== null && typeof info === 'object' ? info.reasoning : undefined
  const efforts = Array.isArray(reasoning?.efforts) ? reasoning.efforts : []
  const ids = efforts.map((effort) => effort?.id).filter((id) => typeof id === 'string')
  if (ids.length === 0) return undefined
  for (const preferred of ['off', 'low']) {
    if (ids.includes(preferred)) return preferred
  }
  const fallback = typeof reasoning?.defaultEffort === 'string' ? reasoning.defaultEffort : undefined
  return fallback !== undefined && ids.includes(fallback) ? fallback : ids[0]
}

export class AutoSettings {
  /**
   * @param {{ dir: string, config: object, log: (message: string) => void }} deps
   */
  constructor({ dir, config, log }) {
    this.dir = dir
    this.file = join(dir, 'settings.json')
    this.config = config
    this.log = log
    /** @type {{ provider: string, model: string } | null} */
    this.persisted = null
    /** 'default' until a stored or user-chosen route has been accepted. */
    this.source = 'default'
  }

  /** Read the file, if any. Returns the stored pair without resolving it. */
  load() {
    if (!existsSync(this.file)) return null
    const raw = readOwnJson(this.file, null, this.log)
    if (raw === null) return null
    const provider = typeof raw?.classifier?.provider === 'string' ? raw.classifier.provider.trim() : ''
    const model = typeof raw?.classifier?.model === 'string' ? raw.classifier.model.trim() : ''
    if (provider === '' || model === '') return null
    this.persisted = { provider, model }
    return this.persisted
  }

  /**
   * Resolve a route through the live llm service and adopt it.
   *
   * @param {object} llm
   * @param {{ provider: string, model: string } | null} [candidate] defaults to the stored pair
   * @param {{ persist?: boolean }} [options]
   * @returns {Promise<{ applied: boolean, effort?: string }>}
   */
  async apply(llm, candidate, options) {
    const next = candidate ?? this.persisted
    if (!next) return { applied: false }
    if (next.provider === AUTO_PROVIDER) throw new Error('the Auto provider cannot judge itself')

    const providers = await llm.listProviders()
    const known = Array.isArray(providers) && providers.some((provider) => provider?.id === next.provider)
    if (!known) throw new Error(`model connection "${next.provider}" is not available`)

    // Throws for an unknown model, which is the validation the client relies on.
    const info = await llm.resolveModelInfo(next.provider, next.model)
    const effort = judgeEffort(info)

    this.config.classifier.provider = next.provider
    this.config.classifier.model = next.model
    if (effort === undefined) delete this.config.classifier.effort
    else this.config.classifier.effort = effort
    this.persisted = { provider: next.provider, model: next.model }
    this.source = 'settings'

    if (options?.persist === true) this.write({ provider: next.provider, model: next.model, effort: effort ?? null })
    return { applied: true, effort }
  }

  /** Effective classifier route plus where it came from, for the client. */
  snapshot() {
    const classifier = this.config.classifier
    return {
      provider: classifier.provider,
      model: classifier.model,
      effort: classifier.effort ?? null,
      maxTokens: classifier.maxTokens,
      timeoutMs: classifier.timeoutMs,
      source: this.source,
      file: this.file,
    }
  }

  write(route) {
    const body = JSON.stringify({ version: SETTINGS_VERSION, classifier: route }, null, 2)
    try {
      mkdirSync(this.dir, { recursive: true })
      writeFileSync(this.file, `${body}\n`, 'utf8')
    } catch (error) {
      this.log(`[qols-auto] could not write ${this.file}: ${messageOf(error)}`)
    }
  }
}
