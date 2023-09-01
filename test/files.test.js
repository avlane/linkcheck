import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { collectMarkdown, FileError } from '../lib/files.js';
import { makeDir, removeDir } from './helpers.js';

const rel = (dir, files) => files.map(file => path.relative(dir, file).split(path.sep).join('/'));

test('collectMarkdown finds Markdown files below folders, in name order', () => {
  const dir = makeDir({
    'README.md': '', 'notes.txt': '', 'docs/b.md': '', 'docs/a.markdown': '', 'docs/deep/c.MD': '', 'zz.mkd': ''
  });
  try {
    assert.deepEqual(rel(dir, collectMarkdown([dir])), ['README.md', 'docs/a.markdown', 'docs/b.md', 'docs/deep/c.MD', 'zz.mkd']);
  } finally {
    removeDir(dir);
  }
});

test('collectMarkdown skips node_modules and dot folders', () => {
  const dir = makeDir({ 'a.md': '', 'node_modules/pkg/README.md': '', '.git/notes.md': '', '.github/PULL_REQUEST.md': '' });
  try {
    assert.deepEqual(rel(dir, collectMarkdown([dir])), ['a.md']);
  } finally {
    removeDir(dir);
  }
});

test('collectMarkdown explicit files are taken as they are', () => {
  const dir = makeDir({ 'notes.txt': '', 'a.md': '', '.hidden/b.md': '' });
  try {
    const files = collectMarkdown([path.join(dir, 'notes.txt'), path.join(dir, '.hidden', 'b.md'), path.join(dir, 'a.md'), dir]);
    assert.deepEqual(rel(dir, files), ['notes.txt', '.hidden/b.md', 'a.md']);
  } finally {
    removeDir(dir);
  }
});

test('collectMarkdown exclude globs', () => {
  const dir = makeDir({ 'a.md': '', 'CHANGELOG.md': '', 'vendor/x.md': '', 'docs/keep.md': '', 'docs/drafts/d.md': '' });
  try {
    const files = collectMarkdown([dir], { exclude: ['CHANGELOG.md', 'vendor/**', 'docs/drafts'] });
    assert.deepEqual(rel(dir, files), ['a.md', 'docs/keep.md']);
    assert.deepEqual(collectMarkdown([path.join(dir, 'CHANGELOG.md')], { exclude: ['CHANGELOG.md'] }), []);
  } finally {
    removeDir(dir);
  }
});

test('collectMarkdown passes - through for standard input', () => {
  assert.deepEqual(collectMarkdown(['-']), ['-']);
});

test('collectMarkdown reports paths that do not exist', () => {
  assert.throws(() => collectMarkdown(['/definitely/not/here']), FileError);
  assert.throws(() => collectMarkdown(['/definitely/not/here']), /cannot read \/definitely\/not\/here/);
});
