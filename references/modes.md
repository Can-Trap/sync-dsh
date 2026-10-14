# Modes — Mode A vs Mode B vs both (deterministic)

Sync-DSH does two separable things. This file decides **which** for the current run and, once decided, tells
you **exactly which of phases 00–09 run vs skip** — over the **same** vendored scripts. No judgement is left
to you: match a row, read the mode, run the phase list. Write the result to `config.mode` so it is never
re-decided (`references/00-bootstrap.md`).

## The two modes

- **Mode A — PROJECT sync.** The codebase becomes an OD **project**: build `od-bundle/` OD-safe pages (renders
  of the repo's own HTML, CSS inlined from disk), upload them, grade light+dark, keep in sync. Deliverable =
  a live OD project at `previewUrl`. Mode A does **not** publish a standalone `DESIGN.md`.
- **Mode B — DESIGN-SYSTEM sync.** The codebase's tokens become an OD **design system**: `DESIGN.md`
  (Color light+dark, Links, Navigation, Effects/Motion, Theme) + `tokens.json`. Deliverable = the DS entry
  under `<odDataRoot>/design-systems/<id>/`. Mode B creates **no OD project** and **uploads nothing**.
- **both (default).** Do Mode B, then Mode A. Deliverable = DS entry **and** live project.

## Decision table (settle the mode — first matching row wins)

Read top to bottom; stop at the first row that matches. Inputs: the **request phrasing** and, if
`.design-sync/config.json` already exists, **`config.mode`** / **`config.shape`**.

| # | Signal (request phrase or config) | Mode |
|---|---|---|
| 1 | `config.mode` is already `A` \| `B` \| `both` | use it verbatim (paid-for decision — never re-derive) |
| 2 | "design system", "DESIGN.md", "tokens", "extract the design system", "just the DS/tokens", "token light+dark" | **B** |
| 3 | "sync the codebase", "create/sync an OD project", "push the app/site to Open Design", "make a project", "the pages", "upload the site" | **A** |
| 4 | "both", "design system and project", "everything", "full sync" | **both** |
| 5 | request names a project target to adopt/pin, or `config.projectId` exists | **A** (project is already the intent) |
| 6 | request is only "sync-dsh" / "/sync-dsh" / no task, and no config | **both** (default) |
| 7 | anything else / ambiguous | **both** (default — never stall to ask; both is the safe superset) |

`config.shape` (`static` / `app`, set by 01-detect) does **not** change the mode — it only tunes how Mode A
renders pages (`references/05-build.md`). A `static` site and an `app` are both valid Mode A targets.

**Shape mapping to Anthropic convention:** Our `static` ≈ Anthropic's `package` (no Storybook, converter
scripts). Our `app` ≈ Anthropic's `storybook` (has Storybook as fidelity oracle). If cross-referencing
Anthropic docs, translate accordingly.

Once settled, **write it**: `config.mode = "A" | "B" | "both"`. If the user later corrects the mode, update
`config.mode` immediately (Golden rule 10) and re-run `ods-status.js` — the INDEX is re-seeded to the new
phase set.

## Which phases run vs skip (the whole point)

Same scripts, different subset. `✓` = run this phase; `—` = skip it. `ods-init.js --mode <A|B|both>`
seeds `tasks/INDEX.md` so skipped phases start pre-checked `[x] (skipped: mode <X>)` — the loop's
"first `[ ]`" pointer never lands on them and the "every box `[x]`" DONE part still terminates.

| Phase | Mode B (DS) | Mode A (project) | both |
|---|:--:|:--:|:--:|
| **00-bootstrap** | ✓ | ✓ | ✓ |
| **01-detect** | ✓ | ✓ | ✓ |
| **02-extract** | ✓ | ✓ | ✓ |
| **03-design-system** | ✓ | **—** | ✓ |
| **04-project** (MCP) | **—** | ✓ | ✓ |
| **05-build** | **—** | ✓ | ✓ |
| **06-pull** (drift only) | **—** | ✓ (on drift) | ✓ (on drift) |
| **07-validate** | **—** | ✓ | ✓ |
| **08-grade** | **—** | ✓ | ✓ |
| **09-upload-sync** | **—** | ✓ | ✓ |

Why each skip is safe:

- **Mode A skips 03.** Mode A's `od-bundle/` pages are OD-safe **renders of the repo's own HTML** with CSS
  inlined from disk (05 step 5) — they never consume `DESIGN.md`. `tokens.json` (02) is still needed for the
  anchor's `tokensSha` (05 step 6), so **02 always runs**. If the user later wants the DS too, that's a
  re-run as **both** (03 gets added; 02's tokens are reused).
- **Mode B skips 04–09.** No OD project is created, so nothing settles (04), builds (05), validates (07),
  grades (08), or uploads (09); there is no remote pair to drift/pull (06). The DS is written to disk by 03
  and that is the entire deliverable.
- **All three run 00–02.** Bootstrap seeds state; detect fills `shape`/`stack`; extract produces the
  light+dark tokens every mode's deliverable depends on (DESIGN.md for B/both, the anchor for A).

## DONE, per mode (which parts of the four-part DONE apply)

The SKILL.md DONE boolean has four parts: (1) INDEX all `[x]`, (2) final `ods-resync.js` verdict `ok:true`,
(3) `ods-upload-verify.js` exits 0, (4) `ods-manifest.js drift` prints `clean`.

- **Mode B (DS):** only part **(1)** applies, and it reduces to the **03 DONE-gate** — `DESIGN.md` exists at
  `<odDataRoot>/design-systems/<id>/DESIGN.md` with Color/Links/Navigation/Effects/Theme and a Theme
  section that matches `tokens.json` (single-theme said out loud when `dark` mirrors `light`), and
  `tokens.json` sits beside it. Parts 2–4 do not exist (no driver, no upload, no manifest). Close-out = the
  DS-reload caveat + a report; no upload-verify, no commit-offer of a `projectId`.
- **Mode A (project):** all four parts apply, **minus 03's gate** (03 is skipped). DONE = INDEX all `[x]`
  (03 pre-checked as skipped) + driver `ok:true` + upload-verify 0 + drift `clean`.
- **both:** all four parts apply in full, including 03's gate.

## Announce (per mode)

- Mode B: `Sync-DSH: design-system — <name>` … then the 00–03 loop; finish at 03.
- Mode A: `Sync-DSH: project — <repo> → od-bundle/` … then 00–02 + 04–09.
- both: `Sync-DSH: bootstrap — <repo>` (the standard opener) … then all of 00–09.
