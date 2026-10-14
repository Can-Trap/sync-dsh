// test/ds.test.js
//
// DESIGN.md is read by Open Design as agent instructions, so these tests are about
// TRUTHFULNESS, not about section names. The previous version of this file asserted
// `assert.match(md, /data-theme/)` on a fixed template that claimed "Light and dark
// are both defined … persists to localStorage" for a single-theme token set: the
// test was pinning the lie in place, and the generator could not be fixed without
// failing it. Each claim below is now checked against the tokens it must be derived
// from.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const script = new URL('../scripts/ods-build-design-system.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

/** The text of the first `## `/`### ` section whose heading matches `from`. */
function section(md, from) {
  const m = md.match(from);
  assert.ok(m, `no heading matching ${from}`);
  const rest = md.slice(m.index + m[0].length);
  const end = rest.search(/\n#{2,3} /);
  return end === -1 ? rest : rest.slice(0, end);
}

/** Generate a DESIGN.md from `tokens` and return it. */
function design({ tokens, id = 'demo-ds', name = 'Demo', signals, extra = [] }) {
  const d = mkdtempSync(join(tmpdir(), 'ds-'));
  const tok = join(d, 'tokens.json');
  writeFileSync(tok, JSON.stringify(tokens));
  const args = ['--id', id, '--name', name, '--tokens', tok, ...extra];
  if (signals) {
    const sp = join(d, 'signals.json');
    writeFileSync(sp, JSON.stringify(signals));
    args.push('--signals', sp);
  }
  execFileSync('node', [script, ...args, '--data-root', d]);
  return { md: readFileSync(join(d, 'design-systems', id, 'DESIGN.md'), 'utf8'), dir: d, id };
}

const CAPABILITIES = ['## Color Palette & Roles', '## Theme', '## Links', '## Navigation', '## Effects & Motion'];

test('a dark set identical to light is reported as single-theme, never as a dark mode', () => {
  // The shape the extractor emits when the source has no dark block: it writes
  // `dark` as a copy of `light`.
  const light = { page: '#f3f6f8', ink: '#142b3b', 'tblr-body-bg': 'var(--page)' };
  const { md } = design({ tokens: { light: { color: light }, dark: { color: { ...light } } } });

  for (const h of CAPABILITIES) assert.ok(md.includes(h), `missing ${h}`);
  assert.match(section(md, /^## Theme[^\n]*$/m), /single theme|no dark variant/i);
  // The exact sentence the old template printed, and the exact defect reported.
  assert.doesNotMatch(md, /light and dark are both defined/i);
  assert.doesNotMatch(md, /this (design system|DS) has a dark/i);
});

test('the theme section describes the runtime but calls dark unreachable when it is', () => {
  const { md } = design({ tokens: { light: { color: { page: '#fff' } }, dark: { color: { page: '#fff' } } } });
  const theme = section(md, /^## Theme[^\n]*$/m);
  // `data-theme` is real: ods-render.js's ODS_RUNTIME sets it on <html>. Describing
  // it is fine; promising it switches something is not.
  assert.match(theme, /data-theme/);
  assert.match(theme, /unreachable/i);
  assert.match(theme, /do not invent/i);
});

test('an absent or purely-overlapping dark set is single-theme, not a second theme', () => {
  // `dark` missing entirely: nothing may be reported as a dark variant.
  const absent = design({ tokens: { light: { color: { page: '#f3f6f8' } } } }).md;
  assert.match(section(absent, /^## Theme[^\n]*$/m), /no dark variant/i);
  assert.match(section(absent, /^## Theme[^\n]*$/m), /no `dark` set was extracted/i);
  assert.doesNotMatch(absent, /both defined/i);

  // `dark` present but only repeating light's own values (a partial override that
  // overrides nothing): still one theme. Comparing key sets instead of values
  // would call this "both defined and they differ".
  const overlap = design({ tokens: { light: { color: { page: '#fff', ink: '#000' } }, dark: { color: { page: '#fff' } } } }).md;
  assert.match(section(overlap, /^## Theme[^\n]*$/m), /no dark variant/i);
  assert.doesNotMatch(overlap, /both defined/i);
  assert.match(section(overlap, /^### Dark[^\n]*$/m), /No dark values are defined/);
});

test('var() aliases and lengths are labelled as bindings, never printed as swatches', () => {
  const { md, dir, id } = design({
    tokens: {
      light: { color: { page: '#f3f6f8', 'tblr-body-bg': 'var(--page)', 'tblr-sidebar-width': '216px', 'tblr-font-sans-serif': '"Fira Sans", system-ui, sans-serif' } },
      dark: { color: {} },
    },
  });

  const swatches = section(md, /^### Light[^\n]*$/m);
  assert.match(swatches, /#f3f6f8/);
  assert.ok(!/var\(/.test(swatches), 'an unresolved var() must never sit in a colour table');
  assert.ok(!/216px/.test(swatches), 'a length must never sit in a colour table');

  const bindings = section(md, /^### Light[^\n]*bindings[^\n]*$/m);
  assert.match(bindings, /var\(--page\)/);
  assert.match(bindings, /alias → `--page`/);
  assert.match(bindings, /216px/);
  assert.match(bindings, /not swatches/i);

  assert.ok(existsSync(join(dir, 'design-systems', id, 'tokens.json')));   // ships beside DESIGN.md
});

test('a dark set that differs is described, with the mechanism that reaches it', () => {
  const { md } = design({ tokens: { light: { color: { page: '#ffffff' } }, dark: { color: { page: '#101418' } } } });
  const theme = section(md, /^## Theme[^\n]*$/m);
  assert.match(theme, /differ/i);
  assert.match(theme, /`--page`/);
  assert.match(theme, /\[data-theme="dark"\]/);
  assert.doesNotMatch(theme, /unreachable/i);
  assert.match(section(md, /^### Dark[^\n]*$/m), /#101418/);
});

test('--signals: a source with no dark selector is reported as such, not guessed at', () => {
  const tokens = { light: { color: { page: '#fff' } }, dark: { color: { page: '#fff' } } };
  const blind = section(design({ tokens }).md, /^## Theme[^\n]*$/m);
  assert.match(blind, /Source scan: not supplied/i, 'with no --signals, claim nothing about the CSS');

  const scanned = section(
    design({ tokens, signals: { theme: { system: 'none', hasLight: true, hasDark: false } } }).md,
    /^## Theme[^\n]*$/m);
  assert.match(scanned, /hasDark=false/);
  assert.match(scanned, /found no dark selector/i);
});

test('prepends conventions header from --config readmeHeader before the Color section', () => {
  const d = mkdtempSync(join(tmpdir(), 'ds-'));
  writeFileSync(join(d, 'tokens.json'), JSON.stringify({ light: { color: { bg: '#fff' } }, dark: { color: { bg: '#000' } } }));
  const conv = join(d, 'conventions.md');
  writeFileSync(conv, '## Conventions\nSENTINEL-HEADER-LINE uses `--bg`\n');
  writeFileSync(join(d, 'config.json'), JSON.stringify({ projectName: 'x', readmeHeader: conv }));
  execFileSync('node', [script, '--id', 'demo-ds', '--tokens', join(d, 'tokens.json'), '--name', 'Demo',
    '--data-root', d, '--config', join(d, 'config.json')]);
  const md = readFileSync(join(d, 'design-systems', 'demo-ds', 'DESIGN.md'), 'utf8');
  const at = md.indexOf('SENTINEL-HEADER-LINE');
  assert.ok(at > -1, 'header content present');
  assert.ok(at > md.indexOf('# Demo'), 'header sits after the title line');
  assert.ok(at < md.indexOf('## Color Palette & Roles'), 'header sits before the Color section');
});

test('without --config output is identical to today', () => {
  const { md } = design({ tokens: { light: { color: { bg: '#fff' } }, dark: { color: { bg: '#000' } } } });
  assert.match(md, /^# Demo\n\n> Category: Generated\n/);
});

test('--tokens pointing at nothing is exit 2, and writes no DESIGN.md', () => {
  const d = mkdtempSync(join(tmpdir(), 'ds-'));
  let err = null;
  try {
    execFileSync('node', [script, '--id', 'x', '--name', 'X', '--tokens', join(d, 'nope.json'), '--data-root', d], { stdio: 'pipe' });
  } catch (e) { err = e; }
  assert.ok(err, 'must not silently write a DESIGN.md for tokens it could not read');
  assert.equal(err.status, 2);
  assert.match(String(err.stderr), /tokens not found/);
  assert.ok(!existsSync(join(d, 'design-systems', 'x', 'DESIGN.md')));
});

test('replacing a DESIGN.md this pipeline did not write warns, and a re-run does not', () => {
  const d = mkdtempSync(join(tmpdir(), 'ds-'));
  const tok = join(d, 'tokens.json');
  writeFileSync(tok, JSON.stringify({ light: { color: { page: '#fff' } }, dark: { color: { page: '#fff' } } }));
  const args = [script, '--id', 'demo-ds', '--name', 'Demo', '--tokens', tok, '--data-root', d];
  const target = join(d, 'design-systems', 'demo-ds');
  mkdirSync(target, { recursive: true });
  writeFileSync(join(target, 'DESIGN.md'), '# Hand-authored\n\nThere is no dark mode.\n');

  const first = spawnSync('node', args, { encoding: 'utf8' });
  assert.match(first.stderr, /not written by this pipeline/, 'a hand-authored DESIGN.md must not vanish silently');
  assert.doesNotMatch(readFileSync(join(target, 'DESIGN.md'), 'utf8'), /There is no dark mode/);

  const second = spawnSync('node', args, { encoding: 'utf8' });   // over its own output
  assert.doesNotMatch(second.stderr, /not written by this pipeline/);
});
