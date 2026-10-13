// scripts/ods-init.js
import { writeJSON, writeText, readText, readJSON, exists, loadConfig } from './_lib.js';
import { join } from 'node:path';
const arg = (k) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : null; };
const root = process.cwd();
const project = arg('--project') || 'project';
const base = join(root, '.design-sync');

// --mode A|B|both (aliases: project=A; design-system/ds/design=B). Settles once; never silently re-derived.
const MODE_ALIAS = { a: 'A', b: 'B', both: 'both', project: 'A', 'design-system': 'B', ds: 'B', design: 'B' };
const modeArg = MODE_ALIAS[(arg('--mode') || '').toLowerCase()] || null;

// Config settlement — an existing config is PRESERVED (never drop projectId).
const cfgPath = join(base, 'config.json');
let cfg;
if (!exists(cfgPath)) {
  cfg = { projectName: project, mode: modeArg || 'both' };
  writeJSON(cfgPath, cfg);
  console.log(`[ods] config: first-time (wrote config.json, mode=${cfg.mode})`);
} else {
  try { cfg = loadConfig(cfgPath); } catch (e) { console.error(e.message); process.exit(1); }
  const nextMode = modeArg || cfg.mode || 'both';
  if (cfg.mode !== nextMode) { cfg.mode = nextMode; writeJSON(cfgPath, cfg); }
  console.log(cfg.projectId ? `[ods] config: re-sync (projectId ${cfg.projectId}, mode=${cfg.mode})` : `[ods] config: first-time (mode=${cfg.mode})`);
}
const mode = cfg.mode;

// STATE.json = {project, createdAt} — keep an existing createdAt, rewrite project only.
const statePath = join(base, 'STATE.json');
const prev = readJSON(statePath);
writeJSON(statePath, { project, createdAt: prev?.createdAt ?? Date.now() });

if (!exists(join(base, 'MAP.md'))) writeText(join(base, 'MAP.md'), `# ${project} — map\n`);
if (!exists(join(base, 'JOURNAL.md'))) writeText(join(base, 'JOURNAL.md'), `# Journal\n`);
if (!exists(join(base, 'NOTES.md')))
  writeText(join(base, 'NOTES.md'), '# Notes\n\n## Known render warns\n\n## Re-sync risks\n');
if (!exists(join(base, 'tasks', 'INDEX.md'))) {
  // Mode-aware seed: only the active mode's phases start [ ]; the rest are pre-checked
  // [x] (skipped) so the "first [ ] box" loop AND the "every box [x]" DONE gate stay correct.
  // 06-pull is drift-triggered (dispatched from 09), never a first-run loop box.
  const active = new Set({
    A: ['01-detect', '02-extract', '04-project', '05-build', '07-validate', '08-grade', '09-upload-sync'],
    B: ['01-detect', '02-extract', '03-design-system'],
    both: ['01-detect', '02-extract', '03-design-system', '04-project', '05-build', '07-validate', '08-grade', '09-upload-sync'],
  }[mode]);
  const line = (name) => active.has(name) ? `- [ ] ${name}` : `- [x] ${name} (skipped: mode ${mode})`;
  const rows = ['# Tasks', '- [x] 00-bootstrap'];
  for (const p of ['01-detect', '02-extract', '03-design-system', '04-project', '05-build']) rows.push(line(p));
  rows.push('- [x] 06-pull (drift-triggered)');
  for (const p of ['07-validate', '08-grade', '09-upload-sync']) rows.push(line(p));
  writeText(join(base, 'tasks', 'INDEX.md'), rows.join('\n') + '\n');
}

// Gitignore split — drop the old blanket line, append the split list idempotently.
const IGNORES = [
  '.design-sync/.cache/', '.design-sync/learnings/', '.design-sync/reports/', '.design-sync/tasks/',
  '.design-sync/JOURNAL.md', '.design-sync/STATE.json', '.design-sync/MAP.md', '.design-sync/signals.json',
  '.design-sync/tokens.json', '.design-sync/manifest.json', '.ds-sync/', 'od-bundle/',
];
const gi = join(root, '.gitignore');
const lines = (readText(gi) || '').split(/\r?\n/).filter((l) => l.trim() !== '/.design-sync/');
while (lines.length && lines[lines.length - 1] === '') lines.pop();
const have = new Set(lines.map((l) => l.trim()));
for (const ig of IGNORES) if (!have.has(ig)) lines.push(ig);
writeText(gi, lines.join('\n') + '\n');

console.log(`[ods] init ${project} -> .design-sync/`);
