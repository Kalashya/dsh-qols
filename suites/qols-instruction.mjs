// Studio instruction: the global AGENTS.md at the DSH home, read and written in place.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const home = mkdtempSync(join(tmpdir(), 'qols-instruction-home-'))
const project = mkdtempSync(join(tmpdir(), 'qols-instruction-project-'))
mkdirSync(join(project, '.git'))
process.env.DSH_HOME = home
process.chdir(project)

const { feature } = await import('../features/studio/index.js')

const routes = new Map()
const ctx = {
  effect(factory) { factory(); return () => {} },
  inject() { return () => {} },
  webServer: { register(route) { routes.set(route.path, route); return () => {} } },
}
feature.register(ctx)

const route = routes.get('/api/dsh-qols/studio/instruction')
if (route === undefined) throw new Error('instruction route was not registered')
if (route.kind !== 'exact') throw new Error('instruction route must be exact')

async function call(method, { body, url } = {}) {
  const state = { status: 0, headers: null, body: null }
  const res = {
    writeHead(status, headers) { state.status = status; state.headers = headers },
    end(payload) { state.body = payload ?? null },
  }
  const handlers = new Map()
  const req = {
    method,
    url: url ?? '/api/dsh-qols/studio/instruction',
    on(event, handler) {
      const list = handlers.get(event) ?? []
      list.push(handler)
      handlers.set(event, list)
      return req
    },
    destroy() {},
  }
  if (body !== undefined) {
    setImmediate(() => {
      for (const handler of handlers.get('data') ?? []) handler(Buffer.from(body))
      for (const handler of handlers.get('end') ?? []) handler()
    })
  }
  await route.handler(req, res)
  return state
}

async function json(method, options) {
  const result = await call(method, options)
  return { ...result, payload: result.body === null ? null : JSON.parse(result.body) }
}

const file = join(home, 'AGENTS.md')

// --- a fresh home has no file, and that is not an error ----------------------
const empty = await json('GET')
if (empty.status !== 200) throw new Error('GET on a fresh home must be 200, got ' + empty.status)
if (empty.payload.exists !== false) throw new Error('a missing AGENTS.md must be reported as absent')
if (empty.payload.text !== '') throw new Error('absent instructions must have empty text')
if (empty.payload.path !== file) throw new Error('instruction path is wrong: ' + empty.payload.path)
if (empty.payload.max !== 256 * 1024) throw new Error('instruction limit is wrong: ' + empty.payload.max)
if (existsSync(file)) throw new Error('GET must not create the file')

// --- saving writes exactly the text that was sent ---------------------------
const text = '# Global\n\n- Prefer short answers.\n- Never invent numbers.\n'
const saved = await json('POST', { body: JSON.stringify({ text }) })
if (saved.status !== 200 || saved.payload.ok !== true) throw new Error('POST did not save: ' + saved.body)
if (!existsSync(file)) throw new Error('the instruction file was not written')
if (readFileSync(file, 'utf8') !== text) throw new Error('the written file does not match the sent text')
if (saved.payload.bytes !== Buffer.byteLength(text, 'utf8')) throw new Error('reported byte count is wrong')
if (saved.payload.lines !== 5) throw new Error('reported line count is wrong: ' + saved.payload.lines)
if (typeof saved.payload.updatedAt !== 'string') throw new Error('a saved file must report its mtime')
const leftovers = readdirSync(home).filter((name) => name.includes('.tmp-'))
if (leftovers.length !== 0) throw new Error('the atomic write left temporary files: ' + leftovers.join(', '))

// --- a second read sees the new bytes ---------------------------------------
const reread = await json('GET')
if (reread.payload.text !== text) throw new Error('GET did not return the saved text')
if (reread.payload.exists !== true) throw new Error('an existing file must be reported as present')

// --- empty text is a valid instruction file ---------------------------------
const cleared = await json('POST', { body: JSON.stringify({ text: '' }) })
if (cleared.status !== 200 || cleared.payload.bytes !== 0) throw new Error('emptying the file must be allowed')

// --- bad input ---------------------------------------------------------------
const missing = await json('POST', { body: JSON.stringify({ note: 'no text field' }) })
if (missing.status !== 400 || missing.payload.code !== 'INVALID') throw new Error('a body without text must be 400 INVALID')

const oversized = await json('POST', { body: JSON.stringify({ text: 'x'.repeat(257 * 1024) }) })
if (oversized.status !== 400 || oversized.payload.code !== 'INVALID') throw new Error('oversized instructions must be 400 INVALID')
if (readFileSync(file, 'utf8') !== '') throw new Error('a rejected save must not touch the file')

const put = await json('PUT')
if (put.status !== 405 || put.headers.allow !== 'GET, POST') throw new Error('unsupported methods must be 405 with allow')

console.log('QOLS INSTRUCTION TESTS PASSED')
console.log('- a fresh DSH home reports AGENTS.md as absent with empty text')
console.log('- POST writes the exact text through a temporary file and a rename')
console.log('- GET returns the bytes on disk, with byte and line counts')
console.log('- empty text is allowed; a body without text and oversized text are 400 INVALID')
console.log('- PUT is 405 with an allow header')
