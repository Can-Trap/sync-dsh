// test/upload.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, appendFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const S = new URL('../scripts/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const F = new URL('./fixtures/css-vars/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const DELETES = ['old/gone.html', 'zzz.css'];
const setup = () => {
  const root = mkdtempSync(join(tmpdir(), 'upload-'));
  cpSync(F, root, { recursive: true });
  mkdirSync(join(root, '.design-sync'), { recursive: true });
  writeFileSync(join(root, '.design-sync', 'config.json'), JSON.stringify({ projectName: 'fixture', srcDir: '.' }));
  const out = join(root, 'od-bundle');
  execFileSync('node', [join(S, 'ods-build.js'), '--config', join(root, '.design-sync', 'config.json'), '--root', root, '--out', out]);
  // build wipes .sync-diff.json — craft one with known deletePaths
  writeFileSync(join(out, '.sync-diff.json'), JSON.stringify({ upload: { any: true, pages: [], files: [], deletePaths: DELETES, styling: false } }));
  return { root, out };
};
const run = (args) => { try { execFileSync('node', args); return 0; } catch (e) { return e.status; } };
const plan = (t) => {
  assert.equal(run([join(S, 'ods-upload-plan.js'), '--out', t.out, '--project', 'test-id']), 0);
  return JSON.parse(readFileSync(join(t.out, '.upload-plan.json'), 'utf8'));
};

test('plan: sentinel first, anchor last, re-arm at len-2, deletes verbatim, no dot paths', () => {
  const p = plan(setup());
  const seq = p.sequence;
  assert.equal(seq[0].stage, 'sentinel');
  assert.equal(seq[0].path, '_ods_needs_recompile');
  assert.equal(seq[seq.length - 1].stage, 'anchor');
  assert.equal(seq[seq.length - 1].path, '_ods_sync.json');
  assert.equal(seq[seq.length - 2].stage, 'rearm');
  assert.equal(seq[seq.length - 2].path, '_ods_needs_recompile');
  assert.equal(seq[1].path, 'index.html'); // entry first among content
  assert.deepEqual(seq.filter((s) => s.op === 'delete').map((s) => s.path), DELETES);
  for (const s of seq) assert.ok(!s.path.split('/').some((seg) => seg.startsWith('.')), `dot path in sequence: ${s.path}`);
  for (const r of p.expectRemote) assert.ok(!r.split('/').some((seg) => seg.startsWith('.')), `dot path in expectRemote: ${r}`);
  assert.ok(p.expectRemote.includes('_ods_needs_recompile'));
  assert.ok(p.expectRemote.includes('_ods_sync.json'));
  assert.equal(p.projectId, 'test-id');
  assert.equal(p.counts.deletes, DELETES.length);
  assert.equal(p.counts.writes, seq.filter((s) => s.op === 'write').length);
});

test('plan: hand-edited page → refused [SYNC_STALE]', () => {
  const t = setup();
  appendFileSync(join(t.out, 'index.html'), '<!-- tampered -->');
  assert.equal(run([join(S, 'ods-upload-plan.js'), '--out', t.out]), 1);
});

test('verify: remote listing equal to expectRemote → exit 0', () => {
  const t = setup();
  const p = plan(t);
  const remote = join(t.root, 'remote-files.json');
  writeFileSync(remote, JSON.stringify(p.expectRemote));
  assert.equal(run([join(S, 'ods-upload-verify.js'), '--plan', join(t.out, '.upload-plan.json'), '--remote', remote]), 0);
});

test('verify: missing file → exit 1 naming it', () => {
  const t = setup();
  const p = plan(t);
  const remote = join(t.root, 'remote-files.json');
  writeFileSync(remote, JSON.stringify(p.expectRemote.filter((r) => r !== 'index.html')));
  let err = '';
  try { execFileSync('node', [join(S, 'ods-upload-verify.js'), '--plan', join(t.out, '.upload-plan.json'), '--remote', remote]); assert.fail('expected exit 1'); }
  catch (e) { assert.equal(e.status, 1); err = String(e.stderr); }
  assert.match(err, /index\.html/);
});

test('verify: surviving deletePath → exit 1', () => {
  const t = setup();
  const p = plan(t);
  const remote = join(t.root, 'remote-files.json');
  writeFileSync(remote, JSON.stringify([...p.expectRemote, DELETES[0]]));
  assert.equal(run([join(S, 'ods-upload-verify.js'), '--plan', join(t.out, '.upload-plan.json'), '--remote', remote]), 1);
});

test('verify: accepts [{path}] and {files:[…]} remote shapes', () => {
  const t = setup();
  const p = plan(t);
  const remote = join(t.root, 'remote-files.json');
  writeFileSync(remote, JSON.stringify(p.expectRemote.map((path) => ({ path }))));
  assert.equal(run([join(S, 'ods-upload-verify.js'), '--plan', join(t.out, '.upload-plan.json'), '--remote', remote]), 0);
  writeFileSync(remote, JSON.stringify({ files: p.expectRemote }));
  assert.equal(run([join(S, 'ods-upload-verify.js'), '--plan', join(t.out, '.upload-plan.json'), '--remote', remote]), 0);
});
