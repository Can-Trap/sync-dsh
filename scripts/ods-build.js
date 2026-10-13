// scripts/ods-build.js — converter entry: source → od-bundle (copy, OD-safe render, markers, sidecar).
import { existsSync, readdirSync, statSync, rmSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, resolve, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { loadConfig, readText, writeText, readJSON, writeJSON } from './_lib.js';
import { KEY_RECIPE, canonical, renderHashFor, sourceKeyFor, sourceHashesFor, styleShaFor } from './_hashes.js';
import { odSafe, ensureCardMarker } from './ods-render.js';
import { copyTree, PLACEHOLDER } from './ods-push.js';

const GENERATOR = 'sync-dsh@0.1.4';
const arg = (k) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : null; };
const fail = (msg) => { console.error(msg); process.exit(1); };

// 1. config
const configPath = arg('--config');
if (!configPath) fail('[CONFIG] usage: ods-build.js --config <path> [--root <repo>] [--out <dir>] [--base <rawBase>] [--refresh]');
let cfg;
try { cfg = loadConfig(configPath); } catch (e) { fail('[CONFIG] ' + e.message); }

const root = resolve(arg('--root') || process.cwd());
const out = resolve(arg('--out') || './od-bundle');
const refresh = process.argv.includes('--refresh');

// 2. out-dir safety: never rm a dir we did not build
const home = process.env.HOME || process.env.USERPROFILE || '';
const nonEmpty = existsSync(out) && readdirSync(out).length > 0;
if (out === resolve('/') || (home && out === resolve(home)) || out === process.cwd() ||
    (nonEmpty && !existsSync(join(out, '.ods-build-meta.json')))) fail(`[OUT_UNSAFE] refusing to rm ${out}`);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// 3. ensure detect/extract outputs
const dsDir = join(root, '.design-sync');
const signalsPath = join(dsDir, 'signals.json');
const tokensPath = join(dsDir, 'tokens.json');
const srcAbs = resolve(root, cfg.srcDir || '.');
if (!existsSync(srcAbs)) fail(`[ZERO_MATCH] no html/source found — srcDir missing: ${srcAbs}`);
const SD = dirname(fileURLToPath(import.meta.url));
const run = (script, args) => execFileSync(process.execPath, [join(SD, script), ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
if (refresh || !existsSync(signalsPath)) run('ods-detect.js', ['--root', root, '--out', signalsPath]);
if (refresh || !existsSync(tokensPath)) run('ods-extract-tokens.js', ['--root', root, '--signals', signalsPath, '--out', tokensPath]);

// 4. copy source → out (built-in excludes + cfg.exclude; never recurse into our own outputs)
copyTree(srcAbs, out, [...(cfg.exclude || []), basename(out), 'od-bundle', '.ds-sync']);
const walkAll = (d, a = []) => { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? walkAll(p, a) : a.push(p); } return a; };
if (walkAll(out).length === 0) fail(`[ZERO_MATCH] no html/source found under ${srcAbs}`);
if (!existsSync(join(out, 'index.html'))) writeText(join(out, 'index.html'), PLACEHOLDER);
// tokens ship with the bundle: styleShaFor's 'tokens' component and sourceHashes both
// cover the copy, so a tokens-only change flips styleSha → upload.styling
if (existsSync(tokensPath)) copyFileSync(tokensPath, join(out, 'tokens.json'));

// 5. OD-safe render + first-line @odsCard markers
const base = arg('--base') || readJSON(join(dsDir, '.cache', 'od-project.json'), {})?.rawBase || null;
const files = walkAll(out);
const relOf = (f) => f.slice(out.length + 1).replace(/\\/g, '/');
const cssMap = {};
if (base) for (const f of files) if (f.endsWith('.css')) cssMap[base + '/' + relOf(f)] = readText(f) || '';
const pages = [];
for (const f of files) {
  if (!f.endsWith('.html') || f.includes('ds-bundle')) continue;
  const rel = relOf(f);
  // no base → sentinel base that never matches an href: base-dependent link rewrites are skipped
  writeText(f, ensureCardMarker(odSafe(readText(f) || '', { base: base || ' ods-no-base', cssMap }), rel));
  pages.push(rel);
}
pages.sort();

// 6. sentinel (exact bytes) + meta, then the sidecar ABSOLUTELY LAST
writeText(join(out, '_ods_needs_recompile'), '{"by":"sync-dsh"}');
const signals = readJSON(signalsPath, {}) || {};
const shape = cfg.shape || signals.shape || (existsSync(join(root, 'index.html')) ? 'static' : 'app');
writeJSON(join(out, '.ods-build-meta.json'), { project: cfg.projectName, shape, pageCount: pages.length, generator: GENERATOR });

const renderHashes = {}, sourceKeys = {};
for (const rel of pages) {
  renderHashes[rel] = renderHashFor(out, rel);
  // repo-relative srcFiles + root: the hash label is the rel path, machine-independent
  sourceKeys[rel] = existsSync(join(srcAbs, rel)) ? sourceKeyFor({ srcFiles: [rel], cfg, pageRel: rel, root: srcAbs }) : null;
}
const tokensSha = createHash('sha256').update(canonical(readJSON(tokensPath, null))).digest('hex').slice(0, 16);
writeJSON(join(out, '_ods_sync.json'), {
  shape, styleSha: styleShaFor(out), renderHashes, sourceKeys,
  keyRecipe: KEY_RECIPE, sourceHashes: sourceHashesFor(out), tokensSha, generator: GENERATOR,
});

// 7. a bare build invalidates any prior diff — the driver regenerates it
rmSync(join(out, '.sync-diff.json'), { force: true });
console.log(`[ods] build: ${pages.length} pages -> ${out}`);
