/**
 * Shared host helpers for QoL features.
 *
 * `messageOf` / `json` / `readJsonBody` / `query` used to live in several host
 * modules with slightly different contracts. Now there is one implementation,
 * and every feature imports it.
 */

import { readFileSync, renameSync } from 'node:fs'
import { basename, join } from 'node:path'
import { homedir } from 'node:os'

export function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Reads one of the plugin's own JSON files.
 *
 * A file the plugin cannot parse must not crash a feature, and it must not be
 * silently replaced by defaults either: the next save would destroy the bytes
 * the user may still want. So the corrupt file is moved aside as
 * `<name>.corrupt-<timestamp>` and the caller continues from `fallback`.
 */
export function readOwnJson(file, fallback = null, log = () => {}) {
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback
    throw error
  }
  try {
    return JSON.parse(text)
  } catch (error) {
    const quarantine = `${file}.corrupt-${Date.now()}`
    try {
      renameSync(file, quarantine)
      log(`[qols] ${basename(file)} is not valid JSON; moved to ${basename(quarantine)} (${messageOf(error)})`)
    } catch (renameError) {
      log(`[qols] ${basename(file)} is not valid JSON and could not be moved aside: ${messageOf(renameError)}`)
    }
    return fallback
  }
}

/** JSON response with no-store caching and an exact content length. */
export function json(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

/** Bounded JSON body reader. Rejects on oversized or malformed input. */
export function readJsonBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('request body is too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new Error('request body is not valid JSON'))
      }
    })
    req.on('error', reject)
  })
}

/** One query parameter from a request URL, without throwing on odd input. */
export function query(req, key) {
  try {
    return new URL(req.url ?? '/', 'http://qols.local').searchParams.get(key) ?? undefined
  } catch {
    return undefined
  }
}

/** DSH home directory: the profile root, or ~/.dsh when the harness is absent. */
export function dshHome() {
  const env = process.env.DSH_HOME
  if (typeof env === 'string' && env.trim() !== '') return env
  return join(homedir(), '.dsh')
}

/** `storages/qols/<name>` under the DSH home. */
export function qolsStorage(name) {
  return join(dshHome(), 'storages', 'qols', name)
}
