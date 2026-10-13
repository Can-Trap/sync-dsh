# Changelog

All notable changes to `sync-dsh` are documented here.

The `scripts/` pipeline, most of `references/`, the agent playbooks and the phase model derive from
an earlier MIT-licensed sync plugin, whose notice is reproduced in [`NOTICE`](NOTICE). Entries below
record what this implementation changed; everything it inherited came across essentially intact.

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
