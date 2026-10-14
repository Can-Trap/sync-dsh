# RUNBOOK — the deterministic layer (read this whole file, then never guess)

You are a small model. You cannot improvise this pipeline. **Read this entire file before you
touch anything.** Every step below is mechanical: it is either an EXACT shell command (copy the
flags verbatim) or an EXACT Open Design MCP tool call (copy the JSON shape). If a step is not
written here, you do not do it. If you are unsure what phase you are in, you run
`node .ds-sync/ods-status.js` (or `<skill>/scripts/ods-status.js` before staging) and believe its
answer. **Disk is truth. The script output is truth. Your memory is not truth.**

`<skill>` below = this skill's own directory (the folder that contains this `references/`). Before
Phase 05 you run scripts from `<skill>/scripts/`; from Phase 05 onward you run the STAGED copy at
`.ds-sync/` (Phase 05 copies the scripts there). Never mix the two.

## 0. FORBIDDEN ACTIONS (doing any of these corrupts a sync — never do them)

1. **Never hand-type** JSON, hex colors, SHAs, HTML, OD-safe pages, token maps, managed blocks, or
   a `_ods_sync.json`. A script writes every one of these. You only RUN the script and READ its output.
2. **Never guess the next phase from memory.** Always run `ods-status.js` first and do the ONE
   phase it names.
3. **Never guess `resolvedDir`, `previewUrl`, `rawBase`, or `projectId`.** These come ONLY from an
   OD MCP response (`get_project` / `create_project`). If you don't have one, call `get_project` again.
4. **Never write the anchor `_ods_sync.json` unless every content write and every delete succeeded.**
   On ANY uncleared write/delete failure: STOP. No re-arm. No anchor. (STOP-no-anchor — section 4.)
5. **Never re-arm or "clean up" a failed upload by writing the anchor.** A failed run is SUPPOSED to
   end with no anchor — that is the safe state.
6. **Never pick which files to upload from the verification partition** (`unchanged/changed/added/
   removed`). Upload scope comes ONLY from `upload.any` (ship-or-skip) and `upload.deletePaths`
   (what to delete). The plan always writes the FULL set — that is correct and idempotent.
7. **Never regenerate a file to upload it.** For each write op you READ THE LOCAL FILE BYTES at the
   `local` path in the plan and send them; you use the `path` field verbatim.
8. **Never look for `render_preview`, `serve_url`, `if_match`, etags, or `finalize_plan`.** Open
   Design has NONE of these. `write_file` is a single unconditional overwrite. The preview URL is
   fetched ONCE from `get_project` and reused forever — never re-minted.
9. **Never re-create or re-settle a project that is already pinned** (config has `projectId` and
   `get_project` confirms it is alive). Never drop the pin.
10. **Never edit `od-bundle/` HTML by hand to pass a gate.** Hand edits trip `[SYNC_STALE]`. Fix the
    PHASE the failing tag names, then rebuild with the driver.
11. **Never fork `scripts/_hashes.js`.** If a hash input changes, the `KEY_RECIPE` bump ships in the
    same commit. You do not touch this file.
12. **Never fetch the remote anchor unless this is a re-sync** (config has `projectId`). First-time
    run = no `--remote` flag, full first-sync scope.

---

## 1. THE RE-ANCHOR RITUAL (do this at the START of every turn — no exceptions)

```
STEP A.  node .ds-sync/ods-status.js        # (before Phase 05 staging: node <skill>/scripts/ods-status.js)
STEP B.  Read the ONE next "[ ]" phase it names. Do ONLY that phase (section 2).
STEP C.  Write .design-sync/reports/<phase-id>.md  (what you did + artifact paths + evidence).
STEP D.  Run that phase's DONE-gate. Pass -> flip "[ ]"->"[x]" in .design-sync/tasks/INDEX.md and
         append one line to .design-sync/JOURNAL.md. Fail -> read the "✗" / "[TAG]" line, fix the
         phase it names, retry. After 3 fails: mark the box "[!]", log the blocker, move on.
STEP E.  Go back to STEP A. DO NOT END YOUR TURN between phases.
```

You are FORBIDDEN to stop mid-run. You loop A→E until the DONE boolean (section below) is all true.
The only pauses allowed: (a) the ONE plain-language upload approval, (b) approving a secret-bearing
write, (c) showing a pull diff before `--apply`.

**DONE (loop terminates ONLY when all four are true):**
```
DONE = (every box in .design-sync/tasks/INDEX.md is "[x]")
   AND (the session's FINAL run of ods-resync.js printed a verdict with  ok:true)
   AND (node .ds-sync/ods-upload-verify.js --plan … --remote …  exited 0)
   AND (node .ds-sync/ods-manifest.js drift  printed  "clean").
```

---

## 2. MODE SELECTION (decide ONCE, at the top, from a table — never by feel)

Two modes, kept SEPARATE. Default when the request does not clearly say = **BOTH**.

- **Mode B — Design System.** Produces `DESIGN.md` + `tokens.json` (light+dark) in the OD DS dir.
  Phases: 00 → 01 → 02 → 03.
- **Mode A — Project.** Produces the `od-bundle/` of OD-safe pages, uploaded to an OD project.
  Phases: 00 → 01 → 02 → 04 → 05 → 07 → 08 → 09 (06 only on OD drift; 02 feeds the anchor's tokensSha).
- **BOTH (default).** All phases 00 → 09. (01-detect is shared; run it once.)

| Request text contains (case-insensitive) | config.shape | MODE |
|---|---|---|
| "design system", "DESIGN.md", "tokens", "extract tokens", "just the DS" — and NOT project words | any | **B** |
| "project", "sync codebase", "upload", "OD project", "pages", "od-bundle" — and NOT DS-only words | any | **A** |
| "sync-dsh", "/sync", "both", "everything", OR nothing specific | any | **BOTH** |
| conflicting/ambiguous | any | **BOTH** (default; never guess narrower) |

`config.shape` (`static` / `app`) does NOT change the mode — it only informs how pages map in 05.
`ods-init.js --mode <MODE>` (Phase 00) records the mode in `config.json` AND seeds `tasks/INDEX.md`
so only your mode's phases start `[ ]` — skipped ones are pre-checked `[x] (skipped: mode <X>)`. You
never choose to skip: `ods-status.js` never names a skipped phase, and "every box `[x]`" still terminates.

---

## 3. TOP-TO-BOTTOM WALKTHROUGH (both modes, phases 00–09)

Each step is the EXACT command or the EXACT MCP call. Run from repo root. `<name>` = the project
name/slug (see slug rule at the end of this section).

### Phase 00 — bootstrap  (BOTH · A · B)
```
node <skill>/scripts/ods-init.js --project <name> --mode <MODE>   # <MODE> = A | B | both, from section 2
node <skill>/scripts/ods-status.js
```
Init is idempotent: it never drops an existing `projectId`, seeds INDEX/STATE/NOTES/MAP/JOURNAL, and
writes the gitignore split. Classify the run from the printed line:
- config has `projectId` → **re-sync run** (you WILL fetch the remote anchor in Phase 09 step 0).
- config, no `projectId` → resume first-time run; keep every existing config field.
- no config → fresh first-time run.
DONE-gate: `config.json` valid, gitignore split present, `ods-status.js` prints next task.

### Phase 01 — detect  (BOTH · A · B)
```
node <skill>/scripts/ods-detect.js --root . --out .design-sync/signals.json
```
DONE-gate: `signals.json` parses, non-empty `stack`, and a `shape` (`static`/`app`) recorded into
`config.json`.

### Phase 02 — extract tokens  (BOTH · A · B)
```
node <skill>/scripts/ods-extract-tokens.js --root . --signals .design-sync/signals.json --out .design-sync/tokens.json
```
DONE-gate: BOTH `light.color` AND `dark.color` are non-empty in `tokens.json`. If the source is not
plain CSS vars (SCSS maps, `theme.ts`), dispatch `sync-dsh-extractor` to normalize into `{light,dark}`.

### Phase 03 — design system  (BOTH · B)   [SKIP in Mode A]
Author `.design-sync/conventions.md` FIRST if it does not already exist (never rewrite an existing
one), wire it via config `readmeHeader`, then:
```
node <skill>/scripts/ods-build-design-system.js --id <slug> --tokens .design-sync/tokens.json --name "<Display Name>" --config .design-sync/config.json
```
DONE-gate: `design-systems/<slug>/DESIGN.md` has the headings **Color, Links, Navigation, Effects,
Theme**, `tokens.json` sits beside it, **and the Theme section agrees with that file** — when `dark` is
absent or identical to `light` it must say the system is single-theme, because Open Design acts on what
DESIGN.md claims. Tell the user: **OD loads the DS catalog at startup — reload Open Design for the DS to
appear in the picker.**
If the script errors `Open Design data root not found`, pass `--data-root <dir>` (or set `OD_DATA_ROOT`)
so the DS lands under OD's real data root — never let it fall to a relative path under the repo.

### Phase 04 — settle the OD project  (A · BOTH)   [SKIP in Mode B]  — AGENT MCP, section 4A literal JSON
Follow the precedence in section 4A, PIN `projectId` into `config.json` immediately, write
`.design-sync/.cache/od-project.json`, mirror MAP.md. DONE-gate: project confirmed, pin written
BEFORE any upload, cache holds `projectId/resolvedDir/previewUrl/rawBase`.

### Phase 05 — build the bundle  (A · BOTH)   [SKIP in Mode B]
Stage the scripts, then build:
```
node -e "require('fs').cpSync('<skill>/scripts','.ds-sync',{recursive:true})"   # stage scripts; cross-platform (POSIX alt: cp -r <skill>/scripts/. .ds-sync/)
node .ds-sync/ods-build.js --root . --out ./od-bundle --base <rawBase>   # --config defaults to .design-sync/config.json
```
`<rawBase>` = the `rawBase` you cached in Phase 04 (e.g. `/api/projects/<slug>/raw`). If you omit
`--base`, the script reads `rawBase` from `.design-sync/.cache/od-project.json`. On a RE-SYNC,
**re-stage FIRST** (stale staged code runs old contracts). DONE-gate: `od-bundle/` exists with a first-line
`<!-- @odsCard page="…" -->` marker on every page, the sentinel `_ods_needs_recompile`,
`.ods-build-meta.json`, and `_ods_sync.json`.

### Phase 06 — pull  (A · BOTH, ONLY when OD drift is detected in 09)
```
node .ds-sync/ods-pull.js --od <odFile> --src <srcFile> --name <block>     # review, EXITS 2
node .ds-sync/ods-pull.js --od <odFile> --src <srcFile> --name <block> --apply
```
The review exit-2 is MANDATORY before `--apply`. Writes ONLY inside the managed block; human text
around it is byte-preserved. Show the diff to the user before `--apply`.

### Phase 07 — validate  (A · BOTH)   [SKIP in Mode B]
```
node .ds-sync/ods-validate.js ./od-bundle --config .design-sync/config.json
```
DONE-gate: exit 0 and `.render-check.json` shows `bad: 0`. On a `[TAG]`: fix the phase the tag names
and rebuild — self-heal ≤3 iterations. Never edit HTML to fool the gate.

### Phase 08 — grade  (A · BOTH)   [SKIP in Mode B]
```
node .ds-sync/ods-capture.js --out ./od-bundle
```
`ods-capture.js` prints, per pending page, exactly what to READ and where to WRITE the grade. Grade
each pending page's `light` and `dark` cells with the literal 3-question test in section 6. Solo-grade
the entry page + one content-heavy page yourself FIRST, then fan out `sync-dsh-worker` waves. Between
waves, fold every `learnings/*.md` into `NOTES.md` and DELETE the files (a surviving learnings file
fails the driver verdict). DONE-gate: every page's two cells `good` (or user-deferred), no
`[LEARNINGS_UNMERGED]`, and a **re-run** of `node .ds-sync/ods-capture.js --out ./od-bundle` prints **0 pending**.

### Phase 09 — upload + sync  (A · BOTH)   [SKIP in Mode B]  — the upload lives in section 4B/4C
Order of operations (the driver is the session's FINAL build):
```
# step 0 (RE-SYNC ONLY — config has projectId): fetch remote anchor via MCP → cache (section 4C)
node .ds-sync/ods-resync.js --config .design-sync/config.json --root . --out ./od-bundle \
     [--remote .design-sync/.cache/remote-sync.json] [--base <rawBase>]
node .ds-sync/ods-upload-plan.js --out ./od-bundle
# agent executes .upload-plan.json over OD MCP — EXACT sequence in section 4B
node .ds-sync/ods-upload-verify.js --plan od-bundle/.upload-plan.json --remote .design-sync/.cache/remote-files.json
node .ds-sync/ods-manifest.js add --pair <srcPath>::<odPath>      # one per synced pair
node .ds-sync/ods-manifest.js drift                              # must print "clean"
```
Requires driver verdict `ok:true`, `verification.pendingGrade` empty, no `[LEARNINGS_UNMERGED]`.
`verification.removed` non-empty → confirm the deletions with the user first. `upload.any:false` →
the upload steps DO NOT RUN (remote already identical); still run the close-out. NEVER follow the
driver with a bare `ods-build.js` (it wipes `.sync-diff.json`).

### DS slug rule (deterministic)
`<slug>` = slugify(the repo's basename): lowercase, non-`[a-z0-9]` → `-`, collapse repeats, trim `-`.
Before `create_project`, call `list_projects` (section 4A) — if that slug already exists, append `-2`
(then `-3`, …) until it is free. Use the same free slug as the DS `--id` and the project name.

---

## 4A. SETTLEMENT — literal MCP request + response per branch (Phase 04)

Read EXACTLY these fields from the response and cache them. Field names may vary slightly by daemon
version; if `rawBase` is absent, derive it as `/api/projects/<projectId>/raw`.

**Branch 1 — PINNED** (`config.json` already has `projectId`). Confirm it is alive, do NOT re-create:
```
REQUEST   mcp__open-design__get_project   { "project": "smart-traffic-israel" }
RESPONSE  {
  "projectId":  "smart-traffic-israel",                                  ← cache as projectId
  "name":       "Smart Traffic Israel",
  "resolvedDir":"…/Open Design/namespaces/<ns>/data/projects/smart-traffic-israel",  ← cache as resolvedDir
  "previewUrl": "http://127.0.0.1:49677/api/projects/smart-traffic-israel/raw/index.html",  ← cache as previewUrl (fetch ONCE, reuse forever)
  "rawBase":    "/api/projects/smart-traffic-israel/raw"                 ← cache as rawBase
}
```
If the call errors "project not found", the pin is dead → ask the user for a target (only case you re-ask).

**Branch 2 — FRESH** (no pin; the first-time default). List, pick a free slug, create:
```
REQUEST   mcp__open-design__list_projects   {}
RESPONSE  { "projects": [ { "projectId": "other-app", "name": "Other App" }, … ] }
          # if <slug> already appears here, bump to <slug>-2 (DS slug rule) before creating.

REQUEST   mcp__open-design__create_project   { "name": "Smart Traffic Israel", "id": "smart-traffic-israel" }
RESPONSE  {
  "projectId":  "smart-traffic-israel",       ← cache as projectId
  "resolvedDir":"…/projects/smart-traffic-israel",   ← cache as resolvedDir
  "previewUrl": "http://127.0.0.1:49677/api/projects/smart-traffic-israel/raw/index.html",  ← cache as previewUrl
  "rawBase":    "/api/projects/smart-traffic-israel/raw"   ← cache as rawBase
}
```
Creation DENIED/failed → **STOP and ask the user.** Never fall through to adopting an existing project.
(If you attach a `designSystem` and it is rejected because the DS catalog is not reloaded, retry
`create_project` WITHOUT `designSystem` and leave attachment for an OD reload.)

**Branch 3 — RE-ADOPTED** (never unprompted). Only when the user EXPLICITLY asked to sync into an
existing project, AND you first said out loud: *"syncing may replace or remove files in that project."*
Then `get_project` on the user's chosen id (same shape as Branch 1) and cache the same four fields.

**Cache immediately after ANY branch** — write `.design-sync/.cache/od-project.json`:
```json
{ "projectId": "smart-traffic-israel",
  "resolvedDir": "…/projects/smart-traffic-israel",
  "previewUrl": "http://127.0.0.1:49677/api/projects/smart-traffic-israel/raw/index.html",
  "rawBase": "/api/projects/smart-traffic-israel/raw" }
```
And write `projectId` into `.design-sync/config.json` NOW — no upload may happen before the pin exists.

## 4B. THE UPLOAD SEQUENCE — exact numbered checklist (Phase 09) with a HARD STOP GATE

Preconditions (verify ALL before you touch OD): the FINAL build was a driver run with `ok:true`,
`verification.pendingGrade` empty, no `[LEARNINGS_UNMERGED]`; the conventions header was authored
before that build. If `upload.any === false` → **do nothing here** (remote already identical).

Read `od-bundle/.upload-plan.json`. It has a `sequence` array; each entry is one of:
`{ "op":"write", "stage":"sentinel|content|rearm|anchor", "path":"…", "local":"…abs path…" }`
`{ "op":"delete", "stage":"delete", "path":"…" }`

Execute in THIS order — never reorder, never skip:

```
1.  Say ONE approval line to the user:  "I'll write <counts.writes> files into <projectId> and
    delete <counts.deletes> stale ones." Denied → STOP and ask. Do not continue silently.
2.  Execute the entry with stage:"sentinel"  →  write_file("_ods_needs_recompile", <local bytes>).   [SENTINEL FIRST]
3.  For EACH entry with stage:"content", in array order:
        read the bytes at its "local" path  →  write_file(path=<entry.path verbatim>, content=<bytes>).
        ── ANY uncleared write failure → HARD STOP. No re-arm. No anchor. (section 0 rule 4/5)
4.  For EACH entry with stage:"delete", in array order:
        delete_file(path=<entry.path>).
        ── A "not-found" rejection is the ONLY continuable failure: drop that path, continue.
           ANY OTHER delete failure → HARD STOP. No re-arm. No anchor.
5.  Execute the entry with stage:"rearm"  →  write_file("_ods_needs_recompile", <local bytes>).   [RE-ARM]
6.  Execute the entry with stage:"anchor" →  write_file("_ods_sync.json", <local bytes>).          [ANCHOR — ABSOLUTELY LAST, ITS OWN CALL]
7.  list_files(project) → save verbatim to .design-sync/.cache/remote-files.json.
8.  node .ds-sync/ods-upload-verify.js --plan od-bundle/.upload-plan.json --remote .design-sync/.cache/remote-files.json   → must exit 0.
```

**HARD STOP GATE (STOP-no-anchor).** If step 3 or step 4 hits any uncleared failure, you STOP right
there: you do NOT run step 5, you do NOT run step 6. The project is left with no anchor. That is the
correct, safe end state — the next sync will re-check every page. Writing the anchor over a
partially-landed upload is damage no later run can repair. Report the failure and stop.

## 4C. REMOTE-ANCHOR FETCH — re-sync only, BEFORE the driver (Phase 09 step 0)

Only when `config.json` has a `projectId` (re-sync). Otherwise skip this and run the driver WITHOUT
`--remote`.
```
REQUEST   mcp__open-design__get_file   { "project": "smart-traffic-israel", "path": "_ods_sync.json" }
RESPONSE  { "content": "{…the anchor JSON…}" }        ← save the content verbatim to
                                                        .design-sync/.cache/remote-sync.json
```
If the file is missing remotely → do NOT pass `--remote` (full first-sync scope). Then run the driver.

---

## 5. DRIVER VERDICT — field → action TABLE

Read `od-bundle/.resync-verdict.json` (same as the driver's stdout). Act on each field:

| Field / value | What you DO |
|---|---|
| `ok: true` | proceed to `ods-upload-plan.js` (Phase 09 step). |
| `ok: false` | a stage failed or a gate fired. Find the first failing stage's `[TAG]` on stderr, FIX the phase it names, re-run the driver. Do NOT upload. |
| `learningsUnmerged` non-empty | fold each listed `learnings/*.md` into `NOTES.md`, DELETE those files, re-run the driver. |
| `verification.pendingGrade` non-empty | grade those pages' light+dark cells (section 6), then re-run the driver. (Not a failure, but blocks upload.) |
| `verification.removed` non-empty | tell the user which pages will be DELETED remotely; get confirmation before uploading. |
| `upload.any: false` | remote already equals the bundle — SKIP all upload steps; run only the close-out. |
| `upload.any: true` | run `ods-upload-plan.js`, then the section 4B sequence. |
| `upload.deletePaths` (array) | these are the ONLY remote paths to delete — they become the `stage:"delete"` entries. Never delete anything else. |
| `upload: null` | the diff produced no artifact this run → `ok` is false; do NOT upload; re-run. |
| `anchor: "ok"` | remote anchor read cleanly; diff was scoped against it. |
| `anchor: "unreadable"/"malformed"/"shape_changed"/"unknown"` | degraded to full scope — NOT fatal, just proceed (every page re-checked). |
| `anchor: "not_provided"` | no `--remote` was passed (first-time run) — expected. |

Exit codes: `0` = ok:true. `1` = a stage failed/gate fired (verdict IS still written — read it).
`2` = usage/pre-flight (missing `--config/--root/--out`, no `.design-sync/`, bad config) — NOTHING
was built, fix the invocation and re-run.

---

## 6. GRADING RUBRIC — literal 3-question yes/no per cell (Phase 08)

Every page has exactly TWO cells: `light` and `dark`. Grade each cell by READING the actual rendered
artifact — the `od-bundle/<page>.html` on disk and/or the OD `previewUrl` — never from memory of the
source. For EACH cell answer three yes/no questions:

```
Q1  THEMED?     Are the design-system tokens visibly applied in THIS cell's theme?
                (dark cell only: AND does it clearly differ from light — not an identical fallback?)
Q2  COMPLETE?   Does the page render whole — nav present, links present, no missing section or stub?
Q3  PLAUSIBLE?  Realistic content and sane layout — nothing reads as debris or placeholder soup?

verdict = "good"       IF Q1=yes AND Q2=yes AND Q3=yes
verdict = "needs-work" OTHERWISE  (note = which question failed and why, concretely)
```

Do this for the `light` cell, then again for the `dark` cell. A page is done only when BOTH cells are
`good`. Write `.design-sync/.cache/review/<slug>.grade.json` (`<slug>` = page rel with `/`→`__`, minus
`.html`) — template in section 7.

---

## 7. COPY-PASTE PER-OP TEMPLATES

**write_file (content / sentinel / rearm / anchor) — read bytes from `entry.local`, use `entry.path` verbatim:**
```
mcp__open-design__write_file  { "project": "<projectId>", "path": "<entry.path>", "content": "<bytes read from entry.local>" }
```

**delete_file (one per `stage:"delete"` entry):**
```
mcp__open-design__delete_file { "project": "<projectId>", "path": "<entry.path>" }
```

**list_files (post-upload verify input):**
```
mcp__open-design__list_files  { "project": "<projectId>" }   → save verbatim to .design-sync/.cache/remote-files.json
```

**get_file (re-sync anchor fetch, before the driver):**
```
mcp__open-design__get_file    { "project": "<projectId>", "path": "_ods_sync.json" }   → content → .design-sync/.cache/remote-sync.json
```

**`.design-sync/.cache/od-project.json` (Phase 04 cache):**
```json
{ "projectId": "<projectId>", "resolvedDir": "<resolvedDir>", "previewUrl": "<previewUrl>", "rawBase": "<rawBase>" }
```

**`.design-sync/.cache/review/<slug>.grade.json` (Phase 08, one per page):**
```json
{ "cells": {
    "light": { "verdict": "good",       "note": "tokens applied, nav+links present, layout whole" },
    "dark":  { "verdict": "needs-work", "note": "Q1 fail: card --surface stays light — not themed" }
} }
```

**Manifest pair + drift (Phase 09):**
```
node .ds-sync/ods-manifest.js add --pair app/globals.css::od-bundle/index.html
node .ds-sync/ods-manifest.js drift        # must print "clean" (exit 0)
```

---

## 8. THE 15 DETERMINISM RULES (each failure mode, pinned)

1. **Mode** — decide from the section-2 table (request text + config.shape); default BOTH.
2. **Settlement tool + fields** — section 4A: `get_project`/`create_project`/`list_projects`; read
   `projectId/resolvedDir/previewUrl/rawBase`; cache to `od-project.json`.
3. **Upload order** — section 4B: sentinel → content → deletes → re-arm → anchor-LAST, with the HARD STOP GATE.
4. **Per write op** — read `entry.local` bytes, send `entry.path` verbatim; never regenerate.
5. **Never scope uploads by the verification partition** — only `upload.any` + `upload.deletePaths` (section 5).
6. **Grading** — literal 3-question yes/no per light+dark cell (section 6).
7. **Remote anchor** — fetch ONLY on re-sync (config has `projectId`); `get_file` → `remote-sync.json`
   BEFORE the driver; else no `--remote` (section 4C).
8. **Driver verdict** — act by the section-5 field→action table, never by guess.
9. **STOP-no-anchor** — forbidden-actions rules 4/5 + the section-4B HARD STOP GATE.
10. **Never hand-type** JSON/hex/SHA/HTML/managed-blocks — run the script (forbidden rule 1).
11. **Never infer the next phase** — always `ods-status.js` first (section 1).
12. **No Claude-Design lore** — no `render_preview`/`serve_url`/`if_match`/etag/`finalize_plan`;
    `write_file` is unconditional; `previewUrl` fetched once, reused (forbidden rule 8).
13. **DS slug** — slugify(repo basename), append `-2` on `list_projects` collision (section 3).
14. **Loop termination** — the 4-part DONE boolean (section 1); never end a turn between phases.
15. **previewUrl vs serve_url** — ONE `previewUrl` from `get_project`, reused everywhere; never re-mint.

---

*MIT — see `LICENSE`, and `NOTICE` for the derived work's required notice.*
