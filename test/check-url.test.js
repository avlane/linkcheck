import test from 'node:test';
import assert from 'node:assert/strict';
import { checkUrl } from '../lib/check-url.js';
import { makeFetch } from './helpers.js';

test('checkUrl reports a successful HEAD request', async () => {
  const fetch = makeFetch({ 'https://example.com/ok': 200 });
  assert.deepEqual(await checkUrl('https://example.com/ok', { fetch }), { url: 'https://example.com/ok', ok: true, status: 200 });
  assert.equal(fetch.calls[0].method, 'HEAD');
});

test('checkUrl reports error statuses', async () => {
  const fetch = makeFetch({ 'https://example.com/gone': 410, 'https://example.com/boom': 500 });
  assert.deepEqual(await checkUrl('https://example.com/gone', { fetch }), { url: 'https://example.com/gone', ok: false, status: 410 });
  assert.equal((await checkUrl('https://example.com/boom', { fetch })).status, 500);
  assert.equal((await checkUrl('https://example.com/unknown', { fetch })).status, 404);
});

test('checkUrl reports network failures', async () => {
  const failure = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
  const fetch = makeFetch({ 'https://nowhere.invalid/': failure, 'https://example.com/odd': new Error('boom') });
  assert.deepEqual(await checkUrl('https://nowhere.invalid/', { fetch }), { url: 'https://nowhere.invalid/', ok: false, status: null, error: 'ENOTFOUND' });
  assert.equal((await checkUrl('https://example.com/odd', { fetch })).error, 'boom');
});
