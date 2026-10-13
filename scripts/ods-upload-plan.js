// scripts/ods-upload-plan.js — prepares the upload manifest the AGENT executes over OD MCP.
// Scripts never call MCP: this emits <out>/.upload-plan.json (sentinel → content → deletes →
// re-arm → anchor LAST); the agent runs it via write_file/delete_file, then ods-upload-verify.js checks.
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readJSON, writeJSON } from './_lib.js';
import { renderHashFor } from './_hashes.js';
import { validSidecar } from './ods-validate.js';

const arg = (k) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : null; };

const outArg = arg('--out');
if (!outArg) { console.error('usage: ods-upload-plan.js --out <dir> [--diff <path>] [--project <id>]'); process.exit(2); }
const out = resolve(outArg);

// guards — never plan over a missing or stale build
const side = readJSON(join(out, '_ods_sync.json'), null);
if (!validSidecar(side)) { console.error('✗ upload-plan: _ods_sync.json missing or invalid — run ods-resync.js first'); process.exit(1); }
const stale = Object.keys(side.renderHashes).filter((rel) => renderHashFor(out, rel) !== side.renderHashes[rel]);
if (stale.length) { console.error(`✗ [SYNC_STALE] stale build — run the driver (mismatch: ${stale.join(', ')})`); process.exit(1); }

// diff artifact: missing → deletes unknown; proceed with none, but say so loudly
const diff = readJSON(arg('--diff') || join(out, '.sync-diff.json'), null);
if (!diff) console.error('⚠ upload-plan: no diff — deletes unknown; run ods-resync.js');
const deletePaths = diff?.upload?.deletePaths ?? [];

const projectId = arg('--project') || readJSON(join(process.cwd(), '.design-sync', '.cache', 'od-project.json'), {})?.projectId || null;

// every non-dot file under out, fwd-slash rels, sorted
const rels = [];
const walk = (dir, rel) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) walk(join(dir, e.name), r);
    else rels.push(r);
  }
};
walk(out, '');
rels.sort();

// content = everything except the sentinel and the anchor; entry first, rest stable-sorted
const content = rels.filter((r) => r !== '_ods_sync.json' && r !== '_ods_needs_recompile');
const ei = content.indexOf('index.html');
if (ei > 0) { content.splice(ei, 1); content.unshift('index.html'); }

const W = (stage, path) => ({ op: 'write', stage, path, local: join(out, ...path.split('/')) });
const sequence = [
  W('sentinel', '_ods_needs_recompile'),
  ...content.map((r) => W('content', r)),
  ...deletePaths.map((p) => ({ op: 'delete', stage: 'delete', path: p })),
  W('rearm', '_ods_needs_recompile'),
  W('anchor', '_ods_sync.json'),
];
const plan = {
  projectId,
  sequence,
  counts: { writes: sequence.filter((s) => s.op === 'write').length, deletes: deletePaths.length },
  expectRemote: rels, // every non-dot rel expected after apply, incl. sentinel + anchor
};
writeJSON(join(out, '.upload-plan.json'), plan);
console.log(`[ods] upload-plan: ${plan.counts.writes} writes (${content.length} content), ${plan.counts.deletes} deletes -> .upload-plan.json`);
console.log('STOP rule: any uncleared write/delete failure → stop; no re-arm, no anchor');
