// test/args.test.js
//
// One parser, every ods script. It used to be a private one-liner in each of them —
// `process.argv.indexOf(k)` — which only understands `--key value` as two separate
// array entries. A shell-less caller (a tool passing an `args` array, a `spawn`
// without a shell, an agent that quoted the whole command line) delivers the same
// command as ONE entry, and the flag inside it was invisible: the value was dropped
// and the script fell back to its default. That is how a project comes to be named
// "project" while the caller passed a proper name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { argValue, argvTokens, hasFlag } from '../scripts/_lib.js';

const argv = (...a) => ['node', 'script.js', ...a];

test('--key value', () => {
  assert.equal(argValue(argv('--project', 'Acme'), '--project'), 'Acme');
});

test('--key=value', () => {
  assert.equal(argValue(argv('--project=Acme'), '--project'), 'Acme');
  assert.equal(argValue(argv('--base=http://x/y?a=1'), '--base'), 'http://x/y?a=1');
});

test('a whole command line delivered as one argv entry', () => {
  const one = '--project "Acme Reporting Dashboard" --mode both';
  assert.equal(argValue(argv(one), '--project'), 'Acme Reporting Dashboard');
  assert.equal(argValue(argv(one), '--mode'), 'both');
});

test('quotes are honoured and stripped, spaces inside a value survive', () => {
  assert.equal(argValue(argv(`--pair "C:\\My Dir\\a.html::C:\\Other Dir\\b.html"`), '--pair'), 'C:\\My Dir\\a.html::C:\\Other Dir\\b.html');
  assert.equal(argValue(argv("--name 'Fira Sans'"), '--name'), 'Fira Sans');
});

test('an entry that is a plain value is never split', () => {
  assert.deepEqual(argvTokens(argv('--pair', 'C:\\My Dir\\a.html::C:\\b.html')), ['--pair', 'C:\\My Dir\\a.html::C:\\b.html']);
  assert.deepEqual(argvTokens(argv('--tokens', '.design-sync/tokens.json')), ['--tokens', '.design-sync/tokens.json']);
});

test('a missing value reads as null, not as the next flag', () => {
  assert.equal(argValue(argv('--config', '--root', 'x'), '--config'), null);
  assert.equal(argValue(argv('--config'), '--config'), null);
  assert.equal(argValue(argv('--other', '1'), '--config'), null);
});

test('no prefix confusion between similarly named flags', () => {
  assert.equal(argValue(argv('--model=gpt'), '--mode'), null);
  assert.equal(argValue(argv('--mode=B'), '--model'), null);
});

test('the first occurrence wins, as indexOf did before', () => {
  assert.equal(argValue(argv('--project', 'first', '--project', 'second'), '--project'), 'first');
});

test('a value containing = survives', () => {
  assert.equal(argValue(argv('--pair=a::b'), '--pair'), 'a::b');
  assert.equal(argValue(argv('--base=http://x/?a=1&b=2'), '--base'), 'http://x/?a=1&b=2');
});

test('boolean flags are found in a joined entry too', () => {
  // `process.argv.includes('--refresh')` sees only the split form, so a joined
  // command line silently skipped the refresh.
  assert.equal(hasFlag('--refresh', argv('--root', '.', '--refresh')), true);
  assert.equal(hasFlag('--refresh', argv('--root . --out x --refresh')), true);
  assert.equal(hasFlag('--refresh', argv('--root', '.')), false);
  assert.equal(hasFlag('--apply', argv('--apply')), true);
});
