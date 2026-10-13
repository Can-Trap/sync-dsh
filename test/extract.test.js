// test/extract.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const S = new URL('../scripts/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const run = (root) => {
  execFileSync('node', [join(S, 'ods-detect.js'), '--root', root, '--out', join(root, 'signals.json')]);
  execFileSync('node', [join(S, 'ods-extract-tokens.js'), '--root', root, '--signals', join(root, 'signals.json'), '--out', join(root, 'tokens.json')]);
  return JSON.parse(readFileSync(join(root, 'tokens.json'), 'utf8'));
};

test('css-vars: extracts :root vars + .dark overrides into light+dark', () => {
  const d = mkdtempSync(join(tmpdir(), 'ex1-'));
  writeFileSync(join(d, 'styles.css'), ':root{--bg:#ffffff;--fg:#111}\n.dark{--bg:#000000}');
  const t = run(d);
  assert.equal(t.light.color['bg'], '#ffffff');
  assert.equal(t.dark.color['bg'], '#000000');
  assert.equal(t.dark.color['fg'], '#111');  // inherited from light
});

test('token-file: reads tokens.json colors', () => {
  const d = mkdtempSync(join(tmpdir(), 'ex2-'));
  writeFileSync(join(d, 'tokens.json'), JSON.stringify({ color: { brand: '#f50' } }));
  const t = run(d);
  assert.equal(t.light.color['brand'], '#f50');
});

test('always emits both themes even with no dark', () => {
  const d = mkdtempSync(join(tmpdir(), 'ex3-'));
  writeFileSync(join(d, 'styles.css'), ':root{--bg:#fff}');
  const t = run(d);
  assert.ok(t.light && t.dark);
});

test('--signals tokenSources scopes the scan (other css absent)', () => {
  const d = mkdtempSync(join(tmpdir(), 'ex4-'));
  writeFileSync(join(d, 'a.css'), ':root{--other:#000}');
  writeFileSync(join(d, 'b.css'), ':root{--bg:#fff}');
  writeFileSync(join(d, 'signals.json'), JSON.stringify({ tokenSources: [join(d, 'b.css')] }));
  execFileSync('node', [join(S, 'ods-extract-tokens.js'), '--root', d, '--signals', join(d, 'signals.json'), '--out', join(d, 'tokens.json')]);
  const t = JSON.parse(readFileSync(join(d, 'tokens.json'), 'utf8'));
  assert.equal(t.light.color['bg'], '#fff');
  assert.equal(t.light.color['other'], undefined);   // pinned scan only — b.css alone fed the tokens
});
