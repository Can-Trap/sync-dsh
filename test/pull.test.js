// test/pull.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const script = new URL('../scripts/ods-pull.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

test('review gate: no --apply exits 2 and does not write', () => {
  const d = mkdtempSync(join(tmpdir(), 'pull-'));
  const od = join(d, 'od.css'), src = join(d, 'src.css');
  writeFileSync(od, ':root{--bg:#000}'); writeFileSync(src, 'HUMAN\n');
  let code = 0; try { execFileSync('node', [script, '--od', od, '--src', src, '--name', 'tok']); } catch (e) { code = e.status; }
  assert.equal(code, 2);
  assert.equal(readFileSync(src, 'utf8'), 'HUMAN\n');   // untouched
});

test('--apply writes managed block, preserves human text', () => {
  const d = mkdtempSync(join(tmpdir(), 'pull2-'));
  const od = join(d, 'od.css'), src = join(d, 'src.css');
  writeFileSync(od, ':root{--bg:#000}'); writeFileSync(src, 'HUMAN\n');
  execFileSync('node', [script, '--od', od, '--src', src, '--name', 'tok', '--apply']);
  const out = readFileSync(src, 'utf8');
  assert.ok(out.includes('HUMAN'));
  assert.ok(out.includes('design-sync:start:tok'));
  assert.ok(out.includes('--bg:#000'));
});
