/**
 * Registers the `qols-auto` provider on the llm service and keeps retrying until
 * the registry accepts it.
 *
 * A provider topology can be built asynchronously (adapters register in their
 * own fibers), so the first attempt may legitimately lose a race. Retries are
 * bounded, the timer is disposed with the fiber, and `DUPLICATE_ADAPTER` counts
 * as success: another instance already advertises the same provider.
 */

import { AUTO_PROVIDER, EFFORTS, config as defaultConfig } from './config.js'
import { createAutoAdapter } from './adapters.js'
import { messageOf } from '../util.js'

const MAX_ATTEMPTS = 5
const RETRY_STEP_MS = 1500

function isDuplicateAdapter(error) {
  if (!error) return false
  if (error.code === 'DUPLICATE_ADAPTER') return true
  return /already registered|duplicate (adapter|provider)/i.test(messageOf(error))
}

export function createRegistry({ router, config = defaultConfig, log }) {
  let registered = false
  let attempts = 0
  let lastError
  /** @type {NodeJS.Timeout | undefined} */
  let retryTimer

  function register(llm) {
    if (registered || router === undefined) return
    attempts += 1
    try {
      llm.registerAdapter([AUTO_PROVIDER], createAutoAdapter({ llm, router, config, log }))
      registered = true
      attempts = 0
      lastError = undefined
      log(`[qols-auto] provider ${AUTO_PROVIDER} registered (model ${config.model}, efforts ${EFFORTS.map((e) => e.id).join('/')})`)
    } catch (error) {
      if (isDuplicateAdapter(error)) {
        registered = true
        attempts = 0
        lastError = undefined
        log(`[qols-auto] provider ${AUTO_PROVIDER} is already registered; reusing it`)
        return
      }
      lastError = messageOf(error)
      log(`[qols-auto] registerAdapter attempt ${attempts} failed: ${lastError}`)
      if (attempts < MAX_ATTEMPTS) {
        retryTimer = setTimeout(() => register(llm), RETRY_STEP_MS * attempts)
        retryTimer.unref?.()
      }
    }
  }

  function stats() {
    return { registered, attempts, lastError }
  }

  function dispose() {
    if (retryTimer) clearTimeout(retryTimer)
    retryTimer = undefined
  }

  return { register, stats, dispose }
}
