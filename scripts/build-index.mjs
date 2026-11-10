#!/usr/bin/env node
/**
 * Builds market/index.json — a machine-readable plugin index in the plugin
 * market's format 1, so this repository can be added as an index source in
 * DeepSeek Harness (Plugins → Discover → Index sources) before the plugin is
 * listed in the central catalogue.
 *
 * Every value is derived from the repository itself: the package name,
 * version, engines range and repository URL from package.json, and the commit
 * and timestamp from git. Nothing is guessed, and a missing git history is a
 * hard error rather than a placeholder.
 *
 * Usage: node scripts/build-index.mjs
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const outFile = join(root, 'market', 'index.json')

/** Reads one git value in the repository root. */
function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
}

const repositoryUrl = (pkg.repository?.url ?? '').replace(/^git\+/, '').replace(/\.git$/, '')
if (!/^https:\/\/[^/]+\/[^/]+\/[^/]+$/u.test(repositoryUrl)) {
  console.error(`package.json repository.url must be a https repository URL, got ${JSON.stringify(pkg.repository?.url)}`)
  process.exit(1)
}

let commit
let publishTimestamp
try {
  commit = git('rev-parse', 'HEAD')
  publishTimestamp = Number(git('log', '-1', '--format=%ct'))
} catch (error) {
  console.error('this directory has no git history yet — commit and push before generating the index')
  console.error(String(error.stderr ?? error.message).trim())
  process.exit(1)
}

if (!/^[0-9a-f]{40}$/u.test(commit)) {
  console.error(`unexpected commit id from git: ${commit}`)
  process.exit(1)
}
if (!Number.isInteger(publishTimestamp) || publishTimestamp <= 0) {
  console.error(`unexpected commit timestamp from git: ${publishTimestamp}`)
  process.exit(1)
}

const index = {
  format: 1,
  title: { en: 'QoLs', ru: 'QoLs' },
  description: {
    en: 'Quality-of-life extras for DeepSeek Harness.',
    ru: 'Мелкие удобства для DeepSeek Harness.',
  },
  metadata: {
    categories: {
      interface: { title: { en: 'Interface', ru: 'Интерфейс' } },
      models: { title: { en: 'Models', ru: 'Модели' } },
    },
  },
  plugins: [
    {
      name: pkg.name,
      title: { en: 'QoLs', ru: 'QoLs' },
      description: {
        en: pkg.description,
        ru: 'Auto-модель, которая выбирает модель и уровень рассуждений под задачу, стоимость сессии и Prompt Studio для навыков, команд, правил, пресетов агентов и глобального AGENTS.md.',
      },
      icon: '../icon.svg',
      author: pkg.author?.name ?? 'unknown',
      homepage: pkg.homepage,
      repository: { url: repositoryUrl },
      metadata: {
        category: 'models',
        keywords: pkg.keywords ?? [],
      },
      versions: [
        {
          version: pkg.version,
          publishTimestamp,
          source: { type: 'git', url: repositoryUrl, commit },
          engines: pkg.engines?.dsh === undefined ? {} : { dsh: pkg.engines.dsh },
        },
      ],
    },
  ],
}

mkdirSync(dirname(outFile), { recursive: true })
writeFileSync(outFile, `${JSON.stringify(index, undefined, 2)}\n`, 'utf8')
console.log(`wrote ${outFile}`)
console.log(`  ${pkg.name}@${pkg.version} from ${repositoryUrl} at ${commit.slice(0, 12)}`)
