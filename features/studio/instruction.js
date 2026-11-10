/**
 * Global instructions: the `AGENTS.md` at the DSH home.
 *
 * This is the file every session loads before the project files, so Prompt
 * Studio edits it in place instead of storing a copy: the copy would drift the
 * moment a session edits the real file. The route returns the exact bytes on
 * disk plus its location, and a save rewrites that one file atomically so a
 * crash mid-write cannot leave a half-written instruction set behind.
 *
 * The file may legitimately be absent — a fresh DSH home has none — so a
 * missing file is `exists: false` with empty text, not an error. Only an
 * unreadable or oversized file fails.
 */

import { existsSync, statSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { dshHome, messageOf } from '../util.js'

/** Beyond this the editor stops being an editor and becomes a payload. */
export const MAX_INSTRUCTION = 256 * 1024

/** The global instruction file every DSH session reads first. */
export function instructionPath() {
  return join(dshHome(), 'AGENTS.md')
}

function stamp(file) {
  try {
    return statSync(file).mtime.toISOString()
  } catch {
    return null
  }
}

/**
 * The file as it is on disk right now.
 *
 * `bytes` and `lines` are what the panel shows, so they describe the text the
 * user is about to edit, not a cached snapshot of an earlier read.
 */
export async function readInstruction() {
  const file = instructionPath()
  const home = dshHome()
  let text = ''
  let exists = false
  if (existsSync(file)) {
    try {
      text = await readFile(file, 'utf8')
      exists = true
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
  }
  return {
    ok: true,
    path: file,
    home,
    exists,
    text,
    bytes: Buffer.byteLength(text, 'utf8'),
    lines: text === '' ? 0 : text.split('\n').length,
    max: MAX_INSTRUCTION,
    updatedAt: exists ? stamp(file) : null,
  }
}

/**
 * Replaces the global instruction file with `text`.
 *
 * The write goes through a sibling temporary file and a rename, so the file the
 * next session reads is always either the old content or the new one.
 */
export async function writeInstruction(text) {
  const value = typeof text === 'string' ? text : ''
  const bytes = Buffer.byteLength(value, 'utf8')
  if (bytes > MAX_INSTRUCTION) {
    const error = new Error(`instructions are ${bytes} bytes; the limit is ${MAX_INSTRUCTION}`)
    error.code = 'INVALID'
    throw error
  }
  const file = instructionPath()
  try {
    await mkdir(dirname(file), { recursive: true })
    const temporary = `${file}.tmp-${process.pid}-${Date.now()}`
    await writeFile(temporary, value, 'utf8')
    await rename(temporary, file)
  } catch (error) {
    if (error?.code === 'EACCES' || error?.code === 'EPERM' || error?.code === 'EROFS') {
      const denied = new Error(`cannot write ${file}: ${messageOf(error)}`)
      denied.code = 'NO_ROOT'
      throw denied
    }
    throw error
  }
  return readInstruction()
}
