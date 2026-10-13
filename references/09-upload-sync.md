# Phase 09 — Upload + Sync (driver → plan → agent MCP execution → verify → manifest)

The final phase: run the driver as the session's last build, hand its plan to the OD MCP, verify the
result, record the src↔od pairs, and check drift. Nothing in this phase is hand-authored — scripts
plan and verify; you execute and approve.

Announce: `Sync-DSH: upload-sync — <n> files → <projectName>`.

## Order of operations

1. **Conventions check.** `.design-sync/conventions.md` authored (or re-validated) and wired via
   config `readmeHeader` — BEFORE the driver run (`references/03-design-system.md`). If it was just
   authored/changed, the driver run below IS the required rebuild.
2. **Driver — the session's FINAL build** (`references/resync-protocol.md`). Re-sync: fetch the
   remote anchor first (OD MCP `get_file("_ods_sync.json")` → `.design-sync/.cache/remote-sync.json`;
   missing remotely → run without `--remote`):
   ```
   node .ds-sync/ods-resync.js --config .design-sync/config.json --root . --out ./od-bundle \
     [--remote .design-sync/.cache/remote-sync.json] [--base <rawBase>]
   ```
   Requires verdict `ok:true`, `verification.pendingGrade` empty, no `[LEARNINGS_UNMERGED]`.
   `verification.removed` non-empty → confirm the deletions with the user first.
   `upload.any:false` → **steps 3–6 do not run** (remote content is already identical); the close-out
   still runs. Never follow the driver with a bare `ods-build.js` — it wipes `.sync-diff.json`.
3. **Upload plan (script):**
   ```
   node .ds-sync/ods-upload-plan.js --out ./od-bundle
   ```
   Emits `od-bundle/.upload-plan.json` — sentinel → content → deletes → re-arm → anchor LAST. It
   refuses a stale build (`[SYNC_STALE]`).
4. **Agent MCP execution.** ONE plain-language approval, then execute the plan entries in order over
   the OD MCP — exact sequence, actor table, and STOP-no-anchor semantics in
   [upload-protocol.md](upload-protocol.md). Any uncleared failure → STOP: no re-arm, no anchor.
5. **Post-upload verify.** `list_files(project)` → save `.design-sync/.cache/remote-files.json`, then:
   ```
   node .ds-sync/ods-upload-verify.js --plan od-bundle/.upload-plan.json \
     --remote .design-sync/.cache/remote-files.json
   ```
   Must exit 0 before anything is reported as synced.
6. **Manifest pairs + drift gate:**
   ```
   node .ds-sync/ods-manifest.js add --pair <srcPath>::<odPath>
   node .ds-sync/ods-manifest.js drift
   ```
   Record each source file against its `od-bundle/` rendered counterpart (or OD path). `drift` must
   print `clean` (exit 0).

## Drift dispatch (what a moved hash means)

- **`src:true`** — source moved → re-run the forward pipeline via the **driver** (`ods-resync.js`);
  it rebuilds, re-diffs, re-validates, and re-scopes grading in one pass.
- **`od:true`** — a designer edited in OD → pull it back through the **06-pull review gate**
  (`references/06-pull.md`) — never auto-apply.
- **Both** — surface the conflict; the user picks a winner before either side is written.

Coalesce ALL drift first, then run each affected phase once — never a regenerate storm.

## Close-out (after verify exit 0, in order)

1. Record `projectId` in `.design-sync/config.json` if absent/different (backstop — settlement
   pinned it in 04).
2. **Receipt:** report the counts from `od-bundle/.render-check.json`
   (`total`/`bad`/`thin`/`variantsIdentical`/`iterations`), the `previewUrl`, and the DS reload
   caveat (OD loads the DS catalog at startup).
3. **Durable-set commit offer:** offer ONE commit of `config.json` + `NOTES.md` + `conventions.md`.
4. **Handoff audit:** read `NOTES.md` back **through the eyes of whoever runs the next sync** — is
   enough on the page that this run's debugging never needs repeating? The **Re-sync risks** section
   and the **Known render warns** list must exist and be current; every `[!]` box, every override
   added this run, and every triaged warn is written down, not just remembered.

## DONE-gate

Phase 09 is DONE only when: the final driver verdict is `ok:true`, the plan executed in sequence
(or was legitimately skipped on `upload.any:false`), `ods-upload-verify.js` exited 0,
`ods-manifest.js drift` prints `clean`, and the report `.design-sync/reports/09-upload-sync.md`
exists. An anchored upload that was never verified is NOT done.
