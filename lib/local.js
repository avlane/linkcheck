import fs from 'node:fs';
import path from 'node:path';
import { makeResult } from './result.js';

const MARKDOWN_FILE = /\.(?:md|markdown|mdown|mkd)$/i;

// Check a link that points into the file system: the file must exist and, for
// a Markdown file, so must the heading named by the #fragment. `anchors` is an
// anchor index; checkAnchors false skips the fragment check.
export function checkLocal(link, target, { stat = fs.statSync, anchors, checkAnchors = true, root }) {
  let file = link.file;
  let where = 'this file';
  if (target.type === 'local') {
    file = target.rootRelative
      ? path.resolve(root, target.path.replace(/^\/+/, ''))
      : path.resolve(link.dir ?? path.dirname(link.file), target.path);
    let info;
    try {
      info = stat(file);
    } catch {
      return makeResult(link, 'broken', `no such file: ${target.path}`);
    }
    if (target.fragment === '' || !checkAnchors || !info.isFile() || !MARKDOWN_FILE.test(file)) return makeResult(link, 'ok');
    where = target.path;
  }
  const fragment = target.fragment;
  if (!checkAnchors || fragment === '' || fragment.toLowerCase() === 'top') return makeResult(link, 'ok');
  const known = anchors.get(file);
  if (known === null) return makeResult(link, 'broken', `cannot read ${where === 'this file' ? link.file : target.path} to look for #${fragment}`);
  if (!known.has(fragment.toLowerCase())) return makeResult(link, 'broken', `no heading with the anchor #${fragment} in ${where}`);
  return makeResult(link, 'ok');
}
