/**
 * The gray-zone judge.
 *
 * One cheap call to the configured classifier route (`deepseek-flash`, thinking
 * off, temperature 0, a handful of output tokens) that answers a single word:
 * `eco`, `standard` or `deep`. It only runs when the heuristic lands inside the
 * gray zone, so ordinary tasks never pay for it.
 */

import { messageText, lastUserMessage } from './heuristic.js'

const SYSTEM = [
  'You route a coding-assistant request to one of three model tiers.',
  'Answer with exactly one lowercase word: eco, standard, or deep.',
  'eco: greetings, thanks, a single factual question, showing or renaming one file, formatting.',
  'standard: an ordinary edit, a small self-contained feature, a quick fix in one file.',
  'deep: multi-file refactors, architecture or migration work, hard debugging, proofs,',
  'performance work, or anything that needs a plan before editing.',
].join(' ')

/** Keep the judge prompt bounded even for huge tasks. */
function clampText(text, limit) {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length <= limit ? clean : `${clean.slice(0, limit)}\n[truncated]`
}

function buildPrompt(taskText, result, limit) {
  const lines = [
    `heuristic score: ${result.score}`,
    `signals: ${result.signals.length > 0 ? result.signals.join(', ') : 'none'}`,
    `task length: ${taskText.length} characters`,
    '',
    clampText(taskText, limit),
  ]
  return lines.join('\n')
}

function parseAnswer(text) {
  const clean = String(text ?? '').toLowerCase()
  const match = clean.match(/\b(eco|standard|deep)\b/)
  return match ? match[1] : null
}

/**
 * @param {{ llm: object, config: object, log: (message: string) => void }} deps
 * @returns {(input: { options: object, result: object }) => Promise<{ tier: string, ms: number } | null>}
 */
export function createClassifier({ llm, config, log }) {
  const route = config.classifier

  return async function classify({ options, result }) {
    const messages = Array.isArray(options?.messages) ? options.messages : []
    const task = lastUserMessage(messages)
    const text = messageText(task)
    if (!text.trim()) return null

    const started = Date.now()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(new Error('qols-auto classifier timeout')), route.timeoutMs)
    const onAbort = () => controller.abort(options?.signal?.reason)
    if (options?.signal) {
      if (options.signal.aborted) {
        clearTimeout(timer)
        return null
      }
      options.signal.addEventListener('abort', onAbort, { once: true })
    }

    try {
      let answer = ''
      for await (const chunk of llm.stream({
        provider: route.provider,
        model: route.model,
        reasoningEffort: route.effort,
        maxTokens: route.maxTokens,
        temperature: 0,
        system: SYSTEM,
        messages: [{ role: 'user', content: [{ type: 'text', text: buildPrompt(text, result, config.classifier.textLimit) }] }],
        signal: controller.signal,
      })) {
        if (chunk?.type === 'text-delta' && typeof chunk.text === 'string') answer += chunk.text
        if (answer.length > 64) break
      }
      const tier = parseAnswer(answer)
      if (!tier) {
        log?.(`[qols-auto] classifier answered ${JSON.stringify(answer.slice(0, 32))}; keeping heuristic`)
        return null
      }
      return { tier, ms: Date.now() - started }
    } catch (error) {
      log?.(`[qols-auto] classifier failed: ${error instanceof Error ? error.message : String(error)}`)
      return null
    } finally {
      clearTimeout(timer)
      options?.signal?.removeEventListener?.('abort', onAbort)
    }
  }
}
