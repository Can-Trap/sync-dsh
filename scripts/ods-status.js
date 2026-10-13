// scripts/ods-status.js
import { readJSON, readText } from './_lib.js';
import { join } from 'node:path';
const base = join(process.cwd(), '.design-sync');
const st = readJSON(join(base, 'STATE.json'));
if (!st) { console.log('[ods] fresh project — run ods-init.js'); process.exit(0); }
const cfg = readJSON(join(base, 'config.json'));
const mode = cfg?.mode || 'both';
const idx = readText(join(base, 'tasks', 'INDEX.md')) || '';
const next = idx.split('\n').find((l) => l.includes('[ ]')) || '(all done)';
console.log(`[ods] project=${st.project} mode=${mode}\n[ods] next: ${next.trim()}`);
