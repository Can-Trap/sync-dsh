// scripts/ods-validate.js — the validate gate over an od-bundle: static checks, no browser.
// Fatal tags abort with no .render-check.json; per-page bad pages run to completion and are counted.
import { existsSync, statSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadConfig, readText, readJSON, writeJSON, pageSlug } from './_lib.js';
import { renderHashFor, canonical } from './_hashes.js';
import { ODS_RUNTIME } from './ods-render.js';
import { runChecks } from './ods-verify.js';

// Shape check for _ods_sync.json — the minimum every consumer relies on.
const plainObject = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
export function validSidecar(s) {
  if (!plainObject(s)) return false;
  const checks = [
    typeof s.styleSha === 'string',
    plainObject(s.renderHashes),
    plainObject(s.sourceHashes),
  ];
  return checks.every(Boolean);
}

const DARK_RE = /\[data-theme=["']?dark|\.dark\b|prefers-color-scheme:\s*dark/;
const SKIP_HREF = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;

// Resolve an href against a page's bundle-rel path → normalized rel parts, or null (escapes the bundle).
function resolveHref(pageRel, href) {
  const dir = pageRel.includes('/') ? pageRel.slice(0, pageRel.lastIndexOf('/')) : '';
  const raw = href.startsWith('/') ? href.slice(1) : (dir ? dir + '/' : '') + href;
  const stack = [];
  for (const p of raw.split('/')) {
    if (!p || p === '.') continue;
    if (p === '..') { if (!stack.length) return null; stack.pop(); }
    else stack.push(p);
  }
  return stack;
}

// Internal <a href> targets that resolve to no bundle file after dir→index.html normalization.
function brokenLinks(out, pageRel, html) {
  const bad = [];
  for (const m of html.matchAll(/<a\s[^>]*?href\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    const full = m[1] ?? m[2] ?? '';
    if (!full || SKIP_HREF.test(full)) continue;
    const href = full.split('#')[0].split('?')[0];
    if (!href) continue;
    const stack = resolveHref(pageRel, href);
    if (!stack) { bad.push(full); continue; }
    const target = join(out, ...stack);
    const isDir = existsSync(target) && statSync(target).isDirectory();
    if (existsSync(target) && !isDir && !href.endsWith('/')) continue;
    if (existsSync(join(target, 'index.html'))) continue; // dir → index.html normalization
    bad.push(full);
  }
  return bad;
}

// CSS closure of a page: inline <style> blocks + linked stylesheets resolved inside the bundle.
function cssClosure(out, pageRel, html) {
  let css = '';
  for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) css += m[1] + '\n';
  for (const m of html.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi)) {
    const h = (m[0].match(/href=["']([^"']+)["']/) || [])[1];
    if (!h || SKIP_HREF.test(h)) continue;
    const stack = resolveHref(pageRel, h.split('#')[0].split('?')[0]);
    if (stack) css += (readText(join(out, ...stack)) || '') + '\n';
  }
  return css;
}

// Visible body text: body inner minus scripts/styles/comments/tags, whitespace collapsed.
function visibleText(html) {
  const m = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  const open = html.match(/<body\b[^>]*>/i);
  const inner = m ? m[1] : open ? html.slice(open.index + open[0].length) : html;
  return inner
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// CLI (guarded so importing validSidecar never runs the gate)
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('ods-validate.js')) {
  const args = process.argv.slice(2);
  let outArg = null, configArg = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--config') configArg = args[++i];
    else if (!args[i].startsWith('--') && !outArg) outArg = args[i];
  }
  if (!outArg) { console.error('usage: ods-validate.js <outDir> [--config <path>]'); process.exit(2); }
  const out = resolve(outArg);
  const fatal = (msg) => { console.error(msg); process.exit(1); };

  // presence contract: read the prior iterations, then delete — the file only exists after a completed run
  const prior = readJSON(join(out, '.render-check.json'), null);
  rmSync(join(out, '.render-check.json'), { force: true });

  // (1) build meta parses
  if (!readJSON(join(out, '.ods-build-meta.json'), null)) fatal(`✗ .ods-build-meta.json missing or unparseable in ${out} — run ods-build.js`);

  // (2) sidecar present + valid
  const side = readJSON(join(out, '_ods_sync.json'), null);
  if (!validSidecar(side)) fatal('✗ _ods_sync.json missing or invalid — rebuild (ods-build.js)');

  // (3) [SYNC_STALE] recompute — ALWAYS
  const stale = Object.keys(side.renderHashes).filter((rel) => renderHashFor(out, rel) !== side.renderHashes[rel]);
  if (stale.length) fatal(`✗ [SYNC_STALE] pages on disk have drifted from the _ods_sync.json renderHashes (${stale.join(', ')}) — run ods-build.js to rebuild; uploading in this state is forbidden`);

  // config: explicit --config must load; the default path is optional (no config → no overrides)
  let cfg = null;
  if (configArg) { try { cfg = loadConfig(configArg); } catch (e) { fatal(e.message); } }
  else { cfg = readJSON(join(process.cwd(), '.design-sync', 'config.json'), null); }

  const tokens = readJSON(join(out, 'tokens.json'), null) ?? readJSON(join(process.cwd(), '.design-sync', 'tokens.json'), null);
  const tokensIdentical = tokens ? canonical(tokens.light ?? null) === canonical(tokens.dark ?? null) : false;

  // (4) per-page checks
  const pages = [];
  const walk = (d, rel) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) walk(join(d, e.name), r);
      else if (e.name.endsWith('.html') && !r.includes('ds-bundle')) pages.push(r);
    }
  };
  walk(out, '');
  pages.sort();

  const entryRel = cfg?.entry || 'index.html';
  const entries = [];
  for (const rel of pages) {
    const html = readText(join(out, rel)) || '';
    const nl = html.indexOf('\n');
    const card = (nl === -1 ? html : html.slice(0, nl)).trim() === `<!-- @odsCard page="${rel}" -->`;
    const rc = runChecks(html, { baseDir: out });
    const runtime = html.includes(ODS_RUNTIME);
    const broken = brokenLinks(out, rel, html);
    const vis = visibleText(html);
    const ov = cfg?.overrides?.[rel] || {};

    const empty = vis.length === 0;
    const thin = vis.length < 40 && !(ov.thinOk || ov.skip);
    const variantsIdentical = runtime && tokensIdentical && !DARK_RE.test(cssClosure(out, rel, html)) && !ov.variantsOk;

    let firstErr = null;
    const err = (tag, why) => { if (!firstErr) firstErr = tag; console.error(`✗ ${tag} ${rel} — ${why}`); };
    if (!card) err('[ODSCARD_MISSING]', `first line must be <!-- @odsCard page="${rel}" -->`);
    if (!rc.odSafe) err('[OD_UNSAFE]', 'external <script src> present — re-render');
    if (!runtime && rel === entryRel) err('[RUNTIME_MISSING]', 'entry lacks ODS_RUNTIME');
    if (broken.length) err('[LINK_BROKEN]', `no bundle file for: ${broken.join(', ')}`);
    if (empty) err('[EMPTY_BODY]', 'no visible body text');
    if (thin) console.error(`⚠ [RENDER_THIN] ${rel} — visible text ${vis.length} chars (<40)`);
    if (variantsIdentical) console.error(`⚠ [VARIANTS_IDENTICAL] ${rel} — dark indistinguishable from light`);

    entries.push({
      name: pageSlug(rel), rel, bad: firstErr != null, thin, variantsIdentical,
      checks: { card, odSafe: rc.odSafe, links: broken.length === 0, theme: rc.theme, effects: rc.effects, runtime },
      firstErr,
    });
  }

  // (5) entry-level gate: the four shared checks on the entry html
  let entryFail = null;
  const entryHtml = readText(join(out, entryRel));
  if (entryHtml == null) { console.error(`✗ entry missing: ${entryRel}`); entryFail = 'entry'; }
  else for (const [k, v] of Object.entries(runChecks(entryHtml, { baseDir: out }))) {
    if (!v) { console.error(`✗ entry check failed: ${k}`); entryFail = entryFail || k; }
  }

  // (6) conventions validation: every `--token` the header mentions must exist in tokens light or dark
  if (cfg?.readmeHeader) {
    const txt = readText(resolve(cfg.readmeHeader));
    if (txt != null && tokens) {
      const names = new Set([...Object.keys(tokens.light?.color || {}), ...Object.keys(tokens.dark?.color || {})]);
      const seen = new Set();
      for (const m of txt.matchAll(/--([A-Za-z][\w-]*)/g)) {
        if (seen.has(m[1])) continue; seen.add(m[1]);
        if (!names.has(m[1])) console.error(`⚠ [CONVENTIONS_STALE] ${m[1]}`);
      }
    }
  }

  const nBad = entries.filter((e) => e.bad).length;
  const report = {
    total: entries.length, bad: nBad,
    thin: entries.filter((e) => e.thin).length,
    variantsIdentical: entries.filter((e) => e.variantsIdentical).length,
    iterations: Number.isInteger(prior?.iterations) ? prior.iterations + 1 : 1,
    entries,
  };
  writeJSON(join(out, '.render-check.json'), report);
  console.log(`[ods] validate: ${report.total} pages, bad:${report.bad} thin:${report.thin} variantsIdentical:${report.variantsIdentical} (iteration ${report.iterations})`);
  process.exit(nBad || entryFail ? 1 : 0);
}
