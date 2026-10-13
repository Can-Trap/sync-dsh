---
description: Sync current codebase to Open Design — extract tokens, push files, pull edits
---

Use the **sync-dsh skill** to sync the current project to Open Design. Follow the skill's pipeline (see `SKILL.md` for full details):

**Quick Start:**
1. Run `/sync-dsh` — the skill activates and guides you through the full pipeline
2. Or run phases manually via staged scripts in `.ds-sync/`

**Modes (set via `--mode` or skill decides):**
- `project` — sync codebase to OD project (phases 00-02, 04-09)
- `design-system` — extract DESIGN.md + tokens (phases 00-03)  
- `both` (default) — design system first, then project sync

**If `.design-sync/` doesn't exist:** run `node .ds-sync/ods-init.js --project <name>` first.

**Key scripts** (staged to `.ds-sync/`):
- `ods-detect.js` — detect stack/theme/nav/effects
- `ods-extract-tokens.js` — extract light+dark tokens
- `ods-build-design-system.js` — build DESIGN.md + tokens.json
- `ods-build.js` — build OD-safe `od-bundle/`
- `ods-validate.js` — validate bundle (links, nav, effects, theme, od-safe)
- `ods-capture.js` — grade light+dark cells
- `ods-resync.js` — driver (final build + diff)
- `ods-upload-plan.js` — generate upload plan
- `ods-upload-verify.js` — verify upload
- `ods-manifest.js` — track src↔OD pairs
- `ods-pull.js` — pull designer edits (review gate)

**Upload** uses OD MCP tools: `list_files`, `write_file`, `delete_file` (or DesignSync MCP: `finalize_plan`, `write_files` batch).

Always work **one phase at a time** and report results after each step.
