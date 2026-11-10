/**
 * Studio: the extensions QoLs writes for DSH — `SKILL.md` bundles, slash
 * commands and always-apply rules.
 *
 * Five exact routes carry the surface:
 * - `/studio/skills` — `GET` lists both roots and every skill with its body,
 *   `POST` creates or updates one, `DELETE` removes one;
 * - `/studio/commands` — `GET` lists the stored commands and their registration
 *   state, `POST` creates or updates one, `DELETE` removes one;
 * - `/studio/rules` — `GET` lists rule files plus the exact prompt text they
 *   produce, `POST` creates or updates one, `DELETE` removes one;
 * - `/studio/agents` — `GET` lists the agent presets DSH composed (and, with
 *   `?preset=<id>`, one preset's YAML composition), `POST` turns a form into a
 *   paste-ready profile patch entry. It never writes the profile;
 * - `/studio/instruction` — `GET` reads the global `AGENTS.md` at the DSH home,
 *   `POST` replaces it. That file is the one every session loads first, so it is
 *   edited in place rather than copied.
 *
 * The client never guesses a path: it sends the root id and the kebab-case name,
 * and the host resolves them under its own roots. A stored command is turned
 * into a real `ctx.commands` registration, so it appears in the composer's slash
 * list without a restart.
 *
 * Rules differ from commands: the system prompt is assembled from a section
 * registered at plugin load, so a saved rule reaches the model in a new session
 * (or after a DSH restart). The route reports the registered text and the panel
 * states that boundary.
 *
 * Failures are typed: `INVALID` (400), `NOT_FOUND` (404), `NO_ROOT` (409) — the
 * panel can show the reason without parsing English text.
 */

import { existsSync, readFileSync } from 'node:fs'
import { config as autoConfig } from '../auto/config.js'
import { ROOT_IDS, describeRoot, studioRoots } from './roots.js'
import { deleteSkill, listSkills, writeSkill } from './skills.js'
import { CommandStore } from './commands.js'
import { createCommandRuntime } from './command-runtime.js'
import { agentsSnapshot, buildPresetSnippet, presetDocument } from './agents.js'
import {
  RULES_ORDER,
  RULES_SECTION,
  deleteRule,
  listRules,
  renderRules,
  rulesRoots,
  writeRule,
} from './rules.js'
import { json, messageOf, qolsStorage, query, readJsonBody } from '../util.js'
import { MAX_INSTRUCTION, readInstruction, writeInstruction } from './instruction.js'

const SKILLS_ROUTE = '/api/dsh-qols/studio/skills'
const COMMANDS_ROUTE = '/api/dsh-qols/studio/commands'
const RULES_ROUTE = '/api/dsh-qols/studio/rules'
const AGENTS_ROUTE = '/api/dsh-qols/studio/agents'
const INSTRUCTION_ROUTE = '/api/dsh-qols/studio/instruction'
const METHODS = 'GET, POST, DELETE'
const INSTRUCTION_METHODS = 'GET, POST'
const SHORT = 2000

// Bytes currently mounted into the running host's system prompt. Rules are
// read once at plugin load, so this is not the same as the preview of the
// files on disk: after saving a rule the preview changes while the mounted
// section stays as it was until the next DSH start.
let mountedBytes = 0

const version = (() => {
  try {
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
    return typeof pkg.version === 'string' ? pkg.version : 'unknown'
  } catch {
    return 'unknown'
  }
})()

function log(message) {
  console.log(message)
}

function commandsDir() {
  return qolsStorage('studio')
}

/** Every root plus every skill, as one JSON snapshot. */
function skillsSnapshot() {
  const roots = studioRoots()
  const skills = listSkills(roots, log)
  /** @type {Record<string, number>} */
  const counts = {}
  for (const skill of skills) {
    counts[skill.source] = (counts[skill.source] ?? 0) + 1
  }
  return {
    ok: true,
    version,
    generatedAt: new Date().toISOString(),
    roots: ROOT_IDS.map((id) => {
      const root = roots[id]
      if (root === undefined) {
        return { id, dir: null, exists: false, skills: 0, available: false, writable: false, projectDir: null }
      }
      return { ...describeRoot(root, counts[id] ?? 0), available: true }
    }),
    skills,
  }
}

function statusOf(error) {
  const code = typeof error?.code === 'string' ? error.code : ''
  if (code === 'INVALID') return 400
  if (code === 'NOT_FOUND' || code === 'ENOENT') return 404
  if (code.endsWith('not-found')) return 404
  if (code === 'NO_ROOT' || code === 'NO_SERVICE' || code === 'EEXIST' || code === 'ENOTDIR') return 409
  const text = messageOf(error)
  if (text.includes('request body is not valid JSON') || text.includes('request body is too large')) return 400
  return 500
}

function fail(res, error) {
  const code = typeof error?.code === 'string' ? error.code : 'FAILED'
  const text = messageOf(error).slice(0, SHORT)
  if (statusOf(error) === 500) log(`[qols] studio failed: ${text}`)
  const payload = { ok: false, code, error: text }
  if (Array.isArray(error?.problems)) payload.problems = error.problems.slice(0, 10)
  json(res, statusOf(error), payload)
}

function skillsHandler(req, res) {
  return handle(req, res, async () => {
    if (req.method === 'GET') {
      json(res, 200, skillsSnapshot())
      return
    }
    if (req.method === 'POST') {
      const body = await readJsonBody(req)
      const saved = writeSkill(studioRoots(), body, log)
      json(res, 200, { ok: true, skill: saved })
      return
    }
    if (req.method === 'DELETE') {
      const source = query(req, 'source')
      const name = query(req, 'name')
      const removed = deleteSkill(studioRoots(), source, name, log)
      json(res, 200, { ok: true, deleted: { source, name, path: removed } })
      return
    }
    res.writeHead(405, { allow: METHODS })
    res.end()
  })
}

async function handle(req, res, run) {
  try {
    await run()
  } catch (error) {
    fail(res, error)
  }
}

function commandsSnapshot(store, runtime) {
  const commands = runtime.describe()
  return {
    ok: true,
    version,
    generatedAt: new Date().toISOString(),
    storage: store.file,
    commands,
    counts: {
      total: commands.length,
      registered: commands.filter((command) => command.registered === true).length,
    },
  }
}

function commandsHandler({ store, runtime }) {
  return (req, res) => handle(req, res, async () => {
    if (req.method === 'GET') {
      runtime.sync()
      json(res, 200, commandsSnapshot(store, runtime))
      return
    }
    if (req.method === 'POST') {
      const body = await readJsonBody(req)
      const saved = store.save(body)
      runtime.sync()
      json(res, 200, { ok: true, command: saved, commands: runtime.describe() })
      return
    }
    if (req.method === 'DELETE') {
      const name = query(req, 'name')
      const removed = store.delete(name)
      runtime.sync()
      json(res, 200, { ok: true, deleted: { name: removed } })
      return
    }
    res.writeHead(405, { allow: METHODS })
    res.end()
  })
}

/** Rules, their roots and the exact prompt text they produce right now. */
function rulesSnapshot() {
  const roots = rulesRoots()
  const rules = listRules(roots, log)
  const preview = renderRules(rules)
  const counts = { project: 0, user: 0 }
  for (const rule of rules) {
    if (Object.hasOwn(counts, rule.source)) counts[rule.source] += 1
  }
  const describe = (root, id) => (root === null
    ? { id, dir: null, exists: false, rules: 0, available: false, projectDir: null }
    : {
      id,
      dir: root.dir,
      exists: existsSync(root.dir),
      rules: counts[id],
      available: true,
      ...(root.projectDir === undefined ? {} : { projectDir: root.projectDir }),
    })
  const previewBytes = Buffer.byteLength(preview, 'utf8')
  return {
    ok: true,
    version,
    generatedAt: new Date().toISOString(),
    roots: [describe(roots.project, 'project'), describe(roots.user, 'user')],
    rules,
    preview,
    section: {
      name: RULES_SECTION,
      order: RULES_ORDER,
      bytes: previewBytes,
      mountedBytes,
      applied: mountedBytes > 0,
    },
  }
}

function rulesHandler(req, res) {
  return handle(req, res, async () => {
    if (req.method === 'GET') {
      json(res, 200, rulesSnapshot())
      return
    }
    if (req.method === 'POST') {
      const body = await readJsonBody(req)
      const saved = writeRule(rulesRoots(), body, log)
      json(res, 200, { ok: true, rule: saved })
      return
    }
    if (req.method === 'DELETE') {
      const source = query(req, 'source')
      const name = query(req, 'name')
      const removed = deleteRule(rulesRoots(), source, name, log)
      json(res, 200, { ok: true, deleted: { source, name, path: removed } })
      return
    }
    res.writeHead(405, { allow: METHODS })
    res.end()
  })
}

/** Agent presets: what DSH composed, plus a paste-ready patch entry. */
function agentsHandler(ctx) {
  const getRegistry = () => {
    try {
      return typeof ctx.get === 'function' ? ctx.get('agentPresets') ?? null : null
    } catch {
      return null
    }
  }
  return (req, res) => handle(req, res, async () => {
    if (req.method === 'GET') {
      const preset = query(req, 'preset')
      if (typeof preset === 'string' && preset !== '') {
        const document = await presetDocument({ getRegistry, id: preset })
        json(res, 200, { ok: true, version, preset: document })
        return
      }
      json(res, 200, await agentsSnapshot({ getRegistry, version }))
      return
    }
    if (req.method === 'POST') {
      const body = await readJsonBody(req)
      const built = buildPresetSnippet(body)
      json(res, 200, { ok: true, id: built.id, snippet: built.snippet })
      return
    }
    res.writeHead(405, { allow: 'GET, POST' })
    res.end()
  })
}

/** The global instruction file: read on every request, written atomically. */
function instructionHandler(req, res) {
  return handle(req, res, async () => {
    if (req.method === 'GET') {
      json(res, 200, await readInstruction())
      return
    }
    if (req.method === 'POST') {
      const body = await readJsonBody(req, MAX_INSTRUCTION + 16 * 1024)
      if (body === null || typeof body !== 'object' || typeof body.text !== 'string') {
        const error = new Error('instructions must be sent as { text: string }')
        error.code = 'INVALID'
        throw error
      }
      json(res, 200, await writeInstruction(body.text))
      return
    }
    res.writeHead(405, { allow: INSTRUCTION_METHODS })
    res.end()
  })
}

/** Change the Auto tier for tasks that leave the decision to Auto. */
function setTier(tier) {
  autoConfig.defaultEffort = tier
  log(`[qols-studio] auto tier set to ${tier}`)
}

export const feature = {
  id: 'studio',
  register(ctx) {
    const store = new CommandStore({ dir: commandsDir(), log })
    const runtime = createCommandRuntime({
      store,
      log,
      setTier,
      getRules: () => listRules(rulesRoots(), log),
    })
    try {
      ctx.effect(() => {
        runtime.attach(ctx)
      }, 'qols: studio commands')
    } catch (error) {
      log(`[qols] studio commands not wired: ${messageOf(error)}`)
    }
    try {
      ctx.effect(() => ctx.webServer.register({
        kind: 'exact',
        path: SKILLS_ROUTE,
        handler: skillsHandler,
      }), 'qols: studio skills')
    } catch (error) {
      log(`[qols] could not register ${SKILLS_ROUTE}: ${messageOf(error)}`)
    }
    try {
      ctx.effect(() => ctx.webServer.register({
        kind: 'exact',
        path: COMMANDS_ROUTE,
        handler: commandsHandler({ store, runtime }),
      }), 'qols: studio commands route')
    } catch (error) {
      log(`[qols] could not register ${COMMANDS_ROUTE}: ${messageOf(error)}`)
    }
    try {
      ctx.effect(() => ctx.webServer.register({
        kind: 'exact',
        path: RULES_ROUTE,
        handler: rulesHandler,
      }), 'qols: studio rules')
    } catch (error) {
      log(`[qols] could not register ${RULES_ROUTE}: ${messageOf(error)}`)
    }
    try {
      ctx.effect(() => ctx.webServer.register({
        kind: 'exact',
        path: AGENTS_ROUTE,
        handler: agentsHandler(ctx),
      }), 'qols: studio agents')
    } catch (error) {
      log(`[qols] could not register ${AGENTS_ROUTE}: ${messageOf(error)}`)
    }
    try {
      ctx.effect(() => ctx.webServer.register({
        kind: 'exact',
        path: INSTRUCTION_ROUTE,
        handler: instructionHandler,
      }), 'qols: studio instruction')
    } catch (error) {
      log(`[qols] could not register ${INSTRUCTION_ROUTE}: ${messageOf(error)}`)
    }
    let text = ''
    try {
      text = renderRules(listRules(rulesRoots(), log))
    } catch (error) {
      log(`[qols] studio rules unreadable: ${messageOf(error)}`)
    }
    if (text !== '') {
      try {
        ctx.inject(['systemPrompt'], (scope) => {
          scope.effect(() => {
            try {
              // Literal text: rule bodies may contain `{{…}}` and must not be
              // treated as prompt interpolation templates.
              const dispose = scope.systemPrompt.section({
                name: RULES_SECTION,
                order: RULES_ORDER,
                interpolate: false,
                text,
              })
              mountedBytes = Buffer.byteLength(text, 'utf8')
              return () => {
                mountedBytes = 0
                try {
                  if (typeof dispose === 'function') dispose()
                } catch (error) {
                  log(`[qols] studio rules section dispose failed: ${messageOf(error)}`)
                }
              }
            } catch (error) {
              log(`[qols] studio rules section not registered: ${messageOf(error)}`)
              return () => {}
            }
          }, 'qols: studio rules section')
        })
        log(`[qols] studio rules: ${Buffer.byteLength(text, 'utf8')} bytes in the system prompt`)
      } catch (error) {
        log(`[qols] studio rules not mounted: ${messageOf(error)}`)
      }
    }
  },
}
