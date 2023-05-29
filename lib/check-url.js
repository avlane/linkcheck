const HEAD_NOT_ALLOWED = new Set([400, 403, 405, 501]);
const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const PERMANENT = new Set([301, 308]);

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
  const response = await fetchImpl(url, { method, redirect: 'manual', signal: AbortSignal.timeout(timeout) });
  // The body is not needed; letting go of it frees the connection.
  response.body?.cancel().catch(() => {});
  return response;
}

// Send a request and follow redirects. Returns { response, hops, finalUrl },
// or { problem } when the chain is unusable.
async function follow(fetchImpl, method, url, { timeout, maxRedirects }) {
  const hops = [];
  const seen = new Set([url]);
  let current = url;
  for (;;) {
    const response = await send(fetchImpl, method, current, timeout);
    if (!REDIRECTS.has(response.status)) return { response, hops, finalUrl: current };
    const location = response.headers.get('location');
    if (!location) return { problem: `${describeStatus(response.status, response.statusText)} without a Location header`, hops };
    let next;
    try {
      next = new URL(location, current).href;
    } catch {
      return { problem: `redirect to an invalid address (${location})`, hops };
    }
    hops.push({ status: response.status, from: current, to: next });
    if (seen.has(next)) return { problem: `redirect loop (${next})`, hops };
    if (hops.length > maxRedirects) return { problem: `more than ${maxRedirects} redirects`, hops };
    seen.add(next);
    current = next;
  }
}

// Check one URL: HEAD first, GET if the server does not like HEAD, redirects
// followed. Returns { url, level, status, message?, redirects? } where level is
// ok, warning or broken. `fetch` is injectable for tests.
export async function checkUrl(url, { fetch: fetchImpl = globalThis.fetch, timeout = 10000, maxRedirects = 5 } = {}) {
  const settings = { timeout, maxRedirects };
  let outcome;
  try {
    outcome = await follow(fetchImpl, 'HEAD', url, settings);
    if (outcome.response && HEAD_NOT_ALLOWED.has(outcome.response.status)) {
      outcome = await follow(fetchImpl, 'GET', url, settings);
    }
  } catch (err) {
    return { url, level: 'broken', status: null, message: describeError(err, timeout) };
  }
  const redirects = outcome.hops.length > 0 ? { redirects: outcome.hops } : {};
  if (outcome.problem) return { url, level: 'broken', status: null, message: outcome.problem, ...redirects };
  const { response, finalUrl } = outcome;
  const { status } = response;
  if (status >= 200 && status < 300) {
    const permanent = outcome.hops.some(hop => PERMANENT.has(hop.status));
    if (permanent) return { url, level: 'warning', status, message: `moved permanently to ${finalUrl}`, finalUrl, ...redirects };
    return { url, level: 'ok', status, ...redirects };
  }
  const message = describeStatus(status, response.statusText);
  if (status === 401 || status === 403) return { url, level: 'warning', status, message: `${message} (may need a login)`, ...redirects };
  return { url, level: 'broken', status, message, ...redirects };
}
