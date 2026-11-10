/**
 * QoLs client: the settings section, the two sidebar panel rows, the Prompt
 * Studio overlay, and the Auto-mode badge.
 *
 * This file is a classic script evaluated by the plugin loader, so it cannot
 * import catalog.js; the catalog is fetched from the host instead.
 */
window.__ModuleLoader__.load({
  id: 'dsh-qols',
  factory(require) {
    const FALLBACK_CATALOG = [
      {
        id: 'auto',
        title: { en: 'Auto model', ru: 'Авто-модель' },
        description: {
          en: 'Adds the qols-auto provider: pick Auto in the model menu and the plugin judges each task, then answers with the eco, standard or deep route. The badge under the composer and this dialog show what it picked and why.',
          ru: 'Добавляет провайдер qols-auto: выбери Auto в меню модели — плагин оценит задачу и ответит по маршруту eco, standard или deep. Бейдж под полем ввода и это окно показывают, что выбрано и почему.',
        },
      },
    ]

    const React = require('react')
    const h = React.createElement

    const CATALOG_ROUTE = '/api/dsh-qols/catalog'
    const AUTO_LAST = '/api/dsh-qols/auto/last'
    const AUTO_LOG = '/api/dsh-qols/auto/log'
    const AUTO_CONFIG = '/api/dsh-qols/auto/config'
    const AUTO_MODELS = '/api/dsh-qols/auto/models'
    const DIAG_ROUTE = '/api/dsh-qols/diagnostics'
    const USAGE_STATUS = '/api/dsh-qols/usage/status'
    const USAGE_TURN = '/api/dsh-qols/usage/turn'
    const USAGE_CONFIG = '/api/dsh-qols/usage/config'
    const LIKED_CORE_UPDATE = '/api/dsh-qols/liked/update-core'

    /**
     * Settings live in one client module, so the card does not have to wait for
     * its next 5 s poll after a switch click. The settings panel publishes the
     * saved config and every mounted card folds it into its own state at once.
     */
    const usageSettingsListeners = new Set()
    function subscribeUsageSettings(listener) {
      usageSettingsListeners.add(listener)
      return () => { usageSettingsListeners.delete(listener) }
    }
    function publishUsageSettings(settings) {
      for (const listener of usageSettingsListeners) listener(settings)
    }
    const STUDIO_ROUTE = '/api/dsh-qols/studio/skills'
    const STUDIO_COMMANDS_ROUTE = '/api/dsh-qols/studio/commands'
    const STUDIO_RULES_ROUTE = '/api/dsh-qols/studio/rules'
    const STUDIO_AGENTS_ROUTE = '/api/dsh-qols/studio/agents'
    const STUDIO_INSTRUCTION_ROUTE = '/api/dsh-qols/studio/instruction'
    const NS = 'dsh-qols'

    const DICTS = {
      en: {
        nav: 'QoLs bundle',
        pageTitle: 'QoLs',
        pageHint: 'The Auto model router, usage, and Prompt Studio for skills, commands, rules, agent presets and the global AGENTS.md.',
        featuresTitle: 'Features',
        edit: 'Edit',
        autoModel: 'Auto model',
        autoEmpty: 'No Auto decision yet. Pick Auto in the model menu and send a task.',
        autoRefresh: 'Refresh',
        autoOffline: 'Auto journal is unavailable',
        close: 'Close',
        autoRoutes: 'Routes',
        autoGray: 'Gray zone',
        autoClassifier: 'Classifier',
        autoRecent: 'Recent decisions',
        autoClassifierModel: 'Judge model',
        autoJudgeHint: 'Decides the tier inside the gray zone. Every connected model is listed; the cheapest thinking level is picked automatically.',
        autoSave: 'Save',
        autoSaved: 'Saved',
        autoSaveFailed: 'Could not save',
        autoReadOnly: 'Tier routes and thresholds come from the profile. Only the judge model is stored in storages/qols/auto/settings.json.',
        diagTitle: 'Diagnostics',
        diagHint: 'Registration status of every QoLs feature. The report carries no tokens, prompts or message text.',
        diagCheck: 'Check again',
        diagCopy: 'Copy report',
        diagCopied: 'Report copied',
        diagFailed: 'Diagnostics are unavailable',
        diagOk: 'working',
        diagDegraded: 'degraded',
        diagFailedState: 'failed',
        diagUnregistered: 'not registered',
        usageTitle: 'Usage',
        usageHint: 'A small card in the sidebar footer: today cost and tokens, wallet balances, and a full-day peak timeline. Prices are USD per 1M tokens and live in storages/qols/usage/settings.json.',
        usageToday: 'Today',
        usageBalance: 'Balance',
        usagePeak: 'Peak',
        usageOffPeak: 'Off-peak',
        usageWeekend: 'Weekend',
        usageHoliday: 'Holiday',
        usageAllDay: 'all day',
        usageIn: 'in',
        usageTokens: 'tokens',
        usageTurn: 'Turn cost',
        usageCalls: 'calls',
        usageHideCostMeter: 'Hide the cost-meter card while this card is shown',
        usageShowTokens: 'Show the token count on the card',
        usageShowAmounts: "Show today's cost and wallet balance on the card",
        usageUnavailable: 'Usage data is unavailable',
        usageEmpty: 'No model calls yet',
        usageHidden: 'Amounts are hidden',
        usageGrant: 'grant',
        usageLow: 'Low balance',
        usageSettingsSaved: 'Saved',
        usageSettingsFailed: 'Could not save',
        studioTitle: 'Prompt Studio',
        studioCardHint: 'Skills, rules, commands and agent presets in one place. The editor opens above the page, and every tab can also start from a short chat interview.',
        studioOpen: 'Open Prompt Studio',
        studioChat: 'Create via chat',
        studioChatFailed: 'Chat hand-off is unavailable in this DSH build',
        studioChatPromptSkills: 'I want to create a DSH skill. Please interview me first. My answers:\n1. What should the skill do?\n2. When should the model use it?\n3. Which steps, checks or rules must it follow?\n4. Where should it live — project .dsh/skills or DSH home?\n\nAsk follow-up questions if anything is unclear. Do not write files until I confirm the plan.',
        studioChatPromptRules: 'I want to create a DSH rule. Please interview me first. My answers:\n1. What behaviour should the rule enforce?\n2. When does it apply, and when not?\n3. Is it project-scoped or global?\n4. Should it be strict or a recommendation?\n\nAsk follow-up questions if anything is unclear. Do not write files until I confirm the plan.',
        studioChatPromptCommands: 'I want to create a DSH slash command. Please interview me first. My answers:\n1. What should the command do?\n2. What arguments does it take?\n3. Is it a prompt command or a shell command?\n4. Should it run in the current session or start a new one?\n\nAsk follow-up questions if anything is unclear. Do not write files until I confirm the plan.',
        studioChatPromptAgents: 'I want to create a DSH agent preset. Please interview me first. My answers:\n1. What is the agent for?\n2. Which tools, skills and permissions does it need?\n3. Which model and effort should it use?\n4. Should it be the default preset?\n\nAsk follow-up questions if anything is unclear. Do not write files until I confirm the plan.',
        studioHint: 'Skills are plain files DSH loads from the project and from the DSH home. Edits here appear in the next session.',
        studioTabSkills: 'Skills',
        studioTabCommands: 'Commands',
        studioTabRules: 'Rules',
        studioTabAgents: 'Agents',
        studioTabInstruction: 'Global AGENTS.md',
        instructionHint: 'The global AGENTS.md in the DSH home. New sessions read it before the project files; the open session keeps the copy it started with.',
        instructionMissing: 'No AGENTS.md yet — saving creates it.',
        instructionSave: 'Save',
        instructionReload: 'Reload',
        instructionSaved: 'Saved',
        instructionDirty: 'Unsaved changes',
        instructionFailed: 'Could not read the file',
        instructionLimit: 'bytes',
        studioSaveFailed: 'Could not save',
        studioSoon: 'Coming in a later step: the panel is reserved, the editor is not built yet.',
        studioNew: 'New skill',
        studioEdit: 'Edit',
        studioDelete: 'Delete',
        studioSave: 'Save',
        studioCancel: 'Cancel',
        studioName: 'Name (kebab-case)',
        studioDescription: 'Description',
        studioWhenToUse: 'When to use (optional)',
        studioBody: 'Instructions (markdown)',
        studioSource: 'Where to save',
        studioProject: 'Project (.dsh/skills)',
        studioUser: 'User (DSH home)',
        studioEmpty: 'No skills yet. Create the first one — it is a folder with a SKILL.md.',
        studioSaved: 'Skill saved',
        studioDeleted: 'Skill deleted',
        studioFailed: 'Prompt Studio request failed',
        studioProjectUnavailable: 'The project root is unavailable: DSH did not start inside a git repository.',
        studioCount: 'skills',
        studioCountOne: 'skill',
        studioSearch: 'Search',
        likedNav: 'Liked plugins',
        likedTitle: 'Liked plugins',
        likedHint: 'Plugins that work well with QoLs and do not conflict with it. Install or remove them here, without leaving Settings. They are third-party plugins by other developers — not built by this plugin\'s author; all credit goes to their authors.',
        likedInstalled: 'Installed',
        likedChecking: 'Checking…',
        likedNotInstalled: 'Not installed',
        likedInstall: 'Install',
        likedRemove: 'Remove',
        likedUpdate: 'Update',
        likedUpdateTo: 'Update available',
        likedActivate: 'Turn on',
        likedDeactivate: 'Turn off',
        likedApplied: 'Applied.',
        likedCheckUpdates: 'Check for updates',
        likedCheckingUpdates: 'Checking…',
        likedUpToDate: 'All plugins are up to date.',
        likedUpdateFound: '1 update available.',
        likedUpdatesFound: 'updates available.',
        likedCheckFailed: 'Could not check for updates.',
        likedWorking: 'Working…',
        likedRestart: 'Restart DSH to load the change.',
        likedFailed: 'Could not update the plugin',
        likedBillionContext: 'Context compression for long sessions — keeps the working context small and stable.',
        likedBetterSidebar: 'A working sidebar with files, editor, Git, terminal and subagents.',
        likedDshMarket: 'The plugin market that installs, updates and toggles the other plugins in this list.',
        likedCore: 'Core',
        likedRepo: 'Open repository',
        likedCoreUpdated: 'DSH Market updated on disk. Restart DSH to load it.',
        studioNoMatches: 'Nothing matches this search',
        studioConfirmDelete: 'Delete this skill? The file is removed from disk.',
        studioConfirmShort: 'Delete?',
        studioCmdNew: 'New command',
        studioCmdCount: 'commands',
        studioCmdCountOne: 'command',
        studioCmdType: 'What the command does',
        studioCmdPrompt: 'Send a prompt to the agent',
        studioCmdTier: 'Switch the Auto tier',
        studioCmdSay: 'Return a fixed line',
        studioCmdText: 'Text sent to the agent ({input} is replaced with what you type after the command)',
        studioCmdTierValue: 'Tier',
        studioCmdEmpty: 'No commands yet. A command runs from the composer as /name and costs no model tokens.',
        studioCmdHint: 'Registered commands appear in the composer slash list right away. The Auto tier switch lasts until DSH restarts.',
        studioCmdArgs: 'Placeholders: {input} for the whole tail, {args} for all arguments, {args[0]} for one argument.',
        studioReadOnly: 'read-only',
        studioModelInvocation: 'The model may invoke this skill',
        studioUserInvocable: 'Available as /name',
        studioRuleNew: 'New rule',
        studioRuleCount: 'rules',
        studioRuleCountOne: 'rule',
        studioRuleHint: 'Always-apply instructions. The host adds them to the system prompt when the plugin loads, so the change reaches the model in a new session or after a DSH restart. Use /rule <name> to apply one rule to the current session right away.',
        studioRuleEnabled: 'Enabled',
        studioRulePreview: 'What the model receives',
        studioRuleEmpty: 'No rules yet. A rule is a markdown file whose text is added to the system prompt.',
        studioRuleSaved: 'Rule saved',
        studioRuleDeleted: 'Rule deleted',
        studioRuleConfirmDelete: 'Delete this rule? The file is removed from disk.',
        studioAgentNew: 'New preset',
        studioAgentCount: 'presets',
        studioAgentCountOne: 'preset',
        studioAgentHint: 'Presets are composition rows, not files. Here you can inspect the presets DSH assembled and generate a paste-ready entry; the profile is never rewritten from this panel.',
        studioAgentUnavailable: 'The agent preset service is not available in this build, so the list stays empty. The entry generator still works.',
        studioAgentEmpty: 'No presets were reported. Start DSH once with the agent preset registry loaded and they appear here.',
        studioAgentDefaultBadge: 'default',
        studioAgentBroken: 'broken',
        studioAgentShow: 'Composition',
        studioAgentHide: 'Hide',
        studioAgentId: 'Preset id',
        studioAgentOrder: 'Order (optional)',
        studioAgentPlugins: 'Plugins, one package name per line',
        studioAgentDefaultCheck: 'Also make it the default for new sessions',
        studioAgentBuild: 'Build patch entry',
        studioAgentReady: 'Entry built. Copy it into the patch file shown below.',
        studioAgentSnippet: 'Paste into the profile patch',
        studioAgentCopy: 'Copy',
        studioAgentCopied: 'Copied',
        studioAgentWhere: 'Patch file',
        studioAgentNoProfile: 'profile not found',
        studioAgentRestart: 'Paste the entry under the top-level list, then restart DSH. Sessions created after that can select the preset; nothing changes in existing ones.',
        studioCmdRegistered: 'registered',
        studioCmdUnregistered: 'not registered',
      },
      ru: {
        nav: 'Сборка QoLs',
        pageTitle: 'QoLs',
        pageHint: 'Роутер Auto, расходы и Prompt Studio для навыков, команд, правил, пресетов агентов и глобального AGENTS.md.',
        featuresTitle: 'Возможности',
        edit: 'Изменить',
        autoModel: 'Авто-модель',
        autoEmpty: 'Пока нет решений Auto. Выбери Auto в меню модели и отправь задачу.',
        autoRefresh: 'Обновить',
        autoOffline: 'Журнал Auto недоступен',
        close: 'Закрыть',
        autoRoutes: 'Маршруты',
        autoGray: 'Серая зона',
        autoClassifier: 'Классификатор',
        autoRecent: 'Последние решения',
        autoClassifierModel: 'Модель-судья',
        autoJudgeHint: 'Определяет тир в серой зоне. В списке все подключённые модели; минимальный уровень размышления выбирается автоматически.',
        autoSave: 'Сохранить',
        autoSaved: 'Сохранено',
        autoSaveFailed: 'Не удалось сохранить',
        autoReadOnly: 'Маршруты тиров и пороги берутся из профиля. В storages/qols/auto/settings.json хранится только модель-судья.',
        diagTitle: 'Диагностика',
        diagHint: 'Статус регистрации всех фич QoLs. В отчёте нет токенов, промптов и текста сообщений.',
        diagCheck: 'Проверить снова',
        diagCopy: 'Скопировать отчёт',
        diagCopied: 'Отчёт скопирован',
        diagFailed: 'Диагностика недоступна',
        diagOk: 'работает',
        diagDegraded: 'деградация',
        diagFailedState: 'ошибка',
        diagUnregistered: 'не зарегистрирована',
        usageTitle: 'Расходы',
        usageHint: 'Небольшая карточка в футере боковой панели: расход за сегодня и токены, балансы кошельков, полоса пика на весь день. Цены — доллары за 1M токенов, лежат в storages/qols/usage/settings.json.',
        usageToday: 'Сегодня',
        usageBalance: 'Баланс',
        usagePeak: 'Пик',
        usageOffPeak: 'Вне пика',
        usageWeekend: 'Выходной',
        usageHoliday: 'Праздник',
        usageAllDay: 'весь день',
        usageIn: 'через',
        usageTokens: 'токенов',
        usageTurn: 'Стоимость хода',
        usageCalls: 'вызовов',
        usageHideCostMeter: 'Скрывать карточку cost-meter, пока эта включена',
        usageShowTokens: 'Показывать количество токенов',
        usageShowAmounts: 'Показывать расход за сегодня и баланс кошелька',
        usageUnavailable: 'Данные о расходах недоступны',
        usageEmpty: 'Пока не было вызовов модели',
        usageHidden: 'Суммы скрыты',
        usageGrant: 'грант',
        usageLow: 'Низкий баланс',
        usageSettingsSaved: 'Сохранено',
        usageSettingsFailed: 'Не удалось сохранить',
        studioTitle: 'Prompt Studio',
        studioCardHint: 'Навыки, правила, команды и пресеты агентов в одном месте. Редактор открывается поверх страницы, а каждую вкладку можно начать с короткого интервью в чате.',
        studioOpen: 'Открыть Prompt Studio',
        studioChat: 'Создать через чат',
        studioChatFailed: 'Передача в чат недоступна в этой сборке DSH',
        studioChatPromptSkills: 'Хочу создать навык DSH. Сначала расспроси меня. Мои ответы:\n1. Что должен делать навык?\n2. Когда модель должна его применять?\n3. Какие шаги, проверки или правила он обязан соблюдать?\n4. Где он должен лежать — в проекте .dsh/skills или в DSH home?\n\nЗадай уточняющие вопросы, если что-то непонятно. Не пиши файлы, пока я не подтвержу план.',
        studioChatPromptRules: 'Хочу создать правило DSH. Сначала расспроси меня. Мои ответы:\n1. Какое поведение должно закреплять правило?\n2. Когда оно применяется, а когда нет?\n3. Оно для проекта или глобальное?\n4. Это строгое требование или рекомендация?\n\nЗадай уточняющие вопросы, если что-то непонятно. Не пиши файлы, пока я не подтвержу план.',
        studioChatPromptCommands: 'Хочу создать слэш-команду DSH. Сначала расспроси меня. Мои ответы:\n1. Что должна делать команда?\n2. Какие аргументы она принимает?\n3. Это prompt-команда или shell-команда?\n4. Она работает в текущей сессии или открывает новую?\n\nЗадай уточняющие вопросы, если что-то непонятно. Не пиши файлы, пока я не подтвержу план.',
        studioChatPromptAgents: 'Хочу создать пресет агента DSH. Сначала расспроси меня. Мои ответы:\n1. Для чего этот агент?\n2. Какие инструменты, навыки и разрешения ему нужны?\n3. Какую модель и усилие использовать?\n4. Должен ли он быть пресетом по умолчанию?\n\nЗадай уточняющие вопросы, если что-то непонятно. Не пиши файлы, пока я не подтвержу план.',
        studioHint: 'Навыки — это обычные файлы, которые DSH читает из проекта и из DSH home. Правки здесь появятся в следующей сессии.',
        studioTabSkills: 'Навыки',
        studioTabCommands: 'Команды',
        studioTabRules: 'Правила',
        studioTabAgents: 'Агенты',
        studioTabInstruction: 'Глобальный AGENTS.md',
        instructionHint: 'Глобальный AGENTS.md в DSH home. Новые сессии читают его раньше файлов проекта; открытая сессия сохраняет копию, с которой началась.',
        instructionMissing: 'AGENTS.md ещё нет — сохранение создаст его.',
        instructionSave: 'Сохранить',
        instructionReload: 'Перечитать',
        instructionSaved: 'Сохранено',
        instructionDirty: 'Есть несохранённые изменения',
        instructionFailed: 'Не удалось прочитать файл',
        instructionLimit: 'байт',
        studioSaveFailed: 'Не удалось сохранить',
        studioSoon: 'Появится на следующем шаге: вкладка зарезервирована, редактор ещё не собран.',
        studioNew: 'Новый навык',
        studioEdit: 'Изменить',
        studioDelete: 'Удалить',
        studioSave: 'Сохранить',
        studioCancel: 'Отмена',
        studioName: 'Имя (kebab-case)',
        studioDescription: 'Описание',
        studioWhenToUse: 'Когда применять (необязательно)',
        studioBody: 'Инструкции (markdown)',
        studioSource: 'Куда сохранить',
        studioProject: 'Проект (.dsh/skills)',
        studioUser: 'Пользователь (DSH home)',
        studioEmpty: 'Навыков пока нет. Создай первый — это папка с SKILL.md.',
        studioSaved: 'Навык сохранён',
        studioDeleted: 'Навык удалён',
        studioFailed: 'Запрос Prompt Studio не удался',
        studioProjectUnavailable: 'Корень проекта недоступен: DSH запущен не внутри git-репозитория.',
        studioCount: 'навыков',
        studioCountOne: 'навык',
        studioSearch: 'Поиск',
        likedNav: 'Любимые плагины',
        likedTitle: 'Любимые плагины',
        likedHint: 'Плагины, которые хорошо дополняют QoLs и не конфликтуют с ним. Устанавливайте и удаляйте их здесь, не выходя из настроек. Это сторонние плагины других разработчиков — не работа автора QoLs; вся благодарность их авторам.',
        likedInstalled: 'Установлен',
        likedChecking: 'Проверяю…',
        likedNotInstalled: 'Не установлен',
        likedInstall: 'Установить',
        likedRemove: 'Удалить',
        likedUpdate: 'Обновить',
        likedUpdateTo: 'Доступно обновление',
        likedActivate: 'Включить',
        likedDeactivate: 'Выключить',
        likedApplied: 'Применено.',
        likedCheckUpdates: 'Проверить обновления',
        likedCheckingUpdates: 'Проверяю…',
        likedUpToDate: 'Все плагины обновлены.',
        likedUpdateFound: 'Доступно обновление.',
        likedUpdatesFound: 'обновлений доступно.',
        likedCheckFailed: 'Не удалось проверить обновления.',
        likedWorking: 'Работаю…',
        likedRestart: 'Перезапустите DSH, чтобы загрузить изменение.',
        likedFailed: 'Не удалось обновить плагин',
        likedBillionContext: 'Сжатие контекста для длинных сессий — рабочий контекст остаётся небольшим и стабильным.',
        likedBetterSidebar: 'Рабочий сайдбар с файлами, редактором, Git, терминалом и субагентами.',
        likedDshMarket: 'Магазин плагинов, который устанавливает, обновляет и переключает остальные плагины из этого списка.',
        likedCore: 'Основной',
        likedRepo: 'Открыть репозиторий',
        likedCoreUpdated: 'DSH Market обновлён на диске. Перезапустите DSH, чтобы загрузить его.',
        studioNoMatches: 'Ничего не найдено',
        studioConfirmDelete: 'Удалить навык? Файл будет удалён с диска.',
        studioConfirmShort: 'Удалить?',
        studioCmdNew: 'Новая команда',
        studioCmdCount: 'команд',
        studioCmdCountOne: 'команда',
        studioCmdType: 'Что делает команда',
        studioCmdPrompt: 'Отправить промпт агенту',
        studioCmdTier: 'Переключить тир Auto',
        studioCmdSay: 'Вернуть фиксированную строку',
        studioCmdText: 'Текст для агента ({input} заменяется тем, что наберёшь после команды)',
        studioCmdTierValue: 'Тир',
        studioCmdEmpty: 'Команд пока нет. Команда запускается из композера как /имя и не тратит токены модели.',
        studioCmdHint: 'Зарегистрированные команды сразу появляются в списке слэш-команд композера. Переключение тира Auto действует до перезапуска DSH.',
        studioCmdArgs: 'Подстановки: {input} — весь хвост строки, {args} — все аргументы, {args[0]} — один аргумент.',
        studioReadOnly: 'только чтение',
        studioModelInvocation: 'Модель может вызывать этот навык',
        studioUserInvocable: 'Доступен как /имя',
        studioRuleNew: 'Новое правило',
        studioRuleCount: 'правил',
        studioRuleCountOne: 'правило',
        studioRuleHint: 'Always-apply инструкции. Хост добавляет их в системный промпт при загрузке плагина, поэтому изменение увидит новая сессия или DSH после перезапуска. Команда /rule <имя> применяет правило к текущей сессии сразу.',
        studioRuleEnabled: 'Включено',
        studioRulePreview: 'Что получает модель',
        studioRuleEmpty: 'Правил пока нет. Правило — markdown-файл, текст которого добавляется в системный промпт.',
        studioRuleSaved: 'Правило сохранено',
        studioRuleDeleted: 'Правило удалено',
        studioRuleConfirmDelete: 'Удалить правило? Файл будет удалён с диска.',
        studioAgentNew: 'Новый пресет',
        studioAgentCount: 'пресетов',
        studioAgentCountOne: 'пресет',
        studioAgentHint: 'Пресеты — это строки композиции, а не файлы. Здесь можно посмотреть, какие пресеты собрал DSH, и сгенерировать готовый к вставке фрагмент; сам профиль панель не переписывает.',
        studioAgentUnavailable: 'Сервис пресетов агентов в этой сборке недоступен, поэтому список пуст. Генератор фрагмента всё равно работает.',
        studioAgentEmpty: 'Пресеты не найдены. Запусти DSH один раз с загруженным реестром пресетов — они появятся здесь.',
        studioAgentDefaultBadge: 'по умолчанию',
        studioAgentBroken: 'сломан',
        studioAgentShow: 'Состав',
        studioAgentHide: 'Скрыть',
        studioAgentId: 'Id пресета',
        studioAgentOrder: 'Порядок (необязательно)',
        studioAgentPlugins: 'Плагины, по одному имени пакета в строке',
        studioAgentDefaultCheck: 'Сделать пресетом по умолчанию для новых сессий',
        studioAgentBuild: 'Собрать фрагмент',
        studioAgentReady: 'Фрагмент собран. Скопируй его в файл патча ниже.',
        studioAgentSnippet: 'Вставить в патч профиля',
        studioAgentCopy: 'Копировать',
        studioAgentCopied: 'Скопировано',
        studioAgentWhere: 'Файл патча',
        studioAgentNoProfile: 'профиль не найден',
        studioAgentRestart: 'Вставь фрагмент под верхний список и перезапусти DSH. После этого новые сессии смогут выбрать пресет; существующие не изменятся.',
        studioCmdRegistered: 'зарегистрирована',
        studioCmdUnregistered: 'не зарегистрирована',
      },
    }

    const CSS = [
      ".qols-settings,.qols-dialog-overlay,.qols-usage,.qols-turn,.qols-auto-badge{box-sizing:border-box}",
      ".qols-settings *,.qols-dialog-overlay *,.qols-usage *,.qols-turn *,.qols-auto-badge *{box-sizing:border-box}",
      ".qols-settings button,.qols-dialog-overlay button{font:inherit}",
      ".qols-settings button:focus-visible,.qols-dialog-overlay button:focus-visible,.qols-settings input:focus-visible,.qols-settings textarea:focus-visible,.qols-settings select:focus-visible,.qols-usage button:focus-visible,.qols-turn summary:focus-visible,.qols-settings a:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}",
      ".qols-settings{display:flex;flex-direction:column;gap:20px;padding:0 2px 8px;color:var(--dsw-alias-label-primary);font:var(--dsw-font-xs-13);font-family:var(--dsw-font-family)}",
      ".qols-page-head{display:flex;flex-direction:column;gap:6px;padding:0 2px}",
      ".qols-page-title{margin:0;font:var(--dsw-font-l-20);font-family:var(--dsw-font-family);font-weight:500;color:var(--dsw-alias-label-primary)}",
      ".qols-page-desc{margin:0;max-width:560px;font:var(--dsw-font-xs-13);font-family:var(--dsw-font-family);color:var(--dsw-alias-label-secondary)}",
      ".qols-group{display:flex;flex-direction:column;gap:10px}",
      ".qols-group-title{margin:0;padding:0 2px;font:var(--dsw-font-xxxs-strong-11);font-family:var(--dsw-font-family);letter-spacing:.04em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary)}",
      ".qols-stack{display:flex;flex-direction:column;gap:12px}",
      ".qols-feature{display:grid;grid-template-columns:36px minmax(0,1fr) auto;align-items:start;gap:14px;padding:16px;border-radius:var(--dsw-radius-xl);border:0.5px solid var(--dsw-alias-settings-card-stroke);background:var(--dsw-alias-settings-card-fill)}",
      ".qols-feature-icon{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;flex:none;border-radius:var(--dsw-radius-md);border:0.5px solid var(--dsw-alias-border-l3);background:transparent;color:var(--dsw-alias-label-secondary)}",
      ".qols-feature-icon svg{width:18px;height:18px;display:block}",
      ".qols-feature-main{display:flex;flex-direction:column;gap:4px;min-width:0;padding-top:1px}",
      ".qols-feature-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-height:22px}",
      ".qols-feature-title{margin:0;font:var(--dsw-font-s-strong-14);font-family:var(--dsw-font-family);font-weight:500;color:var(--dsw-alias-label-primary)}",
      ".qols-feature-head>.qols-feature-title{flex:0 1 auto}",
      ".qols-feature-desc{margin:0;font:var(--dsw-font-xs-13);font-family:var(--dsw-font-family);color:var(--dsw-alias-label-secondary)}",
      ".qols-feature-edit{flex:none;height:28px;padding:0 10px;border:0.5px solid transparent;border-radius:var(--dsw-radius-sm);background:transparent;box-shadow:inset 0 0 0 var(--dsh-hairline-width,0.5px) var(--dsw-alias-border-l3);color:var(--dsw-alias-label-primary);font:var(--dsw-font-xxs-strong-12);font-family:var(--dsw-font-family);cursor:pointer}",
      "@media (hover: hover){.qols-feature-edit:hover{background:var(--dsw-alias-interactive-bg-hover)}}",
      ".qols-card{display:flex;flex-direction:column;gap:12px;padding:16px;border-radius:var(--dsw-radius-xl);border:0.5px solid var(--dsw-alias-settings-card-stroke);background:var(--dsw-alias-settings-card-fill)}",
      ".qols-card-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-height:28px}",
      ".qols-card-head>.qols-feature-title{flex:1 1 auto}",
      ".qols-diag{display:flex;flex-direction:column;gap:12px;padding:16px;border-radius:var(--dsw-radius-xl);border:0.5px solid var(--dsw-alias-settings-card-stroke);background:var(--dsw-alias-settings-card-fill)}",
      ".qols-diag-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-height:28px}",
      ".qols-diag-head>.qols-feature-title{flex:1 1 auto}",
      ".qols-diag-button{flex:none;height:28px;padding:0 10px;border:0.5px solid transparent;border-radius:var(--dsw-radius-sm);background:transparent;box-shadow:inset 0 0 0 var(--dsh-hairline-width,0.5px) var(--dsw-alias-border-l3);color:var(--dsw-alias-label-primary);font:var(--dsw-font-xxs-strong-12);font-family:var(--dsw-font-family);cursor:pointer}",
      "@media (hover: hover){.qols-diag-button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}}",
      ".qols-diag-button:disabled{opacity:.4;cursor:default}",
      ".qols-diag-list{display:flex;flex-direction:column}",
      ".qols-diag-row{display:grid;grid-template-columns:104px 116px minmax(0,1fr);align-items:center;gap:10px;padding:7px 0;min-width:0}",
      ".qols-diag-row+.qols-diag-row{border-top:0.5px solid var(--dsw-alias-border-l1)}",
      ".qols-diag-name{font:var(--dsw-font-xxs-strong-12);font-family:var(--dsw-font-family);color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".qols-diag-state{display:inline-flex;align-items:center;gap:6px;justify-self:start;height:22px;padding:0 8px;border-radius:999px;font:var(--dsw-font-xxxs-strong-11);font-family:var(--dsw-font-family);white-space:nowrap;color:var(--dsw-alias-label-tertiary);background:color-mix(in srgb,currentColor 12%,transparent)}",
      ".qols-diag-state::before{content:\"\";width:5px;height:5px;border-radius:50%;background:currentColor;flex:none}",
      ".qols-diag-state[data-state=\"ok\"]{color:var(--dsw-alias-state-success-primary)}",
      ".qols-diag-state[data-state=\"degraded\"]{color:var(--dsw-alias-state-warn-primary)}",
      ".qols-diag-state[data-state=\"failed\"]{color:var(--dsw-alias-state-error-primary)}",
      ".qols-diag-state[data-state=\"unregistered\"]{color:var(--dsw-alias-label-tertiary)}",
      ".qols-diag-detail{font:var(--dsw-font-xxs-12);font-family:var(--dsw-font-family);color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}",
      ".qols-diag-error{font:var(--dsw-font-xxs-12);font-family:var(--dsw-font-family);color:var(--dsw-alias-state-error-primary)}",
      ".qols-auto-badge{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 8px;border-radius:var(--dsw-radius-sm);font:var(--dsw-font-xxs-12);font-family:var(--dsw-font-family);color:var(--dsw-alias-label-secondary);white-space:nowrap}",
      ".qols-auto-dot{width:6px;height:6px;border-radius:50%;flex:none;background:var(--dsw-alias-label-tertiary)}",
      ".qols-auto-dot[data-tier=\"eco\"]{background:var(--dsw-alias-state-success-primary)}",
      ".qols-auto-dot[data-tier=\"standard\"]{background:var(--dsw-alias-state-business-primary)}",
      ".qols-auto-dot[data-tier=\"deep\"]{background:var(--dsw-static-violet-400)}",
      ".qols-auto-head{display:flex;align-items:center;gap:10px}",
      ".qols-auto-refresh{flex:none;margin-left:auto;height:28px;padding:0 10px;border:0.5px solid transparent;border-radius:var(--dsw-radius-sm);background:transparent;box-shadow:inset 0 0 0 var(--dsh-hairline-width,0.5px) var(--dsw-alias-border-l3);color:var(--dsw-alias-label-primary);font:var(--dsw-font-xxs-strong-12);font-family:var(--dsw-font-family);cursor:pointer}",
      "@media (hover: hover){.qols-auto-refresh:hover{background:var(--dsw-alias-interactive-bg-hover)}}",
      ".qols-auto-list{display:flex;flex-direction:column}",
      ".qols-auto-row{display:grid;grid-template-columns:64px 72px minmax(0,1fr);gap:8px;align-items:baseline;padding:7px 0;font:var(--dsw-font-xxs-12);font-family:var(--dsw-font-family);min-width:0}",
      ".qols-auto-row+.qols-auto-row{border-top:0.5px solid var(--dsw-alias-border-l1)}",
      ".qols-auto-time{color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}",
      ".qols-auto-tier{font:var(--dsw-font-xxs-strong-12);font-family:var(--dsw-font-family);color:var(--dsw-alias-label-primary)}",
      ".qols-auto-meta{color:var(--dsw-alias-label-secondary);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".qols-auto-empty{padding:2px 0;font:var(--dsw-font-xxs-12);font-family:var(--dsw-font-family);color:var(--dsw-alias-label-secondary)}",
      ".qols-auto-dock{display:flex;align-items:center;gap:6px;min-height:22px}",
      ".qols-dialog-overlay{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--dsw-alias-bg-mask-1);pointer-events:auto}",
      ".qols-dialog{display:flex;flex-direction:column;width:min(640px,calc(100vw - 48px));max-height:min(84vh,760px);overflow:hidden;border:0;border-radius:var(--dsw-radius-panel);background:var(--dsw-alias-bg-layer-2);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-primary)}",
      ".qols-studio-dialog{width:min(1040px,calc(100vw - 48px));height:clamp(420px,72vh,760px);max-height:calc(100vh - 48px)}",
      ".qols-studio-dialog .qols-dialog-body{padding:0;overflow:auto;min-height:0;flex:1 1 auto}",
      ".qols-studio[data-embedded=\"true\"]{height:100%;padding:0 24px 24px;border:0;border-radius:0;background:transparent}",
      ".qols-dialog-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:22px 14px 12px 24px;flex:none}",
      ".qols-dialog-title{flex:1;min-width:0;font:var(--dsw-font-base-strong-16);font-family:var(--dsw-font-family);font-weight:500;color:var(--dsw-alias-label-primary)}",
      ".qols-studio-dialog .qols-dialog-title{font:var(--dsw-font-s-strong-14);font-family:var(--dsw-font-family)}",
      ".qols-dialog-close{flex:none;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}",
      ".qols-dialog-close svg{width:16px;height:16px;display:block}",
      "@media (hover: hover){.qols-dialog-close:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}}",
      ".qols-dialog-body{display:flex;flex-direction:column;gap:16px;padding:0 24px 24px;overflow:auto;min-height:0}",
      ".qols-dialog-actions{display:flex;justify-content:flex-end;gap:8px;flex:none}",
      ".qols-dialog-desc{margin:0;font:var(--dsw-font-xs-13);font-family:var(--dsw-font-family);color:var(--dsw-alias-label-secondary)}",
      ".qols-dialog-section{display:flex;flex-direction:column;gap:6px}",
      ".qols-dialog-label{margin:0;font:var(--dsw-font-xxxs-strong-11);font-family:var(--dsw-font-family);letter-spacing:.04em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary)}",
      ".qols-dialog-route{margin:0;padding:10px 12px;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);font:var(--dsw-font-xxs-12);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;line-height:18px;white-space:pre-line;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}",
      ".qols-dialog-note{margin:0;font:var(--dsw-font-xxs-12);font-family:var(--dsw-font-family);color:var(--dsw-alias-label-tertiary)}",
      ".qols-dialog-button{flex:none;height:28px;padding:0 10px;border:0.5px solid transparent;border-radius:var(--dsw-radius-sm);background:transparent;box-shadow:inset 0 0 0 var(--dsh-hairline-width,0.5px) var(--dsw-alias-border-l3);color:var(--dsw-alias-label-primary);font:var(--dsw-font-xxs-strong-12);font-family:var(--dsw-font-family);cursor:pointer}",
      "@media (hover: hover){.qols-dialog-button:hover{background:var(--dsw-alias-interactive-bg-hover)}}",
      ".qols-dialog-button[data-primary=\"true\"]{background:var(--dsw-alias-button-primary-fill);box-shadow:none;color:var(--dsw-alias-label-primary-foreground)}",
      "@media (hover: hover){.qols-dialog-button[data-primary=\"true\"]:hover{background:var(--dsw-alias-button-primary-hover)}}",
      ".qols-dialog-button[data-danger=\"true\"]{box-shadow:inset 0 0 0 var(--dsh-hairline-width,0.5px) var(--dsw-alias-state-error-secondary);color:var(--dsw-alias-state-error-primary)}",
      "@media (hover: hover){.qols-dialog-button[data-danger=\"true\"]:hover{background:var(--dsw-alias-interactive-bg-hover-danger)}}",
      ".qols-dialog-select{height:32px;max-width:100%;padding:0 8px;border:0.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:var(--dsw-font-xxs-12);font-family:var(--dsw-font-family);cursor:pointer}",
      ".qols-dialog-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}",
      ".qols-dialog-hint{margin:0;font:var(--dsw-font-xxs-12);font-family:var(--dsw-font-family);color:var(--dsw-alias-label-tertiary)}",
      ".qols-dialog-ok{margin:0;font:var(--dsw-font-xxs-12);font-family:var(--dsw-font-family);color:var(--dsw-alias-state-success-primary)}",
      ".qols-dialog-error{margin:0;font:var(--dsw-font-xxs-12);font-family:var(--dsw-font-family);color:var(--dsw-alias-state-error-primary)}",
      ".qols-switch-list{display:flex;flex-direction:column}",
      ".qols-switch-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:9px 0;min-height:40px}",
      ".qols-switch-row+.qols-switch-row{border-top:0.5px solid var(--dsw-alias-border-l1)}",
      ".qols-switch-label{font:var(--dsw-font-xs-13);font-family:var(--dsw-font-family);color:var(--dsw-alias-label-primary);min-width:0}",
      ".qols-switch{position:relative;flex:0 0 auto;width:36px;height:20px;padding:2px;border:0;border-radius:999px;corner-shape:round;background:var(--dsw-alias-border-l3);cursor:pointer}",
      ".qols-switch[aria-checked=\"true\"]{background:var(--dsw-alias-brand-primary)}",
      ".qols-switch:disabled{opacity:.5;cursor:default}",
      ".qols-switch-thumb{display:block;width:16px;height:16px;border-radius:50%;corner-shape:round;background:var(--dsw-alias-switch-thumb);transition:transform 120ms ease}",
      ".qols-switch[aria-checked=\"true\"] .qols-switch-thumb{background:var(--dsw-alias-label-primary-foreground);transform:translateX(16px)}",
      ".qols-usage{display:flex;flex-direction:column;gap:6px;width:100%;min-width:0;max-width:100%;padding:0 11px;color:var(--dsw-alias-label-secondary)}",
      ".qols-usage-row{display:flex;align-items:baseline;justify-content:space-between;gap:12px;height:20px}",
      ".qols-usage-pair{flex:0 1 auto;min-width:0;display:flex;align-items:baseline;gap:6px;white-space:nowrap}",
      ".qols-usage-label{font:var(--dsw-font-xxxs-11);font-family:var(--dsw-font-family);color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis}",
      ".qols-usage-value{font:var(--dsw-font-xxs-strong-12);font-family:var(--dsw-font-family);font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary)}",
      ".qols-usage-skeleton{display:flex;flex-direction:column;gap:7px;padding:1px 0 3px}",
      ".qols-usage-skeleton span{display:block;height:4px;border-radius:var(--dsw-radius-xs);background:var(--dsw-alias-bg-skeleton)}",
      ".qols-usage-skeleton span:first-child{height:10px;width:100%}",
      ".qols-usage-skeleton span:nth-child(2){width:72%}",
      ".qols-usage-skeleton span:last-child{width:46%}",
      ".qols-peak{position:relative;display:flex;flex-direction:column;gap:6px;min-width:0}",
      ".qols-peak-rail{position:relative;display:flex;align-items:center;height:10px}",
      ".qols-peak-track{position:relative;display:block;width:100%;height:4px;border-radius:999px;overflow:hidden;background:color-mix(in oklab,var(--dsw-alias-state-success-primary) 52%,var(--dsw-alias-bg-layer-2))}",
      ".qols-peak-segment{position:absolute;top:0;height:100%}",
      ".qols-peak-high{background:color-mix(in oklab,var(--dsw-alias-state-error-primary) 58%,var(--dsw-alias-bg-layer-2))}",
      ".qols-peak-low{background:color-mix(in oklab,var(--dsw-alias-state-success-primary) 52%,var(--dsw-alias-bg-layer-2))}",
      ".qols-peak-marker{position:absolute;top:50%;left:25%;width:2px;height:10px;border-radius:1px;background:var(--dsw-alias-label-primary);transform:translate(-50%,-50%);transition:left 4s linear;z-index:2}",
      ".qols-peak-chip{align-self:flex-start;display:inline-flex;align-items:center;gap:5px;max-width:100%;padding:1px 7px;border-radius:999px;border:0.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);font:var(--dsw-font-xxxs-11);font-family:var(--dsw-font-family);color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".qols-peak-chip::before{content:\"\";width:5px;height:5px;border-radius:50%;flex:none;background:var(--dsw-alias-state-success-primary)}",
      ".qols-peak.peak .qols-peak-chip::before{background:var(--dsw-alias-state-error-primary)}",
      ".qols-peak.weekend .qols-peak-chip::before{background:var(--dsw-alias-state-success-primary)}",
      "body.qols-hide-cost-meter .cm-footer-stack{display:none!important}",
      "body.qols-hide-cost-meter .cm-note{display:none!important}",
      ".qols-turn{margin-top:4px;font:var(--dsw-font-xxs-12);font-family:var(--dsw-font-family);color:var(--dsw-alias-label-tertiary)}",
      ".qols-turn>summary{display:flex;align-items:center;gap:6px;cursor:pointer;list-style:none;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-tertiary);width:fit-content;border-radius:var(--dsw-radius-xs)}",
      ".qols-turn>summary::-webkit-details-marker{display:none}",
      ".qols-turn>summary::before{content:\"\";width:5px;height:5px;flex:none;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(-45deg);transition:transform 120ms ease}",
      ".qols-turn[open]>summary::before{transform:rotate(45deg)}",
      ".qols-turn[open]>summary{color:var(--dsw-alias-label-secondary)}",
      "@media (hover: hover){.qols-turn>summary:hover{color:var(--dsw-alias-label-primary)}}",
      ".qols-turn-body{margin-top:6px;display:flex;flex-direction:column;gap:3px;padding-left:9px;border-left:0.5px solid var(--dsw-alias-border-l2);font:var(--dsw-font-xxs-12);font-family:var(--dsw-font-family);color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}",
      ".qols-turn-call{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;color:var(--dsw-alias-label-tertiary);overflow-wrap:anywhere}",
      ".qols-live-cost{display:inline-flex;align-items:center;gap:4px;font:var(--dsw-font-xxs-12);font-family:var(--dsw-font-family);color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;white-space:nowrap}",
      ".qols-studio{display:flex;flex-direction:column;gap:12px;padding:16px;font:var(--dsw-font-xs-13);font-family:var(--dsw-font-family);border-radius:var(--dsw-radius-xl);border:0.5px solid var(--dsw-alias-settings-card-stroke);background:var(--dsw-alias-settings-card-fill)}",
      ".qols-studio-head{display:flex;align-items:center;gap:8px;min-height:26px;flex-wrap:wrap}",
      ".qols-studio-head>.qols-feature-title{flex:0 1 auto}",
      ".qols-studio-head-actions{display:flex;align-items:center;gap:6px;margin-left:auto;flex-wrap:wrap;min-width:0}",
      ".qols-studio-chat{white-space:nowrap}",
      ".qols-studio-count{display:inline-flex;align-items:center;height:20px;padding:0 7px;border-radius:999px;background:var(--dsw-alias-bg-layer-3);font:var(--dsw-font-xxxs-strong-11);font-family:var(--dsw-font-family);color:var(--dsw-alias-label-secondary);white-space:nowrap}",
      ".qols-studio-tabs{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:2px;padding:4px;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);box-shadow:inset 0 0 0 0.5px var(--dsw-alias-border-l2)}",
      ".qols-studio-tab{height:26px;padding:0 8px;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-secondary);font:var(--dsw-font-xxs-strong-12);font-family:var(--dsw-font-family);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;transition:color 120ms ease;min-width:0}",
      ".qols-studio-tab[aria-selected=\"true\"]{background:var(--dsw-alias-bg-layer-3);box-shadow:var(--dsw-elevation-soft),inset 0 0 0 0.5px var(--dsw-alias-border-l3);color:var(--dsw-alias-label-primary)}",
      "@media (hover: hover){.qols-studio-tab:hover{color:var(--dsw-alias-label-primary)}}",
      ".qols-studio-body{display:flex;flex-direction:column;gap:12px}",
      ".qols-studio-roots{margin:0;font:var(--dsw-font-xxs-12);font-family:var(--dsw-font-family);color:var(--dsw-alias-label-tertiary);overflow-wrap:anywhere}",
      ".qols-studio-list{display:flex;flex-direction:column;border:0.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-lg);overflow:hidden}",
      ".qols-studio-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:2px 12px;padding:8px 12px}",
      ".qols-studio-row+.qols-studio-row{border-top:0.5px solid var(--dsw-alias-border-l1)}",
      ".qols-liked-head{display:flex;flex-direction:row;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}",
      ".qols-liked-head-copy{display:flex;flex:1 1 240px;flex-direction:column;gap:4px;min-width:0}",
      ".qols-liked-head .qols-studio-button{flex:0 0 auto}",
      ".qols-liked-list{display:flex;flex-direction:column}",
      ".qols-liked-list .qols-studio-row{padding:12px 0}",
      ".qols-liked-repo{display:inline-flex;align-items:center;gap:4px;max-width:100%;min-width:0;font:var(--dsw-font-xxs-12);font-family:var(--dsw-font-family);font-weight:500;color:var(--dsw-alias-link);text-decoration:none;overflow-wrap:anywhere}",
      "@media (hover: hover){.qols-liked-repo:hover{text-decoration:underline}}",
      "@media (max-width:560px){.qols-liked-list .qols-studio-row{grid-template-columns:minmax(0,1fr)}.qols-liked-list .qols-studio-actions{justify-content:flex-end;flex-wrap:wrap;padding-top:4px}}",
      "@media (hover: hover){.qols-studio-row:hover{background:var(--dsw-alias-interactive-bg-hover)}}",
      ".qols-studio-main{display:flex;flex-direction:column;gap:3px;min-width:0}",
      ".qols-studio-line{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0}",
      ".qols-studio-name{font:var(--dsw-font-xs-strong-13);font-family:var(--dsw-font-family);font-weight:500;color:var(--dsw-alias-label-primary);overflow-wrap:anywhere;min-width:0}",
      ".qols-studio-desc{font:var(--dsw-font-xxs-12);font-family:var(--dsw-font-family);color:var(--dsw-alias-label-secondary);overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow-wrap:anywhere}",
      ".qols-studio-badge{display:inline-flex;align-items:center;flex:none;padding:1px 7px;border-radius:999px;background:color-mix(in srgb,currentColor 10%,transparent);font:var(--dsw-font-xxxs-strong-11);font-family:var(--dsw-font-family);color:var(--dsw-alias-label-tertiary);white-space:nowrap}",
      ".qols-studio-badge[data-source=\"project\"]{border-color:color-mix(in srgb,var(--dsw-alias-state-business-primary) 40%,transparent);color:var(--dsw-alias-state-business-primary)}",
      ".qols-studio-badge[data-tone=\"success\"]{border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 40%,transparent);color:var(--dsw-alias-state-success-primary)}",
      ".qols-studio-badge[data-tone=\"warn\"]{border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 40%,transparent);color:var(--dsw-alias-state-warn-primary)}",
      ".qols-studio-badge[data-tone=\"error\"]{border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 40%,transparent);color:var(--dsw-alias-state-error-primary)}",
      ".qols-studio-hint{margin:0;font:var(--dsw-font-xxs-12);font-family:var(--dsw-font-family);color:var(--dsw-alias-label-tertiary);overflow-wrap:anywhere}",
      ".qols-studio-commands{display:flex;flex-direction:column;gap:12px}",
      ".qols-studio-actions{display:flex;align-items:center;gap:4px;flex:none}",
      ".qols-studio-confirm{font:var(--dsw-font-xxs-12);font-family:var(--dsw-font-family);color:var(--dsw-alias-label-secondary);white-space:nowrap}",
      ".qols-studio-button{flex:none;height:28px;padding:0 10px;border:0.5px solid transparent;border-radius:var(--dsw-radius-sm);background:transparent;box-shadow:inset 0 0 0 var(--dsh-hairline-width,0.5px) var(--dsw-alias-border-l3);color:var(--dsw-alias-label-primary);font:var(--dsw-font-xxs-strong-12);font-family:var(--dsw-font-family);cursor:pointer}",
      ".qols-studio-button:disabled{opacity:.4;cursor:default}",
      "@media (hover: hover){.qols-studio-button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}}",
      ".qols-studio-button[data-primary=\"true\"]{background:var(--dsw-alias-button-primary-fill);box-shadow:none;color:var(--dsw-alias-label-primary-foreground)}",
      "@media (hover: hover){.qols-studio-button[data-primary=\"true\"]:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}}",
      ".qols-studio-button[data-danger=\"true\"]{box-shadow:inset 0 0 0 var(--dsh-hairline-width,0.5px) var(--dsw-alias-state-error-secondary);color:var(--dsw-alias-state-error-primary)}",
      "@media (hover: hover){.qols-studio-button[data-danger=\"true\"]:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger)}}",
      ".qols-studio-form{display:flex;flex-direction:column;gap:12px;padding:14px;border:0.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg)}",
      ".qols-studio-row>.qols-studio-form{grid-column:1/-1;margin-top:8px;padding:12px;background:var(--dsw-alias-bg-layer-1)}",
      ".qols-studio-search{display:flex;align-items:center;gap:6px;width:180px;flex:1 1 140px;max-width:220px;min-width:0;height:28px;padding:0 8px;border:0.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-tertiary)}",
      ".qols-studio-search:focus-within{border-color:var(--dsw-alias-state-business-primary)}",
      ".qols-studio-search input{width:100%;min-width:0;height:100%;padding:0;border:0;background:transparent;color:var(--dsw-alias-label-primary);font:var(--dsw-font-xxs-12);font-family:var(--dsw-font-family);outline:none}",
      ".qols-studio-search input::placeholder{color:var(--dsw-alias-label-tertiary)}",
      ".qols-studio-search svg{width:13px;height:13px;flex:none;display:block}",
      ".qols-studio-field{display:flex;flex-direction:column;gap:6px;font:var(--dsw-font-xxs-12);font-family:var(--dsw-font-family);color:var(--dsw-alias-label-secondary)}",
      ".qols-studio-field input,.qols-studio-field textarea,.qols-studio-field select{width:100%;font:var(--dsw-font-xxs-12);font-family:var(--dsw-font-family);color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);border:0.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);padding:0 8px;height:32px;min-height:32px}",
      ".qols-studio-field select{cursor:pointer}",
      ".qols-studio-field input:focus-visible,.qols-studio-field textarea:focus-visible,.qols-studio-field select:focus-visible{outline:none;border-color:var(--dsw-alias-state-business-primary)}",
      ".qols-studio-field textarea{height:auto;min-height:132px;padding:8px;line-height:18px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;resize:vertical}",
      ".qols-studio-note{font:var(--dsw-font-xxs-12);font-family:var(--dsw-font-family)}",
      ".qols-studio-preview{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;line-height:18px;white-space:pre-wrap;overflow-wrap:anywhere;max-height:220px;overflow:auto;padding:10px 12px;border:0.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary)}",
      ".qols-studio-preview:empty{display:none}",
      ".qols-studio-enabled{display:flex;align-items:center;gap:8px;font:var(--dsw-font-xxs-12);font-family:var(--dsw-font-family);color:var(--dsw-alias-label-secondary)}",
      ".qols-studio-enabled input{width:16px;height:16px;margin:0;accent-color:var(--dsw-alias-brand-primary)}",
      ".qols-studio-empty{padding:4px 0;font:var(--dsw-font-xxs-12);font-family:var(--dsw-font-family);color:var(--dsw-alias-label-secondary)}",
      ".qols-instruction{display:flex;flex-direction:column;gap:10px;min-height:0}",
      ".qols-instruction textarea{width:100%;min-height:340px;flex:1 1 auto;resize:vertical;padding:10px 12px;border:0.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:19px;tab-size:2}",
      ".qols-instruction textarea:focus{outline:none;border-color:var(--dsw-alias-border-l3)}",
      ".qols-instruction-foot{display:flex;align-items:center;gap:8px;flex-wrap:wrap}",
      ".qols-instruction-foot .qols-studio-hint{flex:1 1 200px}",
      "@media (max-width:560px){.qols-dialog-overlay{padding:12px}.qols-dialog{width:calc(100vw - 24px)}.qols-studio-dialog{height:calc(100vh - 24px);max-height:calc(100vh - 24px)}.qols-studio[data-embedded=\"true\"]{padding:0 16px 16px}.qols-studio-head-actions{width:100%;margin-left:0}.qols-studio-head-actions .qols-studio-button{flex:1 1 auto}.qols-studio-search{flex:1 1 100%;max-width:none}.qols-studio-tab{padding:0 4px}}",
      ".qols-row-glyph{display:inline-flex;align-items:center;justify-content:center}",
      "button[data-qols-row=\"true\"]{flex:none}",
      "button[data-qols-row=\"true\"][data-qols-open=\"true\"]{background-color:var(--dsw-alias-interactive-bg-hover)}",
      "button[data-qols-row=\"true\"] svg{display:block}",
      "button[data-qols-row=\"true\"]:focus-visible{outline:none;box-shadow:inset 0 0 0 1px var(--dsw-alias-border-l3)}",
    ].join('\n')

    let catalog = FALLBACK_CATALOG

    function english(key) {
      return DICTS.en[key] !== undefined ? DICTS.en[key] : key
    }

    let t = english
    /** Set by `apply`: opens a new Session with a draft prompt, when DSH offers the service. */
    let studioChat = null

    function messageOf(error) {
      return error instanceof Error ? error.message : String(error)
    }

    /** Case-insensitive substring filter over the caller's searchable fields. */
    function searchFilter(items, query, fields) {
      const needle = String(query ?? '').trim().toLowerCase()
      if (needle === '') return items
      return items.filter((item) => fields(item).some((value) => String(value ?? '').toLowerCase().includes(needle)))
    }

    function ensureStyle() {
      let tag = document.getElementById('qols-style')
      if (tag === null) {
        tag = document.createElement('style')
        tag.id = 'qols-style'
        document.head.appendChild(tag)
      }
      tag.textContent = CSS
    }

    function textOf(entry, field) {
      const value = entry[field]
      const lang = t('nav') === DICTS.ru.nav ? 'ru' : 'en'
      return value[lang] || value.en
    }

    async function getJson(path) {
      const response = await fetch(path, { credentials: 'same-origin', headers: { accept: 'application/json' } })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return response.json()
    }

    async function postJson(path, body) {
      const response = await fetch(path, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      let payload = null
      try {
        payload = await response.json()
      } catch {
        payload = null
      }
      if (!response.ok) {
        const detail = payload !== null && typeof payload.error === 'string' ? payload.error : `HTTP ${response.status}`
        throw new Error(detail)
      }
      return payload
    }

    async function loadCatalog() {
      try {
        const payload = await getJson(CATALOG_ROUTE)
        const entries = payload !== null && typeof payload === 'object' ? payload.entries : null
        if (Array.isArray(entries) && entries.length > 0) catalog = entries
      } catch (error) {
        console.warn('[qols] catalog route unavailable, using the built-in copy', messageOf(error))
      }
    }

    const TIER_LABELS = { eco: 'Eco', standard: 'Standard', deep: 'Deep', fixed: 'Fixed' }
    const SOURCE_LABELS = { selected: 'MANUAL', heuristic: 'AUTO', classifier: 'AUTO·AI', fallback: 'AUTO·FB', purpose: 'FIXED' }

    function timeOf(iso) {
      const date = new Date(iso)
      if (Number.isNaN(date.getTime())) return ''
      return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    }

    function decisionTitle(decision) {
      const bits = [
        `tier: ${decision.tier}`,
        `route: ${decision.provider}/${decision.model}${decision.effort ? `/${decision.effort}` : ''}`,
        `source: ${decision.source}`,
      ]
      if (decision.score !== undefined && decision.score !== null) bits.push(`score: ${decision.score}`)
      if (Array.isArray(decision.signals) && decision.signals.length > 0) bits.push(`signals: ${decision.signals.join(', ')}`)
      if (decision.classifierMs !== undefined) bits.push(`classifier: ${decision.classifierMs}ms`)
      if (decision.degraded) bits.push('degraded route')
      return bits.join('\n')
    }

    /** Composer badge: the tier the last call actually used in this session. */
    function AutoBadge(props) {
      const sessionId = props !== null && typeof props === 'object' ? props.sessionId : undefined
      const [decision, setDecision] = React.useState(null)

      React.useEffect(() => {
        if (typeof sessionId !== 'string' || sessionId === '') return undefined
        let cancelled = false
        async function tick() {
          try {
            const payload = await getJson(`${AUTO_LAST}?sessionId=${encodeURIComponent(sessionId)}`)
            if (!cancelled) setDecision(payload !== null && typeof payload === 'object' ? (payload.decision ?? null) : null)
          } catch {
            if (!cancelled) setDecision(null)
          }
        }
        void tick()
        const timer = window.setInterval(() => { void tick() }, 5000)
        return () => {
          cancelled = true
          window.clearInterval(timer)
        }
      }, [sessionId])

      if (decision === null || decision === undefined) return null
      const tier = TIER_LABELS[decision.tier] ?? String(decision.tier ?? '—')
      return h('span', { className: 'qols-auto-dock', title: decisionTitle(decision), 'aria-label': `Auto: ${tier}` },
        h('span', { className: 'qols-auto-badge' },
          h('span', { className: 'qols-auto-dot', 'data-tier': String(decision.tier ?? ''), 'aria-hidden': true }),
          h('span', null, tier),
        ),
      )
    }

    /** Journal rows, newest first; shared by the Auto dialog. */
    function JournalList(props) {
      const limit = props !== null && typeof props === 'object' && typeof props.limit === 'number' ? props.limit : 12
      const [entries, setEntries] = React.useState(null)
      const [error, setError] = React.useState('')
      const [nonce, setNonce] = React.useState(0)

      React.useEffect(() => {
        let cancelled = false
        async function load() {
          try {
            const payload = await getJson(`${AUTO_LOG}?limit=${limit}`)
            if (cancelled) return
            setEntries(Array.isArray(payload?.entries) ? payload.entries : [])
            setError('')
          } catch (failure) {
            if (cancelled) return
            setEntries([])
            setError(messageOf(failure))
          }
        }
        void load()
        return () => { cancelled = true }
      }, [nonce, limit])

      let body
      if (entries === null) {
        body = h('div', { className: 'qols-auto-empty' }, '…')
      } else if (entries.length === 0) {
        body = h('div', { className: 'qols-auto-empty' }, error === '' ? t('autoEmpty') : `${t('autoOffline')}: ${error}`)
      } else {
        body = h('div', { className: 'qols-auto-list' }, entries.map((entry, index) => h('div', {
          key: `${entry.taskId ?? entry.at ?? index}-${index}`,
          className: 'qols-auto-row',
          title: decisionTitle(entry),
        },
        h('span', { className: 'qols-auto-time' }, timeOf(entry.at)),
        h('span', { className: 'qols-auto-tier', 'data-tier': String(entry.tier ?? '') }, TIER_LABELS[entry.tier] ?? String(entry.tier ?? '—')),
        h('span', { className: 'qols-auto-meta' },
          `${entry.provider}/${entry.model}${entry.effort ? `/${entry.effort}` : ''}`,
          ` · ${SOURCE_LABELS[entry.source] ?? entry.source}`,
          entry.score !== undefined && entry.score !== null ? ` · ${entry.score}` : '',
          entry.signals && entry.signals.length > 0 ? ` · ${entry.signals.join(',')}` : '',
        ))))
      }

      return h('div', { className: 'qols-dialog-section' },
        h('div', { className: 'qols-auto-head' },
          h('div', { className: 'qols-dialog-label' }, t('autoRecent')),
          h('button', { type: 'button', className: 'qols-auto-refresh', onClick: () => setNonce((value) => value + 1) }, t('autoRefresh')),
        ),
        body,
      )
    }

    /** Auto dialog body: writable judge model, the fixed routes, recent decisions. */
    function AutoSettings(props) {
      const description = props !== null && typeof props === 'object' && typeof props.description === 'string' ? props.description : ''
      const [info, setInfo] = React.useState(null)
      const [groups, setGroups] = React.useState(null)
      const [choice, setChoice] = React.useState('')
      const [saving, setSaving] = React.useState(false)
      const [note, setNote] = React.useState(null)

      React.useEffect(() => {
        let cancelled = false
        async function load() {
          try {
            const [settings, models] = await Promise.all([getJson(AUTO_CONFIG), getJson(AUTO_MODELS)])
            if (cancelled) return
            setInfo(settings !== null && typeof settings === 'object' ? settings : null)
            setGroups(Array.isArray(models?.groups) ? models.groups : [])
            const classifier = settings !== null && typeof settings === 'object' ? settings.classifier : null
            if (classifier !== null && typeof classifier === 'object') {
              setChoice(`${classifier.provider}|${classifier.model}`)
            }
          } catch (failure) {
            if (cancelled) return
            setInfo(null)
            setGroups([])
            setNote({ kind: 'error', text: messageOf(failure) })
          }
        }
        void load()
        return () => { cancelled = true }
      }, [])

      const classifier = info !== null && info.classifier !== null && typeof info.classifier === 'object' ? info.classifier : null
      const current = classifier === null ? '' : `${classifier.provider}|${classifier.model}`
      const dirty = choice !== '' && choice !== current

      async function save() {
        if (!dirty || saving) return
        const parts = choice.split('|')
        if (parts.length !== 2 || parts[0] === '' || parts[1] === '') return
        setSaving(true)
        setNote(null)
        try {
          const payload = await postJson(AUTO_CONFIG, { classifier: { provider: parts[0], model: parts[1] } })
          if (payload !== null && typeof payload === 'object') setInfo(payload)
          setNote({ kind: 'ok', text: t('autoSaved') })
        } catch (failure) {
          setNote({ kind: 'error', text: `${t('autoSaveFailed')}: ${messageOf(failure)}` })
        } finally {
          setSaving(false)
        }
      }

      const sections = []

      if (groups !== null) {
        const options = []
        for (const group of groups) {
          const models = group !== null && typeof group === 'object' && Array.isArray(group.models) ? group.models : []
          if (models.length === 0) continue
          options.push(h('optgroup', { key: String(group.id), label: String(group.name ?? group.id) },
            models.map((model) => h('option', { key: `${group.id}|${model.id}`, value: `${group.id}|${model.id}` }, `${model.name ?? model.id} · ${model.id}`))))
        }
        sections.push(h('div', { key: 'judge', className: 'qols-dialog-section' },
          h('div', { className: 'qols-dialog-label' }, t('autoClassifierModel')),
          h('div', { className: 'qols-dialog-row' },
            options.length === 0
              ? h('div', { className: 'qols-dialog-hint' }, t('autoOffline'))
              : h('select', {
                className: 'qols-dialog-select',
                value: choice,
                onChange: (event) => { setChoice(event.target.value); setNote(null) },
              }, options),
            h('button', { type: 'button', className: 'qols-dialog-button', disabled: !dirty || saving, onClick: () => { void save() } },
              saving ? '…' : t('autoSave')),
          ),
          h('div', { className: 'qols-dialog-hint' }, t('autoJudgeHint')),
          note === null ? null : h('div', { className: note.kind === 'ok' ? 'qols-dialog-ok' : 'qols-dialog-error' }, note.text),
        ))
      }

      const tiers = info !== null && info.tiers !== null && typeof info.tiers === 'object' ? info.tiers : null
      if (tiers !== null && Array.isArray(info.tierOrder)) {
        sections.push(h('div', { key: 'routes', className: 'qols-dialog-section' },
          h('div', { className: 'qols-dialog-label' }, t('autoRoutes')),
          h('div', { className: 'qols-dialog-route' }, info.tierOrder.map((id) => {
            const tier = tiers[id] !== null && typeof tiers[id] === 'object' ? tiers[id] : {}
            return `${TIER_LABELS[id] ?? id}: ${tier.provider}/${tier.model}${tier.effort ? `/${tier.effort}` : ''}`
          }).join('\n')),
        ))
      }
      if (info !== null && info.gray !== null && typeof info.gray === 'object') {
        sections.push(h('div', { key: 'gray', className: 'qols-dialog-section' },
          h('div', { className: 'qols-dialog-label' }, t('autoGray')),
          h('div', { className: 'qols-dialog-route' }, `eco ≤ ${info.gray.low} · deep ≥ ${info.gray.high} · classifier between`),
        ))
      }
      if (classifier !== null) {
        sections.push(h('div', { key: 'classifier', className: 'qols-dialog-section' },
          h('div', { className: 'qols-dialog-label' }, t('autoClassifier')),
          h('div', { className: 'qols-dialog-route' }, `thinking: ${classifier.effort ?? 'default'} · timeout: ${classifier.timeoutMs}ms · max tokens: ${classifier.maxTokens}`),
        ))
      }
      sections.push(h(JournalList, { key: 'journal', limit: 20 }))
      sections.push(h('div', { key: 'note', className: 'qols-dialog-note' }, t('autoReadOnly')))

      return h('div', { className: 'qols-dialog-body' },
        description === '' ? null : h('div', { className: 'qols-dialog-desc' }, description),
        sections,
      )
    }

    /** Traps focus in an open modal and restores it to the opener on close. */
    function useModalFocus(active, onClose) {
      const panel = React.useRef(null)
      React.useEffect(() => {
        if (active !== true) return undefined
        const opener = document.activeElement
        const node = panel.current
        const focusables = () => node === null
          ? []
          : Array.from(node.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'))
            .filter((item) => item.disabled !== true)
        const first = focusables()[0]
        if (node !== null && typeof node.focus === 'function') node.focus()
        else if (first !== undefined) first.focus()
        const previousOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        function onKey(event) {
          if (event.key === 'Escape') { onClose(); return }
          if (event.key !== 'Tab' || node === null) return
          const items = focusables()
          if (items.length === 0) return
          const head = items[0]
          const tail = items[items.length - 1]
          if (event.shiftKey === true && document.activeElement === head) {
            event.preventDefault()
            tail.focus()
          } else if (event.shiftKey === true && document.activeElement === node) {
            event.preventDefault()
            tail.focus()
          } else if (event.shiftKey !== true && document.activeElement === tail) {
            event.preventDefault()
            head.focus()
          }
        }
        window.addEventListener('keydown', onKey)
        return () => {
          window.removeEventListener('keydown', onKey)
          document.body.style.overflow = previousOverflow
          if (opener !== null && typeof opener.focus === 'function') opener.focus()
        }
      }, [active])
      return panel
    }

    /** One popup per feature: description plus that feature's settings. */
    function FeatureDialog(props) {
      const id = props !== null && typeof props === 'object' && typeof props.id === 'string' ? props.id : ''
      const onClose = props !== null && typeof props === 'object' && typeof props.onClose === 'function' ? props.onClose : () => {}
      const panel = useModalFocus(id !== '', onClose)

      if (id === '') return null
      const entry = catalog.find((item) => item.id === id)
      if (entry === undefined) return null

      const body = h(AutoSettings, { description: textOf(entry, 'description') })

      return h('div', { className: 'qols-dialog-overlay', role: 'presentation', onClick: onClose },
        h('div', {
          className: 'qols-dialog',
          role: 'dialog',
          'aria-modal': 'true',
          'aria-labelledby': `qols-dialog-title-${id}`,
          tabIndex: -1,
          ref: panel,
          onClick: (event) => { event.stopPropagation() },
        },
        h('div', { className: 'qols-dialog-head' },
          h('div', { className: 'qols-dialog-title', id: `qols-dialog-title-${id}` }, textOf(entry, 'title')),
          h('button', { type: 'button', className: 'qols-dialog-close', 'aria-label': t('close'), title: t('close'), onClick: onClose },
            h('svg', { viewBox: '0 0 16 16', 'aria-hidden': 'true', focusable: 'false' },
              h('path', { d: 'M4 4l8 8M12 4l-8 8', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.4', 'stroke-linecap': 'round' }),
            ),
          ),
        ),
        body,
        ),
      )
    }

    /** Row-level delete confirmation: Escape cancels, the row stays on failure. */
    function useConfirmKey() {
      const [key, setKey] = React.useState('')
      React.useEffect(() => {
        if (key === '') return undefined
        const onKeyDown = (event) => { if (event.key === 'Escape') setKey('') }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
      }, [key])
      return [key, setKey]
    }

    function RowActions(props) {
      const { busy, confirming, onAsk, onCancel, onDelete, onEdit } = props
      const cancelRef = React.useRef(null)
      React.useEffect(() => {
        if (confirming === true && cancelRef.current !== null) cancelRef.current.focus()
      }, [confirming])
      if (confirming === true) {
        return h('span', { className: 'qols-studio-actions' },
          h('span', { className: 'qols-studio-confirm' }, t('studioConfirmShort')),
          h('button', { type: 'button', className: 'qols-studio-button', ref: cancelRef, disabled: busy, onClick: onCancel }, t('studioCancel')),
          h('button', {
            type: 'button',
            className: 'qols-studio-button',
            'data-danger': 'true',
            disabled: busy,
            onClick: onDelete,
          }, t('studioDelete')),
        )
      }
      return h('span', { className: 'qols-studio-actions' },
        typeof onEdit === 'function'
          ? h('button', { type: 'button', className: 'qols-studio-button', disabled: busy, onClick: onEdit }, t('studioEdit'))
          : null,
        h('button', { type: 'button', className: 'qols-studio-button', disabled: busy, onClick: onAsk }, t('studioDelete')),
      )
    }

    const DIAG_LABELS = {
      ok: 'diagOk',
      degraded: 'diagDegraded',
      failed: 'diagFailedState',
      unregistered: 'diagUnregistered',
    }

    function diagLabel(state) {
      return t(DIAG_LABELS[state] ?? 'diagUnregistered')
    }

    function money(amount, currency) {
      const value = Number(amount)
      if (!Number.isFinite(value)) return '—'
      const body = value.toFixed(Math.abs(value) < 100 ? 4 : 2)
      if (currency === 'CNY') return `¥${body}`
      if (currency === 'USD') return `$${body}`
      return `${body} ${currency}`
    }

    function compactTokens(value) {
      const number = Number(value)
      if (!Number.isFinite(number) || number <= 0) return '0'
      if (number >= 1e6) return `${(number / 1e6).toFixed(1)}M`
      if (number >= 1e3) return `${(number / 1e3).toFixed(1)}K`
      return String(Math.round(number))
    }

    function clockOf(iso) {
      const date = new Date(iso)
      if (Number.isNaN(date.getTime())) return ''
      return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    }

    function countdownTo(iso) {
      const date = new Date(iso)
      if (Number.isNaN(date.getTime())) return ''
      const minutes = Math.max(0, Math.round((date.getTime() - Date.now()) / 60000))
      if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
      return `${minutes}m`
    }

    /**
     * The wallet the card shows: a topped-up balance with money in it first, then
     * any positive wallet, then the grant. At startup the grant wallet often
     * reports 0 while the real topped-up balance is already available.
     */
    function balanceLabel(balance) {
      if (balance === null || typeof balance !== 'object') return null
      if (balance.state !== 'ready' || !Array.isArray(balance.wallets) || balance.wallets.length === 0) return null
      const wallets = balance.wallets.filter((wallet) => wallet !== null && typeof wallet === 'object')
      if (wallets.length === 0) return null
      const positive = wallets.filter((wallet) => Number(wallet.amount) > 0)
      const topup = positive.find((wallet) => wallet.kind === 'topup')
      const wallet = topup ?? positive[0] ?? wallets[0]
      return { text: money(wallet.amount, wallet.currency), wallet }
    }

    /**
     * Sidebar footer card: today's cost and tokens, wallet balance and the peak
     * phase with a countdown. Polls the host every 5 s and on tab visibility.
     * While enabled it hides the cost-meter footer by setting a body class.
     */
    function UsageCard() {
      const [data, setData] = React.useState(null)
      const [error, setError] = React.useState('')
      const [graceOver, setGraceOver] = React.useState(false)

      React.useEffect(() => {
        let cancelled = false
        let timer = null
        async function tick() {
          let delay = 5000
          try {
            const payload = await getJson(USAGE_STATUS)
            if (cancelled) return
            setData(payload)
            setError('')
            // Until the wallet is known, poll faster: the host can only answer
            // once the account service is mounted, and this is what makes the
            // two money rows appear together instead of five seconds apart.
            const wallet = payload !== null && typeof payload === 'object' && payload.balance !== null && typeof payload.balance === 'object'
              ? payload.balance
              : null
            if (wallet !== null && wallet.state === 'unknown') delay = 1000
          } catch (failure) {
            if (!cancelled) setError(messageOf(failure))
          }
          if (!cancelled) timer = window.setTimeout(() => { void tick() }, delay)
        }
        void tick()
        const onVisible = () => { if (document.hidden !== true) void tick() }
        document.addEventListener('visibilitychange', onVisible)
        return () => {
          cancelled = true
          if (timer !== null) window.clearTimeout(timer)
          document.removeEventListener('visibilitychange', onVisible)
        }
      }, [])

      // If the account never arrives (signed-out install, no account service),
      // stop holding Today back after a few seconds: a lone row is better than
      // no row at all.
      React.useEffect(() => {
        const timer = window.setTimeout(() => setGraceOver(true), 6_000)
        return () => window.clearTimeout(timer)
      }, [])

      React.useEffect(() => {
        const settings = data !== null && data.settings !== null && typeof data.settings === 'object' ? data.settings : null
        const hide = data !== null && data.enabled === true && settings !== null && settings.hideCostMeter === true
        document.body.classList.toggle('qols-hide-cost-meter', hide)
        return () => document.body.classList.remove('qols-hide-cost-meter')
      }, [data])

      React.useEffect(() => subscribeUsageSettings((next) => {
        setData((current) => current !== null && typeof current === 'object'
          ? { ...current, settings: next }
          : current)
      }), [])

      if (data === null) {
        if (error !== '') return null
        return h('div', { className: 'qols-usage', 'aria-hidden': 'true' },
          h('div', { className: 'qols-usage-skeleton' }, h('span', null), h('span', null), h('span', null)),
        )
      }
      if (data.enabled !== true) return null

      const today = data.today !== null && typeof data.today === 'object' ? data.today : {}
      const tokens = today.tokens !== null && typeof today.tokens === 'object' ? today.tokens : {}
      const peak = data.peak !== null && typeof data.peak === 'object' ? data.peak : {}
      const settings = data.settings !== null && typeof data.settings === 'object' ? data.settings : {}
      const isPeak = peak.phase === 'peak'
      const weekend = peak.weekend === true
      const holiday = peak.holiday === true
      const phaseClass = isPeak ? 'peak' : weekend || holiday ? 'weekend' : 'off'
      // The rail is one local day. The host sends exact segments and the
      // fraction already elapsed, so the marker is time of day, not phase progress.
      const day = peak.day !== null && typeof peak.day === 'object' ? peak.day : null
      const dayStart = day !== null ? Date.parse(day.startAt) : NaN
      const dayEnd = day !== null ? Date.parse(day.endAt) : NaN
      const daySpan = dayEnd - dayStart
      const elapsed = day !== null && daySpan > 0
        ? Math.min(1, Math.max(0, Number(day.percent ?? 0)))
        : 0
      const markerLeft = `${(Math.min(0.995, Math.max(0.005, elapsed)) * 100).toFixed(1)}%`
      const segments = day !== null && daySpan > 0 && Array.isArray(day.segments)
        ? day.segments.map((segment, index) => {
          const start = Date.parse(segment.startAt)
          const end = Date.parse(segment.endAt)
          if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null
          const left = Math.min(1, Math.max(0, (start - dayStart) / daySpan))
          const right = Math.min(1, Math.max(0, (end - dayStart) / daySpan))
          return {
            key: `${String(segment.startAt)}-${index}`,
            peak: segment.peak === true,
            left: `${(left * 100).toFixed(3)}%`,
            width: `${((right - left) * 100).toFixed(3)}%`,
          }
        }).filter((segment) => segment !== null && Number.parseFloat(segment.width) > 0)
        : []
      const balance = balanceLabel(data.balance)
      const balanceState = data.balance !== null && typeof data.balance === 'object' && typeof data.balance.state === 'string'
        ? data.balance.state
        : 'unknown'
      // Today and Balance share one row, so they must arrive together. While the
      // wallet is still unknown (startup, account service not mounted yet) the
      // whole row waits; after the grace period a lone Today is better than
      // nothing.
      const holdMoney = balanceState === 'unknown' && !graceOver
      const showAmounts = settings.showAmounts !== false
      const warnBelow = Number(settings.balanceWarnBelow ?? 0)
      const low = balance !== null && warnBelow > 0 && balance.wallet.amount < warnBelow
      const phaseLabel = isPeak ? t('usagePeak') : holiday ? t('usageHoliday') : weekend ? t('usageWeekend') : t('usageOffPeak')
      const nextLabel = isPeak ? t('usageOffPeak') : t('usagePeak')
      const allDayOff = weekend || holiday || peak.hasWindows === false
      const chip = allDayOff
        ? weekend || holiday
          ? `${phaseLabel} · ${t('usageOffPeak')} ${t('usageAllDay')}`
          : `${phaseLabel} · ${t('usageAllDay')}`
        : `${phaseLabel} · ${nextLabel} ${t('usageIn')} ${countdownTo(peak.untilAt)}`
      const models = showAmounts && Array.isArray(today.models) ? today.models : []
      const details = models.map((row) => `${row.model}: ${money(row.cost, 'USD')} · ${compactTokens(row.tokens)}`)
      if (settings.showTokens === true) details.push(`${compactTokens(tokens.total)} ${t('usageTokens')}`)
      const title = error !== ''
        ? `${t('usageUnavailable')}: ${error}`
        : details.length > 0
          ? details.join('\n')
          : Number(today.calls ?? 0) > 0 ? t('usageHidden') : t('usageEmpty')

      return h('div', { className: 'qols-usage', title },
        showAmounts && !holdMoney
          ? h('div', { className: 'qols-usage-row' },
            h('div', { className: 'qols-usage-pair' },
              h('span', { className: 'qols-usage-label' }, t('usageToday')),
              h('span', { className: 'qols-usage-value' }, money(Number(today.cost ?? 0), 'USD')),
            ),
            balance !== null
              ? h('div', { className: 'qols-usage-pair' },
                h('span', { className: 'qols-usage-label' }, t('usageBalance')),
                h('span', { className: 'qols-usage-value', title: low ? t('usageLow') : undefined }, low ? `${balance.text} ⚠` : balance.text),
              )
              : null,
          )
          : null,
        h('div', { className: `qols-peak ${phaseClass}` },
          h('div', { className: 'qols-peak-rail' },
            h('div', { className: 'qols-peak-track' },
              segments.map((segment) => h('span', {
                key: segment.key,
                className: `qols-peak-segment ${segment.peak ? 'qols-peak-high' : 'qols-peak-low'}`,
                style: { left: segment.left, width: segment.width },
              })),
            ),
            h('div', { className: 'qols-peak-marker', style: { left: markerLeft } }),
          ),
          h('span', { className: 'qols-peak-chip' }, chip),
        ),
      )
    }

    /**
     * Per-turn cost line, registered into the chat turn tail.
     *
     * The tail exists only for a turn that has closed, and `props.turn` is that
     * turn's `TurnLocation`, so `props.turn.turn` is the number the chat renders
     * and the number the host recorded in its ledger. Fetching that exact turn is
     * what makes the line belong to the message above it; polling "the current
     * turn" would show the next request instead. One fetch per (session, turn),
     * cached, so a reload lists history without a request per message.
     */
    const turnCostCache = new Map()

    function TurnCost(props) {
      const sessionId = props !== null && typeof props === 'object' && typeof props.sessionId === 'string' ? props.sessionId : ''
      const turnNumber = props !== null && typeof props === 'object' && props.turn !== null && typeof props.turn === 'object'
        ? Number(props.turn.turn)
        : NaN
      const key = Number.isFinite(turnNumber) && turnNumber > 0 && sessionId !== '' ? `${sessionId}:${turnNumber}` : null
      const [data, setData] = React.useState(() => (key === null ? null : turnCostCache.get(key) ?? null))

      React.useEffect(() => {
        if (key === null) {
          setData(null)
          return undefined
        }
        if (turnCostCache.has(key)) {
          setData(turnCostCache.get(key))
          return undefined
        }
        let cancelled = false
        const suffix = `?sessionId=${encodeURIComponent(sessionId)}&turn=${turnNumber}`
        getJson(`${USAGE_TURN}${suffix}`).then((payload) => {
          if (cancelled) return
          const value = payload !== null && typeof payload === 'object' && payload.ok === true ? payload : null
          turnCostCache.set(key, value)
          setData(value)
        }).catch(() => {
          if (!cancelled) setData(null)
        })
        return () => {
          cancelled = true
        }
      }, [key, sessionId, turnNumber])

      if (data === null || data === undefined) return null
      if (Number(data.calls) === 0) return null
      const calls = Array.isArray(data.recent) ? data.recent : []
      const tokens = data.tokens !== null && typeof data.tokens === 'object' ? data.tokens : {}
      return h('details', { className: 'qols-turn', 'data-qols-turn': String(data.turn) },
        h('summary', null, `${t('usageTurn')} ≈ ${money(data.cost, 'USD')} · ${Number(data.calls)} ${t('usageCalls')}`),
        h('div', { className: 'qols-turn-body' },
          h('div', null,
            `${compactTokens(tokens.total)} ${t('usageTokens')} · in ${compactTokens(tokens.input)} · out ${compactTokens(tokens.output)} · cache ${compactTokens(Number(tokens.cacheRead ?? 0) + Number(tokens.cacheWrite ?? 0))}`,
          ),
          calls.map((call, index) => h('div', { key: `${String(call.at)}-${index}`, className: 'qols-turn-call' },
            `${clockOf(call.at)} · ${String(call.model ?? '')} · ${money(call.cost, 'USD')} · ${compactTokens(call.tokens !== null && typeof call.tokens === 'object' ? call.tokens.total : 0)}`,
          )),
        ),
      )
    }

    /**
     * Live cost of the running turn, registered into the composer dock.
     *
     * A turn tail is published only on `turn/end`, so it cannot show a number
     * while the turn is still working. This chip polls the status route (which
     * knows whether a turn is open) and disappears as soon as the turn closes,
     * leaving the exact per-message line behind.
     */
    function LiveTurnCost(props) {
      const sessionId = props !== null && typeof props === 'object' && typeof props.sessionId === 'string' ? props.sessionId : ''
      const [turn, setTurn] = React.useState(null)

      React.useEffect(() => {
        let cancelled = false
        let timer = null
        const suffix = sessionId === '' ? '' : `?sessionId=${encodeURIComponent(sessionId)}`
        async function tick() {
          let isOpen = false
          try {
            const payload = await getJson(`${USAGE_STATUS}${suffix}`)
            const next = payload !== null && typeof payload === 'object' ? (payload.turn ?? null) : null
            isOpen = next !== null && next.open === true
            if (!cancelled) setTurn(next)
          } catch {
            if (!cancelled) setTurn(null)
          }
          // A closed turn is already covered by the message's own line: back off
          // instead of spending a request every two seconds for nothing.
          if (!cancelled) timer = window.setTimeout(() => { void tick() }, isOpen ? 2000 : 15000)
        }
        void tick()
        return () => {
          cancelled = true
          if (timer !== null) window.clearTimeout(timer)
        }
      }, [sessionId])

      if (turn === null || turn.open !== true || turn.totals === null || typeof turn.totals !== 'object') return null
      if (Number(turn.totals.calls) === 0) return null
      return h('div', {
        className: 'qols-live-cost',
        title: t('usageTurn'),
        'data-qols-live-turn': String(turn.sessionTurn ?? turn.turn ?? ''),
      }, `≈ ${money(turn.totals.cost, 'USD')} · ${Number(turn.totals.calls)} ${t('usageCalls')}`)
    }

    /** Writable usage preferences: the cost-meter card, tokens and balance. */
    function UsageSettings() {
      const [config, setConfig] = React.useState(null)
      const [note, setNote] = React.useState(null)
      const [busy, setBusy] = React.useState(false)

      React.useEffect(() => {
        let cancelled = false
        getJson(USAGE_CONFIG).then((payload) => {
          if (cancelled) return
          setConfig(payload !== null && typeof payload === 'object' && payload.config !== null && typeof payload.config === 'object' ? payload.config : null)
        }).catch(() => {
          if (!cancelled) setConfig(null)
        })
        return () => { cancelled = true }
      }, [])

      async function patch(change) {
        setBusy(true)
        try {
          const payload = await postJson(USAGE_CONFIG, change)
          if (payload !== null && typeof payload === 'object' && payload.config !== null && typeof payload.config === 'object') {
            setConfig(payload.config)
            publishUsageSettings(payload.config)
          }
          setNote({ kind: 'ok', text: t('usageSettingsSaved') })
        } catch (failure) {
          setNote({ kind: 'error', text: `${t('usageSettingsFailed')}: ${messageOf(failure)}` })
        } finally {
          setBusy(false)
        }
      }

      if (config === null) return null
      const switches = [
        { key: 'hideCostMeter', label: t('usageHideCostMeter'), on: config.hideCostMeter === true },
        { key: 'showTokens', label: t('usageShowTokens'), on: config.showTokens === true },
        { key: 'showAmounts', label: t('usageShowAmounts'), on: config.showAmounts !== false },
      ]
      return h('section', { className: 'qols-card' },
        h('div', { className: 'qols-card-head' },
          h('h4', { className: 'qols-feature-title' }, t('usageTitle')),
        ),
        h('p', { className: 'qols-feature-desc' }, t('usageHint')),
        h('div', { className: 'qols-switch-list' }, switches.map((option) => h('div', { key: option.key, className: 'qols-switch-row' },
          h('span', { className: 'qols-switch-label' }, option.label),
          h('button', {
            type: 'button',
            className: 'qols-switch',
            role: 'switch',
            'aria-checked': option.on ? 'true' : 'false',
            'aria-label': option.label,
            disabled: busy,
            onClick: () => { void patch({ [option.key]: option.on !== true }) },
          }, h('span', { className: 'qols-switch-thumb', 'aria-hidden': true })),
        ))),
        note !== null ? h('div', { className: note.kind === 'ok' ? 'qols-dialog-ok' : 'qols-dialog-error', role: 'status' }, note.text) : null,
      )
    }

    const STUDIO_TABS = [
      { id: 'skills', label: 'studioTabSkills' },
      { id: 'commands', label: 'studioTabCommands' },
      { id: 'rules', label: 'studioTabRules' },
      { id: 'agents', label: 'studioTabAgents' },
      { id: 'instruction', label: 'studioTabInstruction' },
    ]

    /** Questionnaire the new Session starts with, one per Studio section. */
    function studioChatPrompt(tab) {
      if (tab === 'commands') return t('studioChatPromptCommands')
      if (tab === 'rules') return t('studioChatPromptRules')
      if (tab === 'agents') return t('studioChatPromptAgents')
      return t('studioChatPromptSkills')
    }

    /**
     * Commands tab state: the stored slash commands, the editor draft and the
     * registration state reported by the host. A hook, so the header (count and
     * the New command button) and the body share one source of truth.
     */
    function useCommands(query) {
      const [data, setData] = React.useState(null)
      const [draft, setDraft] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const [note, setNote] = React.useState(null)
      const [confirming, setConfirming] = useConfirmKey()

      const load = React.useCallback(async () => {
        try {
          setData(await getJson(STUDIO_COMMANDS_ROUTE))
        } catch (failure) {
          setNote({ kind: 'error', text: `${t('studioFailed')}: ${messageOf(failure)}` })
        }
      }, [])

      React.useEffect(() => { void load() }, [load])

      const commands = data !== null && Array.isArray(data.commands) ? data.commands : []
      const visible = searchFilter(commands, query, (command) => {
        const action = command.action !== null && typeof command.action === 'object' ? command.action : {}
        return [command.name, command.description, action.text, action.tier]
      })

      function startNew() {
        setNote(null)
        setDraft({ editing: false, name: '', description: '', type: 'prompt', text: '', tier: 'standard' })
      }

      function startEdit(command) {
        setNote(null)
        const action = command.action !== null && typeof command.action === 'object' ? command.action : {}
        setDraft({
          editing: true,
          name: command.name,
          description: command.description,
          type: action.type ?? 'prompt',
          text: action.text ?? '',
          tier: action.tier ?? 'standard',
        })
      }

      function patch(field, value) {
        setDraft((current) => (current === null ? current : { ...current, [field]: value }))
      }

      async function save() {
        if (draft === null) return
        setBusy(true)
        try {
          const action = draft.type === 'tier'
            ? { type: 'tier', tier: draft.tier }
            : { type: draft.type, text: draft.text }
          await postJson(STUDIO_COMMANDS_ROUTE, {
            name: draft.name,
            description: draft.description,
            action,
          })
          setDraft(null)
          setNote({ kind: 'ok', text: t('studioSaved') })
          await load()
        } catch (failure) {
          setNote({ kind: 'error', text: `${t('studioFailed')}: ${messageOf(failure)}` })
        } finally {
          setBusy(false)
        }
      }

      async function remove(command) {
        setBusy(true)
        try {
          const response = await fetch(`${STUDIO_COMMANDS_ROUTE}?name=${encodeURIComponent(command.name)}`, {
            method: 'DELETE',
            credentials: 'same-origin',
            headers: { accept: 'application/json' },
          })
          const payload = await response.json().catch(() => null)
          if (!response.ok) {
            throw new Error(payload !== null && typeof payload.error === 'string' ? payload.error : `HTTP ${response.status}`)
          }
          setNote({ kind: 'ok', text: t('studioDeleted') })
          await load()
        } catch (failure) {
          setNote({ kind: 'error', text: `${t('studioFailed')}: ${messageOf(failure)}` })
        } finally {
          setBusy(false)
        }
      }

      const form = draft === null ? null : h('div', { className: 'qols-studio-form' },
        h('label', { className: 'qols-studio-field' }, t('studioName'),
          h('input', {
            type: 'text',
            value: draft.name,
            disabled: draft.editing === true || busy,
            placeholder: 'my-command',
            onChange: (event) => patch('name', event.target.value),
          }),
        ),
        h('label', { className: 'qols-studio-field' }, t('studioDescription'),
          h('input', {
            type: 'text',
            value: draft.description,
            disabled: busy,
            onChange: (event) => patch('description', event.target.value),
          }),
        ),
        h('label', { className: 'qols-studio-field' }, t('studioCmdType'),
          h('select', {
            value: draft.type,
            disabled: busy,
            onChange: (event) => patch('type', event.target.value),
          },
            h('option', { value: 'prompt' }, t('studioCmdPrompt')),
            h('option', { value: 'tier' }, t('studioCmdTier')),
            h('option', { value: 'say' }, t('studioCmdSay')),
          ),
        ),
        draft.type === 'tier'
          ? h('label', { className: 'qols-studio-field' }, t('studioCmdTierValue'),
            h('select', {
              value: draft.tier,
              disabled: busy,
              onChange: (event) => patch('tier', event.target.value),
            },
              h('option', { value: 'eco' }, 'Eco'),
              h('option', { value: 'standard' }, 'Standard'),
              h('option', { value: 'deep' }, 'Deep'),
            ),
          )
          : h('label', { className: 'qols-studio-field' }, t('studioCmdText'),
            h('textarea', {
              value: draft.text,
              disabled: busy,
              onChange: (event) => patch('text', event.target.value),
            }),
          ),
        h('div', { className: 'qols-studio-actions' },
          h('button', {
            type: 'button',
            className: 'qols-studio-button',
            'data-primary': 'true',
            disabled: busy,
            onClick: () => { void save() },
          }, t('studioSave')),
          h('button', {
            type: 'button',
            className: 'qols-studio-button',
            disabled: busy,
            onClick: () => setDraft(null),
          }, t('studioCancel')),
        ),
      )

      const rows = visible.length === 0
        ? h('div', { className: 'qols-studio-empty' }, commands.length === 0 ? t('studioCmdEmpty') : t('studioNoMatches'))
        : h('div', { className: 'qols-studio-list' }, visible.map((command) => {
          const action = command.action !== null && typeof command.action === 'object' ? command.action : {}
          const summary = action.type === 'tier' ? `tier → ${action.tier}` : String(action.text ?? '')
          const editing = draft !== null && draft.editing === true && draft.name === command.name
          return h('div', { key: command.name, className: 'qols-studio-row' },
            h('div', { className: 'qols-studio-main' },
              h('div', { className: 'qols-studio-line' },
                h('span', { className: 'qols-studio-name' }, `/${command.name}`),
                h('span', {
                  className: 'qols-studio-badge',
                  title: command.registered === true ? undefined : String(command.error ?? ''),
                  'data-source': command.registered === true ? 'registered' : 'unregistered',
                }, command.registered === true ? t('studioCmdRegistered') : t('studioCmdUnregistered')),
              ),
              command.description !== '' ? h('span', { className: 'qols-studio-desc', title: summary }, command.description) : null,
            ),
            h(RowActions, {
              busy,
              confirming: confirming === command.name,
              onAsk: () => setConfirming(command.name),
              onCancel: () => setConfirming(''),
              onDelete: () => { setConfirming(''); void remove(command) },
              onEdit: () => startEdit(command),
            }),
            editing ? form : null,
          )
        }))

      return {
        commands,
        visible,
        draft,
        busy,
        note,
        confirming,
        setConfirming,
        startNew,
        startEdit,
        patch,
        save,
        remove,
        form,
        rows,
        cancel: () => setDraft(null),
      }
    }

    /** Commands tab body; the count and the New command button live in the header. */
    function CommandsView(state) {
      const note = state.note
      return h('div', { className: 'qols-studio-commands' },
        h('div', { className: 'qols-studio-hint' }, t('studioCmdHint')),
        h('div', { className: 'qols-studio-hint' }, t('studioCmdArgs')),
        note !== null ? h('div', { className: note.kind === 'ok' ? 'qols-dialog-ok' : 'qols-dialog-error' }, note.text) : null,
        state.draft !== null && state.draft.editing !== true ? state.form : null,
        state.rows,
      )
    }

    /**
     * Rules tab state: the rule files, the exact prompt text they produce and
     * the editor draft. The host snapshots rules into the system prompt when the
     * plugin loads, so `preview` is what the next session will receive, while
     * `section.mountedBytes` describes the section the running host mounted.
     */
    function useRules(query) {
      const [data, setData] = React.useState(null)
      const [draft, setDraft] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const [note, setNote] = React.useState(null)
      const [confirming, setConfirming] = useConfirmKey()

      const load = React.useCallback(async () => {
        try {
          setData(await getJson(STUDIO_RULES_ROUTE))
        } catch (failure) {
          setNote({ kind: 'error', text: `${t('studioFailed')}: ${messageOf(failure)}` })
        }
      }, [])

      React.useEffect(() => { void load() }, [load])

      const rules = data !== null && Array.isArray(data.rules) ? data.rules : []
      const visible = searchFilter(rules, query, (rule) => [rule.name, rule.description, rule.source, rule.body])
      const preview = data !== null && typeof data.preview === 'string' ? data.preview : ''
      const projectRoot = data !== null && Array.isArray(data.roots)
        ? data.roots.find((root) => root !== null && typeof root === 'object' && root.id === 'project') ?? null
        : null
      const defaultSource = projectRoot !== null && projectRoot.available === true ? 'project' : 'user'

      function startNew() {
        setNote(null)
        setDraft({ editing: false, source: defaultSource, name: '', description: '', enabled: true, body: '' })
      }

      function startEdit(rule) {
        setNote(null)
        setDraft({
          editing: true,
          source: rule.source,
          name: rule.name,
          description: rule.description,
          enabled: rule.enabled !== false,
          body: rule.body,
        })
      }

      function patch(field, value) {
        setDraft((current) => (current === null ? current : { ...current, [field]: value }))
      }

      async function save() {
        if (draft === null) return
        setBusy(true)
        try {
          await postJson(STUDIO_RULES_ROUTE, {
            source: draft.source,
            name: draft.name,
            description: draft.description,
            enabled: draft.enabled,
            body: draft.body,
          })
          setDraft(null)
          setNote({ kind: 'ok', text: t('studioRuleSaved') })
          await load()
        } catch (failure) {
          setNote({ kind: 'error', text: `${t('studioFailed')}: ${messageOf(failure)}` })
        } finally {
          setBusy(false)
        }
      }

      async function remove(rule) {
        setBusy(true)
        try {
          const response = await fetch(`${STUDIO_RULES_ROUTE}?source=${encodeURIComponent(rule.source)}&name=${encodeURIComponent(rule.name)}`, {
            method: 'DELETE',
            credentials: 'same-origin',
            headers: { accept: 'application/json' },
          })
          const payload = await response.json().catch(() => null)
          if (!response.ok) {
            throw new Error(payload !== null && typeof payload.error === 'string' ? payload.error : `HTTP ${response.status}`)
          }
          setNote({ kind: 'ok', text: t('studioRuleDeleted') })
          await load()
        } catch (failure) {
          setNote({ kind: 'error', text: `${t('studioFailed')}: ${messageOf(failure)}` })
        } finally {
          setBusy(false)
        }
      }

      const form = draft === null ? null : h('div', { className: 'qols-studio-form' },
        h('label', { className: 'qols-studio-field' }, t('studioName'),
          h('input', {
            type: 'text',
            value: draft.name,
            disabled: draft.editing === true || busy,
            placeholder: 'my-rule',
            onChange: (event) => patch('name', event.target.value),
          }),
        ),
        h('label', { className: 'qols-studio-field' }, t('studioDescription'),
          h('input', {
            type: 'text',
            value: draft.description,
            disabled: busy,
            onChange: (event) => patch('description', event.target.value),
          }),
        ),
        h('label', { className: 'qols-studio-field' }, t('studioSource'),
          h('select', {
            value: draft.source,
            disabled: draft.editing === true || busy,
            onChange: (event) => patch('source', event.target.value),
          },
            h('option', { value: 'project' }, t('studioProject')),
            h('option', { value: 'user' }, t('studioUser')),
          ),
        ),
        h('label', { className: 'qols-studio-enabled' },
          h('input', {
            type: 'checkbox',
            checked: draft.enabled !== false,
            disabled: busy,
            onChange: (event) => patch('enabled', event.target.checked),
          }),
          h('span', null, t('studioRuleEnabled')),
        ),
        h('label', { className: 'qols-studio-field' }, t('studioBody'),
          h('textarea', {
            value: draft.body,
            disabled: busy,
            onChange: (event) => patch('body', event.target.value),
          }),
        ),
        h('div', { className: 'qols-studio-actions' },
          h('button', { type: 'button', className: 'qols-studio-button', 'data-primary': 'true', disabled: busy, onClick: () => { void save() } }, t('studioSave')),
          h('button', { type: 'button', className: 'qols-studio-button', disabled: busy, onClick: () => setDraft(null) }, t('studioCancel')),
        ),
      )

      const rows = visible.length === 0
        ? h('div', { className: 'qols-studio-empty' }, rules.length === 0 ? t('studioRuleEmpty') : t('studioNoMatches'))
        : h('div', { className: 'qols-studio-list' }, visible.map((rule) => {
          const rowKey = `${rule.source}:${rule.name}`
          const editing = draft !== null && draft.editing === true && draft.name === rule.name && draft.source === rule.source
          return h('div', {
            key: rowKey,
            className: 'qols-studio-row',
          },
            h('div', { className: 'qols-studio-main' },
              h('div', { className: 'qols-studio-line' },
                h('span', { className: 'qols-studio-name' }, `${rule.source}/${rule.name}`),
                h('span', { className: 'qols-studio-badge', 'data-source': rule.enabled === false ? 'unregistered' : 'registered' },
                  rule.enabled === false ? 'off' : 'on'),
                rule.valid !== true
                  ? h('span', { className: 'qols-studio-badge', 'data-tone': 'error', title: (rule.problems ?? []).join('; ') }, 'invalid')
                  : null,
              ),
              rule.description !== '' ? h('span', { className: 'qols-studio-desc' }, rule.description) : null,
            ),
            h(RowActions, {
              busy,
              confirming: confirming === rowKey,
              onAsk: () => setConfirming(rowKey),
              onCancel: () => setConfirming(''),
              onDelete: () => { setConfirming(''); void remove(rule) },
              onEdit: () => startEdit(rule),
            }),
            editing ? form : null,
          )
        }))

      return {
        rules,
        visible,
        preview,
        draft,
        busy,
        note,
        confirming,
        setConfirming,
        startNew,
        startEdit,
        patch,
        save,
        remove,
        form,
        rows,
        cancel: () => setDraft(null),
      }
    }

    /** Rules tab body: the prompt preview, the editor and the rule list. */
    function RulesView(state) {
      const note = state.note
      return h('div', { className: 'qols-studio-commands' },
        h('div', { className: 'qols-studio-hint' }, t('studioRuleHint')),
        note !== null ? h('div', { className: note.kind === 'ok' ? 'qols-dialog-ok' : 'qols-dialog-error' }, note.text) : null,
        state.preview !== ''
          ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
            h('div', { className: 'qols-studio-hint' }, t('studioRulePreview')),
            h('pre', { className: 'qols-studio-preview' }, state.preview),
          )
          : null,
        state.draft !== null && state.draft.editing !== true ? state.form : null,
        state.rows,
      )
    }

    /**
     * Agents tab: which presets the harness assembled, plus a generator for a
     * profile patch entry. The host owns validation; the client only edits a
     * form and copies the resulting YAML.
     */
    function useAgents(query) {
      const [data, setData] = React.useState(null)
      const [draft, setDraft] = React.useState(null)
      const [snippet, setSnippet] = React.useState('')
      const [detail, setDetail] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const [note, setNote] = React.useState(null)

      const load = React.useCallback(async () => {
        try {
          setData(await getJson(STUDIO_AGENTS_ROUTE))
        } catch (failure) {
          setNote({ kind: 'error', text: `${t('studioFailed')}: ${messageOf(failure)}` })
        }
      }, [])

      React.useEffect(() => { void load() }, [load])

      const presets = data !== null && Array.isArray(data.presets) ? data.presets : []
      const visible = searchFilter(presets, query, (preset) => [preset.id, preset.name, preset.description])
      const available = data !== null && data.available === true
      const profile = data !== null && data.patch !== null && typeof data.patch === 'object' ? data.patch : null

      function startNew() {
        setNote(null)
        setSnippet('')
        setDraft({ id: '', name: '', description: '', order: '', plugins: '', makeDefault: false })
      }

      function patchField(field, value) {
        setDraft((current) => (current === null ? current : { ...current, [field]: value }))
      }

      async function build() {
        if (draft === null) return
        setBusy(true)
        setNote(null)
        try {
          const payload = await postJson(STUDIO_AGENTS_ROUTE, {
            id: draft.id,
            name: draft.name,
            description: draft.description,
            order: draft.order,
            plugins: draft.plugins.split('\n').map((line) => line.trim()).filter((line) => line !== ''),
            makeDefault: draft.makeDefault === true,
          })
          setSnippet(payload !== null && typeof payload.snippet === 'string' ? payload.snippet : '')
          setNote({ kind: 'ok', text: t('studioAgentReady') })
        } catch (failure) {
          setSnippet('')
          setNote({ kind: 'error', text: `${t('studioFailed')}: ${messageOf(failure)}` })
        } finally {
          setBusy(false)
        }
      }

      async function copy() {
        if (snippet === '') return
        try {
          await navigator.clipboard.writeText(snippet)
          setNote({ kind: 'ok', text: t('studioAgentCopied') })
        } catch (failure) {
          setNote({ kind: 'error', text: messageOf(failure) })
        }
      }

      async function showPreset(id) {
        if (detail !== null && detail.id === id) {
          setDetail(null)
          return
        }
        setBusy(true)
        setNote(null)
        try {
          const payload = await getJson(`${STUDIO_AGENTS_ROUTE}?preset=${encodeURIComponent(id)}`)
          const preset = payload !== null && payload.preset !== null && typeof payload.preset === 'object' ? payload.preset : null
          setDetail(preset === null ? null : {
            id,
            content: typeof preset.content === 'string' ? preset.content : '',
            truncated: preset.truncated === true,
          })
        } catch (failure) {
          setNote({ kind: 'error', text: `${t('studioFailed')}: ${messageOf(failure)}` })
        } finally {
          setBusy(false)
        }
      }

      const form = draft === null ? null : h('div', { className: 'qols-studio-form' },
        h('label', { className: 'qols-studio-field' }, t('studioAgentId'),
          h('input', {
            type: 'text',
            value: draft.id,
            disabled: busy,
            placeholder: 'my-preset',
            onChange: (event) => patchField('id', event.target.value),
          }),
        ),
        h('label', { className: 'qols-studio-field' }, t('studioName'),
          h('input', {
            type: 'text',
            value: draft.name,
            disabled: busy,
            onChange: (event) => patchField('name', event.target.value),
          }),
        ),
        h('label', { className: 'qols-studio-field' }, t('studioDescription'),
          h('input', {
            type: 'text',
            value: draft.description,
            disabled: busy,
            onChange: (event) => patchField('description', event.target.value),
          }),
        ),
        h('label', { className: 'qols-studio-field' }, t('studioAgentOrder'),
          h('input', {
            type: 'text',
            inputMode: 'numeric',
            value: draft.order,
            disabled: busy,
            placeholder: '5',
            onChange: (event) => patchField('order', event.target.value),
          }),
        ),
        h('label', { className: 'qols-studio-field' }, t('studioAgentPlugins'),
          h('textarea', {
            style: { minHeight: '90px' },
            value: draft.plugins,
            disabled: busy,
            placeholder: '@deepseek-ai/dsh-tool-web\n@deepseek-ai/dsh-persona',
            onChange: (event) => patchField('plugins', event.target.value),
          }),
        ),
        h('label', { className: 'qols-studio-enabled' },
          h('input', {
            type: 'checkbox',
            checked: draft.makeDefault === true,
            disabled: busy,
            onChange: (event) => patchField('makeDefault', event.target.checked),
          }),
          t('studioAgentDefaultCheck'),
        ),
        h('div', { className: 'qols-studio-actions' },
          h('button', {
            type: 'button',
            className: 'qols-studio-button',
            'data-primary': 'true',
            disabled: busy,
            onClick: () => { void build() },
          }, t('studioAgentBuild')),
          h('button', {
            type: 'button',
            className: 'qols-studio-button',
            disabled: busy,
            onClick: () => { setDraft(null); setNote(null) },
          }, t('studioCancel')),
        ),
      )

      return {
        presets: visible,
        visible,
        total: presets.length,
        available,
        profile,
        draft,
        snippet,
        detail,
        busy,
        note,
        startNew,
        build,
        copy,
        showPreset,
        form,
        cancel: () => { setDraft(null); setSnippet('') },
      }
    }

    /** Agents tab body: availability, generated entry, patch location and presets. */
    function AgentsView(state) {
      const profile = state.profile
      const where = profile !== null && typeof profile.patchFile === 'string' ? profile.patchFile : null
      return h('div', { className: 'qols-studio-commands' },
        h('div', { className: 'qols-studio-hint' }, t('studioAgentHint')),
        state.available !== true ? h('div', { className: 'qols-studio-roots' }, t('studioAgentUnavailable')) : null,
        state.note !== null ? h('div', { className: state.note.kind === 'ok' ? 'qols-dialog-ok' : 'qols-dialog-error' }, state.note.text) : null,
        state.snippet !== ''
          ? h('div', { className: 'qols-studio-form' },
            h('div', { className: 'qols-studio-hint' }, t('studioAgentSnippet')),
            h('pre', { className: 'qols-studio-preview' }, state.snippet),
            h('div', { className: 'qols-studio-actions' },
              h('button', {
                type: 'button',
                className: 'qols-studio-button',
                onClick: () => { void state.copy() },
              }, t('studioAgentCopy')),
            ),
          )
          : null,
        h('div', { className: 'qols-studio-roots' }, `${t('studioAgentWhere')}: ${where ?? t('studioAgentNoProfile')}`),
        h('div', { className: 'qols-studio-hint' }, t('studioAgentRestart')),
        state.form,
        state.presets.length === 0
          ? h('div', { className: 'qols-studio-empty' }, state.total === 0 ? t('studioAgentEmpty') : t('studioNoMatches'))
          : h('div', { className: 'qols-studio-list' }, state.presets.map((preset) => h('div', { key: preset.id },
            h('div', { className: 'qols-studio-row' },
              h('div', { className: 'qols-studio-main' },
                h('div', { className: 'qols-studio-line' },
                  h('span', { className: 'qols-studio-name' }, preset.id),
                  preset.isDefault === true
                    ? h('span', { className: 'qols-studio-badge', 'data-source': 'registered' }, t('studioAgentDefaultBadge'))
                    : null,
                  preset.broken !== null && preset.broken !== undefined
                    ? h('span', { className: 'qols-studio-badge', 'data-source': 'unregistered', title: preset.broken }, t('studioAgentBroken'))
                    : null,
                ),
                h('span', { className: 'qols-studio-desc' }, preset.description ?? preset.name ?? ''),
              ),
              h('span', { className: 'qols-studio-actions' },
                h('button', {
                  type: 'button',
                  className: 'qols-studio-button',
                  disabled: state.busy,
                  onClick: () => { void state.showPreset(preset.id) },
                }, state.detail !== null && state.detail.id === preset.id ? t('studioAgentHide') : t('studioAgentShow')),
              ),
            ),
            state.detail !== null && state.detail.id === preset.id && state.detail.content !== ''
              ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
                h('div', { className: 'qols-studio-hint' }, t('studioAgentShow')),
                h('pre', { className: 'qols-studio-preview' }, state.detail.content),
              )
              : null,
          ))),
      )
    }

    /** UTF-8 size of a string, without trusting the browser's TextEncoder quirks. */
    function utf8Bytes(value) {
      try {
        return new Blob([value]).size
      } catch {
        return value.length
      }
    }

    /**
     * Draft of the instruction editor while the component is unmounted: choosing
     * another tab must not throw away text the user has not saved yet. It is
     * cleared by a successful save and by an explicit reload.
     */
    let instructionDraft = null

    /**
     * The global `AGENTS.md` at the DSH home, edited in place.
     *
     * The host returns the exact bytes on disk, so the editor keeps two things
     * apart: what the file holds and what the textarea holds. Save is enabled
     * only when they differ, which makes "did I save?" answerable at a glance.
     */
    function InstructionView() {
      const [state, setState] = React.useState(null)
      const [text, setText] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const [note, setNote] = React.useState(null)

      const adopt = React.useCallback((payload) => {
        const disk = typeof payload.text === 'string' ? payload.text : ''
        setState(payload)
        if (instructionDraft !== null && instructionDraft !== disk) {
          setText(instructionDraft)
        } else {
          instructionDraft = null
          setText(disk)
        }
      }, [])

      const load = React.useCallback(async () => {
        setBusy(true)
        setNote(null)
        instructionDraft = null
        try {
          const payload = await getJson(STUDIO_INSTRUCTION_ROUTE)
          setState(payload)
          setText(typeof payload.text === 'string' ? payload.text : '')
        } catch (failure) {
          setNote({ kind: 'error', text: `${t('instructionFailed')}: ${messageOf(failure)}` })
        } finally {
          setBusy(false)
        }
      }, [])

      React.useEffect(() => {
        let live = true
        setBusy(true)
        void (async () => {
          try {
            const payload = await getJson(STUDIO_INSTRUCTION_ROUTE)
            if (live) adopt(payload)
          } catch (failure) {
            if (live) setNote({ kind: 'error', text: `${t('instructionFailed')}: ${messageOf(failure)}` })
          } finally {
            if (live) setBusy(false)
          }
        })()
        return () => { live = false }
      }, [adopt])

      const disk = state === null || typeof state.text !== 'string' ? '' : state.text
      const dirty = state !== null && text !== disk
      const max = state !== null && Number.isFinite(state.max) ? state.max : 256 * 1024
      const bytes = utf8Bytes(text)
      const lines = text === '' ? 0 : text.split('\n').length

      function edit(value) {
        setText(value)
        instructionDraft = value === disk ? null : value
      }

      async function save() {
        setBusy(true)
        setNote(null)
        try {
          const payload = await postJson(STUDIO_INSTRUCTION_ROUTE, { text })
          instructionDraft = null
          adopt(payload)
          setNote({ kind: 'ok', text: t('instructionSaved') })
        } catch (failure) {
          setNote({ kind: 'error', text: `${t('studioSaveFailed')}: ${messageOf(failure)}` })
        } finally {
          setBusy(false)
        }
      }

      return h('div', { className: 'qols-instruction' },
        h('div', { className: 'qols-studio-roots' }, state === null ? '' : state.path),
        state !== null && state.exists !== true
          ? h('div', { className: 'qols-studio-hint' }, t('instructionMissing'))
          : null,
        h('textarea', {
          value: text,
          rows: 18,
          spellCheck: false,
          'aria-label': t('studioTabInstruction'),
          placeholder: '# AGENTS.md',
          onChange: (event) => edit(event.target.value),
        }),
        h('div', { className: 'qols-instruction-foot' },
          h('span', { className: 'qols-studio-hint' },
            `${lines} · ${bytes} / ${max} ${t('instructionLimit')}${dirty ? ` · ${t('instructionDirty')}` : ''}`),
          h('button', {
            type: 'button',
            className: 'qols-studio-button',
            disabled: busy,
            onClick: () => { void load() },
          }, t('instructionReload')),
          h('button', {
            type: 'button',
            className: 'qols-studio-button',
            'data-primary': 'true',
            disabled: busy || !dirty,
            onClick: () => { void save() },
          }, t('instructionSave')),
        ),
        note !== null ? h('div', { className: note.kind === 'ok' ? 'qols-dialog-ok' : 'qols-dialog-error', role: 'status' }, note.text) : null,
        h('p', { className: 'qols-studio-hint' }, t('instructionHint')),
      )
    }

    /**
     * Studio: the skills editor and the commands tab. The host lists both roots
     * and their skills; saving posts the definition back and the next session
     * loads the file. Commands are registered into the harness right away.
     * Rules reach the prompt on the next session, presets are patch entries.
     */
    function StudioPanel(props) {
      const inDialog = props !== null && typeof props === 'object' && props.inDialog === true
      const onClose = props !== null && typeof props === 'object' && typeof props.onClose === 'function' ? props.onClose : null
      const [data, setData] = React.useState(null)
      const [tab, setTab] = React.useState('skills')
      const [draft, setDraft] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const [note, setNote] = React.useState(null)
      const [query, setQuery] = React.useState('')
      const [confirming, setConfirming] = useConfirmKey()
      const commands = useCommands(query)
      const rules = useRules(query)
      const agents = useAgents(query)

      const load = React.useCallback(async () => {
        try {
          setData(await getJson(STUDIO_ROUTE))
        } catch (failure) {
          setNote({ kind: 'error', text: `${t('studioFailed')}: ${messageOf(failure)}` })
        }
      }, [])

      React.useEffect(() => { void load() }, [load])

      const roots = data !== null && Array.isArray(data.roots) ? data.roots : []
      const skills = data !== null && Array.isArray(data.skills) ? data.skills : []
      const visibleSkills = searchFilter(skills, query, (skill) => [skill.name, skill.description, skill.whenToUse, skill.source])
      const project = roots.find((root) => root !== null && typeof root === 'object' && root.id === 'project') ?? null
      const defaultSource = project !== null && project.available === true ? 'project' : 'user'

      function startNew() {
        setNote(null)
        setTab('skills')
        setDraft({
          editing: false,
          source: defaultSource,
          name: '',
          description: '',
          whenToUse: '',
          body: '',
          disableModelInvocation: false,
          userInvocable: true,
          metadataLines: [],
          unknown: [],
        })
      }

      function startEdit(skill) {
        setNote(null)
        setDraft({
          editing: true,
          source: skill.source,
          name: skill.name,
          description: skill.description,
          whenToUse: skill.whenToUse,
          body: skill.body,
          disableModelInvocation: skill.disableModelInvocation === true,
          userInvocable: skill.userInvocable !== false,
          metadataLines: skill.metadataLines,
          unknown: skill.unknown,
        })
      }

      function patch(field, value) {
        setDraft((current) => (current === null ? current : { ...current, [field]: value }))
      }

      async function save() {
        if (draft === null) return
        setBusy(true)
        try {
          await postJson(STUDIO_ROUTE, draft)
          setDraft(null)
          setNote({ kind: 'ok', text: t('studioSaved') })
          await load()
        } catch (failure) {
          setNote({ kind: 'error', text: `${t('studioFailed')}: ${messageOf(failure)}` })
        } finally {
          setBusy(false)
        }
      }

      async function remove(skill) {
        setBusy(true)
        try {
          const suffix = `?source=${encodeURIComponent(skill.source)}&name=${encodeURIComponent(skill.name)}`
          const response = await fetch(`${STUDIO_ROUTE}${suffix}`, {
            method: 'DELETE',
            credentials: 'same-origin',
            headers: { accept: 'application/json' },
          })
          const payload = await response.json().catch(() => null)
          if (!response.ok) {
            throw new Error(payload !== null && typeof payload.error === 'string' ? payload.error : `HTTP ${response.status}`)
          }
          setNote({ kind: 'ok', text: t('studioDeleted') })
          await load()
        } catch (failure) {
          setNote({ kind: 'error', text: `${t('studioFailed')}: ${messageOf(failure)}` })
        } finally {
          setBusy(false)
        }
      }

      const form = draft === null ? null : h('div', { className: 'qols-studio-form' },
        h('label', { className: 'qols-studio-field' }, t('studioName'),
          h('input', {
            type: 'text',
            value: draft.name,
            disabled: draft.editing === true || busy,
            placeholder: 'my-skill',
            onChange: (event) => patch('name', event.target.value),
          }),
        ),
        h('label', { className: 'qols-studio-field' }, t('studioDescription'),
          h('input', {
            type: 'text',
            value: draft.description,
            disabled: busy,
            onChange: (event) => patch('description', event.target.value),
          }),
        ),
        h('label', { className: 'qols-studio-field' }, t('studioWhenToUse'),
          h('input', {
            type: 'text',
            value: draft.whenToUse,
            disabled: busy,
            onChange: (event) => patch('whenToUse', event.target.value),
          }),
        ),
        h('label', { className: 'qols-studio-field' }, t('studioSource'),
          h('select', {
            value: draft.source,
            disabled: draft.editing === true || busy,
            onChange: (event) => patch('source', event.target.value),
          },
            h('option', { value: 'project', disabled: project === null || project.available !== true }, t('studioProject')),
            h('option', { value: 'user' }, t('studioUser')),
          ),
        ),
        h('label', { className: 'qols-studio-enabled' },
          h('input', {
            type: 'checkbox',
            checked: draft.disableModelInvocation !== true,
            disabled: busy,
            onChange: (event) => patch('disableModelInvocation', event.target.checked !== true),
          }),
          h('span', null, t('studioModelInvocation')),
        ),
        h('label', { className: 'qols-studio-enabled' },
          h('input', {
            type: 'checkbox',
            checked: draft.userInvocable !== false,
            disabled: busy,
            onChange: (event) => patch('userInvocable', event.target.checked !== false),
          }),
          h('span', null, t('studioUserInvocable')),
        ),
        h('label', { className: 'qols-studio-field' }, t('studioBody'),
          h('textarea', {
            value: draft.body,
            disabled: busy,
            onChange: (event) => patch('body', event.target.value),
          }),
        ),
        h('div', { className: 'qols-studio-actions' },
          h('button', {
            type: 'button',
            className: 'qols-studio-button',
            'data-primary': 'true',
            disabled: busy,
            onClick: () => { void save() },
          }, t('studioSave')),
          h('button', {
            type: 'button',
            className: 'qols-studio-button',
            disabled: busy,
            onClick: () => setDraft(null),
          }, t('studioCancel')),
        ),
      )

      const rows = tab !== 'skills'
        ? h('div', { className: 'qols-studio-empty' }, t('studioSoon'))
        : skills.length === 0
          ? h('div', { className: 'qols-studio-empty' }, t('studioEmpty'))
          : visibleSkills.length === 0
            ? h('div', { className: 'qols-studio-empty' }, t('studioNoMatches'))
            : h('div', { className: 'qols-studio-list' }, visibleSkills.map((skill) => {
              const rowKey = `${skill.source}:${skill.name}`
              const editing = draft !== null && draft.editing === true && draft.source === skill.source && draft.name === skill.name
              return h('div', { key: rowKey, className: 'qols-studio-row' },
                h('div', { className: 'qols-studio-main' },
                  h('div', { className: 'qols-studio-line' },
                    h('span', { className: 'qols-studio-name' }, skill.name),
                    h('span', { className: 'qols-studio-badge', 'data-source': skill.source }, skill.source),
                    skill.writable === false ? h('span', { className: 'qols-studio-badge' }, t('studioReadOnly')) : null,
                    skill.valid !== true
                      ? h('span', { className: 'qols-studio-badge', 'data-tone': 'error', title: (skill.problems ?? []).join('; ') }, 'invalid')
                      : null,
                  ),
                  skill.description !== '' ? h('span', { className: 'qols-studio-desc', title: skill.path }, skill.description) : null,
                ),
                skill.writable === false
                  ? null
                  : h(RowActions, {
                    busy,
                    confirming: confirming === rowKey,
                    onAsk: () => setConfirming(rowKey),
                    onCancel: () => setConfirming(''),
                    onDelete: () => { setConfirming(''); void remove(skill) },
                    onEdit: () => startEdit(skill),
                  }),
                editing ? form : null,
              )
            }))

      const body = tab === 'commands'
        ? h(CommandsView, commands)
        : tab === 'skills'
          ? h(React.Fragment, null,
            h('div', { className: 'qols-studio-roots' },
              roots.map((root) => `${root.id}: ${root.dir ?? 'unavailable'}${root.writable === false ? ` (${t('studioReadOnly')})` : ''}`).join('  ·  '),
            ),
            project === null || project.available !== true
              ? h('div', { className: 'qols-studio-roots' }, t('studioProjectUnavailable'))
              : null,
            note !== null ? h('div', { className: note.kind === 'ok' ? 'qols-dialog-ok' : 'qols-dialog-error' }, note.text) : null,
            draft !== null && draft.editing !== true ? form : null,
            rows,
          )
          : tab === 'rules'
            ? h(RulesView, rules)
            : tab === 'agents'
              ? h(AgentsView, agents)
              : tab === 'instruction'
                ? h(InstructionView, null)
                : h('div', { className: 'qols-studio-empty' }, t('studioSoon'))

      const tabBusy = tab === 'skills' ? busy : tab === 'commands' ? commands.busy : tab === 'rules' ? rules.busy : tab === 'agents' ? agents.busy : false
      const tabDraft = tab === 'skills' ? draft !== null : tab === 'commands' ? commands.draft !== null : tab === 'rules' ? rules.draft !== null : tab === 'agents' ? agents.draft !== null : false
      const newButton = tab === 'skills'
        ? h('button', {
          type: 'button',
          className: 'qols-studio-button',
          'data-primary': 'true',
          disabled: busy || draft !== null,
          onClick: startNew,
        }, t('studioNew'))
        : tab === 'commands'
          ? h('button', {
            type: 'button',
            className: 'qols-studio-button',
            'data-primary': 'true',
            disabled: commands.busy || commands.draft !== null,
            onClick: commands.startNew,
          }, t('studioCmdNew'))
          : tab === 'rules'
            ? h('button', {
              type: 'button',
              className: 'qols-studio-button',
              'data-primary': 'true',
              disabled: rules.busy || rules.draft !== null,
              onClick: rules.startNew,
            }, t('studioRuleNew'))
            : tab === 'agents'
              ? h('button', {
                type: 'button',
                className: 'qols-studio-button',
                'data-primary': 'true',
                disabled: agents.busy || agents.draft !== null,
                onClick: agents.startNew,
              }, t('studioAgentNew'))
              : null

      function startChat() {
        if (studioChat === null) return
        const opened = studioChat(studioChatPrompt(tab))
        if (opened === true && onClose !== null) onClose()
      }

      return h('section', { className: 'qols-studio', 'data-embedded': inDialog ? 'true' : 'false' },
        h('div', { className: 'qols-studio-head' },
          inDialog ? null : h('h4', { className: 'qols-feature-title' }, t('studioTitle')),
          tab === 'skills' ? h('span', { className: 'qols-studio-count' }, `${visibleSkills.length} ${t(visibleSkills.length === 1 ? 'studioCountOne' : 'studioCount')}`) : null,
          tab === 'commands' ? h('span', { className: 'qols-studio-count' }, `${commands.visible.length} ${t(commands.visible.length === 1 ? 'studioCmdCountOne' : 'studioCmdCount')}`) : null,
          tab === 'rules' ? h('span', { className: 'qols-studio-count' }, `${rules.visible.length} ${t(rules.visible.length === 1 ? 'studioRuleCountOne' : 'studioRuleCount')}`) : null,
          tab === 'agents' ? h('span', { className: 'qols-studio-count' }, `${agents.visible.length} ${t(agents.visible.length === 1 ? 'studioAgentCountOne' : 'studioAgentCount')}`) : null,
          tab === 'instruction' ? null : h('div', { className: 'qols-studio-head-actions' },
            h('label', { className: 'qols-studio-search' },
              h('svg', { viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
                h('circle', { cx: '7', cy: '7', r: '4.5', stroke: 'currentColor', strokeWidth: '1.4' }),
                h('path', { d: 'M10.5 10.5 14 14', stroke: 'currentColor', strokeWidth: '1.4', strokeLinecap: 'round' }),
              ),
              h('input', {
                type: 'search',
                value: query,
                placeholder: t('studioSearch'),
                'aria-label': t('studioSearch'),
                onChange: (event) => setQuery(event.target.value),
              }),
            ),
            h('button', {
              type: 'button',
              className: 'qols-studio-button qols-studio-chat',
              disabled: tabBusy || tabDraft || studioChat === null,
              title: studioChat === null ? t('studioChatFailed') : t('studioChat'),
              onClick: startChat,
            }, t('studioChat')),
            newButton,
          ),
        ),
        h('div', { className: 'qols-studio-tabs', role: 'tablist', 'aria-label': t('studioTitle') }, STUDIO_TABS.map((entry) => h('button', {
          key: entry.id,
          type: 'button',
          role: 'tab',
          className: 'qols-studio-tab',
          'aria-selected': tab === entry.id ? 'true' : 'false',
          onClick: () => {
            setTab(entry.id)
            setQuery('')
            setDraft(null)
            setNote(null)
          },
        }, t(entry.label)))),
        h('div', { className: 'qols-studio-body' }, body),
      )
    }

    /** Live registration report; the host owns the data, the client only paints it. */
    function DiagnosticsPanel() {
      const [report, setReport] = React.useState(null)
      const [error, setError] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const [copied, setCopied] = React.useState(false)

      const load = React.useCallback(async () => {
        setBusy(true)
        setError('')
        setCopied(false)
        const controller = typeof AbortController === 'function' ? new AbortController() : null
        const timer = controller !== null ? window.setTimeout(() => controller.abort(), 3000) : 0
        try {
          const response = await fetch(DIAG_ROUTE, {
            credentials: 'same-origin',
            headers: { accept: 'application/json' },
            signal: controller !== null ? controller.signal : undefined,
          })
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          setReport(await response.json())
        } catch (failure) {
          setReport(null)
          setError(messageOf(failure))
        } finally {
          if (timer !== 0) window.clearTimeout(timer)
          setBusy(false)
        }
      }, [])

      React.useEffect(() => { void load() }, [load])

      async function copy() {
        try {
          await navigator.clipboard.writeText(JSON.stringify(report, null, 2))
          setCopied(true)
          window.setTimeout(() => setCopied(false), 2000)
        } catch (failure) {
          setError(messageOf(failure))
        }
      }

      const rows = report !== null && Array.isArray(report.features) ? report.features : []
      return h('section', { className: 'qols-diag' },
        h('div', { className: 'qols-diag-head' },
          h('h4', { className: 'qols-feature-title' }, t('diagTitle')),
          h('button', {
            type: 'button',
            className: 'qols-diag-button',
            onClick: () => { void load() },
            disabled: busy,
          }, t('diagCheck')),
          h('button', {
            type: 'button',
            className: 'qols-diag-button',
            onClick: () => { void copy() },
            disabled: report === null,
          }, copied ? t('diagCopied') : t('diagCopy')),
        ),
        h('p', { className: 'qols-feature-desc' }, t('diagHint')),
        error !== '' ? h('div', { className: 'qols-diag-error', role: 'alert' }, `${t('diagFailed')}: ${error}`) : null,
        rows.length > 0 ? h('div', { className: 'qols-diag-list' }, rows.map((row) => {
          const detail = typeof row.error === 'string' && row.error !== '' ? row.error : String(row.detail ?? '')
          return h('div', { key: String(row.id ?? ''), className: 'qols-diag-row' },
            h('span', { className: 'qols-diag-name' }, String(row.id ?? '')),
            h('span', { className: 'qols-diag-state', 'data-state': String(row.state ?? '') }, diagLabel(row.state)),
            h('span', { className: 'qols-diag-detail', title: detail }, detail),
          )
        })) : null,
      )
    }

    const FEATURE_GLYPHS = {
      auto: 'M8.6 2.6l1.4 3.9 3.9 1.4-3.9 1.4-1.4 3.9-1.4-3.9L3.3 7.9l3.9-1.4zM13.4 11.8l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z',
      studio: 'M3 3.5h12v11H3zM5.4 6.4h7.2M5.4 9h7.2M5.4 11.6h4.4',
    }

    function featureGlyph(id) {
      const path = FEATURE_GLYPHS[id]
      if (typeof path !== 'string') return null
      return h('svg', {
        viewBox: '0 0 18 18',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.4,
        strokeLinejoin: 'round',
        strokeLinecap: 'round',
        'aria-hidden': true,
      }, h('path', { d: path }))
    }

    /** The Prompt Studio glyph, shared by the settings card and the sidebar button. */
    function StudioGlyph(props) {
      const size = props !== null && typeof props === 'object' && Number.isFinite(props.size) ? props.size : 18
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 18 18',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.4,
        strokeLinejoin: 'round',
        strokeLinecap: 'round',
        'aria-hidden': true,
      }, h('path', { d: FEATURE_GLYPHS.studio }))
    }

    /** Studio is one card on the settings page; its editor opens above the page. */
    function StudioCard(props) {
      const onOpen = props !== null && typeof props === 'object' && typeof props.onOpen === 'function' ? props.onOpen : () => {}
      return h('section', { className: 'qols-feature qols-studio-card' },
        h('span', { className: 'qols-feature-icon', 'aria-hidden': true }, featureGlyph('studio')),
        h('div', { className: 'qols-feature-main' },
          h('h4', { className: 'qols-feature-title' }, t('studioTitle')),
          h('p', { className: 'qols-feature-desc' }, t('studioCardHint')),
        ),
        h('button', {
          type: 'button',
          className: 'qols-feature-edit',
          onClick: onOpen,
        }, t('studioOpen')),
      )
    }

    /**
     * Prompt Studio's open state, owned here instead of by the layout.
     *
     * The studio used to be a main panel: opening it replaced the conversation and
     * closing it had to guess which panel to restore, which felt like the shell
     * breaking. It now behaves like Settings — a frame-wide overlay while the
     * conversation stays mounted behind it, and closing is just closing.
     */
    let studioOpen = false
    const studioOpenListeners = new Set()

    function setStudioOpen(next) {
      const value = next === true
      if (studioOpen === value) return
      studioOpen = value
      for (const listener of studioOpenListeners) {
        try { listener() } catch (error) { console.error('[qols] studio listener failed', error) }
      }
    }

    function useStudioOpen() {
      const [open, setOpen] = React.useState(studioOpen)
      React.useEffect(() => {
        const listener = () => setOpen(studioOpen)
        studioOpenListeners.add(listener)
        setOpen(studioOpen)
        return () => { studioOpenListeners.delete(listener) }
      }, [])
      return open
    }

    /**
     * `shell.overlay` entry: the studio dialog itself, painted above every column
     * and outside their scroll containers. The layer is click-through, so the
     * dialog opts back into pointer events by being a positioned child.
     */
    function StudioOverlay() {
      const open = useStudioOpen()
      return h(StudioDialog, { open, onClose: () => setStudioOpen(false) })
    }

    /**
     * A `sidebar.panellist` row is a panel switch: its own button always calls
     * `layout.selectPanel(id)`. Our two rows are buttons, not panels — they open
     * a floating layer — so the native click is stopped at the row button,
     * before React's delegated handler at the root runs, and our action runs
     * instead. No `main` panel is registered on purpose: if the interception is
     * ever missed, `selectPanel` only logs "not registered" and the centre
     * column keeps the conversation instead of swapping it out.
     */
    function usePanelRowAction(action, expanded, mode) {
      const ref = React.useRef(null)
      const latest = React.useRef(action)
      latest.current = action
      React.useEffect(() => {
        const node = ref.current
        const button = node !== null && typeof node.closest === 'function' ? node.closest('button') : null
        if (button === null) return undefined
        button.setAttribute('data-qols-row', 'true')
        if (mode === 'dialog') button.setAttribute('aria-haspopup', 'dialog')
        function activate(event) {
          event.preventDefault()
          event.stopPropagation()
          try {
            latest.current()
          } catch (error) {
            console.error('[qols] sidebar row action failed', error)
          }
        }
        button.addEventListener('click', activate)
        return () => {
          button.removeEventListener('click', activate)
          button.removeAttribute('data-qols-row')
          button.removeAttribute('aria-haspopup')
          button.removeAttribute('aria-expanded')
          button.removeAttribute('aria-pressed')
          button.removeAttribute('data-qols-open')
        }
      }, [mode])
      React.useEffect(() => {
        const node = ref.current
        const button = node !== null && typeof node.closest === 'function' ? node.closest('button') : null
        if (button === null) return
        if (mode === 'dialog') button.setAttribute('aria-expanded', expanded === true ? 'true' : 'false')
        else button.setAttribute('aria-pressed', expanded === true ? 'true' : 'false')
        button.setAttribute('data-qols-open', expanded === true ? 'true' : 'false')
      }, [expanded, mode])
      return ref
    }

    /** Panel-list row: opens Prompt Studio as an overlay, never as a panel. */
    function StudioPanelGlyph(props) {
      const open = useStudioOpen()
      const size = props !== null && typeof props === 'object' && Number.isFinite(props.size) ? props.size : 18
      const ref = usePanelRowAction(() => setStudioOpen(!studioOpen), open, 'dialog')
      return h('span', { ref, className: 'qols-row-glyph' }, h(StudioGlyph, { size }))
    }

    /** Wide overlay that hosts the whole Prompt Studio editor. */
    function StudioDialog(props) {
      const open = props !== null && typeof props === 'object' && props.open === true
      const onClose = props !== null && typeof props === 'object' && typeof props.onClose === 'function' ? props.onClose : () => {}
      const panel = useModalFocus(open, onClose)
      if (!open) return null
      return h('div', {
        className: 'qols-dialog-overlay',
        role: 'presentation',
      },
      h('div', {
        className: 'qols-dialog qols-studio-dialog',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': 'qols-studio-dialog-title',
        tabIndex: -1,
        ref: panel,
        onClick: (event) => { event.stopPropagation() },
      },
      h('div', { className: 'qols-dialog-head' },
        h('div', { className: 'qols-dialog-title', id: 'qols-studio-dialog-title' }, t('studioTitle')),
        h('button', { type: 'button', className: 'qols-dialog-close', 'aria-label': t('close'), title: t('close'), onClick: onClose },
          h('svg', { viewBox: '0 0 16 16', 'aria-hidden': 'true', focusable: 'false' },
            h('path', { d: 'M4 4l8 8M12 4l-8 8', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.4', 'stroke-linecap': 'round' }),
          ),
        ),
      ),
      h('div', { className: 'qols-dialog-body qols-studio-dialog-body' }, h(StudioPanel, { inDialog: true, onClose })),
      ),
      )
    }

    /**
     * Plugins that pair well with QoLs. The list is fixed on purpose: it is a
     * short recommendation, not a second marketplace. Install/remove goes
     * through dshmarket's host routes so the profile wiring stays in one place.
     */
    const LIKED_PLUGINS = [
      {
        name: 'billion-context',
        title: 'billion-context',
        url: 'https://github.com/ranxianglei/billion-context',
        descriptionKey: 'likedBillionContext',
      },
      {
        name: 'dsh-better-sidebar',
        title: 'Better Sidebar',
        url: 'https://github.com/omdsh-dev/DSH-better-sidebar',
        descriptionKey: 'likedBetterSidebar',
      },
      {
        name: 'dshmarket',
        title: 'DSH Market',
        url: 'https://github.com/dsh-market/dsh-market',
        descriptionKey: 'likedDshMarket',
        core: true,
      },
    ]

    let likedUpdatesCache = null
    let likedUpdatesInflight = null

    /**
     * Version lookup is manual: the settings page asks for it only when the
     * user presses "Check for updates". Re-checks bypass dshmarket's cache.
     */
    function loadLikedUpdates(force = false) {
      if (!force && likedUpdatesCache !== null) return Promise.resolve(likedUpdatesCache)
      if (!force && likedUpdatesInflight !== null) return likedUpdatesInflight
      const request = getJson(force ? '/dsh-market/updates?force=1' : '/dsh-market/updates').then((payload) => {
        likedUpdatesCache = payload !== null && typeof payload === 'object' && payload.updates !== null && typeof payload.updates === 'object'
          ? payload.updates
          : {}
        return likedUpdatesCache
      }).catch(() => {
        likedUpdatesCache = null
        return null
      }).finally(() => {
        likedUpdatesInflight = null
      })
      likedUpdatesInflight = request
      return request
    }

    function LikedPluginsSection() {
      const [installed, setInstalled] = React.useState(null)
      const [activation, setActivation] = React.useState({})
      const [updates, setUpdates] = React.useState(likedUpdatesCache)
      const [busy, setBusy] = React.useState('')
      const [checking, setChecking] = React.useState(false)
      const [note, setNote] = React.useState(null)

      const load = React.useCallback(async () => {
        try {
          const payload = await getJson('/dsh-market/installed')
          setInstalled(payload !== null && typeof payload === 'object' && payload.installed !== null && typeof payload.installed === 'object'
            ? payload.installed
            : {})
          setActivation(payload !== null && typeof payload === 'object' && payload.activation !== null && typeof payload.activation === 'object'
            ? payload.activation
            : {})
        } catch (failure) {
          setInstalled(null)
          setNote({ kind: 'error', text: `${t('likedFailed')}: ${messageOf(failure)}` })
        }
      }, [])

      React.useEffect(() => { void load() }, [load])

      async function checkUpdates() {
        setChecking(true)
        setNote(null)
        try {
          const checked = await loadLikedUpdates(true)
          if (checked === null) {
            setNote({ kind: 'error', text: t('likedCheckFailed') })
            return
          }
          setUpdates(checked)
          const available = Object.values(checked).filter((entry) => entry !== null && typeof entry === 'object'
            && typeof entry.latest === 'string'
            && (entry.updateAvailable === true || entry.heldUpdate !== undefined)).length
          setNote({
            kind: 'ok',
            text: available === 0
              ? t('likedUpToDate')
              : available === 1
                ? t('likedUpdateFound')
                : `${available} ${t('likedUpdatesFound')}`,
          })
        } finally {
          setChecking(false)
        }
      }

      async function run(entry, action) {
        setBusy(entry.name)
        setNote(null)
        try {
          let result = null
          if (action === 'install') result = await postJson('/dsh-market/install', { url: entry.url })
          else if (action === 'update') {
            const update = updates !== null && typeof updates === 'object' && Object.hasOwn(updates, entry.name) ? updates[entry.name] : null
            const held = update !== null && typeof update === 'object' && update.updateAvailable !== true && update.heldUpdate !== undefined
            if (entry.core === true) {
              const version = update !== null && typeof update === 'object' && typeof update.latest === 'string' ? update.latest : ''
              if (version === '') throw new Error(t('likedUpdateTo'))
              result = await postJson(LIKED_CORE_UPDATE, { version })
            } else {
              result = await postJson('/dsh-market/update', held ? { name: entry.name, force: true } : { name: entry.name })
            }
          }
          else if (action === 'toggle') {
            const state = activation[entry.name]
            result = await postJson('/dsh-market/toggle', {
              name: entry.name,
              enabled: state === undefined ? true : state.state === 'disabled',
            })
          } else result = await postJson('/dsh-market/uninstall', { name: entry.name })
          const appliedLive = action === 'toggle' && result !== null && typeof result === 'object' && result.restart === false
          const coreUpdated = action === 'update' && entry.core === true
          setNote({
            kind: 'ok',
            text: coreUpdated ? t('likedCoreUpdated') : appliedLive ? t('likedApplied') : t('likedRestart'),
          })
          // A version cannot change on a toggle; other mutations invalidate the
          // answer, so hide the old badges and let the user ask again.
          if (action !== 'toggle') {
            likedUpdatesCache = null
            likedUpdatesInflight = null
            setUpdates({})
          }
          await load()
        } catch (failure) {
          setNote({ kind: 'error', text: `${t('likedFailed')}: ${messageOf(failure)}` })
        } finally {
          setBusy('')
        }
      }

      const rows = LIKED_PLUGINS.map((entry) => {
        const known = installed !== null && Object.hasOwn(installed, entry.name)
        const version = known ? String(installed[entry.name] ?? '') : ''
        const installedLabel = version === '' ? t('likedInstalled') : `${t('likedInstalled')} ${version}`
        const state = activation[entry.name]
        const active = state === undefined ? true : state.state !== 'disabled'
        const update = updates !== null && Object.hasOwn(updates, entry.name) ? updates[entry.name] : null
        const hasUpdate = update !== null && typeof update === 'object'
          && typeof update.latest === 'string'
          && (update.updateAvailable === true || update.heldUpdate !== undefined)
        const actions = []
        if (known && entry.core !== true) {
          actions.push(h('button', {
            key: 'toggle',
            type: 'button',
            className: 'qols-switch',
            role: 'switch',
            'aria-checked': active ? 'true' : 'false',
            'aria-label': active ? t('likedDeactivate') : t('likedActivate'),
            title: active ? t('likedDeactivate') : t('likedActivate'),
            disabled: busy !== '' || state === undefined,
            onClick: () => { void run(entry, 'toggle') },
          }, h('span', { className: 'qols-switch-thumb', 'aria-hidden': true })))
        }
        if (known && hasUpdate) {
          actions.push(h('button', {
            key: 'update',
            type: 'button',
            className: 'qols-studio-button',
            disabled: busy !== '',
            onClick: () => { void run(entry, 'update') },
          }, busy === entry.name ? t('likedWorking') : t('likedUpdate')))
        }
        if (entry.core !== true) actions.push(h('button', {
          key: 'install-remove',
          type: 'button',
          className: 'qols-studio-button',
          'data-primary': known ? undefined : 'true',
          'data-danger': known ? 'true' : undefined,
          disabled: busy !== '' || installed === null,
          onClick: () => { void run(entry, known ? 'remove' : 'install') },
        }, busy === entry.name ? t('likedWorking') : known ? t('likedRemove') : t('likedInstall')))
        return h('div', { key: entry.name, className: 'qols-studio-row' },
          h('div', { className: 'qols-studio-main' },
            h('div', { className: 'qols-studio-line' },
              h('span', { className: 'qols-studio-name' }, entry.title),
              h('span', { className: 'qols-studio-badge', 'data-tone': known ? 'success' : undefined }, installed === null ? t('likedChecking') : known ? installedLabel : t('likedNotInstalled')),
              entry.core === true ? h('span', { className: 'qols-studio-badge' }, t('likedCore')) : null,
              hasUpdate ? h('span', { className: 'qols-studio-badge', 'data-tone': 'warn' }, `${t('likedUpdateTo')} ${update.latest}`) : null,
            ),
            h('p', { className: 'qols-studio-desc', title: t(entry.descriptionKey) }, t(entry.descriptionKey)),
            h('a', {
              className: 'qols-liked-repo',
              href: entry.url,
              target: '_blank',
              rel: 'noopener noreferrer',
              title: entry.url,
              'aria-label': `${t('likedRepo')}: ${entry.title}`,
            }, entry.url.replace(/^https?:\/\//, '')),
          ),
          h('div', { className: 'qols-studio-actions' }, actions),
        )
      })

      return h('div', { className: 'qols-settings' },
        h('header', { className: 'qols-page-head qols-liked-head' },
          h('div', { className: 'qols-liked-head-copy' },
            h('h2', { className: 'qols-page-title' }, t('likedTitle')),
            h('p', { className: 'qols-page-desc' }, t('likedHint')),
          ),
          h('button', {
            type: 'button',
            className: 'qols-studio-button',
            disabled: checking,
            onClick: () => { void checkUpdates() },
          }, checking ? t('likedCheckingUpdates') : t('likedCheckUpdates')),
        ),
        h('div', { className: 'qols-liked-list' }, rows),
        note !== null ? h('div', { className: note.kind === 'ok' ? 'qols-dialog-ok' : 'qols-dialog-error' }, note.text) : null,
      )
    }


    function QolsSettings() {
      const [openId, setOpenId] = React.useState('')
      const [studioCardOpen, setStudioCardOpen] = React.useState(false)
      const features = catalog.filter((entry) => entry.id !== 'studio')
      return h('div', { className: 'qols-settings' },
        h('header', { className: 'qols-page-head' },
          h('h2', { className: 'qols-page-title' }, t('pageTitle')),
          h('p', { className: 'qols-page-desc' }, t('pageHint')),
        ),
        features.length > 0
          ? h('section', { className: 'qols-group' },
            h('h3', { className: 'qols-group-title' }, t('featuresTitle')),
            h('div', { className: 'qols-stack' }, features.map((entry) => h('section', { key: entry.id, className: 'qols-feature' },
              h('span', { className: 'qols-feature-icon', 'aria-hidden': true }, featureGlyph(entry.id)),
              h('div', { className: 'qols-feature-main' },
                h('div', { className: 'qols-feature-head' },
                  h('h4', { className: 'qols-feature-title' }, textOf(entry, 'title')),
                ),
                h('p', { className: 'qols-feature-desc' }, textOf(entry, 'description')),
              ),
              h('button', {
                type: 'button',
                className: 'qols-feature-edit',
                onClick: () => setOpenId(entry.id),
              }, t('edit')),
            ))),
          )
          : null,
        h('div', { className: 'qols-stack' },
          h(UsageSettings),
          h(StudioCard, { onOpen: () => setStudioCardOpen(true) }),
          h(DiagnosticsPanel),
        ),
        h(FeatureDialog, { id: openId, onClose: () => setOpenId('') }),
        h(StudioDialog, { open: studioCardOpen, onClose: () => setStudioCardOpen(false) }),
      )
    }

    function apply(ctx) {
      // A hot reload can evaluate this bundle twice in one page. Without a
      // guard the second pass registers every slot again, and the sidebar ends
      // up with two identical icons. The flag is released on dispose so a real
      // re-mount still works.
      if (globalThis.__qolsClientApplied === true) {
        console.log('[qols] client bundle already applied, skipping the second pass')
        return
      }
      globalThis.__qolsClientApplied = true
      ctx.effect(() => () => {
        globalThis.__qolsClientApplied = false
      }, 'qols client applied flag')
      ensureStyle()
      try {
        ctx.effect(() => {
          const disposers = []
          for (const id of Object.keys(DICTS)) {
            try { disposers.push(ctx.locale.register(NS, id, DICTS[id])) } catch (error) {
              console.error('[qols] locale registration skipped', error)
            }
          }
          const bound = ctx.locale.bind(NS)
          t = (key) => {
            try {
              const value = bound(key)
              if (typeof value === 'string' && value !== '' && value !== key) return value
            } catch (error) {
              console.error('[qols] locale lookup failed', error)
            }
            return english(key)
          }
          return () => {
            t = english
            for (const dispose of disposers) dispose()
          }
        }, 'qols locale')
      } catch (error) {
        console.error('[qols] locale failed', error)
      }

      void loadCatalog()

      // Prompt Studio's "create via chat" hands a ready questionnaire to a fresh Session.
      // Replace the draft so clicking another section swaps the questionnaire instead of
      // stacking a second copy on top of the first.
      // Resolve the optional uiWorkspace service per click: it is not in our inject list,
      // and looking it up here keeps QoLs loadable on a host that does not provide it.
      studioChat = (prompt) => {
        try {
          const workspace = typeof ctx.get === 'function' ? ctx.get('uiWorkspace') : ctx.uiWorkspace
          if (workspace === null || typeof workspace !== 'object' || typeof workspace.startSession !== 'function') return false
          const started = workspace.startSession(undefined, { prompt, whenDraftExists: 'replace' })
          if (started !== null && typeof started === 'object' && typeof started.catch === 'function') {
            started.catch((error) => { console.error('[qols] studio chat failed', error) })
          }
          return true
        } catch (error) {
          console.error('[qols] studio chat failed', error)
          return false
        }
      }

      // Prompt Studio is an overlay, not a main panel: `shell.overlay` paints above
      // every column, so opening the studio never unmounts the conversation behind
      // it. The old approach needed a `main` registration, a remembered panel id and
      // a restore call on close; none of that exists now.
      try {
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'qols-studio-overlay',
          order: 10,
          label: () => t('studioTitle'),
        }, StudioOverlay))
      } catch (error) {
        console.error('[qols] prompt studio overlay failed', error)
      }

      // Prompt Studio's row lives in the panel list above Workspaces, next to
      // Plugins and Automation tasks. It is a row, not a panel: `usePanelRowAction`
      // stops the row's own `selectPanel` call and opens the overlay instead.
      try {
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: 'qols-prompt-studio',
          order: 13,
          label: () => t('studioTitle'),
        }, StudioPanelGlyph))
      } catch (error) {
        console.error('[qols] prompt studio panel row failed', error)
      }

      try {
        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: 'qols',
          order: 80,
          label: () => t('nav'),
        }, QolsSettings))
      } catch (error) {
        console.error('[qols] settings section failed', error)
      }

      try {
        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: 'qols-liked-plugins',
          order: 81,
          label: () => t('likedNav'),
        }, LikedPluginsSection))
      } catch (error) {
        console.error('[qols] liked plugins section failed', error)
      }

      // Version lookup is manual: the Liked plugins tab has a "Check for
      // updates" button. Do not spend a request on every page session.

      try {
        ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
          name: 'conversation.composer.dock',
          id: 'qols-auto',
          order: 3,
          label: () => t('autoModel'),
        }, AutoBadge))
      } catch (error) {
        console.error('[qols] auto badge failed', error)
      }

      // The live cost sits in the composer tool row, directly under the running
      // status line: the chat flow renders "Deep diving for …" from shipped code
      // with no slot inside it, so this is the closest surface that is visible
      // for the whole run.
      try {
        ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
          name: 'conversation.input.left',
          id: 'qols-live-cost',
          order: 50,
          label: () => t('usageTurn'),
        }, LiveTurnCost))
      } catch (error) {
        console.error('[qols] live cost chip failed', error)
      }

      try {
        ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
          name: 'sidebar.footer.action',
          id: 'qols-usage',
          order: 0,
          label: () => t('usageTitle'),
        }, UsageCard))
      } catch (error) {
        console.error('[qols] usage card failed', error)
      }

      try {
        ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
          name: 'conversation.chat.turnTail',
          id: 'qols-usage-turn',
          order: 20,
        }, TurnCost))
      } catch (error) {
        console.error('[qols] turn cost failed', error)
      }

    }

    return { inject: ['slots', 'locale'], apply }
  },
})
