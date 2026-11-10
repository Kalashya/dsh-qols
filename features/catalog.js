/** Browser-safe feature list. The host serves it to the client at /api/dsh-qols/catalog. */
export const catalog = [
  {
    id: 'auto',
    title: { en: 'Auto model', ru: 'Авто-модель' },
    description: {
      en: 'Adds the qols-auto provider: pick Auto in the model menu and the plugin judges each task, then answers with the eco, standard or deep route. The badge under the composer and this dialog show what it picked and why.',
      ru: 'Добавляет провайдер qols-auto: выбери Auto в меню модели — плагин оценит задачу и ответит по маршруту eco, standard или deep. Бейдж под полем ввода и это окно показывают, что выбрано и почему.',
    },
  },
  {
    id: 'usage',
    title: { en: 'Session cost', ru: 'Стоимость сессии' },
    description: {
      en: 'Shows what the current session has cost in the sidebar footer and adds a per-turn cost line under every finished answer.',
      ru: 'Показывает стоимость текущей сессии в футере сайдбара и добавляет строку стоимости под каждым завершённым ответом.',
    },
  },
  {
    id: 'studio',
    title: { en: 'Prompt Studio', ru: 'Prompt Studio' },
    description: {
      en: 'Creates and edits DSH skills, slash commands and always-apply rules as plain files: one global root in the DSH home and one per project. Agent presets are included, and every section can start from a chat interview.',
      ru: 'Создаёт и редактирует навыки, слэш-команды и always-apply правила DSH обычными файлами: глобальный корень в DSH home и отдельный на проект. Пресеты агентов тоже здесь; каждую секцию можно начать с интервью в чате.',
    },
  },
  {
    id: 'liked',
    title: { en: 'Market update', ru: 'Обновление маркета' },
    description: {
      en: 'Updates an installed DSH Market to the release you pick and then offers a restart. The install runs through the managed subprocess service, not a bare child process.',
      ru: 'Обновляет установленный DSH Market до выбранного релиза и предлагает перезапуск. Установка идёт через управляемый подпроцесс харнесса, а не через голый дочерний процесс.',
    },
  },
]
