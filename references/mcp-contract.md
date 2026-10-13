# MCP Contract — the verified Open Design facts the skill relies on

Open Design (OD) is a **local-first** design workspace: a local Express daemon plus an on-disk data root.
This file pins the OD behaviors the skill depends on and the tool surface the **agent** uses. **Scripts
never call MCP** — they do disk I/O at OD paths and HTTP `GET` against a passed `previewUrl`; the agent
bridges MCP facts (`resolvedDir`, `previewUrl`, raw base) into script args.

## Verified OD behaviors (the load-bearing four)
1. **Disk-scan indexing within a registered project.** OD indexes *files* by scanning a project's
   directory — but only once the project **exists in `app.sqlite`** (the `projects` table). Placing
   files under `resolvedDir` (Phase 05 push) is enough for OD to pick them up, but the project
   registration itself must happen first (Phase 04). When MCP is unavailable, Phase 04 must
   `INSERT INTO projects` directly — see `references/04-project.md` for the fallback path.
2. **Entry auto-detect.** OD auto-detects the project entry (a root `index.html`). `ods-push.js` guarantees
   one exists (placeholder if needed); `ods-render.js` replaces it with the OD-safe entry.
3. **Catalog-at-startup (reload required).** OD loads the **design-system catalog at startup**. A DS written
   by `ods-build-design-system.js` will NOT appear in the OD picker until Open Design is reloaded — always
   surface this notice (the script prints it).
4. **OD-safe render constraint.** The OD viewer serves static files and blocks external `<script src>`.
   Rendered HTML must inline its CSS, strip external JS, and carry only the self-contained `ODS_RUNTIME`
   inline script — that's the whole job of `ods-render.js` / `odSafe` (Phase 07), enforced by `ods-verify.js`
   (Phase 08).

## Data root + paths (what the scripts touch on disk)
`_lib.odDataRoot()` locates `…/Open Design/namespaces/<ns>/data` (override with `OD_DATA_ROOT`). Under it:
`design-systems/<id>/` (DESIGN.md + tokens.json — written by Phase 03) and `projects/<id>/` (the project
dir — but always prefer the **`resolvedDir` the MCP returns**, don't guess the path).

**SQLite DB.** `app.sqlite` in the data root holds the `projects` table (and others). Relevant columns:
`id TEXT PRIMARY KEY, name TEXT, skill_id TEXT, design_system_id TEXT, pending_prompt TEXT,
metadata_json TEXT, created_at INTEGER, updated_at INTEGER, custom_instructions TEXT,
applied_plugin_snapshot_id TEXT`. The `projects` table is the authority for which projects exist in OD —
a directory under `projects/` without a DB row will NOT appear in the UI. Timestamps are Unix ms.

## The agent's MCP tool surface (agent-only, never a script)

**OD MCP (default):**
- **`create_project` / `get_project`** → the source of `resolvedDir` (on-disk dir) + `previewUrl` (daemon URL
  for the entry) + the raw base (e.g. `/api/projects/<id>/raw`). Phase 04.
- **`list_projects`** — discover existing projects. · **`get_active_context`** — the project/file open in OD
  now (many read tools default to it).
- **`get_artifact` / `get_file` / `list_files` / `search_files`** — pull design context back (read side of a
  pull; `get_artifact` returns the entry + referenced siblings in one call).
- **`write_file` / `create_artifact` / `delete_file` / `delete_project`** — mutate OD directly when the agent
  (not a script) needs to; prefer the scripts for the push/render pipeline.

**DesignSync MCP (if available — provides batch operations):**
- **`finalize_plan`** → returns a `planId` and presents the upload manifest for one-time approval.
- **`write_files`** → batch write (array of `{path, localPath}`, 230+ files per call).
- All OD MCP tools above are also available.

The agent checks which MCP surface is available at startup and uses the appropriate upload path.
Both paths follow the same fixed sequence; the batch path is faster but functionally identical.

## The bridge rule (why this split exists)
Scripts stay pure + testable (disk + HTTP only); the agent owns the MCP round-trips and passes their results
in as `--project-dir <resolvedDir>`, `--dir <resolvedDir>`, `--base <rawBase>`, `--preview-url <previewUrl>`.
Record those facts in `.design-sync/MAP.md` so a later run re-anchors without another MCP call.

## The upload bridge (scripts plan + verify; the agent executes)
Scripts never call MCP for the upload either — the bridge is file-shaped, in both directions:
- **Anchor fetch (agent, re-sync only):** `get_file("_ods_sync.json")` → save verbatim to
  `.design-sync/.cache/remote-sync.json` BEFORE the driver run; the driver passes it as `--remote`.
- **Plan (script):** `ods-upload-plan.js` emits `od-bundle/.upload-plan.json` — the fixed sequence
  sentinel → content → deletes → re-arm → anchor LAST.
- **Execute (agent):** one `write_file` per `op:"write"` entry (read the `local` bytes, use `path`
  verbatim), one `delete_file` per `op:"delete"` entry, in plan order. Any uncleared write/delete
  failure → STOP: no re-arm, no anchor. See [upload-protocol.md](upload-protocol.md).
- **Verify (agent then script):** `list_files(project)` saved to
  `.design-sync/.cache/remote-files.json`; `ods-upload-verify.js --plan … --remote …` must exit 0
  before anything is reported as synced.

Note: `_ods_needs_recompile` (sentinel) and `_ods_sync.json` (anchor) are **inert extra project
files to OD itself** — the daemon just indexes them like any other file. The sequencing protects
**sync integrity** (a trustworthy anchor over a fully-applied upload), not OD internals.
