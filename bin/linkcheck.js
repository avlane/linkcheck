#!/usr/bin/env node
import { run } from '../lib/cli.js';

run(process.argv.slice(2), { stdout: process.stdout, stderr: process.stderr }).then(code => {
  process.exitCode = code;
});
