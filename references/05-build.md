# Phase 05 — Build (source → `od-bundle/` via `ods-build.js`)

Convert the codebase into a local, upload-ready bundle: copy the source subset, OD-safe render every page,
stamp first-line `@odsCard` markers, and emit the sync sidecar. **Nothing is written to OD here** — the
bundle is local; upload happens in 09 via the agent-bridged plan.

Announce: `Sync-DSH: build — <srcDir> → od-bundle/`.

## Staging (`.ds-sync/`)
Copy the skill's `scripts/` into the repo as `.ds-sync/` and run from there:
```
node -e "require('fs').cpSync('<skill>/scripts','.ds-sync',{recursive:true})"   # cross-platform; POSIX alt: cp -r <skill>/scripts/. .ds-sync/
node .ds-sync/ods-build.js --root <repo> --out ./od-bundle [--base <rawBase>] [--config <path>]
```
`--config` defaults to `<root>/.design-sync/config.json` — the file Phase 00 writes — so a
bootstrapped repo needs only `--root` and `--out`. An explicit `--config` still wins, which is what
`ods-resync.js` passes.
On **re-syncs, re-copy first** — a stale stage runs old code against new contracts. No npm install:
built-ins only. `.ds-sync/` and `od-bundle/` are gitignored (00-bootstrap wrote the lines).

## Shape the copy set BEFORE the first build

The copy set **is** the upload: Open Design receives every non-dot file in `od-bundle/`. So settle
these three config keys first — and settle them *now*, because `_hashes.js` folds `srcDir`, `exclude`
and `entry` into its `global` component: changing one after a build invalidates every hash and forces a
full re-upload.

| Key | What it decides | The trap |
|---|---|---|
| `srcDir` | the directory the bundle is copied from | absent ⇒ the **repo root**. That drags in virtualenvs, source backups, data dumps and logs, none of which are the site. `[SRCDIR_UNSET]` warns. |
| `exclude` | basenames dropped from the copy | **exact basenames, matched at any depth — there are no globs.** `"latest_data.json"` works; `"*.json"` does nothing. To drop a whole directory, name the directory. |
| `entry` | the page `ods-validate.js` treats as the entry (default `index.html`) | if the real home page is e.g. `betrieb.html`, say so. Otherwise validate checks a file the build invented, and `[RUNTIME_MISSING]` fires against the placeholder instead of your page. |

When no root `index.html` lands in the copy, the build writes its placeholder page (step 4 below). That
placeholder is a real page in the bundle and in the upload — name a real `entry`, or provide an index
deliberately, but do not let it arrive by accident.

`[BIG_COPY]` warns above 1,500 copied files and prints the size. A site bundle is in the hundreds, so a
four-figure set means `srcDir`/`exclude` are describing something other than the site.

## Flow (what the script does)
1. `loadConfig` — strict validation; any config problem is fatal here, not later.
2. Out-dir safety — refuses to wipe anything it did not build (see `[OUT_UNSAFE]`), then rm+recreate `--out`.
3. Ensures `.design-sync/signals.json` + `tokens.json` exist (runs detect/extract itself; `--refresh`
   forces a re-run).
4. Copies `cfg.srcDir` → out with the push excludes + `cfg.exclude`; writes the placeholder entry when no
   root `index.html` lands.
5. OD-safe renders every `.html` (css inlined from disk when a `--base`/cached `rawBase` exists; external
   scripts stripped; `ODS_RUNTIME` injected) and ensures each page's FIRST line is
   `<!-- @odsCard page="<rel>" -->`.
6. Emits `_ods_needs_recompile` (exact bytes `{"by":"sync-dsh"}`), `.ods-build-meta.json`, then
   `_ods_sync.json` **last** (renderHashes / sourceKeys / sourceHashes / styleSha / tokensSha via
   `_hashes.js` — never fork it).
7. Deletes any prior `.sync-diff.json`.

`--base` resolution: `--base` flag → `.design-sync/.cache/od-project.json` `rawBase` → absent (base-dependent
link rewrites are skipped; render safety still applies).

## Error tags (stderr, exit 1)
| Tag | Meaning | Fix |
|---|---|---|
| `[CONFIG]` | config missing / bad JSON / unknown key | fix `.design-sync/config.json` (schema in 00-bootstrap) |
| `[OUT_UNSAFE]` | `--out` is `/`, `$HOME`, cwd, or a non-empty dir without `.ods-build-meta.json` | point `--out` at a fresh or previously-built dir; never at user data |
| `[ZERO_MATCH]` | `srcDir` missing or the copy produced zero files | fix `cfg.srcDir` / `cfg.exclude` |

Two of these are **warnings** (stderr, exit 0) — the build proceeds, because a large copy set can be
legitimate, but nothing downstream will ask again:

| Tag | Meaning | Fix |
|---|---|---|
| `[SRCDIR_UNSET]` | `cfg.srcDir` is absent, so the whole root is being copied | set `srcDir` to the directory that holds the site |
| `[BIG_COPY]` | more than 1,500 files copied, with the size | check `cfg.srcDir` and `cfg.exclude` before uploading |

## `od-bundle/` layout
Uploaded (every non-dot file): rendered `.html` pages (marker first line), `.css`, assets,
`_ods_needs_recompile`, `_ods_sync.json` (anchor — uploaded absolutely last in 09).
**Stays local** (dot-prefixed, never in the upload plan): `.ods-build-meta.json`, `.sync-diff.json`,
`.render-check.json`, `.resync-verdict.json`, `.upload-plan.json`.

## Bare build vs driver
A bare `ods-build.js` run **wipes `.sync-diff.json`** — the diff no longer describes the bundle on disk.
Therefore the session's FINAL build must always be the driver (`ods-resync.js`), which rebuilds and
regenerates the diff in one pass. Bare builds are for iteration only.

## DONE-gate
Phase 05 is DONE only when `od-bundle/` exists with a marker on every page, the sentinel with exact bytes,
`.ods-build-meta.json`, `_ods_sync.json`, and the report `.design-sync/reports/05-build.md` exists. A bundle
missing its sidecar is NOT done.
