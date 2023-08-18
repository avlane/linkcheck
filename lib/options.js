export const DEFAULTS = {
  timeout: 10000,
  concurrency: 8,
  retries: 2,
  perHost: 2,
  delay: 0,
  ignore: [],
  exclude: []
};

// Command line first, then the configuration file, then the defaults. The ignore
// and exclude patterns of the file and of the command line are added together.
export function resolveOptions(args, config = {}) {
  const options = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS)) {
    if (key === 'ignore' || key === 'exclude') continue;
    if (config[key] !== undefined) options[key] = config[key];
    if (args[key] !== undefined) options[key] = args[key];
  }
  options.ignore = [...(config.ignore ?? []), ...(args.ignore ?? [])];
  options.exclude = [...(config.exclude ?? []), ...(args.exclude ?? [])];
  for (const key of ['root', 'baseUrl']) {
    const value = args[key] ?? config[key];
    if (value !== undefined) options[key] = value;
  }
  return options;
}
