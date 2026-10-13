// scripts/ods-pull.js
import { readText, writeText, writeManagedBlock } from './_lib.js';
const arg = (k) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : null; };
const odFile = arg('--od'); const srcFile = arg('--src'); const name = arg('--name') || 'ods';
const apply = process.argv.includes('--apply');
const odBody = readText(odFile) || '';
const src = readText(srcFile) || '';
const next = writeManagedBlock(src, name, odBody);
if (next === src) { console.log('[ods] pull: no change'); process.exit(0); }
if (!apply) {
  console.log(`[ods] pull REVIEW for ${srcFile} (block: ${name}) — re-run with --apply to write:`);
  console.log('----- OD content to embed -----');
  console.log(odBody.split('\n').slice(0, 40).join('\n'));
  process.exit(2);   // review gate
}
writeText(srcFile, next);
console.log(`[ods] pull: applied block ${name} -> ${srcFile}`);
