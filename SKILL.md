---
name: sync-dsh
description: "Sync any codebase to your self-hosted Open Design MCP AND/OR extract its design system, script-driven so even a weak local model runs the whole pipeline one bite-sized phase at a time — build a local od-bundle/ of OD-safe pages, upload via an agent-bridged plan (anchor last), grade light+dark, pull designer edits back through managed blocks. Triggers: sync-dsh, /sync-dsh, sync codebase to Open Design, create OD project/design system for a weak model."
license: MIT
metadata:
  author: Trap
  version: '0.1.0'
---

# Sync-DSH

Push **any codebase to your self-hosted Open Design (OD)** as a project and/or a design system, and keep
them in sync **both ways** — over the **Open Design MCP** (`mcp__open-design__*`). **Bundled scripts do the
mechanical work**; you run ONE phase at a time and check disk between each. Built so the **most incapable
model** still finishes the run: do exactly what the current phase says, then re-read disk, then do the next.

> **FOR A WEAK MODEL — read `references/RUNBOOK.md` and follow it literally.** It restates this whole file
> as numbered, copy-paste steps with no judgement calls. This SKILL.md is the map; the RUNBOOK is the road.

## The one idea (three sources of truth)

- **The codebase** is the source of truth for *what the design should be*.
- **`.design-sync/` on disk** is the source of truth for *what it currently is* (state, config, grades, reports).
- **Open Design** is *where the design lives and is edited*.

You never write into the OD project directly. You **build into a local `od-bundle/`** (OD-safe pages, each
with a first-line `<!-- @odsCard page="…" -->` marker, plus a sentinel `_ods_needs_recompile` and the
`_ods_sync.json` **anchor**). A script prepares an **upload plan**; **YOU** execute it over the OD MCP in a
fixed order; a script verifies the result. Facts that come FROM OD (`projectId`, `resolvedDir`, `previewUrl`,
`rawBase`) are fetched by **you** via the OD MCP and passed **into** the scripts. **Scripts NEVER call MCP.**

**OD is not Claude Design.** There is **no `render_preview`** (grading reads the on-disk `od-bundle/` HTML or
the one persistent `previewUrl` — never a freshly minted screenshot) and **no etag** (every `write_file` is a
**single, unconditional** overwrite). If DesignSync MCP is available, it provides `finalize_plan` and batch
`write_files`; otherwise the agent reads `.upload-plan.json` manually and calls `write_file` one at a time.
The **anchor sequence is the only integrity mechanism.** Do not hunt for tools that do not exist
(`references/mcp-contract.md` lists the real surface).

## Two modes (separated options) — see `references/modes.md`

- **Mode A — PROJECT sync.** Turn the codebase into an OD **project**: build `od-bundle/` OD-safe pages,
  upload, grade, keep in sync. This is the app/site path.
- **Mode B — DESIGN-SYSTEM sync.** Extract the **design system**: `DESIGN.md` + tokens (**light + dark**).
  This is the token/DS path.
- **Default when the request doesn't say = BOTH** (Mode B then Mode A).

`references/modes.md` is a **decision table** (request phrase + `config.shape` → mode) and tells you, per mode,
**exactly which of phases 00–09 run vs skip** over the **same scripts**. Read it once at the start of a run.

## Golden rules (these prevent every known failure — do not soften them)

1. **RUN scripts, don't hand-write.** Never type a `signals.json`, token map, SHA, OD-safe HTML, or managed
   block by hand — call the script. Scripts live in this skill's `scripts/`; stage them into the repo as
   `.ds-sync/` (phase 05) and run `node .ds-sync/<name>.js`.
2. **COPY templates, don't invent.** The scripts emit the exact `DESIGN.md`, page HTML, sidecar, and block
   shapes. Don't describe capabilities the DS doesn't carry or paths OD didn't give you.
3. **One phase at a time.** Work `.design-sync/tasks/INDEX.md` top-to-bottom; after each write
   `.design-sync/reports/<id>.md` (what you did + artifact paths + evidence), then flip `[ ]`→`[x]`.
4. **A phase is DONE only when its REAL artifact exists at its REAL path AND its DONE-gate passes.** A plan,
   a table, or a `.json` stub is **NOT** done. Every gate is in `references/NN-*.md`.
5. **Never clobber.** Pull writes ONLY inside `design-sync:start:<name> … design-sync:end:<name>` blocks;
   human text around them is preserved byte-for-byte. **The review exit-2 is mandatory before any `--apply`.**
6. **Derive only; invent nothing.** Every token, color, and path traces to the codebase this run or to an OD
   MCP response. **Never invent a hex outside the extracted palette; never guess `resolvedDir`.**
7. **The verification partition never decides what ships.** The diff has TWO partitions: verification (which
   pages need re-grading) and upload (`sourceHashes` — which files ship). The plan always writes everything
   (idempotent full writes); `upload.any` / `deletePaths` drive skip/deletes only.
8. **The anchor uploads absolutely last**, in its own call, only after every content write and delete
   succeeded. Any uncleared failure mid-upload → **STOP: no re-arm, no anchor.** Anchor-less is exactly where
   a failed run should land — the next sync re-checks every page. Stamping a new anchor onto a partially
   landed upload is damage no later run can undo.
9. **Never fork `scripts/_hashes.js`.** It is the single source of truth for every sync hash. Whenever a
   hash's inputs change, the **`KEY_RECIPE` bump ships in that very commit** — keeping the number while the
   hashed bytes shift silently flips every stored key and mass-clears grades.
10. **The durable set is committed.** Everything under `.design-sync/` NOT gitignored (`config.json`,
    `NOTES.md`, `conventions.md`) is committed; a user correction persists to it IMMEDIATELY (config field
    if one fits, else a `NOTES.md` bullet), never only in conversation.

## Invariants (I1-I8) — the process skeleton

These invariants hold across all modes and shapes. Violating any of them causes silent corruption.

| ID | Invariant |
|---|---|
| I1 | Pin `projectId` in `.design-sync/config.json` at settlement, BEFORE any upload |
| I2 | Pre-run pin ⇒ atomic path always; no pin ⇒ remote `list_files` decides (empty→incremental, non-empty→atomic) |
| I3 | Incremental: `finalize_plan` approval precedes all uploads; nothing uploads until first batch passes the sub-skill done-bar |
| I4 | Sentinel fence: first push + close-out write `_ods_needs_recompile` FIRST; every push re-writes it at the end |
| I5 | Close-out order fixed: sentinel → all content writes except anchor → reconciliation deletes → sentinel re-arm → anchor last, alone, in its own `write_file` call |
| I6 | The anchor may only vouch for a fully-applied state; written after deletes succeed |
| I7 | `ods-validate.js` clean + every page graded before upload |
| I8 | Conventions validation gate: every enumerated name verifies against built artifacts before commit |

## STOP conditions (S1-S3) — when to halt

| ID | Condition | Action |
|---|---|---|
| S1 | Unretryable write/delete during upload | **STOP** — no re-arm, no anchor. Next sync re-checks everything. |
| S2 | Denied approval/creation prompt | **STOP** and ask; never continue silently |
| S3 | Mid-run abort on incremental path | Safe by design — project ends up un-anchored (the intended failure state) |

## Never-do rules (N1-N9) — forbidden shortcuts

| ID | Rule |
|---|---|
| N1 | Never offer existing project for first import |
| N2 | Never drop `projectId` from config once pinned |
| N3 | Never edit `lib/*.mjs` when a config override exists (config over code) |
| N4 | Never link `_ods_bundle.css` outside `styles.css`'s `@import` closure |
| N5 | Never rewrite existing `conventions.md` (validate + propose via NOTES.md) |
| N6 | Never fall back to `shape='app'` just because `.storybook` isn't at root |
| N7 | Never skip persisting a user correction (Golden rule 10) |
| N8 | Never ship a reimplementation (the bundle is the repo's own compiled `dist/`) |
| N9 | Post-authoring rebuild must be a fresh driver run (`ods-resync.js`) |

## DS-attach deferral

OD loads the design-system catalog at startup. When creating a project with `designSystem` attached,
the first call may fail with `DESIGN_SYSTEM_NOT_FOUND` (HTTP 400). **Retry without the DS parameter;**
attachment is deferred to the next OD reload. Log the deferral in NOTES.md so the close-out report
includes the "reload OD to see DS in the picker" caveat.

## Run classification (config settles it — believe it)

Read `.design-sync/config.json` first (`references/00-bootstrap.md`):

- config exists **with `projectId`** ⇒ **re-sync run.** A prior session settled the OD project. One driver
  command: fetch the remote anchor (`get_file("_ods_sync.json")` → `.design-sync/.cache/remote-sync.json`),
  run `ods-resync.js … --remote …`, upload only what changed. Never re-create the project, never drop the pin.
- config exists **without `projectId`** ⇒ first-time run that never reached settlement (04) — resume from the
  lowest unchecked task; keep every recorded config field (`overrides`, `exclude`, `tokenSources`, `shape`,
  `mode` are paid-for decisions; never re-derive).
- No config ⇒ fresh first-time run; `ods-init.js` writes `{projectName}` and seeds everything.

The **mode** (A / B / both) is settled the same way: from `config.mode` if present, else from the request via
`references/modes.md`, then written into config so it never has to be re-decided.

## Project settlement (04) — precedence + pin-at-settlement (Mode A / both)

Strict order, stop at the first rung (`references/04-project.md`): **pinned** (config `projectId` →
`get_project`, confirm alive; re-ask only if gone) → **fresh** (`list_projects` for a free name →
`create_project`; denied → STOP and ask) → **re-adopted** (never unprompted — the user must have explicitly
asked to sync into an existing project, and must first hear a plain "syncing may replace or remove files in
that project" warning). **The moment the target is decided, write `projectId` into `.design-sync/config.json`
— no upload may happen until that pin exists** — and cache `{projectId, resolvedDir, previewUrl, rawBase}` in
`.design-sync/.cache/od-project.json` for the scripts. `previewUrl` comes from `get_project` **once**; reuse
it (there is no `render_preview`). Mode B alone **skips 04** entirely (see `references/modes.md`).

## Autonomy — run the whole thing in a LOOP, never stop until DONE

On a sync / "create OD project|design system" request (or **no task**), **act — don't present a "1/2/3" menu
and wait.** Run the pipeline end-to-end with default decisions (**mode = both** unless the request/config say
otherwise; the one-driver re-sync flow on a known repo), continuing across phases **without asking "should I
continue?"**. Asked to **sync but no `.design-sync/` exists → bootstrap first** automatically. It is safe
because every write is reversible (managed blocks + gitignored state + idempotent scripts + the un-anchored
abort state): **do the work and report at the end.** Pause only to (a) give the one plain-language upload
approval, (b) approve a secret-bearing write, or (c) show a pull diff before `--apply`.

**The loop is mandatory. You are FORBIDDEN to stop mid-run.** You do not end your turn after one phase, hand
back "to confirm", or summarize-and-wait. You keep looping until the **DONE condition** holds. The only
interrupts: the three approvals above, or the same phase failing its gate **3 times** (then log the blocker to
`.design-sync/JOURNAL.md`, mark the phase `[!]`, and continue with the rest — don't abort the whole run).

```
DONE  ⇔  (1) every box in .design-sync/tasks/INDEX.md is [x]                              AND
         (2) the session's FINAL driver run (ods-resync.js) printed a verdict ok:true      AND
         (3) node .ds-sync/ods-upload-verify.js --plan … --remote …   exits 0              AND
         (4) node .ds-sync/ods-manifest.js drift                       prints "clean".
Until all four hold, you have more work to do — pick the next unchecked phase and keep going.
```

(For a **Mode B–only** run there is no upload/manifest, so parts 2–4 collapse to "the 03 DONE-gate passed";
`references/modes.md` states the reduced DONE for each mode.)

## The happy path — a re-anchoring LOOP (run until DONE)

```
0. Announce ONE line:  Sync-DSH: bootstrap — <repo>.   Then GO.
1. node <skill>/scripts/ods-status.js            # rehydrate: state + next phase
   #  "fresh project" ->  node <skill>/scripts/ods-init.js --project <name>

2. LOOP  (repeat — do NOT stop between iterations):
   a. RE-ANCHOR: node <skill>/scripts/ods-status.js   # disk is truth — read the next [ ] phase fresh
   b. No next [ ] phase -> go to step 3 (finish).
   c. Take that ONE phase from the table below (skip phases modes.md says this mode skips).
   d. Do it: run its script (or, for 04 + the upload, the OD MCP calls) into the REAL path.
   e. Write .design-sync/reports/<id>.md   (what you did + artifact paths + evidence).
   f. Run the phase's DONE-gate (its script exit / the verdict):
        - pass -> flip [ ]->[x] in tasks/INDEX.md, append one line to .design-sync/JOURNAL.md.
        - fail -> read the ✗ / [TAG] lines, FIX the phase it names, retry (d). After 3 fails: [!], log, continue.
   g. Go back to (a).   # next phase — NEVER end the turn here

3. FINISH only when DONE (above). Then — and only then — run the close-out (below).
```

## The phases (each = command(s) + DONE-gate). Deep detail in `references/NN-*.md`.

| Phase | Do (script / action) | DONE-gate |
|---|---|---|
| **00-bootstrap** | `ods-init.js --project <name>` → `ods-status.js` | `config.json` valid; `mode` recorded; gitignore split present (no blanket `/.design-sync/`); INDEX + STATE seeded (`references/00-bootstrap.md`) |
| **01-detect** | `ods-detect.js --root <repo> --out .design-sync/signals.json` | signals parse; non-empty `stack`; `shape` (`static`/`app`) recorded in config (`references/01-detect.md`) |
| **02-extract** | `ods-extract-tokens.js --root <repo> --signals .design-sync/signals.json --out .design-sync/tokens.json` | **both** `light.color` + `dark.color` non-empty (`references/02-extract.md`) |
| **03-design-system** | `ods-build-design-system.js --id <slug> --tokens .design-sync/tokens.json --config .design-sync/config.json` | `DESIGN.md` has Color/Links/Navigation/Effects/Theme + `data-theme`; conventions header prepended when configured (`references/03-design-system.md`) |
| **04-project** (MCP, agent-only) | settle per precedence above → **pin `projectId` in config.json** → write `.design-sync/.cache/od-project.json` + mirror MAP.md | projectId pinned BEFORE upload; `resolvedDir`/`previewUrl`/`rawBase` cached (`references/04-project.md`) |
| **05-build** | stage scripts → `.ds-sync/`; `ods-build.js --config .design-sync/config.json --root <repo> --out ./od-bundle --base <rawBase>` | bundle exists: `@odsCard` marker on every page, sentinel, anchor sidecar, `.ods-build-meta.json` (`references/05-build.md`) |
| **06-pull** (on OD drift only) | `ods-pull.js --od <odFile> --src <srcFile> --name <block>` (review, exit 2) → `… --apply` | managed block present, human text intact, review seen before `--apply` (`references/06-pull.md`) |
| **07-validate** | `node .ds-sync/ods-validate.js ./od-bundle --config .design-sync/config.json`; self-heal ≤3 iterations on `[TAG]`s (fix the phase the tag names, rebuild) | exit 0; `.render-check.json` shows `bad: 0` (`references/07-validate.md`) |
| **08-grade** | `ods-capture.js --out ./od-bundle`; grade pending pages' light+dark cells | every page's cells `good` (or user-deferred); no `[LEARNINGS_UNMERGED]` (`references/08-grade.md`) |
| **09-upload-sync** | conventions check → **driver** `ods-resync.js` (session's final build) → `ods-upload-plan.js` → agent executes the plan via OD MCP → `list_files` → `ods-upload-verify.js` → `ods-manifest.js add` pairs → `ods-manifest.js drift` | verdict `ok:true`; upload verified (exit 0); drift clean (`references/09-upload-sync.md`) |

The capability gates keep their teeth inside validate: **links · od-safe · theme · effects** are checked per
page (same predicates as `ods-verify.js`). If a check fails, **fix the phase it names — never edit HTML to
fool the gate** (hand-edits trip `[SYNC_STALE]` by design).

**Which phases run for which mode** is in `references/modes.md` — read it, don't guess. In short: Mode B runs
**00–03** (+ its close-out) and skips 04–09; Mode A runs **00–02 + 04–09** and skips **03** (the standalone
`DESIGN.md` — Mode A's `od-bundle/` pages are OD-safe renders of the repo's own HTML, not DS-built); **both**
runs all of **00–09**. All three run 00–02 (tokens always feed the anchor).

## Grading model (adversarial — full rubric + subagent rules in `references/08-grade.md`)

Every page has exactly two cells, `light` and `dark`; verdicts are `good` | `needs-work` with a
score (1-10) and issues list, written to `.design-sync/.cache/review/<slug>.grade.json`.
**pass = score>=7 AND no critical AND no major.** Grade validity is tied to the page's **SOURCE
slice**, so styling/pipeline churn never clears a grade — only source/config-slice changes (or
`--force`, systemic use only) do. `ods-capture.js` manages carry-forward/clear and prints exactly
what is pending; **YOU do the looking** (the `od-bundle/` HTML and/or the one `previewUrl` — never
memory; there is no screenshot oracle, so the rubric is a literal 3-check yes/no per cell).

**Adversarial grading:** Judge ADVERSARIALLY — find what is wrong, not what is nice. 5-axis rubric:
THEME / RTL / FIDELITY / COMPLETENESS / POLISH. Solo-grade the entry plus one content-heavy page
first, then fan out subagent waves; fold every `learnings/*.md` into `NOTES.md` between waves
(unfolded learnings fail the driver verdict).

**Grade→Fix→Re-grade loop (3 rounds max):** R1 grade all pages → split verdicts per page → R2 fix
(5 parallel, 1 per page) with cross-page rules (brand lockup, BIDI `<span dir="ltr">`) → reshoot →
R2 grade → surgical fixes for lone failures → R3 targeted regrade. Exit: every page pass.

## Conventions header (summary — `references/03-design-system.md`)

`.design-sync/conventions.md` is authored **BEFORE upload**, wired via config `readmeHeader`, and an existing
file is **never machine-rewritten** — only validated (`[CONVENTIONS_STALE]`) with edits proposed via
`NOTES.md`. After authoring or changing it, the next build MUST be a fresh **driver** run.

## Upload protocol (summary — `references/upload-protocol.md`)

Scripts plan and verify; **you execute** over the OD MCP, in the fixed sequence from `.upload-plan.json`:

1. **Finalize plan** — `ods-upload-plan.js` → `.upload-plan.json` (sentinel → content → deletes → re-arm → anchor).
   If DesignSync MCP is available: `finalize_plan` returns a `planId` and presents the upload manifest for approval.
   If only OD MCP is available: the agent reads `.upload-plan.json` and presents the summary manually.
2. **ONE plain-language approval** — "I'll write N files and delete M". Denied → STOP and ask; never silently continue.
3. **Sentinel FIRST** — `write_file("_ods_needs_recompile", …)`.
4. **Content in bulk** — `write_files` every `stage:"content"` entry in plan order. If DesignSync MCP: batch
   `write_files` (230+ files per call). If OD MCP only: `write_file` one at a time (sequential, no batching).
   Any uncleared failure → **STOP: no re-arm, no anchor**.
5. **Deletes** — `delete_file` each `stage:"delete"` entry. Not-found is the ONLY continuable failure.
6. **Sentinel re-arm** — `write_file("_ods_needs_recompile", …)` again.
7. **Anchor LAST** — `write_file("_ods_sync.json", …)` — **absolutely last, its own call**.
8. **Verify** — `list_files` → `.design-sync/.cache/remote-files.json` → `ods-upload-verify.js` → exit 0.

**Precondition:** the project must be registered in OD's SQLite DB (`app.sqlite`) before upload —
a project that exists only on disk (unregistered) will NOT appear in the OD UI. When MCP is
unavailable, Phase 04 handles registration directly — see `references/04-project.md`.

`upload.any === false` → **no upload step runs at all** (remote content is already identical).
Driver internals: `references/resync-protocol.md`.

## Close-out (after DONE, in order)

1. `ods-upload-verify.js` exited 0 — only now record `projectId` in config if absent/different (backstop; 04
   pinned it). *(Mode B–only: skip — no upload; close-out is the 03 DONE-gate + report.)*
2. Report: counts from `od-bundle/.render-check.json` (`total`, `bad`, `thin`, `variantsIdentical`,
   `iterations`), the `previewUrl`, and the **DS reload caveat** (OD loads the design-system catalog at
   startup — a fresh DS needs an OD reload to appear in the picker).
3. **Handoff audit** of `NOTES.md`: read it back through the eyes of whoever runs the next sync — Re-sync
   risks section present, Known render warns triaged, enough on the page that this run's debugging never has
   to be repeated?
4. **Offer ONE commit of the durable set** (`config.json`, `NOTES.md`, `conventions.md`).

## Pull path + drift dispatch

**06-pull** runs when OD-side drift appears. `ods-manifest.js drift` names which side moved per pair:
**`src:true`** → re-run the forward pipeline via the **driver** (`ods-resync.js`); **`od:true`** → pull the
designer's edit back with the **06-pull review gate** — never auto-apply; **both** → surface the conflict and
let the user pick a winner before writing either side. Coalesce ALL drift first, then run each affected phase
once — never a regenerate storm.

## Subagents (optional — for scale or ambiguity)

Deploy the bundled agents with `ods-deploy-agents.js --harness <claude|opencode|codex|pi|devin|gemini>
--dest <dir>` (`references/platforms.md`). **`sync-dsh-lead`** orchestrates: it owns config/NOTES/INDEX/manifest
and ALL OD MCP calls, runs the driver, and never stops until DONE. **`sync-dsh-worker`** executes ONE phase — or
ONE grading wave under the HARD RULES of `references/08-grade.md`. **`sync-dsh-extractor`** normalizes ambiguous
token sources (SCSS maps, `theme.ts`) into `{light,dark}` JSON — dispatch it from phase 02 when the source
isn't plain CSS vars. The agents are harness-neutral (action verbs, not tool brands).

## Routing — where the detail lives

- **`references/RUNBOOK.md`** — the literal, numbered, weak-model script for the whole run (start here).
- **`references/modes.md`** — Mode A vs B vs both: decision table + which of 00–09 run vs skip per mode.
- Phase playbooks: `references/00-bootstrap.md` … `09-upload-sync.md` (each: exact command, output shape,
  DONE-gate).
- `references/upload-protocol.md` — the fixed upload sequence, who does each step, STOP-no-anchor, aborts.
- `references/resync-protocol.md` — driver stages/exit codes/verdict schema, the two diff partitions, hash
  recipes + the KEY_RECIPE bump rule, anchor invariants.
- `references/mcp-contract.md` — verified OD MCP facts (the real `mcp__open-design__*` surface; no
  `render_preview`, no etag) + DesignSync MCP surface (if available: `finalize_plan`, batch `write_files`)
  + the agent's upload bridge.
- `references/state-protocol.md` — durable set vs machine-local state, checkpoint order, re-anchor ritual.
- `references/self-management.md` — the autonomy loop, upload STOP rule, learnings gate, pull review gate,
  secret guard, never-clobber rule.
- `references/framework.md` — source↔OD mapping model + teardown.
- `references/platforms.md` — action→harness map + per-harness agent/MCP targets.
- `assets/graphs/` — `workflow.dot`, `sync-loop.dot`, `decision-tree.dot`, `task-tree.md`.

## Announce

Each phase announces ONE line before it runs, e.g. `Sync-DSH: build — <srcDir> → od-bundle/`,
`Sync-DSH: grade — <n> pages pending`. Start every run with `Sync-DSH: bootstrap — <repo>`, then GO.

---

sync-dsh — MIT. See `LICENSE`, and `NOTICE` for the derived work's required notice.
