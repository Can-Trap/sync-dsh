# Resync protocol — `ods-resync.js`, THE driver

One command chains the whole mechanical pipeline and prints ONE verdict. The session's **final
build must always be a driver run** — a bare `ods-build.js` wipes `.sync-diff.json`, leaving the
upload plan with no deletes and no receipt.

```
node .ds-sync/ods-resync.js --config .design-sync/config.json --root . --out ./od-bundle \
  [--remote .design-sync/.cache/remote-sync.json] [--base <rawBase>]
```

## Stage chain + gating

| # | Stage | Command | Runs when |
|---|---|---|---|
| 1 | build | `ods-build.js --config … --root … --out … [--base …]` | always |
| 2 | diff | `ods-diff.js --local <out> [--remote …]` | build green |
| 3 | validate | `ods-validate.js <out> --config <config>` | diff green |
| 4 | capture | `ods-capture.js --out <out> --pages <changed ∪ added>` | validate green AND worklist non-empty (else `skipped:"empty_worklist"`) |

- Stage scripts resolve **next to the driver's own file** — a staged `.ds-sync/` copy runs its
  own siblings, never the skill originals.
- Child stdout is piped to the driver's stderr; **driver stdout is verdict-only**.
- A failed stage stops the chain; the remaining stages record `skipped:"prior_failure"`.
- Capture is always **scoped** (`--pages`) — it never prunes and never warn-scans; the driver
  runs its own learnings gate instead.

**Stale-artifact gate**: never read a stage's artifact unless that stage ran green THIS run —
`.sync-diff.json` only after a green diff, `_ods_sync.json` (for `shape`) only after a green
build. Diff green but its artifact unreadable → treated as a failure (capture `prior_failure`,
exit 1), never a shrug.

## Exit-code contract

| Exit | Meaning |
|---|---|
| 0 | verdict `ok:true` |
| 1 | a stage failed or a gate fired (learnings, unreadable diff artifact) — **verdict IS written** |
| 2 | usage/pre-flight: missing `--config/--root/--out`, config path not found, no `.design-sync/` under cwd, config JSON valid but `validateConfig` rejects it — **NO verdict; nothing was built** |

The driver's exit mirrors the FIRST failure's exit, with child exit 2 **clamped to 1** — 2 stays
the usage discriminator. Unparseable config JSON is deliberately a *build-stage* failure (exit 1,
verdict written), not a pre-flight. Unknown CLI args warn and are ignored.

## Verdict schema v1 — stdout + best-effort `<out>/.resync-verdict.json`

```json
{
  "version": 1, "ok": true, "shape": "app",
  "anchor": "ok" | "not_provided" | "unreadable" | "malformed" | "shape_changed" | "unknown",
  "learningsUnmerged": [],
  "stages": { "build": S, "diff": S, "validate": S, "capture": S },
  "verification": { "unchanged": [], "changed": [], "added": [], "removed": [], "pendingGrade": [] },
  "upload": { "any": true, "pages": [], "files": [], "deletePaths": [], "styling": false }
}
```

`S = {ok: bool|null, exit: int|null, skipped: null|"prior_failure"|"empty_worklist"}`.
`ok` ⇔ every ran stage green, no `prior_failure` skip (`empty_worklist` is fine), and
`learningsUnmerged` empty. `pendingGrade` is **not** a failure. `upload: null` ⇔ diff produced
no artifact this run — `ok:false`, do not upload. `anchor:"unknown"` means a `--remote` was
passed yet no diff artifact exists to read; `"not_provided"` = no `--remote`. The verdict file is best-effort:
the driver never creates `<out>` for it, and a file-write failure never masks the stdout verdict
or changes the exit code.

## The two diff partitions — NEVER conflated

- **Verification partition** (`unchanged/changed/added/removed`, keyed by sourceKeys or
  renderHashes): which pages need re-grading. Drives capture's worklist and `pendingGrade`.
- **Upload partition** (`upload.*`, keyed by `sourceHashes`): which files ship and which remote
  paths die. Drives the upload plan.

The verification partition must never determine upload scope — the plan always writes everything
(idempotent full writes); `upload.any`/`deletePaths` drive skip/deletes only.

## Hash recipes

Every hash the driver's stages rely on comes from `scripts/_hashes.js` — the single source of
truth. **NEVER fork it**; when a hash's inputs change, the `KEY_RECIPE` bump must land in that
same commit — keeping the number while the hashed bytes shift means every consumer's stored keys
stop matching at once, mass-clearing their grades. Summary: `styleSha`
(css + tokens, 64 hex), `renderHashes` (page html after the first-line marker, 16 hex),
`sourceKeys` (recipe + config slices + source bytes, 16 hex, null-fallback to renderHashes),
`sourceHashes` (every non-dot bundle file, 12 hex), `gradeKeyFrom` (16 hex).

## Anchor invariants

- The remote anchor (`_ods_sync.json` in the OD project) vouches **only for a fully-applied
  upload** — it is written absolutely last; abort partway and no anchor remains, which is exactly
  the intended failure posture (with nothing to trust, the following sync re-checks every page).
- The anchor is fetched by the **agent** via OD MCP `get_file("_ods_sync.json")` and saved to
  `.design-sync/.cache/remote-sync.json` **BEFORE** the driver runs; scripts never call MCP.
  Missing remotely → run without `--remote` (full first-sync scope).
- Every non-ok anchor reason (`unreadable`/`malformed`/`shape_changed`) degrades to no-anchor —
  full scope, never fatal.

## Verdict field → your work

| Field | Your work |
|---|---|
| `ok:false` | fix the first failed stage (its `[TAG]` output is on stderr), re-run the driver |
| `learningsUnmerged` non-empty | fold each `learnings/*.md` into NOTES.md, delete the files, re-run |
| `verification.pendingGrade` non-empty | grade those pages (light+dark cells) per references/08-grade.md |
| `verification.removed` non-empty | confirm the deletions with the user before uploading |
| `upload.any:false` | no upload step runs — remote content already equals the bundle |
| `upload.any:true` | proceed to `ods-upload-plan.js` + the upload protocol (references/upload-protocol.md) |
