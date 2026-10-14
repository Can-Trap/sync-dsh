# Phase 03 — Build the OD design system (`DESIGN.md` + `tokens.json`)

> **Mode B** (design system). Runs in Mode B and in the default BOTH; skipped when the user asked only for a project (Mode A).

Write the Open Design design-system entry from the extracted tokens. The `DESIGN.md` MUST carry the
capability sections the skill guarantees — Color, Links, Navigation, Effects/Motion, Theme — and every
one of them must be **true of the tokens that were extracted**.

Open Design reads `DESIGN.md` as agent instructions, so a wrong sentence here is work done wrong
downstream. The rule is: state what the tokens prove, and say so plainly when they prove nothing. A
single-theme system gets a Theme section that SAYS it is single-theme — never a dark-mode paragraph the
system cannot honour.

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
`DESIGN.md` sections: the conventions header (when configured — see below), **Color Palette & Roles**,
**Theme**, **Links**, **Navigation**, **Effects & Motion** (respect `prefers-reduced-motion`), and an
**Agent Prompt Guide** ("use the closest existing token; never invent hex").

What each part is derived from — the script will not write a claim it cannot source:

| Part | Source of truth |
|------|-----------------|
| Light swatches | the literal colour values in `tokens.json` |
| Bindings & non-colour tokens | every other value: a `var(--…)` entry is printed as an **alias**, never as a swatch, and lengths / font stacks / numeric lists are labelled for what they are |
| **Theme** | a comparison of `light` against `dark`. They differ ⇒ both palettes are named and `[data-theme="dark"]` is documented. They are identical, or `dark` is absent ⇒ the section says the system is **single-theme**, that the runtime has nothing to switch to, and that a dark variant must not be invented |
| Links / Navigation / Effects | standing house conventions, labelled in the file as conventions for NEW work — not as observations of the existing pages |

Pass `--signals .design-sync/signals.json` to let the Theme section also report what `ods-detect.js`
saw in the source (`theme.system`, `hasLight`, `hasDark`). Without it the section claims nothing about
CSS it never read — which is the point.

## The conventions header (`.design-sync/conventions.md`)
Authored **BEFORE upload**, and ONLY when `.design-sync/conventions.md` does not already exist.
An existing file is **NEVER rewritten** by you or the machine — instead re-validate the names it
mentions against the fresh `tokens.json` and propose edits via a `NOTES.md` bullet.

Content — four concerns, adapted to OD, budget **2–4k chars**:
1. **Theme setup** — how theme switching works in the rendered bundle: `ODS_RUNTIME` sets
   `data-theme` on `<html>` and persists it under `ods-theme`, and `[data-theme-toggle]` flips it.
   Then say what it switches TO in this system. If the tokens define no dark variant, the header says
   the system is single-theme and that dark is unreachable — it does not describe a dark mode.
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
Navigation, Effects, Theme** headings, `tokens.json` sits beside it, the conventions header (when
configured) appears before the Color section, and the report `.design-sync/reports/03-design-system.md`
exists.

Missing any capability section = NOT done. **A false claim is also NOT done**: the Theme section must
match `tokens.json`. When `dark` is absent or identical to `light`, the section must say the system is
single-theme and that dark is unreachable — a `DESIGN.md` promising a dark variant the tokens do not
define is a defect, not a formality, because Open Design acts on what it reads. Check it against the
token file before committing.
