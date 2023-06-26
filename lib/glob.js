// Turn a glob into an anchored regular expression over "/"-separated paths.
export function globToRegExp(glob) {
  let source = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') {
          i++;
          source += '(?:.*/)?';
        } else {
          source += '.*';
        }
      } else {
        source += '[^/]*';
      }
    } else if (c === '?') {
      source += '[^/]';
    } else {
      source += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${source}$`);
}

// Does the glob match this path? Patterns without a slash look at the last
// segment only; others at the whole relative path.
export function matchesGlob(glob, relativePath) {
  const target = glob.includes('/') ? relativePath : relativePath.slice(relativePath.lastIndexOf('/') + 1);
  return globToRegExp(glob).test(target);
}
