import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkLocal } from '../lib/local.js';
import { classifyLink } from '../lib/classify.js';
import { createAnchorIndex } from '../lib/anchors.js';

const docs = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'examples', 'docs');
const anchors = createAnchorIndex();
const check = (url, name = 'index.md') => {
  const link = { file: path.join(docs, name), line: 1, column: 1, url, kind: 'link' };
  return checkLocal(link, classifyLink(url), { anchors });
};

test('checkLocal existing and missing files', () => {
  assert.equal(check('guide.md').status, 'ok');
  assert.equal(check('images/logo.svg').status, 'ok');
  assert.equal(check('images').status, 'ok');
  const missing = check('images/missing.png');
  assert.equal(missing.status, 'broken');
  assert.equal(missing.message, 'no such file: images/missing.png');
  assert.equal(check('../CONTRIBUTING.md', 'guide.md').status, 'broken');
});

test('checkLocal anchors in the same file', () => {
  assert.equal(check('#usage').status, 'ok');
  assert.equal(check('#Usage').status, 'ok');
  assert.equal(check('#').status, 'ok');
  assert.equal(check('#top').status, 'ok');
  const missing = check('#nope');
  assert.equal(missing.status, 'broken');
  assert.equal(missing.message, 'no heading with the anchor #nope in this file');
});

test('checkLocal anchors in other Markdown files', () => {
  assert.equal(check('faq.md#how-do-i-install').status, 'ok');
  assert.equal(check('faq.md#How-Do-I-Install').status, 'ok');
  assert.equal(check('guide.md#setup').status, 'ok');
  const missing = check('faq.md#why-slow');
  assert.equal(missing.status, 'broken');
  assert.equal(missing.message, 'no heading with the anchor #why-slow in faq.md');
  assert.equal(check('../docs/guide.md#nope', 'faq.md').message, 'no heading with the anchor #nope in ../docs/guide.md');
});

test('checkLocal fragments on files that are not Markdown are not checked', () => {
  assert.equal(check('images/logo.svg#L1').status, 'ok');
  assert.equal(check('images#anything').status, 'ok');
});

test('checkLocal checkAnchors false skips every fragment', () => {
  const link = { file: path.join(docs, 'index.md'), line: 1, column: 1, url: 'faq.md#nope', kind: 'link' };
  assert.equal(checkLocal(link, classifyLink('faq.md#nope'), { anchors, checkAnchors: false }).status, 'ok');
  assert.equal(checkLocal(link, classifyLink('#nope'), { anchors, checkAnchors: false }).status, 'ok');
});

test('checkLocal anchors in the same file come from its own headings', () => {
  assert.equal(check('#troubleshooting', 'guide.md').status, 'ok');
  assert.equal(check('#usage', 'guide.md').status, 'broken');
});

test('checkLocal a file that cannot be read has no anchors', () => {
  const link = { file: path.join(docs, 'gone.md'), line: 1, column: 1, url: '#x', kind: 'link' };
  const result = checkLocal(link, classifyLink('#x'), { anchors: createAnchorIndex() });
  assert.equal(result.status, 'broken');
  assert.match(result.message, /cannot read/);
});
