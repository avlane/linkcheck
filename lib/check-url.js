const HEAD_NOT_ALLOWED = new Set([400, 403, 405, 501]);

const STATUS_TEXT = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  410: 'Gone',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  501: 'Not Implemented',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout'
};

export const describeStatus = (status, statusText) => `${status} ${statusText || STATUS_TEXT[status] || ''}`.trim();

function describeError(err, timeout) {
  if (err.name === 'TimeoutError' || err.name === 'AbortError') return `timed out after ${timeout} ms`;
  const code = err.cause?.code;
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return `host not found (${code})`;
  if (code === 'ECONNREFUSED') return 'connection refused';
  if (code === 'ECONNRESET') return 'connection reset';
  return code ?? err.message;
}

async function send(fetchImpl, method, url, timeout) {
  const response = await fetchImpl(url, { method, signal: AbortSignal.timeout(timeout) });
  // The body is not needed; letting go of it frees the connection.
  response.body?.cancel().catch(() => {});
  return response;
}

// Check one URL: HEAD first, GET if the server does not like HEAD.
// Returns { url, level, status, message? } where level is ok, warning or
// broken. `fetch` is injectable for tests.
export async function checkUrl(url, { fetch: fetchImpl = globalThis.fetch, timeout = 10000 } = {}) {
  let response;
  try {
    response = await send(fetchImpl, 'HEAD', url, timeout);
    if (HEAD_NOT_ALLOWED.has(response.status)) response = await send(fetchImpl, 'GET', url, timeout);
  } catch (err) {
    return { url, level: 'broken', status: null, message: describeError(err, timeout) };
  }
  const { status } = response;
  if (status >= 200 && status < 300) return { url, level: 'ok', status };
  const message = describeStatus(status, response.statusText);
  if (status === 401 || status === 403) return { url, level: 'warning', status, message: `${message} (may need a login)` };
  return { url, level: 'broken', status, message };
}
