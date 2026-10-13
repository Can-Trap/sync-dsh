// scripts/ods-resync.js — THE single driver: build → diff → validate → capture, one verdict.
// Driver stdout is verdict-only (child stdout goes to stderr). Exit 0 ok / 1 stage-or-gate
// failure (verdict written) / 2 usage or pre-flight (NO verdict — nothing was built).
// Never read a stage's artifact unless that stage ran green THIS run.
import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { validateConfig, readText, readJSON, pageSlug } from './_lib.js';

const USAGE = 'usage: ods-resync.js --config <path> --root <repo> --out <dir> [--remote <saved-sidecar.json>] [--base <rawBase>]';
const KNOWN = new Set(['--config', '--root', '--out', '--remote', '--base']);
const opts = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (KNOWN.has(argv[i])) opts[argv[i].slice(2)] = argv[++i];
  else console.error(`[ods] resync: ignoring unknown arg ${argv[i]}`);
}

// pre-flights — exit 2, no verdict: nothing was built
const preflight = (msg) => { console.error(msg); process.exit(2); };
if (!opts.config || !opts.root || !opts.out) preflight(USAGE);
const configPath = resolve(opts.config);
const root = resolve(opts.root);
const out = resolve(opts.out);
if (!existsSync(configPath)) preflight(`✗ resync: config not found ${configPath} — nothing was built`);
if (!existsSync(join(process.cwd(), '.design-sync'))) preflight(`✗ resync: no .design-sync/ under ${process.cwd()} — run ods-init.js first; nothing was built`);
let cfgParsed = null;
try { cfgParsed = JSON.parse(readText(configPath)); } catch { /* unparseable JSON is a build-stage failure, not a pre-flight */ }
if (cfgParsed != null) {
  const errs = validateConfig(cfgParsed);
  if (errs.length) preflight(`✗ config: ${errs[0]} — nothing was built`);
}

// stage chain — scripts resolve next to THIS file, so a staged .ds-sync/ copy runs its siblings
const SD = dirname(fileURLToPath(import.meta.url));
const stages = { build: null, diff: null, validate: null, capture: null };
let failCode = null;
const noteFailure = (code) => {
  // A child exiting 2 means ITS invocation was bad, not ours — surface it as a plain
  // stage failure (1) so exit 2 from resync always means resync's own usage/pre-flight.
  if (failCode == null) failCode = code === 2 ? 1 : code;
};
const run = (name, script, args) => {
  const child = spawnSync(process.execPath, [join(SD, script), ...args], { stdio: ['ignore', 2, 'inherit'] }); // child stdout → our stderr
  const code = typeof child.status === 'number' ? child.status : 1;
  const green = code === 0;
  stages[name] = { ok: green, exit: code, skipped: null };
  if (!green) noteFailure(code);
  return green;
};
const skip = (name, why) => { stages[name] = { ok: null, exit: null, skipped: why }; };

const buildOk = run('build', 'ods-build.js', ['--config', configPath, '--root', root, '--out', out, ...(opts.base ? ['--base', opts.base] : [])]);
const diffOk = buildOk
  ? run('diff', 'ods-diff.js', ['--local', out, ...(opts.remote ? ['--remote', opts.remote] : [])])
  : (skip('diff', 'prior_failure'), false);
const validateOk = diffOk
  ? run('validate', 'ods-validate.js', [out, '--config', configPath])
  : (skip('validate', 'prior_failure'), false);

// stale-artifact gate: read a stage's artifact only if that stage ran green THIS run
const side = buildOk ? readJSON(join(out, '_ods_sync.json'), null) : null;
const diffArt = diffOk ? readJSON(join(out, '.sync-diff.json'), null) : null;
if (diffOk && !diffArt) {
  console.error('✗ resync: diff ran green but .sync-diff.json is unreadable — treating as failure');
  noteFailure(1);
}

const worklist = diffArt ? [...new Set([...(diffArt.changed ?? []), ...(diffArt.added ?? [])])].sort() : [];
if (!validateOk || !diffArt) skip('capture', 'prior_failure');
else if (worklist.length === 0) skip('capture', 'empty_worklist');
else run('capture', 'ods-capture.js', ['--out', out, '--pages', worklist.join(',')]);

// learnings gate: unfolded subagent learnings fail the verdict even with all stages green
const learnDir = join(process.cwd(), '.design-sync', 'learnings');
const learningsUnmerged = existsSync(learnDir) ? readdirSync(learnDir).filter((f) => f.endsWith('.md')).sort() : [];
if (learningsUnmerged.length) console.error(`✗ [LEARNINGS_UNMERGED] fold into NOTES.md then delete: ${learningsUnmerged.join(', ')}`);

// pendingGrade: skipped → none fresh; failed → whole worklist; clean → missing/non-false review jsons
let pendingGrade = [];
if (stages.capture.skipped) pendingGrade = [];
else if (!stages.capture.ok) pendingGrade = worklist;
else {
  const reviewDir = join(process.cwd(), '.design-sync', '.cache', 'review');
  pendingGrade = worklist.filter((rel) => readJSON(join(reviewDir, pageSlug(rel) + '.json'), null)?.pendingGrade !== false);
}

const stagesOk = Object.values(stages).every((s) => s.ok === true || s.skipped === 'empty_worklist');
const ok = stagesOk && learningsUnmerged.length === 0;
const verdict = {
  version: 1, ok,
  shape: side?.shape ?? null,
  anchor: diffArt?.anchorReason ?? (opts.remote ? 'unknown' : 'not_provided'),
  learningsUnmerged,
  stages,
  verification: {
    unchanged: diffArt?.unchanged ?? [], changed: diffArt?.changed ?? [],
    added: diffArt?.added ?? [], removed: diffArt?.removed ?? [], pendingGrade,
  },
  upload: diffArt?.upload ?? null,
};
const text = JSON.stringify(verdict, null, 2) + '\n';
process.stdout.write(text);
// best-effort receipt: never mkdir <out> for it; a write failure never masks the stdout verdict
try { if (statSync(out).isDirectory()) writeFileSync(join(out, '.resync-verdict.json'), text); } catch { /* out absent/unwritable */ }
process.exit(ok ? 0 : (failCode ?? 1));
