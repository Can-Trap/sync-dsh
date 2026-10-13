// The DeepSeek Harness half: the tool, the secret guard, and the /sync command.
//
// The scripts under scripts/ have their own 160-odd tests, ported unchanged. This
// file tests what the PORT added, and what upstream's hooks.test.js tested before
// it was superseded: the guard. Upstream's guard threw an Error; this one returns a
// structured denial, so the assertions here are about a decision, not a throw.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Load the plugin the way the Loader would, capturing what it registers. */
async function loadPlugin() {
  const mod = await import("../index.js");
  const tools = [];
  const commands = [];
  const listeners = [];
  const ctx = {
    tools: { register: (t) => { tools.push(t); return () => {}; } },
    commands: { register: (c) => { commands.push(c); return () => {}; } },
    on: (event, fn) => { listeners.push({ event, fn }); return () => {}; },
  };
  mod.apply(ctx);
  return {
    mod,
    tool: tools[0],
    command: commands[0],
    guard: listeners.find((l) => l.event === "tools/pre-execute")?.fn,
  };
}

/** A project directory, optionally bootstrapped for sync. */
function project({ bootstrapped }) {
  const dir = mkdtempSync(join(tmpdir(), "syncdsh-"));
  if (bootstrapped) {
    mkdirSync(join(dir, ".design-sync"), { recursive: true });
    writeFileSync(join(dir, ".design-sync", "config.json"), JSON.stringify({ projectName: "t" }));
  }
  return dir;
}

const SECRET_CONTENT = 'const api_key = "sk-abcdefghijklmnopqrstuvwxyz012345"';
const CLEAN_CONTENT = "const accent = var(--accent);";
const allow = async () => ({ kind: "allow" });

/* ── the tool ─────────────────────────────────────────────────────────────── */

test("the plugin registers one tool, one command and one guard", async () => {
  const { tool, command, guard } = await loadPlugin();
  assert.equal(tool.name, "sync_design");
  assert.equal(command.name, "sync");
  assert.equal(typeof guard, "function");
  // The model-facing contract has to be usable, not just present.
  assert.ok(tool.description.length > 80);
  assert.equal(tool.output.schema.type, "object");
  assert.equal(typeof tool.output.render, "function");
});

test("the tool lists the bundled scripts", async () => {
  const { tool } = await loadPlugin();
  const value = await tool.execute({ operation: "scripts" }, {});
  assert.equal(value.ok, true);
  assert.ok(value.scripts.length >= 18, `expected the full pipeline, got ${value.scripts.length}`);
  assert.ok(value.scripts.includes("ods-status.js"));
  assert.ok(value.scripts.includes("ods-resync.js"));
});

test("status reports a fresh project and the bootstrap command", async () => {
  const { tool } = await loadPlugin();
  const dir = project({ bootstrapped: false });
  const value = await tool.execute(
    { operation: "status", directory: dir, projectName: "Acme", mode: "B" }, {});
  assert.equal(value.directory, dir);
  assert.match(value.stdout, /fresh|Fresh|bootstrap|Bootstrap/i);
  assert.match(value.stdout, /ods-init\.js/);
  assert.match(value.stdout, /--mode B/);
});

test("status reads an initialised project's next phase", async () => {
  const { tool } = await loadPlugin();
  const dir = project({ bootstrapped: true });
  mkdirSync(join(dir, ".design-sync", "tasks"), { recursive: true });
  writeFileSync(join(dir, ".design-sync", "STATE.json"), JSON.stringify({ project: "Acme" }));
  writeFileSync(join(dir, ".design-sync", "tasks", "INDEX.md"), "- [x] 00-bootstrap\n- [ ] 01-detect\n");

  const value = await tool.execute({ operation: "status", directory: dir }, {});
  assert.equal(value.ok, true);
  assert.match(value.nextPhase, /01-detect/);
});

/* ── the script-name gate ─────────────────────────────────────────────────── */

test("run refuses anything that is not a bare ods-* script name", async () => {
  const { tool } = await loadPlugin();
  for (const bad of ["../../../evil.js", "..\\..\\evil.js", "/etc/passwd", "index.js", "ods-x.js;rm -rf /"]) {
    await assert.rejects(
      () => tool.execute({ operation: "run", script: bad }, {}),
      /not an ods-\* script name/,
      `should refuse ${bad}`);
  }
});

test("run refuses an ods-* name the bundle does not ship", async () => {
  const { tool } = await loadPlugin();
  await assert.rejects(
    () => tool.execute({ operation: "run", script: "ods-not-a-real-script.js" }, {}),
    /no such script/);
});

/* ── the secret guard ─────────────────────────────────────────────────────── */

test("the guard denies a secret-bearing write inside a sync project", async () => {
  const { guard } = await loadPlugin();
  const dir = project({ bootstrapped: true });
  const decision = await guard(
    { arguments: { file_path: join(dir, "theme.css"), content: SECRET_CONTENT }, agent: { meta: { cwd: dir } } },
    allow);
  assert.equal(decision.kind, "deny");
  assert.match(decision.reason, /secret/i);
  assert.match(decision.reason, /content/, "the reason names the offending argument");
});

test("the guard denies a secret-bearing shell command inside a sync project", async () => {
  const { guard } = await loadPlugin();
  const dir = project({ bootstrapped: true });
  const decision = await guard(
    { arguments: { command: `curl -H 'authorization: token=abcdefghijklmnopqrstuvwxyz'` }, agent: { meta: { cwd: dir } } },
    allow);
  assert.equal(decision.kind, "deny");
  assert.match(decision.reason, /command/);
});

test("the guard passes clean content through untouched", async () => {
  const { guard } = await loadPlugin();
  const dir = project({ bootstrapped: true });
  const decision = await guard(
    { arguments: { file_path: join(dir, "theme.css"), content: CLEAN_CONTENT }, agent: { meta: { cwd: dir } } },
    allow);
  assert.equal(decision.kind, "allow", "a clean write must reach the downstream decision");
});

test("the guard stays out of projects that are not syncing", async () => {
  const { guard } = await loadPlugin();
  // The whole point of the scoping: a profile-wide plugin must not police
  // unrelated projects, where a blocked write reads as a harness bug.
  const dir = project({ bootstrapped: false });
  const decision = await guard(
    { arguments: { file_path: join(dir, "secrets.env"), content: SECRET_CONTENT }, agent: { meta: { cwd: dir } } },
    allow);
  assert.equal(decision.kind, "allow");
});

test("the guard finds the sync root from a nested path", async () => {
  const { guard } = await loadPlugin();
  const dir = project({ bootstrapped: true });
  const nested = join(dir, "src", "components", "deep");
  mkdirSync(nested, { recursive: true });
  const decision = await guard(
    { arguments: { file_path: join(nested, "Button.tsx"), content: SECRET_CONTENT }, agent: { meta: { cwd: dir } } },
    allow);
  assert.equal(decision.kind, "deny", "a .design-sync ancestor arms the guard for its whole subtree");
});

test("SYNC_DSH_GUARD=off disarms the guard even inside a sync project", async () => {
  const { guard } = await loadPlugin();
  const dir = project({ bootstrapped: true });
  process.env.SYNC_DSH_GUARD = "off";
  try {
    const decision = await guard(
      { arguments: { file_path: join(dir, "theme.css"), content: SECRET_CONTENT }, agent: { meta: { cwd: dir } } },
      allow);
    assert.equal(decision.kind, "allow");
  } finally {
    delete process.env.SYNC_DSH_GUARD;
  }
});

test("SYNC_DSH_GUARD=always restores the upstream unconditional behaviour", async () => {
  const { guard } = await loadPlugin();
  const dir = project({ bootstrapped: false });
  process.env.SYNC_DSH_GUARD = "always";
  try {
    const decision = await guard(
      { arguments: { file_path: join(dir, "x.env"), content: SECRET_CONTENT }, agent: { meta: { cwd: dir } } },
      allow);
    assert.equal(decision.kind, "deny");
  } finally {
    delete process.env.SYNC_DSH_GUARD;
  }
});

test("the guard ignores calls that carry neither content nor a command", async () => {
  const { guard } = await loadPlugin();
  const dir = project({ bootstrapped: true });
  for (const args of [{ path: join(dir, "a.txt") }, {}, null, { todos: [{ content: "x", status: "pending" }] }]) {
    const decision = await guard({ arguments: args, agent: { meta: { cwd: dir } } }, allow);
    assert.equal(decision.kind, "allow", `should pass ${JSON.stringify(args)}`);
  }
});

/* ── the /sync command ────────────────────────────────────────────────────── */

test("the /sync command answers with a rendered result", async () => {
  const { command } = await loadPlugin();
  const dir = project({ bootstrapped: false });
  const result = await command.handler({ rawInput: " scripts", agent: { meta: { cwd: dir } } });
  assert.equal(result.kind, "success");
  assert.match(result.text, /ods-/);
});

test("the /sync command rejects an unknown verb with an error result", async () => {
  const { command } = await loadPlugin();
  const result = await command.handler({ rawInput: " teleport", agent: { meta: { cwd: project({ bootstrapped: false }) } } });
  assert.equal(result.kind, "error");
  assert.match(result.text, /unknown/);
});

test("the /sync command survives a directory that does not exist", async () => {
  const { command } = await loadPlugin();
  const missing = join(tmpdir(), "syncdsh-does-not-exist-12345");
  assert.equal(existsSync(missing), false);
  // A throwing handler settles as `kind: 'error'` anyway, but a handler that
  // returns a clean error result keeps the UI honest about what happened.
  const result = await command.handler({ rawInput: " status", agent: { meta: { cwd: missing } } });
  assert.ok(result.kind === "success" || result.kind === "error");
  assert.equal(typeof result.text, "string");
});
