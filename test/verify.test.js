// test/verify.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const script = new URL('../scripts/ods-verify.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

test('passes on OD-safe entry with links/theme/effects', () => {
  const d = mkdtempSync(join(tmpdir(), 'ver-'));
  const f = join(d, 'index.html');
  writeFileSync(f, '<html><head><style>a{transition:.2s}[data-theme="dark"]{--bg:#000}</style></head><body data-theme><a href="x/index.html">x</a></body></html>');
  const out = execFileSync('node', [script, '--entry-html', f], { encoding: 'utf8' });
  assert.match(out, /✓ links/); assert.match(out, /✓ theme/); assert.match(out, /✓ effects/); assert.match(out, /✓ od-safe/);
});

test('fails when a script tag is present (not OD-safe)', () => {
  const d = mkdtempSync(join(tmpdir(), 'ver2-'));
  const f = join(d, 'index.html');
  writeFileSync(f, '<html><body><a href="x">x</a><script src="/big.js"></script></body></html>');
  let code = 0; try { execFileSync('node', [script, '--entry-html', f]); } catch (e) { code = e.status; }
  assert.equal(code, 1);
});
