import test from 'node:test';
import assert from 'node:assert/strict';
import { checkUrl } from '../lib/check-url.js';
import { makeFetch } from './helpers.js';

test('checkUrl reports a successful HEAD request', async () => {
  const fetch = makeFetch({ 'https://example.com/ok': 200 });
  assert.deepEqual(await checkUrl('https://example.com/ok', { fetch }), { url: 'https://example.com/ok', level: 'ok', status: 200 });
  assert.deepEqual(fetch.calls.map(call => call.method), ['HEAD']);
});

test('checkUrl reports error statuses with their names', async () => {
  const fetch = makeFetch({ 'https://example.com/gone': 410, 'https://example.com/boom': 500, 'https://example.com/odd': 418 });
  assert.deepEqual(await checkUrl('https://example.com/gone', { fetch }), {
    url: 'https://example.com/gone', level: 'broken', status: 410, message: '410 Gone'
  });
  assert.equal((await checkUrl('https://example.com/boom', { fetch })).message, '500 Internal Server Error');
  assert.equal((await checkUrl('https://example.com/unknown', { fetch })).message, '404 Not Found');
  assert.equal((await checkUrl('https://example.com/odd', { fetch })).message, '418');
});

test('checkUrl tries GET when HEAD is refused', async () => {
  const fetch = makeFetch({
    'https://example.com/picky': (method) => (method === 'HEAD' ? 405 : 200),
    'https://example.com/really-405': 405
  });
  assert.equal((await checkUrl('https://example.com/picky', { fetch })).level, 'ok');
  assert.deepEqual(fetch.calls.map(call => call.method), ['HEAD', 'GET']);
  const still = await checkUrl('https://example.com/really-405', { fetch });
  assert.equal(still.level, 'broken');
  assert.equal(still.message, '405 Method Not Allowed');
});

test('checkUrl does not retry a plain 404 with GET', async () => {
  const fetch = makeFetch({});
  await checkUrl('https://example.com/missing', { fetch });
  assert.equal(fetch.calls.length, 1);
});

test('checkUrl 401 and 403 are warnings', async () => {
  const fetch = makeFetch({ 'https://example.com/private': 401, 'https://example.com/locked': 403 });
  const unauthorized = await checkUrl('https://example.com/private', { fetch });
  assert.equal(unauthorized.level, 'warning');
  assert.equal(unauthorized.message, '401 Unauthorized (may need a login)');
  const forbidden = await checkUrl('https://example.com/locked', { fetch });
  assert.equal(forbidden.level, 'warning');
  assert.deepEqual(fetch.calls.map(call => call.method), ['HEAD', 'HEAD', 'GET']);
});

test('checkUrl describes network failures', async () => {
  const failure = code => Object.assign(new TypeError('fetch failed'), { cause: { code } });
  const fetch = makeFetch({
    'https://a.invalid/': failure('ENOTFOUND'),
    'https://b.invalid/': failure('ECONNREFUSED'),
    'https://c.invalid/': failure('ECONNRESET'),
    'https://d.invalid/': failure('CERT_HAS_EXPIRED'),
    'https://e.invalid/': new Error('boom')
  });
  const messages = [];
  for (const host of 'abcde') messages.push((await checkUrl(`https://${host}.invalid/`, { fetch })).message);
  assert.deepEqual(messages, ['host not found (ENOTFOUND)', 'connection refused', 'connection reset', 'CERT_HAS_EXPIRED', 'boom']);
});

const redirect = (status, to) => ({ status, headers: { location: to } });

test('checkUrl follows redirects and sends redirect: manual', async () => {
  const fetch = makeFetch({
    'https://example.com/a': redirect(302, '/b'),
    'https://example.com/b': redirect(307, 'https://example.com/c'),
    'https://example.com/c': 200
  });
  const result = await checkUrl('https://example.com/a', { fetch });
  assert.equal(result.level, 'ok');
  assert.deepEqual(result.redirects.map(hop => [hop.status, hop.to]), [[302, 'https://example.com/b'], [307, 'https://example.com/c']]);
  assert.ok(fetch.calls.every(call => call.init.redirect === 'manual'));
});

test('checkUrl a permanent redirect is a warning that names the new address', async () => {
  const fetch = makeFetch({
    'http://example.com/old': redirect(301, 'https://example.com/new'),
    'https://example.com/new': 200,
    'https://example.com/moved': redirect(308, '/new-home'),
    'https://example.com/new-home': 200
  });
  const first = await checkUrl('http://example.com/old', { fetch });
  assert.equal(first.level, 'warning');
  assert.equal(first.message, 'moved permanently to https://example.com/new');
  assert.equal(first.finalUrl, 'https://example.com/new');
  assert.equal((await checkUrl('https://example.com/moved', { fetch })).message, 'moved permanently to https://example.com/new-home');
});

test('checkUrl a redirect to a missing page is broken', async () => {
  const fetch = makeFetch({ 'https://example.com/a': redirect(302, '/gone'), 'https://example.com/gone': 404 });
  const result = await checkUrl('https://example.com/a', { fetch });
  assert.equal(result.level, 'broken');
  assert.equal(result.message, '404 Not Found');
  assert.equal(result.redirects.length, 1);
});

test('checkUrl redirect loops, long chains and missing locations', async () => {
  const fetch = makeFetch({
    'https://example.com/loop1': redirect(302, '/loop2'),
    'https://example.com/loop2': redirect(302, '/loop1'),
    'https://example.com/n0': redirect(302, '/n1'),
    'https://example.com/n1': redirect(302, '/n2'),
    'https://example.com/n2': redirect(302, '/n3'),
    'https://example.com/n3': 200,
    'https://example.com/nowhere': 302,
    'https://example.com/bad': redirect(302, 'http://[oops')
  });
  assert.equal((await checkUrl('https://example.com/loop1', { fetch })).message, 'redirect loop (https://example.com/loop1)');
  assert.equal((await checkUrl('https://example.com/n0', { fetch, maxRedirects: 2 })).message, 'more than 2 redirects');
  assert.equal((await checkUrl('https://example.com/n0', { fetch, maxRedirects: 3 })).level, 'ok');
  assert.equal((await checkUrl('https://example.com/nowhere', { fetch })).message, '302 without a Location header');
  assert.match((await checkUrl('https://example.com/bad', { fetch })).message, /^redirect to an invalid address/);
});

test('checkUrl falls back to GET after a redirect to a picky server', async () => {
  const fetch = makeFetch({
    'https://example.com/a': redirect(301, 'https://picky.example.com/page'),
    'https://picky.example.com/page': method => (method === 'HEAD' ? 405 : 200)
  });
  const result = await checkUrl('https://example.com/a', { fetch });
  assert.equal(result.level, 'warning');
  assert.deepEqual(fetch.calls.map(call => call.method), ['HEAD', 'HEAD', 'GET', 'GET']);
});

test('checkUrl passes an abort signal and reports a timeout', async () => {
  const fetch = makeFetch({
    'https://slow.example.com/': (method, url, init) => new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason));
    })
  });
  const result = await checkUrl('https://slow.example.com/', { fetch, timeout: 20 });
  assert.deepEqual(result, { url: 'https://slow.example.com/', level: 'broken', status: null, message: 'timed out after 20 ms' });
  assert.ok(fetch.calls[0].init.signal instanceof AbortSignal);
});
