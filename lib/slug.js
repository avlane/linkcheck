// GitHub-style anchor for a heading: lower case, punctuation removed, each
// space becomes a hyphen.
export function slugify(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

const HEADING = /^ {0,3}#{1,6}[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;
const HTML_ANCHOR = /<[a-z][^>]*?\b(?:id|name)\s*=\s*(?:"([^"]+)"|'([^']+)')[^>]*>/gi;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

// The set of anchors a document offers. A heading that repeats gets -1, -2, ...
export function headingAnchors(markdown) {
  const anchors = new Set();
  const seen = new Map();
  let fence = null;
  for (const line of markdown.split(/\r\n|\r|\n/)) {
    const fenceMatch = FENCE.exec(line);
    if (fence !== null) {
      if (fenceMatch !== null && fenceMatch[1][0] === fence[0] && line.trim() === fenceMatch[1]) fence = null;
      continue;
    }
    if (fenceMatch !== null) {
      fence = fenceMatch[1];
      continue;
    }
    for (const match of line.matchAll(HTML_ANCHOR)) anchors.add((match[1] ?? match[2]).toLowerCase());
    const heading = HEADING.exec(line);
    if (heading === null) continue;
    const slug = slugify(heading[1]);
    const count = seen.get(slug) ?? 0;
    seen.set(slug, count + 1);
    anchors.add(count === 0 ? slug : `${slug}-${count}`);
  }
  return anchors;
}
