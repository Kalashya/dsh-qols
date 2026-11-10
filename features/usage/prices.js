/**
 * Price lookup and per-call costing.
 *
 * The table is USD per 1M tokens. `cacheMiss` is the rate for input tokens that
 * were not served from cache; `cacheHit` is used for cache reads and cache
 * writes (DeepSeek has no separate cache-write price). Reasoning tokens are
 * already part of `outputTokens` in the usage chunk and are not added again,
 * otherwise a thinking call would be billed twice.
 */

/**
 * Resolve the rate entry for a model: the longest matching table key wins, so
 * `deepseek-v4-pro` is not shadowed by a `deepseek-v4` entry. Unknown models
 * fall back to `default` and are reported as an estimate.
 *
 * @returns {{ entry: { cacheHit: number, cacheMiss: number, output: number }, exact: boolean } | null}
 */
export function priceEntry(prices, model) {
  if (prices === null || typeof prices !== 'object') return null
  const id = typeof model === 'string' ? model.toLowerCase() : ''
  const models = prices.models !== null && typeof prices.models === 'object' ? prices.models : {}
  let best = null
  for (const [key, entry] of Object.entries(models)) {
    if (entry === null || typeof entry !== 'object') continue
    if (id === '' || !id.includes(key.toLowerCase())) continue
    if (best === null || key.length > best.key.length) best = { key, entry }
  }
  if (best !== null) return { entry: best.entry, exact: true }
  return prices.default !== null && typeof prices.default === 'object' ? { entry: prices.default, exact: false } : null
}

/**
 * Cost of one call in USD. `multiplier` is the peak multiplier (1 off-peak).
 *
 * @param {{ input?: number, output?: number, cacheRead?: number, cacheWrite?: number }} usage
 */
export function usageCost(entry, usage, multiplier = 1) {
  if (entry === null || typeof entry !== 'object') return 0
  const input = Number(usage?.input ?? 0) || 0
  const output = Number(usage?.output ?? 0) || 0
  const cacheRead = Number(usage?.cacheRead ?? 0) || 0
  const cacheWrite = Number(usage?.cacheWrite ?? 0) || 0
  const billed = input * entry.cacheMiss
    + (cacheRead + cacheWrite) * entry.cacheHit
    + output * entry.output
  return billed / 1e6 * multiplier
}
