import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadConfig, compileIgnore, CONFIG_NAME } from '../lib/config.js';
import { UsageError } from '../lib/args.js';
import { makeDir, removeDir } from './helpers.js';

const withConfig = (content, fn) => {
  const dir = makeDir(content === undefined ? {} : { [CONFIG_NAME]: content });
  try {
    return fn(path.join(dir, CONFIG_NAME));
  } finally {
    removeDir(dir);
  }
};

test('loadConfig reads known settings', () => {
  const config = withConfig('{"timeout": 5000, "concurrency": 4, "retries": 0, "perHost": 1, "delay": 200, "ignore": ["^https://localhost"], "exclude": ["CHANGELOG.md"]}', loadConfig);
  assert.deepEqual(config, {
    timeout: 5000, concurrency: 4, retries: 0, perHost: 1, delay: 200, ignore: ['^https://localhost'], exclude: ['CHANGELOG.md']
  });
});

test('loadConfig a missing file is fine unless required', () => {
  withConfig(undefined, file => {
    assert.deepEqual(loadConfig(file), {});
    assert.throws(() => loadConfig(file, { required: true }), /cannot read the configuration file/);
  });
});

test('loadConfig explains what is wrong', () => {
  withConfig('{oops', file => assert.throws(() => loadConfig(file), /is not valid JSON/));
  withConfig('[]', file => assert.throws(() => loadConfig(file), /must contain a JSON object/));
  withConfig('{"timout": 5}', file => assert.throws(() => loadConfig(file), /unknown setting "timout"/));
  withConfig('{"timeout": "5"}', file => assert.throws(() => loadConfig(file), /"timeout" must be a whole number of at least 1/));
  withConfig('{"retries": -1}', file => assert.throws(() => loadConfig(file), /"retries" must be a whole number of at least 0/));
  withConfig('{"ignore": "x"}', file => assert.throws(() => loadConfig(file), /"ignore" must be a list of strings/));
  withConfig('{"toString": 1}', file => assert.throws(() => loadConfig(file), UsageError));
});

test('compileIgnore matches links against the patterns', () => {
  const ignored = compileIgnore(['^https://localhost', 'internal\\.example\\.com']);
  assert.equal(ignored('https://localhost:3000/x'), true);
  assert.equal(ignored('https://wiki.internal.example.com/page'), true);
  assert.equal(ignored('https://example.com/'), false);
  assert.equal(compileIgnore([])('anything'), false);
});

test('compileIgnore rejects bad patterns', () => {
  assert.throws(() => compileIgnore(['(']), /bad ignore pattern: \(/);
});
