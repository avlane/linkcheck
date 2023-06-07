import test from 'node:test';
import assert from 'node:assert/strict';
import { readArgs, UsageError } from '../lib/args.js';
import { resolveOptions, DEFAULTS } from '../lib/options.js';

test('readArgs only sets what was given', () => {
  const args = readArgs(['a.md', 'b.md']);
  assert.deepEqual(args.files, ['a.md', 'b.md']);
  assert.equal(args.timeout, undefined);
  assert.equal(args.concurrency, undefined);
  assert.equal(args.retries, undefined);
  assert.equal(args.help, false);
});

test('readArgs numbers', () => {
  const args = readArgs(['-t', '2500', '--concurrency=4', '--retries', '0', 'a.md']);
  assert.deepEqual([args.timeout, args.concurrency, args.retries], [2500, 4, 0]);
});

test('readArgs rejects bad numbers', () => {
  assert.throws(() => readArgs(['-t', '0']), /--timeout needs a positive whole number/);
  assert.throws(() => readArgs(['-c', 'many']), /--concurrency needs a positive whole number/);
  assert.throws(() => readArgs(['--retries', '-1']), UsageError);
  assert.throws(() => readArgs(['--retries=1.5']), /--retries needs a non-negative whole number/);
  assert.throws(() => readArgs(['--nope']), UsageError);
});

test('resolveOptions fills in defaults', () => {
  assert.deepEqual(resolveOptions(readArgs(['a.md'])), DEFAULTS);
  assert.deepEqual(resolveOptions(readArgs(['-t', '5', '--retries=0'])), { timeout: 5, concurrency: 8, retries: 0 });
});
