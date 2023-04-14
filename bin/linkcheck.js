#!/usr/bin/env node
import fs from 'node:fs';
import { extractLinks } from '../lib/extract.js';

const file = process.argv[2];
if (!file) {
  console.error('usage: linkcheck <file.md>');
  process.exit(2);
}

for (const link of extractLinks(fs.readFileSync(file, 'utf8'))) {
  console.log(`${file}:${link.line}:${link.column}  ${link.kind}  ${link.url}`);
}
