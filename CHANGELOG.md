# Changelog

All notable changes to `sync-dsh` are documented here.

The `scripts/` pipeline, most of `references/`, the agent playbooks and the phase model derive from
an earlier MIT-licensed sync plugin, whose notice is reproduced in [`NOTICE`](NOTICE). Entries below
record what this implementation changed; everything it inherited came across essentially intact.

## Unreleased

### Fixed

- **An unpinned run acted on the wrong directory.** `directoryFor` (and the `/sync` handler) read the
  session cwd from `exec.agent.meta.cwd`, which no DeepSeek Harness `Agent` has — the seam is
  `exec.agent.session.header.cwd`, the one `dsh-tool-fs` reads. The lookup therefore always missed and
  every run fell back to `process.cwd()`: the directory the `dsh` server was launched from, not the
  one the session is working in. With no explicit `directory`, `status` reported a fresh project and
  offered to bootstrap `.design-sync/` in the *server's* launch directory. Both call sites now use the
  real seam, and a test pins it (it fails against the previous code).
- **The drift check died on a TypeError instead of checking anything.** `ods-manifest.js` read its
  ledger with `readJSON(mf, { pairs: [] })`, which falls back only when the file is missing or is
  invalid JSON. A `manifest.json` that *parses* but is not a ledger reached `for (const p of data.pairs)`
  and threw `data.pairs is not iterable` — the real failure was a stray `{"error":"query_timeout"}` left
  in a project's `.design-sync/manifest.json`. The loader now validates the shape and exits **2** with
  `[MANIFEST_CORRUPT]` plus the key it found instead of `pairs`; `{}` and a bare array still read as an
  empty/pairs ledger. Exit status is now: `0` clean, `1` drift (a vanished file counts, and says
  `missing`), `2` unusable — so "I could not check" can never read as "nothing changed".
- **`ods-build-design-system.js` wrote a `DESIGN.md` that lied about the theme.** The Theme section was a
  fixed template asserting "Light and dark are both defined… `[data-theme-toggle]` … persists to
  localStorage" for *any* token set, including single-theme ones, and the colour table printed
  `var(--page)` — an unresolved reference — as if it were a value. Open Design reads `DESIGN.md` as agent
  instructions, so this actively misled downstream work. The document is now derived: literal colours are
  swatches, `var(--…)`/lengths/font stacks are labelled as bindings, and the Theme section compares
  `dark` against `light` — when they are identical or `dark` is absent it says the system is
  single-theme, that the runtime has nothing to switch to, and that a dark variant must not be invented.
  Links/Navigation/Effects are labelled as house conventions rather than observations. `test/ds.test.js`
  was itself pinning the false claim (`assert.match(md, /data-theme/)`), and `references/03-design-system.md`,
  `SKILL.md`, `references/modes.md`, `references/RUNBOOK.md` and `assets/graphs/task-tree.md` all demanded
  a `data-theme` reference as a DONE-gate; all six now gate on the Theme section *matching the tokens*,
  so the next agent cannot "fix" the generator back into lying. The script also warns before replacing a
  `DESIGN.md` that carries no `> Category: Generated` marker, so a hand-authored system in the OD data
  root cannot vanish without a word.
- **`--project` was silently dropped, and a name on record could be reset.** Every ods script parsed
  arguments with a private `process.argv.indexOf(k)`, which only understands `--key value` split across
  two array entries. A caller without a shell (a tool passing an `args` array, a `spawn` without
  `shell: true`, an agent that quoted the whole command line) delivers the command as one entry, the flag
  is invisible, and the script falls back to its default — which is how a real project came to be named
  `project`. All 14 scripts now share one `arg()`/`argValue()` in `_lib.js` that reads `--key value`,
  `--key=value` and a joined quoted entry. `ods-init.js` also treats an explicit `--project` as
  authoritative on a re-sync (updating `projectName` while preserving `projectId` and every other field),
  keeps the recorded name when the flag is absent instead of rewriting `STATE.json` from the placeholder,
  and warns on stderr when it is about to use the generic fallback.
- **`ods-build.js` demanded a `--config` path the init phase never created.** It now defaults to
  `<root>/.design-sync/config.json` — the file `ods-init.js` writes — so a bootstrapped repo builds with
  `--root` and `--out` alone; an explicit `--config` still wins, so `ods-resync.js` and every documented
  invocation are unchanged. When no config exists anywhere it names the file it looked for and points at
  `ods-init.js`.
- **`status` advertised a `projectName` it never used.** The parameter documents itself as the name
  `ods-init.js` bootstraps with, but the operation only printed a hint — a caller who passed a name got
  nothing bootstrapped and no record of the name. `status` now runs init on a fresh project when it is
  given a `projectName`, and still creates nothing when it is given only a `mode`, so a
  generically-named project is never invented behind the caller's back.
- **The copy set is now visible before it becomes an upload.** `ods-build.js` reports what it copied
  (`N pages, M files (X MB)`) and warns twice: `[SRCDIR_UNSET]` when `cfg.srcDir` is absent — the default
  is the **repo root**, which is how a real project came to copy 15,000+ files, its virtualenv included —
  and `[BIG_COPY]` above 1,500 files, with the size. Settling `srcDir`/`exclude`/`entry` is now an
  explicit step in `references/00-bootstrap.md`, `references/05-build.md` and the SKILL.md 05 gate, with
  the two facts that do the damage spelled out: `exclude` matches **exact basenames at any depth and has
  no globs**, and all three keys feed the `global` component in `_hashes.js`, so pinning them after a
  build invalidates every hash and forces a full re-upload.

### Tests

- 134 tests (was 98): the shared argument parser (including a flag hidden inside a joined entry), the
  ledger's three exit statuses against the exact clobbered file, `--project` in all three spellings, the
  defaulted build config, the copy-set warnings, the absent/overlapping `dark` set, and the harness
  bootstrap path. `test/ds.test.js` was rewritten around truthfulness and fails 6-of-8 against the
  previous generator.

## 0.1.0

### Added

- **The DeepSeek Harness host** — `index.js`, registering:
  - the `sync_design` tool, whose operations are `status` (Step A of the RE-ANCHOR RITUAL), `test`
    (locate a real Open Design CLI and probe the MCP server), `scripts`, `run <script>` and `drift`;
  - the `/sync` human command, with the same verbs;
  - the secret guard on the `tools/pre-execute` waterfall.
- **A real CLI probe.** `test` walks every `od` on PATH plus the bundled desktop CLI and checks each
  one's `--help`, because `/usr/bin/od` is coreutils' octal dump and shadows Open Design's `od` on
  macOS, Linux, WSL2 and Git Bash. Trusting the first PATH hit reports a nonsense connectivity error.
- **`dsh` as a deploy target.** `ods-deploy-agents.js --harness dsh` writes the agent playbooks as
  markdown and names the `od-mcp` row as the MCP wiring.
- `.gitattributes` pinning LF, which is what makes the deploy tests pass on Windows.
- 17 tests for the harness half: the script-name gate, the guard's arming rule, and the `/sync`
  result contract.

### Changed

- **The secret guard is scoped by default.** Upstream it was unconditional; here it is armed only
  inside a project with a `.design-sync/` directory. A DeepSeek Harness plugin is installed into a
  profile rather than a project, so an unconditional guard would police every write in every session
  on the machine. `SYNC_DSH_GUARD=always` restores the original behaviour, `=off` disables it.
- **The guard denies instead of throwing.** A structured `{ kind: 'deny', reason }` names the
  offending argument, so the refusal is actionable and audited rather than an opaque failure.
- `references/self-management.md` describes the guard and drift as they now work.
- Manifests, `SKILL.md` and credits retargeted; version `0.1.0`; `LICENSE` is MIT under the project's
  own copyright, with the derived work's required notice moved to `NOTICE`.

### Fixed

- **Line endings decided a test's outcome.** `test/deploy.test.js` asserts an agent body matches
  `/^---\n/`. With `core.autocrlf=true` — the Windows default — a checkout rewrites the front-matter
  to `---\r\n`, so the assertion failed on Windows and passed on Linux CI. `.gitattributes` now pins
  LF, and the working tree was renormalised; the test passes on both.
- `test/deploy.test.js` now also exercises the new `dsh` harness, alongside the existing targets.

### Removed

- `hooks/ods-guard.mjs` and `hooks/ods-drift.mjs`, and their test. They were OpenCode host shims;
  DeepSeek Harness provides both seams natively (`tools/pre-execute`, and a hash-exact drift script),
  so carrying them would have been dead code. The guard is now tested through the real
  implementation in `index.js` instead.

### Not ported

- Upstream's `file.edited` drift listener. It matched an edited file's *basename* against tracked
  pairs and appended a line to `JOURNAL.md` — a guess where an exact check already existed in
  `ods-manifest.js drift`. Drift is exposed as a tool operation and a `/sync drift` verb instead of a
  background listener, so it is deterministic and does not depend on a host event.
