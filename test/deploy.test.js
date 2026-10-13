// test/deploy.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const script = new URL('../scripts/ods-deploy-agents.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

test('opencode deploy writes md agents', () => {
  const dest = mkdtempSync(join(tmpdir(), 'oc-'));
  execFileSync('node', [script, '--harness', 'opencode', '--dest', dest]);
  assert.ok(existsSync(join(dest, 'sync-dsh-lead.md')));
});
test('codex deploy writes toml without tools key', () => {
  const dest = mkdtempSync(join(tmpdir(), 'cx-'));
  execFileSync('node', [script, '--harness', 'codex', '--dest', dest]);
  const f = join(dest, 'sync-dsh-lead.toml');
  assert.ok(existsSync(f)); assert.ok(!/tools\s*=/.test(readFileSync(f, 'utf8')));
});
test('devin and gemini deploy plain md agents', () => {
  for (const h of ['devin', 'gemini']) {
    const dest = mkdtempSync(join(tmpdir(), h + '-'));
    execFileSync('node', [script, '--harness', h, '--dest', dest]);
    const body = readFileSync(join(dest, 'sync-dsh-lead.md'), 'utf8');
    assert.match(body, /^---\n/);
    assert.ok(!/^---\nmode: subagent/.test(body), h + ': must not carry opencode front-matter');
  }
});
test('unknown harness exits 2 listing valid values', () => {
  const dest = mkdtempSync(join(tmpdir(), 'bad-'));
  try {
    execFileSync('node', [script, '--harness', 'cursor', '--dest', dest], { stdio: 'pipe' });
    assert.fail('expected exit 2');
  } catch (e) {
    assert.equal(e.status, 2);
    assert.match(String(e.stderr), /valid: claude, opencode, codex, pi, devin, gemini/);
  }
});
