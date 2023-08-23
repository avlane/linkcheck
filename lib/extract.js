const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const DEFINITION = /^ {0,3}\[((?:[^\]\\]|\\.)+)\]:\s*(<[^>]*>|\S+)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*$/;
const REFERENCE_USE = /\[((?:[^[\]\\]|\\.)*)\]\[((?:[^[\]\\]|\\.)*)\]/g;
const AUTOLINK = /<((?:https?|ftp|mailto):[^\s<>]*)>/gi;
const BARE_URL = /https?:\/\/[^\s<>"'`]+/gi;
const HTML_TAG = /<(?:a|img|link|source|iframe|video|audio|script)\b[^>]*>/gi;
const HTML_ATTRIBUTE = /\b(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;

// Labels are matched ignoring case and runs of whitespace.
const labelKey = label => label.trim().replace(/\s+/g, ' ').toLowerCase();

// Blank out [start, end) ranges so later scans do not see them again.
function blank(text, spans) {
  let out = text;
  for (const { start, end } of spans) out = out.slice(0, start) + ' '.repeat(end - start) + out.slice(end);
  return out;
}

// A URL found in running text can end with punctuation that belongs to the
// sentence, and with a ")" that closes a parenthesis opened before the URL.
function trimBare(url) {
  let end = url.length;
  while (end > 0) {
    const last = url[end - 1];
    if ('.,;:!?*\'"]}'.includes(last)) {
      end--;
    } else if (last === ')' && !url.slice(0, end).includes('(')) {
      end--;
    } else {
      break;
    }
  }
  return url.slice(0, end);
}

// Replace inline code spans by spaces so links inside them are not seen,
// without moving anything else on the line.
function blankCode(line) {
  return line.replace(/(`+)(.+?)\1/g, match => ' '.repeat(match.length));
}

// The index of the "[" that belongs to the "]" at closeIndex, or -1.
function findOpenBracket(text, closeIndex) {
  let depth = 0;
  for (let i = closeIndex; i >= 0; i--) {
    if (i > 0 && text[i - 1] === '\\') continue;
    if (text[i] === ']') {
      depth++;
    } else if (text[i] === '[') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

const isSpace = c => c === ' ' || c === '\t';

// Parse what follows "](" in an inline link: the destination, an optional
// title and the closing ")". Returns null when the link does not end on this line.
function readDestination(text, start) {
  let i = start;
  while (isSpace(text[i])) i++;
  let url;
  let urlStart;
  if (text[i] === '<') {
    const close = text.indexOf('>', i + 1);
    if (close === -1) return null;
    urlStart = i + 1;
    url = text.slice(urlStart, close);
    i = close + 1;
  } else {
    urlStart = i;
    let depth = 0;
    for (; i < text.length; i++) {
      const c = text[i];
      if (isSpace(c)) break;
      if (c === '(') {
        depth++;
      } else if (c === ')') {
        if (depth === 0) break;
        depth--;
      } else if (c === '\\' && i + 1 < text.length) {
        i++;
      }
    }
    url = text.slice(urlStart, i);
  }
  while (isSpace(text[i])) i++;
  if (text[i] === '"' || text[i] === "'" || text[i] === '(') {
    const closer = text[i] === '(' ? ')' : text[i];
    const close = text.indexOf(closer, i + 1);
    if (close === -1) return null;
    i = close + 1;
    while (isSpace(text[i])) i++;
  }
  if (text[i] !== ')') return null;
  return { url, urlStart, end: i + 1 };
}

// Every link and image in a Markdown document, with 1-based line and column.
// Returns { links: [{ url, line, column, kind }], problems: [{ line, column,
// message }] } where kind is link, image, reference (a [label]: url
// definition), autolink, html (an href or src attribute) or bare. Links that
// continue over several lines are not recognised.
export function extractLinks(markdown) {
  const links = [];
  const uses = [];
  const defined = new Set();
  let fence = null;
  markdown.split(/\r\n|\r|\n/).forEach((raw, index) => {
    const fenceMatch = FENCE.exec(raw);
    if (fence !== null) {
      if (fenceMatch !== null && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length && raw.trim() === fenceMatch[1]) {
        fence = null;
      }
      return;
    }
    if (fenceMatch !== null) {
      fence = fenceMatch[1];
      return;
    }
    const definition = DEFINITION.exec(raw);
    if (definition !== null && !definition[1].startsWith('^')) {
      const url = definition[2].startsWith('<') ? definition[2].slice(1, -1) : definition[2];
      defined.add(labelKey(definition[1]));
      if (url !== '') links.push({ url, line: index + 1, column: raw.indexOf(definition[2], definition[0].indexOf(']:')) + 1, kind: 'reference' });
      return;
    }
    const text = blankCode(raw);
    const spans = [];
    for (let i = text.indexOf(']('); i !== -1; i = text.indexOf('](', i + 2)) {
      const destination = readDestination(text, i + 2);
      if (destination === null || destination.url === '') continue;
      const open = findOpenBracket(text, i);
      const image = open > 0 && text[open - 1] === '!';
      links.push({ url: destination.url, line: index + 1, column: destination.urlStart + 1, kind: image ? 'image' : 'link' });
      spans.push({ start: open === -1 ? i : open, end: destination.end });
    }
    for (const match of text.matchAll(REFERENCE_USE)) {
      const label = match[2] === '' ? match[1] : match[2];
      if (!label.startsWith('^')) uses.push({ key: labelKey(label), label, line: index + 1, column: match.index + 1 });
    }
    let rest = blank(text, spans);
    const tags = [];
    for (const tag of rest.matchAll(HTML_TAG)) {
      for (const attribute of tag[0].matchAll(HTML_ATTRIBUTE)) {
        const url = (attribute[1] ?? attribute[2]).trim();
        if (url === '') continue;
        const offset = tag.index + attribute.index + attribute[0].indexOf(attribute[1] ?? attribute[2]);
        links.push({ url, line: index + 1, column: offset + 1, kind: 'html' });
      }
      tags.push({ start: tag.index, end: tag.index + tag[0].length });
    }
    rest = blank(rest, tags);
    const autolinks = [];
    for (const match of rest.matchAll(AUTOLINK)) {
      links.push({ url: match[1], line: index + 1, column: match.index + 2, kind: 'autolink' });
      autolinks.push({ start: match.index, end: match.index + match[0].length });
    }
    rest = blank(rest, autolinks);
    for (const match of rest.matchAll(BARE_URL)) {
      const url = trimBare(match[0]);
      links.push({ url, line: index + 1, column: match.index + 1, kind: 'bare' });
    }
  });
  const problems = uses
    .filter(use => !defined.has(use.key))
    .map(use => ({ line: use.line, column: use.column, message: `no definition for the reference [${use.label}]` }));
  links.sort((a, b) => a.line - b.line || a.column - b.column);
  return { links, problems };
}
