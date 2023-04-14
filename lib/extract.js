const FENCE = /^ {0,3}(`{3,}|~{3,})/;

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

// Every link and image in a Markdown document: [{ url, line, column, kind }]
// with 1-based line and column. Links that continue over several lines are
// not recognised.
export function extractLinks(markdown) {
  const links = [];
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
    const text = blankCode(raw);
    for (let i = text.indexOf(']('); i !== -1; i = text.indexOf('](', i + 2)) {
      const destination = readDestination(text, i + 2);
      if (destination === null || destination.url === '') continue;
      const open = findOpenBracket(text, i);
      const image = open > 0 && text[open - 1] === '!';
      links.push({ url: destination.url, line: index + 1, column: destination.urlStart + 1, kind: image ? 'image' : 'link' });
    }
  });
  return links;
}
