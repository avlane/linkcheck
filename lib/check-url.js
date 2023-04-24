// Check one URL with a HEAD request. `fetch` is injectable for tests.
export async function checkUrl(url, { fetch: fetchImpl = globalThis.fetch } = {}) {
  try {
    const response = await fetchImpl(url, { method: 'HEAD' });
    return { url, ok: response.ok, status: response.status };
  } catch (err) {
    return { url, ok: false, status: null, error: err.cause?.code ?? err.message };
  }
}
