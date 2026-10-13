// scripts/ods-build-design-system.js
import { join } from 'node:path';
import { readJSON, readText, writeText, writeJSON, odDesignSystemDir, odDataRoot } from './_lib.js';
const arg = (k) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : null; };
const id = arg('--id'); const name = arg('--name') || id;
if (!id) { console.error('usage: ods-build-design-system.js --id <ds-id> [--name <n>] [--tokens <tokens.json>] [--data-root <dir>] [--config <path>]'); process.exit(2); }
const tokens = readJSON(arg('--tokens'), { light: { color: {} }, dark: { color: {} } });
const dataRoot = arg('--data-root');
let dir;
if (dataRoot) dir = join(dataRoot, 'design-systems', id);
else if (odDataRoot()) dir = odDesignSystemDir(id);
else { console.error('[ods] ERROR: Open Design data root not found (OD not installed here, never launched, or a non-standard path). Pass --data-root <dir> or set OD_DATA_ROOT.'); process.exit(2); }

// Conventions-header slot: --config whose readmeHeader points at an existing file → prepend verbatim.
const cfgPath = arg('--config');
const cfg = cfgPath ? readJSON(cfgPath, null) : null;
const header = cfg?.readmeHeader ? readText(cfg.readmeHeader) : null;
const headerSlot = header ? `\n${header.trimEnd()}\n` : '';

const swatches = (o) => Object.entries(o.color || {}).map(([k, v]) => `- \`--${k}\`: \`${v}\``).join('\n') || '- (none)';
const md = `# ${name}
${headerSlot}
> Category: Generated
> Extracted by sync-dsh. Accent-as-material dark+light system.

## Color Palette & Roles
### Light (bright)
${swatches(tokens.light)}
### Dark
${swatches(tokens.dark)}
Never pure black bg / pure white text unless the source uses them.

## Theme
Light and dark are both defined. Mechanism: \`:root\` holds light; \`[data-theme="dark"]\`
(and \`@media (prefers-color-scheme: dark)\`) holds dark. A \`[data-theme-toggle]\` control flips
\`data-theme\` on \`<html>\` and persists to localStorage. Default follows \`prefers-color-scheme\`.

## Links
Accent color, no underline at rest, underline on hover; \`:focus-visible\` ring in the accent.

## Navigation
A top/side nav using the tokens; active item marked with the accent; nav chrome may use glass.

## Effects & Motion
Hover/transition on interactive elements; keyframe/ambient motion allowed; respect
\`prefers-reduced-motion\`.

## Agent Prompt Guide
Use the closest existing token; never invent hex outside this palette.
`;
writeText(join(dir, 'DESIGN.md'), md);
writeJSON(join(dir, 'tokens.json'), tokens);
console.log(`[ods] design-system -> ${dir}`);
console.log('[ods] NOTE: OD loads the design-system catalog at startup — reload Open Design to see this DS in the picker.');
