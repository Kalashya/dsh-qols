# QoLs

Quality-of-life extras for [DeepSeek Harness](https://github.com/deepseek-ai): an **Auto** model that
picks the cheapest model and reasoning effort that can still do the task, session cost tracking, and
a Prompt Studio for skills, commands, rules, agent presets and the global `AGENTS.md`.

Everything stays local. The plugin registers one LLM provider (`qols-auto`), serves a few small
HTTP routes on the harness web server, and adds five UI surfaces — the **Prompt Studio** row in the
sidebar panel list (above Workspaces), an Auto badge, a usage card in the sidebar foot, a per-turn
cost line, and the Settings → QoLs page.

## Features

### Auto model router

Pick **QoLs Auto → Auto** in the model menu (or `/model`) and every task is routed by difficulty.

| Tier | Route | When |
|---|---|---|
| Eco | `deepseek-flash`, effort `off` | greetings, short questions, "show me the file" |
| Standard | `deepseek-flash`, effort `high` | ordinary work |
| Deep | `deepseek-v4-pro`, effort `max` | refactors, architecture, proofs, big diffs |

A task is one turn: the decision is taken once per user message and reused for the tool steps that
follow it, so the prompt cache and reasoning continuity are preserved. A heuristic scores the text
first; a judge model is called **only in the grey zone** (`0.35 < score < 0.70`), so most tasks cost
no extra tokens at all.

- The judge model is selectable in **Settings → QoLs → Auto model** (any connected model, cheapest
  advertised effort is used).
- The badge under the composer shows the tier the current task was routed to; the full reasoning
  (route, score, signals, judge latency) is in the tooltip.
- Every decision is journaled in **Settings → QoLs** — tier, route, score, signals, task hash. Task
  text is never stored.
- Compaction and session-title calls take a fixed cheap route and never pay for judging.
- Images never go to the text-only Deep tier: such a task is routed to Standard.

### Usage card

The **sidebar footer** shows today's spend in USD, the wallet balance on the same line — a topped-up
wallet with money in it first, otherwise the grant in its own currency; a warning icon below the
threshold — and the whole local day (00:00–23:59:59) as a peak rail: that day's own peak and
off-peak spans in light red and light green, a marker at the current time, and a chip
(`Off-peak · Peak in 9h 50m`). Both money rows — today's cost and the balance — can be turned off
together in **Settings → QoLs → Usage** (`Show today's cost and wallet balance on the card`); the
rail and chip stay, and the card updates as soon as the switch is clicked. Weekends and Chinese public
holidays are off-peak for the whole day, and the chip says `Off-peak all day` instead of promising a
peak. Each finished turn's tail adds a line with that turn's own total: approximate cost, token
split and the individual model calls. The line is keyed by the harness turn number, so it keeps
showing the same sum after a reload and never borrows the next request's cost. While a turn is
running, a small chip in the composer tool row counts the open turn (`≈ $0.0042 · 3 calls`) and
disappears when the turn ends and its tail takes over. The running status line above the composer is
drawn by the harness chat with no slot inside it, so the tool row is the nearest place that is
visible for the whole run.

The numbers come from QoLs' own meter over the harness `llm/stream` waterfall, priced with the
official USD per-million table (cache hit, cache miss, output) and doubled inside the peak windows
(01:00–04:00 and 06:00–10:00 UTC; since 2026-08-23 weekends and Chinese public holidays are
off-peak). Every ledger record is
tagged with its currency, so a record written before the USD switch never adds yuan to a dollar
total. The balance is read from the signed-in account through the harness: after a restart the first
card request waits up to 2.5 s for the account service, so Today and Balance are painted together
instead of Balance appearing five seconds later, and the card retries every second while the wallet
is still unknown. The token never reaches the client. Ledger records hold the model, token
buckets, cost, session id and turn number — never prompt text.

When `dsh-cost-meter` is also installed, its footer card and its own turn-cost line are hidden while
ours is enabled (**Settings → QoLs → Usage** has the switches for the cost-meter card, the token
count and the money rows).

### Diagnostics

**Settings → QoLs → Diagnostics** is the last card on the page. It shows the registration status of
every feature — `working`, `degraded`, `failed` or `not registered` — with the error text when there
is one. Registration failures used to be swallowed into `console.error`; now they are visible in the
app. *Check again* refetches the report, *Copy report* puts the JSON on the clipboard for a bug
report. The report contains ids, booleans, short details and a clipped error: no tokens, prompts or
message text.

### Prompt Studio

The **Prompt Studio** card in **Settings → QoLs**, and the **Prompt Studio** row in the sidebar panel
list (above Workspaces), open the editor in an overlay above the whole frame — the same model Settings
itself uses. Panel rows normally switch the centre column, so the row stops that click and opens the
overlay instead; the conversation stays mounted behind it, there is no launcher page and no panel to
restore on close, and nothing in the layout moves when it opens. The close button or Escape closes
it; a click on the dimmed backdrop does nothing, so an
accidental click inside the editor area cannot discard an open form. The overlay keeps the same height
on every tab, so switching from a full Skills list to an empty Commands tab no longer resizes the
window, and its type uses the same 12–14 px scale as the rest of Settings. A search field above the
list filters the active tab by name, description and body; counts follow the filtered rows. **Edit**
opens the form inside the clicked row, not above the list, so a long Skills page keeps its context.
The overlay manages the extensions that DSH
reads from disk. Every list tab has **Create via chat**: it starts a new session with a short
questionnaire for that tab already written into the composer (what to build, when it applies, which
steps or permissions it needs, where it should live), so the item can be tailored in conversation and
then saved in the form. Clicking another section's **Create via chat** replaces the questionnaire in
the draft instead of appending a second copy, so the composer never accumulates stale forms. The
**Skills** tab
lists `SKILL.md` bundles from all four roots DSH uses — the project's `.dsh/skills` and
`.agents/skills`, plus `<DSH_HOME>/skills` and `~/.agents/skills` — and lets you create, edit and
delete them without leaving the app. The `.agents` roots are read-only on purpose: DSH owns them, and
two writers would race on the same file. Each row shows the source and a validity badge; the editor
covers name, description, `whenToUse`, the markdown body and the invocation flags
(`disable-model-invocation`, `user-invocable`), while `metadata:` and unknown frontmatter keys are
preserved verbatim. The project root is resolved from the newest DSH session, because the host runs
from the application directory and DSH encodes the workspace path into the session directory name.
Skills written here are picked up by DSH on the next session, no rebuild needed.

The **Commands** tab keeps a registry of slash commands in `storages/qols/studio/commands.json` and
registers them into the host's command service as soon as you save. A command either sends the agent a
prompt (with `{input}`, `{args}` and `{args[N]}` substituted), switches the Auto tier
(`eco`/`standard`/`deep`), or answers with plain text. Registration is global to the host and lasts
until DSH restarts; the file is the source of truth, and a command the service rejects is marked with
its error instead of breaking the others. A built-in `/rule <name>` lists the enabled rules or puts a
rule body into the current conversation, so a rule is not limited to the always-apply prompt section.

The **Rules** tab edits always-apply instructions: markdown files with `name`, `description` and an
optional `enabled: false` frontmatter, kept in `<DSH_HOME>/rules` and the project's `.dsh/rules`. When
the plugin loads, the host joins the enabled rules into one `qols:rules` section of the system prompt
and the tab shows that exact text as a preview. The prompt is fixed for the life of the load, so a
saved rule reaches the model in a new session or after a restart.

The **Agents** tab reads the agent presets DSH composed through its `agentPresets` service: id, name,
description, order, which one is the default, and the loading diagnostic when a row is broken. A
preset is a Cordis row, not a file, so the tab never writes the profile: the form (id, name,
description, order, plugin package list, "make default") produces a validated, quoted YAML entry and
*Copy* puts it on the clipboard. Paste it under the top-level list in the profile's
`cordis.patch.yml` shown in the tab and restart DSH; sessions created afterwards can pick the preset.
The **Global AGENTS.md** tab edits `<DSH_HOME>/AGENTS.md` — the user-level instructions DSH applies to
every workspace. It is one plain markdown file, so the tab is a monospace editor with **Reload** and
**Save**, a byte counter against the 256 KB limit and an unsaved-changes marker instead of a list,
search field or questionnaire. The host reads and writes the file atomically (temp file, then rename),
creates the home directory if it is missing, and reports a missing file as an empty document rather
than an error, so the tab is usable on a fresh installation. An unsaved draft survives switching tabs
inside the overlay; **Reload** discards it. Like every other instruction file here, a saved change
applies to the next session, not to the open conversation.

Prompt Studio only writes files inside the skill and rule roots, the global `AGENTS.md` (plus the
command registry under `storages/`) and validates names as kebab-case, so a request cannot escape a
root through `../`.

### Liked plugins

**Settings → Liked plugins** is a short, curated list of plugins that work well with QoLs and do not
conflict with it. It is installed by the same QoLs bundle, but lives in its own settings section so the
list stays one click away. Every row shows whether the plugin is installed, its version, a link to
its repository (opened in a new tab), and its
controls: a switch to turn the plugin on or off (useful before an update), **Update** when a newer
release exists, and **Install** or **Remove**. The list has no outer card — rows sit directly on the
settings page, separated by hairlines. These are third-party plugins by other developers, not built
by the QoLs author: the list only recommends them, and all credit belongs to their authors.
Installs, updates and removals go through `dshmarket`'s host
routes (`/dsh-market/installed`, `/dsh-market/install`, `/dsh-market/update`,
`/dsh-market/uninstall`, `/dsh-market/toggle`), so the profile wiring stays in one place and a failed
change reports the host's error inline. Versions are not checked automatically: the page header has a
**Check for updates** button that queries `/dsh-market/updates?force=1` for every row and shows
**Update** when a newer release exists, including a release dshmarket still holds under its minimum
release age. The answer stays on screen while the page is open; a successful change clears it. The
list is seeded with **billion-context**, **Better Sidebar** and **DSH Market**; the market row is
marked **Core** because this tab uses its routes for Install/Update/Remove, so it has no Remove button
or off switch. DSH Market cannot update itself through its own route: that route unloads the market
from the running composition before reinstalling it. For the Core row, **Update** therefore calls
QoLs' own `POST /api/dsh-qols/liked/update-core`, which runs the bundled pnpm in the profile with
`--config.minimum-release-age=0` and then asks for a restart. The rest of the list still uses
`dshmarket`'s routes. The list is a recommendation, not a second marketplace. A successful change
asks for a DSH restart, because the running host loads plugins at startup.

## Requirements

- DeepSeek Harness `>=0.2.0-rc.2 <0.3.0-0` (the same range the package declares in `engines.dsh`).
- Node.js 22+ if you run the tests from source.
- At least one `deepseek-*` connection for the Auto tiers. With only `deepseek-official` connected the
  tiers keep working through the degradation route (`deepseek-flash`, effort `high`).

## Install

From the plugin market (once listed):

> **Settings → Plugins → Discover → QoLs → Install**

From a terminal:

```bash
# npm
dsh plugin --profile desktop add dsh-qols

# straight from GitHub
dsh plugin --profile desktop add github:Kalashya/dsh-qols

# from a release tarball
dsh plugin --profile desktop add https://github.com/Kalashya/dsh-qols/releases/download/v0.1.0/dsh-qols-0.1.0.tgz
```

Git and tarball installs do not require the package to be published on npm. A Discover card requires
an index source that lists the plugin; see [docs/market-submission.md](docs/market-submission.md).

Then restart the Desktop app — host modules are loaded at startup. The plugin appears as a profile
layer (`qols` row) and as a card in **Settings → QoLs**.

To make Auto the default for new sessions, choose `QoLs Auto / Auto` in **Settings → Models**.
Subagents inherit the parent route; to give them their own Auto route, enable
**Plugins → Subagent → Model selection** and add `qols-auto/auto`.

## Configuration

The loader row accepts one option:

```yaml
- id: qols
  name: dsh-qols
  config:
    updates:
      enabled: false   # default: true
```

`updates.enabled: false` switches off `POST /api/dsh-qols/liked/update-core`, the one route that
rewrites the current profile with pnpm. Diagnostics then reports the updater as degraded and says
why; everything else keeps working. Useful when the profile is managed outside DSH.

## Data and privacy

| What | Where |
|---|---|
| Auto decision journal | `storages/qols/auto/log.jsonl` — tier, route, score, signals, first-200-chars hash |
| Judge model choice | `storages/qols/auto/settings.json` |

(`storages/` is inside your DSH home, usually `~/.dsh`.)

- Nothing is sent anywhere except the model calls the harness would make anyway.
- The journal deliberately stores a SHA-256 prefix of the task instead of the task text.
- The plugin ships no third-party brand artwork: `icon.svg` is its own mark, and no DeepSeek logo is
  bundled or served.

## Uninstall

1. Remove the `qols` row from the profile's `cordis.patch.yml` (or delete the whole `- insert:`
   block that mounts `dsh-qols`).
2. Remove the package from the profile: `pnpm remove dsh-qols` in the profile directory, and drop
   `dsh-qols` from `dsh.profile.bundles` if it was listed there.
3. Delete the plugin's data if you no longer want it: `storages/qols/` inside your DSH home.
4. Restart DSH. A running host keeps the old module graph in memory, so the routes and slots stay
   until the restart.

Nothing outside `cordis.patch.yml`, the profile `package.json`/lockfile and `storages/qols/` is
touched by the plugin, so those three are the only places to clean up.

## Troubleshooting

| Symptom | Fix |
|---|---|
| No card in Settings → QoLs | the plugin did not load — check the Desktop log for `[qols] feature failed`, then restart the app |
| A feature stopped working | **Settings → QoLs → Diagnostics** names the feature and shows the error; *Copy report* for a bug report |
| `QoLs Auto` missing in the model menu | the adapter failed to register; `/api/dsh-qols/auto/status` reports `registered: false` and the last error |
| Every task lands on Standard | that is the grey zone with the default judge; switch the judge model or check the journal for `source: classifier` |

## Development

```bash
git clone https://github.com/Kalashya/dsh-qols
cd dsh-qols
npm ci            # reproducible install; one runtime dependency: @deepseek-ai/schemastery, for Config
npm run verify    # bundle check + 17 headless suites + pack check
npm test          # suites only
```

Link it into a profile while working:

```bash
dsh plugin --profile desktop add link:C:/path/to/dsh-qols
```

Layout:

| Path | Contents |
|---|---|
| `index.js` | plugin entry: `name`/`inject`/`Config`/`apply` |
| `client.js` | browser bundle: Prompt Studio overlay, Auto badge, settings dialogs |
| `scripts/` | `verify.mjs` and `bundle-check.mjs`, the quality gates behind `npm run verify` |
| `features/index.js` | feature registry — one module per capability |
| `features/auto/` | router, heuristic, judge, journal, settings, adapter, routes |
| `features/usage/` | own token meter, USD prices, peak schedule, ledger, balance cache, routes |
| `features/studio/` | Prompt Studio host: four skill roots with workspace detection, rule roots and text parse/serialize, the global `AGENTS.md` reader/writer (`instruction.js`), command registry with arguments and a built-in `/rule`, live registration, the `qols:rules` prompt section |
| `features/health.js` | registration status and cheap health checks per feature |
| `features/*-host.js` | small HTTP feature modules (catalog, diagnostics) |
| `cordis.patch.yml` | the bundle's single loader row |
| `test/`, `suites/` | headless suites, run by `node --test` |

Client changes need a Desktop restart: the shell is a custom protocol page with no reload command
(`Ctrl+R` and `location.reload()` are no-ops), and the bundle is read when the host starts. Host
changes need the same restart.

## Project memory

Maintainers keep decisions, lessons, and the feature inventory in `.dsh/` in a working checkout. That
folder is git-ignored in the public repository because it records machine-specific wiring and session
history; it is not part of a clone. [`AGENTS.md`](AGENTS.md) defines the bookkeeping rules for a
maintainer checkout; `CHANGELOG.md` and this README are the public record.

## Publishing (maintainers)

```bash
npm ci
npm run verify              # bundle check + suites + pack check; CI runs the same command
npm pack --dry-run          # check what ships
git tag v0.1.0
git push origin main
git push origin v0.1.0
npm publish                 # unscoped public package
node scripts/build-index.mjs   # regenerate market/index.json for the optional self-hosted index
git add market/index.json && git commit -m "market: refresh index" && git push
```

Run this from a clean tree and wait for CI on `main` before tagging. The GitHub release workflow
attaches the `.tgz` to the tag and publishes to npm when `NPM_TOKEN` is set. To list the plugin in the catalogue, see [docs/market-submission.md](docs/market-submission.md).

## License

MIT — see [LICENSE](LICENSE).

---

# QoLs (по-русски)

Мелкие удобства для DeepSeek Harness: модель **Auto**, которая сама выбирает модель и уровень
рассуждений под сложность задачи, стоимость сессии и Prompt Studio для навыков, команд, правил,
пресетов агентов и глобального `AGENTS.md`.

- **Auto** — включается выбором `QoLs Auto / Auto` в меню моделей. Задача оценивается эвристикой;
  модель-судья вызывается только в серой зоне (0.35–0.70), поэтому большинство задач не тратят
  лишних токенов. Eco — `flash/off`, Standard — `flash/high`, Deep — `v4-pro/max`. Решение
  принимается один раз на сообщение пользователя и переиспользуется на шагах с инструментами.
- **Бейдж** под полем ввода показывает выбранный тир, полная причина — в подсказке, история
  решений — в **Настройки → QoLs**. Текст задач не сохраняется, только хеш.
- **Модель-судья** выбирается там же, в окне Auto: любой подключённый провайдер и модель.
- **Prompt Studio** — строка в списке панелей сайдбара (над Workspaces) открывает оверлей поверх
  кадра, как Настройки: навыки, команды, правила, пресеты агентов и глобальный `AGENTS.md`.
- **Диагностика** — в **Настройки → QoLs** внизу: статус каждой фичи (`работает`, `деградация`,
  `ошибка`, `не зарегистрирована`) и текст ошибки, если она есть. В отчёте нет токенов и промптов.

Память проекта ведётся локально в `.dsh/` рабочей копии и в публичный репозиторий не входит.
Публичная документация — этот `README.md`, [`CHANGELOG.md`](CHANGELOG.md) и [`AGENTS.md`](AGENTS.md).

Установка: `dsh plugin --profile desktop add github:Kalashya/dsh-qols` (или из npm/релизного
tarball), затем перезапуск приложения. Discover показывает плагин только после добавления источника
индекса.

Права: MIT. Плагин не содержит сторонних логотипов: `icon.svg` — собственная марка.
