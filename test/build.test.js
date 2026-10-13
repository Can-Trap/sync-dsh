// test/build.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, cpSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ODS_RUNTIME } from '../scripts/ods-render.js';
const build = new URL('../scripts/ods-build.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const F = new URL('./fixtures/css-vars/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const setup = () => {
  const root = mkdtempSync(join(tmpdir(), 'build-'));
  cpSync(F, root, { recursive: true });
  mkdirSync(join(root, '.design-sync'), { recursive: true });
  const cfgPath = join(root, '.design-sync', 'config.json');
  writeFileSync(cfgPath, JSON.stringify({ projectName: 'fixture', srcDir: '.' }));
  return { root, cfgPath, out: join(root, 'od-bundle') };
};
const runBuild = (t) => execFileSync('node', [build, '--config', t.cfgPath, '--root', t.root, '--out', t.out]);
const walk = (d, a = []) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); e.isDirectory() ? walk(p, a) : a.push(p); } return a; };

test('build: marker first line, od-safe entry, exact sentinel, valid sidecar', () => {
  const t = setup(); runBuild(t);
  const entry = readFileSync(join(t.out, 'index.html'), 'utf8');
  assert.equal(entry.split('\n')[0], '<!-- @odsCard page="index.html" -->');
  assert.ok(!/<script\b[^>]*\bsrc=/.test(entry));                                   // no external js
  assert.ok(entry.includes(ODS_RUNTIME.slice(0, 20)));                              // runtime injected
  assert.equal(readFileSync(join(t.out, '_ods_needs_recompile'), 'utf8'), '{"by":"sync-dsh"}');
  const side = JSON.parse(readFileSync(join(t.out, '_ods_sync.json'), 'utf8'));
  assert.match(side.styleSha, /^[0-9a-f]{64}$/);
  assert.equal(side.keyRecipe, 1);
  const htmls = walk(t.out).filter((f) => f.endsWith('.html')).map((f) => f.slice(t.out.length + 1).replace(/\\/g, '/'));
  assert.ok(htmls.length > 0);
  for (const h of htmls) assert.match(side.renderHashes[h], /^[0-9a-f]{16}$/);      // every html covered
});

test('build: [OUT_UNSAFE] refuses a non-empty foreign dir', () => {
  const t = setup();
  const foreign = mkdtempSync(join(tmpdir(), 'foreign-'));
  writeFileSync(join(foreign, 'keep.txt'), 'precious');
  let err = null;
  try { execFileSync('node', [build, '--config', t.cfgPath, '--root', t.root, '--out', foreign], { stdio: 'pipe' }); }
  catch (e) { err = e; }
  assert.ok(err && err.status !== 0);
  assert.ok(String(err.stderr).includes('[OUT_UNSAFE]'));
  assert.ok(existsSync(join(foreign, 'keep.txt')));                                 // untouched
});

test('build: tokens.json copied into bundle; tokens-only change flips styleSha', () => {
  const t = setup(); runBuild(t);
  assert.ok(existsSync(join(t.out, 'tokens.json')));
  const sha1 = JSON.parse(readFileSync(join(t.out, '_ods_sync.json'), 'utf8')).styleSha;
  const tokPath = join(t.root, '.design-sync', 'tokens.json');
  const tok = JSON.parse(readFileSync(tokPath, 'utf8'));
  tok.light = { ...(tok.light || {}), color: { ...(tok.light?.color || {}), 'ods-test-extra': '#123456' } };
  writeFileSync(tokPath, JSON.stringify(tok));
  runBuild(t);                                           // no --refresh: edited tokens survive
  const sha2 = JSON.parse(readFileSync(join(t.out, '_ods_sync.json'), 'utf8')).styleSha;
  assert.notEqual(sha1, sha2);
});

test('build twice → identical _ods_sync.json bytes (determinism)', () => {
  const t = setup(); runBuild(t);
  const first = readFileSync(join(t.out, '_ods_sync.json'), 'utf8');
  runBuild(t);
  assert.equal(readFileSync(join(t.out, '_ods_sync.json'), 'utf8'), first);
});
