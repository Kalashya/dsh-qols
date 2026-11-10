/**
 * Agents tab: read the agent presets DSH already composed, and turn a form into
 * a paste-ready Cordis patch entry.
 *
 * DSH has no preset directory and no preset file format: a preset is an
 * `@deepseek-ai/dsh-agent-preset` row whose `config.plugins` is an ordinary
 * Cordis entry list. The registry owns them, so this module only reads through
 * the `agentPresets` service and never writes declarations itself — a broken
 * profile patch can stop DSH from starting, and the studio must not be able to
 * do that.
 *
 * `list()` (service) gives display metadata and loading diagnostics, while
 * `readDocument(id)` renders one declaration's child list back as YAML for
 * viewing. The snippet builder is a pure function: validation plus single-quote
 * escaping, no YAML parser and no disk writes.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { dshHome } from '../util.js'

const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const PACKAGE = /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i
const MAX_PLUGINS = 100
const MAX_DOCUMENT = 200_000

function invalid(problems) {
  const error = new Error(problems.join('; '))
  error.code = 'INVALID'
  error.problems = problems
  return error
}

/** Single-quoted YAML scalar: `'` doubles, everything else stays literal. */
function quote(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

/**
 * Which profile carries this plugin. The studio cannot ask the host for its
 * profile name, so it looks for the profile whose bundle list names `dsh-qols`;
 * a single profile is accepted as a fallback.
 */
export function profileInfo() {
  const home = dshHome()
  const dir = join(home, 'profiles')
  const names = []
  let active = null
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      names.push(entry.name)
      let bundles = []
      try {
        const pkg = JSON.parse(readFileSync(join(dir, entry.name, 'package.json'), 'utf8'))
        bundles = Array.isArray(pkg?.dsh?.profile?.bundles) ? pkg.dsh.profile.bundles : []
      } catch {
        bundles = []
      }
      if (active === null && bundles.includes('dsh-qols')) active = entry.name
    }
  } catch {
    // No profiles directory: report what we know, the client explains the rest.
  }
  if (active === null && names.length === 1) active = names[0]
  const patchFile = active === null ? null : join(dir, active, 'cordis.patch.yml')
  return {
    home,
    profiles: names,
    active,
    patchFile,
    patchExists: patchFile !== null && existsSync(patchFile),
  }
}

/**
 * Build the YAML entry that adds one preset to a profile patch.
 *
 * @param {unknown} input - `{ id, name?, description?, order?, plugins: string[], makeDefault? }`.
 * @returns {{ id: string, snippet: string }} the preset id and the patch entry.
 * @throws an `INVALID` error with a `problems` array when the form is unusable.
 */
export function buildPresetSnippet(input) {
  const raw = input !== null && typeof input === 'object' ? input : {}
  const problems = []

  const id = typeof raw.id === 'string' ? raw.id.trim() : ''
  if (id === '') problems.push('id is required')
  else if (id.length > 64) problems.push('id is longer than 64 characters')
  else if (!ID.test(id)) problems.push('id must be kebab-case: a-z, 0-9 and "-", starting with a letter')

  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  if (name.length > 80) problems.push('name is longer than 80 characters')

  const description = typeof raw.description === 'string' ? raw.description.trim() : ''
  if (description.length > 300) problems.push('description is longer than 300 characters')

  let order = null
  if (raw.order !== undefined && raw.order !== null && String(raw.order).trim() !== '') {
    order = Number(raw.order)
    if (!Number.isInteger(order) || order < 0 || order > 1000) problems.push('order must be an integer from 0 to 1000')
  }

  const plugins = Array.isArray(raw.plugins)
    ? raw.plugins.map((entry) => String(entry).trim()).filter((entry) => entry !== '')
    : []
  if (plugins.length === 0) problems.push('at least one plugin is required')
  if (plugins.length > MAX_PLUGINS) problems.push(`no more than ${MAX_PLUGINS} plugins`)
  for (const entry of plugins) {
    if (!PACKAGE.test(entry)) problems.push(`not a plugin package name: ${entry}`)
  }

  if (problems.length > 0) throw invalid(problems)

  const lines = [
    '# Prompt Studio: a new agent preset. Paste this entry under the top-level',
    "# list in the profile's cordis.patch.yml, then restart DSH. The preset id",
    '# and the row id must stay unique; new sessions pick the preset up.',
    '- insert:',
    `    - id: ${`preset-${id}`}`,
    "      name: '@deepseek-ai/dsh-agent-preset'",
    '      config:',
    `        id: ${quote(id)}`,
  ]
  if (name !== '') lines.push(`        name: ${quote(name)}`)
  if (description !== '') lines.push(`        description: ${quote(description)}`)
  if (order !== null) lines.push(`        order: ${order}`)
  lines.push('        plugins:')
  for (const entry of plugins) lines.push(`          - name: ${quote(entry)}`)

  if (raw.makeDefault === true) {
    lines.push(
      '',
      '# Make it the default for sessions created later.',
      '- id: agent-preset-registry',
      '  config:',
      `    default: ${quote(id)}`,
    )
  }

  return { id, snippet: `${lines.join('\n')}\n` }
}

/**
 * Presets, their diagnostics and the profile patch the client should point at.
 *
 * @param {object} options - `getRegistry` returns the `agentPresets` service or null.
 * @param {string} options.version - plugin version echoed to the client.
 */
export async function agentsSnapshot({ getRegistry, version }) {
  const patch = profileInfo()
  let registry = null
  try {
    registry = typeof getRegistry === 'function' ? getRegistry() : null
  } catch {
    registry = null
  }
  const base = {
    ok: true,
    version,
    generatedAt: new Date().toISOString(),
    patch,
  }
  if (registry === null || typeof registry.list !== 'function') {
    return { ...base, available: false, presets: [], defaultId: null }
  }
  const rows = await registry.list()
  const defaultId = typeof registry.defaultId === 'string' ? registry.defaultId : null
  const presets = (Array.isArray(rows) ? rows : []).map((row) => ({
    id: row.id,
    name: typeof row.name === 'string' ? row.name : null,
    description: typeof row.description === 'string' ? row.description : null,
    order: typeof row.order === 'number' ? row.order : null,
    isDefault: row.id === defaultId,
    broken: typeof row.broken === 'string' && row.broken !== '' ? row.broken.slice(0, 2000) : null,
  }))
  return { ...base, available: true, presets, defaultId }
}

/**
 * One preset's declaration rendered back as YAML (view only).
 *
 * @param {object} options - `getRegistry` as in {@link agentsSnapshot}.
 * @param {string} id - preset identity.
 */
export async function presetDocument({ getRegistry, id }) {
  const presetId = typeof id === 'string' ? id.trim() : ''
  if (presetId === '') throw invalid(['preset is required'])
  let registry = null
  try {
    registry = typeof getRegistry === 'function' ? getRegistry() : null
  } catch {
    registry = null
  }
  if (registry === null || typeof registry.readDocument !== 'function') {
    const error = new Error('the agent preset service is not available')
    error.code = 'NO_SERVICE'
    throw error
  }
  const document = await registry.readDocument(presetId)
  const content = typeof document?.content === 'string' ? document.content : ''
  return {
    agentPreset: typeof document?.agentPreset === 'string' ? document.agentPreset : presetId,
    name: typeof document?.name === 'string' ? document.name : null,
    description: typeof document?.description === 'string' ? document.description : null,
    content: content.slice(0, MAX_DOCUMENT),
    truncated: content.length > MAX_DOCUMENT,
  }
}
