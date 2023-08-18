import fs from 'node:fs';
import path from 'node:path';
import { createAnchorIndex } from './anchors.js';
import { USAGE, UsageError, readArgs } from './args.js';
import { ResultCache } from './cache.js';
import { CONFIG_NAME, compileIgnore, loadConfig } from './config.js';
import { extractLinks } from './extract.js';
import { FileError, collectMarkdown } from './files.js';
import { HostLimiter } from './limiter.js';
import { resolveOptions } from './options.js';
import { byLocation, exitCode, formatGithub, formatJson, formatText, summarize } from './report.js';
import { checkLinks } from './runner.js';

// A "checked N/M links" counter on stderr, only when stderr is a terminal and
// the report goes to stdout as text.
function makeProgress(io, args, total) {
  const enabled = Boolean(io.stderr.isTTY) && args.format === 'text' && !args.quiet && total > 0;
  let done = 0;
  return {
    tick() {
      done++;
      if (enabled) io.stderr.write(`\rchecked ${done}/${total} links`);
    },
    finish() {
      if (enabled) io.stderr.write('\r\u001b[K');
    }
  };
}

// io is { stdout, stderr, fetch?, sleep?, now?, cwd? }. Resolves to the exit status.
export async function run(argv, io) {
  let args;
  try {
    args = readArgs(argv);
  } catch (err) {
    if (!(err instanceof UsageError)) throw err;
    io.stderr.write(`linkcheck: ${err.message}\n`);
    return 2;
  }
  if (args.help) {
    io.stdout.write(USAGE);
    return 0;
  }
  if (args.files.length === 0) {
    io.stderr.write(USAGE);
    return 2;
  }
  const cwd = io.cwd ?? process.cwd();
  let settings;
  let ignore;
  try {
    const config = args.noConfig ? {} : loadConfig(args.config ?? path.join(cwd, CONFIG_NAME), { required: args.config !== undefined });
    settings = resolveOptions(args, config);
    ignore = compileIgnore(settings.ignore);
  } catch (err) {
    if (!(err instanceof UsageError)) throw err;
    io.stderr.write(`linkcheck: ${err.message}\n`);
    return 2;
  }
  const cache = args.cache
    ? new ResultCache(path.resolve(cwd, args.cacheFile ?? '.linkcheck-cache.json'), { ttlHours: args.cacheTtl ?? 24, now: io.now })
    : undefined;
  const options = {
    cache,
    now: io.now,
    checkAnchors: !args.noAnchors,
    root: settings.root === undefined ? undefined : path.resolve(cwd, settings.root),
    baseUrl: settings.baseUrl,
    ignore,
    fetch: io.fetch,
    sleep: io.sleep,
    timeout: settings.timeout,
    concurrency: settings.concurrency,
    retries: settings.retries,
    limiter: new HostLimiter({ perHost: settings.perHost, delay: settings.delay, sleep: io.sleep }),
    anchors: createAnchorIndex()
  };
  let files;
  try {
    files = collectMarkdown(args.files, { exclude: settings.exclude });
  } catch (err) {
    if (!(err instanceof FileError)) throw err;
    io.stderr.write(`linkcheck: ${err.message}\n`);
    return 2;
  }
  const results = [];
  const links = [];
  for (const file of files) {
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      io.stderr.write(`linkcheck: cannot read ${file}\n`);
      return 2;
    }
    const extracted = extractLinks(text);
    for (const problem of extracted.problems) {
      results.push({ file, line: problem.line, column: problem.column, url: '', kind: 'reference', status: 'broken', message: problem.message });
    }
    links.push(...extracted.links.map(link => ({ ...link, file })));
  }
  const progress = makeProgress(io, args, links.length);
  results.push(...await checkLinks(links, { ...options, onProgress: progress.tick }));
  progress.finish();
  cache?.save();
  const sorted = results.toSorted(byLocation);
  const summary = summarize(sorted, files.length);
  const formats = {
    text: (list, counts) => formatText(list, counts, { verbose: args.verbose, quiet: args.quiet }),
    json: formatJson,
    github: formatGithub
  };
  io.stdout.write(formats[args.format](sorted, summary));
  return exitCode(summary, { strict: args.strict });
}
