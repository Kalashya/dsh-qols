/**
 * Rules: always-apply instructions that QoLs adds to the system prompt.
 *
 * DSH has no `.mdc`/glob rule engine, but it does expose
 * `ctx.systemPrompt.section({ name, order, text })`. Studio keeps the text in
 * plain files (`<project>/.dsh/rules/<name>.md`, `<DSH_HOME>/rules/<name>.md`)
 * and the host registers one section built from the enabled ones **when the
 * plugin loads**. Prompt sections are fixed once an agent is created, so an
 * edit applies to a new session (or after a DSH restart), not to the open chat;
 * the panel says so instead of pretending the change is live.
 *
 * The file format is deliberately small: YAML-ish frontmatter with `name`,
 * `description` and an optional `enabled: false`, then the markdown body. The
 * body is the instruction text, unchanged, so what the preview shows is what
 * the model receives.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { dshHome, messageOf } from '../util.js'
import { workspaceProjectDir } from './roots.js'

const NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const MAX_BODY = 32 * 1024
const MAX_FILE = 64 * 1024
const MAX_DESCRIPTION = 512
const MAX_TOTAL = 48 * 1024

/** Section name and order used when the host mounts rules into the prompt. */
export const RULES_SECTION = 'qols:rules'
export const RULES_ORDER = 9000

function unquote(value) {
  const text = String(value).trim()
  if (text.length >= 2) {
    const first = text[0]
    const last = text[text.length - 1]
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) return text.slice(1, -1)
  }
  return text
}

function quote(value) {
  return JSON.stringify(String(value))
}

/**
 * Split frontmatter from the body. Returns `error: 'missing frontmatter'` for a
 * body-only file, so the panel can point at the broken file instead of hiding
 * it.
 */
export function parseRuleFile(raw) {
  const text = String(raw)
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text)
  if (match === null) {
    return { data: {}, body: text.trim(), error: 'missing frontmatter' }
  }
  const data = {}
  for (const line of match[1].split(/\r?\n/)) {
    if (line.trim() === '' || /\s/.test(line[0] ?? '') || line.trim().startsWith('#')) continue
    const index = line.indexOf(':')
    if (index <= 0) continue
    const key = line.slice(0, index).trim()
    const value = unquote(line.slice(index + 1))
    if (key === 'enabled') data.enabled = value !== 'false'
    else data[key] = value
  }
  return { data, body: text.slice(match[0].length).trim(), error: null }
}

/** Render one rule file; `enabled: false` is written, `true` is the default. */
export function serializeRule(rule) {
  const lines = [
    '---',
    `name: ${quote(rule.name)}`,
    `description: ${quote(rule.description)}`,
  ]
  if (rule.enabled === false) lines.push('enabled: false')
  lines.push('---', '')
  return `${lines.join('\n')}\n${String(rule.body).trim()}\n`
}

/** Normalize and validate one definition; `errors` empty means writable. */
export function validateRule(input) {
  const raw = input !== null && typeof input === 'object' ? input : {}
  const errors = []
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  const description = typeof raw.description === 'string' ? raw.description.trim() : ''
  const body = typeof raw.body === 'string' ? raw.body : ''

  if (!NAME.test(name) || name.length > 64) {
    errors.push('name must be kebab-case (a-z, 0-9 and single dashes, at most 64 characters)')
  }
  if (description === '') errors.push('description is required')
  else if (description.length > MAX_DESCRIPTION) errors.push('description is too long')
  if (body.trim() === '') errors.push('body is required')
  else if (body.length > MAX_BODY) errors.push('body is too large')

  return { errors, name, description, body, enabled: raw.enabled !== false }
}

/**
 * Writable rule roots. Same project discovery as skills: the workspace DSH was
 * last used in, resolved to its nearest `.git` ancestor, because the DSH host
 * runs with the application directory as cwd.
 */
export function rulesRoots() {
  const projectDir = workspaceProjectDir()
  return {
    project: projectDir === null
      ? null
      : { id: 'project', dir: join(projectDir, '.dsh', 'rules'), projectDir },
    user: { id: 'user', dir: join(dshHome(), 'rules') },
  }
}

function readOne(root, file, name, source, log) {
  let raw = ''
  try {
    if (statSync(file).size > MAX_FILE) {
      return { name, source, path: file, valid: false, problems: ['file is too large'], body: '', description: '', enabled: false }
    }
    raw = readFileSync(file, 'utf8')
  } catch (error) {
    log(`[qols] studio could not read ${file}: ${messageOf(error)}`)
    return { name, source, path: file, valid: false, problems: ['file cannot be read'], body: '', description: '', enabled: false }
  }
  const parsed = parseRuleFile(raw)
  const checked = validateRule({
    name: typeof parsed.data.name === 'string' ? parsed.data.name : name,
    description: parsed.data.description,
    body: parsed.body,
    enabled: parsed.data.enabled,
  })
  const problems = [...checked.errors]
  if (parsed.error !== null) problems.push(parsed.error)
  if (typeof parsed.data.name === 'string' && parsed.data.name !== name) {
    problems.push(`frontmatter name is "${parsed.data.name}", file is "${name}.md"`)
  }
  return {
    name,
    source,
    path: file,
    description: typeof parsed.data.description === 'string' ? parsed.data.description : '',
    body: parsed.body,
    enabled: parsed.data.enabled !== false,
    valid: problems.length === 0,
    problems,
    bytes: Buffer.byteLength(raw, 'utf8'),
    updatedAt: (() => {
      try {
        return statSync(file).mtime.toISOString()
      } catch {
        return null
      }
    })(),
  }
}

/** Every rule under both roots; unreadable files are reported, never thrown. */
export function listRules(roots, log = () => {}) {
  const rows = []
  for (const source of ['project', 'user']) {
    const root = roots[source] ?? null
    if (root === null || !existsSync(root.dir)) continue
    let entries = []
    try {
      entries = readdirSync(root.dir, { withFileTypes: true })
    } catch (error) {
      log(`[qols] studio could not list ${root.dir}: ${messageOf(error)}`)
      continue
    }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue
      const name = entry.name.slice(0, -'.md'.length)
      if (!NAME.test(name)) continue
      rows.push(readOne(root, join(root.dir, entry.name), name, source, log))
    }
  }
  return rows.sort((left, right) => left.name.localeCompare(right.name) || left.source.localeCompare(right.source))
}

/**
 * The exact text the host puts into the system prompt: one section with a
 * heading per enabled, valid rule. Empty when there is nothing to add, so the
 * caller registers no section at all.
 */
export function renderRules(rules) {
  const parts = []
  for (const rule of rules) {
    if (rule.valid !== true || rule.enabled !== true) continue
    const block = [`## ${rule.name}`]
    if (rule.description !== '') block.push(rule.description)
    block.push('', rule.body.trim())
    parts.push(block.join('\n'))
  }
  if (parts.length === 0) return ''
  const text = `# Rules (managed in Prompt Studio)\n\nThese instructions apply to every task in this workspace.\n\n${parts.join('\n\n')}`
  return text.length > MAX_TOTAL ? text.slice(0, MAX_TOTAL) : text
}

function targetFile(root, name) {
  return join(root.dir, `${name}.md`)
}

/**
 * Create or update a rule. Throws `INVALID` for a bad definition and `NO_ROOT`
 * when the project root is unavailable.
 */
export function writeRule(roots, input, log = () => {}) {
  const rule = validateRule(input)
  if (rule.errors.length > 0) {
    const error = new Error(rule.errors.join('; '))
    error.code = 'INVALID'
    throw error
  }
  const source = input?.source === 'project' ? 'project' : input?.source === 'user' ? 'user' : null
  if (source === null) {
    const error = new Error('source must be "project" or "user"')
    error.code = 'INVALID'
    throw error
  }
  const root = roots[source] ?? null
  if (root === null) {
    const error = new Error('the project rules root is not available (no .git ancestor)')
    error.code = 'NO_ROOT'
    throw error
  }
  const file = targetFile(root, rule.name)
  try {
    mkdirSync(root.dir, { recursive: true })
    const temporary = `${file}.${process.pid}.tmp`
    writeFileSync(temporary, serializeRule(rule), 'utf8')
    renameSync(temporary, file)
  } catch (error) {
    log(`[qols] studio could not write ${file}: ${messageOf(error)}`)
    throw error
  }
  return { name: rule.name, source, path: file }
}

/** Remove one rule file; returns its path. */
export function deleteRule(roots, source, name, log = () => {}) {
  if (!NAME.test(String(name)) || (source !== 'project' && source !== 'user')) {
    const error = new Error('a valid source and kebab-case name are required')
    error.code = 'INVALID'
    throw error
  }
  const root = roots[source] ?? null
  if (root === null) {
    const error = new Error('the project rules root is not available (no .git ancestor)')
    error.code = 'NO_ROOT'
    throw error
  }
  const file = targetFile(root, name)
  if (!existsSync(file)) {
    const error = new Error(`rule "${name}" does not exist in the ${source} root`)
    error.code = 'NOT_FOUND'
    throw error
  }
  try {
    rmSync(file, { force: true })
  } catch (error) {
    log(`[qols] studio could not delete ${file}: ${messageOf(error)}`)
    throw error
  }
  return file
}
