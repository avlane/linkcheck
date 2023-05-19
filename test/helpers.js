import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';
import { run } from '../lib/cli.js';

// A fake fetch. routes maps a URL to a status number, { status, headers },
// an Error to throw, or a function (method, url, init) returning one of those.
// Unknown URLs answer 404. `calls` records what was requested.
export function makeFetch(routes = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const method = init.method ?? 'GET';
    calls.push({ url: String(url), method, init });
    const route = routes[String(url)];
    if (route === undefined) return new Response(null, { status: 404 });
    const value = typeof route === 'function' ? await route(method, String(url), init) : route;
    if (value instanceof Error) throw value;
    if (value instanceof Response) return value;
    if (typeof value === 'number') return new Response(null, { status: value });
    return new Response(null, { status: value.status, headers: value.headers });
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

// A temporary directory holding the given { 'relative/name': 'content' } files.
export function makeDir(files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'linkcheck-test-'));
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(dir, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  return dir;
}

export function removeDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

class Sink extends Writable {
  constructor() {
    super();
    this.text = '';
  }

  _write(chunk, encoding, callback) {
    this.text += chunk;
    callback();
  }
}

// Run the command in-process: { code, out, err }.
export async function runCli(args, extra = {}) {
  const stdout = new Sink();
  const stderr = new Sink();
  const code = await run(args, { stdout, stderr, ...extra });
  return { code, out: stdout.text, err: stderr.text };
}
