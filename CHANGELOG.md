# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Liked plugins credits its authors

- **Repository links** — every row in the **Liked plugins** settings section now links to that
  plugin's repository (`billion-context`, `dsh-better-sidebar`, `dshmarket`), opened in a new tab with
  `rel="noopener noreferrer"`. The URL is the same field the Install action already uses.
- **Credit where it is due** — the section description now says, in both languages, that these are
  third-party plugins by other developers, not built by the QoLs author, and that all credit belongs
  to their authors.

### Sidebar rows and a Settings-style Prompt Studio

- **Panel rows behave as buttons** — a `sidebar.panellist` row always calls `layout.selectPanel(id)`,
  so the client stops that click at the row button (`preventDefault` + `stopPropagation`) and opens
  the studio overlay instead. No `main` panel is registered for the id, so a missed interception
  cannot swap the centre column.
- **Prompt Studio opens like Settings** — the studio is no longer a `main` panel with a launcher page
  and a remembered return panel. It is a `shell.overlay` entry, so opening it paints a dialog above
  every column and the conversation stays mounted behind it; closing never touches the layout. The
  panel-restore code is gone with it.
- **New Prompt Studio tab: Global AGENTS.md** — reads and writes `<DSH_HOME>/AGENTS.md` through
  `GET`/`POST /api/dsh-qols/studio/instruction`: a monospace editor with Reload, Save, a 256 KB byte
  counter and an unsaved-changes marker. Writes are atomic (temp file, then rename); a missing file
  renders as an empty document. The tab is the fifth one and hides the list-only search, New and
  Create-via-chat actions.

### Verification and hardening

- **`npm run verify`** — one gate for packaging, the client bundle and all suites. `npm run
  bundle:check` alone validates the manifest (`type`, `exports`, `dsh.client`, `engines.dsh`), the
  loader patch, the packed file set, the single `__ModuleLoader__.load` call, the module id, the
  slot registrations and the absence of top-level `import` in the client bundle. CI now runs
  `npm run verify` instead of two separate steps.
- **Core updates run through the host** — `liked` starts pnpm through the `subprocess` service, so
  DSH owns the process tree and stops an update when the app quits. The child gets an allow-listed
  environment: `DSH_*`, anything matching `KEY|PASSWORD|SECRET|TOKEN` and every other variable is
  dropped. Without the service the route answers `503` instead of failing silently.
- **`Config`** — the patch row accepts `config.updates.enabled` (default `true`). Turning it off
  makes `POST /api/dsh-qols/liked/update-core` answer `403` and diagnostics say why.
- **Diagnostics covers every feature** — all six features report a state, including `liked`, and
  the catalog check validates both languages plus the card titles.
- **Catalog** — four user-facing features (`auto`, `usage`, `studio`, `liked`), each with
  an English and a Russian title and description. A new suite fails the build when a key exists in
  only one language or a `t()` key has no translation.
- **Corrupt storage is quarantined** — a JSON file the plugin cannot parse is moved to
  `<name>.corrupt-<timestamp>` and the feature continues with defaults, instead of overwriting the
  user's bytes on the next save.
- **Hot reload is idempotent** — the client bundle skips a second `apply` in the same page, so a
  reload no longer doubles the sidebar icons and settings cards.
- **Packaging** — `main`, `sideEffects: ["./client.js"]`, and README/CHANGELOG/LICENSE are declared
  in `files`; `@deepseek-ai/schemastery` is the plugin's only runtime dependency, used for `Config`.
  The README now documents uninstall (patch row, profile package, `storages/qols/`, restart).

### Turn cost

- **The line belongs to its turn** — the tail now renders the turn it is attached to
  (`props.turn.turn`) instead of the session's "current" turn, and fetches
  `GET /api/dsh-qols/usage/turn?sessionId=…&turn=N` once per turn. A finished message keeps its own
  total after a reload, and a turn with no calls renders nothing instead of a stale number.
- **Host attribution** — the meter now subscribes to `session/event` (`turn/start`, `turn/end`) and
  tags each call with the harness turn number and `turnSource: 'session'`. Calls whose turn is
  unknown keep the old heuristic number, are marked `turnSource: 'heuristic'` and are excluded from
  per-turn totals, so nothing is counted twice.
- **Live chip** — `conversation.input.left` gained `qols-live-cost`: while a turn is open it
  shows the running sum and call count, then yields to the tail when the turn closes.

### Wallet at startup

- **Today and Balance arrive together** — the first `/usage/status` after a restart may wait up to
  2.5 s for the account service (`BalanceCache.settled`), and the client withholds the shared money
  row while the wallet is still `unknown` instead of painting Today alone. If no account service
  ever appears, the row appears after a 6 s grace period with Today only.
- **Faster retry** — an unmounted account service is now `unknown` (not `signed-out`) and retries
  after one second; a wallet that is not ready is polled every second until it is.

### Added

- **Liked plugins** — a separate **Settings → Liked plugins** section inside the same QoLs bundle,
  with a short curated list (`billion-context`, `Better Sidebar`), installed version badges, and
  **Install** / **Remove** actions backed by dshmarket's host routes. The list is a recommendation,
  not a marketplace, and asks for a restart after a change.
- **Liked plugins updates and activation** — each installed row has an on/off switch and, after the
  page's **Check for updates** button queries `/dsh-market/updates?force=1`, an **Update** button when
  a newer release exists. Held releases (dshmarket's minimum release age) are surfaced too. Nothing is
  checked automatically.
- **Liked plugins without a container** — the rows now sit directly on the settings page, separated
  by hairlines, instead of inside a bordered card.
- **Liked plugins includes DSH Market** — the market is listed as a **Core** recommendation with its
  installed version; it has no Remove button or off switch because this tab uses its routes for the
  other rows.
- **Core update for DSH Market** — the Core row's **Update** now calls QoLs'
  `POST /api/dsh-qols/liked/update-core` instead of dshmarket's self-update route, which cannot
  reinstall the market after unloading it (#900). The route runs the bundled pnpm in the profile with
  `--config.minimum-release-age=0`, then asks for a DSH restart; the rest of the list still uses
  dshmarket's routes.

### Changed

- **Prompt Studio** — the feature, its settings card, overlay title, sidebar entry and documentation
  are now named *Prompt Studio* (formerly *Studio*). Internal ids and `/api/dsh-qols/studio/*` routes
  are unchanged, so existing clients and stored commands keep working.
- **Prompt Studio sidebar entry** — a new row above **Workspaces**, registered into the same
  `sidebar.panellist` list as other plugins, opens the editor overlay directly; closing it restores the
  panel that was active before.
- **Prompt Studio size and chat draft** — the overlay keeps a fixed height on every tab instead of
  shrinking with the list. **Create via chat** now replaces the draft (`whenDraftExists: 'replace'`),
  so switching to another section swaps the questionnaire instead of stacking a second one.
- **Prompt Studio density and editing** — the overlay title, tabs and rows use the app's compact
  12–14 px scale; **Edit** expands its form inside the clicked row instead of above the list; closing
  the sidebar entry restores the panel that was open before it, and a search field filters the active
  tab by name, description and body.
- **Prompt Studio overlay** — the settings page now shows a single Prompt Studio card; its button opens the whole editor
  (Skills, Commands, Rules, Agents) in a wide overlay above the page, and Escape or the close button
  closes it. Each tab has a **Create via chat** button that starts a new session with a
  section-specific questionnaire already in the composer, so a skill, rule, command or agent preset
  can be designed in conversation and then saved in the tab.
- **Settings order** — Diagnostics is now the last card on Settings → QoLs, after Usage and Prompt Studio.
- **Prompt Studio tabs** — fixed a crash when switching to **Commands**: the tab counter read
  `commands.visible`, which the hook did not return, so the pane unmounted and left the main area
  blank. The tab now renders and its counter follows the filtered list.
- **Usage card** — the footer rail now spans the whole local day (00:00–23:59:59) and draws that
  day's own peak and off-peak spans in light red and light green instead of two fixed halves. The
  marker follows the current time across the whole day; weekends and Chinese public holidays show
  `Off-peak all day` and no longer promise a peak that will not happen.

### Added

- **Usage card** — a `Show today's cost and wallet balance on the card` switch in Settings → QoLs
  → Usage (`showAmounts`, on by default; the old `showBalance` key migrates). Turning it off
  removes both money rows and the low-balance warning, keeping the peak rail; the card reacts
  immediately instead of waiting for its next poll.

- Peak schedule models Chinese public holidays (`peak.holidays`, same default dates as
  `dsh-cost-meter`); holiday multipliers stay at 1 and the next-peak search skips them.

- **Studio** — a Settings → QoLs panel with tabs for Skills, Commands, Rules and Agents; the Skills
  tab lists skills from the project and user roots, shows a validity badge, and can create, edit and
  delete `SKILL.md` files in the format DSH already reads. The Commands tab keeps a registry of slash
  commands and registers them into the host as soon as they are saved. The Rules tab edits
  always-apply markdown rules and previews the exact prompt text the host sends to the model. The
  Agents tab lists the presets DSH composed (with the default flag and loading diagnostics), shows
  one preset's YAML composition, and turns a form into a validated, quoted patch entry to paste into
  the profile; it never rewrites the profile itself.
- `GET|POST|DELETE /api/dsh-qols/studio/skills` — list roots and skills, save one skill, delete one.
- `GET|POST|DELETE /api/dsh-qols/studio/commands` — list commands with their registration state,
  save one (registered immediately), delete one.
- `GET|POST|DELETE /api/dsh-qols/studio/rules` — list rules with the prompt preview, save one,
  delete one.
- `GET|POST /api/dsh-qols/studio/agents` — list presets and the profile patch location, read one
  preset's composition (`?preset=<id>`), build a patch entry from a form.
- `features/studio/` — root discovery (nearest `.git` ancestor, falling back to the workspace itself,
  and `<DSH_HOME>/skills`), frontmatter
  parse/serialize with `metadata:` and unknown keys preserved, validation, atomic writes; the command
  registry with three action kinds (`prompt` with `{input}`, Auto `tier`, plain `say`) and a runtime
  that re-registers into `ctx.commands` after every change; rules that are mounted as the `qols:rules`
  system-prompt section when the plugin loads; agent presets read through `agentPresets` and a
  snippet builder that validates ids and package names and quotes YAML.
- **Studio, second pass** — the Skills tab now covers all four DSH roots (project `.dsh/skills`,
  project `.agents/skills`, `<DSH_HOME>/skills`, `~/.agents/skills`), marks the `.agents` roots
  read-only, and exposes the `disable-model-invocation` and `user-invocable` flags as checkboxes. The
  project root is found through the newest DSH session directory, because DSH encodes the workspace
  path into its name and the host process runs from the app directory, not the workspace.
- Command actions accept `{args}` and `{args[N]}` beside `{input}`, and the host registers a built-in
  `/rule <name>` that lists the enabled rules or injects one rule body into the current dialogue.
- `suites/qols-studio.mjs` — frontmatter round-trip, list/save/delete over all four roots, invocation
  flags, read-only rejection, workspace-name decoding (including `~XXXX`) and validation/path-containment checks.
- `suites/qols-commands.mjs` — command validation, registry upsert and broken-file recovery, live
  registration and unregistration, all three action handlers, argument placeholders, `/rule`, route
  methods.
- `suites/qols-rules.mjs` — rule frontmatter, the `qols:rules` prompt section (enabled rules only,
  order 9000), the preview, saving without re-registering, validation and path containment.
- `suites/qols-agents.mjs` — preset listing and diagnostics, composition lookup, snippet quoting and
  validation, profile detection, route methods, and proof that the profile patch is never written.
- **Usage** — a sidebar footer card with today's cost in USD, the wallet balance on the same line
  (grant first, in its own currency, warning below the configured threshold), and the peak/off-peak
  phase as a two-segment bar with a marker and a countdown chip.
- **Turn cost** line in the chat turn tail: cost and token split of the current turn, with the
  individual model calls.
- `GET /api/dsh-qols/usage/status`, `GET|POST /api/dsh-qols/usage/config`,
  `GET /api/dsh-qols/usage/log` — status, editable preferences and daily aggregates.
- `features/usage/` — own meter over the `llm/stream` waterfall, USD price table, peak schedule,
  append-only ledger (`storages/qols/usage/ledger.jsonl`), wallet cache.
- `suites/qols-usage.mjs` — prices, peak windows, config validation, ledger aggregates, meter
  dedupe and turn attribution, route methods.
- **Diagnostics** in Settings → QoLs: registration status per feature (`working`, `degraded`,
  `failed`, `not registered`) with clipped error text, *Check again* and *Copy report*.
- `GET /api/dsh-qols/diagnostics` — the report, limited to ids, booleans, short details and errors.
- `features/health.js` — registration bookkeeping plus cheap per-feature checks.
- `suites/qols-diagnostics.mjs` — failing registration, broken session file, route methods, and a
  recursive check that the report carries no secrets.

### Changed

- **Settings → QoLs, redone to app standards.** The section now opens with a page title and
  description, then labelled groups (Features / Diagnostics / Usage / Studio). Feature cards use the
  settings-card material (radius 20, 0.5px card stroke on `--dsw-alias-settings-card-fill`), a 36px
  icon tile, a 14/500 title with an inline auth status, 13/20 secondary copy and a 28px outline Edit
  button. Diagnostics rows are hairline-separated with a 104px name column and a status tag
  (`working` / `degraded` / `failed`) instead of a bare dot. The usage block uses real 36×20 switches
  with `aria-checked` instead of native checkboxes.
- **Studio** is a settings card with a segmented tab strip (`role=tablist`/`role=tab`,
  `aria-selected`), a two-line row layout (name and badges on the first line, description clamped to
  two lines below, actions at the right), hairline separators instead of nested boxes, 32px form
  inputs with 12px radii, and an inline `Delete?` / Cancel / Delete confirmation in place of
  `window.confirm` — a failed delete keeps the row and shows the error.
- **Feature dialog** is a real modal: overlay on `--dsw-alias-bg-mask-1`, panel radius 28 with
  `--dsw-elevation-prominent`, `role=dialog` + `aria-modal` + `aria-labelledby`, Tab focus trap,
  initial focus, focus restored to the opener, body scroll lock, and a 28px icon close button.
- **Sidebar usage card, turn cost line and Auto badge** follow the same rhythm: 11px labels with
  12/500 tabular values, a 4px peak track with a 2px ink marker (no arrow), a phase chip with a
  coloured dot, and a skeletal placeholder while the first status request is in flight.
- All colours, radii and surfaces now come from `--dsw-*` tokens. Four tokens the bundle referenced
  never existed and silently fell back to literals — `--dsw-alias-accent`,
  `--dsw-alias-bg-elevated`, `--dsw-alias-state-danger-primary`,
  `--dsw-alias-state-warning-primary` — and are gone, as are the literal colours, the 6/7/10/14px
  radii and the 1px hairlines they belonged to.
- Hover rules are wrapped in `@media (hover: hover)`; every interactive element has a
  `:focus-visible` ring; headings and labels are weight 500 or lower.
- `features/index.js` gained the `diagnostics`, `usage` and `studio` features; `index.js` records
  every registration outcome.
- With both plugins installed, the QoLs usage card hides the cost-meter footer (a body class) so
  the balance is not shown twice.
- Usage settings moved to schema v2 (USD prices); a v1 settings file is migrated on start and its
  CNY ledger is archived as `ledger-v1.jsonl`, so old yuan records never mix with dollar totals.
  Records written before the switch carry no currency and are now skipped by the daily aggregate.
- The usage card retries a failed or not-yet-available balance every 8 seconds (instead of waiting
  a full minute) and prefers a topped-up wallet with money in it over an empty grant.
- While the QoLs usage card is on, the cost-meter turn line (`.cm-note`) is hidden together with its
  footer, so the turn tail does not show a second, yuan-denominated cost.
- The peak marker on the usage card is no longer fixed per phase: it slides through the orange half
  during peak and the blue half during off-peak, reaching the phase boundary exactly when the phase
  ends. The card refreshes every 5 seconds and the marker animates between updates.
- The Studio header now owns the per-tab count and the create button for both working tabs
  (*0 skills / New skill*, *0 commands / New command*); the command editor no longer repeats its
  button inside the body, matching the Skills tab.
- The `qols:rules` prompt section is mounted defensively: rule text is literal (`interpolate: false`,
  so `{{…}}` in a rule is never treated as a template) and a failure to read rules or register the
  section is logged instead of aborting plugin startup.

### Fixed

- **Studio workspace detection** — a workspace path containing a space (`DSH plugins`) is encoded by
  DSH as `~0020` in the newest session directory; the decoder now unescapes `~XXXX`. Project roots
  also fall back to the workspace itself when no `.git` ancestor exists, matching DSH's
  `findProjectRoot`, so the Skills tab lists `project` / `project-agents` roots in a non-git
  workspace.
- `font: var(--dsw-font-*)` reset `font-family` to the initial serif, because the theme roles carry
  only size, line height and weight. Every shorthand now sets `font-family:
  var(--dsw-font-family)` explicitly, and rules that need monospace still declare their own family
  after it. Without this the redesigned panel rendered in Times.
- `GET /api/dsh-qols/studio/rules` no longer claims that a just-saved rule is already in effect:
  `section.applied` now reflects the section the running host actually mounted, and
  `section.mountedBytes` reports its size. The preview keeps showing what the next plugin load will
  mount, so the tab can state the restart boundary without contradicting the API.

## [0.1.0] - 2026-10-22

First public release.

### Added

- **Auto model router** — a `qols-auto` LLM provider whose model `auto` decides the route per task:
  Eco (`deepseek-flash`/`off`), Standard (`deepseek-flash`/`high`), Deep (`deepseek-v4-pro`/`max`).
  - difficulty heuristic over the last user message (length, complexity keywords, trivial markers,
    attachments, fenced code, short questions),
  - judge model called only in the grey zone (`0.35 < score < 0.70`), selectable from every
    connected model,
  - per-task stickiness: tool steps reuse the decision, so prompt cache and reasoning continuity
    survive,
  - image guard: tasks carrying images never go to the text-only Deep tier,
  - fixed cheap route for compaction and session-title calls,
  - degradation route when the chosen tier is not available,
  - decision journal (`storages/qols/auto/log.jsonl`), tier badge under the composer, settings
    dialog with routes, grey zone, judge model and history.
- Settings → QoLs: one card per feature with an edit dialog; localized titles and descriptions
  (English, Russian).
- 12 headless test suites run by `node --test`.

### Notes

- Requires DeepSeek Harness `>=0.2.0-rc.2 <0.3.0-0`.
- Auto calls are billed under `qols-auto/auto` in the cost meter; the routed model is recorded in the
  decision journal.
