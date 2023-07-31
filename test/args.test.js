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

test('readArgs --no-anchors', () => {
  assert.equal(readArgs(['a.md']).noAnchors, false);
  assert.equal(readArgs(['--no-anchors', 'a.md']).noAnchors, true);
});

test('readArgs cache options', () => {
  const none = readArgs(['a.md']);
  assert.deepEqual([none.cache, none.cacheFile, none.cacheTtl], [false, undefined, undefined]);
  const on = readArgs(['--cache', '--cache-ttl', '6', 'a.md']);
  assert.deepEqual([on.cache, on.cacheTtl], [true, 6]);
  const named = readArgs(['--cache-file', 'links.json', 'a.md']);
  assert.deepEqual([named.cache, named.cacheFile], [true, 'links.json']);
  assert.throws(() => readArgs(['--cache-ttl', '0']), /--cache-ttl needs a positive whole number/);
});

test('readArgs ignore patterns and configuration', () => {
  const args = readArgs(['--ignore', '^http://localhost', '--ignore=example\\.org', '--config', 'my.json', 'a.md']);
  assert.deepEqual(args.ignore, ['^http://localhost', 'example\\.org']);
  assert.equal(args.config, 'my.json');
  assert.equal(args.noConfig, false);
  assert.deepEqual(readArgs(['a.md']).ignore, []);
  assert.equal(readArgs(['--no-config', 'a.md']).noConfig, true);
});

test('readArgs format, json and strict', () => {
  const plain = readArgs(['a.md']);
  assert.deepEqual([plain.format, plain.strict], ['text', false]);
  assert.equal(readArgs(['--format', 'json', 'a.md']).format, 'json');
  assert.equal(readArgs(['--json', 'a.md']).format, 'json');
  assert.equal(readArgs(['--strict', 'a.md']).strict, true);
  assert.equal(readArgs(['--format=github', 'a.md']).format, 'github');
  assert.throws(() => readArgs(['--format', 'xml']), /--format must be text, json or github/);
});

test('readArgs exclude', () => {
  assert.deepEqual(readArgs(['--exclude', 'vendor/**', '--exclude=*.draft.md', 'docs']).exclude, ['vendor/**', '*.draft.md']);
  assert.deepEqual(readArgs(['docs']).exclude, []);
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
    timeout: 5, concurrency: 8, retries: 0, perHost: 2, delay: 0, ignore: [], exclude: []
  });
});

test('resolveOptions layers the command line over the config file over the defaults', () => {
  const config = { timeout: 3000, retries: 5, perHost: 1, ignore: ['a'], exclude: ['x'] };
  const options = resolveOptions(readArgs(['--retries', '1', '--ignore', 'b', '--exclude', 'y']), config);
  assert.deepEqual(options, {
    timeout: 3000, concurrency: 8, retries: 1, perHost: 1, delay: 0, ignore: ['a', 'b'], exclude: ['x', 'y']
  });
});
