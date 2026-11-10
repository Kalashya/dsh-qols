import Schema from '@deepseek-ai/schemastery'

import { features } from './features/index.js'
import { recordRegistration } from './features/health.js'

export const name = 'qols'

export const inject = ['webServer']

/**
 * The only knob worth exposing: the liked-plugins card can rewrite the profile
 * with pnpm. Teams that pin their profile should be able to turn that off
 * without editing the plugin.
 */
export const Config = Schema.object({
  updates: Schema.object({
    enabled: Schema.boolean()
      .default(true)
      .description('Allow the liked-plugins card to install dshmarket updates into the current profile.'),
  }).default({}),
})

export function apply(ctx, config) {
  console.log('[qols] loaded')
  const runtime = { updatesEnabled: config?.updates?.enabled !== false }
  for (const feature of features) {
    try {
      feature.register(ctx, runtime)
      recordRegistration(feature.id, null)
    } catch (error) {
      recordRegistration(feature.id, error)
      console.error('[qols] feature failed', feature && feature.id, error)
    }
  }
}
