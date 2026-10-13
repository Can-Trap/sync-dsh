// test/push.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const script = new URL('../scripts/ods-push.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

test('copies src into project dir, excludes node_modules', () => {
  const src = mkdtempSync(join(tmpdir(), 'src-')); const proj = mkdtempSync(join(tmpdir(), 'proj-'));
  mkdirSync(join(src, 'components'), { recursive: true }); writeFileSync(join(src, 'components', 'a.tsx'), 'x');
  mkdirSync(join(src, 'node_modules'), { recursive: true }); writeFileSync(join(src, 'node_modules', 'junk'), 'no');
  writeFileSync(join(src, 'index.html'), '<html></html>');
  execFileSync('node', [script, '--src', src, '--project-dir', proj]);
  assert.ok(existsSync(join(proj, 'components', 'a.tsx')));
  assert.ok(!existsSync(join(proj, 'node_modules')));
  assert.ok(existsSync(join(proj, 'index.html')));
});
