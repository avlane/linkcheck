import fs from 'node:fs';
import { headingAnchors } from './slug.js';

// Reads each Markdown file at most once. get(file) is the set of anchors, or
// null when the file cannot be read.
export function createAnchorIndex({ readFile = fs.readFileSync } = {}) {
  const cache = new Map();
  return {
    get(file) {
      if (!cache.has(file)) {
        let anchors = null;
        try {
          anchors = headingAnchors(readFile(file, 'utf8'));
        } catch {
          anchors = null;
        }
        cache.set(file, anchors);
      }
      return cache.get(file);
    }
  };
}
