// scripts/ods-manifest.js — the drift ledger: src↔od pairs, sha256-exact.
//
// Shape: `{ pairs: [{ src, od, srcHash, odHash }] }` (references/state-protocol.md).
//
// Exit status IS the contract, so a caller can trust all three outcomes:
//   0  clean        — every tracked pair hashes as recorded
//   1  drift        — at least one side changed (or vanished)
//   2  unusable     — the ledger itself could not be read or validated
// A 2 is deliberately distinct from 0: "I could not check" must never be reported
// as "nothing changed".
import { join } from 'node:path';
import { readText, writeJSON, sha256, exists, arg, argvTokens } from './_lib.js';

const cmd = argvTokens()[0];
const mf = join(process.cwd(), '.design-sync', 'manifest.json');
const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
const hashOf = (p) => sha256(readText(p) ?? '');
const fail = (...lines) => { for (const l of lines) console.error(l); process.exit(2); };

const REBUILD_HINT = [
  '[MANIFEST_CORRUPT] expected { "pairs": [ { src, od, srcHash, odHash } ] }.',
  '                   If a failed query clobbered this file, delete it (an absent ledger reads',
  '                   as empty) and re-track pairs with: add --pair <src>::<od>',
];

/**
 * Read the ledger, or refuse to run.
 *
 * This used to be `readJSON(mf, { pairs: [] })`, which falls back only when the
 * file is MISSING or is invalid JSON. A manifest that parses but is not a ledger
 * came back as-is, and `for (const p of data.pairs)` then threw
 * `TypeError: data.pairs is not iterable` — so a ledger overwritten with an error
 * payload did not fail the check, it killed it. The drift check is the one thing
 * standing between a hand-edited page and a bad upload, and a crash is the worst
 * of the three possible outcomes: it reads as a broken tool rather than as a
 * verdict about the project.
 *
 * A corrupt ledger stays LOUD: silently falling back to `{pairs: []}` here would
 * print "clean" for a project whose pairs were just lost — the precise failure
 * this check exists to prevent.
 */
function readLedger() {
  const raw = readText(mf);
  if (raw == null) return { pairs: [] };               // no ledger yet: nothing tracked
  let data;
  try { data = JSON.parse(raw); } catch (e) {
    fail(`✗ manifest: ${mf} is not valid JSON — ${e.message}`, ...REBUILD_HINT);
  }
  if (Array.isArray(data)) data = { pairs: data };     // a bare array is a pairs list
  if (data === null) data = {};
  if (!isObj(data)) fail(`✗ manifest: ${mf} holds a ${Array.isArray(data) ? 'array' : typeof data}, not a ledger`, ...REBUILD_HINT);

  if (data.pairs === undefined || data.pairs === null) {
    // `{}` and `{pairs: null}` are empty ledgers; any OTHER key means this file
    // belongs to something else and must not be read as "nothing tracked".
    const other = Object.keys(data).filter((k) => k !== 'pairs');
    if (other.length) {
      fail(`✗ manifest: ${mf} is not a drift ledger — top-level key${other.length > 1 ? 's' : ''}: ${other.map((k) => JSON.stringify(k)).join(', ')}`,
        ...REBUILD_HINT);
    }
    return { pairs: [] };
  }
  if (!Array.isArray(data.pairs)) fail(`✗ manifest: ${mf} — "pairs" is a ${typeof data.pairs}, not an array`, ...REBUILD_HINT);

  const pairs = [];
  data.pairs.forEach((p, i) => {
    if (!isObj(p) || typeof p.src !== 'string' || !p.src || typeof p.od !== 'string' || !p.od) {
      fail(`✗ manifest: ${mf} — pairs[${i}] is not a { src, od } pair: ${JSON.stringify(p)}`,
        '[MANIFEST_CORRUPT] a ledger entry needs both sides to compare; a one-sided pair cannot drift-check.');
    }
    pairs.push(p);
  });
  return { pairs };
}

if (cmd === 'add') {
  const pairArg = arg('--pair');
  const [src, od] = (pairArg || '').split('::');
  if (!pairArg || !src || !od) {
    fail('[CONFIG] usage: ods-manifest.js add --pair <src>::<od>',
      '         both sides are required — a pair with one side cannot be drift-checked.');
  }
  const data = readLedger();                           // refuses to clobber a ledger it cannot read
  data.pairs = data.pairs.filter((p) => !(p.src === src && p.od === od));
  data.pairs.push({ src, od, srcHash: hashOf(src), odHash: hashOf(od) });
  writeJSON(mf, data);
  console.log(`[ods] manifest add ${src} :: ${od}`);
} else if (cmd === 'drift') {
  const data = readLedger();
  const changed = [];
  for (const p of data.pairs) {
    const srcMissing = !exists(p.src), odMissing = !exists(p.od);
    const srcChanged = srcMissing || hashOf(p.src) !== p.srcHash;
    const odChanged = odMissing || hashOf(p.od) !== p.odHash;
    if (srcChanged || odChanged) changed.push({ ...p, srcChanged, odChanged, srcMissing, odMissing });
  }
  if (changed.length === 0) { console.log('[ods] drift: clean'); process.exit(0); }
  for (const c of changed) {
    console.log(`[ods] drift: ${c.src} (src:${c.srcChanged}${c.srcMissing ? ' missing' : ''} od:${c.odChanged}${c.odMissing ? ' missing' : ''})`);
  }
  process.exit(1);
} else {
  console.log('usage: ods-manifest.js add --pair a::b | drift');
  console.log('exit: 0 clean, 1 drift, 2 ledger unusable');
}
