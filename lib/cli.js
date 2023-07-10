import fs from 'node:fs';
import { createAnchorIndex } from './anchors.js';
import path from 'node:path';
import { USAGE, UsageError, readArgs } from './args.js';
import { CONFIG_NAME, compileIgnore, loadConfig } from './config.js';
import { extractLinks } from './extract.js';
import { FileError, collectMarkdown } from './files.js';
import { HostLimiter } from './limiter.js';
import { resolveOptions } from './options.js';
import { exitCode, formatGithub, formatJson, formatText, summarize } from './report.js';
import { checkLinks } from './runner.js';

// io is { stdout, stderr, fetch?, sleep? }. Resolves to the exit status.
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
  let settings;
  let ignore;
  try {
    const cwd = io.cwd ?? process.cwd();
    const config = args.noConfig ? {} : loadConfig(args.config ?? path.join(cwd, CONFIG_NAME), { required: args.config !== undefined });
    settings = resolveOptions(args, config);
    ignore = compileIgnore(settings.ignore);
  } catch (err) {
    if (!(err instanceof UsageError)) throw err;
    io.stderr.write(`linkcheck: ${err.message}\n`);
    return 2;
  }
  const options = {
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
  for (const file of files) {
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      io.stderr.write(`linkcheck: cannot read ${file}\n`);
      return 2;
    }
    const { links, problems } = extractLinks(text);
    for (const problem of problems) {
      results.push({ file, line: problem.line, column: problem.column, url: '', kind: 'reference', status: 'broken', message: problem.message });
    }
    const checked = await checkLinks(links.map(link => ({ ...link, file })), options);
    results.push(...checked);
  }
  results.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column);
  const summary = summarize(results, files.length);
  const formats = { text: formatText, json: formatJson, github: formatGithub };
  io.stdout.write(formats[args.format](results, summary));
  return exitCode(summary, { strict: args.strict });
}
