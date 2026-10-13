// scripts/ods-render.js
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { readText, writeText } from './_lib.js';

export const ODS_RUNTIME = `<script>(function(){try{var K='ods-theme',d=document.documentElement,
t=localStorage.getItem(K)||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
d.setAttribute('data-theme',t);document.addEventListener('click',function(e){
var b=e.target.closest&&e.target.closest('[data-theme-toggle]');
if(b){var n=d.getAttribute('data-theme')==='dark'?'light':'dark';d.setAttribute('data-theme',n);localStorage.setItem(K,n);}
var m=e.target.closest&&e.target.closest('[data-menu-toggle]');
if(m){var el=document.getElementById(m.getAttribute('data-menu-toggle'));if(el)el.toggleAttribute('data-open');}});}catch(_){}})();</script>`;

export function odSafe(html, { base, cssMap = {} }) {
  html = html.replace(/<link\b[^>]*rel="stylesheet"[^>]*>/gi, (tag) => {
    const h = (tag.match(/href="([^"]+)"/) || [])[1];
    return h && cssMap[h] != null ? `<style>${cssMap[h]}</style>` : tag;
  });
  html = html.replace(/<link\b[^>]*rel="(?:preload|modulepreload)"[^>]*>/gi, '');
  html = html.replace(/<script\b[^>]*?>[\s\S]*?<\/script>/gi, '').replace(/<script\b[^>]*?\/>/gi, '');
  const esc = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  html = html.replace(new RegExp(`href="(${esc}/[^"]+?)/"`, 'g'), 'href="$1/index.html"');
  html = html.replace(`href="${base}/"`, `href="${base}/index.html"`);
  return html.includes('</body>') ? html.replace('</body>', ODS_RUNTIME + '</body>') : html + ODS_RUNTIME;
}

// Ensure the FIRST line is this page's @odsCard marker (replace an existing marker, never duplicate).
export function ensureCardMarker(html, rel) {
  const marker = `<!-- @odsCard page="${rel}" -->`;
  const nl = html.indexOf('\n');
  const first = nl === -1 ? html : html.slice(0, nl);
  if (/^<!--\s*@odsCard\b[\s\S]*?-->\s*$/.test(first)) return marker + (nl === -1 ? '\n' : html.slice(nl));
  return marker + '\n' + html;
}

// CLI
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('ods-render.js')) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : null; };
  const dir = arg('--dir'); const base = arg('--base');
  if (dir && base) {
    const walk = (d, a = []) => { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? walk(p, a) : a.push(p); } return a; };
    const files = walk(dir);
    const cssMap = {};
    for (const f of files) if (f.endsWith('.css')) cssMap[base + '/' + f.slice(dir.length + 1).replace(/\\/g, '/')] = readText(f) || '';
    let n = 0;
    for (const f of files) if (f.endsWith('.html') && !f.includes('ds-bundle')) {
      const rel = f.slice(dir.length + 1).replace(/\\/g, '/');
      writeText(f, ensureCardMarker(odSafe(readText(f), { base, cssMap }), rel)); n++;
    }
    console.log(`[ods] render: OD-safe ${n} html files`);
  }
}
