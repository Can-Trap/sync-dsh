# State Protocol — `.design-sync/` (durable set + machine-local state, via scripts)

Disk is truth; context is cache. **The scripts own the mechanical parts** — you NEVER hand-write
`STATE.json`, `manifest.json`, or a SHA-256. Read this when seeding `.design-sync/`, recording a
pair, or recovering after a crash/compaction.

## Committed — the durable set

**Rule: everything under `.design-sync/` NOT gitignored is committed.**

| File | Content |
|---|---|
| `config.json` | strict-validated (`validateConfig`); holds `projectId` once settled (04). Unknown key → `✗ config: unknown key "<k>"`. Never drop `projectId`; `overrides` are additive. |
| `NOTES.md` | free-form bullets. Before a run finishes it must carry a **Known render warns** list (triaged warns) and a **Re-sync risks** section. |
| `conventions.md` | human-editable header prepended to generated `DESIGN.md` via config `readmeHeader`. Authored once; never machine-rewritten — only validated. |

## Gitignored — machine-local (init writes these lines, replacing the old blanket `/.design-sync/`)

```
.design-sync/.cache/        .design-sync/STATE.json      .design-sync/tokens.json
.design-sync/learnings/     .design-sync/MAP.md          .design-sync/manifest.json
.design-sync/reports/       .design-sync/signals.json    .ds-sync/
.design-sync/tasks/         .design-sync/JOURNAL.md      od-bundle/
```

| File | Content |
|---|---|
| `STATE.json` | `{project, createdAt}` — the run cursor. **No `phase` field**: `ods-status.js` derives the next phase from `tasks/INDEX.md`, never from STATE. |
| `tasks/INDEX.md` | the checklist; rows are real phase ids `00-bootstrap … 09-upload-sync` (06-pull marked "(on OD drift)") |
| `JOURNAL.md`, `reports/<id>.md`, `MAP.md` | one line per finished task; one report per task; MAP.md = human-readable OD facts |
| `signals.json`, `tokens.json` | detect (01) / extract (02) outputs |
| `manifest.json` | src↔od pairs + hashes (`ods-manifest.js` owns it) |
| `.cache/od-project.json` | `{projectId, resolvedDir, previewUrl, rawBase}` — agent-written at settlement (04); scripts read it |
| `.cache/remote-sync.json` | remote `_ods_sync.json`, fetched by the AGENT via OD MCP `get_file` BEFORE the driver runs |
| `.cache/remote-files.json` | agent-saved OD MCP `list_files` result — input to `ods-upload-verify.js` |
| `.cache/review/<slug>.json` | capture bookkeeping `{gradeKey, sourceKey, keyRecipe, cells:["light","dark"], pendingGrade}` (`slug` = page rel, `/`→`__`, minus `.html`) |
| `.cache/review/<slug>.grade.json` | agent verdicts `{"cells":{"light":{"verdict":"good"\|"needs-work","note":"…"},"dark":{…}}}` |
| `.cache/.gitignore` | `*` — self-defense, rewritten by every capture run |
| `learnings/<BATCH_ID>.md` | subagent learnings drop-box; ANY file present ⇒ `[LEARNINGS_UNMERGED]` fails the driver verdict |
| `.ds-sync/` (repo root) | staged copy of the skill's `scripts/`; re-syncs re-copy (a stale stage runs old code) |
| `od-bundle/` (repo root) | build output. Uploaded: every non-dot file. Local-only dot-files: `.render-check.json`, `.sync-diff.json`, `.resync-verdict.json`, `.upload-plan.json`, `.ods-build-meta.json`. |

`ods-init.js --project <name>` seeds all of this idempotently — re-run init if a file is missing;
don't author state files by hand.

## The manifest-via-script rule (never type a hash)

`manifest.json` is the map + drift ledger, shape `{ pairs: [{ src, od, srcHash, odHash }] }`.
Record with `node <skill>/scripts/ods-manifest.js add --pair <src>::<od>` (it hashes both sides)
and detect movement with `ods-manifest.js drift` (exit 1 + a list on change).

## The unit of work: one task → one report → flip the box

`tasks/INDEX.md` is the checklist. Work it top-to-bottom, ONE row at a time. A row is DONE only
when its REAL artifact exists at its REAL path — a plan or a printed status is not done.

## Re-anchor ritual (start of every run / after compaction)

`node <skill>/scripts/ods-status.js` prints the project + the next unchecked task (derived from
`tasks/INDEX.md`). Then read `config.json`, `NOTES.md`, and `MAP.md` and act on exactly one next
task. Disk wins over memory: if context implies more progress than the `[x]` count / report files
show, trust the files and roll back to the lowest unverified task.

## Checkpoint order (makes a crash recoverable)

1. Create/replace the **real artifact** (script output, managed block, MCP write per plan).
2. Write `reports/<id>.md` (what you did + artifact paths + evidence).
3. Flip `[ ]`→`[x]` in `tasks/INDEX.md` — **only after** the report exists.
4. Append one line to `JOURNAL.md`.
5. Commit the **durable files** (`config.json`, `NOTES.md`, `conventions.md`) when a task changed
   them.

Never flip a box before the artifact exists.
