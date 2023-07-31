// GitHub-style anchor for a heading: lower case, punctuation removed, each
// space becomes a hyphen.
export function slugify(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

// The text of a heading as it is displayed: links keep their text; tags, code
// marks and emphasis markers are dropped.
export function plainHeading(text) {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/!?\[([^\]]*)\]\[[^\]]*\]/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*{1,3}(\S(?:.*?\S)?)\*{1,3}/g, '$1')
    .replace(/(^|[^\w])_{1,3}(\S(?:.*?\S)?)_{1,3}(?=[^\w]|$)/g, '$1$2');
}

const ATX = /^ {0,3}#{1,6}[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;
const SETEXT_UNDERLINE = /^ {0,3}(?:=+|-+)[ \t]*$/;
const NOT_A_PARAGRAPH = /^ {0,3}(?:[-*+]|\d+[.)])\s|^ {0,3}>|^ {0,3}\|/;
const HTML_ANCHOR = /<[a-z][^>]*?\b(?:id|name)\s*=\s*(?:"([^"]+)"|'([^']+)')[^>]*>/gi;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

// The set of anchors a document offers. A heading that repeats gets -1, -2, ...
export function headingAnchors(markdown) {
  const anchors = new Set();
  const seen = new Map();
  const add = text => {
    const slug = slugify(plainHeading(text));
    const count = seen.get(slug) ?? 0;
    seen.set(slug, count + 1);
    anchors.add(count === 0 ? slug : `${slug}-${count}`);
  };
  const lines = markdown.split(/\r\n|\r|\n/);
  let fence = null;
  lines.forEach((line, index) => {
    const fenceMatch = FENCE.exec(line);
    if (fence !== null) {
      if (fenceMatch !== null && fenceMatch[1][0] === fence[0] && line.trim() === fenceMatch[1]) fence = null;
      return;
    }
    if (fenceMatch !== null) {
      fence = fenceMatch[1];
      return;
    }
    for (const match of line.matchAll(HTML_ANCHOR)) anchors.add((match[1] ?? match[2]).toLowerCase());
    const atx = ATX.exec(line);
    if (atx !== null) {
      add(atx[1]);
      return;
    }
    // Setext heading: a line of text underlined with === or ---.
    const next = lines[index + 1];
    if (next !== undefined && SETEXT_UNDERLINE.test(next) && /\S/.test(line) && !SETEXT_UNDERLINE.test(line) && !NOT_A_PARAGRAPH.test(line)) {
      add(line.trim());
    }
  });
  return anchors;
}
