// index.js — sync-dsh: the DeepSeek Harness host for the ods-* pipeline.
//
// The pipeline came from a coding-agent plugin written for a different host; this
// file is the host surface written for this one, against DeepSeek Harness's own
// seams. In two places the harness seam is strictly better than the one it
// replaces:
//
//   the ported surface              DeepSeek Harness
//   ------------------------------  --------------------------------------------
//   a pipeline tool                 ctx.tools.register("sync_design")
//   a pre-write guard (threw)       tools/pre-execute → { kind: 'deny', reason }
//   an edit listener (by basename)  sync_design operation "drift" (hash-exact)
//   a markdown slash command        ctx.commands.register("sync")
//
// The second row matters: a thrown Error from a pre-execute hook tells the model
// only that something failed, while a structured denial tells it what was refused
// and why, and the refusal is audited. The third row matters more: the original
// listener appended `drift: <path> edited` when a *basename* matched a tracked
// pair, which is a guess. `ods-manifest.js drift` compares sha256 hashes of both
// sides of every pair and exits 1 on a real difference — so the harness gets the
// exact check, not the heuristic one.
//
// The 20 scripts under scripts/ are deliberately NOT host-specific and were not
// rewritten: they never call MCP or the Open Design daemon themselves. The agent
// performs the Open Design work over MCP; the scripts compute what should be sent
// and verify what came back. That is why this port is a thin driver.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve, sep, parse } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

/** Loader identity. */
export const name = "sync-dsh";

/** Services used by this plugin. */
export const inject = ["tools", "commands"];

const execFileAsync = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = join(HERE, "scripts");
const STATE_DIR = ".design-sync";

/** Only real ods-* script names are ever spawned. */
const SCRIPT_NAME = /^ods-[a-z0-9-]+\.js$/;
const OPERATIONS = ["status", "test", "run", "scripts", "drift"];

/* ── running the pipeline ─────────────────────────────────────────────────── */

/**
 * Spawn one bundled script with the project directory as its cwd — the scripts
 * resolve `.design-sync/` from `process.cwd()`, so this is what makes them act on
 * the right project.
 *
 * @param scriptName - a bare `ods-*.js` name; validated and re-resolved inside
 *   `scripts/`, so a crafted value cannot walk out of the directory.
 * @returns exit code and both streams. A non-zero exit is data, not an exception:
 *   most ods scripts use exit status as their gate.
 */
async function runScript(scriptName, args = [], cwd, signal) {
  if (!SCRIPT_NAME.test(scriptName)) {
    throw new Error(`not an ods-* script name: ${scriptName}`);
  }
  const scriptPath = resolve(SCRIPTS_DIR, scriptName);
  if (!scriptPath.startsWith(resolve(SCRIPTS_DIR) + sep)) {
    throw new Error(`refusing to run a script outside scripts/: ${scriptName}`);
  }
  if (!existsSync(scriptPath)) {
    throw new Error(`no such script: scripts/${scriptName}`);
  }
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [scriptPath, ...args], {
      cwd,
      timeout: 300000,
      maxBuffer: 10 * 1024 * 1024,
      signal,
    });
    return { exitCode: 0, stdout, stderr };
  } catch (err) {
    return {
      // A spawn failure carries a string code (`ENOENT`); a gate failure carries a number.
      exitCode: typeof err?.code === "number" ? err.code : 1,
      stdout: err?.stdout ?? "",
      stderr: err?.stderr ?? String(err?.message ?? err),
    };
  }
}

/** Every script this bundle ships, sorted. */
function listScripts() {
  try {
    return readdirSync(SCRIPTS_DIR).filter((f) => SCRIPT_NAME.test(f)).sort();
  } catch {
    return [];
  }
}

/* ── locating the project ─────────────────────────────────────────────────── */

/** The directory the run acts on: explicit argument, else the session cwd. */
function directoryFor(exec, explicit) {
  if (typeof explicit === "string" && explicit.trim()) return resolve(explicit);
  const fromSession = exec?.agent?.meta?.cwd;
  if (typeof fromSession === "string" && fromSession) return fromSession;
  return process.cwd();
}

/** Walk up from `start` looking for a bootstrapped sync project. */
function nearestSyncRoot(start) {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, STATE_DIR))) return dir;
    const up = parse(dir).dir;
    if (!up || up === dir) return null;
    dir = up;
  }
}

/* ── locating a real Open Design CLI ──────────────────────────────────────── */

/**
 * The desktop app ships its own CLI; it is not installed on PATH.
 * @returns candidate invocations for this platform.
 */
function bundledOdCandidates() {
  const home = process.env.USERPROFILE ?? process.env.HOME ?? "";
  const out = [];
  if (process.platform === "win32") {
    const root = join(process.env.LOCALAPPDATA ?? join(home, "AppData", "Local"), "Programs", "Open Design");
    out.push({
      exe: join(root, "Open Design.exe"),
      prefix: [join(root, "resources", "app", "prebundled", "daemon", "daemon-cli.mjs")],
      env: { ELECTRON_RUN_AS_NODE: "1" },
      label: "bundled desktop CLI",
    });
  } else if (process.platform === "darwin") {
    for (const root of ["/Applications/Open Design.app/Contents", join(home, "Applications/Open Design.app/Contents")]) {
      out.push({
        exe: join(root, "MacOS", "Open Design"),
        prefix: [join(root, "Resources", "app", "prebundled", "daemon", "daemon-cli.mjs")],
        env: { ELECTRON_RUN_AS_NODE: "1" },
        label: "bundled desktop CLI",
      });
    }
  }
  return out.filter((c) => existsSync(c.exe) && existsSync(c.prefix[0]));
}

/**
 * Locate a REAL Open Design CLI.
 *
 * `/usr/bin/od` is GNU coreutils' octal dump and shadows Open Design's `od` on
 * every Mac, Linux box, WSL2 and Git Bash install. Trusting the first PATH hit
 * points the user at the wrong binary and then reports a nonsense connectivity
 * error, so every candidate is probed before it is believed.
 *
 * @returns the first candidate whose `--help` looks like Open Design, or null.
 */
async function findOdCli() {
  const which = process.platform === "win32" ? "where" : "which";
  let onPath = [];
  try {
    const { stdout } = await execFileAsync(which, ["od"]);
    onPath = stdout.trim().split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  } catch {
    // Nothing named `od` on PATH — the bundled CLI may still be there.
  }

  const candidates = [
    ...onPath.map((exe) => ({ exe, prefix: [], env: {}, label: exe })),
    ...bundledOdCandidates(),
  ];

  for (const c of candidates) {
    try {
      const { stdout } = await execFileAsync(c.exe, [...c.prefix, "--help"], {
        timeout: 8000,
        env: { ...process.env, ...c.env },
      });
      if (/open design|od mcp|od plugin|od project/i.test(stdout)) return c;
    } catch {
      // Not Open Design, or not runnable. Keep looking.
    }
  }
  return null;
}

/**
 * Is the Open Design MCP server usable?
 *
 * Upstream probed with `od mcp list`. **There is no `list` subcommand** — `od mcp`
 * starts a stdio server and takes only `--daemon-url`, so that call either started
 * a server and hung until the timeout, or reported the CLI's own crash as a
 * connectivity failure. Both probes here exit:
 *
 *   1. `od mcp --help` proves this build has the MCP subcommand at all.
 *   2. a daemon-touching command proves the daemon answers. Worth knowing, and
 *      worth NOT treating as the verdict: `od mcp` proxies to a running daemon,
 *      and the desktop app binds a fresh high port every launch, so a bare call
 *      defaulting to 7456 fails with ECONNREFUSED while the app is running fine.
 *      The MCP row supplies the endpoint that fixes that, and it lives in the
 *      profile, not here — so its absence is a note, not a failure.
 */
async function testOdConnectivity() {
  const cli = await findOdCli();
  if (!cli) {
    return {
      ok: false,
      detail:
        "Open Design CLI not found. Note that `/usr/bin/od` is coreutils' octal dump, not Open " +
        "Design — install the desktop app, or run the daemon from source with `pnpm tools-dev`.",
      cli: null,
    };
  }
  const env = { ...process.env, ...cli.env };

  try {
    await execFileAsync(cli.exe, [...cli.prefix, "mcp", "--help"], { timeout: 8000, env });
  } catch (err) {
    return { ok: false, detail: `this build has no \`od mcp\` subcommand (${err?.message ?? err})`, cli };
  }

  let daemon = "daemon answered";
  try {
    await execFileAsync(cli.exe, [...cli.prefix, "plugin", "list"], { timeout: 8000, env });
  } catch (err) {
    const text = `${err?.stderr ?? ""}${err?.message ?? ""}`;
    daemon = /ECONNREFUSED/i.test(text)
      ? "daemon not on its default port — expected for the desktop app; the MCP row's " +
        "OD_SIDECAR_CLIENT_ENDPOINT is what reaches it"
      : `daemon probe failed: ${text.trim().split("\n").slice(-2).join(" ").slice(0, 160)}`;
  }

  return { ok: true, detail: `\`od mcp\` available via ${cli.label} — ${daemon}`, cli };
}

/* ── the secret guard ─────────────────────────────────────────────────────── */

/** The upstream pattern, unchanged. */
const SECRET = /(api[_-]?key|secret|token|password)\s*[:=]\s*["']?[A-Za-z0-9_\-]{16,}/i;

/** Argument names that carry written content, then ones that carry a command. */
const CONTENT_KEYS = ["content", "new_string", "newString", "text"];
const COMMAND_KEYS = ["command"];

/**
 * Whether the guard is armed for one directory.
 *
 * Upstream this hook was unconditional. In OpenCode that is a per-project install,
 * or an explicit `--global` opt-in. A DeepSeek Harness plugin is installed into a
 * **profile**, so the same unconditional rule would scan every write and every
 * shell command in every session on the machine — including projects that have
 * nothing to do with Open Design, where a blocked write reads as a harness bug
 * rather than a rule the user chose.
 *
 * So the guard is armed exactly where the leak it prevents is possible: inside a
 * project bootstrapped for sync. `SYNC_DSH_GUARD=always` restores the upstream
 * behaviour; `SYNC_DSH_GUARD=off` disables the guard entirely.
 */
function guardArmed(dir) {
  const mode = process.env.SYNC_DSH_GUARD;
  if (mode === "off") return false;
  if (mode === "always") return true;
  return !!dir && !!nearestSyncRoot(dir);
}

/** The first argument value that looks like a secret, or null. */
function secretBearingKey(args) {
  if (!args || typeof args !== "object") return null;
  for (const key of [...CONTENT_KEYS, ...COMMAND_KEYS]) {
    const value = args[key];
    if (typeof value === "string" && SECRET.test(value)) return key;
  }
  return null;
}

/** The directory a call would write into, so arming can be decided per project. */
function armingDirectory(args, exec) {
  if (args && typeof args === "object") {
    for (const key of ["file_path", "filePath", "path"]) {
      const value = args[key];
      if (typeof value === "string" && value.trim()) {
        const abs = resolve(value);
        // A path that does not exist yet still has a meaningful parent.
        try {
          return statSync(abs).isDirectory() ? abs : dirname(abs);
        } catch {
          return dirname(abs);
        }
      }
    }
  }
  return directoryFor(exec, null);
}

/* ── the tool ─────────────────────────────────────────────────────────────── */

const text = (s) => [{ type: "text", text: s }];

function syncTool() {
  return {
    name: "sync_design",
    description:
      "Sync a codebase to Open Design and/or extract its design system, by driving the bundled " +
      "ods-* pipeline. Operations: `status` runs ods-status.js and reports the next phase of the " +
      "RE-ANCHOR RITUAL; `test` probes for a real Open Design CLI and MCP server; `scripts` lists " +
      "the bundled scripts; `run` executes one of them; `drift` runs the sha256-exact manifest " +
      "drift check. The scripts never call MCP themselves — this tool computes and verifies, and " +
      "the agent performs the Open Design reads and writes over MCP.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["operation"],
      properties: {
        operation: {
          type: "string",
          enum: OPERATIONS,
          description: "What to do. `status` is the entry point of the ritual.",
        },
        directory: {
          type: "string",
          description:
            "Project directory to act on. Defaults to the session working directory. The ods " +
            "scripts resolve `.design-sync/` from their cwd, so this is what selects the project.",
        },
        script: {
          type: "string",
          description: "For `run`: the bare script name, e.g. `ods-build.js`. Must be an ods-*.js name.",
        },
        args: {
          type: "array",
          items: { type: "string" },
          description: "For `run`: arguments passed to the script, e.g. `[\"--mode\", \"B\"]`.",
        },
        projectName: {
          type: "string",
          description: "For `status` on a fresh project: the name ods-init.js should bootstrap.",
        },
        mode: {
          type: "string",
          enum: ["A", "B", "both"],
          description: "For `status` on a fresh project: which pipeline ods-init.js should plan.",
        },
      },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["operation", "ok", "directory", "exitCode", "stdout", "stderr", "nextPhase", "connectivity"],
        properties: {
          operation: { type: "string" },
          ok: { type: "boolean" },
          directory: { type: "string" },
          exitCode: { type: "number" },
          stdout: { type: "string" },
          stderr: { type: "string" },
          nextPhase: { type: "string" },
          connectivity: { type: "string" },
          scripts: { type: "array", items: { type: "string" } },
        },
      },
      render(args, value) {
        const head = `[sync-dsh ${value.operation}] ${value.ok ? "ok" : "FAILED"} — ${value.directory}`;
        const bits = [];
        if (value.connectivity) bits.push(value.connectivity);
        if (value.nextPhase) bits.push(`next phase: ${value.nextPhase}`);
        if (value.scripts?.length) bits.push(`${value.scripts.length} scripts`);
        const body = [value.stdout, value.stderr].filter(Boolean).join("\n").trim();
        return text([head, ...bits, body].filter(Boolean).join("\n"));
      },
    },
    async execute(argv, exec) {
      const operation = argv.operation;
      const directory = directoryFor(exec, argv.directory);
      const base = {
        operation,
        ok: true,
        directory,
        exitCode: 0,
        stdout: "",
        stderr: "",
        nextPhase: "",
        connectivity: "",
        scripts: [],
      };

      if (operation === "scripts") {
        const scripts = listScripts();
        return { ...base, scripts, stdout: scripts.join("\n") };
      }

      if (operation === "test") {
        const conn = await testOdConnectivity();
        return {
          ...base,
          ok: conn.ok,
          connectivity: conn.detail,
          stdout: conn.ok ? `MCP server: ${conn.detail}` : `MCP server unreachable: ${conn.detail}`,
        };
      }

      if (operation === "run") {
        if (!argv.script) throw new Error("`run` needs a `script` name, e.g. ods-build.js");
        const r = await runScript(argv.script, argv.args ?? [], directory, exec?.signal);
        return { ...base, ok: r.exitCode === 0, exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr };
      }

      if (operation === "drift") {
        // Hash-exact: compares sha256 of both sides of every tracked pair and
        // exits 1 on a real difference. This replaces upstream's basename guess.
        const r = await runScript("ods-manifest.js", ["drift"], directory, exec?.signal);
        return { ...base, ok: r.exitCode === 0, exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr };
      }

      // operation === "status" — Step A of the RE-ANCHOR RITUAL.
      const initialised = existsSync(join(directory, STATE_DIR));
      const conn = await testOdConnectivity();
      const status = await runScript("ods-status.js", [], directory, exec?.signal);

      const raw = `${status.stdout}${status.stderr}`;
      const next =
        raw.match(/next:\s*(.+)/i)?.[1]?.trim() ??
        raw.match(/\[ \]\s*(\d+-\w+)/)?.[1] ??
        "";

      const lines = [`Open Design: ${conn.ok ? conn.detail : `unreachable — ${conn.detail}`}`];
      if (!initialised) {
        const mode = argv.mode ?? "both";
        const project = argv.projectName ?? "synced-project";
        lines.push(
          `Fresh project — no ${STATE_DIR}/ here.`,
          `Bootstrap: node scripts/ods-init.js --project "${project}" --mode ${mode}`,
        );
      } else {
        const cfg = readConfig(directory);
        if (cfg?.projectId) lines.push(`Re-sync run (projectId pinned: ${cfg.projectId}).`);
      }
      lines.push(raw.trim() || "(ods-status.js produced no output)");

      return {
        ...base,
        ok: status.exitCode === 0,
        exitCode: status.exitCode,
        stdout: lines.filter(Boolean).join("\n"),
        nextPhase: next,
        connectivity: conn.detail,
      };
    },
  };
}

/** Best-effort `.design-sync/config.json`; the tool reports, it does not validate. */
function readConfig(directory) {
  try {
    return JSON.parse(readFileSync(join(directory, STATE_DIR, "config.json"), "utf8"));
  } catch {
    return null;
  }
}

/* ── registration ─────────────────────────────────────────────────────────── */

/**
 * Register the tool, the secret guard, and the `/sync` command.
 * @param ctx - services carrying the tool registry, command registry and events.
 */
export function apply(ctx) {
  ctx.tools.register(syncTool());

  // ─── secret guard ───
  // Pre-execute is a waterfall: returning `next()` lets the call continue, and a
  // structured deny stops it with a reason the model can act on.
  ctx.on("tools/pre-execute", async (exec, next) => {
    const key = secretBearingKey(exec.arguments);
    if (!key) return next();
    if (!guardArmed(armingDirectory(exec.arguments, exec))) return next();
    return {
      kind: "deny",
      reason:
        `[sync-dsh] refused: \`${key}\` looks like it carries a secret ` +
        `(api key, secret, token or password). Remove it, or set SYNC_DSH_GUARD=off to disable ` +
        `this guard for the profile.`,
    };
  });

  // ─── /sync — the human entry point ───
  ctx.commands.register({
    name: "sync",
    description: "Report the next Open Design sync phase for this project (Step A of the ritual).",
    input: { hint: "[status|test|drift|scripts]" },
    async handler(invocation) {
      const verb = (invocation.rawInput ?? "").trim().split(/\s+/)[0] || "status";
      const known = ["status", "test", "drift", "scripts"];
      if (!known.includes(verb)) {
        return { kind: "error", text: `unknown \`${verb}\` — try one of: ${known.join(", ")}` };
      }
      const directory = invocation.agent?.meta?.cwd ?? process.cwd();
      try {
        const tool = syncTool();
        const value = await tool.execute({ operation: verb, directory }, { agent: invocation.agent });
        const rendered = tool.output.render({ operation: verb }, value)
          .map((b) => b.text)
          .join("\n");
        return { kind: "success", text: rendered };
      } catch (err) {
        return { kind: "error", text: `[sync-dsh] ${err?.message ?? err}` };
      }
    },
  });
}
