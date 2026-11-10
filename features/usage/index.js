/**
 * Usage feature wiring: persisted settings, the live meter, the wallet cache and
 * the three exact routes.
 *
 * Settings live in `<DSH_HOME>/storages/qols/usage/settings.json`; the ledger in
 * `ledger.jsonl` next to it. The client polls `/usage/status`; the meter records
 * every model call through the `llm/stream` waterfall.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { PRICES_CURRENCY, SETTINGS_VERSION, applyConfig, normalizeConfig, publicConfig } from './config.js'
import { UsageLedger } from './ledger.js'
import { UsageMeter } from './meter.js'
import { BalanceCache } from './balance.js'
import { registerRoutes } from './routes.js'
import { dshHome, messageOf, readOwnJson } from '../util.js'

export const feature = {
  id: 'usage',
  register(ctx) {
    const dir = join(dshHome(), 'storages', 'qols', 'usage')
    const settingsFile = join(dir, 'settings.json')
    const log = (message) => console.log(message)

    const loaded = loadConfig(settingsFile, log)
    const config = loaded.config
    const ledger = new UsageLedger({ dir, currency: PRICES_CURRENCY, log })
    const meter = new UsageMeter({ config, ledger, log })
    const balance = new BalanceCache({
      getAccount: () => (typeof ctx.get === 'function' ? ctx.get('deepseekAccount') : undefined),
      log,
    })

    const persist = () => {
      try {
        mkdirSync(dir, { recursive: true })
        writeFileSync(settingsFile, `${JSON.stringify(publicConfig(config), null, 2)}\n`, 'utf8')
      } catch (error) {
        log(`[qols-usage] could not write ${settingsFile}: ${messageOf(error)}`)
      }
    }

    // v1 priced calls in CNY; keeping that ledger would add yuan to dollar
    // totals. Move it aside once and start the USD ledger from an empty file.
    if (loaded.storedVersion !== 0 && loaded.storedVersion !== SETTINGS_VERSION) {
      archiveLedger(dir, loaded.storedVersion, log)
      persist()
    }

    try {
      const dispose = meter.attach(ctx)
      ctx.effect(() => () => dispose(), 'qols: usage meter')
    } catch (error) {
      log(`[qols-usage] could not attach the meter: ${messageOf(error)}`)
    }

    // The account service may appear after this plugin (login state, profile
    // switch); refresh lazily from the route instead of caching the reference.
    void balance.refresh()

    registerRoutes(ctx, { config, ledger, meter, balance, persist, log })
  },
}

function loadConfig(file, log) {
  if (!existsSync(file)) return { config: normalizeConfig(undefined), storedVersion: 0 }
  const raw = readOwnJson(file, null, log)
  if (raw === null) return { config: normalizeConfig(undefined), storedVersion: 0 }
  const storedVersion = Number(raw !== null && typeof raw === 'object' ? raw.version : 0) || 0
  return { config: normalizeConfig(raw), storedVersion }
}

/** Keep the yuan-era ledger on disk, but out of the dollar totals. */
function archiveLedger(dir, version, log) {
  const from = join(dir, 'ledger.jsonl')
  const to = join(dir, `ledger-v${version}.jsonl`)
  if (!existsSync(from) || existsSync(to)) return
  try {
    renameSync(from, to)
    log(`[qols-usage] archived the v${version} ledger to ${to}`)
  } catch (error) {
    log(`[qols-usage] could not archive ${from}: ${messageOf(error)}`)
  }
}

/** Exposed for tests: the same merge the POST route uses. */
export { applyConfig }
