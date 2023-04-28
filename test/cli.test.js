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
  'https://example.org/spec': 200
};

test('cli checks the external links of a file and lists the broken ones', async () => {
  const fetch = makeFetch({ ...ALL_OK, 'http://example.com/old': 404 });
  const { code, out } = await runCli([docs('index.md')], { fetch });
  assert.equal(code, 1);
  assert.match(out, /index\.md:8:\d+  broken  http:\/\/example\.com\/old  404\n/);
  assert.ok(!out.includes('https://example.com/docs'));
  assert.ok(out.endsWith('1 broken link\n'), out);
});

test('cli exits 0 when every external link works', async () => {
  const { code, out } = await runCli([docs('index.md')], { fetch: makeFetch(ALL_OK) });
  assert.equal(code, 0);
  assert.equal(out, 'all links ok\n');
});

test('cli checks links in running text, autolinks and reference definitions, and only http(s)', async () => {
  const fetch = makeFetch(ALL_OK);
  await runCli([docs('index.md')], { fetch });
  assert.deepEqual(fetch.calls.map(call => call.url), [
    'https://example.com/docs',
    'http://example.com/old',
    'https://example.org/autolink',
    'https://example.net/bare',
    'https://example.org/spec'
  ]);
});

test('cli reports network errors', async () => {
  const failure = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
  const fetch = makeFetch({ 'https://example.com/docs': failure, 'http://example.com/old': 200 });
  const { out } = await runCli([docs('index.md')], { fetch });
  assert.match(out, /broken  https:\/\/example\.com\/docs  ECONNREFUSED/);
});

test('cli usage and unreadable files', async () => {
  const none = await runCli([]);
  assert.equal(none.code, 2);
  assert.match(none.err, /^usage: linkcheck/);
  const missing = await runCli(['/definitely/not/here.md']);
  assert.equal(missing.code, 2);
  assert.match(missing.err, /cannot read \/definitely\/not\/here\.md/);
});
