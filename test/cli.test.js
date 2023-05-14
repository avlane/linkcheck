import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeFetch, runCli } from './helpers.js';

const docs = name => path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'examples', 'docs', name);

const ALL_OK = {
  'https://example.com/docs': 200,
  'http://example.com/old': 200,
  'https://example.org/autolink': 200,
  'https://example.net/bare': 200,
  'https://example.org/spec': 200,
  'https://example.com/forum': 200,
  'https://example.com/benchmarks': 200
};

test('cli checks external links, local files and anchors and lists what is broken', async () => {
  const fetch = makeFetch({ ...ALL_OK, 'http://example.com/old': 404 });
  const { code, out } = await runCli([docs('index.md')], { fetch });
  assert.equal(code, 1);
  const lines = out.trimEnd().split('\n');
  assert.match(lines[0], /index\.md:4:\d+  broken  #nope  no heading with the anchor #nope in this file$/);
  assert.match(lines[1], /index\.md:8:\d+  broken  http:\/\/example\.com\/old  404 Not Found$/);
  assert.match(lines[2], /index\.md:10:\d+  broken  images\/missing\.png  no such file: images\/missing\.png$/);
  assert.match(lines[3], /index\.md:12:\d+  broken  no definition for the reference \[nothing\]$/);
  assert.equal(lines[4], '4 broken links');
  assert.ok(!out.includes('guide.md  '));
});

test('cli exits 0 when everything is fine', async () => {
  const { code, out } = await runCli([docs('faq.md')], { fetch: makeFetch(ALL_OK) });
  assert.equal(code, 0);
  assert.equal(out, 'all links ok\n');
});

test('cli reports broken links in several files in file order', async () => {
  const { out } = await runCli([docs('guide.md'), docs('index.md')], { fetch: makeFetch(ALL_OK) });
  const lines = out.trimEnd().split('\n');
  assert.match(lines[0], /guide\.md:3:\d+  broken  \.\.\/CONTRIBUTING\.md/);
  assert.match(lines[1], /index\.md:4/);
});

test('cli only requests http and https links', async () => {
  const fetch = makeFetch(ALL_OK);
  await runCli([docs('index.md')], { fetch });
  assert.ok(fetch.calls.length > 0);
  assert.ok(fetch.calls.every(call => /^https?:\/\//.test(call.url)));
});

test('cli reports network errors', async () => {
  const failure = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
  const fetch = makeFetch({ ...ALL_OK, 'https://example.com/docs': failure });
  const { out } = await runCli([docs('index.md')], { fetch });
  assert.match(out, /broken  https:\/\/example\.com\/docs  connection refused/);
});

test('cli --timeout is passed on and validated', async () => {
  const fetch = makeFetch(ALL_OK);
  await runCli(['--timeout', '2500', docs('faq.md')], { fetch });
  assert.ok(fetch.calls[0].init.signal instanceof AbortSignal);
  const bad = await runCli(['-t', 'soon', docs('faq.md')], { fetch });
  assert.equal(bad.code, 2);
  assert.match(bad.err, /--timeout needs a positive whole number/);
});

test('cli warnings do not fail the run', async () => {
  const { code, out } = await runCli([docs('faq.md')], { fetch: makeFetch({ ...ALL_OK, 'https://example.com/benchmarks': 403 }) });
  assert.equal(code, 0);
  assert.equal(out, 'all links ok\n');
});

test('cli usage and unreadable files', async () => {
  const none = await runCli([]);
  assert.equal(none.code, 2);
  assert.match(none.err, /^usage: linkcheck/);
  const missing = await runCli(['/definitely/not/here.md']);
  assert.equal(missing.code, 2);
  assert.match(missing.err, /cannot read \/definitely\/not\/here\.md/);
});
