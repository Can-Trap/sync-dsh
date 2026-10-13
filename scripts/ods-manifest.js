// scripts/ods-manifest.js
import { join } from 'node:path';
import { readJSON, writeJSON, readText, sha256 } from './_lib.js';
const arg = (k) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : null; };
const cmd = process.argv[2];
const mf = join(process.cwd(), '.design-sync', 'manifest.json');
const data = readJSON(mf, { pairs: [] });
const h = (p) => sha256(readText(p) || '');

if (cmd === 'add') {
  const [src, od] = (arg('--pair') || '').split('::');
  data.pairs = data.pairs.filter((p) => !(p.src === src && p.od === od));
  data.pairs.push({ src, od, srcHash: h(src), odHash: h(od) });
  writeJSON(mf, data);
  console.log(`[ods] manifest add ${src} :: ${od}`);
} else if (cmd === 'drift') {
  const changed = [];
  for (const p of data.pairs) {
    const s = h(p.src), o = h(p.od);
    if (s !== p.srcHash || o !== p.odHash) changed.push({ ...p, srcChanged: s !== p.srcHash, odChanged: o !== p.odHash });
  }
  if (changed.length === 0) { console.log('[ods] drift: clean'); process.exit(0); }
  for (const c of changed) console.log(`[ods] drift: ${c.src} (src:${c.srcChanged} od:${c.odChanged})`);
  process.exit(1);
} else { console.log('usage: ods-manifest.js add --pair a::b | drift'); }
