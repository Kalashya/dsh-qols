/**
 * User-defined slash commands for the studio.
 *
 * The registry is a JSON file under `<DSH_HOME>/storages/qols/studio/commands.json`:
 * the list is the single source of truth, and the host turns each entry into a
 * `ctx.commands` registration on load. Unlike a skills file, a command is not
 * read by DSH itself — it is our plugin that registers it into the harness
 * command surface.
 *
 * Only three actions exist, each with a fixed shape, so a stored command can
 * never turn into arbitrary code:
 * - `prompt` — hand a message to the receiving agent (`{input}` is replaced);
 * - `tier` — switch the Auto tier for tasks that let Auto decide;
 * - `say` — return a fixed line to the composer.
 */

import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { messageOf, readOwnJson } from '../util.js'

export const COMMANDS_VERSION = 1

const NAME = /^[a-z][a-z0-9_-]{0,31}$/
const MAX_DESCRIPTION = 200
const MAX_TEXT = 4000
const MAX_COMMANDS = 50
const ACTIONS = new Set(['prompt', 'tier', 'say'])
const TIERS = new Set(['eco', 'standard', 'deep'])

function invalid(message) {
  const error = new Error(message)
  error.code = 'INVALID'
  return error
}

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

/** Validate and normalize one command definition; throws `INVALID` when unusable. */
export function normalizeCommand(raw) {
  if (raw === null || typeof raw !== 'object') throw invalid('command must be an object')
  const name = text(raw.name)
  if (name === '') throw invalid('name is required')
  if (!NAME.test(name)) throw invalid('name must be a lowercase slug (a-z, 0-9, _ or -), at most 32 characters')
  const description = text(raw.description)
  if (description === '') throw invalid('description is required')
  if (description.length > MAX_DESCRIPTION) throw invalid(`description must be at most ${MAX_DESCRIPTION} characters`)

  const action = raw.action
  if (action === null || typeof action !== 'object') throw invalid('action is required')
  const type = text(action.type)
  if (!ACTIONS.has(type)) throw invalid('action must be one of: prompt, tier, say')

  if (type === 'prompt') {
    const body = text(action.text)
    if (body === '') throw invalid('a prompt command needs text')
    if (body.length > MAX_TEXT) throw invalid(`text must be at most ${MAX_TEXT} characters`)
    return { name, description, action: { type, text: body } }
  }
  if (type === 'say') {
    const body = text(action.text)
    if (body === '') throw invalid('a say command needs text')
    if (body.length > MAX_TEXT) throw invalid(`text must be at most ${MAX_TEXT} characters`)
    return { name, description, action: { type, text: body } }
  }
  const tier = text(action.tier)
  if (!TIERS.has(tier)) throw invalid('tier must be one of: eco, standard, deep')
  return { name, description, action: { type: 'tier', tier } }
}

/** Read and validate the whole registry; a broken file reads as empty. */
export function readCommands(file, log = () => {}) {
  if (!existsSync(file)) return []
  const raw = readOwnJson(file, null, log)
  if (raw === null) return []
  const list = raw !== null && typeof raw === 'object' && Array.isArray(raw.commands) ? raw.commands : []
  const commands = []
  for (const entry of list) {
    try {
      commands.push(normalizeCommand(entry))
    } catch (error) {
      log(`[qols-studio] command skipped: ${messageOf(error)}`)
    }
  }
  return commands
}

/** Atomic write of the whole registry. */
export function writeCommands(file, commands) {
  const body = JSON.stringify({ version: COMMANDS_VERSION, commands }, null, 2)
  mkdirSync(dirname(file), { recursive: true })
  const temp = `${file}.tmp`
  writeFileSync(temp, `${body}\n`, 'utf8')
  renameSync(temp, file)
}

/**
 * The registry file plus its in-memory contract.
 *
 * Methods throw only for input mistakes (`INVALID`) or a missing name
 * (`NOT_FOUND`); file system errors surface to the route as 500.
 */
export class CommandStore {
  constructor({ dir, log = () => {} }) {
    this.file = join(dir, 'commands.json')
    this.log = log
  }

  read() {
    return readCommands(this.file, this.log)
  }

  /** Insert or replace by name; returns the stored definition. */
  save(raw) {
    const command = normalizeCommand(raw)
    const commands = this.read()
    if (!commands.some((entry) => entry.name === command.name) && commands.length >= MAX_COMMANDS) {
      throw invalid(`at most ${MAX_COMMANDS} commands can be stored`)
    }
    const next = commands.filter((entry) => entry.name !== command.name)
    next.push(command)
    next.sort((left, right) => left.name.localeCompare(right.name))
    writeCommands(this.file, next)
    return command
  }

  delete(name) {
    const key = text(name)
    const commands = this.read()
    const next = commands.filter((entry) => entry.name !== key)
    if (next.length === commands.length) {
      const error = new Error(`command "${key}" does not exist`)
      error.code = 'NOT_FOUND'
      throw error
    }
    writeCommands(this.file, next)
    return key
  }
}
