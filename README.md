# QoLs

Quality-of-life extras for [DeepSeek Harness](https://github.com/deepseek-ai):

- **Auto** — routes each task to a cheap or deep model by difficulty.
- **Usage** — shows today's spend, wallet balance and the day's peak/off-peak rail.
- **Prompt Studio** — edits skills, commands, rules, agent presets and the global `AGENTS.md`.
- **Diagnostics** — shows which features loaded and why one failed.
- **Liked plugins** — a short, curated list of compatible third-party plugins.

Everything runs locally. The plugin adds one model provider (`qols-auto`), a few small HTTP routes
and five UI surfaces: the Prompt Studio row in the sidebar, the Auto badge, the usage card, the
per-turn cost line and the Settings → QoLs page.

## Requirements

- DeepSeek Harness `>=0.2.0-rc.2 <0.3.0-0`.
- Node.js 22+ only if you run the test suites from source.
- At least one connected `deepseek-*` model. With only `deepseek-official`, Auto still works through
  the `deepseek-flash` / `high` fallback.

## Install

```bash
# from GitHub
dsh plugin --profile desktop add github:Kalashya/dsh-qols

# from npm, after publication
dsh plugin --profile desktop add dsh-qols

# from a release tarball
dsh plugin --profile desktop add https://github.com/Kalashya/dsh-qols/releases/download/1.0.0/dsh-qols-1.0.0.tgz
```

Git and tarball installs do not need the package to be published on npm. Restart DSH afterwards —
host modules are loaded at startup. The plugin appears as the `qols` profile layer and as
**Settings → QoLs**.

To make Auto the default, choose `QoLs Auto / Auto` in **Settings → Models**. Subagents inherit the
parent route; for a separate route, enable **Plugins → Subagent → Model selection** and add
`qols-auto/auto`.

**Discover:** the plugin appears there only after an index source lists it. See
[docs/market-submission.md](docs/market-submission.md).

## Auto

Pick `QoLs Auto / Auto` in the model menu or with `/model`.

| Tier | Route | Used for |
|---|---|---|
| Eco | `deepseek-flash`, effort `off` | greetings, short questions, simple lookups |
| Standard | `deepseek-flash`, effort `high` | ordinary work |
| Deep | `deepseek-v4-pro`, effort `max` | refactors, architecture, proofs, large diffs |

A task is one user message: the decision is made once and reused for its tool steps, so the prompt
cache and reasoning continuity are preserved. A cheap heuristic scores the text first; the judge
model runs only in the grey zone (`0.35 < score < 0.70`), so most tasks pay no judging cost.

- The judge model is selectable in **Settings → QoLs → Auto**.
- The badge under the composer shows the current tier; its tooltip shows route, score and signals.
- Decisions are journaled in **Settings → QoLs**. Task text is not stored, only a SHA-256 prefix.
- Compaction and session-title calls use a fixed cheap route; images never go to the text-only Deep
  tier.

## Usage

The sidebar footer shows today's spend and the wallet balance (topped-up wallet first, otherwise the
grant), with a warning below the threshold. The day rail shows peak and off-peak spans, the current
time and a chip such as `Off-peak · Peak in 9h 50m`. Weekends and Chinese public holidays are
off-peak all day. Both money rows can be hidden together in **Settings → QoLs → Usage**; the rail and
chip stay.

Each finished turn adds a tail line with its own cost, token split and model calls, keyed by the
harness turn number so it survives a reload. While a turn runs, a composer chip counts it
(`≈ $0.0042 · 3 calls`). Prices use the official USD per-million table; peak windows are
01:00–04:00 and 06:00–10:00 UTC. The balance comes from the signed-in account through the harness;
the token never reaches the client. The ledger stores model, token buckets, cost, session id and turn
number — never prompt text.

If `dsh-cost-meter` is installed, its footer card and turn-cost line are hidden while QoLs' usage
card is enabled.

## Prompt Studio

Open it from the Prompt Studio row above Workspaces or from **Settings → QoLs**. It is an overlay
above the app frame; the conversation stays mounted behind it. Escape or the close button closes it.

| Tab | What it edits |
|---|---|
| Skills | `SKILL.md` bundles under the project's `.dsh/skills` and `.agents/skills`, plus `<DSH_HOME>/skills` and `~/.agents/skills` |
| Commands | the slash-command registry in `storages/qols/studio/commands.json` |
| Rules | always-apply markdown rules in `<DSH_HOME>/rules` and the project's `.dsh/rules` |
| Agents | reads DSH agent presets; produces a validated YAML row to paste into the profile |
| Global AGENTS.md | `<DSH_HOME>/AGENTS.md`, with reload/save and a byte counter |

The `.agents` roots are read-only because DSH owns them. Prompt Studio writes only inside the skill
and rule roots, the global `AGENTS.md` and the command registry; names are validated as kebab-case, so
`../` cannot escape a root. A saved skill or rule applies to the next session (or after a restart),
not to the open conversation.

## Diagnostics

**Settings → QoLs → Diagnostics** shows each feature as `working`, `degraded`, `failed` or
`not registered`, with the error text. **Check again** refetches; **Copy report** copies JSON for a
bug report. The report contains ids, booleans, short details and a clipped error — no tokens,
prompts or message text.

## Liked plugins

**Settings → Liked plugins** is a curated list of third-party plugins that work with QoLs. Rows show
installed state, version, repository link and Install / Update / Remove controls. The list seeds
**billion-context**, **Better Sidebar** and **DSH Market**; the market row is marked **Core** because
this page uses its routes. These plugins are not built by the QoLs author — all credit belongs to
their authors. Changes go through `dshmarket`'s host routes and ask for a DSH restart.

## Configuration

The loader row accepts one option:

```yaml
- id: qols
  name: dsh-qols
  config:
    updates:
      enabled: false   # default: true
```

`updates.enabled: false` disables `POST /api/dsh-qols/liked/update-core`, the route that rewrites the
current profile with pnpm. Diagnostics then reports the updater as degraded; everything else works.
Use it when the profile is managed outside DSH.

## Data and privacy

| What | Where |
|---|---|
| Auto decision journal | `storages/qols/auto/log.jsonl` |
| Judge model choice | `storages/qols/auto/settings.json` |

`storages/` is inside your DSH home, usually `~/.dsh`. QoLs sends nothing anywhere except the model
calls the harness would make anyway. The journal stores a SHA-256 prefix of the task, never its text.
The plugin bundles no third-party brand artwork; `icon.svg` is its own mark.

## Development

```bash
git clone https://github.com/Kalashya/dsh-qols
cd dsh-qols
npm ci            # one runtime dependency: @deepseek-ai/schemastery
npm run verify    # bundle checks + 17 headless suites + pack check
npm test          # suites only
```

Link a working copy into a profile:

```bash
dsh plugin --profile desktop add link:C:/path/to/dsh-qols
```

| Path | Contents |
|---|---|
| `index.js` | plugin entry: `name` / `inject` / `Config` / `apply` |
| `client.js` | browser bundle: Prompt Studio, Auto badge, settings UI |
| `features/` | one module per capability: auto, usage, studio, liked, health |
| `scripts/` | `verify.mjs` and `bundle-check.mjs` |
| `test/`, `suites/` | headless suites run by `node --test` |
| `cordis.patch.yml` | the bundle's single loader row |

Host and client changes both need a DSH restart; the web shell is a custom protocol page, so
`Ctrl+R` and `location.reload()` do not reload it.

### Project memory

Maintainers keep decisions and session history in `.dsh/` in a working checkout. It is git-ignored
and is not part of a clone; [`AGENTS.md`](AGENTS.md) defines the bookkeeping rules. The public record
is this README and [`CHANGELOG.md`](CHANGELOG.md).

## Uninstall

1. Remove the `qols` row (or the whole `- insert:` block) from the profile's `cordis.patch.yml`.
2. Run `pnpm remove dsh-qols` in the profile and drop it from `dsh.profile.bundles` if listed.
3. Delete `storages/qols/` from the DSH home if you no longer want the data.
4. Restart DSH.

Those three places — `cordis.patch.yml`, the profile package files and `storages/qols/` — are the
only things the plugin touches.

## Troubleshooting

| Symptom | Fix |
|---|---|
| No card in Settings → QoLs | the plugin did not load; check the Desktop log for `[qols] feature failed`, then restart |
| One feature stopped working | open **Settings → QoLs → Diagnostics**; the failing feature and error are listed |
| `QoLs Auto` missing from the model menu | `/api/dsh-qols/auto/status` reports `registered: false` and the last error |
| Every task lands on Standard | that is the grey zone with the default judge; switch the judge or inspect the journal |

## Releasing

Run `npm ci && npm run verify`, then tag and push. The release workflow attaches the `.tgz` to the
tag and publishes to npm when `NPM_TOKEN` is set. For catalogue/index details, see
[docs/market-submission.md](docs/market-submission.md).

## License

MIT — see [LICENSE](LICENSE).

---

## По-русски

QoLs — небольшие удобства для DeepSeek Harness: маршрутизатор **Auto**, учёт стоимости сессии и
**Prompt Studio** для навыков, команд, правил, пресетов агентов и глобального `AGENTS.md`.

- **Auto** включается выбором `QoLs Auto / Auto`. Eco — `flash/off`, Standard — `flash/high`,
  Deep — `v4-pro/max`; судья вызывается только в серой зоне (0.35–0.70).
- **Стоимость** — карточка в футере сайдбара: расход за сегодня, баланс, пиковые/off-peak часы и
  строка стоимости каждого хода. Текст задач не сохраняется.
- **Prompt Studio** — оверлей из списка панелей или из **Настройки → QoLs**: навыки, команды,
  правила, пресеты и глобальный `AGENTS.md`.
- **Диагностика** — внизу **Настройки → QoLs**: статус каждой фичи и текст ошибки.
- **Liked plugins** — короткий список совместимых сторонних плагинов; устанавливаются через
  `dshmarket`.

Установка:

```bash
dsh plugin --profile desktop add github:Kalashya/dsh-qols
```

Затем перезапустить DSH. Discover показывает плагин только после добавления источника индекса.
Данные лежат в `storages/qols/` внутри DSH home. Лицензия MIT; сторонних логотипов в плагине нет.
