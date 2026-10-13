# Phase 03 — Build the OD design system (`DESIGN.md` + `tokens.json`)

> **Mode B** (design system). Runs in Mode B and in the default BOTH; skipped when the user asked only for a project (Mode A).

Write the Open Design design-system entry from the extracted tokens. The `DESIGN.md` MUST carry every
capability the skill guarantees: Color (light+dark), Links, Navigation, Effects/Motion, and a Theme
mechanism (`[data-theme]` + `prefers-color-scheme`).

Announce: `Sync-DSH: design-system — <name>`.

## Command (consumes `tokens.json` from Phase 02)
```
node <skill>/scripts/ods-build-design-system.js \
  --id <slug> --tokens .design-sync/tokens.json --name "<Display Name>" \
  --config .design-sync/config.json
```
Writes `<odDataRoot>/design-systems/<id>/DESIGN.md` + `tokens.json`. In tests/sandboxes pass
`--data-root <dir>` to override `odDataRoot()`. `--config` is optional: when the config's
`readmeHeader` points at an existing file, its content is prepended **verbatim** into `DESIGN.md`
right after the title line (the conventions-header slot), before `## Color Palette & Roles`.

## What the script writes (do not hand-author)
`DESIGN.md` sections: the conventions header (when configured — see below), **Color Palette & Roles**
(Light + Dark swatches), **Theme** (`:root` = light, `[data-theme="dark"]` +
`@media (prefers-color-scheme: dark)` = dark, `[data-theme-toggle]` flips + persists to localStorage),
**Links**, **Navigation**, **Effects & Motion** (respect `prefers-reduced-motion`), and an
**Agent Prompt Guide** ("use the closest existing token; never invent hex").

## The conventions header (`.design-sync/conventions.md`)
Authored **BEFORE upload**, and ONLY when `.design-sync/conventions.md` does not already exist.
An existing file is **NEVER rewritten** by you or the machine — instead re-validate the names it
mentions against the fresh `tokens.json` and propose edits via a `NOTES.md` bullet.

Content — four concerns, adapted to OD, budget **2–4k chars**:
1. **Theme setup** — how the `data-theme` attribute + localStorage toggle works on `<html>`, and
   what breaks without `ODS_RUNTIME` (no persistence, no toggle, dark variant unreachable).
2. **The styling idiom** with this DS's ACTUAL token vocabulary — real `--token` names read from
   `tokens.json`, never invented ones.
3. **Where truth lives** — `tokens.json` (values) + the `DESIGN.md` sections (roles/rules).
4. **One idiomatic snippet** using real tokens (e.g. a card or button styled purely via `var(--…)`).

Wire it via the config key `readmeHeader` (usually `".design-sync/conventions.md"`).

### Validation gate before commit
Every token/selector the header names must exist in the built artifacts — `ods-validate.js`
enforces this with `[CONVENTIONS_STALE] <name>` warns. Fix names (or propose a header edit via
NOTES.md) before committing.

### THE REBUILD RULE
After authoring or changing the header, the next build MUST be a fresh `ods-resync.js` **driver**
run — never a bare `ods-build.js` — so the receipt and upload describe the header-bearing build.

### Commit at authoring time
Commit `conventions.md` + the `readmeHeader` config change together, the moment they are authored
(they are part of the durable set).

## Reload caveat (tell the user)
OD loads the design-system catalog **at startup**. After this script runs, the DS will not appear in the OD
picker until Open Design is reloaded. The script prints this notice — surface it in your report.

## DONE-gate
Phase 03 is DONE only when `design-systems/<id>/DESIGN.md` exists and contains the **Color, Links,
Navigation, Effects, Theme** headings plus a `data-theme` reference, `tokens.json` sits beside it,
the conventions header (when configured) appears before the Color section, and the report
`.design-sync/reports/03-design-system.md` exists. Missing any capability section = NOT done.
