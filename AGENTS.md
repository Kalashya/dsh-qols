# AGENTS.md — dsh-qols

`dsh-qols` is a DeepSeek Harness (DSH) plugin: one LLM provider (`qols-auto`), seventeen exact HTTP
routes, a QoLs settings section, an Auto tier badge under the composer, a usage card in the sidebar
footer, one row in the sidebar panel list (**Prompt Studio**), a skills, commands, rules and
agent-preset studio that opens as a `shell.overlay`, and a global `AGENTS.md` editor in that studio.
The plugin ships no third-party brand artwork: `icon.svg` is its own mark.

This file is project instructions. The durable memory of the project lives in `.dsh/`; reading and
maintaining it is part of every task, not an optional courtesy.

The plugin lives in a multi-plugin workspace; keep that workspace path out of public files.
Workspace-level rules, the plugin registry and profile wiring are in `..\AGENTS.md` and
`..\.dsh\`; that layer wins for profile/global changes, while this file wins for the plugin's own
code and `.dsh/`.

## 1. Read before you plan

Read these, in order, before touching code:

1. `.dsh/STATE.md` — current setup: versions, how the plugin is wired, how to run checks here.
2. `.dsh/features/INVENTORY.md` — what already exists: files, routes, storage, tests, limits.
3. `.dsh/features/BACKLOG.md` — the user's wishes and their status.
4. `.dsh/lessons/LESSONS.md` — mistakes already paid for; do not repeat them.
5. `.dsh/sessions/` — only the newest log, when resuming unfinished work.

If `.dsh/` is absent (a public clone), skip this list; `CHANGELOG.md`, this file and the suites are
the available record.

Rules:

- A request that contradicts `INVENTORY.md` or `LESSONS.md`: stop and surface the conflict.
- New work: create or refresh its BACKLOG item (`todo` → `doing`) before coding.
- Never skip these reads "just this once"; that is exactly how duplicated work and repeat bugs
  happen.

## 2. Bookkeeping contract

| Event | File | Action |
|---|---|---|
| Session starts | `.dsh/sessions/YYYY-MM-DD-HHMM-<slug>.md` | create from `_TEMPLATE.md` |
| Decision, error, dead end, check result | the same session log | append immediately, not from memory later |
| Mistake, user correction, harness quirk | `.dsh/lessons/LESSONS.md` | add an `L-###` entry |
| Feature, route, file, storage, test change | `.dsh/features/INVENTORY.md` | update the affected section |
| Wish or its status change | `.dsh/features/BACKLOG.md` | update status, date, commit/release |
| Version, wiring, environment change | `.dsh/STATE.md` | update |
| User-visible change | `CHANGELOG.md` (+ `README.md`) | Keep a Changelog entry |

A task is done only when all of these are true:

- the relevant suites pass and the exact command is recorded in the session log;
- `INVENTORY.md` reflects the new reality (new route, file, storage key, test);
- the BACKLOG item is closed (`done` / `dropped`) with date and commit;
- the session log states goal, changes, checks, and open threads;
- `CHANGELOG.md` / `README.md` are updated when the user can see the change.

"Done" without evidence (test output, route response, screenshot) is not done.

## 3. Architecture in one screen

| Path | Role |
|---|---|
| `index.js` | host entry: `name: 'qols'`, `inject: ['webServer']`, registers every feature |
| `features/index.js` | the single feature registry (order: auto, catalog, diagnostics, usage, studio, liked) |
| `features/health.js` | registration outcomes + cheap per-feature checks for the diagnostics report |
| `features/*-host.js` | small host features (catalog, diagnostics) |
| `features/auto/` | router, heuristic, judge, journal, settings, tiers, adapter, routes |
| `features/usage/` | own token meter over `llm/stream`, USD prices, peak schedule, ledger, balance cache, routes |
| `features/studio/` | studio host: skill/rule roots and text parse/serialize, command registry and live registration into `ctx.commands`, the `qols:rules` prompt section, agent presets read through `agentPresets` + patch snippet builder |
| `features/util.js` | shared host helpers (`json`, `readJsonBody`, `query`, `dshHome`, `qolsStorage`) |
| `client.js` | browser bundle: classic script, React via injected `require`, registers slots |
| `cordis.patch.yml` | the bundle's single loader row (`qols`) |
| `locale/{en,ru}.json` | market metadata; the client carries its own UI dictionaries |
| `suites/` | one standalone script per behavior, each prints a `… PASSED` marker |
| `test/run.test.mjs` | runs every suite in its own process |
| `market/index.json` | optional self-hosted Discover index, built by `scripts/build-index.mjs` |

Host code is plain ESM in Node. Client code is evaluated as a classic script: no `import`, no
Node APIs, and it must be safe to evaluate twice (the loader may re-run it).

## 4. Hard constraints

- Node `>=22`, ESM only; one runtime dependency is allowed: `@deepseek-ai/schemastery` (for `Config`).
  Do not add another runtime dependency without updating `package.json`, the lockfile and this line.
- `engines.dsh` stays `>=0.2.0-rc.2 <0.3.0-0` unless the user explicitly widens it.
- Every HTTP route is `kind: 'exact'`, method-checked, and answers JSON through `features/util.js`.
  Adding a route means updating `INVENTORY.md` and a suite.
- Browser state is fetched from the host. Do not duplicate data between host and client; serve it
  (`/api/dsh-qols/catalog` exists for exactly this reason).
- Persistent data lives under `<DSH_HOME>/storages/qols/…` (default `~/.dsh`). Never store prompt
  text, tokens, or other user content in logs; the Auto journal stores a truncated SHA-256 instead.
- Register features and slots inside `ctx.effect` / `ctx.slots.inject` so they dispose on reload.
- One capability = one feature module in `features/index.js` + one catalog entry with `en` and `ru`.
- Do not bump the version, publish, tag, or push unless the user asks.
- Keep the package lean: new shipped files must be listed in `files` in `package.json`; never commit
  `*.tgz`.
- `.dsh/` is local working memory and is git-ignored in the public repository. Never put secrets,
  tokens, private URLs, or personal paths in it; if a sanitized subset is ever published, review
  every entry first. `AGENTS.md` and the source are the public contract.

## 5. Verification

```powershell
npm test                          # all suites, isolated processes
node suites/qols-auto-host.mjs    # one suite while iterating
npm run pack:check                # what would ship
```

In the DSH Windows sandbox, `node --test` can fail with `spawn EPERM` because child stdio pipes are
blocked. Run the suites directly (`node suites/<name>.mjs`); the exact loop is in `STATE.md`. Do not
treat that EPERM as a product failure.

## 6. Log formats

Session log: goal, context read, changes, checks with results, errors and dead ends, decisions,
open threads, bookkeeping checklist. Keep it short and link to files by path, with line numbers when
they matter.

Lesson entry:

```markdown
### L-00N — short title

- Дата: YYYY-MM-DD
- Симптом: what was observed (exact error text when there is one)
- Причина: root cause
- Правило: what to do instead
- Где: files/lines, commit, or session log
```

Number lessons sequentially; never delete one — mark it `устарело` and say why.

## 7. Кратко по-русски

Перед работой прочитай `.dsh/STATE.md`, `features/INVENTORY.md`, `features/BACKLOG.md`,
`lessons/LESSONS.md` и последний лог сессии. Во время работы пиши в лог сессии сразу, а не по
памяти. После работы прогони тесты, обнови `INVENTORY`/`BACKLOG`/`CHANGELOG` и допиши лог. Новую
хотелку пользователя сначала занеси в `BACKLOG`, потом делай. Ошибки и поправки пользователя — в
`LESSONS.md`, чтобы не повторять их в следующих сессиях.
