/**
 * Decides which tier answers the next call and resolves that tier to a real
 * provider/model/effort route.
 *
 * A "task" is one agent turn: the first call whose last message is a user
 * message starts it, later calls of the same turn keep the tier. Explicit
 * picker tiers win and are sticky for the turn as well.
 */

import { evaluate, fallbackTier, isUserAuthored, lastUserMessage, messageText } from './heuristic.js'

/**
 * True when these messages begin a new task (a fresh user turn).
 *
 * The last message may be a harness-injected notice (`[model changed: ...]`);
 * it belongs to the new prompt, not after it, so the scan skips user-role
 * messages the user did not type.
 */
export function isTaskStart(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return true
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i]
    if (!message) continue
    if (message.role === 'user') {
      if (isUserAuthored(message)) return true
      // Harness-injected user-role notice: keep scanning for the real prompt.
      continue
    }
    return false
  }
  return true
}

/** True when the task carries image blocks the Deep tier cannot read. */
function taskHasImages(messages) {
  const task = lastUserMessage(messages)
  if (!Array.isArray(task?.content)) return false
  return task.content.some((block) => block?.type === 'image')
}

/** Tier explicitly chosen on the picker, or undefined when the effort is `auto`. */
function explicitTier(effort, config) {
  if (typeof effort !== 'string') return undefined
  return Object.hasOwn(config.tiers, effort) ? effort : undefined
}


/**
 * Resolves tier names to concrete routes and validates them against the live
 * llm service. Validation is cached; `invalidate()` is wired to
 * `llm/adapters-updated`.
 */
class RouteResolver {
  constructor({ llm, config, log }) {
    this.llm = llm
    this.config = config
    this.log = log
    this.cache = new Map()
    this.warned = new Set()
  }

  invalidate() {
    this.cache.clear()
  }

  #warn(onceKey, message) {
    if (this.warned.has(onceKey)) return
    this.warned.add(onceKey)
    this.log?.(message)
  }

  async #validate({ provider, model, effort, tier }) {
    const resolved = await this.llm.resolveCallConfig({ provider, model, reasoningEffort: effort })
    return {
      tier,
      provider: resolved?.provider ?? provider,
      model: resolved?.model ?? model,
      effort: resolved?.reasoningEffort ?? effort,
      degraded: false,
    }
  }

  /** @returns {Promise<{tier: string, provider: string, model: string, effort?: string, degraded: boolean}>} */
  async resolve(tier) {
    const cached = this.cache.get(tier)
    if (cached) return cached

    const target = this.config.tiers[tier]
    if (target) {
      try {
        const route = await this.#validate({ ...target, tier })
        this.cache.set(tier, route)
        return route
      } catch (error) {
        this.#warn(
          `tier:${tier}`,
          `[qols-auto] tier ${tier} unavailable (${target.provider}/${target.model}/${target.effort}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      }
    }

    const fallback = this.config.degradation
    const route = await this.#validate({ ...fallback, tier: tier ?? 'fallback' })
    const degraded = { ...route, degraded: true }
    this.cache.set(tier, degraded)
    return degraded
  }

  /** Fixed route for non-task calls: compaction, session titles. */
  async resolvePurpose() {
    const cached = this.cache.get('purpose')
    if (cached) return cached
    const route = await this.#validate({ ...this.config.purposeRoute, tier: 'fixed' })
    const fixed = { ...route, degraded: false }
    this.cache.set('purpose', fixed)
    return fixed
  }
}

class SessionDecisions {
  constructor() {
    this.bySession = new Map()
    this.counter = 0
  }

  nextTaskId(sessionId) {
    this.counter += 1
    return `${sessionId}#${this.counter}`
  }

  get(sessionId) {
    return this.bySession.get(sessionId)
  }

  set(sessionId, decision) {
    this.bySession.set(sessionId, decision)
  }

  clear(sessionId) {
    if (sessionId === undefined) this.bySession.clear()
    else this.bySession.delete(sessionId)
  }

  size() {
    return this.bySession.size
  }
}

/**
 * @param {{ llm: object, config: object, journal: object, log: (message: string) => void,
 *           classify: (input: { options: object, result: object }) => Promise<{tier: string, ms: number} | null> }} deps
 */
export function createRouter({ llm, config, journal, log, classify }) {
  const resolver = new RouteResolver({ llm, config, log })
  const decisions = new SessionDecisions()

  /**
   * @param {object} options llm GenerateOptions of the pending call
   * @returns {Promise<{ route: object, tier: string|null, source: string,
   *                     score?: number, signals?: string[], classifierMs?: number, taskId?: string }>}
   */
  async function decide(options) {
    const sessionId = typeof options?.sessionId === 'string' ? options.sessionId : 'unknown'
    const start = isTaskStart(options?.messages)

    // Compaction and title generation are not tasks: never pay for a decision.
    if (options?.purpose !== undefined) {
      const route = await resolver.resolvePurpose()
      return { route, tier: 'fixed', source: 'purpose', taskId: decisions.get(sessionId)?.taskId }
    }

    const previous = decisions.get(sessionId)
    if (!start && previous) return { ...previous, reused: true }

    const selected = explicitTier(options?.reasoningEffort, config)
    if (selected) {
      const route = await resolver.resolve(selected)
      const taskId = decisions.nextTaskId(sessionId)
      journal.record({
        sessionId,
        taskId,
        tier: selected,
        provider: route.provider,
        model: route.model,
        effort: route.effort,
        source: 'selected',
        degraded: route.degraded,
      })
      const decision = { route, tier: selected, source: 'selected', taskId }
      decisions.set(sessionId, decision)
      return decision
    }

    const result = evaluate(options, config)
    let tier = result.tier
    let signals = result.signals
    let source = 'heuristic'
    let classifierMs
    if (!tier) {
      const answer = await classify({ options, result })
      if (answer) {
        tier = answer.tier
        source = 'classifier'
        classifierMs = answer.ms
      } else {
        tier = fallbackTier(result, config)
        source = 'fallback'
      }
    }

    // deepseek-v4-pro reads text only; never route an image task to Deep
    // implicitly, the image would be projected away without a trace.
    if (tier === 'deep' && taskHasImages(options?.messages)) {
      tier = 'standard'
      signals = [...(signals ?? []), 'image-guard']
    }

    const route = await resolver.resolve(tier)
    const taskId = decisions.nextTaskId(sessionId)
    const task = lastUserMessage(options?.messages)
    journal.record({
      sessionId,
      taskId,
      tier,
      provider: route.provider,
      model: route.model,
      effort: route.effort,
      source,
      score: result.score,
      signals,
      taskText: messageText(task),
      classifierMs,
      degraded: route.degraded,
    })

    const decision = { route, tier, source, score: result.score, signals, classifierMs, taskId }
    decisions.set(sessionId, decision)
    return decision
  }

  return {
    decide,
    resolver,
    decisions,
    invalidate: () => resolver.invalidate(),
    decisionFor: (sessionId) => decisions.get(sessionId),
  }
}
