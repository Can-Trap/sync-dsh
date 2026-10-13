# Self-Management — stay on course, never clobber, lead the team

The agent is its own team leader: it observes itself, corrects drift, delegates, and — uniquely for a sync
skill — **never overwrites human work**. Read this when drifting, stuck, looping, generating files, or when
context is filling.

## The autonomy loop is mandatory — never end the turn mid-run
This skill runs as a **single uninterrupted loop** over `tasks/INDEX.md` until DONE (every box `[x]`, the
final driver verdict `ok:true`, `ods-upload-verify.js` exits 0, `ods-manifest.js drift` is clean). **You
are forbidden to end your turn between tasks** — no "finished detect, shall I continue?", no
summarize-and-wait. After each task **re-anchor** (`ods-status.js`), take the next unchecked task, and keep
going. The only legitimate mid-run stops are the pull review gate (below), the one upload approval, or a
real blocker / 3 failed fixes on one artifact.

## The upload STOP rule (the rule that makes the anchor trustworthy)
The upload plan executes in a fixed sequence — sentinel → content → deletes → re-arm → **anchor absolutely
last, its own call** (`references/upload-protocol.md`). Any uncleared write/delete failure mid-run →
**STOP: no re-arm, no anchor.** A not-found delete rejection is the ONLY continuable failure. Anchor-less
is where a failed run belongs — with no anchor to trust, the next sync re-checks the whole project; an
anchor written on top of a partially-landed upload feeds every later diff false history. Never write the
anchor to "clean up" a failed run, and never proceed past a denied approval.

## The learnings-fold gate
`.design-sync/learnings/<BATCH_ID>.md` is the subagents' drop-box. Between waves the **orchestrator alone**
folds every learnings file into `NOTES.md` and DELETES the files — any surviving file makes
`[LEARNINGS_UNMERGED]` fail the driver verdict even with all stages green. Insight that lives only in a
learnings file (or worse, in context) is lost; fold it, then act on it (config fix → driver rebuild →
re-capture).

## Never conflate the two diff partitions
`.sync-diff.json` carries a **verification partition** (changed/added/removed pages — which pages need
re-grading) and an **upload partition** (`upload.*` from `sourceHashes` — which files ship, which remote
paths die). **Upload scope is never derived from the verification partition** — the plan always writes everything
(idempotent full writes); `upload.any`/`deletePaths` drive skip/deletes only
(`references/resync-protocol.md`).

## The pull review gate (the rule that makes "sync" safe both ways)
Pulling OD → source is **never silent**. `ods-pull.js` without `--apply` prints the OD content that would be
embedded and **exits 2**. You MUST surface that diff to the user and only re-run with `--apply` after it is
accepted. Applying writes into a `design-sync:start:<name>` managed block **only** — content outside the
block is the human's and is preserved byte-for-byte. A hand-edit inside the block (drift) is a signal to
surface, not a license to overwrite.

## The never-clobber gate
Before writing ANY source file that may contain human content: (1) the write goes through `ods-pull.js`'s
managed-block insert/replace — never a raw overwrite; (2) content outside the named block is preserved; (3)
if the same OD content is already embedded, the script no-ops (exit 0). Push (`ods-push.js`) targets the OD
project dir, not the human's source tree, so it copies freely there; it never edits source.

## The secret guard (never sync a secret to OD)
Everything OD-published is effectively public. The plugin's secret guard runs on DeepSeek Harness's
`tools/pre-execute` waterfall and **denies** any call whose content or command matches a secret pattern
(`api_key|secret|token|password` = a long value), carrying a reason the model can act on. It is armed
inside a project that has a `.design-sync/` directory, so it protects a sync without policing unrelated
projects on the same machine; `SYNC_DSH_GUARD=always` arms it everywhere and `SYNC_DSH_GUARD=off`
disables it. Don't route secrets through push/render either — strip them from fixtures and demo files
first. Drift is checked **hash-exactly** by `ods-manifest.js drift`, which compares the sha256 of both
sides of every tracked pair and exits 1 on a real difference; record that in `JOURNAL.md` so drift is
never missed.

## Loop & drift guards (hard limits)
- **Duplicate action** (same script + args twice, no new result) → change one input, don't repeat verbatim.
- **3 failed fixes on ONE artifact** = wrong approach — log the blocker to `JOURNAL.md`, mark the task `[!]`
  in `tasks/INDEX.md`, and **move on**; never abort the whole loop for one stuck artifact. Surface every
  `[!]` in the final report.
- **Drift coalescing** (Phase 09): collect ALL drift first, compute the affected phases, run each once —
  src drift resolves through ONE driver run (`ods-resync.js`), od drift through 06-pull. Never a
  regenerate storm.

## Verify before any completion claim
Before "done/synced/rendered": name the exact check, run it **this turn**, read the full output (exit code,
the `✓/✗`/`[TAG]` lines, the verdict JSON). "Synced" specifically requires `ods-upload-verify.js` exit 0
against the agent-saved `remote-files.json` — an executed plan without the verify is not synced. For a
delegated artifact, **read the generated file yourself** — don't trust a worker's "done" string. State the
claim *with* evidence.

## Grounded truth only (never act on memory)
Record/apply a token, hex, path, or signal only after reading it from the repo **this turn** (a CSS block, a
`tokens.json`, `signals.json`). "The bg is probably white" is a hypothesis — read it. Invent no hex, token
name, or path the source lacks. Workers return **evidence** (the value + where they read it), not assertions.

## Delegation — orchestrate (you are the team lead)
Delegate verbose (whole-repo scan) or independent (one phase, one ambiguous token source) work to
`sync-dsh-worker` / `sync-dsh-extractor` subagents. **Every dispatch needs a 4-part spec:** objective · output format
(+ where to write) · tools/sources (incl. any `resolvedDir`/`previewUrl` you bridged from MCP) · boundaries.
Cap **5**. On return, read summaries only, reconcile conflicts, then the **lead alone** updates shared state
(manifest, INDEX). Hand a worker the work product, never your chat history.
