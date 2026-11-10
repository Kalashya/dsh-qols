#!/usr/bin/env node
/**
 * The single gate for this repository: bundle contract, manifest checks, the
 * full suite, and the packed file list. Every step runs in its own process so
 * a crash cannot be swallowed, and the packed list is compared with the files
 * the runtime actually reads.
 *
 * Usage: npm run verify
 */

import { spawnSync } from 'node:child_process'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const failures = []

function step(label) {
  console.log(`\n=== ${label} ===`)
}

function run(label, command, args) {
  step(label)
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' })
  if (result.status !== 0) failures.push(`${label} exited with ${result.status ?? result.signal}`)
}

/* ---- 1. bundle contract ------------------------------------------------- */

run('bundle check', process.execPath, [join(root, 'scripts', 'bundle-check.mjs')])

/* ---- 1b. host syntax ---------------------------------------------------- */

step('host syntax')
{
  const hostFiles = [
    'index.js',
    'features/index.js',
    'features/health.js',
    'features/util.js',
    'features/catalog.js',
    'features/diagnostics-host.js',
    'features/auto/index.js',
    'features/liked/index.js',
    'features/studio/index.js',
    'features/usage/index.js',
    'scripts/bundle-check.mjs',
    'scripts/verify.mjs',
  ]
  let checked = 0
  for (const file of hostFiles) {
    const result = spawnSync(process.execPath, ['--check', join(root, file)], { cwd: root, stdio: 'pipe' })
    if (result.status !== 0) {
      failures.push(`node --check failed for ${file}: ${result.stderr.toString().trim().split('\n')[0]}`)
      continue
    }
    checked += 1
  }
  console.log(`ok   ${checked}/${hostFiles.length} host files parse`)
}

/* ---- 2. suites ---------------------------------------------------------- */

run('test suites', process.execPath, [join(root, 'test', 'run.test.mjs')])

/* ---- 3. packed file list ------------------------------------------------ */

step('packed file list')
const outFile = join(tmpdir(), `qols-pack-${process.pid}.json`)
const errFile = join(tmpdir(), `qols-pack-${process.pid}.err`)
const pack = spawnSync(`${npm} pack --dry-run --json > "${outFile}" 2> "${errFile}"`, {
  cwd: root,
  shell: true,
  stdio: 'ignore',
})

let packReport
try {
  if (pack.status !== 0) throw new Error(readFileSync(errFile, 'utf8').trim() || `npm pack exited with ${pack.status}`)
  const parsed = JSON.parse(readFileSync(outFile, 'utf8'))
  packReport = Array.isArray(parsed) ? parsed[0] : parsed
  if (packReport === undefined || !Array.isArray(packReport.files)) throw new Error('npm pack returned no file list')
} catch (error) {
  failures.push(`npm pack --dry-run failed: ${error instanceof Error ? error.message : String(error)}`)
} finally {
  rmSync(outFile, { force: true })
  rmSync(errFile, { force: true })
}

if (packReport !== undefined) {
  const shipped = new Set(packReport.files.map((file) => file.path))
  const required = [
    'package.json',
    'index.js',
    'client.js',
    'cordis.patch.yml',
    'icon.svg',
    'features/index.js',
    'locale/en.json',
    'locale/ru.json',
  ]
  for (const path of required) {
    if (!shipped.has(path)) failures.push(`npm pack omits a runtime file: ${path}`)
  }
  for (const path of shipped) {
    if (path.includes('node_modules/')) failures.push(`npm pack ships node_modules: ${path}`)
  }
  if (shipped.size < 40) failures.push(`npm pack ships only ${shipped.size} files: the tarball looks truncated`)
  console.log(`${shipped.size} files, ${(packReport.size / 1024).toFixed(1)} kB packed, ${(packReport.unpackedSize / 1024).toFixed(1)} kB unpacked`)
  if (!shipped.has('README.md')) console.log('note: README.md is not shipped (tracked for the delivery increment)')
}

/* ---- report ------------------------------------------------------------- */

if (failures.length > 0) {
  console.error('\nVERIFY FAILED')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

writeFileSync(join(tmpdir(), 'qols-verify-last.txt'), new Date().toISOString(), 'utf8')
console.log('\nVERIFY PASSED')
