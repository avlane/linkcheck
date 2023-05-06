// The outcome for one link. status is ok, warning, broken or skipped.
export function makeResult(link, status, message, extra = {}) {
  const result = { file: link.file, line: link.line, column: link.column, url: link.url, kind: link.kind, status };
  if (message !== undefined) result.message = message;
  return Object.assign(result, extra);
}
