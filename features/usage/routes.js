/**
 * HTTP surface of the usage feature.
 *
 *   GET  /api/dsh-qols/usage/status   today's totals, peak phase, balance, turn
 *   GET  /api/dsh-qols/usage/turn     totals of one real session turn
 *   GET  /api/dsh-qols/usage/config   editable settings and the price table
 *   POST /api/dsh-qols/usage/config   merge settings (validated, persisted)
 *   GET  /api/dsh-qols/usage/log      per-day aggregates
 *
 * `turn` is the number the chat itself uses: the client passes the turn it
 * renders, so the answer is that message's cost and not whatever runs next. The
 * same numbers are in the ledger, so this also answers after a reload.
 *
 * The first status call only may wait for the account service (bounded, 2.5 s),
 * so Today and Balance appear together after a restart; every later call answers
 * from the cache and refreshes in the background.
 */

import { readFileSync } from 'node:fs'

import { PRICES_CURRENCY, applyConfig, publicConfig } from './config.js'
import { dayKey } from './ledger.js'
import { daySchedule, peakPhase } from './peak.js'
import { json, messageOf, query, readJsonBody } from '../util.js'

const STATUS = '/api/dsh-qols/usage/status'
const TURN = '/api/dsh-qols/usage/turn'
const CONFIG = '/api/dsh-qols/usage/config'
const LOG = '/api/dsh-qols/usage/log'

const version = (() => {
  try {
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
    return typeof pkg.version === 'string' ? pkg.version : 'unknown'
  } catch {
    return 'unknown'
  }
})()

function methodGuard(req, res, allowed) {
  if (allowed.includes(req.method)) return true
  res.writeHead(405, { allow: allowed.join(', ') })
  res.end()
  return false
}

export function registerRoutes(ctx, deps) {
  const { config, ledger, meter, balance, persist, log, now } = deps
  const clock = typeof now === 'function' ? now : () => Date.now()
  let firstStatus = true

  const routes = [
    {
      path: STATUS,
      async handler(req, res) {
        if (!methodGuard(req, res, ['GET'])) return
        try {
          const at = clock()
          // The first status call after a restart may wait briefly for the
          // account service, so Today and Balance are painted in the same
          // frame. Later calls read the cache and never block.
          const wallet = firstStatus ? await balance.settled(2_500) : balance.snapshot()
          firstStatus = false
          const phase = peakPhase(at, config.peak)
          const day = daySchedule(at, config.peak)
          const daySpan = Math.max(1, day.endMs - day.startMs)
          json(res, 200, {
            ok: true,
            version,
            generatedAt: new Date(at).toISOString(),
            enabled: config.enabled === true,
            settings: {
              showTokens: config.showTokens === true,
              hideCostMeter: config.hideCostMeter === true,
              showAmounts: config.showAmounts !== false,
              balanceWarnBelow: config.balanceWarnBelow,
            },
            pricesCurrency: PRICES_CURRENCY,
            today: ledger.aggregate(dayKey(at)),
            peak: {
              phase: phase.peak ? 'peak' : 'offpeak',
              weekend: phase.weekend === true,
              holiday: phase.holiday === true,
              percent: phase.percent,
              startAt: new Date(phase.startMs).toISOString(),
              endAt: new Date(phase.endMs).toISOString(),
              untilAt: new Date(phase.untilMs).toISOString(),
              multiplier: phase.multiplier,
              hasWindows: config.peak.windows.length > 0,
              day: {
                startAt: new Date(day.startMs).toISOString(),
                endAt: new Date(day.endMs).toISOString(),
                nowAt: new Date(at).toISOString(),
                percent: Math.min(1, Math.max(0, (at - day.startMs) / daySpan)),
                segments: day.segments.map((segment) => ({
                  startAt: new Date(segment.startMs).toISOString(),
                  endAt: new Date(segment.endMs).toISOString(),
                  peak: segment.peak === true,
                })),
              },
            },
            balance: wallet,
            turn: meter.snapshot(query(req, 'sessionId')),
          })
        } catch (error) {
          log(`[qols-usage] status failed: ${messageOf(error)}`)
          json(res, 500, { ok: false, error: messageOf(error) })
        }
      },
    },
    {
      path: TURN,
      handler(req, res) {
        if (!methodGuard(req, res, ['GET'])) return
        try {
          const session = query(req, 'sessionId')
          const turn = Number(query(req, 'turn'))
          if (typeof session !== 'string' || session === '') {
            json(res, 400, { ok: false, error: 'sessionId is required' })
            return
          }
          if (!Number.isInteger(turn) || turn <= 0) {
            json(res, 400, { ok: false, error: 'turn must be a positive integer' })
            return
          }
          const totals = ledger.turnTotals(session, turn)
          const live = meter.snapshot(session)
          json(res, 200, {
            ok: true,
            ...totals,
            /** True while this very turn is still running. */
            open: live !== null && live.sessionTurn === turn && live.open === true,
          })
        } catch (error) {
          log(`[qols-usage] turn failed: ${messageOf(error)}`)
          json(res, 500, { ok: false, error: messageOf(error) })
        }
      },
    },
    {
      path: CONFIG,
      async handler(req, res) {
        if (!methodGuard(req, res, ['GET', 'POST'])) return
        try {
          if (req.method === 'POST') {
            const body = await readJsonBody(req)
            const rejected = applyConfig(config, body)
            persist()
            json(res, 200, { ok: true, rejected, config: publicConfig(config) })
            return
          }
          json(res, 200, { ok: true, config: publicConfig(config) })
        } catch (error) {
          json(res, 400, { ok: false, error: messageOf(error) })
        }
      },
    },
    {
      path: LOG,
      handler(req, res) {
        if (!methodGuard(req, res, ['GET'])) return
        try {
          const days = Number(query(req, 'days') ?? 7)
          json(res, 200, { ok: true, days: ledger.daily(days) })
        } catch (error) {
          json(res, 500, { ok: false, error: messageOf(error) })
        }
      },
    },
  ]

  for (const route of routes) {
    try {
      ctx.effect(() => ctx.webServer.register({
        kind: 'exact',
        path: route.path,
        handler: route.handler,
      }), `qols: usage ${route.path}`)
    } catch (error) {
      log(`[qols] could not register ${route.path}: ${messageOf(error)}`)
    }
  }
}
