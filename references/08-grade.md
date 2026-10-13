# Phase 08 — Grade (`ods-capture.js` lifecycle + adversarial verdicts)

Every page gets a design verdict per theme. `ods-capture.js` manages the bookkeeping (which grades
are still valid, which pages are pending); the **agent does the looking** — there is no browser and
no screenshot oracle here. Grading uses an **adversarial** model: find what is wrong, not what is nice.

Announce: `Sync-DSH: grade — <n> pages pending`.

## Cells and verdicts
Each page has exactly two cells: `light` and `dark`. The agent writes
`.design-sync/.cache/review/<slug>.grade.json` (`slug` = page rel, `/`→`__`, minus `.html`):

```json
{ "cells": {
    "light": { "verdict": "good", "score": 8, "note": "tokens applied, layout whole" },
    "dark":  { "verdict": "needs-work", "score": 5, "note": "card bg stays white — --surface not themed",
               "issues": [{ "severity": "major", "desc": "card bg not themed", "fix": "apply --surface to card" }] }
} }
```

Verdicts are `good` | `needs-work`, always with a note. **Score** is 1-10 (10=indistinguishable from production).
**pass = score>=7 AND no critical issues AND no major issues.**

## 5-axis rubric (adversarial)

Grade ADVERSARIALLY — find what is wrong, not what is nice:

1. **THEME** — DS tokens visibly applied in BOTH themes; dark is not an identical fallback of light.
   Any element stuck in the other theme = critical.
2. **RTL** — Logical CSS properties, Hebrew RTL everywhere, no LTR leakage.
   LTR leakage = major.
3. **FIDELITY** — Does it look like real production shadcn/ui, or like an AI mock?
   Missing sections, placeholder text, broken layout = major.
4. **COMPLETENESS** — Nav present, links present, no missing sections or stubs.
   Missing sections = major.
5. **POLISH** — Spacing, alignment, typography, color consistency.
   Minor polish issues = minor.

Grade from the **actual rendered artifact** — the `od-bundle/` HTML on disk and/or the OD
`previewUrl` — never from memory of the source. `ods-capture.js` prints, per pending page, exactly
what to read and where to write the grade.

## Grade validity tracks the source slice (carry-forward / clear)
Grade identity is the page rel; grade validity is keyed to the page's **source slice**
(`sourceKeys` → `gradeKey`), so styling/pipeline churn never clears grades — only source or
config-slice changes do:

- Source (or per-page override) changed → capture DELETES the grade (`grade cleared (contract
  changed)`) and the page is pending again.
- Source unchanged + both cells `good` → `carried forward`, nothing to do.
- `--force` clears grades regardless — **systemic use only** (e.g. the rubric itself changed),
  never as a shortcut.
- Sidecar stamped by a different `KEY_RECIPE` → stamped keys are ignored and grades key off the
  rendered bytes until the next full sync re-anchors.

Full runs (no `--pages`) also prune review files for pages that no longer exist and warn
`[LEARNINGS_UNMERGED]`. Scoped runs (`--pages a,b`) never prune and never warn-scan.

## Solo-first, then fan out
Grade the entry page plus one content-heavy page YOURSELF first. This catches systemic problems
(un-themed tokens, broken runtime, config-level mistakes) before a wave of subagents wastes work on
them. Only then dispatch grading waves for the remaining pending pages.

## Adversarial grading with subagents

### Grader prompt template
```
You are a HARSH design reviewer. Read the page at <path>.
Judge ADVERSARIALLY — find what is wrong, not what is nice:
1. THEME — any element stuck in the other theme = critical
2. RTL — LTR leakage = major
3. FIDELITY — does it look like real production shadcn/ui, or like an AI mock?
4. COMPLETENESS — missing sections, placeholder text, broken layout
5. POLISH — spacing, alignment, typography, color consistency
score 1-10 (10=indistinguishable from production)
pass = score>=7 AND no critical issues AND no major issues

Return VERDICT: { page, theme, score, pass, issues[{severity, desc, fix}] }
```

### Consistency judge
After all per-page graders finish, a **cross-page consistency judge** reads all verdicts and
screenshots (if available). Checks:
- Brand lockup identical across pages
- Active-nav styling consistent
- Header hierarchy consistent (one 3.5rem header)
- Typography consistent
- Color usage consistent

The judge writes `.design-sync/.cache/review/consistency.json`.

### Grade→Fix→Re-grade loop (3 rounds max)

**Round 1:** Grade all pages (10 graders + consistency judge).
- Split verdicts per page into `.design-sync/specs/fixes-<page>.json`.
- If all pass → done. If any fail → proceed to fix.

**Round 2:** Fix (5 parallel fixers, 1 per page).
- Each fixer reads `fixes-<page>.json` and applies surgical edits.
- **Cross-page rules** (all pages converge):
  - Brand lockup identical everywhere
  - Subtle active-nav styling
  - One 3.5rem header
  - **BIDI RULE**: every Latin/token/number-range in Hebrew text wrapped in `<span dir="ltr">`
- After fix: re-render, re-verify, reshoot all pages.
- Re-grade all pages (fresh graders, new run).
- If all pass → done. If lone failures remain → surgical fix by main agent.

**Round 3:** Targeted regrade of failed pages only.
- Main agent fixes the lone failures surgically.
- Re-grade only the failed pages.
- Exit condition: every shot pair `pass = score>=7 AND no critical AND no major`.

**After each round:** Fold `learnings/*.md` into `NOTES.md`, delete learnings files.

## SUBAGENT HARD RULES
1. A subagent may write in exactly two places: the `.design-sync/.cache/review/*.grade.json` files
   for its assigned pages, and its own `.design-sync/learnings/<BATCH_ID>.md` — config/NOTES belong
   to the orchestrator alone.
2. ods-build/ods-validate/ods-resync are off-limits to subagents; the single command a subagent may
   run is `node .ds-sync/ods-capture.js --out ./od-bundle --pages <theirs>`.
3. No verdict goes on a page whose rendered output was not read during the current iteration.
4. One root cause surfacing on 2+ pages — or on a single page but config-level → halt those pages,
   file a `[GENERAL]` learning, and leave the config fix to the orchestrator.

## Between waves (orchestrator)
Fold every `learnings/*.md` into `NOTES.md`, then DELETE the files — any surviving learnings file
makes `[LEARNINGS_UNMERGED]` fail the driver verdict. Apply config-level fixes (overrides, token
sources), rebuild via the driver, re-capture, dispatch the next wave.

## DONE-gate
Every page's cells `good` (or explicitly user-deferred), no `[LEARNINGS_UNMERGED]`, and the report
`.design-sync/reports/08-grade.md` exists. **Confirm by re-running** `node .ds-sync/ods-capture.js
--out ./od-bundle` — the gate is met only when it prints **0 pending** (the first-run output still
shows the pages as pending until their `.grade.json` verdicts exist).
