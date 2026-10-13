# Phase 07 — Validate (`ods-validate.js` gate over `od-bundle/`)

Static gate over the built bundle: no browser, no deps — regex + fs checks per page, the four
entry checks shared with `ods-verify.js` (`runChecks`), and a freshness recompute against
`_ods_sync.json`. Writes `od-bundle/.render-check.json` and exits non-zero on any bad page or
fatal tag; **warns alone exit 0**.

Announce: `Sync-DSH: validate — od-bundle/`.

```
node .ds-sync/ods-validate.js ./od-bundle --config .design-sync/config.json
```
`--config` optional (default `.design-sync/config.json` under cwd); no config → no overrides.

## Tag table
| Tag | Kind | Meaning | Fix |
|---|---|---|---|
| `[SYNC_STALE]` | fatal | a page on disk no longer matches the sidecar's renderHash — the bundle was edited after build | **rebuild; never upload over this.** Run the driver (`ods-resync.js`) so sidecar + diff describe the real bundle |
| `[ODSCARD_MISSING]` | bad | first line is not `<!-- @odsCard page="<rel>" -->` | re-run the build (05 stamps markers); never hand-type markers |
| `[OD_UNSAFE]` | bad | external `<script src>` survived | re-render (05's odSafe strips scripts); find where the tag re-entered |
| `[RUNTIME_MISSING]` | bad | entry lacks `ODS_RUNTIME` (theme/menu toggles dead in OD) | re-render via the build; the runtime is injected, never hand-pasted |
| `[LINK_BROKEN]` | bad | internal `<a href>` resolves to no bundle file (after dir→`index.html` normalization) | fix the source link or `cfg.exclude` that dropped the target; rebuild |
| `[EMPTY_BODY]` | bad | page has no visible body text | fix the source page or exclude it; a blank card is never shippable |
| `[RENDER_THIN]` | warn | visible text < 40 chars | triage: real page → fix source; intentional (splash, redirect) → `overrides.<rel>.thinOk` + record in NOTES.md **"Known render warns"** |
| `[VARIANTS_IDENTICAL]` | warn | page is themed but dark tokens deep-equal light and its css closure has no dark selector | check phase 02 dark extraction (missing `.dark` / `[data-theme="dark"]` block?); truly single-theme → `overrides.<rel>.variantsOk` |
| `[CONVENTIONS_STALE]` | warn | conventions header names a `--token` absent from tokens.json (light and dark) | fix the token name, or propose a header edit via NOTES.md — the header file itself is never machine-rewritten |

Fatal also: missing/unparseable `.ods-build-meta.json`, missing/invalid `_ods_sync.json`, and any
false entry check (`links` / `odSafe` / `theme` / `effects` — same predicates as `ods-verify.js`).

## `.render-check.json`
`{total, bad, thin, variantsIdentical, iterations, entries:[{name, rel, bad, thin,
variantsIdentical, checks:{card,odSafe,links,theme,effects,runtime}, firstErr}]}`.
Presence contract: the gate **deletes any prior file up front and only writes on completion** — a
missing file after a run means the gate aborted on a fatal tag. `iterations` bumps per completed
run (prior+1, else 1); it is the self-heal loop counter.

## Self-heal loop
Fix → **rebuild** → re-validate, until exit 0 or **3 iterations**. Every fix goes to the phase the
tag names (source, config, extraction) — the rebuild re-derives the bundle from it. After 3
iterations still failing → `[!]` the box, record in NOTES.md, surface to the user.

- A warn not already recorded in NOTES.md's **"Known render warns"** list is NEW — triage it now
  (fix or override+record), don't let known-warn lists silently grow.
- **Never edit bundle HTML to fool the gate.** Hand-edits trip `[SYNC_STALE]` by design; the only
  path to a passing gate is fixing the phase the tag names and rebuilding.

## DONE-gate
Phase 07 is DONE only when `ods-validate.js` **exits 0** and `.render-check.json` shows `bad: 0`,
and the report `.design-sync/reports/07-validate.md` exists (counts + any overrides/NOTES entries
added this run).
