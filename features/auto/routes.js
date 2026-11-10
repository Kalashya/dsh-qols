/**
 * HTTP surface of the Auto feature.
 *
 * Five small JSON routes: the live decision for one session, the journal, the
 * effective config (readable and writable), the connected model catalogue and a
 * status probe. Everything is method-checked; the only write is the judge model.
 */

import { AUTO_PROVIDER, EFFORTS } from './config.js'
import { journalFileSize } from './journal.js'
import { json, messageOf, query, readJsonBody } from '../util.js'

export const ROUTES = {
  last: '/api/dsh-qols/auto/last',
  log: '/api/dsh-qols/auto/log',
  config: '/api/dsh-qols/auto/config',
  status: '/api/dsh-qols/auto/status',
  models: '/api/dsh-qols/auto/models',
}

/** Public shape of a journal entry or a live decision. */
export function presentDecision(entry) {
  if (!entry) return null
  return {
    at: entry.at,
    tier: entry.tier,
    provider: entry.provider,
    model: entry.model,
    effort: entry.effort ?? null,
    source: entry.source,
    score: entry.score,
    signals: entry.signals ?? [],
    taskHash: entry.taskHash,
    classifierMs: entry.classifierMs,
    degraded: entry.degraded === true,
  }
}

/** Everything the client needs to render the Auto popup. */
function configPayload({ config, settings }) {
  return {
    ok: true,
    provider: config.provider,
    model: config.model,
    defaultEffort: config.defaultEffort,
    tierOrder: config.tierOrder,
    tiers: config.tiers,
    efforts: EFFORTS,
    gray: config.gray,
    classifier: settings.snapshot(),
    purposeRoute: config.purposeRoute,
    degradation: config.degradation,
  }
}

/**
 * @param {object} ctx host plugin context
 * @param {{ config: object, journal: object, settings: object, registry: object,
 *           router: () => object | undefined, llm: () => object | undefined,
 *           log: (message: string) => void }} deps
 */
export function registerRoutes(ctx, deps) {
  const { config, journal, settings, registry, log } = deps

  const route = (path, handler) => {
    try {
      ctx.effect(() => ctx.webServer.register({ kind: 'exact', path, handler }), `qols: auto ${path}`)
    } catch (error) {
      log(`[qols-auto] could not register ${path}: ${messageOf(error)}`)
    }
  }

  const methodNotAllowed = (res, allow) => {
    res.writeHead(405, { allow })
    res.end()
  }

  const guard = (allowed, handler) => async (req, res) => {
    if (req.method !== allowed) {
      methodNotAllowed(res, allowed)
      return
    }
    try {
      await handler(req, res)
    } catch (error) {
      json(res, 500, { ok: false, error: messageOf(error) })
    }
  }

  route(ROUTES.last, guard('GET', (req, res) => {
    const sessionId = query(req, 'sessionId')
    const live = deps.router()?.decisionFor(sessionId)
    const stored = journal.last(sessionId)
    json(res, 200, {
      ok: true,
      decision: presentDecision(stored) ?? (live ? presentDecision({ ...live, at: new Date().toISOString() }) : null),
    })
  }))

  route(ROUTES.log, guard('GET', (req, res) => {
    const limit = Number(query(req, 'limit') ?? 20)
    json(res, 200, {
      ok: true,
      entries: journal.list({ sessionId: query(req, 'sessionId'), limit }).map(presentDecision),
    })
  }))

  // GET renders the popup; POST switches the judge to another connected model.
  route(ROUTES.config, async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'POST') {
      methodNotAllowed(res, 'GET, POST')
      return
    }
    try {
      if (req.method === 'GET') {
        json(res, 200, configPayload({ config, settings }))
        return
      }
      const llm = deps.llm()
      if (!llm) {
        json(res, 503, { ok: false, error: 'the llm service is not ready yet' })
        return
      }
      const body = await readJsonBody(req)
      const provider = typeof body?.classifier?.provider === 'string' ? body.classifier.provider.trim() : ''
      const model = typeof body?.classifier?.model === 'string' ? body.classifier.model.trim() : ''
      if (provider === '' || model === '') {
        json(res, 400, { ok: false, error: 'classifier.provider and classifier.model are required' })
        return
      }
      await settings.apply(llm, { provider, model }, { persist: true })
      const effort = config.classifier.effort ? `/${config.classifier.effort}` : ''
      log(`[qols-auto] classifier switched to ${config.classifier.provider}/${config.classifier.model}${effort}`)
      json(res, 200, configPayload({ config, settings }))
    } catch (error) {
      json(res, 400, { ok: false, error: messageOf(error) })
    }
  })

  // Every model that is connected right now, grouped by provider, so the popup
  // can offer a dropdown instead of asking the user to type ids.
  route(ROUTES.models, guard('GET', async (_req, res) => {
    const llm = deps.llm()
    if (!llm) {
      json(res, 503, { ok: false, error: 'the llm service is not ready yet' })
      return
    }
    const providers = await llm.listProviders()
    const groups = []
    const failures = []
    for (const provider of Array.isArray(providers) ? providers : []) {
      if (provider?.id === AUTO_PROVIDER) continue
      try {
        const models = await llm.listModels(provider.id)
        const rows = []
        for (const model of Array.isArray(models) ? models : []) {
          const id = typeof model?.id === 'string' ? model.id : ''
          if (id === '') continue
          let info
          try {
            info = await llm.resolveModelInfo(provider.id, id)
          } catch {
            info = undefined
          }
          rows.push({
            id,
            name: typeof info?.name === 'string' ? info.name : (typeof model?.name === 'string' ? model.name : id),
            efforts: Array.isArray(info?.reasoning?.efforts)
              ? info.reasoning.efforts.map((effort) => effort?.id).filter((value) => typeof value === 'string')
              : [],
            defaultEffort: typeof info?.reasoning?.defaultEffort === 'string' ? info.reasoning.defaultEffort : null,
          })
        }
        if (rows.length > 0) {
          groups.push({
            id: provider.id,
            name: typeof provider.name === 'string' ? provider.name : provider.id,
            models: rows,
          })
        }
      } catch (error) {
        failures.push({ provider: provider?.id ?? '', error: messageOf(error) })
      }
    }
    json(res, 200, { ok: true, groups, failures })
  }))

  route(ROUTES.status, guard('GET', (_req, res) => {
    const stats = journal.stats()
    json(res, 200, {
      ok: true,
      ...registry.stats(),
      sessions: deps.router()?.decisions.size() ?? 0,
      journal: { ...stats, bytes: journalFileSize(stats.file) },
    })
  }))
}
