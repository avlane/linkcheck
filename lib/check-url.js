const HEAD_NOT_ALLOWED = new Set([400, 403, 405, 501]);
const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const PERMANENT = new Set([301, 308]);
const RETRY_STATUSES = new Set([429, 502, 503, 504]);
const TRANSIENT_ERRORS = new Set(['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT']);

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

const defaultSleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export const describeStatus = (status, statusText) => `${status} ${statusText || STATUS_TEXT[status] || ''}`.trim();

function isTimeout(err) {
  return err.name === 'TimeoutError' || err.name === 'AbortError';
}

function describeError(err, timeout) {
  if (isTimeout(err)) return `timed out after ${timeout} ms`;
  const code = err.cause?.code;
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return `host not found (${code})`;
  if (code === 'ECONNREFUSED') return 'connection refused';
  if (code === 'ECONNRESET') return 'connection reset';
  return code ?? err.message;
}

// How long to wait before retry number `attempt` (0, 1, ...): the server's
// Retry-After (seconds or an HTTP date) when it sent one, otherwise 500 ms
// doubling each time, never more than maxRetryDelay.
export function retryDelay(retryAfter, attempt, { maxRetryDelay = 10000, now = Date.now } = {}) {
  let delay = 500 * 2 ** attempt;
  if (retryAfter !== null && retryAfter !== undefined && String(retryAfter).trim() !== '') {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      delay = seconds * 1000;
    } else {
      const date = Date.parse(retryAfter);
      if (!Number.isNaN(date)) delay = Math.max(0, date - now());
    }
  }
  return Math.min(delay, maxRetryDelay);
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

// One try: HEAD first, GET if the server does not like HEAD, redirects
// followed. Returns { result, retryable, retryAfter }.
async function checkOnce(fetchImpl, url, settings) {
  let outcome;
  try {
    outcome = await follow(fetchImpl, 'HEAD', url, settings);
    if (outcome.response && HEAD_NOT_ALLOWED.has(outcome.response.status)) {
      outcome = await follow(fetchImpl, 'GET', url, settings);
    }
  } catch (err) {
    const retryable = isTimeout(err) || TRANSIENT_ERRORS.has(err.cause?.code);
    return { result: { url, level: 'broken', status: null, message: describeError(err, settings.timeout) }, retryable };
  }
  const redirects = outcome.hops.length > 0 ? { redirects: outcome.hops } : {};
  if (outcome.problem) return { result: { url, level: 'broken', status: null, message: outcome.problem, ...redirects }, retryable: false };
  const { response, finalUrl } = outcome;
  const { status } = response;
  const retryable = RETRY_STATUSES.has(status);
  const retryAfter = response.headers.get('retry-after');
  if (status >= 200 && status < 300) {
    const permanent = outcome.hops.some(hop => PERMANENT.has(hop.status));
    if (permanent) {
      return { result: { url, level: 'warning', status, message: `moved permanently to ${finalUrl}`, finalUrl, ...redirects }, retryable };
    }
    return { result: { url, level: 'ok', status, ...redirects }, retryable };
  }
  const message = describeStatus(status, response.statusText);
  if (status === 401 || status === 403) {
    return { result: { url, level: 'warning', status, message: `${message} (may need a login)`, ...redirects }, retryable };
  }
  if (status === 429) {
    return { result: { url, level: 'warning', status, message: `${message} (rate limited)`, ...redirects }, retryable, retryAfter };
  }
  return { result: { url, level: 'broken', status, message, ...redirects }, retryable, retryAfter };
}

// Check one URL. Returns { url, level, status, message?, redirects?, attempts? }
// where level is ok, warning or broken. Options: fetch, timeout, maxRedirects,
// retries, maxRetryDelay, and sleep/now (injectable for tests).
export async function checkUrl(url, options = {}) {
  const {
    fetch: fetchImpl = globalThis.fetch,
    timeout = 10000,
    maxRedirects = 5,
    retries = 2,
    maxRetryDelay = 10000,
    sleep = defaultSleep,
    now = Date.now
  } = options;
  const settings = { timeout, maxRedirects };
  let attempt = 0;
  for (;;) {
    const { result, retryable, retryAfter } = await checkOnce(fetchImpl, url, settings);
    if (!retryable || attempt >= retries) return attempt === 0 ? result : { ...result, attempts: attempt + 1 };
    await sleep(retryDelay(retryAfter, attempt, { maxRetryDelay, now }));
    attempt++;
  }
}
