// scripts/_hashes.js
// All sync hashing lives in this one module — never reimplement any of it elsewhere.
// If the bytes fed into any hash here ever change, KEY_RECIPE must move in the same
// commit so keys stamped by the old recipe can no longer vouch for anything.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const KEY_RECIPE = 1;

const hex = (s) => createHash('sha256').update(s).digest('hex');

// Deterministic JSON: object keys recursively sorted; undefined collapses to null.
export function canonical(v) {
  if (v == null) return 'null';
  if (Array.isArray(v)) {
    return `[${v.map(canonical).join(',')}]`;
  }
  if (typeof v !== 'object') return JSON.stringify(v);
  const pairs = [];
  for (const key of Object.keys(v).sort()) {
    pairs.push(`${JSON.stringify(key)}:${canonical(v[key])}`);
  }
  return `{${pairs.join(',')}}`;
}

// Feed label + file bytes into an open hash; a file we cannot read contributes a
// deterministic placeholder instead of aborting.
export function hashFile(h, path, label) {
  let bytes;
  try { bytes = readFileSync(path); }
  catch { bytes = Buffer.from('unreadable:' + path); }
  h.update(label);
  h.update(bytes);
}

// Feed a directory tree into an open hash: byte-order sorted names, dotfiles and
// `skip` names excluded, subdirs recursed with prefix+name+'/'. An optional
// filter(name) narrows which files count (e.g. *.css only).
export function hashDir(h, dir, prefix, skip = [], filter = null) {
  let listing;
  try { listing = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  const wanted = listing
    .filter((e) => !e.name.startsWith('.') && !skip.includes(e.name))
    .sort((a, b) => (a.name > b.name) - (a.name < b.name));
  for (const entry of wanted) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) { hashDir(h, full, prefix + entry.name + '/', skip, filter); continue; }
    if (filter && !filter(entry.name)) continue;
    hashFile(h, full, prefix + entry.name);
  }
}

// 64-hex sha256 over every *.css under outDir (prefix 'css/') + the tokens copy (label 'tokens').
export function styleShaFor(outDir) {
  const h = createHash('sha256');
  hashDir(h, outDir, 'css/', [], (name) => name.endsWith('.css'));
  hashFile(h, join(outDir, 'tokens.json'), 'tokens');
  return h.digest('hex');
}

// sha256 of the page HTML AFTER its first line (the @odsCard marker line is excluded —
// a re-tag is not a contract change), 16 hex; missing file hashes '∅'.
export function renderHashFor(outDir, pageRel) {
  let text;
  try { text = readFileSync(join(outDir, pageRel), 'utf8'); } catch { return hex('∅').slice(0, 16); }
  const i = text.indexOf('\n');
  return hex(i === -1 ? '' : text.slice(i + 1)).slice(0, 16);
}

// 16-hex key over the source slice that feeds a page: recipe + global config slice +
// per-page override slice + sorted source file bytes. null when srcFiles is null/empty
// (consumers fall back to renderHashes). srcFiles are repo-relative forward-slash
// paths resolved against `root`; the RELATIVE path is the hash label, so the same
// checkout produces the same key on any machine or directory.
export function sourceKeyFor({ srcFiles, cfg, pageRel, root = '' }) {
  if (!srcFiles || srcFiles.length === 0) return null;
  const h = createHash('sha256');
  h.update(`recipe:${KEY_RECIPE}`);
  h.update('global' + canonical({ exclude: cfg?.exclude, entry: cfg?.entry, srcDir: cfg?.srcDir }));
  h.update('page' + canonical(cfg?.overrides?.[pageRel] ?? null));
  for (const f of [...srcFiles].sort()) {
    const label = f.replace(/\\/g, '/');
    hashFile(h, root ? join(root, f) : f, label);
  }
  return h.digest('hex').slice(0, 16);
}

// {fwd-slash rel: sha256(bytes)[:12]} for every non-dot file under outDir, recursively.
export function sourceHashesFor(outDir) {
  const out = {};
  const walk = (dir, rel) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const p = join(dir, e.name);
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) walk(p, r);
      else { try { out[r] = createHash('sha256').update(readFileSync(p)).digest('hex').slice(0, 12); } catch { /* vanished mid-walk */ } }
    }
  };
  walk(outDir, '');
  return out;
}

export const gradeKeyFrom = (k) => hex(k).slice(0, 16);
