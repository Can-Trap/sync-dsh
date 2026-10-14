// scripts/ods-verify.js
import { readText, httpGet, arg } from './_lib.js';

// The four static gates, shared with ods-validate.js (baseDir reserved for callers that resolve links).
export function runChecks(html, { baseDir } = {}) {
  return {
    links: /<a\s[^>]*href=/i.test(html),
    odSafe: !/<script\b[^>]*\bsrc=/i.test(html),
    theme: /data-theme/.test(html) && /\[data-theme=["']?dark|\.dark\b|prefers-color-scheme:\s*dark/.test(html),
    effects: /transition|@keyframes|:hover|animation:/i.test(html),
  };
}

// CLI
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('ods-verify.js')) {
  const html = readText(arg('--entry-html')) || '';
  const previewUrl = arg('--preview-url');
  const rc = runChecks(html, {});
  const checks = [];
  const add = (ok, name, why = '') => checks.push({ ok, name, why });

  add(rc.links, 'links', 'entry has <a href> links');
  add(rc.odSafe, 'od-safe', 'no external <script src> (OD viewer safe)');
  add(rc.theme, 'theme', 'light+dark reachable via data-theme');
  add(rc.effects, 'effects', 'hover/transition/keyframes present');

  const run = async () => {
    if (previewUrl) { try { const r = await httpGet(previewUrl); add(r.status === 200, 'previewUrl', `GET ${previewUrl} -> ${r.status}`); } catch (e) { add(false, 'previewUrl', String(e)); } }
    let fail = 0;
    for (const c of checks) { console.log(`${c.ok ? '✓' : '✗'} ${c.name}${c.ok ? '' : ' — ' + c.why}`); if (!c.ok) fail++; }
    process.exit(fail ? 1 : 0);
  };
  run();
}
