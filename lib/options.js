export const DEFAULTS = {
  timeout: 10000,
  concurrency: 8,
  retries: 2
};

// Values given on the command line win over the defaults. Unset ones are undefined.
export function resolveOptions(args) {
  const options = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS)) {
    if (args[key] !== undefined) options[key] = args[key];
  }
  return options;
}
