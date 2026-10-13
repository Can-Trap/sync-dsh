// test/render.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { odSafe, ODS_RUNTIME } from '../scripts/ods-render.js';

const base = '/api/projects/x/raw';
const html = `<html><head><link rel="stylesheet" href="${base}/_next/a.css"/><link rel="preload" as="script" href="${base}/_next/b.js"></head><body><a href="${base}/docs/">D</a><a href="https://x.com">ext</a><script src="${base}/_next/b.js"></script></body></html>`;

test('odSafe inlines css, strips js, fixes links, injects runtime', () => {
  const out = odSafe(html, { base, cssMap: { [`${base}/_next/a.css`]: 'a{color:red}' } });
  assert.ok(out.includes('<style>a{color:red}'));       // inlined
  assert.ok(!/<script\b[^>]*\bsrc=/.test(out));           // external js stripped
  assert.ok(!/rel="preload"/.test(out));                  // preload stripped
  assert.ok(out.includes(`href="${base}/docs/index.html"`)); // dir link -> file
  assert.ok(out.includes('href="https://x.com"'));        // external untouched
  assert.ok(out.includes(ODS_RUNTIME.slice(0, 20)));      // runtime injected
});
