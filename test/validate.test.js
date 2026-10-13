// test/validate.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderHashFor } from '../scripts/_hashes.js';
const build = new URL('../scripts/ods-build.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const validate = new URL('../scripts/ods-validate.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const F = new URL('./fixtures/css-vars/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const INDEX = '<html><head><style>a{transition:.2s}[data-theme="dark"]{--bg:#000}</style></head>\n'
  + '<body><a href="index.html">home</a><p>This entry page carries plenty of visible text so the thin check passes comfortably.</p></body></html>';

const setup = ({ cfg = {}, pages = {}, css = null } = {}) => {
  const root = mkdtempSync(join(tmpdir(), 'val-'));
  writeFileSync(join(root, 'package.json'), '{}');
  writeFileSync(join(root, 'styles.css'), css ?? readFileSync(join(F, 'styles.css'), 'utf8'));
  writeFileSync(join(root, 'index.html'), pages['index.html'] ?? INDEX);
  for (const [rel, html] of Object.entries(pages)) if (rel !== 'index.html') writeFileSync(join(root, rel), html);
  mkdirSync(join(root, '.design-sync'), { recursive: true });
  const cfgPath = join(root, '.design-sync', 'config.json');
  writeFileSync(cfgPath, JSON.stringify({ projectName: 'fixture', srcDir: '.', ...cfg }));
  return { root, cfgPath, out: join(root, 'od-bundle') };
};
const runBuild = (t) => execFileSync('node', [build, '--config', t.cfgPath, '--root', t.root, '--out', t.out]);
const runVal = (t) => { // → {status, stderr}
  try { execFileSync('node', [validate, t.out, '--config', t.cfgPath], { cwd: t.root, stdio: 'pipe' }); return { status: 0, stderr: '' }; }
  catch (e) { return { status: e.status, stderr: String(e.stderr) }; }
};
const readRC = (t) => JSON.parse(readFileSync(join(t.out, '.render-check.json'), 'utf8'));
// keep the sidecar honest after a deliberate page edit (so a test hits its own tag, not [SYNC_STALE])
const patchSidecar = (t) => {
  const p = join(t.out, '_ods_sync.json');
  const side = JSON.parse(readFileSync(p, 'utf8'));
  for (const rel of Object.keys(side.renderHashes)) side.renderHashes[rel] = renderHashFor(t.out, rel);
  writeFileSync(p, JSON.stringify(side, null, 2) + '\n');
};

test('clean bundle: exit 0, bad:0, iterations bump on re-run', () => {
  const t = setup(); runBuild(t);
  assert.equal(runVal(t).status, 0);
  let rc = readRC(t);
  assert.equal(rc.bad, 0); assert.equal(rc.iterations, 1); assert.ok(rc.total >= 1);
  const entry = rc.entries.find((e) => e.rel === 'index.html');
  assert.deepEqual(entry.checks, { card: true, odSafe: true, links: true, theme: true, effects: true, runtime: true });
  assert.equal(runVal(t).status, 0);
  rc = readRC(t);
  assert.equal(rc.iterations, 2);
});

test('hand-edited page → [SYNC_STALE] fail, no .render-check.json', () => {
  const t = setup(); runBuild(t);
  const p = join(t.out, 'index.html');
  writeFileSync(p, readFileSync(p, 'utf8') + '<!-- edited by hand -->');
  const r = runVal(t);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /\[SYNC_STALE\]/);
  assert.ok(!existsSync(join(t.out, '.render-check.json')));
});

test('injected <script src> (sidecar re-stamped) → bad:1 [OD_UNSAFE], no [SYNC_STALE]', () => {
  const t = setup(); runBuild(t);
  const p = join(t.out, 'index.html');
  writeFileSync(p, readFileSync(p, 'utf8').replace('</body>', '<script src="https://cdn.example/x.js"></script></body>'));
  patchSidecar(t);
  const r = runVal(t);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /\[OD_UNSAFE\]/);
  assert.ok(!r.stderr.includes('[SYNC_STALE]'));
  assert.equal(readRC(t).bad, 1);
});

test('stripped marker (sidecar re-stamped) → [ODSCARD_MISSING]', () => {
  const t = setup(); runBuild(t);
  const p = join(t.out, 'index.html');
  writeFileSync(p, readFileSync(p, 'utf8').split('\n').slice(1).join('\n'));
  patchSidecar(t);
  const r = runVal(t);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /\[ODSCARD_MISSING\]/);
});

test('tiny page → thin:1, exit 0; overrides.thinOk silences it', () => {
  const tiny = '<html><body><a href="index.html">hi</a></body></html>';
  const t = setup({ pages: { 'tiny.html': tiny } }); runBuild(t);
  assert.equal(runVal(t).status, 0);
  assert.equal(readRC(t).thin, 1);
  const t2 = setup({ pages: { 'tiny.html': tiny }, cfg: { overrides: { 'tiny.html': { thinOk: true } } } });
  runBuild(t2);
  assert.equal(runVal(t2).status, 0);
  assert.equal(readRC(t2).thin, 0);
});

test('light==dark tokens + no dark css → variantsIdentical ≥ 1, exit 0', () => {
  const t = setup({
    css: ':root { --bg: #ffffff; --fg: #111 }\n',
    pages: {
      'index.html': '<html><head><link rel="stylesheet" href="styles.css"><style>a:hover{color:var(--fg)}</style></head>\n'
        + '<body><a href="index.html">home</a><p>Enough visible words here to stay comfortably above the thin threshold.</p></body></html>',
    },
  });
  runBuild(t);
  assert.equal(runVal(t).status, 0);
  assert.ok(readRC(t).variantsIdentical >= 1);
});
