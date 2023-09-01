import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnchorIndex } from '../lib/anchors.js';

test('createAnchorIndex reads each file once', () => {
  let reads = 0;
  const index = createAnchorIndex({ readFile: () => { reads++; return '# One\n## Two\n'; } });
  assert.deepEqual([...index.get('a.md')], ['one', 'two']);
  assert.deepEqual([...index.get('a.md')], ['one', 'two']);
  assert.equal(reads, 1);
});

test('createAnchorIndex gives null for files that cannot be read', () => {
  const index = createAnchorIndex({ readFile: () => { throw new Error('nope'); } });
  assert.equal(index.get('missing.md'), null);
});

test('createAnchorIndex set() supplies text that is not on disk', () => {
  const index = createAnchorIndex({ readFile: () => { throw new Error('should not be read'); } });
  index.set('<stdin>', '# From stdin\n');
  assert.deepEqual([...index.get('<stdin>')], ['from-stdin']);
});
