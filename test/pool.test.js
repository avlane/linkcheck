import test from 'node:test';
import assert from 'node:assert/strict';
import { mapLimit } from '../lib/pool.js';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

test('mapLimit keeps the order of the input', async () => {
  const results = await mapLimit([30, 5, 15, 1], 2, async ms => {
    await sleep(ms);
    return ms * 2;
  });
  assert.deepEqual(results, [60, 10, 30, 2]);
});

test('mapLimit never runs more than the limit at once', async () => {
  let active = 0;
  let peak = 0;
  await mapLimit(new Array(12).fill(0), 3, async () => {
    active++;
    peak = Math.max(peak, active);
    await sleep(5);
    active--;
  });
  assert.equal(peak, 3);
});

test('mapLimit handles empty input and big limits', async () => {
  assert.deepEqual(await mapLimit([], 4, async x => x), []);
  assert.deepEqual(await mapLimit([1, 2], 100, async x => x + 1), [2, 3]);
});

test('mapLimit passes the index', async () => {
  assert.deepEqual(await mapLimit(['a', 'b'], 1, async (item, index) => `${index}${item}`), ['0a', '1b']);
});
