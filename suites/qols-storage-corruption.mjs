/**
 * Storage corruption: every JSON file the plugin owns is read through
 * `readOwnJson`. A corrupt file must neither crash a feature nor be replaced by
 * defaults on the next save — the bytes are quarantined next to the original.
 */

import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { readCommands } from '../features/studio/commands.js'
import { readOwnJson } from '../features/util.js'

function ok(condition, message) {
  if (!condition) throw new Error(`FAILED: ${message}`)
}

const dir = mkdtempSync(join(tmpdir(), 'qols-storage-'))
const file = join(dir, 'settings.json')
const logs = []

writeFileSync(file, '{ not json at all', 'utf8')
const value = readOwnJson(file, { fallback: true }, (line) => logs.push(line))
ok(value.fallback === true, 'a corrupt file falls back to the caller value')
const quarantined = readdirSync(dir).filter((name) => name.startsWith('settings.json.corrupt-'))
ok(quarantined.length === 1, `the corrupt bytes must be kept once, got ${quarantined.length}`)
ok(readFileSync(join(dir, quarantined[0]), 'utf8') === '{ not json at all', 'the quarantined bytes are intact')
ok(logs.length === 1 && logs[0].includes('.corrupt-'), 'the quarantine is logged with its new name')

// A missing file is not corruption: no quarantine, no log, plain fallback.
const missingDir = mkdtempSync(join(tmpdir(), 'qols-storage-missing-'))
const emptyLogs = []
const missing = readOwnJson(join(missingDir, 'nope.json'), [], (line) => emptyLogs.push(line))
ok(Array.isArray(missing) && missing.length === 0, 'a missing file returns the fallback')
ok(emptyLogs.length === 0, 'a missing file must not be reported as corrupt')

// A readable file is returned as-is.
writeFileSync(file, JSON.stringify({ ok: 1 }), 'utf8')
ok(readOwnJson(file, null).ok === 1, 'a valid file is parsed')

// The command registry uses the same reader.
const commandsFile = join(dir, 'commands.json')
writeFileSync(commandsFile, '{{{', 'utf8')
const studioLogs = []
ok(readCommands(commandsFile, (line) => studioLogs.push(line)).length === 0, 'a corrupt command registry reads as empty')
ok(readdirSync(dir).some((name) => name.startsWith('commands.json.corrupt-')), 'the command registry is quarantined too')
ok(studioLogs.length === 1, 'the command registry logs the quarantine')

console.log('ok  corrupt files are quarantined, not overwritten')
console.log('ok  missing files are not treated as corruption')
console.log('ok  the Studio command registry uses the same reader')
console.log('QOLS STORAGE CORRUPTION TESTS PASSED')
