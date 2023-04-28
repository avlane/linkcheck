import test from 'node:test';
import assert from 'node:assert/strict';
import { extractLinks } from '../lib/extract.js';

const urls = markdown => extractLinks(markdown).links.map(link => link.url);

test('extractLinks finds inline links with line and column', () => {
  const { links, problems } = extractLinks('first line\nsee [the docs](https://example.com/docs) now\n');
  assert.deepEqual(links, [{ url: 'https://example.com/docs', line: 2, column: 16, kind: 'link' }]);
  assert.deepEqual(problems, []);
});

test('extractLinks finds images and marks them', () => {
  const { links } = extractLinks('![logo](img/logo.png) and [link](a.md)');
  assert.deepEqual(links.map(l => [l.url, l.kind]), [['img/logo.png', 'image'], ['a.md', 'link']]);
});

test('extractLinks several links on one line', () => {
  const { links } = extractLinks('[a](one) [b](two) [c](three)');
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
  const { links } = extractLinks('[a](one)\r\n[b](two)\r\n');
  assert.deepEqual(links.map(l => [l.url, l.line]), [['one', 1], ['two', 2]]);
});

const summary = markdown => extractLinks(markdown).links.map(l => [l.kind, l.url, l.line, l.column]);

test('extractLinks reference definitions are links at the line they are written', () => {
  assert.deepEqual(summary('see [spec]\n\n[spec]: https://example.org/spec "The spec"\n[other]: <local file.md>'), [
    ['reference', 'https://example.org/spec', 3, 9],
    ['reference', 'local file.md', 4, 10]
  ]);
});

test('extractLinks reports references that have no definition', () => {
  const { problems } = extractLinks('[a][known] [b][missing] [Known][] [c][]\n\n[known]: x.md\n');
  assert.deepEqual(problems, [
    { line: 1, column: 12, message: 'no definition for the reference [missing]' },
    { line: 1, column: 35, message: 'no definition for the reference [c]' }
  ]);
});

test('extractLinks reference labels ignore case and spacing and footnotes are not references', () => {
  const { problems } = extractLinks('[text][My  Label] and [^1][^2]\n\n[my label]: a.md\n');
  assert.deepEqual(problems, []);
});

test('extractLinks autolinks', () => {
  assert.deepEqual(summary('go to <https://example.org/a> or <mailto:me@example.org> or <not a link>'), [
    ['autolink', 'https://example.org/a', 1, 8],
    ['autolink', 'mailto:me@example.org', 1, 35]
  ]);
});

test('extractLinks bare URLs lose trailing punctuation', () => {
  assert.deepEqual(urls('Visit https://example.com/a, then https://example.com/b. Or (https://example.com/c) now!'),
    ['https://example.com/a', 'https://example.com/b', 'https://example.com/c']);
  assert.deepEqual(urls('https://example.org/wiki/Foo_(bar) works'), ['https://example.org/wiki/Foo_(bar)']);
});

test('extractLinks a URL is only reported once when it is also link syntax', () => {
  assert.deepEqual(summary('[https://example.com/x](https://example.com/x) and <https://example.com/y>').map(l => l[0]),
    ['link', 'autolink']);
});

test('extractLinks does not see bare URLs in code', () => {
  assert.deepEqual(urls('`https://example.com/code` and\n```\nhttps://example.com/fence\n```\nhttps://example.com/real'),
    ['https://example.com/real']);
});

test('extractLinks reads the example document', async () => {
  const fs = await import('node:fs');
  const text = fs.readFileSync(new URL('../examples/docs/index.md', import.meta.url), 'utf8');
  const { links, problems } = extractLinks(text);
  assert.deepEqual(links.map(l => [l.line, l.kind, l.url]), [
    [3, 'link', 'guide.md'],
    [3, 'link', 'faq.md#how-do-i-install'],
    [4, 'link', '#usage'],
    [4, 'link', '#nope'],
    [8, 'link', 'https://example.com/docs'],
    [8, 'link', 'http://example.com/old'],
    [10, 'image', 'images/logo.svg'],
    [10, 'image', 'images/missing.png'],
    [13, 'autolink', 'https://example.org/autolink'],
    [13, 'bare', 'https://example.net/bare'],
    [21, 'reference', 'https://example.org/spec']
  ]);
  assert.deepEqual(problems, [{ line: 12, column: 35, message: 'no definition for the reference [nothing]' }]);
});
