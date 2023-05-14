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
