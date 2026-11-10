// Studio skills: file format, CRUD route, validation and root isolation.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const home = mkdtempSync(join(tmpdir(), 'qols-studio-home-'))
const project = mkdtempSync(join(tmpdir(), 'qols-studio-project-'))
mkdirSync(join(project, '.git'))
process.env.DSH_HOME = home
process.chdir(project)

const { feature } = await import('../features/studio/index.js')
const { parseSkillFile, serializeSkill } = await import('../features/studio/skills.js')

// --- frontmatter round-trip -------------------------------------------------
const authored = [
  '---',
  'name: "release-notes"',
  'description: "Write release notes"',
  'whenToUse: "Before a tag"',
  'disable-model-invocation: true',
  'metadata:',
  '  owner: qa',
  '---',
  '',
  '# Steps',
  '',
  'Read the changelog.',
].join('\n')

const parsed = parseSkillFile(authored)
if (parsed.data.name !== 'release-notes') throw new Error('name was not parsed')
if (parsed.data.whenToUse !== 'Before a tag') throw new Error('whenToUse was not parsed')
if (parsed.data['disable-model-invocation'] !== true) throw new Error('boolean was not parsed')
if (!parsed.metadataLines.some((line) => line.includes('owner: qa'))) throw new Error('metadata block was lost')
if (!parsed.body.startsWith('# Steps')) throw new Error('body was not split from frontmatter')

const roundTrip = serializeSkill({
  name: 'release-notes',
  description: 'Write release notes',
  whenToUse: 'Before a tag',
  disableModelInvocation: true,
  userInvocable: true,
  body: parsed.body,
  metadataLines: parsed.metadataLines,
  unknown: parsed.unknown,
})
const again = parseSkillFile(roundTrip)
if (again.data.name !== 'release-notes' || again.body !== parsed.body.trim()) throw new Error('round-trip changed the skill')

// --- route ------------------------------------------------------------------
const routes = new Map()
const ctx = {
  effect(factory) { factory(); return () => {} },
  webServer: { register(route) { routes.set(route.path, route); return () => {} } },
}
feature.register(ctx)
const route = routes.get('/api/dsh-qols/studio/skills')
if (route === undefined) throw new Error('studio route was not registered')
if (route.kind !== 'exact') throw new Error('studio route must be exact')

async function call(method, { body, url } = {}) {
  const state = { status: 0, headers: null, body: null }
  const res = {
    writeHead(status, headers) { state.status = status; state.headers = headers },
    end(payload) { state.body = payload ?? null },
  }
  const handlers = new Map()
  const req = {
    method,
    url: url ?? '/api/dsh-qols/studio/skills',
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
if (empty.payload.roots.length !== 4) throw new Error('GET must describe all four DSH skill roots')
const projectRoot = empty.payload.roots.find((root) => root.id === 'project')
if (projectRoot === undefined || projectRoot.available !== true) throw new Error('project root must be available inside a git repo')
if (!projectRoot.dir.endsWith(join('.dsh', 'skills'))) throw new Error('project root path is wrong: ' + projectRoot.dir)
if (projectRoot.writable !== true) throw new Error('project root must be writable')
const projectAgents = empty.payload.roots.find((root) => root.id === 'project-agents')
if (projectAgents === undefined || projectAgents.available !== true) throw new Error('the project .agents/skills root must be listed')
if (projectAgents.writable !== false) throw new Error('.agents roots must be read-only')
if (!projectAgents.dir.endsWith(join('.agents', 'skills'))) throw new Error('project .agents path is wrong: ' + projectAgents.dir)
const userAgents = empty.payload.roots.find((root) => root.id === 'user-agents')
if (userAgents === undefined || userAgents.writable !== false) throw new Error('the user .agents/skills root must be listed read-only')

// --- workspace detection ----------------------------------------------------
// DSH encodes the workspace path into the session directory name; the newest
// session, not the host's cwd, decides where the project root is.
const { decodeWorkspaceName, projectRootOf, studioRoots, workspaceCwd } = await import('../features/studio/roots.js')
const encoded = '--' + project.replace(/[:\\/]/g, '-') + '--'
if (decodeWorkspaceName(encoded) !== project) {
  throw new Error('session name decoding must rebuild a path whose segments contain dashes')
}
// DSH escapes characters that are unsafe in a path component as ~XXXX; a
// workspace path with a space must round-trip too (the folder is `DSH plugins`).
const spaced = mkdtempSync(join(tmpdir(), 'qols studio space '))
const encodeWorkspace = (path) => {
  let readable = ''
  let separatorRun = false
  for (const ch of path) {
    if (ch === '/' || ch === '\\' || ch === ':') {
      if (!separatorRun) readable += '-'
      separatorRun = true
    } else if (ch !== '~' && /^[A-Za-z0-9._-]$/.test(ch)) {
      readable += ch
      separatorRun = false
    } else {
      readable += '~' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')
      separatorRun = false
    }
  }
  return `--${readable.replace(/^-+/, '') || 'root'}--`
}
if (decodeWorkspaceName(encodeWorkspace(spaced)) !== spaced) {
  throw new Error('session name decoding must unescape ~XXXX (space)')
}
// DSH's findProjectRoot returns cwd when no ancestor has .git; Studio must not
// hide project roots in a workspace that is not a git repository yet.
const noGit = mkdtempSync(join(tmpdir(), 'qols-no-git-'))
if (projectRootOf(noGit) !== noGit) throw new Error('projectRootOf must fall back to cwd without .git')
const noGitRoots = studioRoots(noGit)
if (noGitRoots.project?.dir !== join(noGit, '.dsh', 'skills')) {
  throw new Error('project root must exist without .git: ' + JSON.stringify(noGitRoots.project))
}
mkdirSync(join(home, 'sessions', encoded), { recursive: true })
process.chdir(tmpdir())
if (workspaceCwd() !== project) throw new Error('the newest session must win over process.cwd()')
process.chdir(project)

// Create in the project root.
const created = await json('POST', {
  body: JSON.stringify({
    source: 'project',
    name: 'release-notes',
    description: 'Write release notes',
    whenToUse: 'Before a tag',
    body: '# Steps\n\nRead the changelog.',
  }),
})
if (created.status !== 200 || created.payload.ok !== true) throw new Error('POST did not create the skill: ' + created.body)
const file = join(projectRoot.dir, 'release-notes', 'SKILL.md')
if (!existsSync(file)) throw new Error('SKILL.md was not written')
const text = readFileSync(file, 'utf8')
if (!text.includes('name: "release-notes"')) throw new Error('frontmatter name is missing')
if (!text.includes('whenToUse: "Before a tag"')) throw new Error('whenToUse is missing')

const listed = await json('GET')
const skill = listed.payload.skills.find((row) => row.name === 'release-notes')
if (skill === undefined) throw new Error('created skill is not listed')
if (skill.valid !== true || skill.source !== 'project') throw new Error('created skill is not valid/project')
if (skill.body !== '# Steps\n\nRead the changelog.') throw new Error('body was not listed')

// Update in place, keeping metadata authored by another tool.
writeFileSync(file, authored.replace('name: "release-notes"', 'name: "release-notes"'))
const updated = await json('POST', {
  body: JSON.stringify({
    source: 'project',
    name: 'release-notes',
    description: 'Write better release notes',
    body: '# Steps\n\nRead the changelog twice.',
    metadataLines: ['metadata:', '  owner: qa'],
  }),
})
if (updated.status !== 200) throw new Error('update failed: ' + updated.body)
const afterUpdate = readFileSync(file, 'utf8')
if (!afterUpdate.includes('Write better release notes')) throw new Error('description was not updated')
if (!afterUpdate.includes('owner: qa')) throw new Error('metadata block was dropped on update')
if (!afterUpdate.includes('Read the changelog twice.')) throw new Error('body was not updated')

// Invocation flags survive a save and come back in the listing.
const flagged = await json('POST', {
  body: JSON.stringify({
    source: 'project',
    name: 'quiet-skill',
    description: 'Only when asked',
    body: 'Quiet.',
    disableModelInvocation: true,
    userInvocable: false,
  }),
})
if (flagged.status !== 200) throw new Error('flagged save failed: ' + flagged.body)
const flaggedText = readFileSync(join(projectRoot.dir, 'quiet-skill', 'SKILL.md'), 'utf8')
if (!flaggedText.includes('disable-model-invocation: true')) throw new Error('disable-model-invocation was not written')
if (!flaggedText.includes('user-invocable: false')) throw new Error('user-invocable was not written')
const flaggedRow = (await json('GET')).payload.skills.find((row) => row.name === 'quiet-skill')
if (flaggedRow.disableModelInvocation !== true || flaggedRow.userInvocable !== false) {
  throw new Error('flags are missing from the listing')
}
if (flaggedRow.writable !== true) throw new Error('project skills must be listed writable')

// The .agents roots are read-only: a direct save is rejected, not silently redirected.
const readOnlySave = await json('POST', {
  body: JSON.stringify({ source: 'project-agents', name: 'nope', description: 'x', body: 'y' }),
})
if (readOnlySave.status !== 400 || readOnlySave.payload.code !== 'INVALID') {
  throw new Error('a read-only root must reject writes with 400 INVALID')
}

// Validation: bad name, wrong source, missing description.
const badName = await json('POST', { body: JSON.stringify({ source: 'project', name: '../evil', description: 'x', body: '' }) })
if (badName.status !== 400 || badName.payload.code !== 'INVALID') throw new Error('bad name must be 400 INVALID')
const badSource = await json('POST', { body: JSON.stringify({ source: 'ghost', name: 'ok', description: 'x', body: '' }) })
if (badSource.status !== 400 || badSource.payload.code !== 'INVALID') throw new Error('bad source must be 400 INVALID')
const noDescription = await json('POST', { body: JSON.stringify({ source: 'project', name: 'no-desc', description: '', body: '' }) })
if (noDescription.status !== 400) throw new Error('empty description must be rejected')

// The user root is always writable.
const user = await json('POST', {
  body: JSON.stringify({ source: 'user', name: 'global-helper', description: 'Global helper', body: 'Do the thing.' }),
})
if (user.status !== 200) throw new Error('user-root save failed: ' + user.body)
if (!existsSync(join(home, 'skills', 'global-helper', 'SKILL.md'))) throw new Error('user-root file is missing')

// Delete: project bundle, then a second delete is 404, and a traversal is 400.
const removed = await json('DELETE', { url: '/api/dsh-qols/studio/skills?source=project&name=release-notes' })
if (removed.status !== 200 || removed.payload.ok !== true) throw new Error('delete failed: ' + removed.body)
if (existsSync(join(projectRoot.dir, 'release-notes'))) throw new Error('bundle directory survived the delete')
const removedAgain = await json('DELETE', { url: '/api/dsh-qols/studio/skills?source=project&name=release-notes' })
if (removedAgain.status !== 404 || removedAgain.payload.code !== 'NOT_FOUND') throw new Error('second delete must be 404')
const traversal = await json('DELETE', { url: '/api/dsh-qols/studio/skills?source=project&name=../evil' })
if (traversal.status !== 400) throw new Error('traversal delete must be 400')

const rejected = await call('PUT')
if (rejected.status !== 405 || !String(rejected.headers.allow).includes('DELETE')) throw new Error('PUT must be 405 with allow')

// Paths reported to the client never leave one of the four roots.
const knownRoots = (await json('GET')).payload.roots.map((root) => root.dir).filter((dir) => typeof dir === 'string')
for (const row of (await json('GET')).payload.skills) {
  if (!knownRoots.some((dir) => row.path.startsWith(dir))) {
    throw new Error('skill path escapes the roots: ' + row.path)
  }
}

console.log('QOLS STUDIO TESTS PASSED')
console.log('- frontmatter parses, keeps metadata and round-trips')
console.log('- GET lists all four roots; POST creates, updates and validates; DELETE removes')
console.log('- invocation flags round-trip; .agents roots stay read-only')
console.log('- the user root is writable and traversal stays inside a root')
