// test/ds.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const script = new URL('../scripts/ods-build-design-system.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

test('writes DESIGN.md with required capability sections', () => {
  const d = mkdtempSync(join(tmpdir(), 'ds-'));
  writeFileSync(join(d, 'tokens.json'), JSON.stringify({ light: { color: { bg: '#fff' } }, dark: { color: { bg: '#000' } }, meta: {} }));
  execFileSync('node', [script, '--id', 'demo-ds', '--tokens', join(d, 'tokens.json'), '--name', 'Demo', '--data-root', d]);
  const md = readFileSync(join(d, 'design-systems', 'demo-ds', 'DESIGN.md'), 'utf8');
  for (const h of ['Color', 'Links', 'Navigation', 'Effects', 'Theme']) assert.match(md, new RegExp(h, 'i'));
  assert.match(md, /data-theme/);
  assert.ok(existsSync(join(d, 'design-systems', 'demo-ds', 'tokens.json')));
});

test('prepends conventions header from --config readmeHeader before the Color section', () => {
  const d = mkdtempSync(join(tmpdir(), 'ds-'));
  writeFileSync(join(d, 'tokens.json'), JSON.stringify({ light: { color: { bg: '#fff' } }, dark: { color: { bg: '#000' } } }));
  mkdirSync(join(d, '.design-sync'), { recursive: true });
  const conv = join(d, '.design-sync', 'conventions.md');
  writeFileSync(conv, '## Conventions\nSENTINEL-HEADER-LINE uses `--bg`\n');
  writeFileSync(join(d, 'config.json'), JSON.stringify({ projectName: 'x', readmeHeader: conv }));
  execFileSync('node', [script, '--id', 'demo-ds', '--tokens', join(d, 'tokens.json'), '--name', 'Demo', '--data-root', d, '--config', join(d, 'config.json')]);
  const md = readFileSync(join(d, 'design-systems', 'demo-ds', 'DESIGN.md'), 'utf8');
  const at = md.indexOf('SENTINEL-HEADER-LINE');
  assert.ok(at > -1, 'header content present');
  assert.ok(at > md.indexOf('# Demo'), 'header sits after the title line');
  assert.ok(at < md.indexOf('## Color Palette & Roles'), 'header sits before the Color section');
});

test('without --config output is identical to today', () => {
  const d = mkdtempSync(join(tmpdir(), 'ds-'));
  writeFileSync(join(d, 'tokens.json'), JSON.stringify({ light: { color: { bg: '#fff' } }, dark: { color: { bg: '#000' } } }));
  execFileSync('node', [script, '--id', 'demo-ds', '--tokens', join(d, 'tokens.json'), '--name', 'Demo', '--data-root', d]);
  const md = readFileSync(join(d, 'design-systems', 'demo-ds', 'DESIGN.md'), 'utf8');
  assert.match(md, /^# Demo\n\n> Category: Generated\n/);
});
