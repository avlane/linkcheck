import fs from 'node:fs';
import path from 'node:path';
import { matchesGlob } from './glob.js';

export class FileError extends Error {}

const MARKDOWN = /\.(?:md|markdown|mdown|mkd)$/i;
const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

// Expand the paths from the command line into Markdown files, in a stable order.
export function collectMarkdown(inputs, { exclude = [] } = {}) {
  const files = new Set();
  const excluded = relative => exclude.some(glob => matchesGlob(glob, relative));

  function walk(dir, root) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).toSorted(byName)) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (excluded(path.relative(root, full).split(path.sep).join('/'))) continue;
      if (entry.isDirectory()) walk(full, root);
      else if (MARKDOWN.test(entry.name)) files.add(full);
    }
  }

  for (const input of inputs) {
    if (input === '-') {
      files.add('-');
      continue;
    }
    let stat;
    try {
      stat = fs.statSync(input);
    } catch {
      throw new FileError(`cannot read ${input}`);
    }
    if (stat.isDirectory()) walk(input, input);
    else if (!excluded(input.split(path.sep).join('/'))) files.add(input);
  }
  return [...files];
}
