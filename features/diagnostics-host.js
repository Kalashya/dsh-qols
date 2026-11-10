/**
 * Serves the health report of every QoL feature to the settings section.
 *
 * The feature list is loaded lazily inside the handler: `features/index.js`
 * imports this module, so a static import back would be a cycle at module
 * evaluation time.
 */

import { readFileSync } from 'node:fs'
import { diagnostics } from './health.js'
import { json, messageOf } from './util.js'

const ROUTE = '/api/dsh-qols/diagnostics'

const version = (() => {
  try {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
    return typeof pkg.version === 'string' ? pkg.version : 'unknown'
  } catch {
    return 'unknown'
  }
})()

async function handler(req, res) {
  if (req.method !== 'GET') {
    res.writeHead(405, { allow: 'GET' })
    res.end()
    return
  }
  try {
    const { features } = await import('./index.js')
    json(res, 200, {
      ok: true,
      version,
      generatedAt: new Date().toISOString(),
      features: diagnostics(features),
    })
  } catch (error) {
    console.error('[qols] diagnostics failed', error)
    json(res, 500, { ok: false, error: messageOf(error) })
  }
}

export const feature = {
  id: 'diagnostics',
  register(ctx) {
    try {
      ctx.effect(() => ctx.webServer.register({
        kind: 'exact',
        path: ROUTE,
        handler,
      }), 'qols: diagnostics')
    } catch (error) {
      console.log(`[qols] could not register ${ROUTE}: ${messageOf(error)}`)
    }
  },
}
