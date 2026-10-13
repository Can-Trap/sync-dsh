# Upload Protocol — agent-bridged, fixed sequence, STOP-no-anchor

Scripts never call MCP. `ods-upload-plan.js` prepares `.upload-plan.json`; the **agent** executes
it over the OD MCP in the exact order below; `ods-upload-verify.js` checks the result against the
agent-saved `list_files` listing. The anchor (`_ods_sync.json`) lands **absolutely last** — it is
the remote's claim "everything above is fully applied", and stamping it onto a partially-landed
upload causes damage no later run can repair.

## MCP surface variants

**DesignSync MCP** (if available): `finalize_plan` → approval → `write_files` (batch, 230+ files per call).
**OD MCP only** (default): agent reads `.upload-plan.json` → approval → `write_file` one at a time.

Both paths follow the same fixed sequence. The batch path is faster but functionally identical.

## Preconditions (agent checks before step 3)

- The project is **registered in OD's SQLite DB** (`app.sqlite`, `projects` table). When MCP is
  available, `create_project` (Phase 04) handles this. When MCP is unavailable, Phase 04 must
  `INSERT INTO projects` directly — see `references/04-project.md` fallback. A project that
  exists only on disk (unregistered) will NOT appear in the OD UI even if files land correctly.
- The session's **final build was a driver run** (`ods-resync.js`) with verdict `ok:true`,
  `verification.pendingGrade` empty, and no `[LEARNINGS_UNMERGED]`.
- The conventions header was authored (or re-validated) BEFORE that driver run.
- `upload.any === false` → **no upload happens at all** — remote content is already identical to
  the bundle; the close-out audit still runs.

## Who does what

| # | Actor | Action |
|---|---|---|
| 0 | agent | (re-sync only) fetch the remote anchor: OD MCP `get_file("_ods_sync.json")` → save `.design-sync/.cache/remote-sync.json` — BEFORE the driver run. Missing remotely → no anchor, full first-sync scope. |
| 1 | script | `ods-resync.js … [--remote .design-sync/.cache/remote-sync.json]` → verdict `ok:true` + fresh `.sync-diff.json`. The session's FINAL build is always the driver. |
| 2 | script | `ods-upload-plan.js --out ./od-bundle` → `.upload-plan.json` (sentinel → content → deletes → re-arm → anchor). |
| 3 | agent | **Finalize plan** — if DesignSync MCP: `finalize_plan` returns `planId` and presents manifest. If OD MCP only: read `.upload-plan.json` and summarize. |
| 4 | agent | ONE plain-language approval ("I'll now write N files into the OD project and delete M stale ones"). Denied → STOP and ask; never silently continue. |
| 5 | agent | **Sentinel FIRST** — `write_file("_ods_needs_recompile", …)`. |
| 6 | agent | **Content in bulk** — DesignSync MCP: `write_files` (batch array of `{path, localPath}`). OD MCP: `write_file` one at a time. Any uncleared failure → **STOP: no re-arm, no anchor**. |
| 7 | agent | **Deletes** — `delete_file` each `stage:"delete"` entry. A not-found rejection is the ONLY continuable failure (retry without it). |
| 8 | agent | **Sentinel re-arm** — `write_file("_ods_needs_recompile", …)` again. |
| 9 | agent | **Anchor LAST** — `write_file("_ods_sync.json", …)` — **absolutely last, its own call**. |
| 10 | agent | `list_files(project)` → save `.design-sync/.cache/remote-files.json`. |
| 11 | script | `ods-upload-verify.js --plan od-bundle/.upload-plan.json --remote .design-sync/.cache/remote-files.json` → exit 0. |
| 12 | agent | Only now: record `projectId` in `.design-sync/config.json` if absent/different (backstop — settlement pinned it in 04); report previewUrl + `.render-check.json` counts; handoff audit; offer the durable-set commit. |

## Abort semantics

When a run dies partway through, the project ends up with **no anchor** — and that is precisely
where a failed run is supposed to land: with nothing trustworthy to anchor against, the following
sync treats the whole project as unverified and checks everything again. Write a new anchor over a
partially-landed upload and every diff from then on is built on false history — hence
STOP-no-anchor. Never write the anchor to "clean up" a failed run.

## Plan guards (what the scripts refuse)

- `ods-upload-plan.js` refuses a stale build: it recomputes `renderHashFor` for every sidecar
  page and any mismatch is `[SYNC_STALE]` → "stale build — run the driver", exit 1.
- Missing `.sync-diff.json` → loud warn "no diff — deletes unknown; run ods-resync.js" and the
  plan carries `deletePaths: []` (writes still safe; stale remote files may linger).
- `ods-upload-verify.js` passes only when every `expectRemote` path is present remotely AND no
  plan deletePath survives; otherwise it lists the missing/surviving paths and exits 1.
