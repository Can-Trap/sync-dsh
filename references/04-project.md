# Phase 04 — Settle the OD project target (agent bridges MCP; pin BEFORE anything uploads)

> **Mode A** (project). Runs in Mode A and in the default BOTH; skipped when the user asked only for a design system (Mode B).

This phase is **agent-only** — scripts never call MCP. YOU settle which Open Design project this
repo syncs to, pin it, and cache the facts the scripts need.

Announce: `Sync-DSH: project — settling OD target for <name>`.

## Target settlement precedence (strict order — stop at the first rung that holds)

1. **Pinned** — `.design-sync/config.json` has `projectId`: call OD MCP `get_project` with it and
   confirm it still exists; mention which project you are syncing to ("syncing to <name>
   (<projectId>)"). Re-ask the user **only if the project is gone** — never re-settle a live pin.
2. **Fresh** (the first-time default) — no pin: `list_projects`, pick a name that does not
   collide with an existing project (suffix if needed), then `create_project`. If creation is
   denied/fails → **STOP and ask** — never silently fall through to adopting someone's project.
3. **Re-adopted** — never unprompted: the user must have **explicitly requested** syncing into an
   existing project, and must first hear a plain-language warning: *"syncing may replace or remove
   files in that project"*. Never adopt by name-match guesswork.

## Pin-at-settlement rule

**As soon as the target is decided, write `projectId` into `.design-sync/config.json` — no upload
may happen until that pin exists.** A crash after upload but before pinning orphans the project; a
pin costs one line. (Post-upload verify re-records it only as a backstop.)

## Cache the facts (agent-written, machine-local)

From the `create_project`/`get_project` response, write
`.design-sync/.cache/od-project.json`:
```json
{ "projectId": "…", "resolvedDir": "…", "previewUrl": "…", "rawBase": "/api/projects/<id>/raw" }
```
Scripts read this file (`ods-build.js` takes `rawBase` from it when `--base` is omitted;
`ods-upload-plan.js` takes `projectId`). Also mirror the same facts into `.design-sync/MAP.md`
for humans — MAP.md is the readable note, `od-project.json` is the mechanical copy.

**Never guess `resolvedDir`.** It comes only from an MCP response. If you don't have it, call
`get_project` again — a guessed path can point the push at the wrong directory.

## When MCP tools are NOT available (file-system fallback)

When OD MCP tools are unavailable, Phase 04 cannot call `create_project`. Use this fallback:

1. **Find the data root.** The OD data root is at:
   `C:\Users\<user>\AppData\Roaming\Open Design\namespaces\release-stable-win\data`
   (override with `OD_DATA_ROOT` env var). Under it, `projects/` holds all project directories
   and `app.sqlite` is the OD database.

2. **Pick a project ID.** Check existing dirs under `projects/`; pick a slug that doesn't collide
   (append `-N` suffix if needed). Prefer kebab-case matching the repo name.

3. **Create the project directory:** `mkdir -p "<dataRoot>/projects/<projectId>"`.

4. **Register in the SQLite DB.** OD does NOT discover projects from disk alone — the
   `projects` table in `app.sqlite` is the authority. A project that exists only on disk
   will NOT appear in the OD UI.

   **Node.js (if better-sqlite3 is available):**
   ```js
   const Database = require('better-sqlite3');
   const db = new Database('<dataRoot>/app.sqlite');
   db.prepare(`INSERT INTO projects (id, name, metadata_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`).run(projectId, projectName,
     '{"skipDiscoveryBrief":true}', Date.now(), Date.now());
   db.close();
   ```

   **Python fallback (always available):**
   ```python
   import sqlite3, time
   db = sqlite3.connect('<dataRoot>/app.sqlite')
   now_ms = int(time.time() * 1000)
   db.execute('INSERT INTO projects (id, name, metadata_json, created_at, updated_at) VALUES (?,?,?,?,?)',
     (projectId, projectName, '{"skipDiscoveryBrief":true}', now_ms, now_ms))
   db.commit(); db.close()
   ```

   The `projects` table schema (relevant columns):
   `id TEXT PRIMARY KEY, name TEXT, skill_id TEXT, design_system_id TEXT,
   pending_prompt TEXT, metadata_json TEXT, created_at INTEGER,
   updated_at INTEGER, custom_instructions TEXT, applied_plugin_snapshot_id TEXT`

5. **No restart needed.** OD reads the SQLite DB live — the project appears immediately.

6. **Continue with the rest of Phase 04** (cache `.design-sync/.cache/od-project.json`, mirror MAP.md).

See `references/mcp-contract.md` for the verified OD MCP facts. OD indexes project *files* by
scanning the directory — but the project itself must first be registered in the DB (Phase 04),
or the scan has nothing to scan.

## DONE-gate

Phase 04 is DONE only when: an OD project exists and is confirmed, `projectId` is pinned in
`.design-sync/config.json`, `.design-sync/.cache/od-project.json` holds
`projectId/resolvedDir/previewUrl/rawBase`, MAP.md mirrors them, and
`.design-sync/reports/04-project.md` exists. A settled target with no pin is NOT done.
