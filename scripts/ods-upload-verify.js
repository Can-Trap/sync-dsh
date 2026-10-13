// scripts/ods-upload-verify.js — post-upload check: the agent-saved OD list_files result
// vs the executed plan. Pass ⇔ every expectRemote path present AND no plan deletePath survives.
import { readJSON } from './_lib.js';

const arg = (k) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : null; };

const planPath = arg('--plan'), remotePath = arg('--remote');
if (!planPath || !remotePath) { console.error('usage: ods-upload-verify.js --plan <path> --remote <saved list_files JSON>'); process.exit(2); }

const plan = readJSON(planPath, null);
if (!plan || !Array.isArray(plan.expectRemote) || !Array.isArray(plan.sequence)) { console.error(`✗ upload-verify: unreadable plan ${planPath}`); process.exit(2); }

// remote listing: accept ['a.html',…] or [{path:…},…] or {files:[…]} — normalize to a path set
const raw = readJSON(remotePath, null);
const list = Array.isArray(raw) ? raw : Array.isArray(raw?.files) ? raw.files : null;
if (!list) { console.error(`✗ upload-verify: unreadable remote listing ${remotePath}`); process.exit(2); }
const have = new Set(list.map((e) => (typeof e === 'string' ? e : e?.path)).filter(Boolean));

const missing = plan.expectRemote.filter((p) => !have.has(p));
const surviving = plan.sequence.filter((s) => s.op === 'delete' && have.has(s.path)).map((s) => s.path);
if (missing.length === 0 && surviving.length === 0) {
  console.log(`[ods] upload: verified (${plan.expectRemote.length} files)`);
  process.exit(0);
}
if (missing.length) console.error('✗ upload-verify: missing remotely: ' + missing.join(', '));
if (surviving.length) console.error('✗ upload-verify: deletePaths still present: ' + surviving.join(', '));
process.exit(1);
