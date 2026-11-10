/**
 * The `qols-auto` LLM adapter.
 *
 * It registers as a normal provider with exactly one model (`auto`) whose
 * effort ids are the tiers. Every call is routed by `router.js` to a real
 * upstream route and delegated through `llm.stream()`, so retries, usage
 * accounting and the durable log all behave as they do for any other adapter.
 *
 * The adapter is deliberately duck-typed instead of extending the core
 * `LlmAdapter` class: the plugin must not depend on an internal package.
 */

import { EFFORTS, config as defaultConfig } from './config.js'

const MODEL_DESCRIPTION =
  'QoLs Auto route: judges the task and answers with the eco, standard or deep tier.'

/**
 * Re-label assistant turns produced under this wrapper back to the upstream
 * provider for the duration of the inner call.
 *
 * dsh keeps an adapter-private `replayState` only when the message's provider
 * belongs to the same adapter instance that receives it; without this relabel
 * reasoning continuity is dropped on every step.
 */
function restoreUpstreamSource(messages, wrapperId, upstreamId) {
  if (!Array.isArray(messages) || wrapperId === upstreamId) return messages
  return messages.map((message) => {
    if (!message || message.role !== 'assistant') return message
    const source = message.source
    if (!source || source.kind !== 'model' || source.provider !== wrapperId) return message
    return { ...message, source: { ...source, provider: upstreamId } }
  })
}

/**
 * @param {{ llm: object, router: object, config?: object, log?: (message: string) => void }} deps
 */
export function createAutoAdapter({ llm, router, config = defaultConfig, log }) {
  const providerId = config.provider

  function modelInfo(provider, model) {
    if (model !== config.model) {
      throw new Error(`qols-auto: unknown model ${JSON.stringify(model)}; only ${JSON.stringify(config.model)} is available`)
    }
    return {
      provider,
      id: model,
      name: 'Auto',
      description: MODEL_DESCRIPTION,
      inputModalities: ['text', 'image'],
      reasoning: {
        efforts: EFFORTS.map((effort) => ({ id: effort.id, name: effort.name, description: effort.description })),
        defaultEffort: config.defaultEffort,
      },
    }
  }

  return {
    /** Snapshot at registration: keep it cheap and static. */
    providerInfo(provider) {
      return { id: provider, name: 'QoLs Auto' }
    },

    providerRetryPolicy() {
      return undefined
    },

    imageRequestPricing() {
      return undefined
    },

    async listModels(provider) {
      return [modelInfo(provider, config.model)]
    },

    async resolveModel(provider, model) {
      return modelInfo(provider, model)
    },

    async prepareCall(provider, model, signal) {
      return {
        model: await this.resolveModel(provider, model),
        stream: (options) => this.stream(options),
      }
    },

    /**
     * Decide the tier for this call, then delegate to the real route.
     * @param {object} options GenerateOptions
     */
    async *stream(options) {
      const decision = await router.decide(options)
      const route = decision.route
      const messages = restoreUpstreamSource(options.messages, providerId, route.provider)

      const inner = {
        ...options,
        provider: route.provider,
        model: route.model,
        messages,
      }
      if (route.effort !== undefined) inner.reasoningEffort = route.effort
      else delete inner.reasoningEffort

      if (route.degraded) {
        log?.(`[qols-auto] degraded call through ${route.provider}/${route.model} (${route.effort ?? 'default effort'})`)
      }

      let finished = false
      for await (const chunk of llm.stream(inner)) {
        if (chunk?.type === 'finish') finished = true
        yield chunk
      }
      if (!finished) {
        // The inner stream always terminates with a finish chunk; if it somehow
        // does not, close the protocol ourselves instead of leaving the caller
        // waiting for a block that will never arrive.
        yield { type: 'finish', reason: { kind: 'error', failure: { code: 'EMPTY_RESPONSE', message: 'qols-auto: inner stream ended without a finish chunk' } } }
      }
    },
  }
}
