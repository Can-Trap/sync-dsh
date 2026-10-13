// test/hashes.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonical, renderHashFor, sourceKeyFor, sourceHashesFor, styleShaFor, gradeKeyFrom } from '../scripts/_hashes.js';

test('canonical is key-order invariant, undefined→null', () => {
  assert.equal(canonical({ a: 1, b: { x: 1, y: 2 } }), canonical({ b: { y: 2, x: 1 }, a: 1 }));
  assert.notEqual(canonical({ a: 1 }), canonical({ a: 2 }));
  assert.equal(canonical(undefined), 'null');
  assert.equal(canonical({ a: undefined }), '{"a":null}');
});

test('renderHashFor ignores the first line, keyed by body', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ods-hash-'));
  writeFileSync(join(dir, 'a.html'), '<!-- @odsCard page="a.html" -->\n<body>hello</body>\n');
  writeFileSync(join(dir, 'b.html'), '<!-- some other marker -->\n<body>hello</body>\n');
  writeFileSync(join(dir, 'c.html'), '<!-- @odsCard page="a.html" -->\n<body>changed</body>\n');
  assert.equal(renderHashFor(dir, 'a.html'), renderHashFor(dir, 'b.html'));     // marker swap: same
  assert.notEqual(renderHashFor(dir, 'a.html'), renderHashFor(dir, 'c.html'));  // body change: different
  assert.match(renderHashFor(dir, 'a.html'), /^[0-9a-f]{16}$/);
  assert.match(renderHashFor(dir, 'missing.html'), /^[0-9a-f]{16}$/);           // '∅', never throws
});

test('sourceKeyFor moves on override change and source byte change; null on empty', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ods-hash-'));
  writeFileSync(join(dir, 'a.txt'), 'one');
  const cfg = { projectName: 'x' };
  const src = [join(dir, 'a.txt')];
  const k1 = sourceKeyFor({ srcFiles: src, cfg, pageRel: 'index.html' });
  assert.match(k1, /^[0-9a-f]{16}$/);
  const k2 = sourceKeyFor({ srcFiles: src, cfg: { ...cfg, overrides: { 'index.html': { thinOk: true } } }, pageRel: 'index.html' });
  assert.notEqual(k1, k2);                                                       // override change moves the key
  writeFileSync(join(dir, 'a.txt'), 'two');
  assert.notEqual(k1, sourceKeyFor({ srcFiles: src, cfg, pageRel: 'index.html' })); // byte change moves it
  assert.equal(sourceKeyFor({ srcFiles: [], cfg, pageRel: 'index.html' }), null);
  assert.equal(sourceKeyFor({ srcFiles: null, cfg, pageRel: 'index.html' }), null);
});

test('sourceKeyFor is machine-independent: same content under two roots → same key', () => {
  const mkRoot = () => {
    const d = mkdtempSync(join(tmpdir(), 'ods-root-'));
    writeFileSync(join(d, 'page.html'), '<body>same bytes</body>');
    return d;
  };
  const cfg = { projectName: 'x' };
  const a = sourceKeyFor({ srcFiles: ['page.html'], cfg, pageRel: 'page.html', root: mkRoot() });
  const b = sourceKeyFor({ srcFiles: ['page.html'], cfg, pageRel: 'page.html', root: mkRoot() });
  assert.match(a, /^[0-9a-f]{16}$/);
  assert.equal(a, b);
});

test('sourceHashesFor walks recursively, skips dotfiles, 12-hex values', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ods-hash-'));
  writeFileSync(join(dir, 'index.html'), 'hi');
  mkdirSync(join(dir, 'sub'));
  writeFileSync(join(dir, 'sub', 'a.css'), 'css');
  writeFileSync(join(dir, '.hidden'), 'nope');
  mkdirSync(join(dir, '.cache'));
  writeFileSync(join(dir, '.cache', 'x'), 'nope');
  const m = sourceHashesFor(dir);
  assert.deepEqual(Object.keys(m).sort(), ['index.html', 'sub/a.css']);
  assert.match(m['index.html'], /^[0-9a-f]{12}$/);
});

test('styleShaFor: 64-hex, moves on css change', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ods-hash-'));
  writeFileSync(join(dir, 'main.css'), 'body{color:red}');
  const s1 = styleShaFor(dir);
  assert.match(s1, /^[0-9a-f]{64}$/);
  writeFileSync(join(dir, 'main.css'), 'body{color:blue}');
  assert.notEqual(s1, styleShaFor(dir));
});

test('gradeKeyFrom stable 16-hex', () => {
  assert.equal(gradeKeyFrom('k1'), gradeKeyFrom('k1'));
  assert.notEqual(gradeKeyFrom('k1'), gradeKeyFrom('k2'));
  assert.match(gradeKeyFrom('k1'), /^[0-9a-f]{16}$/);
});
