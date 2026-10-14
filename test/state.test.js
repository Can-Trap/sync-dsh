// test/state.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const S = new URL('../scripts/', import.meta.url).pathname.replace(/^\//, process.platform === 'win32' ? '' : '/');
const initRaw = (dir, ...a) => execFileSync('node', [join(S, 'ods-init.js'), ...a], { cwd: dir }).toString();
const init = (dir) => initRaw(dir, '--project', 'demo');

test('ods-init creates state, config, notes, gitignore split, index', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ods-'));
  writeFileSync(join(dir, '.gitignore'), 'node_modules/\n/.design-sync/\n'); // old blanket line
  init(dir);

  const st = JSON.parse(readFileSync(join(dir, '.design-sync', 'STATE.json'), 'utf8'));
  assert.equal(st.project, 'demo');
  assert.equal(typeof st.createdAt, 'number');
  assert.ok(!('phase' in st));

  const cfg = JSON.parse(readFileSync(join(dir, '.design-sync', 'config.json'), 'utf8'));
  assert.equal(cfg.projectName, 'demo');

  const gi = readFileSync(join(dir, '.gitignore'), 'utf8');
  assert.ok(gi.includes('.design-sync/.cache/'));
  assert.ok(gi.includes('od-bundle/'));
  assert.ok(!gi.split(/\r?\n/).some((l) => l.trim() === '/.design-sync/'));

  const notes = readFileSync(join(dir, '.design-sync', 'NOTES.md'), 'utf8');
  assert.ok(notes.includes('## Known render warns'));
  assert.ok(notes.includes('## Re-sync risks'));

  const idx = readFileSync(join(dir, '.design-sync', 'tasks', 'INDEX.md'), 'utf8');
  assert.ok(idx.includes('01-detect'));
  assert.ok(idx.includes('09-upload-sync'));
  assert.ok(existsSync(join(dir, '.design-sync', 'MAP.md')));
});

test('ods-init re-run preserves existing config.json and NOTES.md', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ods-'));
  init(dir);
  const cfgPath = join(dir, '.design-sync', 'config.json');
  writeFileSync(cfgPath, JSON.stringify({ projectName: 'demo', projectId: 'od-123' }, null, 2) + '\n');
  appendFileSync(join(dir, '.design-sync', 'NOTES.md'), '- hard-won note\n');
  const out = init(dir);
  assert.match(out, /re-sync/);
  assert.equal(JSON.parse(readFileSync(cfgPath, 'utf8')).projectId, 'od-123');
  assert.match(readFileSync(join(dir, '.design-sync', 'NOTES.md'), 'utf8'), /hard-won note/);
});

test('ods-init --mode B seeds only DS phases, pins mode, drift-defers 06', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ods-'));
  execFileSync('node', [join(S, 'ods-init.js'), '--project', 'demo', '--mode', 'B'], { cwd: dir });
  const cfg = JSON.parse(readFileSync(join(dir, '.design-sync', 'config.json'), 'utf8'));
  assert.equal(cfg.mode, 'B');
  const idx = readFileSync(join(dir, '.design-sync', 'tasks', 'INDEX.md'), 'utf8');
  assert.match(idx, /- \[ \] 03-design-system/);                       // active in B
  assert.match(idx, /- \[x\] 04-project \(skipped: mode B\)/);          // skipped in B
  assert.match(idx, /- \[x\] 09-upload-sync \(skipped: mode B\)/);
  assert.match(idx, /- \[x\] 06-pull \(drift-triggered\)/);            // never a first-run box
});

test('ods-init --mode project(A) skips 03, keeps 02 + upload phases', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ods-'));
  execFileSync('node', [join(S, 'ods-init.js'), '--project', 'demo', '--mode', 'project'], { cwd: dir });
  const cfg = JSON.parse(readFileSync(join(dir, '.design-sync', 'config.json'), 'utf8'));
  assert.equal(cfg.mode, 'A');
  const idx = readFileSync(join(dir, '.design-sync', 'tasks', 'INDEX.md'), 'utf8');
  assert.match(idx, /- \[ \] 02-extract/);                             // 02 runs in A (feeds the anchor)
  assert.match(idx, /- \[x\] 03-design-system \(skipped: mode A\)/);
  assert.match(idx, /- \[ \] 09-upload-sync/);
});

test('default mode is both; every phase 01-09 active except drift-deferred 06', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ods-'));
  execFileSync('node', [join(S, 'ods-init.js'), '--project', 'demo'], { cwd: dir });
  assert.equal(JSON.parse(readFileSync(join(dir, '.design-sync', 'config.json'), 'utf8')).mode, 'both');
  const idx = readFileSync(join(dir, '.design-sync', 'tasks', 'INDEX.md'), 'utf8');
  assert.ok(!/skipped: mode/.test(idx));
  assert.match(idx, /- \[ \] 03-design-system/);
  assert.match(idx, /- \[x\] 06-pull \(drift-triggered\)/);
});

/* ── --project: authoritative, spelled-flexibly, never silently generic ───── */

test('ods-init --project is authoritative on a re-sync, and every other field survives', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ods-'));
  init(dir);
  const cfgPath = join(dir, '.design-sync', 'config.json');
  const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
  cfg.projectId = 'od-123';                       // a settled project
  cfg.exclude = ['e2e'];
  writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n');

  initRaw(dir, '--project', 'Stadtwerke FFB Dashboard Design System');

  const after = JSON.parse(readFileSync(cfgPath, 'utf8'));
  assert.equal(after.projectName, 'Stadtwerke FFB Dashboard Design System', 'a name correction must persist');
  assert.equal(after.projectId, 'od-123', 'never drop the pin');
  assert.deepEqual(after.exclude, ['e2e'], 'never re-derive a paid-for decision');
  assert.equal(JSON.parse(readFileSync(join(dir, '.design-sync', 'STATE.json'), 'utf8')).project, 'Stadtwerke FFB Dashboard Design System');
});

test('ods-init without --project keeps the name on record instead of resetting it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ods-'));
  init(dir);
  initRaw(dir);                                   // re-run that repairs a missing file
  assert.equal(JSON.parse(readFileSync(join(dir, '.design-sync', 'config.json'), 'utf8')).projectName, 'demo');
  assert.equal(JSON.parse(readFileSync(join(dir, '.design-sync', 'STATE.json'), 'utf8')).project, 'demo');
});

test('ods-init reads --project however the caller spelled it', () => {
  // --project=Name
  const a = mkdtempSync(join(tmpdir(), 'ods-'));
  initRaw(a, '--project=Alpha', '--mode=B');
  const cfgA = JSON.parse(readFileSync(join(a, '.design-sync', 'config.json'), 'utf8'));
  assert.equal(cfgA.projectName, 'Alpha');
  assert.equal(cfgA.mode, 'B');

  // One joined argv entry — what a caller without a shell hands over.
  const b = mkdtempSync(join(tmpdir(), 'ods-'));
  initRaw(b, '--project "Stadtwerke FFB Dashboard Design System" --mode both');
  const cfgB = JSON.parse(readFileSync(join(b, '.design-sync', 'config.json'), 'utf8'));
  assert.equal(cfgB.projectName, 'Stadtwerke FFB Dashboard Design System');
  assert.equal(cfgB.mode, 'both');
});

test('ods-init warns rather than silently naming a project "project"', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ods-'));
  const r = spawnSync('node', [join(S, 'ods-init.js')], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(r.stderr, /no --project given/);
  assert.equal(JSON.parse(readFileSync(join(dir, '.design-sync', 'config.json'), 'utf8')).projectName, 'project');
});
