import test from 'node:test';
import assert from 'node:assert/strict';
import { exitCode, formatGithub, formatJson, formatText, summarize } from '../lib/report.js';

const result = (status, extra = {}) => ({ file: 'a.md', line: 1, column: 1, url: 'https://example.com/', kind: 'link', status, ...extra });

const results = [
  result('ok'),
  result('broken', { line: 2, message: '404 Not Found' }),
  result('warning', { line: 3, column: 5, message: 'moved permanently to https://example.com/new' }),
  result('skipped', { url: 'mailto:me@example.com', message: 'mailto: links are not checked' }),
  result('broken', { line: 9, url: '', message: 'no definition for the reference [x]' })
];

test('summarize counts each status', () => {
  assert.deepEqual(summarize(results, 2), { files: 2, links: 5, ok: 1, warnings: 1, broken: 2, skipped: 1 });
  assert.deepEqual(summarize([], 0), { files: 0, links: 0, ok: 0, warnings: 0, broken: 0, skipped: 0 });
});

test('formatText lists broken links and warnings, then a summary', () => {
  assert.equal(formatText(results, summarize(results, 1)), [
    'a.md:2:1  broken  https://example.com/  404 Not Found',
    'a.md:3:5  warning  https://example.com/  moved permanently to https://example.com/new',
    'a.md:9:1  broken  no definition for the reference [x]',
    '2 broken links, 1 warning',
    ''
  ].join('\n'));
});

test('formatText with nothing to report', () => {
  const clean = [result('ok'), result('skipped')];
  assert.equal(formatText(clean, summarize(clean, 1)), 'all links ok\n');
  const onlyWarning = [result('warning', { message: 'rate limited' })];
  assert.equal(formatText(onlyWarning, summarize(onlyWarning, 1)).split('\n').pop(), '');
  assert.ok(formatText(onlyWarning, summarize(onlyWarning, 1)).endsWith('1 warning\n'));
  const one = [result('broken', { message: 'x' })];
  assert.ok(formatText(one, summarize(one, 1)).endsWith('1 broken link\n'));
});

test('formatGithub prints workflow commands', () => {
  assert.equal(formatGithub(results), [
    '::error file=a.md,line=2,col=1,title=Broken link::https://example.com/ - 404 Not Found',
    '::warning file=a.md,line=3,col=5,title=Link warning::https://example.com/ - moved permanently to https://example.com/new',
    '::error file=a.md,line=9,col=1,title=Broken link::no definition for the reference [x]',
    ''
  ].join('\n'));
  assert.equal(formatGithub([result('ok'), result('skipped')]), '');
});

test('formatGithub escapes what the runner would misread', () => {
  const line = formatGithub([result('broken', { file: 'docs/a,b:c.md', message: '100% bad\nreally' })]);
  assert.equal(line, '::error file=docs/a%2Cb%3Ac.md,line=1,col=1,title=Broken link::https://example.com/ - 100%25 bad%0Areally\n');
});

test('formatJson has the summary and every result', () => {
  const parsed = JSON.parse(formatJson(results, summarize(results, 1)));
  assert.equal(parsed.summary.broken, 2);
  assert.equal(parsed.results.length, 5);
  assert.deepEqual(parsed.results[3], results[3]);
});

test('exitCode', () => {
  assert.equal(exitCode({ broken: 0, warnings: 0 }), 0);
  assert.equal(exitCode({ broken: 0, warnings: 3 }), 0);
  assert.equal(exitCode({ broken: 1, warnings: 0 }), 1);
  assert.equal(exitCode({ broken: 0, warnings: 3 }, { strict: true }), 1);
  assert.equal(exitCode({ broken: 0, warnings: 0 }, { strict: true }), 0);
});
