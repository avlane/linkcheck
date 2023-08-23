function decode(text) {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

// What kind of target is this URL?
//   { type: 'external', url }              http(s) (or protocol relative)
//   { type: 'anchor', fragment }           #heading in the same file
//   { type: 'local', path, fragment }      a path relative to the file
//                                          (rootRelative: true for /path)
//   { type: 'skipped', reason }            mailto:, tel:, ftp: ...
//   { type: 'invalid', reason }            a URL that cannot be right
export function classifyLink(url) {
  const trimmed = url.trim();
  if (trimmed.startsWith('#')) return { type: 'anchor', fragment: decode(trimmed.slice(1)) };
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('//')) {
    const url = trimmed.startsWith('//') ? `https:${trimmed}` : trimmed;
    if (!URL.canParse(url)) return { type: 'invalid', reason: 'not a valid URL' };
    return { type: 'external', url };
  }
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(trimmed);
  if (scheme !== null && scheme[1].toLowerCase() === 'mailto') {
    const address = decode(trimmed.slice(7).split('?')[0]);
    if (!/^[^\s@]+@[^\s@]+$/.test(address)) return { type: 'invalid', reason: 'mailto: link without a valid email address' };
  }
  if (scheme !== null && scheme[1].length > 1) {
    return { type: 'skipped', reason: `${scheme[1].toLowerCase()}: links are not checked` };
  }
  const hash = trimmed.indexOf('#');
  const withoutFragment = hash === -1 ? trimmed : trimmed.slice(0, hash);
  const query = withoutFragment.indexOf('?');
  const pathPart = query === -1 ? withoutFragment : withoutFragment.slice(0, query);
  const local = {
    type: 'local',
    path: decode(pathPart),
    fragment: hash === -1 ? '' : decode(trimmed.slice(hash + 1))
  };
  if (pathPart.startsWith('/')) local.rootRelative = true;
  return local;
}
