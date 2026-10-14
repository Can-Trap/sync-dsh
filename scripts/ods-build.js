// scripts/ods-build.js — converter entry: source → od-bundle (copy, OD-safe render, markers, sidecar).
import { existsSync, readdirSync, statSync, rmSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, resolve, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { loadConfig, readText, writeText, readJSON, writeJSON, arg, hasFlag } from './_lib.js';
import { KEY_RECIPE, canonical, renderHashFor, sourceKeyFor, sourceHashesFor, styleShaFor } from './_hashes.js';
import { odSafe, ensureCardMarker } from './ods-render.js';
import { copyTree, PLACEHOLDER } from './ods-push.js';

const GENERATOR = 'sync-dsh@0.1.4';
// Warn above this many copied files: a legitimate site bundle is in the hundreds, so
// a four-figure copy set means srcDir/exclude are describing something else.
const BIG_COPY = 1500;
const fail = (msg) => { console.error(msg); process.exit(1); };

// 1. config — `--config` defaults to the very file ods-init.js writes, so a
// bootstrapped project builds with `ods-build.js --root <repo>`. It used to be
// mandatory, which failed the build on a path the init phase never created and
// never named; an explicit `--config` still wins, so the driver (ods-resync.js)
// and every documented invocation behave exactly as before.
const USAGE = 'usage: ods-build.js [--config <path>] [--root <repo>] [--out <dir>] [--base <rawBase>] [--refresh]';
const root = resolve(arg('--root') || process.cwd());
const explicitCfg = arg('--config');
const configPath = explicitCfg || join(root, '.design-sync', 'config.json');
let cfg;
try { cfg = loadConfig(configPath); } catch (e) {
  const hint = existsSync(configPath) ? '' :
    `\n[CONFIG] nothing at ${configPath}${explicitCfg ? ' (from --config)' : ' (the default for this root)'}` +
    '\n[CONFIG] ods-init.js writes .design-sync/config.json — run it first, or pass --config <path>.';
  fail('[CONFIG] ' + e.message + hint + '\n' + USAGE);
}

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

// The copy set IS the upload: Open Design receives every non-dot file the build
// writes. `srcDir` absent therefore means "ship the repo root", which is almost
// never what anyone means — a repo root drags in virtualenvs, source backups and
// data dumps, five figures of files that are not the site. Warn while the fix is
// still one config key, and again if the copy is large, because by then only
// `exclude` can save it.
if (!cfg.srcDir) {
  console.warn(`[SRCDIR_UNSET] cfg.srcDir is not set — copying the whole of ${srcAbs}.`);
  console.warn('              Set srcDir in .design-sync/config.json to the directory that holds the site,');
  console.warn('              and list what must not ship in exclude (exact basenames, no globs).');
}
const SD = dirname(fileURLToPath(import.meta.url));
const run = (script, args) => execFileSync(process.execPath, [join(SD, script), ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
if (refresh || !existsSync(signalsPath)) run('ods-detect.js', ['--root', root, '--out', signalsPath]);
if (refresh || !existsSync(tokensPath)) run('ods-extract-tokens.js', ['--root', root, '--signals', signalsPath, '--out', tokensPath]);

// 4. copy source → out (built-in excludes + cfg.exclude; never recurse into our own outputs)
copyTree(srcAbs, out, [...(cfg.exclude || []), basename(out), 'od-bundle', '.ds-sync']);
const walkAll = (d, a = []) => { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? walkAll(p, a) : a.push(p); } return a; };
const copied = walkAll(out);
if (copied.length === 0) fail(`[ZERO_MATCH] no html/source found under ${srcAbs}`);
const copiedBytes = copied.reduce((s, f) => s + statSync(f).size, 0);
if (copied.length > BIG_COPY) {
  console.warn(`[BIG_COPY] ${copied.length} files (${(copiedBytes / 1048576).toFixed(1)} MB) copied from ${srcAbs}.`);
  console.warn('           Every non-dot one of them is uploaded. Check cfg.srcDir and cfg.exclude');
  console.warn('           before syncing — a repo root usually drags in virtualenvs and data dumps.');
}
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
console.log(`[ods] build: ${pages.length} pages, ${copied.length} files (${(copiedBytes / 1048576).toFixed(1)} MB) -> ${out}`);
