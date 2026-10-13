// test/adaptivity.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, cpSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const S = new URL('../scripts/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const F = new URL('./fixtures/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
for (const name of ['tailwind-theme', 'css-vars', 'token-file']) {
  test(`adaptivity: ${name} yields non-empty light tokens`, () => {
    const d = mkdtempSync(join(tmpdir(), name + '-')); cpSync(join(F, name), d, { recursive: true });
    execFileSync('node', [join(S, 'ods-detect.js'), '--root', d, '--out', join(d, 'signals.json')]);
    execFileSync('node', [join(S, 'ods-extract-tokens.js'), '--root', d, '--signals', join(d, 'signals.json'), '--out', join(d, 'tokens.json')]);
    const t = JSON.parse(readFileSync(join(d, 'tokens.json'), 'utf8'));
    assert.ok(Object.keys(t.light.color).length > 0);
    assert.ok(t.dark);
  });
}
