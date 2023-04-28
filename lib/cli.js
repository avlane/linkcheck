import fs from 'node:fs';
import { checkUrl } from './check-url.js';
import { extractLinks } from './extract.js';

const USAGE = 'usage: linkcheck <file.md>...\n';

// io is { stdout, stderr, fetch? }. Resolves to the exit status.
export async function run(argv, io) {
  const files = argv.filter(arg => !arg.startsWith('-'));
  if (files.length === 0) {
    io.stderr.write(USAGE);
    return 2;
  }
  let broken = 0;
  for (const file of files) {
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      io.stderr.write(`linkcheck: cannot read ${file}\n`);
      return 2;
    }
    for (const link of extractLinks(text).links) {
      if (!/^https?:\/\//i.test(link.url)) continue;
      const result = await checkUrl(link.url, { fetch: io.fetch });
      if (!result.ok) {
        broken++;
        io.stdout.write(`${file}:${link.line}:${link.column}  broken  ${link.url}  ${result.status ?? result.error}\n`);
      }
    }
  }
  io.stdout.write(broken === 0 ? 'all links ok\n' : `${broken} broken link${broken === 1 ? '' : 's'}\n`);
  return broken === 0 ? 0 : 1;
}
