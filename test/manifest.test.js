// test/manifest.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const script = new URL('../scripts/ods-manifest.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const node = (cwd, ...a) => execFileSync('node', [script, ...a], { cwd, encoding: 'utf8' });

test('add then drift detects source change', () => {
  const d = mkdtempSync(join(tmpdir(), 'man-'));
  const s = join(d, 's.txt'), o = join(d, 'o.txt');
  writeFileSync(s, 'v1'); writeFileSync(o, 'v1');
  node(d, 'add', '--pair', `${s}::${o}`);
  assert.match(node(d, 'drift'), /clean/);
  writeFileSync(s, 'v2');
  let code = 0; try { node(d, 'drift'); } catch (e) { code = e.status; }
  assert.equal(code, 1);
});
