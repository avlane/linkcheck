import test from 'node:test';
import assert from 'node:assert/strict';
import { HostLimiter } from '../lib/limiter.js';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

test('HostLimiter limits parallel tasks per host', async () => {
  const limiter = new HostLimiter({ perHost: 2 });
  let active = 0;
  let peak = 0;
  const task = async () => {
    active++;
    peak = Math.max(peak, active);
    await sleep(5);
    active--;
  };
  await Promise.all(Array.from({ length: 8 }, () => limiter.run('example.com', task)));
  assert.equal(peak, 2);
});

test('HostLimiter hosts do not wait for each other', async () => {
  const limiter = new HostLimiter({ perHost: 1 });
  let active = 0;
  let peak = 0;
  const task = async () => {
    active++;
    peak = Math.max(peak, active);
    await sleep(10);
    active--;
  };
  await Promise.all(['a.example', 'b.example', 'c.example'].map(host => limiter.run(host, task)));
  assert.equal(peak, 3);
});

test('HostLimiter returns the result and passes errors on', async () => {
  const limiter = new HostLimiter({ perHost: 1 });
  assert.equal(await limiter.run('h', async () => 42), 42);
  await assert.rejects(limiter.run('h', async () => { throw new Error('boom'); }), /boom/);
  assert.equal(await limiter.run('h', async () => 'still works'), 'still works');
});

test('HostLimiter starts tasks for one host at least `delay` apart', async () => {
  const sleeps = [];
  const limiter = new HostLimiter({ perHost: 3, delay: 100, now: () => 0, sleep: async ms => { sleeps.push(ms); } });
  await Promise.all([1, 2, 3, 4].map(() => limiter.run('h', async () => {})));
  assert.deepEqual(sleeps, [100, 200, 300]);
  const other = [];
  const second = new HostLimiter({ delay: 50, now: () => 0, sleep: async ms => { other.push(ms); } });
  await Promise.all([second.run('a', async () => {}), second.run('b', async () => {})]);
  assert.deepEqual(other, []);
});

test('HostLimiter runs tasks for a host in the order they were queued', async () => {
  const limiter = new HostLimiter({ perHost: 1 });
  const order = [];
  await Promise.all([1, 2, 3].map(n => limiter.run('h', async () => { order.push(n); })));
  assert.deepEqual(order, [1, 2, 3]);
});
