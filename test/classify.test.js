import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyLink } from '../lib/classify.js';

test('classifyLink external URLs', () => {
  assert.deepEqual(classifyLink('https://example.com/a?b#c'), { type: 'external', url: 'https://example.com/a?b#c' });
  assert.deepEqual(classifyLink('HTTP://EXAMPLE.COM'), { type: 'external', url: 'HTTP://EXAMPLE.COM' });
  assert.deepEqual(classifyLink('//cdn.example.com/x.js'), { type: 'external', url: 'https://cdn.example.com/x.js' });
});

test('classifyLink anchors', () => {
  assert.deepEqual(classifyLink('#usage'), { type: 'anchor', fragment: 'usage' });
  assert.deepEqual(classifyLink('#caf%C3%A9'), { type: 'anchor', fragment: 'caf\u00e9' });
  assert.deepEqual(classifyLink('#'), { type: 'anchor', fragment: '' });
});

test('classifyLink relative paths', () => {
  assert.deepEqual(classifyLink('guide.md'), { type: 'local', path: 'guide.md', fragment: '' });
  assert.deepEqual(classifyLink('../docs/faq.md#install'), { type: 'local', path: '../docs/faq.md', fragment: 'install' });
  assert.deepEqual(classifyLink('img/my%20logo.png?raw=1'), { type: 'local', path: 'img/my logo.png', fragment: '' });
  assert.deepEqual(classifyLink('bad%escape.md'), { type: 'local', path: 'bad%escape.md', fragment: '' });
});

test('classifyLink root-relative paths are marked', () => {
  assert.deepEqual(classifyLink('/docs/guide.md#top'), { type: 'local', path: '/docs/guide.md', fragment: 'top', rootRelative: true });
  assert.equal(classifyLink('docs/guide.md').rootRelative, undefined);
});

test('classifyLink malformed URLs are invalid', () => {
  assert.deepEqual(classifyLink('http://'), { type: 'invalid', reason: 'not a valid URL' });
  assert.deepEqual(classifyLink('https://exa mple.com/'), { type: 'invalid', reason: 'not a valid URL' });
  assert.deepEqual(classifyLink('//'), { type: 'invalid', reason: 'not a valid URL' });
  assert.equal(classifyLink('https://example.com/a b').type, 'external');
});

test('classifyLink mailto links need an address', () => {
  assert.equal(classifyLink('mailto:me@example.com?subject=Hi').type, 'skipped');
  assert.equal(classifyLink('MAILTO:me%40example.com').type, 'skipped');
  assert.deepEqual(classifyLink('mailto:'), { type: 'invalid', reason: 'mailto: link without a valid email address' });
  assert.equal(classifyLink('mailto:not-an-address').type, 'invalid');
  assert.equal(classifyLink('mailto:two words@example.com').type, 'invalid');
});

test('classifyLink other schemes are skipped', () => {
  assert.deepEqual(classifyLink('mailto:me@example.com'), { type: 'skipped', reason: 'mailto: links are not checked' });
  assert.equal(classifyLink('tel:+15550100').type, 'skipped');
  assert.equal(classifyLink('ftp://example.com/file').type, 'skipped');
  assert.equal(classifyLink('javascript:void(0)').type, 'skipped');
});

test('classifyLink a Windows drive letter is not a scheme', () => {
  assert.equal(classifyLink('C:\\docs\\a.md').type, 'local');
});
