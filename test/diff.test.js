// test/diff.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const S = new URL('../scripts/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const F = new URL('./fixtures/css-vars/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const setup = () => {
  const root = mkdtempSync(join(tmpdir(), 'diff-'));
  cpSync(F, root, { recursive: true });
  mkdirSync(join(root, '.design-sync'), { recursive: true });
  writeFileSync(join(root, '.design-sync', 'config.json'), JSON.stringify({ projectName: 'fixture', srcDir: '.' }));
  const out = join(root, 'od-bundle');
  execFileSync('node', [join(S, 'ods-build.js'), '--config', join(root, '.design-sync', 'config.json'), '--root', root, '--out', out]);
  return { root, out, side: JSON.parse(readFileSync(join(out, '_ods_sync.json'), 'utf8')) };
};
const runDiff = (t, remote) => {
  const args = [join(S, 'ods-diff.js'), '--local', t.out];
  if (remote !== undefined) {
    const p = join(t.root, 'remote-sidecar.json');
    writeFileSync(p, typeof remote === 'string' ? remote : JSON.stringify(remote));
    args.push('--remote', p);
  }
  execFileSync('node', args);
  return JSON.parse(readFileSync(join(t.out, '.sync-diff.json'), 'utf8'));
};

test('diff: no --remote → all added, upload.any, not_provided', () => {
  const t = setup();
  const d = runDiff(t);
  assert.equal(d.anchorReason, 'not_provided');
  assert.equal(d.anchorUsed, false);
  assert.deepEqual(d.added, Object.keys(t.side.renderHashes).sort());
  assert.equal(d.changed.length + d.unchanged.length + d.removed.length, 0);
  assert.equal(d.upload.any, true);
  assert.deepEqual(d.upload.files, Object.keys(t.side.sourceHashes).sort());
  assert.deepEqual(d.upload.deletePaths, []);
  assert.equal(d.upload.styling, true);
});

test('diff: identical remote → all unchanged, upload.any false', () => {
  const t = setup();
  const d = runDiff(t, t.side);
  assert.equal(d.anchorReason, 'ok');
  assert.equal(d.keyedBy, 'sourceKeys');
  assert.deepEqual(d.unchanged, Object.keys(t.side.renderHashes).sort());
  assert.deepEqual(d.added, []);
  assert.equal(d.upload.any, false);
});

test('diff: mutated page in remote → changed + in upload.files', () => {
  const t = setup();
  const r = structuredClone(t.side);
  r.sourceKeys['index.html'] = 'deadbeefdeadbeef';
  r.renderHashes['index.html'] = 'deadbeefdeadbeef';
  r.sourceHashes['index.html'] = 'deadbeefdead';
  const d = runDiff(t, r);
  assert.ok(d.changed.includes('index.html'));
  assert.ok(d.upload.files.includes('index.html'));
  assert.equal(d.upload.any, true);
});

test('diff: remote extra page → removed + deletePaths', () => {
  const t = setup();
  const r = structuredClone(t.side);
  r.renderHashes['gone.html'] = 'deadbeefdeadbeef';
  r.sourceKeys['gone.html'] = 'deadbeefdeadbeef';
  r.sourceHashes['gone.html'] = 'deadbeefdead';
  const d = runDiff(t, r);
  assert.deepEqual(d.removed, ['gone.html']);
  assert.deepEqual(d.upload.deletePaths, ['gone.html']);
  assert.equal(d.upload.any, true);
});

test('diff: shape mismatch → shape_changed, full first-sync scope', () => {
  const t = setup();
  const r = structuredClone(t.side);
  r.shape = t.side.shape === 'app' ? 'static' : 'app';
  const d = runDiff(t, r);
  assert.equal(d.anchorReason, 'shape_changed');
  assert.equal(d.anchorUsed, false);
  assert.deepEqual(d.added, Object.keys(t.side.renderHashes).sort());
  assert.equal(d.upload.any, true);
});

test('diff: malformed remote → degrades, no crash', () => {
  const t = setup();
  const d = runDiff(t, { foo: 1 });
  assert.equal(d.anchorReason, 'malformed');
  assert.deepEqual(d.added, Object.keys(t.side.renderHashes).sort());
});

test('diff: unreadable remote → unreadable, no crash', () => {
  const t = setup();
  const d = runDiff(t, 'not json {{{');
  assert.equal(d.anchorReason, 'unreadable');
});

test('diff: null sourceKey on a page → per-page renderHashes fallback, not changed', () => {
  const t = setup();
  // simulate a placeholder-style page with no mappable source on either side
  const local = structuredClone(t.side);
  local.sourceKeys['index.html'] = null;
  writeFileSync(join(t.out, '_ods_sync.json'), JSON.stringify(local));
  const r = structuredClone(local);
  let d = runDiff(t, r);
  assert.equal(d.keyedBy, 'sourceKeys');
  assert.ok(d.keyFallback.includes('index.html'));
  assert.ok(d.unchanged.includes('index.html'));        // equal renderHashes → unchanged
  r.renderHashes['index.html'] = 'deadbeefdeadbeef';
  d = runDiff(t, r);
  assert.ok(d.changed.includes('index.html'));          // fallback really compares renders
});

test('diff: keyRecipe mismatch → keyedBy renderHashes + upgrade refresh', () => {
  const t = setup();
  const r = structuredClone(t.side);
  r.keyRecipe = 0;
  const d = runDiff(t, r);
  assert.equal(d.anchorReason, 'ok');
  assert.equal(d.keyedBy, 'renderHashes');
  assert.deepEqual(d.changed, []);                      // renders identical
  assert.equal(d.upload.any, true);                     // local-newer recipe forces re-anchor
});
