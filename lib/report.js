// Order results by file, then line, then column.
export function byLocation(a, b) {
  return a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column;
}

// Counts for a list of results.
export function summarize(results, files) {
  const count = status => results.filter(r => r.status === status).length;
  return {
    files,
    links: results.length,
    ok: count('ok'),
    warnings: count('warning'),
    broken: count('broken'),
    skipped: count('skipped')
  };
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// One line per broken link or warning (every link with verbose), then a
// summary line unless quiet.
export function formatText(results, summary, { verbose = false, quiet = false } = {}) {
  const shown = verbose ? results : results.filter(r => r.status === 'broken' || r.status === 'warning');
  const lines = shown.map(r => [`${r.file}:${r.line}:${r.column}`, r.status, r.url, r.message].filter(Boolean).join('  '));
  if (!quiet) {
    if (verbose) {
      lines.push(`${plural(summary.links, 'link')} in ${plural(summary.files, 'file')}: ` +
        `${summary.ok} ok, ${summary.warnings} warning${summary.warnings === 1 ? '' : 's'}, ` +
        `${summary.broken} broken, ${summary.skipped} skipped`);
    } else if (summary.broken === 0 && summary.warnings === 0) {
      lines.push('all links ok');
    } else {
      const parts = [];
      if (summary.broken > 0) parts.push(plural(summary.broken, 'broken link'));
      if (summary.warnings > 0) parts.push(plural(summary.warnings, 'warning'));
      lines.push(parts.join(', '));
    }
  }
  return lines.length > 0 ? lines.join('\n') + '\n' : '';
}

function escapeData(text) {
  return String(text).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

function escapeProperty(text) {
  return escapeData(text).replace(/:/g, '%3A').replace(/,/g, '%2C');
}

// GitHub Actions workflow commands, one per broken link or warning.
export function formatGithub(results) {
  return results
    .filter(r => r.status === 'broken' || r.status === 'warning')
    .map(r => {
      const level = r.status === 'broken' ? 'error' : 'warning';
      const title = r.status === 'broken' ? 'Broken link' : 'Link warning';
      const properties = `file=${escapeProperty(r.file)},line=${r.line},col=${r.column},title=${escapeProperty(title)}`;
      return `::${level} ${properties}::${escapeData(r.url ? `${r.url} - ${r.message}` : r.message)}`;
    })
    .join('\n') + (results.some(r => r.status === 'broken' || r.status === 'warning') ? '\n' : '');
}

export function formatJson(results, summary) {
  return JSON.stringify({ summary, results }, null, 2) + '\n';
}

// Exit status: 1 when there are broken links, or warnings with strict.
export function exitCode(summary, { strict = false } = {}) {
  return summary.broken > 0 || (strict && summary.warnings > 0) ? 1 : 0;
}
