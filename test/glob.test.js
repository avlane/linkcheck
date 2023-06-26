import test from 'node:test';
import assert from 'node:assert/strict';
import { globToRegExp, matchesGlob } from '../lib/glob.js';

test('globToRegExp stars stay inside one segment', () => {
  assert.ok(globToRegExp('*.md').test('a.md'));
  assert.ok(!globToRegExp('*.md').test('dir/a.md'));
  assert.ok(globToRegExp('draft-?.md').test('draft-1.md'));
  assert.ok(!globToRegExp('draft-?.md').test('draft-12.md'));
});

test('globToRegExp double star crosses folders', () => {
  assert.ok(globToRegExp('**/*.md').test('a.md'));
  assert.ok(globToRegExp('**/*.md').test('x/y/a.md'));
  assert.ok(globToRegExp('vendor/**').test('vendor/deep/file.md'));
  assert.ok(!globToRegExp('vendor/**').test('other/vendor/file.md'));
});

test('globToRegExp escapes regular expression characters', () => {
  assert.ok(globToRegExp('a+b(1).md').test('a+b(1).md'));
  assert.ok(!globToRegExp('a.md').test('aXmd'));
});

test('matchesGlob without a slash looks at the file name only', () => {
  assert.ok(matchesGlob('CHANGELOG.md', 'docs/old/CHANGELOG.md'));
  assert.ok(!matchesGlob('CHANGELOG.md', 'docs/old/README.md'));
  assert.ok(matchesGlob('docs/*.md', 'docs/a.md'));
  assert.ok(!matchesGlob('docs/*.md', 'docs/deep/a.md'));
});
