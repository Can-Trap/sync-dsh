// test/detect.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const detect = new URL('../scripts/ods-detect.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

test('detects tailwind @theme + dark class + effects', () => {
  const d = mkdtempSync(join(tmpdir(), 'det-'));
  mkdirSync(join(d, 'app'), { recursive: true });
  writeFileSync(join(d, 'app', 'globals.css'), '@theme { --color-bg: #fff; } .dark { --color-bg:#000; } a{transition:color .2s}');
  writeFileSync(join(d, 'package.json'), JSON.stringify({ dependencies: { tailwindcss: '4', 'next-themes': '1' } }));
  const out = join(d, 'signals.json');
  execFileSync('node', [detect, '--root', d, '--out', out]);
  const s = JSON.parse(readFileSync(out, 'utf8'));
  assert.ok(s.stack.includes('tailwind'));
  assert.equal(s.theme.system, 'next-themes');
  assert.equal(s.theme.hasDark, true);
  assert.equal(s.effects, true);
});

test('shape: static when root index.html exists; recorded in config', () => {
  const d = mkdtempSync(join(tmpdir(), 'det-'));
  writeFileSync(join(d, 'index.html'), '<html></html>');
  mkdirSync(join(d, '.design-sync'), { recursive: true });
  writeFileSync(join(d, '.design-sync', 'config.json'), JSON.stringify({ projectName: 'x' }));
  execFileSync('node', [detect, '--root', d, '--out', join(d, 'signals.json')]);
  const s = JSON.parse(readFileSync(join(d, 'signals.json'), 'utf8'));
  assert.equal(s.shape, 'static');
  const cfg = JSON.parse(readFileSync(join(d, '.design-sync', 'config.json'), 'utf8'));
  assert.equal(cfg.shape, 'static');
});

test('shape: app without root index.html; pinned config shape never overwritten', () => {
  const d = mkdtempSync(join(tmpdir(), 'det-'));
  writeFileSync(join(d, 'styles.css'), ':root{--a:1}');
  mkdirSync(join(d, '.design-sync'), { recursive: true });
  writeFileSync(join(d, '.design-sync', 'config.json'), JSON.stringify({ projectName: 'x', shape: 'static' }));
  execFileSync('node', [detect, '--root', d, '--out', join(d, 'signals.json')]);
  const s = JSON.parse(readFileSync(join(d, 'signals.json'), 'utf8'));
  assert.equal(s.shape, 'app');
  const cfg = JSON.parse(readFileSync(join(d, '.design-sync', 'config.json'), 'utf8'));
  assert.equal(cfg.shape, 'static');
});
