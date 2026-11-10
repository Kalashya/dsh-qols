/**
 * Runs every suite in this directory as its own process.
 *
 * A suite is a plain script: it throws on the first failed assertion and prints a
 * final `… PASSED` line. Isolation matters here — several suites swap
 * `process.env.DSH_HOME`, stub `globalThis` and evaluate the client bundle, so
 * they must not share a process.
 *
 * `node --test` discovers this file; each suite becomes one test case.
 */

import { execFile } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const here = dirname(fileURLToPath(import.meta.url))
const suitesDir = join(here, '..', 'suites')
const execFileAsync = promisify(execFile)

const suites = readdirSync(suitesDir)
  .filter((name) => name.endsWith('.mjs'))
  .sort()

if (suites.length === 0) {
  test('suites exist', () => {
    throw new Error(`no test suites found in ${suitesDir}`)
  })
}

for (const suite of suites) {
  test(suite, async () => {
    const { stdout } = await execFileAsync(process.execPath, [join(suitesDir, suite)], {
      cwd: suitesDir,
      maxBuffer: 16 * 1024 * 1024,
      timeout: 120_000,
    })
    if (!/PASSED/.test(stdout)) {
      throw new Error(`${suite} finished without a PASSED marker:\n${stdout.slice(-2000)}`)
    }
  })
}
