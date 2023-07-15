import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ResultCache } from '../lib/cache.js';
import { makeDir, removeDir } from './helpers.js';

const HOUR = 3600 * 1000;

test('ResultCache remembers ok results and writes them to disk', () => {
  const dir = makeDir();
  try {
    const file = path.join(dir, 'cache.json');
    let time = 1_000_000;
    const cache = new ResultCache(file, { now: () => time });
    assert.equal(cache.get('https://example.com/a'), undefined);
    cache.set('https://example.com/a', { level: 'ok', status: 200 });
    assert.deepEqual(cache.get('https://example.com/a'), { url: 'https://example.com/a', level: 'ok', status: 200, cached: true });
    cache.save();

    const again = new ResultCache(file, { now: () => time + HOUR });
    assert.equal(again.get('https://example.com/a').status, 200);
  } finally {
    removeDir(dir);
  }
});

test('ResultCache entries expire after the ttl', () => {
  const dir = makeDir();
  try {
    const file = path.join(dir, 'cache.json');
    let time = 0;
    const cache = new ResultCache(file, { ttlHours: 2, now: () => time });
    cache.set('https://example.com/a', { level: 'ok', status: 200 });
    time = 2 * HOUR;
    assert.ok(cache.get('https://example.com/a'));
    time = 2 * HOUR + 1;
    assert.equal(cache.get('https://example.com/a'), undefined);
    cache.save();
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).entries, {});
  } finally {
    removeDir(dir);
  }
});

test('ResultCache never stores warnings or failures and forgets a link that stopped working', () => {
  const dir = makeDir();
  try {
    const cache = new ResultCache(path.join(dir, 'cache.json'), { now: () => 0 });
    cache.set('https://example.com/a', { level: 'warning', status: 301 });
    cache.set('https://example.com/b', { level: 'broken', status: 404 });
    assert.equal(cache.get('https://example.com/a'), undefined);
    assert.equal(cache.get('https://example.com/b'), undefined);
    cache.set('https://example.com/c', { level: 'ok', status: 200 });
    cache.set('https://example.com/c', { level: 'broken', status: 500 });
    assert.equal(cache.get('https://example.com/c'), undefined);
  } finally {
    removeDir(dir);
  }
});

test('ResultCache ignores a damaged or foreign cache file', () => {
  const dir = makeDir({ 'broken.json': '{oops', 'other.json': '{"version": 2, "entries": {}}', 'odd.json': '{"version": 1, "entries": {"https://x/": {"status": "no"}}}' });
  try {
    for (const name of ['broken.json', 'other.json', 'odd.json', 'missing.json']) {
      const cache = new ResultCache(path.join(dir, name));
      assert.equal(cache.entries.size, 0, name);
    }
  } finally {
    removeDir(dir);
  }
});

test('ResultCache only writes when something changed', () => {
  const dir = makeDir();
  try {
    const file = path.join(dir, 'cache.json');
    const cache = new ResultCache(file);
    cache.save();
    assert.equal(fs.existsSync(file), false);
    cache.set('https://example.com/a', { level: 'ok', status: 200 });
    cache.save();
    assert.equal(fs.existsSync(file), true);
  } finally {
    removeDir(dir);
  }
});
