#!/usr/bin/env node
import fs from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('usage: linkcheck <file.md>');
  process.exit(2);
}

const LINK = /\[[^\]]*\]\(([^)\s]+)[^)]*\)/g;
fs.readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
  for (const match of line.matchAll(LINK)) console.log(`${file}:${index + 1}  ${match[1]}`);
});
