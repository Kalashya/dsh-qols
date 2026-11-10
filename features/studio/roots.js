/**
 * Where Studio reads and writes skills and rules.
 *
 * DSH discovers skills from four roots (`dsh-skill-filesystem`): the project's
 * `.dsh/skills` and `.agents/skills`, the user's `<DSH_HOME>/skills`, and
 * `~/.agents/skills`. Studio shows all four and writes to the two it owns
 * (`project` and `user`, the user's decision in W-004); the `.agents` roots are
 * read-only here so a skill never has two writers.
 *
 * The project is the nearest ancestor of the working directory with a `.git`
 * directory, or the working directory itself when no ancestor has one. The
 * fallback mirrors DSH's `findProjectRoot` (`dsh-skill-filesystem`), which
 * returns `cwd` when the walk reaches the filesystem root without a marker;
 * without it Studio would disagree with the host about a workspace that is not
 * a git repository yet. The DSH host runs with the application directory as
 * `cwd`, so `process.cwd()` is the wrong starting point in the real app: the
 * newest session directory under `<DSH_HOME>/sessions` encodes the workspace
 * path DSH was last used in (`--C-Users-Name-Repos-project--`), and that wins.
 * Without a session a `cwd` fallback keeps tests and the CLI honest.
 */

import { existsSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, parse } from 'node:path'
import { dshHome } from '../util.js'

/** The nearest directory at or above `start` that contains `.git`, or `start`. */
export function projectRootOf(start = process.cwd()) {
  let dir = start
  const root = parse(dir).root
  for (;;) {
    if (existsSync(join(dir, '.git'))) return dir
    if (dir === root) return start
    const parent = dirname(dir)
    if (parent === dir) return start
    dir = parent
  }
}

/**
 * Decode the workspace path DSH encodes into a session directory name.
 *
 * `C:\Users\Name\Repos\dsh-qols` becomes
 * `--C-Users-Name-Repos-dsh-qols--`: the drive colon and every separator are
 * replaced by `-`, which makes the decoding ambiguous (`dsh-qols` is one
 * segment, not two). Characters that are unsafe in a path component are
 * escaped as `~XXXX` (a space is `~0020`, see DSH `projectKey`), so every
 * token is unescaped before it is joined back into a path. We disambiguate on
 * the file system: at each step try the longest joining of tokens that still
 * names an existing directory.
 *
 * @param {string} name
 * @returns {string | null}
 */
export function decodeWorkspaceName(name) {
  if (typeof name !== 'string' || !name.startsWith('--') || !name.endsWith('--')) return null
  const tokens = name.slice(2, -2).split('-').filter((token) => token !== '')
  if (tokens.length === 0 || tokens.length > 40) return null

  const decodeToken = (token) =>
    token.replace(/~([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))

  const walk = (index, current) => {
    if (index >= tokens.length) return existsSync(current) ? current : null
    if (current === null) {
      if (index === 0 && /^[A-Za-z]$/.test(tokens[0])) return walk(1, `${tokens[0]}:\\`)
      return walk(1, tokens[0])
    }
    for (let take = Math.min(4, tokens.length - index); take >= 1; take -= 1) {
      const next = join(current, tokens.slice(index, index + take).map(decodeToken).join('-'))
      if (!existsSync(next)) continue
      const found = walk(index + take, next)
      if (found !== null) return found
    }
    return null
  }

  return walk(0, null)
}

function newestWorkspaceName() {
  const dir = join(dshHome(), 'sessions')
  if (!existsSync(dir)) return null
  let entries = []
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return null
  }
  const ranked = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    try {
      ranked.push({ name: entry.name, at: statSync(join(dir, entry.name)).mtimeMs })
    } catch {
      continue
    }
  }
  ranked.sort((left, right) => right.at - left.at)
  return ranked.length === 0 ? null : ranked[0].name
}

/** The workspace the last DSH session belonged to, or `process.cwd()`. */
export function workspaceCwd() {
  const name = newestWorkspaceName()
  const decoded = name === null ? null : decodeWorkspaceName(name)
  return decoded ?? process.cwd()
}

/** The project directory Studio should treat as the workspace root, if any. */
export function workspaceProjectDir(cwd = workspaceCwd()) {
  return projectRootOf(cwd)
}

/** Read order, matching DSH's own root ranks (100, 200, 400, 500). */
export const ROOT_IDS = ['project', 'project-agents', 'user', 'user-agents']

/** Roots Studio may create and delete files in. */
export const WRITABLE_ROOT_IDS = ['project', 'user']

/**
 * Every skill root, `project` first so a list reads like DSH's precedence.
 *
 * @param {string} [cwd]
 * @returns {Record<string, { id: string, dir: string, writable: boolean,
 *   projectDir?: string }>}
 */
export function studioRoots(cwd = workspaceCwd()) {
  const projectDir = workspaceProjectDir(cwd)
  const roots = {}
  if (projectDir !== null) {
    roots.project = { id: 'project', dir: join(projectDir, '.dsh', 'skills'), writable: true, projectDir }
    roots['project-agents'] = { id: 'project-agents', dir: join(projectDir, '.agents', 'skills'), writable: false, projectDir }
  }
  roots.user = { id: 'user', dir: join(dshHome(), 'skills'), writable: true }
  roots['user-agents'] = { id: 'user-agents', dir: join(homedir(), '.agents', 'skills'), writable: false }
  return roots
}

/** A root as the settings panel shows it: path, existence and skill count. */
export function describeRoot(root, count) {
  return {
    id: root.id,
    dir: root.dir,
    exists: existsSync(root.dir),
    skills: count,
    writable: root.writable === true,
    ...(root.projectDir === undefined ? {} : { projectDir: root.projectDir }),
  }
}

/** True when `id` names a root Studio may write to. */
export function isSource(id) {
  return WRITABLE_ROOT_IDS.includes(id)
}
