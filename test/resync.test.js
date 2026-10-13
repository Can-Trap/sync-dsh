// test/resync.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const S = new URL('../scripts/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const F = new URL('./fixtures/css-vars/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const INDEX = '<html><head><style>a{transition:.2s}[data-theme="dark"]{--bg:#000}</style></head>\n'
  + '<body><a href="index.html">home</a><p>This entry page carries plenty of visible text so the thin check passes comfortably.</p></body></html>';

const setup = (cfg = {}) => {
  const root = mkdtempSync(join(tmpdir(), 'resync-'));
  writeFileSync(join(root, 'package.json'), readFileSync(join(F, 'package.json')));
  writeFileSync(join(root, 'styles.css'), readFileSync(join(F, 'styles.css')));
  writeFileSync(join(root, 'index.html'), INDEX);
  mkdirSync(join(root, '.design-sync'), { recursive: true });
  const cfgPath = join(root, '.design-sync', 'config.json');
  writeFileSync(cfgPath, typeof cfg === 'string' ? cfg : JSON.stringify({ projectName: 'fixture', srcDir: '.', ...cfg }));
  return { root, out: join(root, 'od-bundle'), cfgPath };
};
const resync = (t, ...extra) => spawnSync('node',
  [join(S, 'ods-resync.js'), '--config', t.cfgPath, '--root', t.root, '--out', t.out, ...extra],
  { cwd: t.root, encoding: 'utf8' });

test('resync: happy path → ok:true, 4 stages green, verdict on stdout + file', () => {
  const t = setup();
  const r = resync(t);
  assert.equal(r.status, 0, r.stderr);
  const v = JSON.parse(r.stdout);
  assert.equal(v.version, 1);
  assert.equal(v.ok, true);
  assert.deepEqual(Object.keys(v.stages), ['build', 'diff', 'validate', 'capture']);
  for (const s of Object.values(v.stages)) { assert.equal(s.ok, true); assert.equal(s.skipped, null); }
  assert.equal(v.anchor, 'not_provided');
  assert.ok(v.verification.added.includes('index.html'));
  assert.ok(v.verification.pendingGrade.includes('index.html'));   // pending is NOT a failure
  assert.equal(v.upload.any, true);
  assert.deepEqual(JSON.parse(readFileSync(join(t.out, '.resync-verdict.json'), 'utf8')), v);
});

test('resync: config with unknown key → exit 2, NO verdict', () => {
  const t = setup({ bogus: true });
  const r = resync(t);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /nothing was built/);
  assert.equal(r.stdout.trim(), '');
  assert.ok(!existsSync(join(t.out, '.resync-verdict.json')));
});

test('resync: srcDir pointing nowhere → build fails, rest prior_failure, verdict still written', () => {
  const t = setup({ srcDir: 'no-such-dir' });
  const r = resync(t);
  assert.equal(r.status, 1);
  const v = JSON.parse(r.stdout);
  assert.equal(v.ok, false);
  assert.equal(v.stages.build.ok, false);
  for (const n of ['diff', 'validate', 'capture']) assert.equal(v.stages[n].skipped, 'prior_failure');
  assert.equal(v.upload, null);
  assert.ok(existsSync(join(t.out, '.resync-verdict.json')));
});

test('resync: unparseable config JSON → build-stage failure (not pre-flight), exit 1, stdout verdict', () => {
  const t = setup('{not json');
  const r = resync(t);
  assert.equal(r.status, 1);
  const v = JSON.parse(r.stdout);
  assert.equal(v.ok, false);
  assert.equal(v.stages.build.ok, false);
  assert.equal(v.stages.diff.skipped, 'prior_failure');
});

test('resync: no-change re-run with --remote anchor → empty_worklist, upload.any:false, ok:true', () => {
  const t = setup();
  assert.equal(resync(t).status, 0);
  const cache = join(t.root, '.design-sync', '.cache');
  mkdirSync(cache, { recursive: true });
  const anchor = join(cache, 'remote-sync.json');
  copyFileSync(join(t.out, '_ods_sync.json'), anchor);
  const r = resync(t, '--remote', anchor);
  assert.equal(r.status, 0, r.stderr);
  const v = JSON.parse(r.stdout);
  assert.equal(v.ok, true);
  assert.equal(v.anchor, 'ok');
  assert.equal(v.stages.capture.skipped, 'empty_worklist');
  assert.equal(v.upload.any, false);
  assert.deepEqual(v.verification.pendingGrade, []);
});

test('resync: unmerged learnings → ok:false exit 1 with all stages green', () => {
  const t = setup();
  mkdirSync(join(t.root, '.design-sync', 'learnings'), { recursive: true });
  writeFileSync(join(t.root, '.design-sync', 'learnings', 'batch1.md'), '- note');
  const r = resync(t);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /\[LEARNINGS_UNMERGED\]/);
  const v = JSON.parse(r.stdout);
  assert.equal(v.ok, false);
  for (const s of Object.values(v.stages)) assert.equal(s.ok, true);
  assert.deepEqual(v.learningsUnmerged, ['batch1.md']);
});
