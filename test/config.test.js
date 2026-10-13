// test/config.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateConfig, loadConfig } from '../scripts/_lib.js';

const tmpConfig = (obj) => {
  const p = join(mkdtempSync(join(tmpdir(), 'ods-cfg-')), 'config.json');
  writeFileSync(p, JSON.stringify(obj, null, 2) + '\n');
  return p;
};

test('minimal {projectName} passes', () => {
  assert.deepEqual(validateConfig({ projectName: 'x' }), []);
});

test('unknown top-level key rejected by loadConfig', () => {
  const p = tmpConfig({ projectName: 'x', bogus: 1 });
  assert.throws(() => loadConfig(p), /✗ config: unknown key/);
});

test('unknown override subkey rejected', () => {
  assert.ok(validateConfig({ projectName: 'x', overrides: { 'a.html': { nope: true } } }).length > 0);
  const p = tmpConfig({ projectName: 'x', overrides: { 'a.html': { nope: true } } });
  assert.throws(() => loadConfig(p), /✗ config:/);
});

test('valid config round-trips with projectId preserved', () => {
  const cfg = {
    projectName: 'demo', projectId: 'od-123', shape: 'app', srcDir: '.',
    exclude: ['e2e'], entry: 'index.html', dsId: 'demo', dsName: 'Demo',
    readmeHeader: '.design-sync/conventions.md',
    overrides: { 'docs/index.html': { thinOk: true, skip: false } },
    tokenSources: ['styles.css'],
  };
  const loaded = loadConfig(tmpConfig(cfg));
  assert.deepEqual(loaded, cfg);
  assert.equal(loaded.projectId, 'od-123');
});
