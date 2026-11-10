/**
 * Serves the feature catalog to the client.
 *
 * client.js is evaluated as a classic script and cannot import catalog.js, so
 * the catalog used to exist twice and drifted. Now the host serves it, and the
 * client fetches it: one source of truth in features/catalog.js.
 */

import { catalog } from './catalog.js'
import { json, messageOf } from './util.js'

const ROUTE = '/api/dsh-qols/catalog'

export const feature = {
  id: 'catalog',
  register(ctx) {
    try {
      ctx.effect(() => ctx.webServer.register({
        kind: 'exact',
        path: ROUTE,
        handler: (req, res) => {
          if (req.method !== 'GET') {
            res.writeHead(405, { allow: 'GET' })
            res.end()
            return
          }
          json(res, 200, { ok: true, entries: catalog })
        },
      }), 'qols: catalog')
    } catch (error) {
      console.log(`[qols] could not register ${ROUTE}: ${messageOf(error)}`)
    }
  },
}
