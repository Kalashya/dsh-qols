// Studio rules: file format, prompt section, CRUD route and root isolation.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const home = mkdtempSync(join(tmpdir(), 'qols-rules-home-'))
const project = mkdtempSync(join(tmpdir(), 'qols-rules-project-'))
mkdirSync(join(project, '.git'))
process.env.DSH_HOME = home
process.chdir(project)

// One enabled and one disabled rule on disk before the plugin registers, so the
// host can snapshot the enabled ones into a prompt section.
const projectRules = join(project, '.dsh', 'rules')
mkdirSync(projectRules, { recursive: true })
writeFileSync(join(projectRules, 'style.md'), [
  '---',
  'name: "style"',
  'description: "House style"',
  '---',
  '',
  'Prefer short sentences.',
].join('\n'), 'utf8')
writeFileSync(join(projectRules, 'legacy.md'), [
  '---',
  'name: "legacy"',
  'description: "Old rule"',
  'enabled: false',
  '---',
  '',
  'This must not reach the model.',
].join('\n'), 'utf8')

const { feature } = await import('../features/studio/index.js')
const { parseRuleFile, serializeRule, validateRule } = await import('../features/studio/rules.js')

// --- frontmatter round-trip -------------------------------------------------
const parsed = parseRuleFile([
  '---',
  'name: "style"',
  'description: "House style"',
  'enabled: false',
  '---',
  '',
  'Prefer short sentences.',
].join('\n'))
if (parsed.data.name !== 'style') throw new Error('name was not parsed')
if (parsed.data.enabled !== false) throw new Error('enabled: false was not parsed')
if (parsed.body !== 'Prefer short sentences.') throw new Error('body was not split from frontmatter')
const serialized = serializeRule({ name: 'style', description: 'House style', enabled: false, body: 'Prefer short sentences.' })
if (!serialized.includes('enabled: false')) throw new Error('disabled flag was not serialized')
const missing = parseRuleFile('No frontmatter here')
if (missing.error !== 'missing frontmatter') throw new Error('a body-only file must be reported as missing frontmatter')
const invalid = validateRule({ name: 'Bad Name', description: '', body: '' })
if (invalid.errors.length < 3) throw new Error('invalid rule must report name, description and body')

// --- route and prompt section ----------------------------------------------
const routes = new Map()
const sections = []
const ctx = {
  effect(factory) { factory(); return () => {} },
  inject(names, callback) {
    if (!names.includes('systemPrompt')) return () => {}
    callback({
      effect(factory) { factory(); return () => {} },
      systemPrompt: { section(definition) { sections.push(definition); return () => {} } },
    })
    return () => {}
  },
  webServer: { register(route) { routes.set(route.path, route); return () => {} } },
}
feature.register(ctx)

const section = sections.find((entry) => entry.name === 'qols:rules')
if (section === undefined) throw new Error('rules section was not mounted into the system prompt')
if (section.order !== 9000) throw new Error('rules section order is wrong: ' + section.order)
if (!section.text.includes('Prefer short sentences.')) throw new Error('enabled rule text is missing from the prompt')
if (section.text.includes('This must not reach the model.')) throw new Error('disabled rule leaked into the prompt')

const route = routes.get('/api/dsh-qols/studio/rules')
if (route === undefined) throw new Error('rules route was not registered')
if (route.kind !== 'exact') throw new Error('rules route must be exact')

async function call(method, { body, url } = {}) {
  const state = { status: 0, headers: null, body: null }
  const res = {
    writeHead(status, headers) { state.status = status; state.headers = headers },
    end(payload) { state.body = payload ?? null },
  }
  const handlers = new Map()
  const req = {
    method,
    url: url ?? '/api/dsh-qols/studio/rules',
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

const empty = await json('GET')
if (empty.status !== 200) throw new Error('GET status ' + empty.status)
if (empty.payload.roots.length !== 2) throw new Error('GET must describe both roots')
const projectRoot = empty.payload.roots.find((root) => root.id === 'project')
if (projectRoot.available !== true) throw new Error('project root must be available inside a git repo')
if (!projectRoot.dir.endsWith(join('.dsh', 'rules'))) throw new Error('project rules path is wrong: ' + projectRoot.dir)
if (empty.payload.rules.length !== 2) throw new Error('both rule files must be listed')
if (empty.payload.preview.includes('This must not reach the model.')) throw new Error('preview leaked a disabled rule')
if (empty.payload.section.applied !== true) throw new Error('section must be reported as applied')

// Create in the user root.
const created = await json('POST', {
  body: JSON.stringify({
    source: 'user',
    name: 'answer-short',
    description: 'Keep answers short',
    enabled: true,
    body: 'Answer in three sentences.',
  }),
})
if (created.status !== 200 || created.payload.ok !== true) throw new Error('POST did not create the rule: ' + created.body)
const userFile = join(home, 'rules', 'answer-short.md')
if (!existsSync(userFile)) throw new Error('the rule file was not written')
const text = readFileSync(userFile, 'utf8')
if (!text.includes('name: "answer-short"') || !text.includes('Answer in three sentences.')) throw new Error('the written rule is incomplete')
if (sections.length !== 1) throw new Error('saving a rule must not re-register the prompt section')

const listed = await json('GET')
if (listed.payload.rules.length !== 3) throw new Error('the saved rule must be listed')
if (!listed.payload.preview.includes('Answer in three sentences.')) throw new Error('the preview must include the saved rule')
if (listed.payload.section.mountedBytes !== empty.payload.section.mountedBytes) {
  throw new Error('saving a rule must not change what the running host mounted')
}

const bad = await json('POST', { body: JSON.stringify({ source: 'user', name: 'Bad Name', description: 'x', body: 'y' }) })
if (bad.status !== 400 || bad.payload.code !== 'INVALID') throw new Error('invalid name must be 400 INVALID')

const missingDelete = await json('DELETE', { url: '/api/dsh-qols/studio/rules?source=user&name=absent' })
if (missingDelete.status !== 404) throw new Error('deleting a missing rule must be 404')

const traversal = await json('DELETE', { url: '/api/dsh-qols/studio/rules?source=user&name=..%2Fevil' })
if (traversal.status !== 400) throw new Error('a traversal name must be 400')

const removed = await json('DELETE', { url: '/api/dsh-qols/studio/rules?source=user&name=answer-short' })
if (removed.status !== 200 || existsSync(userFile)) throw new Error('DELETE did not remove the rule file')

const put = await json('PUT')
if (put.status !== 405 || put.headers.allow !== 'GET, POST, DELETE') throw new Error('unsupported methods must be 405 with allow')

console.log('QOLS RULES TESTS PASSED')
console.log('- frontmatter round-trip keeps name, description, enabled and body')
console.log('- enabled rules are mounted as the qols:rules prompt section; disabled ones are not')
console.log('- GET lists both roots, rules and the exact prompt preview')
console.log('- POST creates in the user root; saving does not re-register the section')
console.log('- invalid names, missing deletes, traversal and PUT are rejected')
