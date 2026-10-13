# Phase 01 — Detect (scan the codebase → `signals.json` + shape)

Everything downstream derives from this. Detect the stack, **shape**, token sources, component dirs, app
entry, the theme mechanism, nav, and whether effects exist.

Announce: `Sync-DSH: detect — scanning <repo>`.

## Command
```
node <skill>/scripts/ods-detect.js --root <repo> --out .design-sync/signals.json
```
The script walks the repo (skipping `node_modules`, dotfiles, `dist`, `out`), reads CSS/SCSS + the package
manifest, and writes `signals.json`. You do not hand-author it — you run it and read the result.

## Output shape (`signals.json`)
```json
{ "stack": ["tailwind","next","css-vars"], "tokenSources": ["app/globals.css"],
  "componentDirs": ["/components/ui"], "appEntry": "app/page.tsx",
  "theme": { "system": "next-themes|class-dark|media|none", "hasLight": true, "hasDark": true },
  "nav": ["/components/nav.tsx"], "effects": true, "shape": "static" }
```

## Shape (`static` | `app`)
- **`static`** — `<root>/index.html` exists: the repo is already page-shaped; bundle pages map 1:1 to
  source files (per-page `sourceKeys` become possible).
- **`app`** — framework source: pages come from copy + render and may have no direct source file
  (`sourceKeys` fall back to `null`; the diff keys off `renderHashes`).

## Config record rule
If `.design-sync/config.json` exists, parses, and has no `shape`, detect merges the detected shape into it.
A user-pinned `shape` in the config is **never overwritten** — the config wins everywhere downstream
(`ods-build.js` resolves shape as config → signals → root `index.html` check).

## What to read from it
- `stack` → drives which extractor path matters (tailwind `@theme` vs css-vars vs token-file).
- `shape` → drives sourceKey mapping in 05-build and the diff's key mode.
- `tokenSources` → 02-extract scans exactly these first (pin them here to scope extraction).
- `theme.system` + `hasLight`/`hasDark` → confirms both themes are reachable (a capability guarantee).
- `nav` / `effects` → the nav + effects capabilities you must preserve through render.

## DONE-gate
Phase 01 is DONE only when `.design-sync/signals.json` exists with a non-empty `stack` (or an explicit
`unknown`) AND a `shape`, the shape is recorded in `.design-sync/config.json` (merged or user-pinned), the
report `.design-sync/reports/01-detect.md` exists, and the file parses as JSON. A missing or empty
`signals.json` is NOT done.
