/**
 * Registration health for every QoL feature.
 *
 * `index.js` registers features inside a try/catch, so a broken feature used to
 * disappear with only a `console.error` (L-006). Here we keep the outcome of
 * every registration plus a cheap, side-effect-free check per feature. The
 * diagnostics route and the settings section read this snapshot.
 *
 * The report is deliberately boring: ids, booleans, short details and a
 * truncated error text. Never tokens, prompts or message contents.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { catalog } from './catalog.js'
import { updateState } from './liked/index.js'
import { dshHome, messageOf, qolsStorage } from './util.js'

/** @type {Map<string, { at: number, error: string | null }>} */
const registrations = new Map()

const MAX_ERROR = 300

function clip(error) {
  return messageOf(error).slice(0, MAX_ERROR)
}

/** Called by `index.js` right after each feature registration attempt. */
export function recordRegistration(id, error) {
  registrations.set(String(id), {
    at: Date.now(),
    error: error === null || error === undefined ? null : clip(error),
  })
}

function checkAuto() {
  const file = qolsStorage('auto/settings.json')
  if (!existsSync(file)) return { ok: true, detail: 'defaults (no saved settings)' }
  try {
    JSON.parse(readFileSync(file, 'utf8'))
    return { ok: true, detail: 'settings saved' }
  } catch {
    return { ok: false, detail: 'settings file is not valid JSON' }
  }
}

function checkCatalog() {
  if (!Array.isArray(catalog) || catalog.length === 0) return { ok: false, detail: 'catalog is empty' }
  for (const entry of catalog) {
    for (const field of ['title', 'description']) {
      for (const locale of ['en', 'ru']) {
        const value = entry?.[field]?.[locale]
        if (typeof value !== 'string' || value.trim() === '') {
          return { ok: false, detail: `${entry?.id ?? '?'} has no ${field}.${locale}` }
        }
      }
    }
  }
  return { ok: true, detail: `${catalog.length} entries, both locales complete` }
}

function checkUsage() {
  const file = qolsStorage('usage/settings.json')
  if (!existsSync(file)) return { ok: true, detail: 'defaults (no saved settings)' }
  try {
    JSON.parse(readFileSync(file, 'utf8'))
    return { ok: true, detail: 'settings saved' }
  } catch {
    return { ok: false, detail: 'settings file is not valid JSON' }
  }
}

const CHECKS = {
  auto: checkAuto,
  catalog: checkCatalog,
  diagnostics: () => ({ ok: true, detail: 'route registered' }),
  usage: checkUsage,
  studio: checkStudio,
  liked: checkLiked,
}

/**
 * The updater needs the host's `subprocess` service; without it the route
 * answers 503. Reporting that in diagnostics is the difference between a
 * feature that works and one that only pretends to.
 */
function checkLiked() {
  return updateState()
}

function checkStudio() {
  const dir = join(dshHome(), 'skills')
  let detail = 'no saved skills yet (the root is created on first save)'
  if (existsSync(dir)) {
    try {
      detail = `${readdirSync(dir).length} entries in the user skills root`
    } catch {
      return { ok: false, detail: 'the user skills root is not readable' }
    }
  }
  const commands = qolsStorage('studio/commands.json')
  if (existsSync(commands)) {
    try {
      const raw = JSON.parse(readFileSync(commands, 'utf8'))
      const list = raw !== null && typeof raw === 'object' && Array.isArray(raw.commands) ? raw.commands : []
      detail = `${detail}; ${list.length} commands`
    } catch {
      return { ok: false, detail: 'the commands file is not valid JSON' }
    }
  }
  const rulesDir = join(dshHome(), 'rules')
  if (existsSync(rulesDir)) {
    try {
      const rules = readdirSync(rulesDir).filter((name) => name.endsWith('.md')).length
      detail = `${detail}; ${rules} rules in the user root`
    } catch {
      return { ok: false, detail: 'the user rules root is not readable' }
    }
  }
  return { ok: true, detail }
}

/**
 * One row per feature, in registration order.
 *
 * @param {{ id: string }[]} features
 * @returns {{ id: string, ok: boolean, state: 'ok' | 'degraded' | 'failed' | 'unregistered',
 *   detail: string, error: string | null }[]}
 */
export function diagnostics(features) {
  const rows = []
  for (const feature of features) {
    const id = String(feature.id)
    const registration = registrations.get(id)
    if (registration === undefined) {
      rows.push({ id, ok: false, state: 'unregistered', detail: 'not registered', error: null })
      continue
    }
    if (registration.error !== null) {
      rows.push({ id, ok: false, state: 'failed', detail: 'registration failed', error: registration.error })
      continue
    }
    let check = { ok: true, detail: 'registered', error: null }
    try {
      const run = CHECKS[id]
      if (run !== undefined) check = { ...run(), error: null }
    } catch (error) {
      check = { ok: false, detail: 'health check failed', error: clip(error) }
    }
    rows.push({
      id,
      ok: check.ok === true,
      state: check.ok === true ? 'ok' : 'degraded',
      detail: check.detail ?? '',
      error: check.error ?? null,
    })
  }
  return rows
}
