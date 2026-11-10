/**
 * Tier binding: the map names models, the topology names providers.
 *
 * These checks drive the real binder with fake llm services so the three cases
 * that matter are covered: both connections present, only the API-key
 * connection, and no connection at all.
 */

import { config as shippedConfig } from '../features/auto/config.js'
import { createTierBinder } from '../features/auto/tiers.js'

const MODELS = {
  'deepseek-account': ['deepseek-flash', 'deepseek-v4-pro'],
  'deepseek-official': ['deepseek-flash', 'deepseek-v4-pro'],
  'acp-agent': ['some-other-model'],
}

function cloneConfig() {
  return structuredClone(shippedConfig)
}

function fakeLlm(providers) {
  return {
    async listProviders() {
      return providers.map((id) => ({ id, name: id }))
    },
    async listModels(provider) {
      return (MODELS[provider] ?? []).map((id) => ({ id }))
    },
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(`FAILED: ${message}`)
  console.log(`ok  ${message}`)
}

/* Both connections: the preferred account route wins and nothing is logged. */
{
  const config = cloneConfig()
  const lines = []
  const bind = createTierBinder({ config, log: (line) => lines.push(line) })
  const complete = await bind(fakeLlm(['deepseek-account', 'deepseek-official']))
  assert(complete === true, 'both connections bind every route')
  assert(config.tiers.eco.provider === 'deepseek-account', 'eco stays on the account route')
  assert(config.tiers.deep.model === 'deepseek-v4-pro', 'deep keeps the pro model')
  assert(lines.length === 0, 'no notice when the configured provider is available')
}

/* Only the API-key connection: every route follows it instead of degrading. */
{
  const config = cloneConfig()
  const lines = []
  const bind = createTierBinder({ config, log: (line) => lines.push(line) })
  const complete = await bind(fakeLlm(['deepseek-official']))
  assert(complete === true, 'a single connection still binds every route')
  assert(config.tiers.standard.provider === 'deepseek-official', 'standard follows the only connection')
  assert(config.classifier.provider === 'deepseek-official', 'the judge follows it as well')
  assert(config.degradation.provider === 'deepseek-official', 'degradation follows it as well')
  assert(lines.some((line) => line.includes('bound to deepseek-official')), 'the rebind is logged once per route')
}

/* A connection that knows neither model: keep the configured route and warn. */
{
  const config = cloneConfig()
  const lines = []
  const bind = createTierBinder({ config, log: (line) => lines.push(line) })
  const complete = await bind(fakeLlm(['acp-agent']))
  assert(complete === false, 'an unrelated connection reports an incomplete bind')
  assert(config.tiers.eco.provider === 'deepseek-account', 'the configured provider is kept')
  assert(lines.some((line) => line.includes('no connected provider advertises deepseek-flash')), 'the gap is logged')
}

/* No topology at all: nothing is mutated. */
{
  const config = cloneConfig()
  const lines = []
  const bind = createTierBinder({ config, log: (line) => lines.push(line) })
  const complete = await bind({ async listProviders() { return [] } })
  assert(complete === false, 'an empty topology reports an incomplete bind')
  assert(config.tiers.eco.provider === 'deepseek-account', 'the configured map is untouched')
}

/* A llm service without the topology methods must not throw. */
{
  const config = cloneConfig()
  const bind = createTierBinder({ config, log: () => {} })
  const complete = await bind({})
  assert(complete === false, 'a bare llm service is tolerated')
}

console.log('TIER BINDING TESTS PASSED')
