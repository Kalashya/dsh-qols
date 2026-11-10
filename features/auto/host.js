/**
 * Host half of the Auto feature.
 *
 * Wiring only: the decision lives in `router.js`, the provider registration in
 * `registry.js`, the HTTP surface in `routes.js`, the persisted preference in
 * `settings.js`. Nothing here touches the agent loop — the adapter is a normal
 * LLM provider, and the decision happens inside its `stream()` call.
 */

import { config as defaultConfig } from './config.js'
import { createClassifier } from './classifier.js'
import { AutoJournal } from './journal.js'
import { createRegistry } from './registry.js'
import { registerRoutes } from './routes.js'
import { createRouter } from './router.js'
import { createTierBinder } from './tiers.js'
import { AutoSettings } from './settings.js'
import { messageOf } from '../util.js'

export const feature = {
  id: 'auto',
  register(ctx) {
    const config = defaultConfig
    const journal = new AutoJournal(config.journal)
    const log = (message) => console.log(message)
    const settings = new AutoSettings({ dir: journal.dir, config, log })
    const storedClassifier = settings.load()

    /** @type {ReturnType<typeof createRouter> | undefined} */
    let router
    /** @type {ReturnType<typeof createRegistry> | undefined} */
    let registry
    /** @type {object | undefined} */
    let llmService

    function wire(scope) {
      const llm = scope.llm
      llmService = llm
      router = createRouter({
        llm,
        config,
        journal,
        log,
        classify: createClassifier({ llm, config, log }),
      })
      registry = createRegistry({ router, config, log })
      const bind = createTierBinder({ config, log })

      // Registration is synchronous and never depends on the topology: the
      // adapter resolves each route lazily, so the tier map may be bound later.
      registry.register(llm)

      // The tier map names models, not providers: bind it to whatever is
      // connected, after a stored judge route had a chance to apply.
      const settle = () => {
        const stored = storedClassifier
          ? settings.apply(llm).then((result) => {
            if (!result.applied) return
            log(`[qols-auto] classifier restored from settings: ${config.classifier.provider}/${config.classifier.model}`)
          }).catch((error) => {
            settings.source = 'default'
            log(`[qols-auto] stored classifier route ignored: ${messageOf(error)}`)
          })
          : Promise.resolve()
        return stored
          .then(() => bind(llm))
          .catch((error) => { log(`[qols-auto] could not bind tiers: ${messageOf(error)}`) })
          .finally(() => registry?.register(llm))
      }
      void settle()

      // A provider topology change means cached tier routes may be stale, and a
      // failed first registration deserves another chance.
      scope.effect(() => {
        const dispose = scope.on('llm/adapters-updated', () => {
          router?.invalidate()
          void settle()
        })
        return () => {
          dispose?.()
          registry?.dispose()
        }
      })
    }

    if (typeof ctx.inject === 'function') {
      ctx.inject(['llm'], (scope) => wire(scope))
    } else {
      wire(ctx)
    }

    registerRoutes(ctx, {
      config,
      journal,
      settings,
      registry: {
        stats: () => registry?.stats() ?? { registered: false, attempts: 0, lastError: undefined },
      },
      router: () => router,
      llm: () => llmService,
      log,
    })
  },
}
