# Platforms — run sync-dsh on ANY harness (and deploy its agents anywhere)

The **sync-dsh** skill speaks in **actions**, not tool brand-names — but it also **deploys** harness-specific agent
files and wires the OD MCP per harness, so it needs each harness's conventions. This file is both: (1) the
action→harness map for running the skill, and (2) the target matrix for `ods-deploy-agents.js`.
**Sub-agents are an enhancement, not a requirement** — the scripts run fine sequentially.

**Action vocabulary:** read · search-text · find-files · run-shell · write-file · edit · verify ·
spawn-subagent · ask-user · invoke-skill · mcp-add · git-checkpoint.

Cells we couldn't verify from a primary source are marked **`?`** — verify before relying.

## Shell portability (don't trip on Windows)
The shell tool is **POSIX `sh`/bash even on Windows** (Git Bash), *not* cmd.exe. Use `2>/dev/null` (never
`2>NUL` — cmd-only, writes a stray `NUL` file), forward slashes, `$VAR`, `[ -d .design-sync ]`. Detect the
OS only when a generated artifact must differ.

## Running the skill — action map per harness

**run-shell** is where the pipeline lives: `ods-init.js` / `ods-status.js` / `ods-detect.js` /
`ods-extract-tokens.js` / `ods-build-design-system.js` / `ods-build.js` / `ods-validate.js` /
`ods-diff.js` / `ods-capture.js` / `ods-resync.js` (the driver) / `ods-upload-plan.js` /
`ods-upload-verify.js` / `ods-manifest.js` / `ods-pull.js` — staged to `.ds-sync/` and run with plain
`node`, identical on every harness (built-ins only, no npm install).

| Action | Claude Code | opencode | Codex | Pi / Ross Code | Devin | Gemini CLI |
|---|---|---|---|---|---|---|
| read / search / find | Read / Grep / Glob | read / grep / glob | `shell` cat/rg/find | read / grep / find | file browse | read_file / grep / glob |
| write / edit | Write / Edit | write / edit | `apply_patch` | write / edit | editor | write_file / replace |
| run / verify | Bash | bash | `shell` | bash | shell | run_shell_command |
| invoke a skill | `Skill` | read SKILL.md | load SKILL.md via shell | read SKILL.md / `/skill:` | read SKILL.md | `activate_skill` |
| subagent | `Agent` (parallel) | `mode: subagent` | `spawn_agent` `?` | `subagent` (if installed) | native agent | `invoke_agent` `?` |
| MCP add | `claude mcp add` / `.mcp.json` | opencode MCP config | `~/.codex` config | CLI + README (no mcpServers) | per Devin | `settings.json` mcpServers |

## Target matrix — deploy agents per harness (`ods-deploy-agents.js`)
`agents/sync-dsh-lead.md` `sync-dsh-worker.md` `sync-dsh-extractor.md` are the **source of truth**; everything else is
transpiled by `node <skill>/scripts/ods-deploy-agents.js --harness <H> --dest <dir>`.

| Harness | Agent file written | Notes |
|---|---|---|
| **Claude Code** | `<dest>/<name>.md` | keep `tools:` front-matter; `.claude/agents/` (`-g` = `~/.claude/agents/`) |
| **opencode** | `<dest>/<name>.md` + injected `mode: subagent` | `.opencode/agents/` |
| **Codex** | `<dest>/<name>.toml` — **no `tools` key**, `name`+`description`, body as comments | `~/.codex` agents |
| **Pi / Ross Code** | `<dest>/<name>.md` | model auto; wire via CLI + README, **no `mcpServers`** |
| **Devin** | `<dest>/<name>.md` (plain body) | paste as knowledge/playbooks; no MCP — agent shells out to the local OD daemon |
| **Gemini CLI** | `<dest>/<name>.md` (plain body) | agents dir varies by version `?`; MCP via `settings.json` mcpServers |

The script prints the MCP wiring line for the chosen harness (e.g. Claude → `.mcp.json / claude mcp add
open-design`; Pi → `CLI + README (no mcpServers)`).

## OD MCP wiring (used by every harness that supports MCP)
Add the Open Design server so the agent can call `create_project` / `get_project` (the source of
`projectId` + `resolvedDir` + `previewUrl`) and bridge the upload (`get_file` anchor fetch, `write_file` /
`delete_file` per plan entry, `list_files` for the verify — `references/upload-protocol.md`). Claude Code: `claude mcp add --scope project open-design -- <command>` or
hand-write `.mcp.json` `{"mcpServers":{"open-design":{"command":"...","args":[]}}}`. Pi has **no MCP** — the
agent reads the OD facts from `references/mcp-contract.md` and the daemon runs locally; emit a CLI+README
instead. Scripts never touch MCP regardless of harness (`references/mcp-contract.md`).

## Installing the bundled agents
`node <skill>/scripts/ods-deploy-agents.js --harness <claude|opencode|codex|pi|devin|gemini> --dest <agentsDir>`
(unknown harness values exit 2 listing the valid set). Their
bodies are harness-neutral prose (action verbs, not tool brand names), so the same three files transpile
cleanly to every target above.
