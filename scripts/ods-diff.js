// scripts/ods-diff.js — two-partition diff: verification (what to re-grade) vs upload (what ships).
// The two partitions are NEVER conflated: uploads always ship full sourceHashes deltas.
import { resolve, join } from 'node:path';
import { readText, writeJSON } from './_lib.js';

const arg = (k) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : null; };
const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
const validSidecar = (s) => isObj(s) && typeof s.styleSha === 'string' && isObj(s.renderHashes) && isObj(s.sourceHashes);

const localDir = arg('--local');
if (!localDir) { console.error('usage: ods-diff.js --local <outDir> [--remote <saved-sidecar.json>]'); process.exit(2); }
const out = resolve(localDir);

// local guards — the local sidecar must be sound before anything is compared
let local;
try { local = JSON.parse(readText(join(out, '_ods_sync.json'))); }
catch { console.error('✗ diff: _ods_sync.json unreadable — run ods-build.js first'); process.exit(1); }
if (!validSidecar(local)) { console.error('✗ diff: _ods_sync.json invalid — rebuild'); process.exit(1); }

// anchor classification — every non-ok reason degrades to no-anchor, never fatal
const remotePath = arg('--remote');
let remote = null, anchorReason;
if (!remotePath) anchorReason = 'not_provided';
else {
  try { remote = JSON.parse(readText(remotePath)); anchorReason = 'ok'; }
  catch { anchorReason = 'unreadable'; }
  if (anchorReason === 'ok' && !validSidecar(remote)) anchorReason = 'malformed';
  if (anchorReason === 'ok' && remote.shape !== local.shape) anchorReason = 'shape_changed';
  if (anchorReason !== 'ok') remote = null;
}

const allPages = Object.keys(local.renderHashes).sort();
const unchanged = [], changed = [], added = [], renderChurned = [], keyFallback = [];
let removed = [], keyedBy = 'renderHashes', styleChanged, files, deletePaths;

if (!remote) {
  // no anchor → full first-sync scope
  added.push(...allPages);
  styleChanged = true;
  files = Object.keys(local.sourceHashes).sort();
  deletePaths = [];
} else {
  // sourceKeys mode requires both sidecars keyed AND stamped by the same recipe number
  const recipeMatches = Number.isFinite(local.keyRecipe) && local.keyRecipe === remote.keyRecipe;
  const useSourceKeys = recipeMatches && isObj(local.sourceKeys) && isObj(remote.sourceKeys);
  keyedBy = useSourceKeys ? 'sourceKeys' : 'renderHashes';
  for (const p of allPages) {
    if (!(p in remote.renderHashes)) { added.push(p); continue; }
    // per-page: a null/absent sourceKey on either side (e.g. the generated placeholder)
    // falls back to renderHashes for THAT page only — never a permanent 'changed'
    const keyed = useSourceKeys && local.sourceKeys[p] != null && remote.sourceKeys[p] != null;
    if (useSourceKeys && !keyed) keyFallback.push(p);
    const isChanged = keyed
      ? local.sourceKeys[p] !== remote.sourceKeys[p]
      : local.renderHashes[p] !== remote.renderHashes[p];
    if (isChanged) changed.push(p);
    else {
      unchanged.push(p);
      if (keyed && local.renderHashes[p] !== remote.renderHashes[p]) renderChurned.push(p);
    }
  }
  removed = Object.keys(remote.renderHashes).filter((p) => !(p in local.renderHashes)).sort();
  styleChanged = local.styleSha !== remote.styleSha;   // upload-only signal — never re-verifies pages
  files = Object.keys(local.sourceHashes).filter((r) => local.sourceHashes[r] !== remote.sourceHashes[r]).sort();
  deletePaths = Object.keys(remote.sourceHashes).filter((r) => !(r in local.sourceHashes)).sort();
}

let any = files.length > 0 || deletePaths.length > 0 || styleChanged;
// recipe-upgrade refresh: local-newer recipe with nothing else to ship still re-anchors (never downgrade)
if (remote && keyedBy === 'renderHashes' && isObj(local.sourceKeys) && isObj(remote.sourceKeys) && !any &&
    Number.isFinite(local.keyRecipe) && Number.isFinite(remote.keyRecipe) && local.keyRecipe > remote.keyRecipe) any = true;

const diff = {
  anchorUsed: anchorReason === 'ok',
  anchorReason,
  keyedBy, keyFallback,
  unchanged, changed, added, removed, renderChurned,
  styleChanged,
  upload: { any, pages: allPages.filter((p) => files.includes(p)), files, deletePaths, styling: styleChanged },
};
writeJSON(join(out, '.sync-diff.json'), diff);
console.log(`[ods] diff (${anchorReason}): ${changed.length} changed, ${added.length} added, ${removed.length} removed; upload ${any ? `${files.length} files, ${deletePaths.length} deletes` : 'nothing'}`);
