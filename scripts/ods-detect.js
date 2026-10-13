// scripts/ods-detect.js
import { readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { exists, readText, readJSON, writeJSON } from './_lib.js';
const arg = (k) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : null; };
const root = arg('--root') || process.cwd();
const out = arg('--out') || join(root, '.design-sync', 'signals.json');

const walk = (d, acc = [], depth = 0) => {
  if (depth > 5) return acc;
  for (const n of readdirSync(d)) {
    if (n === 'node_modules' || n.startsWith('.') || n === 'dist' || n === 'out') continue;
    const p = join(d, n); const st = statSync(p);
    if (st.isDirectory()) walk(p, acc, depth + 1); else acc.push(p);
  }
  return acc;
};
const files = walk(root);
const css = files.filter((f) => ['.css', '.scss'].includes(extname(f))).map((f) => readText(f) || '').join('\n');
const pkg = readJSON(join(root, 'package.json'), {}); const deps = { ...pkg.dependencies, ...pkg.devDependencies };

const stack = [];
if (deps.tailwindcss || /@theme|@tailwind/.test(css)) stack.push('tailwind');
if (deps.next) stack.push('next');
if (/:root\s*\{[^}]*--/.test(css)) stack.push('css-vars');

const theme = { system: 'none', hasLight: /:root|@theme|prefers-color-scheme:\s*light|\[data-theme=.?light/.test(css), hasDark: /\.dark|prefers-color-scheme:\s*dark|\[data-theme=.?dark/.test(css) };
if (deps['next-themes']) theme.system = 'next-themes';
else if (/\.dark\b/.test(css)) theme.system = 'class-dark';
else if (/prefers-color-scheme/.test(css)) theme.system = 'media';

const tokenSources = files.filter((f) => /tokens?\.(json|ts|js)$|theme\.(ts|js)$/.test(f) || /globals?\.css$/.test(f));
const componentDirs = [...new Set(files.filter((f) => /components?\//.test(f) && /\.(tsx|jsx|vue|svelte)$/.test(f)).map((f) => f.replace(root, '').split(/[\\/]/).slice(0, 3).join('/')))];
const appEntry = files.find((f) => /app\/page\.(tsx|jsx)$|pages\/index\.(tsx|jsx)$|src\/App\.(tsx|jsx)$/.test(f)) || null;
const nav = files.filter((f) => /nav|menu|sidebar|header/i.test(f) && /\.(tsx|jsx)$/.test(f)).map((f) => f.replace(root, ''));
const effects = /transition|@keyframes|animation:|backdrop-filter|:hover/.test(css);

const shape = exists(join(root, 'index.html')) ? 'static' : 'app';

writeJSON(out, { stack, tokenSources, componentDirs, appEntry, theme, nav, effects, shape });

// record shape in the config when it exists, parses, and has none — never overwrite a pinned value
const cfgPath = join(root, '.design-sync', 'config.json');
const cfg = readJSON(cfgPath, null);
if (cfg && typeof cfg === 'object' && !Array.isArray(cfg) && cfg.shape === undefined) { cfg.shape = shape; writeJSON(cfgPath, cfg); }

console.log(`[ods] detect -> ${out} (stack: ${stack.join(',') || 'unknown'}, shape: ${shape})`);
