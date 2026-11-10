import { createRouter } from '../features/auto/router.js'
import { config } from '../features/auto/config.js'

const calls = []
const llm = {
  async resolveCallConfig({ provider, model, reasoningEffort }) {
    calls.push({ provider, model, reasoningEffort })
    return { provider, model, reasoningEffort }
  },
}
const journal = { entries: [], record(entry) { this.entries.push(entry) }, last() { return this.entries.at(-1) ?? null } }
const router = createRouter({ llm, config, journal, log: () => {}, classify: async () => null })

const long = 'Пожалуйста, отрефактори архитектуру этого модуля, добавь тесты на гонки и докажи, почему падает воркер при нагрузке. ' +
  'Нужно разобрать регрессию в планировщике задач и объяснить причину падений после последнего релиза, включая гонки потоков и утечки памяти. ' +
  'Опиши план миграции, риски и проверки для каждого шага, а также подготовь минимальный воспроизводимый пример с логами.'
const withImage = [{ role: 'user', content: [{ type: 'text', text: long }, { type: 'image', attachment: 'a1' }] }]
const withoutImage = [{ role: 'user', content: [{ type: 'text', text: long }] }]

const imageDecision = await router.decide({ sessionId: 'image-guard', messages: withImage, reasoningEffort: 'auto', provider: 'qols-auto', model: 'auto' })
console.log('image task tier:', imageDecision.tier, 'signals:', (imageDecision.signals ?? []).join(','))
if (imageDecision.tier !== 'standard') throw new Error(`image task must not route to deep, got ${imageDecision.tier}`)
if (!(imageDecision.signals ?? []).includes('image-guard')) throw new Error('missing image-guard signal')

const textDecision = await router.decide({ sessionId: 'text-guard', messages: withoutImage, reasoningEffort: 'auto', provider: 'qols-auto', model: 'auto' })
console.log('text task tier:', textDecision.tier)
if (textDecision.tier !== 'deep') throw new Error(`complex text task must route to deep, got ${textDecision.tier}`)

const explicit = await router.decide({ sessionId: 'explicit-image', messages: withImage, reasoningEffort: 'deep', provider: 'qols-auto', model: 'auto' })
console.log('explicit deep with image:', explicit.tier, explicit.source)
if (explicit.tier !== 'deep' || explicit.source !== 'selected') throw new Error('explicit picker tier must be honoured')

console.log('IMAGE GUARD TESTS PASSED')
