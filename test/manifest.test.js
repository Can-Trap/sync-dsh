// test/manifest.test.js
//
// The drift ledger is the safety check between a hand-edited source and an upload,
// so its exit status is the contract: 0 clean, 1 drift, 2 the ledger is unusable.
// The overlap between 0 and 2 is the whole point — "I could not check" must never
// read as "nothing changed". It did: a manifest that parses but is not a ledger
// (an error payload written over it, say) reached `for (const p of data.pairs)`
// and threw `TypeError: data.pairs is not iterable`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const script = new URL('../scripts/ods-manifest.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

/** Run the script, capturing the exit status instead of throwing on non-zero. */
const run = (cwd, ...a) => {
  try { return { status: 0, out: execFileSync('node', [script, ...a], { cwd, encoding: 'utf8', stdio: 'pipe' }) }; }
  catch (e) { return { status: e.status, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }; }
};
const project = (manifest) => {
  const d = mkdtempSync(join(tmpdir(), 'man-'));
  if (manifest !== undefined) {
    mkdirSync(join(d, '.design-sync'), { recursive: true });
    writeFileSync(join(d, '.design-sync', 'manifest.json'), typeof manifest === 'string' ? manifest : JSON.stringify(manifest));
  }
  return d;
};

test('add then drift detects source change', () => {
  const d = project();
  const s = join(d, 's.txt'), o = join(d, 'o.txt');
  writeFileSync(s, 'v1'); writeFileSync(o, 'v1');
  run(d, 'add', '--pair', `${s}::${o}`);
  assert.match(run(d, 'drift').out, /clean/);
  writeFileSync(s, 'v2');
  assert.equal(run(d, 'drift').status, 1);
});

test('add accepts --pair=<a>::<b> as well as --pair <a>::<b>', () => {
  const d = project();
  const s = join(d, 's.txt'), o = join(d, 'o.txt');
  writeFileSync(s, 'v1'); writeFileSync(o, 'v1');
  assert.equal(run(d, 'add', `--pair=${s}::${o}`).status, 0);
  assert.match(run(d, 'drift').out, /clean/);
});

test('a manifest that is not a ledger is exit 2 with a diagnosis, not a TypeError', () => {
  // A file that parses — an error payload written over the ledger, say — used to
  // crash the check instead of failing it.
  const d = project({ error: 'query_timeout' });
  const r = run(d, 'drift');
  assert.equal(r.status, 2, 'an unreadable ledger must not report "clean" (0) or "drift" (1)');
  assert.doesNotMatch(r.out, /TypeError/);
  assert.match(r.out, /not a drift ledger/);
  assert.match(r.out, /"error"/, 'the message names the key it found instead of "pairs"');
  assert.match(r.out, /MANIFEST_CORRUPT/);
});

test('an empty ledger is clean, and a bare array is read as pairs', () => {
  assert.equal(run(project({}), 'drift').status, 0);
  assert.equal(run(project({ pairs: null }), 'drift').status, 0);
  assert.equal(run(project([]), 'drift').status, 0);
  assert.equal(run(project('[{"src":"a","od":"b","srcHash":"x","odHash":"y"}]'), 'drift').status, 1);  // one pair, now drifted
});

test('invalid JSON and one-sided pairs are exit 2, never a silent pass', () => {
  const bad = run(project('{ not json'), 'drift');
  assert.equal(bad.status, 2);
  assert.match(bad.out, /not valid JSON/);

  const oneSided = run(project({ pairs: [{ src: 'only-src' }] }), 'drift');
  assert.equal(oneSided.status, 2);
  assert.match(oneSided.out, /pairs\[0\]/);
});

test('add refuses a pair it cannot use, and refuses to clobber a ledger it cannot read', () => {
  const d = project();
  const noPair = run(d, 'add', '--pair', 'only-one-side');
  assert.equal(noPair.status, 2);
  assert.match(noPair.out, /both sides are required/);

  const corrupt = project({ error: 'query_timeout' });
  assert.equal(run(corrupt, 'add', '--pair', 'a::b').status, 2, 'never overwrite an unreadable ledger wholesale');
});

test('a tracked file that vanished is drift, and says so', () => {
  const d = project();
  const s = join(d, 's.txt'), o = join(d, 'o.txt');
  writeFileSync(s, 'v1'); writeFileSync(o, 'v1');
  run(d, 'add', '--pair', `${s}::${o}`);
  execFileSync('node', ['-e', `require('fs').rmSync(${JSON.stringify(s)})`]);
  const r = run(d, 'drift');
  assert.equal(r.status, 1);
  assert.match(r.out, /missing/);
});

test('a manifest is only ever written to .design-sync/', () => {
  const d = project();
  const s = join(d, 's.txt'), o = join(d, 'o.txt');
  writeFileSync(s, 'v1'); writeFileSync(o, 'v1');
  run(d, 'add', '--pair', `${s}::${o}`);
  const written = JSON.parse(readFileSync(join(d, '.design-sync', 'manifest.json'), 'utf8'));
  assert.deepEqual(Object.keys(written), ['pairs']);
  assert.equal(written.pairs.length, 1);
  assert.match(written.pairs[0].srcHash, /^[0-9a-f]{64}$/);
});
