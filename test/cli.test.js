import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeDir, makeFetch, removeDir, runCli } from './helpers.js';

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

test('cli --retries retries a flaky link', async () => {
  const dir = makeDir({ 'a.md': '[x](https://example.com/flaky)\n' });
  try {
    let n = 0;
    const routes = { 'https://example.com/flaky': () => (n++ < 2 ? 503 : 200) };
    const sleeps = [];
    const sleep = async ms => { sleeps.push(ms); };
    const ok = await runCli([path.join(dir, 'a.md')], { fetch: makeFetch(routes), sleep });
    assert.equal(ok.code, 0);
    assert.deepEqual(sleeps, [500, 1000]);

    n = 0;
    const none = await runCli(['--retries', '0', path.join(dir, 'a.md')], { fetch: makeFetch(routes), sleep });
    assert.equal(none.code, 1);
    assert.match(none.out, /503 Service Unavailable/);
  } finally {
    removeDir(dir);
  }
});

test('cli --per-host keeps requests to one site down', async () => {
  const links = Array.from({ length: 10 }, (_, i) => `[l${i}](https://example.com/${i})`).join('\n');
  const dir = makeDir({ 'many.md': links + '\n' });
  try {
    let active = 0;
    let peak = 0;
    const routes = {};
    for (let i = 0; i < 10; i++) {
      routes[`https://example.com/${i}`] = async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise(resolve => setTimeout(resolve, 5));
        active--;
        return 200;
      };
    }
    const fetch = makeFetch(routes);
    assert.equal((await runCli(['-c', '10', path.join(dir, 'many.md')], { fetch })).code, 0);
    assert.equal(peak, 2);
    peak = 0;
    assert.equal((await runCli(['-c', '10', '--per-host', '1', path.join(dir, 'many.md')], { fetch })).code, 0);
    assert.equal(peak, 1);
  } finally {
    removeDir(dir);
  }
});

test('cli --delay spaces out requests to one host', async () => {
  const dir = makeDir({ 'a.md': '[a](https://example.com/a) [b](https://example.com/b) [c](https://other.example.org/c)\n' });
  try {
    const sleeps = [];
    const sleep = async ms => { sleeps.push(ms); };
    const fetch = makeFetch({ 'https://example.com/a': 200, 'https://example.com/b': 200, 'https://other.example.org/c': 200 });
    const { code } = await runCli(['--delay', '1000', '--per-host', '1', path.join(dir, 'a.md')], { fetch, sleep });
    assert.equal(code, 0);
    assert.equal(sleeps.length, 1);
    assert.ok(sleeps[0] > 0 && sleeps[0] <= 1000);
  } finally {
    removeDir(dir);
  }
});

test('cli --timeout is passed on and validated', async () => {
  const fetch = makeFetch(ALL_OK);
  await runCli(['--timeout', '2500', docs('faq.md')], { fetch });
  assert.ok(fetch.calls[0].init.signal instanceof AbortSignal);
  const bad = await runCli(['-t', 'soon', docs('faq.md')], { fetch });
  assert.equal(bad.code, 2);
  assert.match(bad.err, /--timeout needs a positive whole number/);
});

test('cli requests each URL once and applies the result to every occurrence', async () => {
  const dir = makeDir({ 'a.md': '[x](https://example.com/p#one) [y](https://example.com/p#two)\n[z](https://example.com/p)\n[w](https://example.com/q)\n' });
  try {
    const fetch = makeFetch({ 'https://example.com/p': 200 });
    const { code, out } = await runCli([path.join(dir, 'a.md')], { fetch });
    assert.deepEqual(fetch.calls.map(call => call.url).sort(), ['https://example.com/p', 'https://example.com/q']);
    assert.equal(code, 1);
    assert.equal(out.trimEnd().split('\n').length, 2);
  } finally {
    removeDir(dir);
  }
});

test('cli --concurrency limits parallel requests', async () => {
  const links = Array.from({ length: 12 }, (_, i) => `[l${i}](https://example.com/${i})`).join('\n');
  const dir = makeDir({ 'many.md': links + '\n' });
  try {
    let active = 0;
    let peak = 0;
    const routes = {};
    for (let i = 0; i < 12; i++) {
      routes[`https://example.com/${i}`] = async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise(resolve => setTimeout(resolve, 5));
        active--;
        return 200;
      };
    }
    const { code } = await runCli(['-c', '3', '--per-host', '3', path.join(dir, 'many.md')], { fetch: makeFetch(routes) });
    assert.equal(code, 0);
    assert.equal(peak, 3);
    const bad = await runCli(['--concurrency', '0', path.join(dir, 'many.md')]);
    assert.equal(bad.code, 2);
    assert.match(bad.err, /--concurrency needs a positive whole number/);
  } finally {
    removeDir(dir);
  }
});

test('cli permanent redirects are warnings and do not fail the run', async () => {
  const dir = makeDir({ 'a.md': '[old](http://example.com/old)\n' });
  try {
    const fetch = makeFetch({
      'http://example.com/old': { status: 301, headers: { location: 'https://example.com/new' } },
      'https://example.com/new': 200
    });
    const { code, out } = await runCli([path.join(dir, 'a.md')], { fetch });
    assert.equal(code, 0);
    assert.equal(out, 'all links ok\n');
  } finally {
    removeDir(dir);
  }
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
