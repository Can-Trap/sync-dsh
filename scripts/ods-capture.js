// scripts/ods-capture.js — grade lifecycle: keys grades to sources so grades follow sources,
// never styling/pipeline churn. The agent does the looking; this manages the bookkeeping.
import { existsSync, readdirSync, rmSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { readJSON, writeJSON, writeText, pageSlug } from './_lib.js';
import { KEY_RECIPE, renderHashFor, gradeKeyFrom } from './_hashes.js';

const arg = (k) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : null; };
const outArg = arg('--out');
if (!outArg) { console.error('usage: ods-capture.js --out <dir> [--pages a,b] [--force]'); process.exit(2); }
const out = resolve(outArg);
const side = readJSON(join(out, '_ods_sync.json'), null);
if (!side || typeof side.renderHashes !== 'object' || side.renderHashes == null) {
  console.error('✗ capture: missing/invalid _ods_sync.json — run ods-build.js first'); process.exit(2);
}

const force = process.argv.includes('--force');
const pagesArg = arg('--pages');
const allPages = Object.keys(side.renderHashes).sort();
const scope = pagesArg ? allPages.filter((p) => pagesArg.split(',').includes(p)) : allPages;

const cacheDir = join(process.cwd(), '.design-sync', '.cache');
const reviewDir = join(cacheDir, 'review');
mkdirSync(reviewDir, { recursive: true });
writeText(join(cacheDir, '.gitignore'), '*\n');   // self-defense, every run
const previewUrl = readJSON(join(cacheDir, 'od-project.json'), {})?.previewUrl || null;

// recipe gate: a sidecar stamped by a different recipe cannot vouch — key by the render instead
const recipeOk = side.keyRecipe === KEY_RECIPE;
let errored = 0, pending = 0;
for (const rel of scope) {
  try {
    const slug = pageSlug(rel);
    const jsonPath = join(reviewDir, slug + '.json');
    const gradePath = join(reviewDir, slug + '.grade.json');
    const stampedKey = recipeOk ? (side.sourceKeys?.[rel] ?? null) : null;
    const gradeKey = gradeKeyFrom(stampedKey ?? renderHashFor(out, rel));
    const prev = readJSON(jsonPath, null);
    let grade = readJSON(gradePath, null);
    const keyMoved = prev?.gradeKey !== gradeKey;
    if (grade != null && (keyMoved || force)) {
      rmSync(gradePath, { force: true });
      grade = null;
      console.log(`[ods] ${slug}: grade cleared (contract changed)`);
    }
    const bothGood = !!grade && grade.cells?.light?.verdict === 'good' && grade.cells?.dark?.verdict === 'good';
    if (bothGood) console.log(`[ods] ${slug}: carried forward`);
    writeJSON(jsonPath, {
      gradeKey, sourceKey: side.sourceKeys?.[rel] ?? null, keyRecipe: KEY_RECIPE,
      cells: ['light', 'dark'], pendingGrade: !bothGood,
    });
    if (!bothGood) {
      pending++;
      console.log(`[ods] pending: ${slug} — read ${previewUrl ? `${previewUrl} (page ${rel})` : join(out, rel)} in light+dark, write .design-sync/.cache/review/${slug}.grade.json`);
    }
  } catch (e) { errored++; console.error(`✗ capture: ${rel}: ${e.message}`); }
}

if (!pagesArg) {   // full runs only: prune orphans + surface unmerged learnings
  const slugs = new Set(allPages.map(pageSlug));
  for (const f of readdirSync(reviewDir)) {
    if (!f.endsWith('.json')) continue;
    if (!slugs.has(f.replace(/\.grade\.json$|\.json$/, ''))) {
      rmSync(join(reviewDir, f), { force: true });
      console.log(`[ods] pruned stale review/${f}`);
    }
  }
  const learnDir = join(process.cwd(), '.design-sync', 'learnings');
  const learn = existsSync(learnDir) ? readdirSync(learnDir).filter((f) => f.endsWith('.md')).sort() : [];
  if (learn.length) console.error(`✗ [LEARNINGS_UNMERGED] fold into NOTES.md then delete: ${learn.join(', ')}`);
}
console.log(`[ods] capture: ${scope.length} pages, ${pending} pending`);
process.exit(errored ? 1 : 0);
