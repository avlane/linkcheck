import fs from 'node:fs';
import path from 'node:path';
import { makeResult } from './result.js';

// Check a link that points into the file system. `anchors` is an anchor index.
export function checkLocal(link, target, { stat = fs.statSync, anchors }) {
  if (target.type === 'local') {
    const resolved = path.resolve(path.dirname(link.file), target.path);
    try {
      stat(resolved);
    } catch {
      return makeResult(link, 'broken', `no such file: ${target.path}`);
    }
    return makeResult(link, 'ok');
  }
  const fragment = target.fragment;
  if (fragment === '' || fragment.toLowerCase() === 'top') return makeResult(link, 'ok');
  const known = anchors.get(link.file);
  if (known === null) return makeResult(link, 'broken', `cannot read ${link.file} to look for #${fragment}`);
  if (!known.has(fragment.toLowerCase())) return makeResult(link, 'broken', `no heading with the anchor #${fragment} in this file`);
  return makeResult(link, 'ok');
}
