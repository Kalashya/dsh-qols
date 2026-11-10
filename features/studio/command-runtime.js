/**
 * Registration of the stored studio commands into the harness command surface.
 *
 * The `commands` service is not part of the host bundle's base context: it is
 * composed by the application, so the plugin waits for it with `ctx.inject`
 * and re-registers whenever the stored registry changes. Every registration
 * returns a disposer; `sync()` disposes the previous set first so a renamed or
 * deleted command never lingers in the composer until a restart.
 */

import { messageOf } from '../util.js'

/**
 * The stored command's text with the composer input substituted.
 *
 * Supported placeholders: `{input}` (the whole tail), `{args}` (all arguments
 * joined by single spaces) and `{args[N]}` (the N-th whitespace-separated
 * argument, empty when absent). Anything else is left alone.
 */
export function applyTemplate(template, input) {
  const args = input === '' ? [] : input.split(/\s+/)
  return String(template).replace(/\{input\}|\{args\}|\{args\[(\d+)\]\}/g, (whole, index) => {
    if (whole === '{input}') return input
    if (whole === '{args}') return args.join(' ')
    const value = args[Number(index)]
    return value === undefined ? '' : value
  })
}

const PLACEHOLDER = /\{(?:input|args|args\[\d+\])\}/

/**
 * One stored command as a `ctx.commands.register` definition.
 *
 * The handler only ever does one of three bounded things; the tier action
 * delegates the actual switch to `setTier`, which the feature supplies so the
 * runtime never imports the Auto internals.
 */
function toDefinition(command, { setTier }) {
  return {
    name: command.name,
    description: command.description,
    ...(command.action.type === 'prompt' ? { input: { hint: '[args]' } } : {}),
    handler: async ({ agent, rawInput } = {}) => {
      const input = typeof rawInput === 'string' ? rawInput.trim() : ''
      if (command.action.type === 'say') {
        return { kind: 'success', text: applyTemplate(command.action.text, input) }
      }
      if (command.action.type === 'tier') {
        setTier(command.action.tier)
        return { kind: 'success', text: `Auto tier: ${command.action.tier}.` }
      }
      const template = command.action.text
      const text = PLACEHOLDER.test(template)
        ? applyTemplate(template, input)
        : input === '' ? template : `${template}\n\n${input}`
      if (text.trim() === '') {
        return { kind: 'error', text: `/${command.name} needs a message.` }
      }
      if (agent === undefined || agent === null) {
        return { kind: 'error', text: 'No active agent to receive this command.' }
      }
      agent.followup({ content: [{ type: 'text', text }], source: { kind: 'user' } })
      return { kind: 'success', text: 'Sent to the agent.' }
    },
  }
}

/**
 * The built-in `/rule` command: list the enabled rules, or insert one rule's
 * body into the current session as a user message.
 */
function ruleDefinition({ getRules }) {
  return {
    name: 'rule',
    description: 'Insert a Prompt Studio rule into this session',
    input: { hint: '<rule-name>' },
    handler: async ({ agent, rawInput } = {}) => {
      const rules = getRules().filter((rule) => rule.valid === true && rule.enabled !== false)
      const name = (typeof rawInput === 'string' ? rawInput.trim() : '').split(/\s+/)[0] ?? ''
      if (name === '') {
        return {
          kind: 'success',
          text: rules.length === 0
            ? 'No rules are enabled.'
            : `Rules: ${rules.map((rule) => rule.name).join(', ')}`,
        }
      }
      const rule = rules.find((entry) => entry.name === name)
      if (rule === undefined) {
        return { kind: 'error', text: `Rule "${name}" is not enabled.` }
      }
      if (agent === undefined || agent === null) {
        return { kind: 'error', text: 'No active agent to receive this rule.' }
      }
      const text = `# Rule: ${rule.name}\n\n${String(rule.body).trim()}`
      agent.followup({ content: [{ type: 'text', text }], source: { kind: 'user' } })
      return { kind: 'success', text: `Rule "${name}" applied to this turn.` }
    },
  }
}

/**
 * Keep the harness registry in sync with the JSON file.
 *
 * `attach(ctx)` must be called once from the feature; `sync()` may be called
 * after every write. `describe()` is the panel's view of what is registered.
 */
export function createCommandRuntime({ store, log = () => {}, setTier, getRules }) {
  /** @type {{ register: (definition: object) => unknown } | undefined} */
  let service
  let disposers = []
  let builtinDispose = null
  let state = []

  function stop() {
    for (const dispose of disposers) {
      try {
        if (typeof dispose === 'function') dispose()
      } catch (error) {
        log(`[qols-studio] command dispose failed: ${messageOf(error)}`)
      }
    }
    disposers = []
  }

  function sync() {
    stop()
    const commands = store.read()
    if (service === undefined) {
      state = commands.map((command) => ({ ...command, registered: false, error: 'the commands service is not available' }))
      return state
    }
    state = commands.map((command) => {
      try {
        const dispose = service.register(toDefinition(command, { setTier }))
        if (typeof dispose === 'function') disposers.push(dispose)
        return { ...command, registered: true, error: null }
      } catch (error) {
        const text = messageOf(error)
        log(`[qols-studio] command "${command.name}" not registered: ${text}`)
        return { ...command, registered: false, error: text.slice(0, 300) }
      }
    })
    return state
  }

  return {
    /**
     * Wait for the application's `commands` service, then register everything
     * the file holds. The inject fiber is a child of the plugin context, so the
     * registrations unwind with the plugin.
     */
    attach(ctx) {
      ctx.inject(['commands'], (commandCtx) => {
        service = commandCtx.commands
        commandCtx.effect(() => {
          if (typeof getRules === 'function') {
            try {
              const dispose = service.register(ruleDefinition({ getRules }))
              if (typeof dispose === 'function') builtinDispose = dispose
            } catch (error) {
              log(`[qols-studio] /rule not registered: ${messageOf(error)}`)
            }
          }
          return () => {
            if (builtinDispose !== null) {
              try {
                builtinDispose()
              } catch (error) {
                log(`[qols-studio] /rule dispose failed: ${messageOf(error)}`)
              }
              builtinDispose = null
            }
            service = undefined
            stop()
            state = []
          }
        }, 'qols: studio commands lifetime')
        sync()
      })
    },
    sync,
    describe: () => state,
  }
}
