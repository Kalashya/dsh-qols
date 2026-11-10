// Studio agents: preset listing, composition view, patch snippet and profile detection.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const home = mkdtempSync(join(tmpdir(), 'qols-agents-home-'))
const profileDir = join(home, 'profiles', 'desktop')
mkdirSync(profileDir, { recursive: true })
writeFileSync(join(profileDir, 'package.json'), JSON.stringify({
  name: 'qols-test-profile',
  dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', 'dsh-qols'] } },
}, null, 2), 'utf8')
const patchText = '# sentinel: the studio must never rewrite this file\n[]\n'
const patchFile = join(profileDir, 'cordis.patch.yml')
writeFileSync(patchFile, patchText, 'utf8')
process.env.DSH_HOME = home

const { feature } = await import('../features/studio/index.js')
const { buildPresetSnippet, profileInfo } = await import('../features/studio/agents.js')

// --- snippet builder --------------------------------------------------------
const built = buildPresetSnippet({
  id: 'my-preset',
  name: "Bob's preset",
  description: 'Review work',
  order: 7,
  plugins: ['@deepseek-ai/dsh-tool-web', '@deepseek-ai/dsh-persona'],
  makeDefault: true,
})
if (!built.snippet.includes('- insert:')) throw new Error('the snippet must insert a row')
if (!built.snippet.includes('id: preset-my-preset')) throw new Error('the row id must derive from the preset id')
if (!built.snippet.includes("name: '@deepseek-ai/dsh-agent-preset'")) throw new Error('the row must name the preset plugin')
if (!built.snippet.includes("id: 'my-preset'")) throw new Error('the preset id must be quoted in config')
if (!built.snippet.includes("name: 'Bob''s preset'")) throw new Error('single quotes must be doubled in YAML')
if (!built.snippet.includes('order: 7')) throw new Error('order must be emitted as a number')
if (!built.snippet.includes("default: 'my-preset'")) throw new Error('makeDefault must patch the registry default')
if (!built.snippet.includes("- name: '@deepseek-ai/dsh-persona'")) throw new Error('every plugin must appear once')

// A preset without makeDefault must not touch the registry.
const minimal = buildPresetSnippet({ id: 'solo', plugins: ['@deepseek-ai/dsh-tool-web'] })
if (minimal.snippet.includes('agent-preset-registry')) throw new Error('minimal snippet must not patch the registry')

function expectInvalid(input, needle) {
  try {
    buildPresetSnippet(input)
  } catch (error) {
    if (error.code !== 'INVALID' || !Array.isArray(error.problems)) throw new Error('invalid input must carry code INVALID and problems')
    if (!error.problems.some((problem) => problem.includes(needle))) throw new Error(`expected a problem about ${needle}, got: ${error.problems.join('; ')}`)
    return
  }
  throw new Error('invalid input was accepted')
}
expectInvalid({ id: 'Bad Name', plugins: ['x'] }, 'kebab-case')
expectInvalid({ id: 'ok', plugins: [] }, 'at least one plugin')
expectInvalid({ id: 'ok', plugins: ['not a package!'] }, 'not a plugin package name')
expectInvalid({ id: 'ok', plugins: ['x'], order: 1001 }, 'order must be an integer')

// --- profile detection ------------------------------------------------------
const profile = profileInfo()
if (profile.active !== 'desktop') throw new Error('the profile carrying dsh-qols must be detected: ' + JSON.stringify(profile))
if (profile.patchFile !== patchFile) throw new Error('the patch file path is wrong: ' + profile.patchFile)
if (profile.patchExists !== true) throw new Error('the patch file must be reported as existing')

// --- route ------------------------------------------------------------------
const routes = new Map()
const presetRows = [
  { id: 'standard', name: 'Standard', description: 'Built-in default', order: 1 },
  { id: 'broken-one', description: 'Bad row', broken: 'plugin xyz is not installed' },
]
const registry = {
  get defaultId() { return 'standard' },
  async list() { return presetRows },
  async readDocument(id) {
    if (id === 'standard') {
      return { agentPreset: 'standard', name: 'Standard', description: 'Built-in default', content: "- id: persona\n  name: '@deepseek-ai/dsh-persona'\n" }
    }
    const error = new Error('agent preset not found')
    error.code = 'agent-preset/not-found'
    throw error
  },
}
const ctx = {
  effect(factory) { factory(); return () => {} },
  inject() { return () => {} },
  get(name) { return name === 'agentPresets' ? registry : undefined },
  webServer: { register(route) { routes.set(route.path, route); return () => {} } },
}
feature.register(ctx)

const route = routes.get('/api/dsh-qols/studio/agents')
if (route === undefined) throw new Error('the agents route was not registered')
if (route.kind !== 'exact') throw new Error('the agents route must be exact')

async function call(method, { body, url } = {}) {
  const state = { status: 0, headers: null, body: null }
  const res = {
    writeHead(status, headers) { state.status = status; state.headers = headers },
    end(payload) { state.body = payload ?? null },
  }
  const handlers = new Map()
  const req = {
    method,
    url: url ?? '/api/dsh-qols/studio/agents',
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

const list = await json('GET')
if (list.status !== 200) throw new Error('GET status ' + list.status)
if (list.payload.available !== true) throw new Error('the preset service must be reported as available')
if (list.payload.defaultId !== 'standard') throw new Error('the default preset must be reported')
if (list.payload.presets.length !== 2) throw new Error('both presets must be listed')
const standard = list.payload.presets.find((row) => row.id === 'standard')
const broken = list.payload.presets.find((row) => row.id === 'broken-one')
if (standard.isDefault !== true) throw new Error('the default preset must be flagged')
if (broken.isDefault !== false) throw new Error('a non-default preset must not be flagged')
if (!broken.broken.includes('xyz')) throw new Error('the loading diagnostic must be passed through')
if (list.payload.patch.active !== 'desktop') throw new Error('the payload must name the active profile')

const document = await json('GET', { url: '/api/dsh-qols/studio/agents?preset=standard' })
if (document.status !== 200) throw new Error('composition GET status ' + document.status)
if (!document.payload.preset.content.includes('persona')) throw new Error('the composition YAML must be returned')

const absent = await json('GET', { url: '/api/dsh-qols/studio/agents?preset=absent' })
if (absent.status !== 404) throw new Error('an unknown preset must be 404, got ' + absent.status)

const made = await json('POST', {
  body: JSON.stringify({ id: 'reviewer', name: 'Reviewer', plugins: ['@deepseek-ai/dsh-tool-web'] }),
})
if (made.status !== 200 || made.payload.ok !== true) throw new Error('POST did not build the entry: ' + made.body)
if (!made.payload.snippet.includes("id: 'reviewer'")) throw new Error('the built entry is missing the preset id')

const rejected = await json('POST', { body: JSON.stringify({ id: 'Bad Name', plugins: [] }) })
if (rejected.status !== 400 || rejected.payload.code !== 'INVALID') throw new Error('invalid input must be 400 INVALID')
if (!Array.isArray(rejected.payload.problems) || rejected.payload.problems.length < 2) throw new Error('the 400 body must list every problem')

const put = await json('PUT')
if (put.status !== 405 || put.headers.allow !== 'GET, POST') throw new Error('unsupported methods must be 405 with allow')

// The studio generates text; it must not touch the profile patch.
if (readFileSync(patchFile, 'utf8') !== patchText) throw new Error('the profile patch was modified')

console.log('QOLS AGENTS TESTS PASSED')
console.log('- presets, default flag and loading diagnostics come from the harness registry')
console.log('- the snippet quotes YAML, validates ids and package names, and can set the default')
console.log('- the profile that carries dsh-qols is detected without asking the host')
console.log('- GET returns one composition; unknown presets are 404')
console.log('- POST validates into 400 with problems; PUT is 405; the profile is never written')
