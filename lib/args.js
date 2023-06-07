import { parseArgs } from 'node:util';

export class UsageError extends Error {}

export const USAGE = `usage: linkcheck [options] <file.md>...

Options:
  -t, --timeout MS     give up on a server after MS milliseconds (default: 10000)
  -c, --concurrency N  check up to N links at once (default: 8)
      --retries N      retry rate-limited or unreliable servers N times (default: 2)
  -h, --help           show this help
`;

const OPTIONS = {
  timeout: { type: 'string', short: 't' },
  concurrency: { type: 'string', short: 'c' },
  retries: { type: 'string' },
  help: { type: 'boolean', short: 'h' }
};

// A whole number option; undefined when the option was not given.
function whole(value, name, min) {
  if (value === undefined) return undefined;
  if (!/^\d+$/.test(value) || Number(value) < min) {
    throw new UsageError(`--${name} needs a ${min === 0 ? 'non-negative' : 'positive'} whole number`);
  }
  return Number(value);
}

// Only the options that were actually given are set; see options.js for defaults.
export function readArgs(argv) {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true });
  } catch (err) {
    if (typeof err.code === 'string' && err.code.startsWith('ERR_PARSE_ARGS_')) throw new UsageError(err.message);
    throw err;
  }
  const v = parsed.values;
  return {
    files: parsed.positionals,
    timeout: whole(v.timeout, 'timeout', 1),
    concurrency: whole(v.concurrency, 'concurrency', 1),
    retries: whole(v.retries, 'retries', 0),
    help: v.help ?? false
  };
}
