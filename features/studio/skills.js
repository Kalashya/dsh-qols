/**
 * Skills as plain files: parse, validate, list, write and delete.
 *
 * Format follows `dsh-skill-filesystem`: a bundle directory `<name>/SKILL.md`
 * (or a flat `<name>.md`) with YAML frontmatter. We only understand the scalar
 * keys DSH validates and pass every other key through unchanged, so a skill
 * authored elsewhere keeps its `metadata` and future fields.
 *
 * Writes are atomic (`.tmp` + rename) and never leave the chosen root: the
 * validated name is kebab-case, so it cannot contain a separator or `..`.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { messageOf } from '../util.js'
import { ROOT_IDS } from './roots.js'

const NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const MAX_BODY = 64 * 1024
const MAX_FILE = 256 * 1024
const MAX_DESCRIPTION = 1024

const KNOWN = new Set([
  'name',
  'description',
  'whenToUse',
  'disable-model-invocation',
  'user-invocable',
  'metadata',
])

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function unquote(value) {
  const text = String(value).trim()
  if (text.length >= 2) {
    const first = text[0]
    const last = text[text.length - 1]
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return text.slice(1, -1)
    }
  }
  return text
}

/**
 * Split `---` frontmatter from the markdown body.
 *
 * Top-level scalars are read into `data`; a `metadata:` block and any unknown
 * top-level keys are kept verbatim in `metadataLines` / `unknown` so a skill
 * authored elsewhere keeps its fields through an edit.
 *
 * @param {string} raw
 * @returns {{ data: Record<string, string | boolean>, unknown: [string, string][],
 *   metadataLines: string[], body: string, error: string | null }}
 */
export function parseSkillFile(raw) {
  const text = String(raw)
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text)
  if (match === null) {
    return { data: {}, unknown: [], metadataLines: [], body: text.trim(), error: 'missing frontmatter' }
  }

  /** @type {Record<string, string | boolean>} */
  const data = {}
  /** @type {[string, string][]} */
  const unknown = []
  /** @type {string[]} */
  const metadataLines = []
  let inMetadata = false

  for (const line of match[1].split(/\r?\n/)) {
    if (/\s/.test(line[0] ?? '')) {
      if (inMetadata) metadataLines.push(line)
      continue
    }
    if (line.trim() === '' || line.trim().startsWith('#')) {
      if (inMetadata && line.trim() !== '') metadataLines.push(line)
      continue
    }
    const index = line.indexOf(':')
    if (index <= 0) continue
    const key = line.slice(0, index).trim()
    const value = unquote(line.slice(index + 1))
    inMetadata = key === 'metadata'
    if (inMetadata) {
      metadataLines.push(line)
      continue
    }
    if (!KNOWN.has(key)) {
      unknown.push([key, line.slice(index + 1).trim()])
      continue
    }
    if (value === 'true') data[key] = true
    else if (value === 'false') data[key] = false
    else data[key] = value
  }

  return { data, unknown, metadataLines, body: text.slice(match[0].length).trim(), error: null }
}

function quote(value) {
  return JSON.stringify(String(value))
}

/** Render a skill file from a validated definition. */
export function serializeSkill(skill) {
  const lines = ['---', `name: ${quote(skill.name)}`, `description: ${quote(skill.description)}`]
  if (typeof skill.whenToUse === 'string' && skill.whenToUse !== '') {
    lines.push(`whenToUse: ${quote(skill.whenToUse)}`)
  }
  if (skill.disableModelInvocation === true) lines.push('disable-model-invocation: true')
  if (skill.userInvocable === false) lines.push('user-invocable: false')
  for (const line of Array.isArray(skill.metadataLines) ? skill.metadataLines : []) lines.push(line)
  for (const entry of Array.isArray(skill.unknown) ? skill.unknown : []) {
    if (!Array.isArray(entry) || entry.length !== 2) continue
    if (KNOWN.has(entry[0])) continue
    lines.push(`${entry[0]}: ${entry[1]}`)
  }
  lines.push('---', '')
  const body = typeof skill.body === 'string' ? skill.body.trim() : ''
  return `${lines.join('\n')}\n${body}\n`
}

/**
 * Validate one skill definition. Returns the normalized fields plus problems;
 * an empty `errors` array means the skill can be written.
 */
export function validateSkill(input) {
  const raw = input !== null && typeof input === 'object' ? input : {}
  const errors = []
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  const description = typeof raw.description === 'string' ? raw.description.trim() : ''
  const whenToUse = typeof raw.whenToUse === 'string' ? raw.whenToUse.trim() : ''
  const body = typeof raw.body === 'string' ? raw.body : ''

  if (!NAME.test(name) || name.length > 64) {
    errors.push('name must be kebab-case (a-z, 0-9 and single dashes, at most 64 characters)')
  }
  if (description === '') errors.push('description is required')
  else if (description.length > MAX_DESCRIPTION) errors.push('description is too long')
  if (body.length > MAX_BODY) errors.push('body is too large')

  return {
    errors,
    name,
    description,
    whenToUse,
    body,
    disableModelInvocation: raw.disableModelInvocation === true,
    userInvocable: raw.userInvocable === false ? false : true,
    metadataLines: Array.isArray(raw.metadataLines) ? raw.metadataLines.filter((line) => typeof line === 'string') : [],
    unknown: Array.isArray(raw.unknown)
      ? raw.unknown.filter((entry) => Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string')
      : [],
  }
}

function readOne(root, file, name, source, log) {
  let raw = ''
  try {
    if (statSync(file).size > MAX_FILE) {
      return { name, source, path: file, valid: false, problems: ['file is too large'], body: '', description: '' }
    }
    raw = readFileSync(file, 'utf8')
  } catch (error) {
    log(`[qols] studio could not read ${file}: ${messageOf(error)}`)
    return { name, source, path: file, valid: false, problems: ['file cannot be read'], body: '', description: '' }
  }
  const parsed = parseSkillFile(raw)
  const checked = validateSkill({
    name: typeof parsed.data.name === 'string' ? parsed.data.name : name,
    description: parsed.data.description,
    body: parsed.body,
    metadataLines: parsed.metadataLines,
    unknown: parsed.unknown,
  })
  const problems = [...checked.errors]
  if (parsed.error !== null) problems.push(parsed.error)
  if (typeof parsed.data.name === 'string' && parsed.data.name !== name) {
    problems.push(`frontmatter name is "${parsed.data.name}", folder is "${name}"`)
  }
  return {
    name,
    description: typeof parsed.data.description === 'string' ? parsed.data.description : '',
    whenToUse: typeof parsed.data.whenToUse === 'string' ? parsed.data.whenToUse : '',
    disableModelInvocation: parsed.data['disable-model-invocation'] === true,
    userInvocable: parsed.data['user-invocable'] !== false,
    body: parsed.body,
    metadataLines: parsed.metadataLines,
    unknown: parsed.unknown,
    path: file,
    source,
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

/**
 * Every skill under all roots. Never throws: unreadable entries are reported
 * with `valid: false` and their problems.
 */
function withWritable(row, root) {
  return { ...row, writable: root.writable === true }
}
export function listSkills(roots, log = () => {}) {
  const rows = []
  for (const source of ROOT_IDS) {
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
      if (entry.isDirectory()) {
        const file = join(root.dir, entry.name, 'SKILL.md')
        if (existsSync(file)) rows.push(withWritable(readOne(root, file, entry.name, source, log), root))
        continue
      }
      if (entry.isFile() && entry.name.endsWith('.md')) {
        const name = entry.name.slice(0, -'.md'.length)
        if (NAME.test(name)) rows.push(withWritable(readOne(root, join(root.dir, entry.name), name, source, log), root))
      }
    }
  }
  return rows.sort((left, right) => left.name.localeCompare(right.name) || left.source.localeCompare(right.source))
}

function fileOf(root, name) {
  const bundle = join(root.dir, name, 'SKILL.md')
  if (existsSync(bundle)) return { file: bundle, dir: join(root.dir, name) }
  const flat = join(root.dir, `${name}.md`)
  if (existsSync(flat)) return { file: flat, dir: null }
  return { file: bundle, dir: join(root.dir, name) }
}

/**
 * Create or update a skill. Throws an Error with `code: 'INVALID'` when the
 * definition does not validate, and `code: 'NO_ROOT'` when the project root is
 * unavailable.
 *
 * @returns {{ name: string, source: string, path: string }}
 */
export function writeSkill(roots, input, log = () => {}) {
  const skill = validateSkill(input)
  if (skill.errors.length > 0) {
    const error = new Error(skill.errors.join('; '))
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
    const error = new Error('the project skills root is not available (no .git ancestor)')
    error.code = 'NO_ROOT'
    throw error
  }
  const target = fileOf(root, skill.name)
  try {
    mkdirSync(target.dir ?? root.dir, { recursive: true })
    const temporary = `${target.file}.${process.pid}.tmp`
    writeFileSync(temporary, serializeSkill(skill), 'utf8')
    renameSync(temporary, target.file)
  } catch (error) {
    log(`[qols] studio could not write ${target.file}: ${messageOf(error)}`)
    throw error
  }
  return { name: skill.name, source, path: target.file }
}

/** Remove a skill's bundle directory or flat file. Returns the removed path. */
export function deleteSkill(roots, source, name, log = () => {}) {
  if (!NAME.test(String(name)) || (source !== 'project' && source !== 'user')) {
    const error = new Error('a valid source and kebab-case name are required')
    error.code = 'INVALID'
    throw error
  }
  const root = roots[source] ?? null
  if (root === null) {
    const error = new Error('the project skills root is not available (no .git ancestor)')
    error.code = 'NO_ROOT'
    throw error
  }
  const target = fileOf(root, name)
  if (!existsSync(target.file)) {
    const error = new Error(`skill "${name}" does not exist in the ${source} root`)
    error.code = 'NOT_FOUND'
    throw error
  }
  try {
    if (target.dir !== null) rmSync(target.dir, { recursive: true, force: true })
    else rmSync(target.file, { force: true })
  } catch (error) {
    log(`[qols] studio could not delete ${target.file}: ${messageOf(error)}`)
    throw error
  }
  return target.file
}
