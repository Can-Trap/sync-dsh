// scripts/_lib.js
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import http from 'node:http';
import https from 'node:https';

export const sha256 = (s) => createHash('sha256').update(s ?? '').digest('hex');
export const exists = (p) => existsSync(p);
export const readText = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null);
export function writeText(p, s) { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, s); }
export const readJSON = (p, fb = null) => { const t = readText(p); if (t == null) return fb; try { return JSON.parse(t); } catch { return fb; } };
export const writeJSON = (p, o) => writeText(p, JSON.stringify(o, null, 2) + '\n');

export function odDataRoot() {
  if (process.env.OD_DATA_ROOT && existsSync(process.env.OD_DATA_ROOT)) return process.env.OD_DATA_ROOT;
  const app = process.env.APPDATA || join(process.env.HOME || '', '.config');
  const ns = join(app, 'Open Design', 'namespaces');
  if (!existsSync(ns)) return null;
  for (const d of readdirSync(ns)) { const data = join(ns, d, 'data'); if (existsSync(data)) return data; }
  return null;
}
export const odProjectDir = (id) => join(odDataRoot() || '', 'projects', id);
export const odDesignSystemDir = (id) => join(odDataRoot() || '', 'design-systems', id);

export function httpGet(url) {
  const lib = url.startsWith('https') ? https : http;
  return new Promise((resolve, reject) => {
    lib.get(url, (res) => { let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => resolve({ status: res.statusCode, body: b, headers: res.headers })); }).on('error', reject);
  });
}

const CONFIG_KEYS = ['projectName', 'projectId', 'mode', 'shape', 'srcDir', 'exclude', 'entry', 'dsId', 'dsName', 'readmeHeader', 'overrides', 'tokenSources'];
const OVERRIDE_KEYS = ['skip', 'thinOk', 'variantsOk'];

export function validateConfig(cfg) {
  if (cfg == null || typeof cfg !== 'object' || Array.isArray(cfg)) return ['not an object'];
  const errs = [];
  for (const k of Object.keys(cfg)) if (!CONFIG_KEYS.includes(k)) errs.push(`unknown key "${k}"`);
  if (typeof cfg.projectName !== 'string' || cfg.projectName === '') errs.push('projectName required (non-empty string)');
  if (cfg.shape !== undefined && cfg.shape !== 'static' && cfg.shape !== 'app') errs.push('shape must be "static" or "app"');
  if (cfg.mode !== undefined && cfg.mode !== 'A' && cfg.mode !== 'B' && cfg.mode !== 'both') errs.push('mode must be "A", "B", or "both"');
  if (cfg.overrides != null) {
    if (typeof cfg.overrides !== 'object' || Array.isArray(cfg.overrides)) errs.push('overrides must be an object');
    else for (const [page, ov] of Object.entries(cfg.overrides)) {
      if (ov == null || typeof ov !== 'object' || Array.isArray(ov)) { errs.push(`override "${page}" must be an object`); continue; }
      for (const k of Object.keys(ov)) {
        if (!OVERRIDE_KEYS.includes(k)) errs.push(`unknown override key "${k}" on "${page}"`);
        else if (typeof ov[k] !== 'boolean') errs.push(`override "${page}".${k} must be boolean`);
      }
    }
  }
  return errs;
}

export function loadConfig(path) {
  const t = readText(path);
  if (t == null) throw new Error(`✗ config: not found ${path}`);
  let cfg;
  try { cfg = JSON.parse(t); } catch (e) { throw new Error(`✗ config: invalid JSON — ${e.message}`); }
  const errs = validateConfig(cfg);
  if (errs.length) throw new Error('✗ config: ' + errs[0]);
  return cfg;
}

export const pageSlug = (rel) => rel.replace(/\.html$/, '').replace(/[\\/]/g, '__');

export function writeManagedBlock(content, name, body) {
  const start = `<!-- design-sync:start:${name} -->`;
  const end = `<!-- design-sync:end:${name} -->`;
  const block = `${start}\n${body}\n${end}`;
  const re = new RegExp(`${start}[\\s\\S]*?${end}`);
  if (re.test(content)) return content.replace(re, block);
  return (content.endsWith('\n') || content === '' ? content : content + '\n') + block + '\n';
}
