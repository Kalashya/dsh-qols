# Listing QoLs in the plugin market

The plugin market does not read repositories directly. It reads index URLs configured in the
harness (**Plugins → Discover → Index sources**), and each index is a format-1 JSON file that lists
installable bundles. A repository that is only pushed to GitHub is installable by explicit URL, but it
does not appear in Discover until an index lists it.

The community list [awesome-dsh-plugin/awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)
is a directory, not a built-in source. Its generated `plugins.json` can be used as an index only when
it follows the format below and is added as an index source; adding it is a separate manual step.

There are two independent steps, and they can be done in either order.

## 1. Make the repository installable (required for both)

- [x] Public repository with the package at its root (this repo).
- [x] `package.json` declares `dsh.bundle.patch` and a valid `engines.dsh` range.
- [x] No build step: the shipped files are the sources, so the market's
      build-script block does not apply.
- [x] `LICENSE`, `README.md`, `CHANGELOG.md`, tests that run with `npm test`.
- [ ] The repository is pushed and tagged (`v0.1.0`), so a release tarball exists.
- [ ] Optional: published on npm (`dsh-qols`), which the market prefers.

## 2. Open the pull request to the catalogue

1. Fork `https://github.com/awesome-dsh-plugin/awesome-dsh-plugin`.
2. In its `README.md`, add **one** bullet to the section that fits best — for QoLs that is the
   models/providers section, with the interface section as the alternative; use the exact heading the
   list uses today:

   ```markdown
   - [Kalashya/dsh-qols](https://github.com/Kalashya/dsh-qols) - An Auto model that picks the cheapest model and effort per task, session cost, and Prompt Studio for skills, commands, rules, agent presets and the global AGENTS.md.
   ```

3. Keep the entry to that single line: the list's CI derives `plugins.json` from the bullets, so no
   JSON needs to be edited by hand.
4. Open the PR against the list repository (not against the market plugin).

The list's reviewers check claims against the sources, so the description above deliberately mentions
only what the code does. Expect ~1 day after the merge before the market card shows up.

## 3. Optional: self-hosted index (visible immediately)

The harness can also read an index file directly — useful while the catalogue PR is open, or for a
private deployment.

```bash
node scripts/build-index.mjs   # writes market/index.json from package.json + git
git add market/index.json && git commit -m "market: refresh index" && git push
```

Then in the harness: **Plugins → Discover → Index sources → add**

```
https://raw.githubusercontent.com/Kalashya/dsh-qols/main/market/index.json
```

Rules the file satisfies, for reference: format `1`; `title` needs an `en` key; every version needs an
exact SemVer, an integer Unix `publishTimestamp`, and a source — either `{"type":"npm"}` or
`{"type":"git","url":"https://…","commit":"<40 hex>"}`; `engines.dsh` must be a SemVer range; the icon
is either an https URL, a relative path on the index's own origin, or an inline `data:` image up to
32 KiB.

## Checklist before submitting

| Check | Command |
|---|---|
| tests pass | `npm test` |
| only intended files ship | `npm pack --dry-run` |
| version bumped and changelog updated | `CHANGELOG.md` |
| tarball installs into a clean profile | `dsh plugin --profile test add ./dsh-qols-0.1.0.tgz` |
| the profile composes the plugin | `dsh --profile test --dump-config` shows the `qols` row |
| no secrets or local paths in the repo | `git grep -n -I -E 'C:[\\/]Users|/Users/|/home/|AppData|KALASH' -- ':!docs/market-submission.md'` |
