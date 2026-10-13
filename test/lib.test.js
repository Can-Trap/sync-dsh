// test/lib.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sha256, writeManagedBlock } from '../scripts/_lib.js';

test('sha256 stable + hex', () => {
  assert.equal(sha256('abc'), sha256('abc'));
  assert.match(sha256('abc'), /^[0-9a-f]{64}$/);
});

test('writeManagedBlock inserts then replaces idempotently, preserving human text', () => {
  const human = 'KEEP ME\n';
  let out = writeManagedBlock(human, 'tokens', 'v1');
  assert.ok(out.includes('KEEP ME'));
  assert.ok(out.includes('design-sync:start:tokens'));
  assert.ok(out.includes('v1'));
  const out2 = writeManagedBlock(out, 'tokens', 'v2');
  assert.ok(out2.includes('v2') && !out2.includes('v1'));   // replaced, not duplicated
  assert.equal((out2.match(/design-sync:start:tokens/g) || []).length, 1);
  assert.ok(out2.includes('KEEP ME'));                       // never clobbered
});
