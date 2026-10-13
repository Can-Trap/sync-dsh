// scripts/ods-push.js
import { readdirSync, statSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { exists, writeText } from './_lib.js';

const BUILTIN_EXCLUDE = ['node_modules', '.next', '.git', '.design-sync', 'dist', 'out', '.next-export'];
export const PLACEHOLDER = '<!doctype html><meta charset="utf-8"><title>project</title><body>Project files present. Render pending.</body>';

export function copyTree(src, dst, extraExcludes = []) {
  const ex = new Set([...BUILTIN_EXCLUDE, ...extraExcludes]);
  const copy = (from, to) => {
    mkdirSync(to, { recursive: true });
    for (const n of readdirSync(from)) {
      if (ex.has(n)) continue;
      const f = join(from, n), t = join(to, n);
      statSync(f).isDirectory() ? copy(f, t) : copyFileSync(f, t);
    }
  };
  copy(src, dst);
}

// CLI
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('ods-push.js')) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : null; };
  const src = arg('--src'); const dst = arg('--project-dir');
  if (!src || !dst) { console.error('usage: ods-push.js --src <dir> --project-dir <dir> [--exclude a,b]'); process.exit(2); }
  copyTree(src, dst, (arg('--exclude') || '').split(',').filter(Boolean));
  if (!exists(join(dst, 'index.html'))) writeText(join(dst, 'index.html'), PLACEHOLDER);
  console.log(`[ods] push: ${src} -> ${dst}`);
}
