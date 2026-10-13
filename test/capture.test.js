// test/capture.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const S = new URL('../scripts/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const F = new URL('./fixtures/css-vars/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const setup = () => {
  const root = mkdtempSync(join(tmpdir(), 'cap-'));
  cpSync(F, root, { recursive: true });
  mkdirSync(join(root, '.design-sync'), { recursive: true });
  writeFileSync(join(root, '.design-sync', 'config.json'), JSON.stringify({ projectName: 'fixture', srcDir: '.' }));
  return { root, out: join(root, 'od-bundle'), review: join(root, '.design-sync', '.cache', 'review') };
};
const build = (t) => execFileSync('node', [join(S, 'ods-build.js'), '--config', join(t.root, '.design-sync', 'config.json'), '--root', t.root, '--out', t.out]);
const capture = (t, ...extra) => execFileSync('node', [join(S, 'ods-capture.js'), '--out', t.out, ...extra], { cwd: t.root, encoding: 'utf8' });
const goodGrade = JSON.stringify({ cells: { light: { verdict: 'good', note: 'ok' }, dark: { verdict: 'good', note: 'ok' } } });

test('capture: fresh page → pendingGrade:true, .cache/.gitignore written', () => {
  const t = setup(); build(t);
  const stdout = capture(t);
  assert.ok(stdout.includes('pending: index'));
  const j = JSON.parse(readFileSync(join(t.review, 'index.json'), 'utf8'));
  assert.equal(j.pendingGrade, true);
  assert.equal(j.keyRecipe, 1);
  assert.deepEqual(j.cells, ['light', 'dark']);
  assert.equal(readFileSync(join(t.root, '.design-sync', '.cache', '.gitignore'), 'utf8'), '*\n');
});

test('capture: good grade both cells → carried forward, pendingGrade:false', () => {
  const t = setup(); build(t); capture(t);
  writeFileSync(join(t.review, 'index.grade.json'), goodGrade);
  const stdout = capture(t);
  assert.ok(stdout.includes('carried forward'));
  assert.equal(JSON.parse(readFileSync(join(t.review, 'index.json'), 'utf8')).pendingGrade, false);
  assert.ok(existsSync(join(t.review, 'index.grade.json')));
});

test('capture: source change + rebuild → grade cleared (contract changed)', () => {
  const t = setup(); build(t); capture(t);
  writeFileSync(join(t.review, 'index.grade.json'), goodGrade);
  capture(t);                                                        // grade survives — same key
  writeFileSync(join(t.root, 'index.html'), '<html><body>changed source</body></html>');
  build(t);
  const stdout = capture(t);
  assert.ok(stdout.includes('grade cleared (contract changed)'));
  assert.ok(!existsSync(join(t.review, 'index.grade.json')));
  assert.equal(JSON.parse(readFileSync(join(t.review, 'index.json'), 'utf8')).pendingGrade, true);
});

test('capture: --force clears an up-to-date grade', () => {
  const t = setup(); build(t); capture(t);
  writeFileSync(join(t.review, 'index.grade.json'), goodGrade);
  const stdout = capture(t, '--force');
  assert.ok(stdout.includes('grade cleared'));
  assert.ok(!existsSync(join(t.review, 'index.grade.json')));
});

test('capture: scoped run never prunes, full run prunes orphans', () => {
  const t = setup(); build(t); capture(t);
  writeFileSync(join(t.review, 'orphan.json'), '{"gradeKey":"x"}');
  capture(t, '--pages', 'index.html');
  assert.ok(existsSync(join(t.review, 'orphan.json')));              // scoped: intact
  capture(t);
  assert.ok(!existsSync(join(t.review, 'orphan.json')));             // full: pruned
});

test('capture: learnings present → [LEARNINGS_UNMERGED] on stderr (full run only)', () => {
  const t = setup(); build(t);
  mkdirSync(join(t.root, '.design-sync', 'learnings'), { recursive: true });
  writeFileSync(join(t.root, '.design-sync', 'learnings', 'batch1.md'), '- note');
  const full = spawnSync('node', [join(S, 'ods-capture.js'), '--out', t.out], { cwd: t.root, encoding: 'utf8' });
  assert.equal(full.status, 0);                                      // warn only, not a failure
  assert.ok(full.stderr.includes('[LEARNINGS_UNMERGED]'));
  assert.ok(full.stderr.includes('batch1.md'));
  const scoped = spawnSync('node', [join(S, 'ods-capture.js'), '--out', t.out, '--pages', 'index.html'], { cwd: t.root, encoding: 'utf8' });
  assert.ok(!scoped.stderr.includes('LEARNINGS_UNMERGED'));          // scoped runs never warn-scan
});

test('capture: missing sidecar → exit 2', () => {
  const t = setup();
  let err = null;
  try { execFileSync('node', [join(S, 'ods-capture.js'), '--out', t.out], { cwd: t.root, stdio: 'pipe' }); }
  catch (e) { err = e; }
  assert.equal(err?.status, 2);
});
