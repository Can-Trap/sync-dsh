# Phase 06 — Pull OD edits back into source (managed blocks + review gate)

Bring a designer's OD edits back into the codebase **safely**: the OD file's content lands inside a
`design-sync:start:<name> … design-sync:end:<name>` managed block, and everything outside the block —
human-written source — is preserved byte-for-byte. **Review is mandatory before any write.**

Announce: `Sync-DSH: pull — OD → <srcFile> (review)`.

## Command
```
# 1. REVIEW (no write) — prints the OD content that would be embedded, exits 2
node <skill>/scripts/ods-pull.js --od <odFile> --src <srcFile> --name <block>

# 2. APPLY (only after you have seen + accepted the diff)
node <skill>/scripts/ods-pull.js --od <odFile> --src <srcFile> --name <block> --apply
```
- Without `--apply`: prints the first ~40 lines of the OD content and **exits 2** (review gate) — the source
  file is untouched.
- With `--apply`: inserts or replaces the named managed block idempotently; content outside the block is
  never clobbered.
- No change to make → exits 0 ("no change").

## Rules
- **Never skip the review exit-2.** Show the user the diff; apply only on acceptance
  (`references/self-management.md`).
- One OD file ↔ one source file ↔ one block `name`. Record the pair in the manifest (Phase 09) so drift is
  tracked.

## DONE-gate
Phase 06 is DONE only when the intended source file carries the `design-sync:start:<name>` block with the OD
content, the human text around it is intact, the report `.design-sync/reports/06-pull.md` exists, and the
review step was seen before `--apply`. A silent overwrite is NOT done — it's a defect.
