// scripts/ods-extract-tokens.js
import { readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { readText, readJSON, writeJSON } from './_lib.js';
const arg = (k) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : null; };
const root = arg('--root') || process.cwd();
const out = arg('--out') || join(root, '.design-sync', 'tokens.json');

const walk = (d, acc = [], depth = 0) => {
  if (depth > 5) return acc;
  for (const n of readdirSync(d)) { if (n === 'node_modules' || n.startsWith('.')) continue; const p = join(d, n); (statSync(p).isDirectory() ? walk(p, acc, depth + 1) : acc.push(p)); }
  return acc;
};

// parse a `{ --k: v; }` body into {k:v}
const parseVars = (body) => { const o = {}; for (const m of body.matchAll(/--([\w-]+)\s*:\s*([^;}]+)/g)) o[m[1]] = m[2].trim(); return o; };

const extractFrom = (files) => {
  const cssText = files.filter((f) => ['.css', '.scss'].includes(extname(f))).map((f) => readText(f) || '').join('\n');
  const grabBlock = (re) => { const m = cssText.match(re); return m ? parseVars(m[1]) : {}; };
  let light = grabBlock(/:root\s*\{([^}]*)\}/); // css :root
  Object.assign(light, grabBlock(/@theme[^{]*\{([\s\S]*?)\}/)); // tailwind @theme
  const dark = { ...light, ...grabBlock(/\.dark\s*\{([^}]*)\}/), ...grabBlock(/\[data-theme=["']?dark["']?\]\s*\{([^}]*)\}/) };
  let source = 'css';
  const tf = files.find((f) => /(^|[\\/])tokens\.json$/.test(f));
  if (tf) { const j = readJSON(tf, {}); if (j.color) { light = { ...j.color, ...light }; source = 'token-file'; } }
  return { light, dark, source };
};

// --signals is real: scan the pinned tokenSources first; the full repo re-walk is the fallback
const sig = readJSON(arg('--signals') || '', null);
const pinned = sig && Array.isArray(sig.tokenSources) ? sig.tokenSources : [];
let r = pinned.length ? extractFrom(pinned) : null;
if (!r || Object.keys(r.light).length === 0) r = extractFrom(walk(root));

let { light, dark, source } = r;
if (Object.keys(light).length === 0) light = { bg: '#ffffff', fg: '#111111' }; // safe default
if (Object.keys(dark).length === 0) dark = { ...light };

writeJSON(out, { light: { color: light }, dark: { color: dark }, meta: { source } });
console.log(`[ods] extract -> ${out} (source: ${source}, light:${Object.keys(light).length} dark:${Object.keys(dark).length})`);
