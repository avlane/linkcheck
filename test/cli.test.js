import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
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

test('cli --ignore skips matching links', async () => {
  const dir = makeDir({ 'a.md': '[a](https://localhost:3000/x) [b](https://wiki.internal.example.com/p) [c](https://example.com/c)\n' });
  try {
    const fetch = makeFetch({ 'https://example.com/c': 200 });
    const { code, out } = await runCli(['--ignore', '^https://localhost', '--ignore', 'internal', '--no-config', path.join(dir, 'a.md')], { fetch });
    assert.equal(code, 0);
    assert.equal(out, 'all links ok\n');
    assert.deepEqual(fetch.calls.map(call => call.url), ['https://example.com/c']);
    const bad = await runCli(['--ignore', '(', '--no-config', path.join(dir, 'a.md')], { fetch });
    assert.equal(bad.code, 2);
    assert.match(bad.err, /bad ignore pattern/);
  } finally {
    removeDir(dir);
  }
});

test('cli reads .linkcheckrc.json from the working folder', async () => {
  const dir = makeDir({
    'a.md': '[a](https://localhost:3000/x) [b](https://example.com/b)\n',
    '.linkcheckrc.json': '{"ignore": ["localhost"], "retries": 0}'
  });
  try {
    const fetch = makeFetch({ 'https://example.com/b': 503 });
    const { code, out } = await runCli([path.join(dir, 'a.md')], { fetch, cwd: dir });
    assert.equal(code, 1);
    assert.match(out, /https:\/\/example\.com\/b  503/);
    assert.equal(fetch.calls.length, 1);
    const skipped = await runCli(['--no-config', '--retries', '0', path.join(dir, 'a.md')], { fetch: makeFetch({}), cwd: dir });
    assert.match(skipped.out, /localhost:3000\/x  404/);
  } finally {
    removeDir(dir);
  }
});

test('cli --config names the file, which must exist, and bad settings are usage errors', async () => {
  const dir = makeDir({ 'a.md': '[a](https://example.com/a)\n', 'custom.json': '{"timeout": "slow"}', 'ok.json': '{"timeout": 1234}' });
  try {
    const missing = await runCli(['--config', path.join(dir, 'nope.json'), path.join(dir, 'a.md')]);
    assert.equal(missing.code, 2);
    assert.match(missing.err, /cannot read the configuration file/);
    const bad = await runCli(['--config', path.join(dir, 'custom.json'), path.join(dir, 'a.md')]);
    assert.equal(bad.code, 2);
    assert.match(bad.err, /"timeout" must be a whole number/);
    const fetch = makeFetch({ 'https://example.com/a': 200 });
    assert.equal((await runCli(['--config', path.join(dir, 'ok.json'), path.join(dir, 'a.md')], { fetch })).code, 0);
  } finally {
    removeDir(dir);
  }
});

test('cli checks every Markdown file in a folder and honours --exclude', async () => {
  const dir = makeDir({
    'a.md': '[x](https://example.com/a)\n',
    'docs/b.md': '[y](https://example.com/b)\n',
    'vendor/c.md': '[z](https://example.com/c)\n',
    'notes.txt': '[t](https://example.com/t)\n'
  });
  try {
    const all = makeFetch({ 'https://example.com/a': 200, 'https://example.com/b': 200, 'https://example.com/c': 200 });
    assert.equal((await runCli(['--no-config', dir], { fetch: all })).code, 0);
    assert.deepEqual(all.calls.map(call => call.url).sort(), ['https://example.com/a', 'https://example.com/b', 'https://example.com/c']);
    const some = makeFetch({ 'https://example.com/a': 200, 'https://example.com/b': 200 });
    assert.equal((await runCli(['--no-config', '--exclude', 'vendor/**', dir], { fetch: some })).code, 0);
    assert.deepEqual(some.calls.map(call => call.url).sort(), ['https://example.com/a', 'https://example.com/b']);
  } finally {
    removeDir(dir);
  }
});

test('cli reads exclude from the config file', async () => {
  const dir = makeDir({ 'a.md': '[x](https://example.com/a)\n', 'old/b.md': '[y](https://example.com/b)\n', '.linkcheckrc.json': '{"exclude": ["old/**"]}' });
  try {
    const fetch = makeFetch({ 'https://example.com/a': 200 });
    assert.equal((await runCli([dir], { fetch, cwd: dir })).code, 0);
    assert.deepEqual(fetch.calls.map(call => call.url), ['https://example.com/a']);
  } finally {
    removeDir(dir);
  }
});

test('cli --cache skips links that worked last time', async () => {
  const dir = makeDir({ 'a.md': '[ok](https://example.com/ok) [bad](https://example.com/bad) [moved](http://example.com/moved)\n' });
  try {
    const routes = {
      'https://example.com/ok': 200,
      'https://example.com/bad': 500,
      'http://example.com/moved': { status: 301, headers: { location: 'https://example.com/new' } },
      'https://example.com/new': 200
    };
    const args = ['--cache', '--retries', '0', '--no-config', path.join(dir, 'a.md')];
    const first = makeFetch(routes);
    await runCli(args, { fetch: first, cwd: dir, now: () => 1000 });
    assert.equal(first.calls.filter(call => call.url === 'https://example.com/ok').length, 1);

    const second = makeFetch(routes);
    const { code } = await runCli(args, { fetch: second, cwd: dir, now: () => 2000 });
    assert.equal(code, 1);
    assert.equal(second.calls.filter(call => call.url === 'https://example.com/ok').length, 0);
    assert.equal(second.calls.filter(call => call.url === 'https://example.com/bad').length, 1);
    assert.equal(second.calls.filter(call => call.url === 'http://example.com/moved').length, 1);

    const stale = makeFetch(routes);
    await runCli([...args, '--cache-ttl', '1'], { fetch: stale, cwd: dir, now: () => 1000 + 2 * 3600 * 1000 });
    assert.equal(stale.calls.filter(call => call.url === 'https://example.com/ok').length, 1);
  } finally {
    removeDir(dir);
  }
});

test('cli without --cache never touches the cache file', async () => {
  const dir = makeDir({ 'a.md': '[ok](https://example.com/ok)\n' });
  try {
    await runCli(['--no-config', path.join(dir, 'a.md')], { fetch: makeFetch({ 'https://example.com/ok': 200 }), cwd: dir });
    assert.deepEqual(fs.readdirSync(dir), ['a.md']);
    await runCli(['--cache-file', 'mine.json', '--no-config', path.join(dir, 'a.md')], { fetch: makeFetch({ 'https://example.com/ok': 200 }), cwd: dir });
    assert.deepEqual(fs.readdirSync(dir).sort(), ['a.md', 'mine.json']);
  } finally {
    removeDir(dir);
  }
});

test('cli checks anchors in other files, and --no-anchors does not', async () => {
  const { code, out } = await runCli(['--no-config', docs('reference.md')], { fetch: makeFetch({}) });
  assert.equal(code, 1);
  const lines = out.trimEnd().split('\n');
  assert.equal(lines.length, 3);
  assert.match(lines[0], /reference\.md:3:\d+  broken  faq\.md#why-slow  no heading with the anchor #why-slow in faq\.md$/);
  assert.match(lines[1], /reference\.md:4:\d+  broken  guide\.md#setup-steps  no heading with the anchor #setup-steps in guide\.md$/);
  assert.equal(lines[2], '2 broken links');
  const lenient = await runCli(['--no-config', '--no-anchors', docs('reference.md')], { fetch: makeFetch({}) });
  assert.equal(lenient.code, 0);
});

test('cli checks every URL once even when several files use it', async () => {
  const dir = makeDir({ 'a.md': '[x](https://example.com/shared)\n', 'b.md': '[y](https://example.com/shared)\n[z](https://example.com/b)\n' });
  try {
    const fetch = makeFetch({ 'https://example.com/shared': 200, 'https://example.com/b': 200 });
    const { code } = await runCli(['--no-config', dir], { fetch });
    assert.equal(code, 0);
    assert.deepEqual(fetch.calls.map(call => call.url).sort(), ['https://example.com/b', 'https://example.com/shared']);
  } finally {
    removeDir(dir);
  }
});

test('cli --quiet and --verbose', async () => {
  const dir = makeDir({ 'a.md': '[x](https://example.com/x) [m](mailto:me@example.com) [l](b.md)\n', 'b.md': '# B\n' });
  try {
    const fetch = makeFetch({ 'https://example.com/x': 200 });
    const file = path.join(dir, 'a.md');
    assert.equal((await runCli(['--no-config', '--quiet', file], { fetch })).out, '');
    const verbose = await runCli(['--no-config', '--verbose', file], { fetch });
    const lines = verbose.out.trimEnd().split('\n');
    assert.equal(lines.length, 4);
    assert.match(lines[0], /a\.md:1:\d+  ok  https:\/\/example\.com\/x$/);
    assert.match(lines[1], /a\.md:1:\d+  skipped  mailto:me@example\.com  mailto: links are not checked$/);
    assert.equal(lines[3], '3 links in 1 file: 2 ok, 0 warnings, 0 broken, 1 skipped');
    assert.equal((await runCli(['-q', '-v', file])).code, 2);
  } finally {
    removeDir(dir);
  }
});

test('cli shows a progress counter on a terminal only', async () => {
  const dir = makeDir({ 'a.md': '[x](https://example.com/x) [y](https://example.com/y)\n' });
  try {
    const fetch = makeFetch({ 'https://example.com/x': 200, 'https://example.com/y': 200 });
    const tty = await runCli(['--no-config', path.join(dir, 'a.md')], { fetch, stderrIsTTY: true });
    assert.match(tty.err, /\rchecked 1\/2 links/);
    assert.match(tty.err, /\rchecked 2\/2 links/);
    assert.ok(tty.err.endsWith('\r\u001b[K'));
    assert.equal(tty.out, 'all links ok\n');
    const piped = await runCli(['--no-config', path.join(dir, 'a.md')], { fetch });
    assert.equal(piped.err, '');
    const json = await runCli(['--no-config', '--json', path.join(dir, 'a.md')], { fetch, stderrIsTTY: true });
    assert.equal(json.err, '');
  } finally {
    removeDir(dir);
  }
});

test('cli root-relative links: skipped, looked up with --root, or checked with --base-url', async () => {
  const dir = makeDir({ 'site/docs/a.md': '[g](/docs/b.md) [m](/missing.md) [i](/img/pic.png)\n', 'site/docs/b.md': '# B\n', 'site/img/pic.png': 'x' });
  try {
    const file = path.join(dir, 'site', 'docs', 'a.md');
    const skipped = await runCli(['--no-config', '--verbose', file]);
    assert.equal(skipped.code, 0);
    assert.equal((skipped.out.match(/root-relative links need --root or --base-url/g) ?? []).length, 3);
    const rooted = await runCli(['--no-config', '--root', path.join(dir, 'site'), file]);
    assert.equal(rooted.code, 1);
    assert.match(rooted.out, /a\.md:1:\d+  broken  \/missing\.md  no such file: \/missing\.md\n1 broken link\n$/);
    const fetch = makeFetch({ 'https://docs.example.com/docs/b.md': 200, 'https://docs.example.com/img/pic.png': 200 });
    const based = await runCli(['--no-config', '--base-url', 'https://docs.example.com/', file], { fetch });
    assert.deepEqual(fetch.calls.map(call => call.url).sort(), [
      'https://docs.example.com/docs/b.md', 'https://docs.example.com/img/pic.png', 'https://docs.example.com/missing.md'
    ]);
    assert.equal(based.code, 1);
  } finally {
    removeDir(dir);
  }
});

test('cli reports malformed URLs and empty mailto links without any request', async () => {
  const dir = makeDir({ 'a.md': '[a](http://) [b](mailto:) [c](mailto:me@example.com) [d](http://exa%mple.com/)\n[e](https://example.com/ok)\n' });
  try {
    const fetch = makeFetch({ 'https://example.com/ok': 200 });
    const { code, out } = await runCli(['--no-config', path.join(dir, 'a.md')], { fetch });
    assert.equal(code, 1);
    assert.match(out, /broken  http:\/\/  not a valid URL\n/);
    assert.match(out, /broken  mailto:  mailto: link without a valid email address\n/);
    assert.match(out, /broken  http:\/\/exa%mple\.com\/  not a valid URL\n/);
    assert.ok(out.endsWith('3 broken links\n'), out);
    assert.deepEqual(fetch.calls.map(call => call.url), ['https://example.com/ok']);
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
    assert.match(out, /a\.md:1:\d+  warning  http:\/\/example\.com\/old  moved permanently to https:\/\/example\.com\/new\n1 warning\n$/);
  } finally {
    removeDir(dir);
  }
});

test('cli lists warnings but they do not fail the run', async () => {
  const { code, out } = await runCli([docs('faq.md')], { fetch: makeFetch({ ...ALL_OK, 'https://example.com/benchmarks': 403 }) });
  assert.equal(code, 0);
  assert.match(out, /faq\.md:9:\d+  warning  https:\/\/example\.com\/benchmarks  403 Forbidden \(may need a login\)\n1 warning\n$/);
});

test('cli --strict fails on warnings', async () => {
  const fetch = makeFetch({ ...ALL_OK, 'https://example.com/benchmarks': 403 });
  assert.equal((await runCli(['--strict', docs('faq.md')], { fetch })).code, 1);
  assert.equal((await runCli(['--strict', docs('faq.md')], { fetch: makeFetch(ALL_OK) })).code, 0);
});

test('cli --format json prints a summary and every result', async () => {
  const fetch = makeFetch({ ...ALL_OK, 'http://example.com/old': 404 });
  const { code, out } = await runCli(['--format', 'json', docs('index.md')], { fetch });
  assert.equal(code, 1);
  const report = JSON.parse(out);
  assert.deepEqual(report.summary, { files: 1, links: 12, ok: 8, warnings: 0, broken: 4, skipped: 0 });
  assert.equal(report.results.length, 12);
  const old = report.results.find(r => r.url === 'http://example.com/old');
  assert.deepEqual([old.status, old.httpStatus, old.line], ['broken', 404, 8]);
  assert.equal((await runCli(['--json', docs('faq.md')], { fetch: makeFetch(ALL_OK) })).code, 0);
});

test('cli usage and unreadable files', async () => {
  const none = await runCli([]);
  assert.equal(none.code, 2);
  assert.match(none.err, /^usage: linkcheck/);
  const missing = await runCli(['/definitely/not/here.md']);
  assert.equal(missing.code, 2);
  assert.match(missing.err, /cannot read \/definitely\/not\/here\.md/);
});

test('cli --format github', async () => {
  const fetch = makeFetch({ ...ALL_OK, 'http://example.com/old': 404 });
  const { code, out } = await runCli(['--format', 'github', docs('index.md')], { fetch });
  assert.equal(code, 1);
  const lines = out.trimEnd().split('\n');
  assert.equal(lines.length, 4);
  assert.ok(lines.every(line => line.startsWith('::error file=')), out);
  assert.match(lines[1], /,line=8,col=\d+,title=Broken link::http:\/\/example\.com\/old - 404 Not Found$/);
  assert.equal((await runCli(['--format', 'github', docs('faq.md')], { fetch: makeFetch(ALL_OK) })).out, '');
});
