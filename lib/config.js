import fs from 'node:fs';
import { UsageError } from './args.js';

export const CONFIG_NAME = '.linkcheckrc.json';

const NUMBERS = { timeout: 1, concurrency: 1, retries: 0, perHost: 1, delay: 0 };
const LISTS = ['ignore'];

// Read the options file. A missing file is fine unless it was asked for by name.
export function loadConfig(file, { required = false } = {}) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT' && !required) return {};
    throw new UsageError(`cannot read the configuration file ${file}`);
  }
  let config;
  try {
    config = JSON.parse(text);
  } catch {
    throw new UsageError(`${file} is not valid JSON`);
  }
  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    throw new UsageError(`${file} must contain a JSON object`);
  }
  for (const [key, value] of Object.entries(config)) {
    if (Object.hasOwn(NUMBERS, key)) {
      if (!Number.isInteger(value) || value < NUMBERS[key]) {
        throw new UsageError(`${file}: "${key}" must be a whole number of at least ${NUMBERS[key]}`);
      }
    } else if (LISTS.includes(key)) {
      if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) {
        throw new UsageError(`${file}: "${key}" must be a list of strings`);
      }
    } else {
      throw new UsageError(`${file}: unknown setting "${key}"`);
    }
  }
  return config;
}

// A function that says whether a link matches one of the ignore patterns.
export function compileIgnore(patterns) {
  const expressions = patterns.map(pattern => {
    try {
      return new RegExp(pattern);
    } catch {
      throw new UsageError(`bad ignore pattern: ${pattern}`);
    }
  });
  return url => expressions.some(expression => expression.test(url));
}
