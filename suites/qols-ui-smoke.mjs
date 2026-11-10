/**
 * Headless smoke test for the QoLs client UI: loads client.js with a tiny
 * React/document stub, then renders the settings section, the composer badge,
 * both feature dialogs, the sidebar usage card and the per-turn cost line from
 * realistic host payloads.
 *
 * Usage: node qols-ui-smoke.mjs
 */
import { readFileSync } from 'node:fs'

const calls = []
const registrations = []

/**
 * Render-time data queue: every useState call, in source order, takes the next
 * value from the active scenario plan. Components render lazily, so passing data
 * through props does not consume the shared queue.
 */
const scenario = { plan: [], queue: 0 }

const React = {
  createElement(type, props, ...children) {
    return { type, props: { ...(props ?? {}), children: children.flat(Infinity) } }
  },
  useState(initial) {
      if (scenario.queue === 0) {
      return [typeof initial === 'function' ? initial() : initial, () => {}]
    }
    scenario.queue -= 1
    const next = scenario.plan.length > 0 ? scenario.plan.shift() : undefined
    return [next === undefined ? (typeof initial === 'function' ? initial() : initial) : next, () => {}]
  },
  useEffect() {},
  useMemo(fn) { return fn() },
  useCallback(fn) { return fn },
  useRef(value) { return { current: value } },
  useLayoutEffect() {},
  Fragment: 'fragment',
}

const styleTag = { id: '', textContent: '' }
globalThis.window = {
  setInterval() { return 1 },
  clearInterval() {},
  setTimeout() { return 1 },
  clearTimeout() {},
  addEventListener() {},
  removeEventListener() {},
  __ModuleLoader__: { load(definition) { calls.push(definition) } },
}
globalThis.document = {
  getElementById(id) { return id === 'qols-style' ? styleTag : null },
  createElement() { return { ...styleTag, appendChild() {}, setAttribute() {} } },
  head: { appendChild() {} },
  body: {},
  querySelector() { return null },
  querySelectorAll() { return [] },
}
globalThis.MutationObserver = class { observe() {} disconnect() {} }
globalThis.dshDesktop = undefined

const marketCalls = []
globalThis.fetch = async (path, options = {}) => {
  const url = String(path)
  if (url.includes('/dsh-market/installed')) {
    return { ok: true, status: 200, json: async () => ({ installed: { 'billion-context': '0.1.213', dshmarket: '1.66.45' }, activation: { 'billion-context': { state: 'live' }, dshmarket: { state: 'live' } } }) }
  }
  if (url.includes('/dsh-market/updates')) {
    marketCalls.push({ url, body: '' })
    return { ok: true, status: 200, json: async () => ({ updates: { 'billion-context': { current: '0.1.213', latest: '0.2.0', updateAvailable: true }, dshmarket: { current: '1.66.45', latest: '1.73.17', updateAvailable: false, heldUpdate: { latest: '1.73.17', until: '2026-11-10T17:08:25.694Z' } } } }) }
  }
  if (url.includes('/api/dsh-qols/liked/update-core')) {
    marketCalls.push({ url, body: options.body === undefined ? '' : String(options.body) })
    return { ok: true, status: 200, json: async () => ({ ok: true, name: 'dshmarket', version: '1.73.17', restart: true }) }
  }
  if (url.includes('/dsh-market/install') || url.includes('/dsh-market/uninstall') || url.includes('/dsh-market/update') || url.includes('/dsh-market/toggle')) {
    marketCalls.push({ url, body: options.body === undefined ? '' : String(options.body) })
    return { ok: true, status: 200, json: async () => ({ ok: true }) }
  }
  throw new Error(`network disabled in smoke test: ${url}`)
}

const code = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
new Function(code)()

if (calls.length !== 1) throw new Error(`expected one module load, got ${calls.length}`)
const definition = calls[0]

// The loader keys the client module by the id the bundle declares, and the host
// looks it up by the package name. A mismatch registers the wrong key, so this
// is asserted rather than assumed.
const packageName = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).name
if (definition.id !== packageName) {
  throw new Error(`client module id ${definition.id} must equal the package name ${packageName}`)
}

// The bundle is a classic script: a second evaluation must not collide, which is
// exactly what top-level declarations would do.
new Function(code)()
if (calls.length !== 2) throw new Error(`a repeated evaluation must register again, got ${calls.length} loads`)

const exportsObject = definition.factory((name) => {
  if (name === 'react') return React
  throw new Error(`unexpected require ${name}`)
})

const startedSessions = []
const ctx = {
  get(name) { return this[name] },
  effect(callback) { const dispose = callback(); return typeof dispose === 'function' ? dispose : () => {} },
  on() { return () => {} },
  locale: { register() { return () => {} }, bind: () => (key) => key },
  uiWorkspace: {
    startSession(workspaceId, options) { startedSessions.push({ workspaceId, options }) },
  },
  slots: {
    inject(name, factory) { factory() },
    register(meta, component) { registrations.push({ meta, component }); return () => {} },
  },
}
exportsObject.apply(ctx)

// Hot reload: the bundle can be evaluated twice in one page. A second apply
// must be a no-op, otherwise every sidebar icon and settings card doubles.
const registrationsAfterFirstApply = registrations.length
exportsObject.apply(ctx)
if (registrations.length !== registrationsAfterFirstApply) {
  throw new Error(`a repeated apply duplicated ${registrations.length - registrationsAfterFirstApply} slots`)
}

const settingsSlot = registrations.find((entry) => entry.meta.id === 'qols')
const badgeSlot = registrations.find((entry) => entry.meta.id === 'qols-auto')
if (settingsSlot === undefined) throw new Error('settings.section was not registered')
if (badgeSlot === undefined) throw new Error('auto badge was not registered')
const studioOverlaySlot = registrations.find((entry) => entry.meta.name === 'shell.overlay' && entry.meta.id === 'qols-studio-overlay')
if (studioOverlaySlot === undefined) throw new Error('Prompt Studio overlay was not registered')
if (studioOverlaySlot.meta.order !== 10) throw new Error(`Prompt Studio overlay order must be 10, got ${studioOverlaySlot.meta.order}`)
if (typeof studioOverlaySlot.meta.label !== 'function' || studioOverlaySlot.meta.label() !== 'Prompt Studio') {
  throw new Error('Prompt Studio overlay must be labelled Prompt Studio')
}
const studioRow = registrations.find((entry) => entry.meta.name === 'sidebar.panellist' && entry.meta.id === 'qols-prompt-studio')
if (studioRow === undefined) throw new Error('Prompt Studio panel row was not registered')
if (studioRow.meta.order !== 13) throw new Error(`Prompt Studio row order must be 13, got ${studioRow.meta.order}`)
if (typeof studioRow.component !== 'function') throw new Error('the Prompt Studio row must render a glyph component')
// The rows are buttons, not panels: no `main` panel may exist, otherwise the
// sidebar would swap the centre column instead of opening the layer.
if (registrations.some((entry) => entry.meta.name === 'main' && entry.meta.key === 'qols-prompt-studio')) {
  throw new Error('Prompt Studio must not register a main panel')
}
// A panellist row always calls `layout.selectPanel(id)`; the client stops that
// click before React's delegated handler and runs its own action instead.
if (!code.includes("closest('button')") || !code.includes('event.stopPropagation()')) {
  throw new Error('the panel rows must intercept the row click before selectPanel')
}
if (registrations.some((entry) => entry.meta.name === 'conversation.session.header.utilities')) {
  throw new Error('no QoLs entry belongs in the session header')
}
const likedSlot = registrations.find((entry) => entry.meta.name === 'settings.section' && entry.meta.id === 'qols-liked-plugins')
if (likedSlot === undefined) throw new Error('Liked plugins settings section was not registered')
if (likedSlot.meta.order <= settingsSlot.meta.order) throw new Error(`Liked plugins must follow QoLs (orders ${likedSlot.meta.order}/${settingsSlot.meta.order})`)
if (typeof likedSlot.meta.label !== 'function' || likedSlot.meta.label() !== 'Liked plugins') {
  throw new Error('Liked plugins section must be labelled Liked plugins')
}
if (badgeSlot.meta.name !== 'conversation.composer.dock') {
  throw new Error(`badge registered into ${badgeSlot.meta.name}, expected conversation.composer.dock`)
}

function walk(node, visit) {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) { for (const child of node) walk(child, visit); return }
  visit(node)
  walk(node.props?.children, visit)
}

function collectText(node, into) {
  if (typeof node === 'string') { into.push(node); return into }
  if (node === null || typeof node !== 'object') return into
  if (Array.isArray(node)) { for (const child of node) collectText(child, into); return into }
  if (typeof node.type === 'function') {
    collectText(node.type(node.props), into)
    return into
  }
  collectText(node.props?.children, into)
  return into
}

/** Expands every function component once so the tree shows real elements. */
function dive(node) {
  if (node === null || typeof node !== 'object') return node
  if (Array.isArray(node)) return node.map(dive)
  if (typeof node.type === 'function') return dive(node.type(node.props))
  const children = node.props?.children
  return { type: node.type, props: { ...node.props, children: Array.isArray(children) ? children.map(dive) : children } }
}

/** Mounts one component with the hook data its scenario provides. */
function mount(component) {
  return dive(component())
}

const tree = settingsSlot.component()
const sections = []
walk(tree, (node) => {
  if (node.type === 'section' && node.props?.className === 'qols-feature') sections.push(node)
})
if (sections.length !== 1) throw new Error(`expected 1 feature card, got ${sections.length}`)

const buttons = []
walk(tree, (node) => {
  if (node.type === 'button' && node.props?.className === 'qols-feature-edit') buttons.push(node)
})
if (buttons.length !== 1) throw new Error(`expected an Edit button on the feature card, got ${buttons.length}`)
let studioCardType
walk(tree, (node) => {
  if (typeof node.type === 'function' && node.type.name === 'StudioCard') studioCardType = node.type
})
if (studioCardType === undefined) throw new Error('StudioCard missing from the settings tree')
let openedStudio = 0
const studioCard = dive(studioCardType({ onOpen() { openedStudio += 1 } }))
let studioCardButtons = 0
walk(studioCard, (node) => {
  if (node.type === 'button' && node.props?.className === 'qols-feature-edit') {
    studioCardButtons += 1
    if (!collectText(node, []).includes('Open Prompt Studio')) throw new Error('the Prompt Studio card button must say Open Prompt Studio')
    node.props.onClick()
  }
})
if (studioCardButtons !== 1) throw new Error(`expected one Open Studio button, got ${studioCardButtons}`)
if (openedStudio !== 1) throw new Error('Open Studio must request the dialog')

let mainStack = null
walk(tree, (node) => {
  if (node.type !== 'div' || node.props?.className !== 'qols-stack' || !Array.isArray(node.props?.children)) return
  const names = node.props.children.map((child) => typeof child?.type === 'function' ? child.type.name : '').filter(Boolean)
  if (names.includes('UsageSettings')) mainStack = names
})
if (mainStack === null) throw new Error('the main settings stack is missing')
const expectedOrder = ['UsageSettings', 'StudioCard', 'DiagnosticsPanel']
if (mainStack.join(',') !== expectedOrder.join(',')) {
  throw new Error(`Diagnostics must be the last settings card, got ${mainStack.join(', ')}`)
}

const pageTitles = []
walk(tree, (node) => {
  if (node.type === 'h2' && node.props?.className === 'qols-page-title') pageTitles.push(node)
})
if (pageTitles.length !== 1) throw new Error(`expected one page title, got ${pageTitles.length}`)
const groupTitles = []
walk(tree, (node) => {
  if (node.type === 'h3' && node.props?.className === 'qols-group-title') groupTitles.push(node)
})
if (groupTitles.length !== 1) throw new Error(`expected one group label, got ${groupTitles.length}`)

// Liked plugins: a separate settings section with one recommended installed and
// one absent entry; Install must call dshmarket's host route.
scenario.plan = [
  { 'billion-context': '0.1.213', dshmarket: '1.66.45' },
  { 'billion-context': { state: 'live' }, dshmarket: { state: 'live' } },
  { 'billion-context': { current: '0.1.213', latest: '0.2.0', updateAvailable: true }, dshmarket: { current: '1.66.45', latest: '1.73.17', updateAvailable: false, heldUpdate: { latest: '1.73.17', until: '2026-11-10T17:08:25.694Z' } } },
]
scenario.queue = 3
const likedTree = mount(() => likedSlot.component())
const likedText = collectText(likedTree, []).join(' ')
let likedContainer = false
let likedBareList = false
walk(likedTree, (node) => {
  if (node.props?.className === 'qols-studio-list') likedContainer = true
  if (node.props?.className === 'qols-liked-list') likedBareList = true
})
if (likedContainer) throw new Error('Liked plugins must not put its rows inside a card container')
if (!likedBareList) throw new Error('Liked plugins must render a bare row list')
for (const expected of ['Liked plugins', 'billion-context', 'Installed 0.1.213', 'Update available 0.2.0', 'Better Sidebar', 'Not installed', 'DSH Market', 'Installed 1.66.45', 'Core', 'Remove', 'Install', 'Update']) {
  if (!likedText.includes(expected)) throw new Error(`liked plugins section misses "${expected}": ${likedText.slice(0, 320)}`)
}
if (!likedText.includes('third-party plugins by other developers')) {
  throw new Error(`Liked plugins must credit the plugin authors: ${likedText.slice(0, 320)}`)
}
const repoLinks = []
walk(likedTree, (node) => {
  if (node.type === 'a') repoLinks.push(node)
})
if (repoLinks.length !== 3) throw new Error(`every liked plugin must link to its repository, got ${repoLinks.length}`)
for (const link of repoLinks) {
  if (typeof link.props?.href !== 'string' || !link.props.href.startsWith('https://github.com/')) {
    throw new Error(`a liked plugin repository link is not a GitHub URL: ${String(link.props?.href)}`)
  }
  if (link.props.target !== '_blank' || link.props.rel !== 'noopener noreferrer') {
    throw new Error(`a liked plugin repository link must open in a new tab: ${link.props.href}`)
  }
}
if (!repoLinks.some((link) => link.props.href === 'https://github.com/ranxianglei/billion-context')) {
  throw new Error('the billion-context row must link to its repository')
}
let coreLikedRow = null
walk(likedTree, (node) => {
  if (node.props?.className === 'qols-studio-row' && collectText(node, []).join(' ').includes('DSH Market')) coreLikedRow = node
})
if (coreLikedRow === null) throw new Error('liked plugins section has no DSH Market row')
const coreLikedText = collectText(coreLikedRow, []).join(' ')
if (coreLikedText.includes('Remove') || coreLikedText.includes('Turn off')) {
  throw new Error(`DSH Market is core and must not expose Remove or an off switch: ${coreLikedText}`)
}
let coreUpdateLiked = null
walk(coreLikedRow, (node) => {
  if (node.type === 'button' && collectText(node, []).join('') === 'Update') coreUpdateLiked = node
})
if (coreUpdateLiked === null) throw new Error(`DSH Market has a held update but no Update button: ${coreLikedText}`)
coreUpdateLiked.props.onClick()
await new Promise((resolve) => setTimeout(resolve, 0))
if (!marketCalls.some((call) => call.url.includes('/api/dsh-qols/liked/update-core') && call.body.includes('"version":"1.73.17"'))) {
  throw new Error(`Core update must use the QoLs pnpm route: ${JSON.stringify(marketCalls)}`)
}
if (marketCalls.some((call) => call.url.includes('/dsh-market/update') && call.body.includes('dshmarket'))) {
  throw new Error('DSH Market must never update itself through its own route')
}
let updateLiked = null
let toggleLiked = null
walk(likedTree, (node) => {
  if (node.type !== 'button') return
  const label = collectText(node, []).join('')
  if (label === 'Update' && updateLiked === null) updateLiked = node
  if (node.props?.className === 'qols-switch') toggleLiked = node
})
if (updateLiked === null) throw new Error('liked plugins section has no Update button')
if (toggleLiked === null) throw new Error('liked plugins section has no activation switch')
if (toggleLiked.props['aria-checked'] !== 'true') throw new Error('an active plugin switch must be on')
updateLiked.props.onClick()
await new Promise((resolve) => setTimeout(resolve, 0))
if (!marketCalls.some((call) => call.url.includes('/dsh-market/update') && call.body.includes('billion-context'))) {
  throw new Error(`Update must POST the package name: ${JSON.stringify(marketCalls)}`)
}
toggleLiked.props.onClick()
await new Promise((resolve) => setTimeout(resolve, 0))
if (!marketCalls.some((call) => call.url.includes('/dsh-market/toggle') && call.body.includes('"enabled":false'))) {
  throw new Error(`the switch must disable an active plugin: ${JSON.stringify(marketCalls)}`)
}
let installLiked = null
walk(likedTree, (node) => {
  if (node.type === 'button' && collectText(node, []).join('') === 'Install') installLiked = node
})
if (installLiked === null) throw new Error('liked plugins section has no Install button')
installLiked.props.onClick()
await new Promise((resolve) => setTimeout(resolve, 0))
if (!marketCalls.some((call) => call.url.includes('/dsh-market/install') && call.body.includes('DSH-better-sidebar'))) {
  throw new Error(`Install must POST the catalog URL to dshmarket: ${JSON.stringify(marketCalls)}`)
}

// Version lookup is manual: mounting must not spend a request, and the button
// must ask dshmarket to bypass its own cache.
const updatesBefore = marketCalls.filter((call) => call.url.includes('/dsh-market/updates')).length
scenario.plan = [
  { 'billion-context': '0.1.213', dshmarket: '1.66.45' },
  { 'billion-context': { state: 'live' }, dshmarket: { state: 'live' } },
  {},
]
scenario.queue = 3
const checkTree = mount(() => likedSlot.component())
if (marketCalls.filter((call) => call.url.includes('/dsh-market/updates')).length !== updatesBefore) {
  throw new Error('mounting Liked plugins must not check for updates automatically')
}
let checkButton = null
walk(checkTree, (node) => {
  if (node.type === 'button' && collectText(node, []).join('') === 'Check for updates') checkButton = node
})
if (checkButton === null) throw new Error('Liked plugins has no Check for updates button')
checkButton.props.onClick()
await new Promise((resolve) => setTimeout(resolve, 0))
if (!marketCalls.some((call) => call.url.includes('/dsh-market/updates?force=1'))) {
  throw new Error(`Check for updates must bypass the dshmarket cache: ${JSON.stringify(marketCalls)}`)
}

// A release held by dshmarket's minimum-release-age policy still has a newer
// version; the tab must expose it and force the update on explicit request.
scenario.plan = [
  { 'billion-context': '0.1.213' },
  { 'billion-context': { state: 'live' } },
  { 'billion-context': { current: '0.1.213', latest: '0.2.0', updateAvailable: false, heldUpdate: { latest: '0.2.0' } } },
]
scenario.queue = 3
const heldTree = mount(() => likedSlot.component())
let heldUpdate = null
walk(heldTree, (node) => {
  if (node.type === 'button' && collectText(node, []).join('') === 'Update') heldUpdate = node
})
if (heldUpdate === null) throw new Error('a held newer release must still expose Update')
heldUpdate.props.onClick()
await new Promise((resolve) => setTimeout(resolve, 0))
if (!marketCalls.some((call) => call.url.includes('/dsh-market/update') && call.body.includes('"force":true'))) {
  throw new Error(`updating a held release must ask dshmarket to force it: ${JSON.stringify(marketCalls)}`)
}
scenario.plan = []
scenario.queue = 0

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
if (source.includes('window.confirm')) throw new Error('destructive Studio actions must not use window.confirm')
if (!source.includes("'aria-checked'")) throw new Error('usage settings must expose aria-checked switches')

let dialogType
walk(tree, (node) => {
  if (typeof node.type === 'function' && node.type.name === 'FeatureDialog') dialogType = node.type
})
if (dialogType === undefined) throw new Error('FeatureDialog missing from the settings tree')
if (dialogType({ id: '', onClose() {} }) !== null) throw new Error('closed dialog must render nothing')

// The usage settings card maps its stored config straight onto switches. Render
// it directly with a config, so the key and the label cannot drift apart.
let usageSettingsType
walk(tree, (node) => {
  if (typeof node.type === 'function' && node.type.name === 'UsageSettings') usageSettingsType = node.type
})
if (usageSettingsType === undefined) throw new Error('UsageSettings missing from the settings tree')
scenario.plan = [{ hideCostMeter: true, showTokens: true, showAmounts: false }, null, false]
scenario.queue = 3
const usageSettingsTree = mount(() => usageSettingsType({}))
const usageSettingsText = collectText(usageSettingsTree, []).join(' ')
if (!usageSettingsText.includes("Show today's cost and wallet balance")) {
  throw new Error('usage settings must label the amounts switch: ' + usageSettingsText.slice(0, 320))
}
const usageSwitches = []
walk(usageSettingsTree, (node) => {
  if (node.type === 'button' && node.props?.className === 'qols-switch') usageSwitches.push(node)
})
if (usageSwitches.length !== 3) throw new Error(`expected 3 usage switches, got ${usageSwitches.length}`)
if (usageSwitches[2].props['aria-checked'] !== 'false') throw new Error('stored showAmounts:false must render the switch off')

const config = {
  provider: 'qols-auto',
  model: 'auto',
  tierOrder: ['eco', 'standard', 'deep'],
  tiers: {
    eco: { provider: 'deepseek-account', model: 'deepseek-flash', effort: 'off' },
    standard: { provider: 'deepseek-account', model: 'deepseek-flash', effort: 'high' },
    deep: { provider: 'deepseek-account', model: 'deepseek-v4-pro', effort: 'max' },
  },
  gray: { low: 0.35, high: 0.7 },
  classifier: { provider: 'deepseek-account', model: 'deepseek-flash', effort: 'off', timeoutMs: 2500, maxTokens: 8, source: 'default' },
}

const modelGroups = [
  { id: 'deepseek-account', name: 'DeepSeek (account)', models: [
    { id: 'deepseek-flash', name: 'DeepSeek Flash', efforts: ['off', 'high', 'max'], defaultEffort: 'high' },
    { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', efforts: ['off', 'high', 'max'], defaultEffort: 'high' },
  ] },
  { id: 'deepseek-official', name: 'DeepSeek (API key)', models: [
    { id: 'deepseek-flash', name: 'DeepSeek Flash', efforts: ['low', 'high'], defaultEffort: 'high' },
  ] },
]

const autoPlan = [config, modelGroups, 'deepseek-account|deepseek-flash', false, null, null, null, null]
scenario.plan = [...autoPlan]
scenario.queue = 8
const autoNode = mount(() => dialogType({ id: 'auto', onClose() {} }))
if (autoNode === null) throw new Error('auto dialog must render when open')
const autoTree = dive(autoNode)
const autoText = collectText(autoTree, []).join(' ')
for (const expected of ['Judge model', 'DeepSeek Flash \u00b7 deepseek-flash', 'Save', 'thinking: off', 'Tier routes and thresholds']) {
  if (!autoText.includes(expected)) throw new Error('Auto dialog misses "' + expected + '": ' + autoText.slice(0, 320))
}
let modal = null
walk(autoTree, (node) => {
  if (node.props?.role === 'dialog') modal = node
})
if (modal === null) throw new Error('FeatureDialog must expose role=dialog')
if (modal.props['aria-modal'] !== 'true') throw new Error('FeatureDialog must be a modal')
if (typeof modal.props['aria-labelledby'] !== 'string') throw new Error('FeatureDialog must be labelled')
let dialogClose = 0
walk(autoTree, (node) => {
  if (node.type === 'button' && node.props?.className === 'qols-dialog-close') dialogClose += 1
})
if (dialogClose !== 1) throw new Error('FeatureDialog needs one icon close button, got ' + dialogClose)
let selects = 0
walk(autoTree, (node) => { if (node.type === 'select') selects += 1 })
if (selects !== 1) throw new Error('expected exactly one judge-model select, got ' + selects)
let optgroups = 0
walk(autoTree, (node) => { if (node.type === 'optgroup') optgroups += 1 })
if (optgroups !== 2) throw new Error('expected one group per model connection, got ' + optgroups)
let options = 0
walk(autoTree, (node) => { if (node.type === 'option') options += 1 })
if (options !== 3) throw new Error('expected three models in the dropdown, got ' + options)

// Studio: the card opens a dialog, whose active tab can hand a questionnaire to a new session.
let studioDialogType
walk(tree, (node) => {
  if (typeof node.type === 'function' && node.type.name === 'StudioDialog') studioDialogType = node.type
})
if (studioDialogType === undefined) throw new Error('StudioDialog missing from the settings tree')
if (studioDialogType({ open: false, onClose() {} }) !== null) throw new Error('a closed Studio dialog must render nothing')

let closed = 0
scenario.plan = [{
  ok: true,
  roots: [
    { id: 'project', dir: 'C:/repo/.dsh/skills', exists: true, skills: 1, available: true, projectDir: 'C:/repo' },
    { id: 'user', dir: 'C:/home/.dsh/skills', exists: false, skills: 0, available: true },
  ],
  skills: [{
    name: 'release-notes',
    source: 'project',
    description: 'Write release notes',
    body: '# Steps',
    path: 'C:/repo/.dsh/skills/release-notes/SKILL.md',
    valid: true,
  }],
}, 'skills', null, false, null]
scenario.queue = 5
const studioRaw = studioDialogType({ open: true, onClose() { closed += 1 } })
const studioTree = dive(studioRaw)
const studioText = collectText(studioTree, []).join(' ')
for (const expected of ['Prompt Studio', '1 skill', 'Skills', 'Commands', 'Rules', 'Agents', 'Global AGENTS.md', 'release-notes', 'Write release notes', 'New skill', 'Create via chat']) {
  if (!studioText.includes(expected)) throw new Error(`studio dialog misses "${expected}": ${studioText.slice(0, 320)}`)
}
let studioOverlay = null
walk(studioTree, (node) => {
  if (typeof node.props?.className === 'string' && node.props.className.split(' ').includes('qols-dialog-overlay')) studioOverlay = node
})
if (studioOverlay === null) throw new Error('Studio dialog must render a dialog overlay')
if (typeof studioOverlay.props.onClick === 'function') {
  studioOverlay.props.onClick({ target: studioOverlay.props, currentTarget: studioOverlay.props })
  if (closed !== 0) throw new Error('clicking the dimmed backdrop must not close Prompt Studio')
}
let studioChatButtons = 0
let chatButton = null
walk(studioTree, (node) => {
  if (node.type === 'button' && typeof node.props?.className === 'string' && node.props.className.includes('qols-studio-chat')) {
    studioChatButtons += 1
    chatButton = node
  }
})
if (studioChatButtons !== 1) throw new Error(`expected one create-via-chat button on the active tab, got ${studioChatButtons}`)
chatButton.props.onClick()
if (startedSessions.length !== 1) throw new Error('create via chat must start exactly one session')
const started = startedSessions[0]
if (started.workspaceId !== undefined) throw new Error('create via chat must open a session in the current workspace')
if (typeof started.options?.prompt !== 'string' || !started.options.prompt.includes('skill')) {
  throw new Error(`chat prompt must describe a skill: ${String(started.options?.prompt).slice(0, 120)}`)
}
if (started.options?.whenDraftExists !== 'replace') throw new Error('chat prompt must replace an existing questionnaire instead of stacking it')
if (closed !== 1) throw new Error('starting a chat from the dialog must close it')

// Every tab must render without throwing: the Commands header reads its filtered list.
let studioPanelType
walk(studioRaw, (node) => {
  if (typeof node.type === 'function' && node.type.name === 'StudioPanel') studioPanelType = node.type
})
if (studioPanelType === undefined) throw new Error('StudioPanel missing from the open dialog')
scenario.plan = [{ ok: true, commands: [] }, 'commands', null, false, null]
scenario.queue = 5
const commandsTree = dive(studioPanelType({ inDialog: true, onClose() {} }))
const commandsText = collectText(commandsTree, []).join(' ')
if (!commandsText.includes('Create via chat')) throw new Error('the Commands tab lost the chat action')
if (!commandsText.includes('No commands')) throw new Error(`the Commands tab did not render its empty state: ${commandsText.slice(0, 160)}`)

// The instruction tab edits the global AGENTS.md through one text field, so the
// list-only actions (search, new, create via chat) must be absent there.
scenario.plan = [{ ok: true, skills: [] }, 'instruction', null, false, null]
scenario.queue = 5
const instructionTree = dive(studioPanelType({ inDialog: true, onClose() {} }))
const instructionText = collectText(instructionTree, []).join(' ')
if (!instructionText.includes('Global AGENTS.md')) throw new Error('the instruction tab label is missing')
if (!instructionText.includes('Reload') || !instructionText.includes('Save')) {
  throw new Error(`the instruction tab lost its actions: ${instructionText.slice(0, 240)}`)
}
let instructionTextareas = 0
let instructionSearch = 0
let instructionChat = 0
walk(instructionTree, (node) => {
  if (node.type === 'textarea') instructionTextareas += 1
  if (node.type === 'input' && node.props?.type === 'search') instructionSearch += 1
  if (node.type === 'button' && typeof node.props?.className === 'string' && node.props.className.includes('qols-studio-chat')) instructionChat += 1
})
if (instructionTextareas !== 1) throw new Error(`the instruction tab needs exactly one editor, got ${instructionTextareas}`)
if (instructionSearch !== 0) throw new Error('the instruction tab must not show the list search field')
if (instructionChat !== 0) throw new Error('the instruction tab must not show the create-via-chat action')

// Search: the field filters the active tab and reports an empty result.
let searchInputs = 0
walk(studioTree, (node) => { if (node.type === 'input' && node.props?.type === 'search') searchInputs += 1 })
if (searchInputs !== 1) throw new Error(`expected one search field, got ${searchInputs}`)
scenario.plan = [{
  ok: true,
  roots: [{ id: 'project', dir: 'C:/repo/.dsh/skills', exists: true, skills: 1, available: true }],
  skills: [{ name: 'release-notes', source: 'project', description: 'Write release notes', body: '', path: 'C:/repo/.dsh/skills/release-notes/SKILL.md', valid: true }],
}, 'skills', null, false, null, 'zzz']
scenario.queue = 6
const filteredTree = dive(studioDialogType({ open: true, onClose() {} }))
const filteredText = collectText(filteredTree, []).join(' ')
if (filteredText.includes('release-notes')) throw new Error('search must hide non-matching skills')
if (!filteredText.includes('Nothing matches this search')) throw new Error('search must explain an empty result')
if (!filteredText.includes('0 skills')) throw new Error('the count must follow the filtered list')

// Inline editing: the form lives inside the row being edited, not above the list.
scenario.plan = [{
  ok: true,
  roots: [{ id: 'project', dir: 'C:/repo/.dsh/skills', exists: true, skills: 1, available: true }],
  skills: [{ name: 'release-notes', source: 'project', description: 'Write release notes', body: '# Steps', path: 'C:/repo/.dsh/skills/release-notes/SKILL.md', valid: true }],
}, 'skills', {
  editing: true,
  source: 'project',
  name: 'release-notes',
  description: 'Write release notes',
  whenToUse: '',
  body: '# Steps',
  disableModelInvocation: false,
  userInvocable: true,
  metadataLines: [],
  unknown: [],
}, false, null]
scenario.queue = 5
const editingTree = dive(studioDialogType({ open: true, onClose() {} }))
let inlineForm = null
walk(editingTree, (node) => {
  if (typeof node.props?.className === 'string' && node.props.className.split(' ').includes('qols-studio-list')) {
    walk(node, (child) => {
      if (typeof child.props?.className === 'string' && child.props.className.split(' ').includes('qols-studio-row')) {
        walk(child, (nested) => {
          if (typeof nested.props?.className === 'string' && nested.props.className.split(' ').includes('qols-studio-form')) inlineForm = nested
        })
      }
    })
  }
})
if (inlineForm === null) throw new Error('the edit form must render inside the edited row')

// Composer badge: nothing before the first decision, then the tier alone.
scenario.plan = [null]
scenario.queue = 1
if (badgeSlot.component({ sessionId: 'session-1' }) !== null) {
  throw new Error('badge must render nothing before the first decision')
}
scenario.plan = [{
  tier: 'deep',
  provider: 'deepseek-account',
  model: 'deepseek-v4-pro',
  effort: 'max',
  source: 'heuristic',
  score: 0.8,
  signals: ['plan'],
}]
scenario.queue = 1
const badge = mount(() => badgeSlot.component({ sessionId: 'session-1' }))
const badgeText = collectText(badge, []).join(' ')
if (badge === null || !badgeText.includes('Deep')) throw new Error(`badge must show the tier, got: ${badgeText}`)
if (badgeText.includes('deepseek') || badgeText.includes('max')) {
  throw new Error(`badge must show only the tier, got: ${badgeText}`)
}
if (!String(badge.props.title ?? '').includes('deepseek-v4-pro/max')) {
  throw new Error(`badge tooltip must keep the route, got: ${badge.props.title}`)
}

// Usage: the footer card and the per-turn cost line.
const usageSlot = registrations.find((entry) => entry.meta.id === 'qols-usage')
if (usageSlot === undefined) throw new Error('usage card was not registered')
if (usageSlot.meta.name !== 'sidebar.footer.action') throw new Error('usage card went into ' + usageSlot.meta.name)
const turnSlot = registrations.find((entry) => entry.meta.id === 'qols-usage-turn')
if (turnSlot === undefined) throw new Error('turn cost line was not registered')
if (turnSlot.meta.name !== 'conversation.chat.turnTail') throw new Error('turn cost went into ' + turnSlot.meta.name)

/** Host payload of GET /api/dsh-qols/usage/status, trimmed to what the card reads. */
const usagePayload = {
  ok: true,
  enabled: true,
  settings: { showTokens: true, hideCostMeter: true, showAmounts: true, balanceWarnBelow: 5 },
  today: { cost: 2.2108, tokens: { total: 7_700_000 }, models: [{ model: 'deepseek-v4-pro', cost: 2.1, tokens: 7_000_000 }] },
  peak: {
    phase: 'offpeak',
    weekend: false,
    holiday: false,
    percent: 0.42,
    hasWindows: true,
    startAt: '2026-11-03T04:00:00.000Z',
    endAt: '2026-11-03T06:00:00.000Z',
    untilAt: '2026-11-03T06:00:00.000Z',
    day: {
      startAt: '2026-11-03T00:00:00.000Z',
      endAt: '2026-11-04T00:00:00.000Z',
      nowAt: '2026-11-03T10:04:48.000Z',
      percent: 0.42,
      segments: [
        { startAt: '2026-11-03T00:00:00.000Z', endAt: '2026-11-03T01:00:00.000Z', peak: false },
        { startAt: '2026-11-03T01:00:00.000Z', endAt: '2026-11-03T04:00:00.000Z', peak: true },
        { startAt: '2026-11-03T04:00:00.000Z', endAt: '2026-11-03T06:00:00.000Z', peak: false },
        { startAt: '2026-11-03T06:00:00.000Z', endAt: '2026-11-03T10:00:00.000Z', peak: true },
        { startAt: '2026-11-03T10:00:00.000Z', endAt: '2026-11-04T00:00:00.000Z', peak: false },
      ],
    },
  },
  balance: {
    state: 'ready',
    wallets: [
      { kind: 'grant', currency: 'CNY', amount: 12.5 },
      { kind: 'topup', currency: 'USD', amount: 2.58 },
    ],
  },
  turn: null,
}
scenario.plan = [usagePayload]
scenario.queue = 1
const usageTree = mount(() => usageSlot.component())
const usageText = collectText(usageTree, []).join(' ')
for (const expected of ['Today', '$2.2108', 'Balance', '$2.5800', 'Off-peak']) {
  if (!usageText.includes(expected)) throw new Error(`usage card misses "${expected}": ${usageText.slice(0, 320)}`)
}
if (!String(usageTree.props.title ?? '').includes('7.7M')) throw new Error('usage card tooltip must carry the token total')

let peakMarker = null
const peakSegments = []
walk(usageTree, (node) => {
  if (node.props?.className === 'qols-peak-marker') peakMarker = node
  if (String(node.props?.className ?? '').startsWith('qols-peak-segment ')) peakSegments.push(node)
})
if (peakMarker === null) throw new Error('usage card has no peak marker')
// The rail is the whole local day: 42% elapsed is 42% of the rail.
if (String(peakMarker.props.style?.left) !== '42.0%') {
  throw new Error('peak marker must show the time of day, got ' + String(peakMarker.props.style?.left))
}
const peakSpans = peakSegments.filter((node) => node.props.className.includes('qols-peak-high'))
const offSpans = peakSegments.filter((node) => node.props.className.includes('qols-peak-low'))
if (peakSpans.length !== 2 || offSpans.length !== 3) {
  throw new Error(`day rail must draw 2 peak and 3 off-peak spans, got ${peakSpans.length}/${offSpans.length}`)
}
if (String(peakSpans[0].props.style?.left) !== '4.167%' || String(peakSpans[0].props.style?.width) !== '12.500%') {
  throw new Error('first peak span must cover 01:00–04:00, got ' + JSON.stringify(peakSpans[0].props.style))
}

// The amounts are optional: with the switch off neither money row is drawn and
// the rail plus chip keep the card useful.
scenario.plan = [{ ...usagePayload, settings: { ...usagePayload.settings, showAmounts: false } }]
scenario.queue = 1
const hiddenTree = mount(() => usageSlot.component())
const hiddenText = collectText(hiddenTree, []).join(' ')
if (hiddenText.includes('Today') || hiddenText.includes('Balance') || hiddenText.includes('$')) {
  throw new Error(`hidden amounts must remove both money rows: ${hiddenText.slice(0, 320)}`)
}
if (!hiddenText.includes('Off-peak')) throw new Error('hidden amounts must keep the phase chip')
let hiddenMarker = null
walk(hiddenTree, (node) => { if (node.props?.className === 'qols-peak-marker') hiddenMarker = node })
if (hiddenMarker === null) throw new Error('hidden amounts must keep the day rail')

// Startup: the wallet is not known yet. Today must wait for it instead of
// painting alone and letting Balance pop in five seconds later.
scenario.plan = [{ ...usagePayload, balance: { state: 'unknown', wallets: [], at: null } }]
scenario.queue = 1
const pendingTree = mount(() => usageSlot.component())
const pendingText = collectText(pendingTree, []).join(' ')
if (pendingText.includes('Today') || pendingText.includes('$2.2108')) {
  throw new Error(`an unknown wallet must hold the whole money row: ${pendingText.slice(0, 320)}`)
}
if (pendingText.includes('Balance')) throw new Error('an unknown wallet must not draw an empty Balance')
if (!pendingText.includes('Off-peak')) throw new Error('the rail must be drawn while the wallet is unknown')

// The tail answers for one turn: the host route returns that turn's own totals,
// so the component is told which turn it renders and never polls "the current
// turn" (which would print the next request's cost under this message).
const turnPayload = {
  ok: true,
  session: 'session-1',
  turn: 3,
  calls: 2,
  cost: 0.5091,
  tokens: { input: 100000, output: 20000, cacheRead: 0, cacheWrite: 0, reasoning: 0, total: 120000 },
  recent: [
    { at: '2026-11-03T04:01:00.000Z', model: 'deepseek-flash', cost: 0.2, tokens: { total: 60000 } },
    { at: '2026-11-03T04:02:00.000Z', model: 'deepseek-v4-pro', cost: 0.3091, tokens: { total: 60000 } },
  ],
  open: false,
}
scenario.plan = [turnPayload]
scenario.queue = 1
if (typeof turnSlot.component !== 'function') throw new Error('turn slot component is not a function')
const turnTree = mount(() => turnSlot.component({ sessionId: 'session-1', turn: { turn: 3, status: 'closed' } }))
if (turnTree === null) throw new Error(`turn cost line rendered nothing (component ${turnSlot.component.name}, queue ${scenario.queue}, plan ${scenario.plan.length})`)
const turnText = collectText(turnTree, []).join(' ')
for (const expected of ['Turn cost', '$0.5091', '2 calls', 'deepseek-v4-pro']) {
  if (!turnText.includes(expected)) throw new Error(`turn cost line misses "${expected}": ${turnText.slice(0, 320)}`)
}

console.log('QOLS UI SMOKE PASSED')
console.log(`- module id: ${definition.id}`)
console.log(`- registered slots: ${registrations.map((entry) => entry.meta.name).join(', ')}`)
console.log('- feature cards: 1, Edit buttons: 1')
console.log('- auto dialog: judge select with 2 connection groups and 3 model options')
console.log('- badge: tier-only label with the route kept in the tooltip')
console.log('- usage card: today cost/tokens, grant-first balance, peak chip')
console.log('- usage settings: 3 switches, amounts switch reflects showAmounts')
console.log('- studio: card opens a 5-tab overlay; the instruction tab edits AGENTS.md; chat hands a skill questionnaire to uiWorkspace and closes')
console.log('- turn line: details summary with cost, calls and per-call rows')
