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

test('readArgs ignore patterns and configuration', () => {
  const args = readArgs(['--ignore', '^http://localhost', '--ignore=example\\.org', '--config', 'my.json', 'a.md']);
  assert.deepEqual(args.ignore, ['^http://localhost', 'example\\.org']);
  assert.equal(args.config, 'my.json');
  assert.equal(args.noConfig, false);
  assert.deepEqual(readArgs(['a.md']).ignore, []);
  assert.equal(readArgs(['--no-config', 'a.md']).noConfig, true);
});

test('readArgs per-host and delay', () => {
  const args = readArgs(['--per-host', '1', '--delay', '250', 'a.md']);
  assert.deepEqual([args.perHost, args.delay], [1, 250]);
  assert.equal(readArgs(['--delay', '0', 'a.md']).delay, 0);
  assert.throws(() => readArgs(['--per-host', '0']), /--per-host needs a positive whole number/);
  assert.throws(() => readArgs(['--delay', '-5']), UsageError);
});

test('resolveOptions fills in defaults', () => {
  assert.deepEqual(resolveOptions(readArgs(['a.md'])), DEFAULTS);
  assert.deepEqual(resolveOptions(readArgs(['-t', '5', '--retries=0'])), {
    timeout: 5, concurrency: 8, retries: 0, perHost: 2, delay: 0, ignore: []
  });
});

test('resolveOptions layers the command line over the config file over the defaults', () => {
  const config = { timeout: 3000, retries: 5, perHost: 1, ignore: ['a'] };
  const options = resolveOptions(readArgs(['--retries', '1', '--ignore', 'b']), config);
  assert.deepEqual(options, { timeout: 3000, concurrency: 8, retries: 1, perHost: 1, delay: 0, ignore: ['a', 'b'] });
});
