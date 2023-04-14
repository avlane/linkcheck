import test from 'node:test';
import assert from 'node:assert/strict';
import { extractLinks } from '../lib/extract.js';

const urls = markdown => extractLinks(markdown).map(link => link.url);

test('extractLinks finds inline links with line and column', () => {
  const links = extractLinks('first line\nsee [the docs](https://example.com/docs) now\n');
  assert.deepEqual(links, [{ url: 'https://example.com/docs', line: 2, column: 16, kind: 'link' }]);
});

test('extractLinks finds images and marks them', () => {
  const links = extractLinks('![logo](img/logo.png) and [link](a.md)');
  assert.deepEqual(links.map(l => [l.url, l.kind]), [['img/logo.png', 'image'], ['a.md', 'link']]);
});

test('extractLinks several links on one line', () => {
  const links = extractLinks('[a](one) [b](two) [c](three)');
  assert.deepEqual(links.map(l => [l.url, l.column]), [['one', 5], ['two', 14], ['three', 23]]);
});

test('extractLinks titles and angle brackets', () => {
  assert.deepEqual(urls('[a](url1 "a title") [b](url2 \'t\') [c](url3 (t)) [d](<url with spaces.md>)'),
    ['url1', 'url2', 'url3', 'url with spaces.md']);
});

test('extractLinks keeps balanced parentheses in the URL', () => {
  assert.deepEqual(urls('[w](https://example.org/wiki/Foo_(bar)) and (see [x](y.md))'),
    ['https://example.org/wiki/Foo_(bar)', 'y.md']);
});

test('extractLinks link text may contain brackets', () => {
  assert.deepEqual(urls('[a [nested] text](target.md) and [esc \\] ape](other.md)'), ['target.md', 'other.md']);
});

test('extractLinks ignores fenced code blocks', () => {
  const markdown = ['[before](a.md)', '```js', '[in](fence.md)', '```', '[after](b.md)', '~~~', '[tilde](c.md)', '~~~', '[end](d.md)'].join('\n');
  assert.deepEqual(urls(markdown), ['a.md', 'b.md', 'd.md']);
});

test('extractLinks a longer closing fence ends a block, a shorter one does not', () => {
  const markdown = ['````', '```', '[in](x.md)', '```', '````', '[out](y.md)'].join('\n');
  assert.deepEqual(urls(markdown), ['y.md']);
});

test('extractLinks ignores inline code', () => {
  assert.deepEqual(urls('`[code](a.md)` and [real](b.md) and ``[also `code`](c.md)``'), ['b.md']);
});

test('extractLinks skips empty and unfinished links', () => {
  assert.deepEqual(urls('[empty]() [open](never-closed.md and [fine](ok.md)'), ['ok.md']);
});

test('extractLinks handles CRLF line endings', () => {
  const links = extractLinks('[a](one)\r\n[b](two)\r\n');
  assert.deepEqual(links.map(l => [l.url, l.line]), [['one', 1], ['two', 2]]);
});
