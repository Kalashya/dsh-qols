/**
 * Binds the tier map to the providers that are actually connected.
 *
 * `config.js` names the models (flash for Eco and Standard, v4-pro for Deep) but
 * not the provider: a user may be signed in through the API key
 * (`deepseek-official`), the stored account grant (`deepseek-account`) or both.
 * Choosing the provider once per topology keeps the tiers honest instead of
 * silently degrading to the hard-coded default on every call.
 *
 * Objects are mutated in place: the router and the classifier hold references to
 * `config.tiers`, `config.purposeRoute`, `config.degradation` and
 * `config.classifier`.
 */

import { AUTO_PROVIDER } from './config.js'

const PREFERRED = ['deepseek-account', 'deepseek-official']

/** provider id -> Set of advertised model ids */
async function describeTopology(llm) {
  const available = new Map()
  if (typeof llm?.listProviders !== 'function') return available
  const providers = await llm.listProviders()
  for (const provider of Array.isArray(providers) ? providers : []) {
    const id = typeof provider?.id === 'string' ? provider.id : ''
    if (id === '' || id === AUTO_PROVIDER) continue
    try {
      const models = await llm.listModels(id)
      available.set(id, new Set(
        (Array.isArray(models) ? models : [])
          .map((model) => (typeof model?.id === 'string' ? model.id : ''))
          .filter((value) => value !== ''),
      ))
    } catch {
      available.set(id, new Set())
    }
  }
  return available
}

export function createTierBinder({ config, log }) {
  /**
   * @param {object} llm live llm service
   * @returns {Promise<boolean>} true when every route found its provider
   */
  return async function bind(llm) {
    const available = await describeTopology(llm)
    if (available.size === 0) {
      log('[qols-auto] no connected providers yet; keeping the configured tier providers')
      return false
    }

    const choose = (preferred, model) => {
      for (const id of [preferred, ...PREFERRED, ...available.keys()]) {
        if (typeof id === 'string' && available.get(id)?.has(model) === true) return id
      }
      return undefined
    }

    let complete = true
    const assign = (target, label) => {
      const provider = choose(target.provider, target.model)
      if (provider === undefined) {
        complete = false
        log(`[qols-auto] no connected provider advertises ${target.model}; ${label} keeps ${target.provider}`)
        return
      }
      if (provider !== target.provider) {
        log(`[qols-auto] ${label} bound to ${provider}/${target.model}${target.effort ? `/${target.effort}` : ''}`)
      }
      target.provider = provider
    }

    for (const tier of config.tierOrder) assign(config.tiers[tier], `tier ${tier}`)
    assign(config.purposeRoute, 'fixed route')
    assign(config.degradation, 'degradation route')
    assign(config.classifier, 'judge')
    return complete
  }
}
