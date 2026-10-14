// scripts/ods-build-design-system.js — DESIGN.md + tokens.json for an Open Design DS.
//
// THE GOVERNING RULE: this file may only state what the tokens prove.
//
// Open Design reads DESIGN.md as agent instructions, so a sentence that is wrong
// here becomes work done wrong downstream. The previous version hard-coded a theme
// paragraph — "Light and dark are both defined… [data-theme-toggle] … persists to
// localStorage" — describing a mechanism the extracted system did not have, and
// printed `var(--page)` in a colour table as though an unresolved reference were a
// value. A real project received a DESIGN.md asserting a dark theme it had never
// defined. Both claims are now DERIVED from `tokens.json`, or reported as unknown.
import { join } from 'node:path';
import { readJSON, readText, writeText, writeJSON, odDesignSystemDir, odDataRoot, arg } from './_lib.js';

const id = arg('--id'); const name = arg('--name') || id;
if (!id) {
  console.error('usage: ods-build-design-system.js --id <ds-id> [--name <n>] [--tokens <tokens.json>]');
  console.error('       [--signals <signals.json>] [--data-root <dir>] [--config <path>]');
  process.exit(2);
}
const die = (msg) => { console.error(msg); process.exit(2); };

const dataRoot = arg('--data-root');
let dir;
if (dataRoot) dir = join(dataRoot, 'design-systems', id);
else if (odDataRoot()) dir = odDesignSystemDir(id);
else { console.error('[ods] ERROR: Open Design data root not found (OD not installed here, never launched, or a non-standard path). Pass --data-root <dir> or set OD_DATA_ROOT.'); process.exit(2); }

/* ── tokens: read, or say plainly that there are none ─────────────────────── */

let tokens = { light: { color: {} }, dark: { color: {} } };
let noTokens = true;
const tokensPath = arg('--tokens');
if (tokensPath) {
  const raw = readText(tokensPath);
  if (raw == null) {
    die(`✗ design-system: tokens not found: ${tokensPath}\n` +
        '  phase 02 writes it: ods-extract-tokens.js --root <repo> --out .design-sync/tokens.json');
  }
  try { tokens = JSON.parse(raw); } catch (e) { die(`✗ design-system: ${tokensPath} is not valid JSON — ${e.message}`); }
  if (tokens == null || typeof tokens !== 'object' || Array.isArray(tokens)) die(`✗ design-system: ${tokensPath} is not a token object`);
  noTokens = false;
}

// `--signals` is optional and additive: when present it carries ods-detect.js's
// reading of the SOURCE, which is the only evidence about dark selectors. Without
// it the theme section speaks strictly about token values and claims nothing about
// CSS it never read.
const signals = arg('--signals') ? readJSON(arg('--signals'), null) : null;
const detected = signals && typeof signals === 'object' && signals.theme ? signals.theme : null;

const colorMap = (theme) => {
  const t = tokens?.[theme];
  const c = t && typeof t === 'object' ? t.color : null;
  return c && typeof c === 'object' && !Array.isArray(c) ? c : {};
};
const light = colorMap('light'), dark = colorMap('dark');
const keys = [...new Set([...Object.keys(light), ...Object.keys(dark)])].sort();
const darkCount = Object.keys(dark).length;
// A dark variant exists only if `dark` DEFINES a value that differs from light.
// Comparing the union of keys instead would call an absent (or partial) `dark` set
// a second theme: every light key would "differ" against `undefined`, and the
// section would announce a dark mode built from nothing — the same lie, retold.
const differing = keys.filter((k) => dark[k] !== undefined && light[k] !== dark[k]);
const darkDiffers = differing.length > 0;
const showVal = (v) => (v === undefined ? '(not set)' : `\`${String(v)}\``);

// Conventions-header slot: --config whose readmeHeader points at an existing file → prepend verbatim.
const cfgPath = arg('--config');
const cfg = cfgPath ? readJSON(cfgPath, null) : null;
const header = cfg?.readmeHeader ? readText(cfg.readmeHeader) : null;
const headerSlot = header ? `\n${header.trimEnd()}\n` : '';

/* ── values: a literal colour is a swatch, everything else is labelled ────── */

// Only hex and CSS colour functions are values we can call colours. In particular
// `var(--x)` is a REFERENCE: printing it as a swatch hands an agent a "colour"
// whose value is another token's name.
const LITERAL = /^(#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color|color-mix)\()/i;

const isLiteral = (v) => typeof v === 'string' && LITERAL.test(v.trim());

function kindOf(v) {
  const s = String(v).trim();
  const alias = s.match(/^var\(\s*(--[A-Za-z0-9_-]+)/);
  if (alias) return `alias → \`${alias[1]}\``;
  if (/^-?[\d.]+(?:px|rem|em|%|vh|vw|ch|pt|s|ms)$/.test(s)) return 'length/time, not a colour';
  if (/^-?[\d.]+$/.test(s)) return 'number, not a colour';
  if (/^[\d\s,.]+$/.test(s)) return 'numeric list, not a colour';
  if (/["']/.test(s)) return 'font stack, not a colour';
  return 'not a colour value';
}

const partition = (map) => {
  const swatches = [], others = [];
  for (const k of Object.keys(map).sort()) (isLiteral(map[k]) ? swatches : others).push([k, map[k]]);
  return { swatches, others };
};
const lit = partition(light), drk = partition(dark);

const swatchTable = (rows) => rows.length
  ? ['| Token | Value |', '|-------|-------|', ...rows.map(([k, v]) => `| \`--${k}\` | \`${String(v).trim()}\` |`)].join('\n')
  : '_(none extracted)_';
const otherTable = (rows) => rows.length
  ? ['| Token | Value | What it is |', '|-------|-------|------------|',
     ...rows.map(([k, v]) => `| \`--${k}\` | \`${String(v)}\` | ${kindOf(v)} |`)].join('\n')
  : '_(none)_';

/* ── theme: derived from the token comparison, never asserted ─────────────── */

// The runtime ods-build.js injects into every rendered page (ODS_RUNTIME in
// ods-render.js) is a fact about the bundle, so it may be described. What it can
// switch TO is a fact about this system, so it is described only when the tokens
// show a dark set to switch to.
const RUNTIME_FACT =
  'The Open Design render runtime (injected by `ods-build.js`) sets `data-theme` on `<html>`\n' +
  '(`light`/`dark`, defaulting to `prefers-color-scheme`) and persists the choice in\n' +
  '`localStorage` under `ods-theme`; a `[data-theme-toggle]` control flips it.';

const detectLine = detected
  ? `Source scan (\`ods-detect.js\`): \`theme.system=${detected.system}\`, \`hasLight=${detected.hasLight}\`, \`hasDark=${detected.hasDark}\`.`
  : 'Source scan: not supplied (`--signals`), so nothing here is claimed about the CSS selectors.';

const themeSection = darkDiffers
  ? `## Theme

**Light and dark are both defined, and they differ.** ${differing.length} token${differing.length === 1 ? '' : 's'} change value between the two sets:
${differing.map((k) => `- \`--${k}\`: ${showVal(light[k])} → ${showVal(dark[k])}`).join('\n')}

${RUNTIME_FACT} Author dark rules against \`[data-theme="dark"]\` (and, if the site should
follow the OS when nothing is stored, \`@media (prefers-color-scheme: dark)\`).

${detectLine}`
  : `## Theme

**Single theme — no dark variant is defined.** ${darkCount
      ? `Every value in the extracted \`dark\` set equals its \`light\` counterpart (${darkCount} token${darkCount === 1 ? '' : 's'}, not one differs).`
      : 'No `dark` set was extracted at all.'}
Treat this system as light-only.

${RUNTIME_FACT} Here it has nothing to switch to — no token changes value between the
two states${detected && detected.hasDark === false ? ', and the source scan found no dark selector either' : ''} — so
**dark is unreachable**. Do not invent a dark variant by inverting these tokens, and do
not tell the user this design system has one.

${detectLine}${detected && detected.hasDark === true
      ? '\nThe scan did find a dark selector while no token value differs — check phase 02\nbefore promising a dark mode.'
      : ''}`;

/* ── the document ─────────────────────────────────────────────────────────── */

const themeSummary = darkDiffers
  ? 'Light + dark palettes, both defined.'
  : 'Single-theme system (light only) — no dark palette is defined.';

const md = `# ${name}
${headerSlot}
> Category: Generated
> Extracted by sync-dsh. ${themeSummary}

> **What is extracted vs. what is convention.** Everything under *Color* and *Theme* is read
> from \`tokens.json\` beside this file, and is a fact about this system. *Links*,
> *Navigation* and *Effects & Motion* are standing house conventions for NEW work, not
> observations of the existing pages — the source CSS stays the authority for those.
${noTokens ? '\n> **No `--tokens` was given**, so no palette could be read: the tables below are empty\n> because nothing was supplied, not because the system has no colours.\n' : ''}
## Color Palette & Roles
### Light — literal colours
${swatchTable(lit.swatches)}

### Light — bindings & non-colour tokens
These are **not swatches**. A \`var(--…)\` entry points at another token, and an entry such as
\`216px\` is a length: copying either into a colour slot produces broken CSS.

${otherTable(lit.others)}

### Dark
${darkDiffers ? swatchTable(drk.swatches) : 'No dark values are defined — see **Theme** below. Do not invent them.'}
${darkDiffers && drk.others.length ? `\n### Dark — bindings & non-colour tokens\n\n${otherTable(drk.others)}\n` : ''}
### Roles
The token name is the role here: \`--page\` is the page background, \`--ink\` is body text,
\`--surface\` is a card. Roles are **not** inferred beyond that — read the source CSS for what
a given token actually paints, and never invent a hex outside this palette.

${themeSection}

## Links
Accent colour for links, no underline at rest, underline on hover; \`:focus-visible\` ring in
the accent. (Convention for new work.)

## Navigation
A top or side nav built from the tokens above; the active item marked with the accent; nav
chrome may use glass. (Convention for new work.)

## Effects & Motion
Hover/transition on interactive elements; keyframe/ambient motion allowed; respect
\`prefers-reduced-motion\`. (Convention for new work.)

## Agent Prompt Guide
Use the closest existing token; never invent a hex outside this palette. When a value you need
is listed as a binding or a non-colour token, resolve it through the token it points at
(\`tokens.json\`) rather than pasting the reference into a colour slot.
`;

// Replacing a DESIGN.md this pipeline did not write would silently destroy a
// hand-authored system — the OD data root can hold one. Warn; never refuse, since
// re-running phase 03 over its own output is the documented flow.
const designPath = join(dir, 'DESIGN.md');
const existing = readText(designPath);
if (existing && !/^> Category: Generated$/m.test(existing)) {
  console.warn(`[ods] WARNING: ${designPath} exists and was not written by this pipeline — it will be REPLACED.`);
  console.warn('               Back it up first if it is hand-authored (git, or a copy).');
}

writeText(designPath, md);
writeJSON(join(dir, 'tokens.json'), tokens);
console.log(`[ods] design-system -> ${dir}`);
console.log(`[ods] theme: ${darkDiffers ? `light + dark (${differing.length} token(s) differ)` : 'single theme, no dark variant defined'}`);
console.log('[ods] NOTE: OD loads the design-system catalog at startup — reload Open Design to see this DS in the picker.');
