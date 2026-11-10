/**
 * Auto routing configuration.
 *
 * One place for the tier map, the classifier route, the gray-zone thresholds and
 * the journal limits. The client reads the same values back from
 * `/api/dsh-qols/auto/config`, so the settings page never repeats them.
 */

/** Provider id this feature registers. Must not collide with a real adapter. */
export const AUTO_PROVIDER = 'qols-auto'

/** The only model the Auto provider advertises: the tier rides on the effort. */
const AUTO_MODEL = 'auto'

/** Effort id that means "decide for me"; the other three are explicit tiers. */
const AUTO_EFFORT = 'auto'

export const config = {
  provider: AUTO_PROVIDER,
  model: AUTO_MODEL,
  defaultEffort: AUTO_EFFORT,
  /** Ordered cheapest first. Order drives the picker rows and the fallback hints. */
  tiers: {
    eco: { label: 'Eco', provider: 'deepseek-account', model: 'deepseek-flash', effort: 'off' },
    standard: { label: 'Standard', provider: 'deepseek-account', model: 'deepseek-flash', effort: 'high' },
    deep: { label: 'Deep', provider: 'deepseek-account', model: 'deepseek-v4-pro', effort: 'max' },
  },
  tierOrder: ['eco', 'standard', 'deep'],
  /** Non-task calls (compaction, session titles) never pay for a decision. */
  purposeRoute: { provider: 'deepseek-account', model: 'deepseek-flash', effort: 'high' },
  /** The cheap judge. Only called inside the gray zone. */
  classifier: {
    provider: 'deepseek-account',
    model: 'deepseek-flash',
    effort: 'off',
    maxTokens: 8,
    timeoutMs: 2500,
    /** Truncation for the task text handed to the judge. */
    textLimit: 1500,
  },
  /** Heuristic score bounds: at or below `low` is Eco, at or above `high` is Deep. */
  gray: { low: 0.35, high: 0.7 },
  journal: { persist: true, memory: 200, fileLines: 2000 },
  /** Applied when a tier route cannot be resolved right now. */
  degradation: { provider: 'deepseek-account', model: 'deepseek-flash', effort: 'high' },
}

/** Human labels for the effort ids the picker shows on the `auto` model. */
export const EFFORTS = [
  { id: AUTO_EFFORT, name: 'Auto', description: 'Let the plugin judge the task: eco, standard or deep.' },
  { id: 'eco', name: 'Eco', description: 'Fastest route: flash, thinking off.' },
  { id: 'standard', name: 'Standard', description: 'Balanced route: flash, high effort.' },
  { id: 'deep', name: 'Deep', description: 'Hardest tasks: v4-pro, max effort.' },
]
