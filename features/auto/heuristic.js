/**
 * Deterministic task-complexity heuristic.
 *
 * The score is a number in [0, 1]; the gray zone bounds live in `config.gray`.
 * Outside the gray zone the tier is decided here for free. Inside it the caller
 * asks the cheap classifier (`classifier.js`) instead.
 *
 * The function is pure so it can be tested without a session.
 */

import { config as defaultConfig } from './config.js'

/** Phrases that usually mean the task deserves the deep route. */
const COMPLEX = [
  /рефактор/i,
  /архитектур/i,
  /спроектир/i,
  /переписать/i,
  /оптимизир/i,
  /производительност/i,
  /миграц/i,
  /докажи/i,
  /исследуй/i,
  /разберись/i,
  /почему (падает|не работ|ломается)/i,
  /\b(refactor|architecture|migrat|benchmark|optimi[sz]e|debug|root cause)\b/i,
  /\b(design|plan|implement|investigate|analy[sz]e)\b/i,
]

/**
 * Phrases that usually mean the task is trivial.
 *
 * `\b` is ASCII-only in JavaScript, so Cyrillic prefixes use a Unicode
 * lookahead instead of a word boundary.
 */
const TRIVIAL = [
  /^(привет|здравствуй|спасибо|ок|да|нет|hello|hi|hey|thanks|thank you|ok|okay|yes|no)(?![\p{L}\p{N}_])/iu,
  /^(что такое|кто такой|what is|who is|сколько будет)(?![\p{L}\p{N}_])/iu,
  /^(покажи|открой|найди|выведи|show|open|find|list|cat)(?![\p{L}\p{N}_])/iu,
  /^(переименуй|форматируй|rename|format|lint)(?![\p{L}\p{N}_])/iu,
]

/** Explicit requests for careful reasoning always take the deep route. */
const FORCE_DEEP = [/подумай тщательно/iu, /\bthink (hard|carefully)\b/i, /шаг за шагом/iu, /step by step/i]

/** Short questions cost almost nothing to answer. */
const SHORT_QUESTION = /\?\s*$/u

/**
 * Messages the user actually typed.
 *
 * The session log also contains user-role messages produced by the harness
 * itself (the `[model changed: ...]` notice has `source.kind: 'model-selection'`).
 * They must never be read as the task text.
 */
export function isUserAuthored(message) {
  const kind = message?.source?.kind
  return kind === undefined || kind === 'user'
}

/** Text of a message's text blocks, ignoring images, files and tool calls. */
export function messageText(message) {
  if (!message || !Array.isArray(message.content)) return ''
  const parts = []
  for (const block of message.content) {
    if (typeof block === 'string') parts.push(block)
    else if (block && block.type === 'text' && typeof block.text === 'string') parts.push(block.text)
  }
  return parts.join('\n')
}

/** The last user-authored message in the call, or undefined. */
export function lastUserMessage(messages) {
  if (!Array.isArray(messages)) return undefined
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i]
    if (message && message.role === 'user' && isUserAuthored(message)) return message
  }
  return undefined
}

function countBlocks(message, predicate) {
  if (!message || !Array.isArray(message.content)) return 0
  let total = 0
  for (const block of message.content) if (block && predicate(block)) total += 1
  return total
}

function hits(patterns, text) {
  const found = []
  for (const pattern of patterns) if (pattern.test(text)) found.push(pattern.source)
  return found
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

/**
 * @param {object} options llm GenerateOptions for the pending call
 * @param {object} [config]
 * @returns {{ score: number, tier: string|null, signals: string[], chars: number, fences: number }}
 */
export function evaluate(options, config = defaultConfig) {
  const messages = Array.isArray(options?.messages) ? options.messages : []
  const task = lastUserMessage(messages)
  const text = messageText(task).trim()
  const chars = text.length
  const fences = (text.match(/```/g) ?? []).length >> 1
  const signals = []

  let score = 0.5

  if (chars >= 400) {
    score += 0.1
    signals.push('long-task')
  }
  if (chars >= 1200) {
    score += 0.1
    signals.push('very-long-task')
  }
  if (chars >= 3000) {
    score += 0.1
    signals.push('huge-task')
  }
  if (chars <= 120 && chars > 0) {
    score -= 0.15
    signals.push('short-task')
  }
  if (fences > 0) {
    score += Math.min(0.15, 0.05 * fences)
    signals.push('fenced-code')
  }

  const complex = hits(COMPLEX, text)
  if (complex.length > 0) {
    score += Math.min(0.36, 0.18 * complex.length)
    signals.push('complex-keyword')
  }

  const trivial = hits(TRIVIAL, text)
  if (trivial.length > 0) {
    score -= Math.min(0.5, 0.25 * trivial.length)
    signals.push('trivial-keyword')
  }

  const attachments = countBlocks(task, (block) => block.type === 'image' || block.type === 'file')
  if (attachments > 0) {
    score += Math.min(0.1, 0.05 * attachments)
    signals.push('attachments')
  }

  score = clamp(Number(score.toFixed(3)), 0, 1)

  // Precedence matters: an explicit reasoning request or a complexity phrase
  // always outranks the cheap "short question" shortcut.
  let tier = null
  if (hits(FORCE_DEEP, text).length > 0) {
    tier = 'deep'
    signals.push('force-deep')
  } else if (trivial.length > 0 && chars <= 200 && fences === 0) {
    tier = 'eco'
    signals.push('force-eco')
  } else if (complex.length === 0 && chars <= 200 && fences === 0 && attachments === 0 && SHORT_QUESTION.test(text)) {
    tier = 'eco'
    signals.push('short-question')
  } else if (score <= config.gray.low) {
    tier = 'eco'
  } else if (score >= config.gray.high) {
    tier = 'deep'
  }

  return { score, tier, signals, chars, fences }
}

/** Tier used when the classifier is unavailable or answers garbage. */
export function fallbackTier(result, config = defaultConfig) {
  if (result.tier) return result.tier
  const middle = (config.gray.low + config.gray.high) / 2
  return result.score >= middle ? 'standard' : 'eco'
}
