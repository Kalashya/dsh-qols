/**
 * Locale parity: the client ships two hand-written dictionaries, and the
 * package ships two locale files. A key that exists in only one language is
 * invisible in review and obvious to a user — `t('usageCalls')` silently
 * renders the key itself. This suite makes that class of bug impossible.
 */

import { readFileSync } from 'node:fs'

const clientSource = readFileSync(new URL('../client.js', import.meta.url), 'utf8')

function ok(condition, message) {
  if (!condition) throw new Error(`FAILED: ${message}`)
}

/** Slice one balanced `{...}` literal, ignoring braces inside strings. */
function sliceObject(text, marker) {
  const start = text.indexOf(marker)
  ok(start >= 0, `${marker} not found`)
  const open = text.indexOf('{', start)
  let depth = 0
  let quote = null
  for (let index = open; index < text.length; index += 1) {
    const char = text[index]
    if (quote !== null) {
      if (char === '\\') index += 1
      else if (char === quote) quote = null
      continue
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char
      continue
    }
    if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) return text.slice(open, index + 1)
    }
  }
  throw new Error(`FAILED: unterminated literal after ${marker}`)
}

const DICTS = new Function(`return (${sliceObject(clientSource, 'const DICTS = {')})`)()

ok(Array.isArray(Object.keys(DICTS)), 'DICTS is an object')
ok(JSON.stringify(Object.keys(DICTS).sort()) === '["en","ru"]', 'DICTS carries exactly en and ru')

const en = DICTS.en
const ru = DICTS.ru
const enKeys = Object.keys(en).sort()
const ruKeys = Object.keys(ru).sort()

const missingInRu = enKeys.filter((key) => !(key in ru))
const missingInEn = ruKeys.filter((key) => !(key in en))
ok(missingInRu.length === 0, `keys missing in ru: ${missingInRu.join(', ')}`)
ok(missingInEn.length === 0, `keys missing in en: ${missingInEn.join(', ')}`)

for (const [locale, dict] of [['en', en], ['ru', ru]]) {
  for (const [key, value] of Object.entries(dict)) {
    ok(typeof value === 'string', `${locale}.${key} is a string`)
    ok(value.trim() !== '', `${locale}.${key} is not empty`)
    ok(!/Ð|â€|Ã—/.test(value), `${locale}.${key} has no mojibake`)
  }
}

// Every t('…') reference must resolve in both languages.
const referenced = new Set()
for (const match of clientSource.matchAll(/\bt\(\s*'([A-Za-z0-9_.-]+)'\s*\)/g)) referenced.add(match[1])
const unresolved = [...referenced].filter((key) => !(key in en) || !(key in ru))
ok(unresolved.length === 0, `t() keys without a translation: ${unresolved.join(', ')}`)

// `locale/*.json` must stay in lockstep and bilingual.
const readLocale = (name) => JSON.parse(readFileSync(new URL(`../locale/${name}.json`, import.meta.url), 'utf8'))
const localeEn = readLocale('en')
const localeRu = readLocale('ru')
const localeKeys = (value, prefix = '') =>
  Object.entries(value).flatMap(([key, entry]) =>
    entry !== null && typeof entry === 'object' ? localeKeys(entry, `${prefix}${key}.`) : [`${prefix}${key}`])

ok(JSON.stringify(localeKeys(localeEn).sort()) === JSON.stringify(localeKeys(localeRu).sort()),
  'locale/en.json and locale/ru.json declare the same keys')
for (const [name, value] of [['en', localeEn], ['ru', localeRu]]) {
  for (const field of ['meta.title', 'meta.description']) {
    const text = field.split('.').reduce((node, part) => node?.[part], value)
    ok(typeof text === 'string' && text.trim() !== '', `locale/${name}.json has ${field}`)
  }
}

console.log(`ok  ${enKeys.length} client keys, both locales complete`)
console.log(`ok  ${referenced.size} t() references resolve`)
console.log(`ok  locale/*.json keys match (${localeKeys(localeEn).length} keys)`)
console.log('QOLS LOCALE TESTS PASSED')
