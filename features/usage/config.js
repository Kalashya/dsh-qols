/**
 * Usage feature: defaults, persisted preferences, and validation.
 *
 * Prices are USD per one million tokens — DeepSeek's official dollar price list
 * (Flash off-peak 0.003 / 0.15 / 0.6, Pro 0.022 / 0.66 / 1.98). `cacheWrite` is
 * not priced separately by DeepSeek: it is charged at the cache-hit rate, which
 * is why the schema has no `cacheWrite` key.
 *
 * The peak schedule is the official UTC one: 01:00–04:00 and 06:00–10:00 UTC.
 * Since 2026-08-23 weekends (Beijing calendar) are off-peak for the whole day.
 * Chinese public holidays are whole-day off-peak too; the default list mirrors
 * `dsh-cost-meter` and must be extended once a year.
 */

export const SETTINGS_VERSION = 2

/** Currency of every price in this schema, and of every ledger record it writes. */
export const PRICES_CURRENCY = 'USD'

/**
 * Beijing dates that are off-peak for the whole day. The official calendar only
 * lists holidays from 2026-08-23 onward; older dates never needed the rule.
 */
export const DEFAULT_PEAK_HOLIDAYS = [
  '2026-09-25',
  '2026-09-26',
  '2026-09-27',
  '2026-10-01',
  '2026-10-02',
  '2026-10-03',
  '2026-10-04',
  '2026-10-05',
  '2026-10-06',
  '2026-10-07',
]

export const DEFAULT_CONFIG = {
  version: SETTINGS_VERSION,
  enabled: true,
  showTokens: true,
  hideCostMeter: true,
  showAmounts: true,
  balanceWarnBelow: 0,
  peak: {
    multiplier: 2,
    weekendsOffPeak: true,
    windows: [{ start: 1, end: 4 }, { start: 6, end: 10 }],
    holidays: [...DEFAULT_PEAK_HOLIDAYS],
  },
  prices: {
    default: { cacheHit: 0.003, cacheMiss: 0.15, output: 0.6 },
    models: {
      'deepseek-v4-pro': { cacheHit: 0.022, cacheMiss: 0.66, output: 1.98 },
    },
  },
}

function finite(value, fallback, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, number))
}

function priceTier(raw, fallback) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return fallback
  const out = {}
  for (const key of ['cacheHit', 'cacheMiss', 'output']) {
    const value = Number(raw[key])
    out[key] = Number.isFinite(value) && value >= 0 ? value : fallback[key]
  }
  return out
}

function windowList(raw, fallback) {
  if (!Array.isArray(raw)) return fallback
  const out = []
  for (const entry of raw) {
    if (entry === null || typeof entry !== 'object') continue
    const start = Number(entry.start)
    const end = Number(entry.end)
    if (!Number.isInteger(start) || !Number.isInteger(end)) continue
    if (start < 0 || start > 24 || end < 0 || end > 24 || start === end) continue
    out.push({ start, end })
  }
  return out.length > 0 ? out : fallback
}

/** Beijing `YYYY-MM-DD` dates; an empty array is valid and disables holidays. */
function holidayList(raw, fallback) {
  if (!Array.isArray(raw)) return fallback
  const out = []
  for (const value of raw) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) continue
    const at = Date.parse(`${value}T00:00:00Z`)
    if (!Number.isFinite(at) || new Date(at).toISOString().slice(0, 10) !== value) continue
    if (!out.includes(value)) out.push(value)
  }
  return out.sort()
}

/** Merge stored preferences over the defaults, dropping anything malformed. */
export function normalizeConfig(raw) {
  const base = structuredClone(DEFAULT_CONFIG)
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return base
  base.enabled = raw.enabled !== false
  base.showTokens = raw.showTokens !== false
  base.hideCostMeter = raw.hideCostMeter !== false
  // `showBalance` was the first name of this switch, when it only hid the
  // wallet pair. Accept it once so an existing settings file keeps its choice.
  base.showAmounts = (Object.hasOwn(raw, 'showAmounts') ? raw.showAmounts : raw.showBalance) !== false
  base.balanceWarnBelow = finite(raw.balanceWarnBelow, 0, 0, 1e6)
  const peak = raw.peak !== null && typeof raw.peak === 'object' ? raw.peak : {}
  base.peak.multiplier = finite(peak.multiplier, 2, 1, 20)
  base.peak.weekendsOffPeak = peak.weekendsOffPeak !== false
  base.peak.windows = windowList(peak.windows, base.peak.windows)
  base.peak.holidays = Object.hasOwn(peak, 'holidays')
    ? holidayList(peak.holidays, base.peak.holidays)
    : base.peak.holidays
  // v1 stored CNY prices; v2 moved the table to DeepSeek's USD list, so a v1
  // file must not keep pricing calls in yuan.
  const prices = Number(raw.version) === SETTINGS_VERSION && raw.prices !== null && typeof raw.prices === 'object'
    ? raw.prices
    : {}
  base.prices.default = priceTier(prices.default, base.prices.default)
  if (prices.models !== null && typeof prices.models === 'object' && !Array.isArray(prices.models)) {
    const models = {}
    for (const [id, tier] of Object.entries(prices.models)) {
      if (typeof id !== 'string' || id.trim() === '') continue
      models[id.trim()] = priceTier(tier, base.prices.default)
    }
    if (Object.keys(models).length > 0) base.prices.models = models
  }
  return base
}

/**
 * Apply the client-editable subset of settings in place. The meter holds a
 * reference to the same object, so no restart is needed after a save.
 *
 * @returns {string[]} names that were rejected
 */
export function applyConfig(config, patch) {
  const rejected = []
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return ['body']
  if (Object.hasOwn(patch, 'enabled')) config.enabled = patch.enabled === true
  if (Object.hasOwn(patch, 'showTokens')) config.showTokens = patch.showTokens === true
  if (Object.hasOwn(patch, 'hideCostMeter')) config.hideCostMeter = patch.hideCostMeter === true
  if (Object.hasOwn(patch, 'showAmounts')) config.showAmounts = patch.showAmounts === true
  if (Object.hasOwn(patch, 'balanceWarnBelow')) {
    const value = Number(patch.balanceWarnBelow)
    if (Number.isFinite(value) && value >= 0 && value <= 1e6) config.balanceWarnBelow = value
    else rejected.push('balanceWarnBelow')
  }
  if (patch.peak !== null && typeof patch.peak === 'object' && !Array.isArray(patch.peak)) {
    if (Object.hasOwn(patch.peak, 'multiplier')) {
      const value = Number(patch.peak.multiplier)
      if (Number.isFinite(value) && value >= 1 && value <= 20) config.peak.multiplier = value
      else rejected.push('peak.multiplier')
    }
    if (Object.hasOwn(patch.peak, 'weekendsOffPeak')) config.peak.weekendsOffPeak = patch.peak.weekendsOffPeak === true
    if (Object.hasOwn(patch.peak, 'windows')) {
      const windows = windowList(patch.peak.windows, null)
      if (windows === null) rejected.push('peak.windows')
      else config.peak.windows = windows
    }
    if (Object.hasOwn(patch.peak, 'holidays')) {
      if (!Array.isArray(patch.peak.holidays)) rejected.push('peak.holidays')
      else config.peak.holidays = holidayList(patch.peak.holidays, [])
    }
  }
  return rejected
}

/** Public view for the settings UI: the prices are numbers, never secrets. */
export function publicConfig(config) {
  return {
    version: SETTINGS_VERSION,
    enabled: config.enabled,
    showTokens: config.showTokens,
    hideCostMeter: config.hideCostMeter,
    showAmounts: config.showAmounts,
    balanceWarnBelow: config.balanceWarnBelow,
    peak: {
      multiplier: config.peak.multiplier,
      weekendsOffPeak: config.peak.weekendsOffPeak,
      windows: config.peak.windows.map((window) => ({ start: window.start, end: window.end })),
      holidays: [...config.peak.holidays],
    },
    prices: structuredClone(config.prices),
  }
}
