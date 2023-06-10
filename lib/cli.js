import fs from 'node:fs';
import { createAnchorIndex } from './anchors.js';
import { USAGE, UsageError, readArgs } from './args.js';
import { extractLinks } from './extract.js';
import { HostLimiter } from './limiter.js';
import { resolveOptions } from './options.js';
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
  const settings = resolveOptions(args);
  const options = {
    fetch: io.fetch,
    sleep: io.sleep,
    timeout: settings.timeout,
    concurrency: settings.concurrency,
    retries: settings.retries,
    limiter: new HostLimiter({ perHost: settings.perHost, delay: settings.delay, sleep: io.sleep }),
    anchors: createAnchorIndex()
  };
  const results = [];
  for (const file of args.files) {
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
  const broken = results.filter(r => r.status === 'broken');
  for (const r of broken) {
    io.stdout.write(`${r.file}:${r.line}:${r.column}  broken  ${r.url ? r.url + '  ' : ''}${r.message}\n`);
  }
  io.stdout.write(broken.length === 0 ? 'all links ok\n' : `${broken.length} broken link${broken.length === 1 ? '' : 's'}\n`);
  return broken.length === 0 ? 0 : 1;
}
