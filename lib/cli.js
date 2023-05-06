import fs from 'node:fs';
import { createAnchorIndex } from './anchors.js';
import { extractLinks } from './extract.js';
import { checkLinks } from './runner.js';

const USAGE = 'usage: linkcheck <file.md>...\n';

// io is { stdout, stderr, fetch? }. Resolves to the exit status.
export async function run(argv, io) {
  const files = argv.filter(arg => !arg.startsWith('-'));
  if (files.length === 0) {
    io.stderr.write(USAGE);
    return 2;
  }
  const anchors = createAnchorIndex();
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
    const checked = await checkLinks(links.map(link => ({ ...link, file })), { fetch: io.fetch, anchors });
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
