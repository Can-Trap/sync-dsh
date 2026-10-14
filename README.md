# Sync with Open Design — for DeepSeek Harness

Turn any codebase into an [Open Design](https://open-design.ai) project and/or extract its design
system, driven from [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

| Mode | What happens |
|------|--------------|
| **A — Project sync** | Build an OD-safe page bundle from your codebase, plan the upload, grade it, keep both sides in sync |
| **B — Design-system sync** | Extract `DESIGN.md` plus the tokens your source actually defines (light, and dark where there is one) |
| **Both** (default) | Mode B, then Mode A |

## What it adds to your harness

One plugin, three seams:

| Seam | What it does |
|---|---|
| `sync_design` **tool** | Drives the bundled pipeline: `status`, `test`, `scripts`, `run`, `drift` |
| **secret guard** on `tools/pre-execute` | Denies any write or shell command whose payload matches a secret pattern, when the project is being synced |
| `/sync` **command** | The human entry point — reports the next phase, or runs a check |

```
/sync            # next phase for this project (Step A of the ritual)
/sync test       # is a real Open Design CLI and MCP server reachable?
/sync drift      # hash-exact drift check across every tracked pair
/sync scripts    # list the bundled pipeline
```

The tool is the same thing for the model, with `run` to execute one phase script directly.

## The design decision that makes this portable

**The scripts never call MCP.** The 20 scripts under `scripts/` read your codebase, compute what
should be sent, and verify what came back — they emit an upload plan rather than performing an
upload. The *agent* does the Open Design reads and writes, over MCP, from the plan.

That separation is why the pipeline runs — and is tested — with no Open Design daemon, no network and
no `od` CLI. Only `ods-verify.js` reaches the network at all, for an optional preview-URL check that
degrades to a warning.

Behaviour is the original's, with four exceptions this port needed, each recorded in
[`CHANGELOG.md`](CHANGELOG.md):

| Script | Change |
|---|---|
| all of them | one shared argument parser in `_lib.js`, so `--key value`, `--key=value` and a whole command line delivered as a single argument all read the same |
| `ods-manifest.js` | validates the drift ledger's shape and exits `2` on one it cannot read, instead of throwing a `TypeError` |
| `ods-build-design-system.js` | derives `DESIGN.md` from `tokens.json` — single-theme systems are described as single-theme, and `var()` references are never printed as colour values |
| `ods-build.js` | defaults `--config` to the `.design-sync/config.json` that `ods-init.js` writes, and reports the copy set it is about to upload |

## Install

```bash
plugin_manager install_bundle <path-to>/sync-dsh
```

Then wire the Open Design MCP server. This bundle deliberately does **not** ship that row, for two
reasons that both bite:

- **The endpoint is machine-specific.** `od` is not on PATH; the real server is the desktop app's
  own binary running `daemon-cli.mjs` with `ELECTRON_RUN_AS_NODE=1`. And `od mcp` refuses to start
  without either `OD_SIDECAR_CLIENT_ENDPOINT` (a named pipe carrying a per-install GUID) or an
  explicit `--daemon-url` — the app binds a fresh port on every launch. No portable value exists.
- **`serverName` must be unique across live mcp-client instances**, so two bundles shipping an
  `opendesign` row collide.

So the row belongs to your **profile** patch, which is local and never published:

```yaml
- id: opendesign-mcp
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: opendesign
    transport: stdio
    command: '<INSTALL>/Open Design.exe'
    args:
      - '<INSTALL>/resources/app/prebundled/daemon/daemon-cli.mjs'
      - 'mcp'
    env:
      ELECTRON_RUN_AS_NODE: '1'
      OD_DATA_DIR: '<APPDATA>/Open Design/namespaces/<namespace>/data'
      OD_SIDECAR_CLIENT_ENDPOINT: '\\.\pipe\open-design-sidecar-<guid>'
      OD_MCP_BOOTSTRAP_COMMAND: '<INSTALL>/Open Design.exe'
      OD_MCP_BOOTSTRAP_ARGS: '["--headless"]'
    failOnStartupError: true
```

`<INSTALL>` is the desktop app's install directory — `%LOCALAPPDATA%\Programs\Open Design` on Windows,
`/Applications/Open Design.app/Contents` on macOS (`MacOS/Open Design` for the binary,
`Resources/app/…` for the daemon). The sidecar endpoint is a named pipe on Windows and a socket
elsewhere; `index.js` probes both layouts when it looks for a CLI.

Take `<namespace>` and `<guid>` from the registration the Open Design app writes for VS Code. Its
tools then appear as `mcp__opendesign__*`. Without the row the pipeline can still detect, extract,
build and validate — the scripts need no MCP — but there is nothing to push through.

## Use

```
/sync
```

On a fresh project that reports the bootstrap command:

```bash
node scripts/ods-init.js --project "My App" --mode both
```

`status` runs it for you when you pass a name (`projectName`, optionally `mode`); without a name it
only reports, and creates nothing. `ods-init.js` reads `--project <name>`, `--project=<name>` and a
single quoted command-line string identically, and `ods-build.js` defaults `--config` to the
`.design-sync/config.json` that init writes.

**Before the first build, settle the copy set.** `srcDir`, `exclude` and `entry` decide what actually
ships — the copy set *is* the upload — and all three feed the build's hash recipe, so pinning them
later invalidates every hash and forces a full re-upload. Left unset, `srcDir` means the repo root, and
a virtualenv or a directory of data dumps goes to Open Design with everything else; `exclude` matches
exact basenames at any depth and has **no globs**. The build says what it copied and warns when either
looks wrong (`references/05-build.md`).

Then work the ritual: `status` names the next phase, you run that phase's script, check its
DONE-gate, and call `/sync` again. `references/RUNBOOK.md` is the command-per-line runbook;
`SKILL.md` routes each situation at a `references/NN-*.md` phase.

## The secret guard, and why it is scoped

Open Design content is effectively public. The guard refuses any call whose content or command
matches `api_key|secret|token|password` followed by a long value — the same pattern the original
used.

What changed is **when it is armed**:

| Setting | Behaviour |
|---|---|
| *(default)* | Armed inside a project that has a `.design-sync/` directory — its whole subtree |
| `SYNC_DSH_GUARD=always` | Armed everywhere, the original's unconditional behaviour |
| `SYNC_DSH_GUARD=off` | Disabled |

The default is deliberate. In OpenCode this plugin was a per-project install, or an explicit
`--global` opt-in. A DeepSeek Harness plugin is installed into a **profile**, so the unconditional
rule would scan every write and every shell command in every session on the machine — including
projects with nothing to do with Open Design, where a blocked write reads as a harness bug rather
than a rule anyone chose. Scoping it to `.design-sync` projects keeps the protection where the leak
is possible.

The refusal is also better than the original's. Upstream threw an `Error`. This returns a structured
denial carrying the argument name, so the model is told what was refused and can fix it.

## Layout

```
sync-dsh/
├── index.js          # the DeepSeek Harness plugin: tool, guard, /sync
├── scripts/          # the pipeline: 18 ods-* scripts + 2 shared modules
├── references/       # the phase docs, the runbook, the protocols
├── agents/           # lead / worker / extractor playbooks
├── assets/graphs/    # the decision, workflow and task-loop graphs
├── SKILL.md          # the skill the harness routes on
└── test/             # 134 tests, no daemon required
```

## Notes on this implementation

The pipeline derives from an earlier MIT-licensed sync plugin, and four things about this version
are worth calling out:

1. **The host surface is new.** The tool, the guard and `/sync` are written against DeepSeek
   Harness's own seams rather than translated from the original's plugin API.
2. **Drift is exact, not heuristic.** The original logged `drift: <path> edited` when an edited
   file's *basename* matched a tracked pair. `ods-manifest.js drift` compares sha256 hashes of both
   sides of every pair and exits 1 on a real difference, and that is what `sync_design` `drift` runs.
3. **The host shims are gone.** `hooks/ods-guard.mjs`, `hooks/ods-drift.mjs` and
   `commands/sync-dsh.md` belonged to the host this port replaces — the harness provides the guard, the
   drift check and the command natively. Shipping them would have been dead code, and the markdown
   command would have drifted out of step with the pipeline it described.
4. **A line-ending bug is fixed.** `test/deploy.test.js` asserts an agent body matches `/^---\n/`.
   With `core.autocrlf=true` — the Windows default — a checkout rewrites that to `---\r\n` and the
   assertion fails, so the suite was green in CI and red on every Windows machine. `.gitattributes`
   now pins LF everywhere.

## Test

```bash
node --test     # 134 tests, no Open Design daemon needed
```

The suite covers the pipeline and the harness half — the tool's script-name gate, the guard's arming
rule, and the `/sync` result contract. Nothing in it needs Open Design installed, a network, or a
particular directory layout.

## License

MIT © Trap. See [`LICENSE`](LICENSE).

The `scripts/` pipeline and most of `references/` derive from an earlier MIT-licensed sync plugin.
Its notice is reproduced in [`NOTICE`](NOTICE) — that reproduction is what the MIT License requires
of any work carrying that code, and it is the only thing that file is for.
