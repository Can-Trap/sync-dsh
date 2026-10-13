# Phase 00 — Bootstrap (init `.design-sync/`, classify the run, enter the task loop)

Goal: arrive at a repo and **autonomously** stand up the working dir, classify the run
(first-time vs re-sync), then hand off to the task loop — **no menu, no waiting.** The scripts do
the mechanical work; you honor whatever prior state exists.

Announce one line: `Sync-DSH: bootstrap — <repo>`, then GO.

## Run classification (init prints it — believe it)

- `.design-sync/config.json` exists **with `projectId`** ⇒ **re-sync run.** A prior session
  settled an OD project. Expect the one-driver flow: fetch the remote anchor, run
  `ods-resync.js`, upload only what changed. Never re-create the project, never drop the pin.
- config exists **without `projectId`** ⇒ first-time run that never reached settlement (04) —
  resume from the lowest unchecked task, keep every config field already recorded.
- No config at all ⇒ fresh first-time run; init writes `{projectName: <--project>}`.

## Prior-state honoring (BEFORE doing anything else on a known repo)

Read `.design-sync/config.json` AND `.design-sync/NOTES.md` first and **honor their contents**:
`overrides`, `exclude`, `tokenSources`, a pinned `shape` are decisions a previous session paid
for — do not re-derive them. `NOTES.md`'s "Known render warns" and "Re-sync risks" sections are
the previous agent's debugging receipts; a warn already listed there is triaged, a new one is not.

## Steps

1. **Init** — idempotent; safe on a repo that already has state:
   ```
   node <skill>/scripts/ods-init.js --project <name>
   ```
   It: settles config (creates `{projectName}` or preserves the existing file — never drops
   `projectId`), seeds `NOTES.md`/`MAP.md`/`JOURNAL.md`/`tasks/INDEX.md`, writes
   `STATE.json = {project, createdAt}` (existing `createdAt` kept), and applies the gitignore
   split below (replacing any old blanket `/.design-sync/` line).
2. **Status** — rehydrate and get the next task:
   ```
   node <skill>/scripts/ods-status.js
   ```
3. **Enter the task loop.** Work `.design-sync/tasks/INDEX.md` top-to-bottom, ONE task at a time
   (init already flipped `00-bootstrap` to `[x]`). Keep going through 07-validate, 08-grade and
   09-upload-sync without asking "should I continue?".

## The durable set (what is committed vs machine-local)

**Rule: everything under `.design-sync/` that is NOT gitignored is committed.** Today that is:
`config.json`, `NOTES.md`, `conventions.md`. These carry decisions across machines and sessions.

Init gitignores the machine-local rest (this exact list, appended idempotently):
```
.design-sync/.cache/
.design-sync/learnings/
.design-sync/reports/
.design-sync/tasks/
.design-sync/JOURNAL.md
.design-sync/STATE.json
.design-sync/MAP.md
.design-sync/signals.json
.design-sync/tokens.json
.design-sync/manifest.json
.ds-sync/
od-bundle/
```

**Durable-set rule: any user-reported correction persists IMMEDIATELY** — the moment it is said,
not at close-out. If it maps to a config field (`exclude`, `entry`, `overrides.<page>.thinOk`, a
different `projectName`, …) → write it to `config.json`. Anything else → a bullet in `NOTES.md`.
A correction that lives only in conversation context is lost on the next compaction.

## DONE-gate

Phase 00 is DONE only when `.design-sync/` exists with a valid `config.json`, the gitignore split
is present (no blanket `/.design-sync/` line), `tasks/INDEX.md` + `STATE.json` are seeded, and
`node <skill>/scripts/ods-status.js` prints the next task without error. A plan alone is not done.
