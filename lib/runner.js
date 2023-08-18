import { checkUrl } from './check-url.js';
import { classifyLink } from './classify.js';
import { checkLocal } from './local.js';
import { mapLimit } from './pool.js';
import { makeResult } from './result.js';

// The fragment is never sent to the server, so it is not part of the request.
function requestUrl(url) {
  const hash = url.indexOf('#');
  return hash === -1 ? url : url.slice(0, hash);
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

// Check links, `concurrency` at a time. Each link is { file, line, column,
// url, kind }; options are { fetch, timeout, maxRedirects, retries, sleep, now,
// concurrency, limiter, ignore, cache, onProgress, root, baseUrl, anchors, stat }. `ignore` is a function from a
// link to true when it should not be checked.
// Every URL is requested once however often it appears. Returns one result per
// link, in the order of the links.
export async function checkLinks(links, options) {
  const requests = new Map();
  const request = url => {
    if (!requests.has(url)) {
      const check = async () => {
        const cached = options.cache?.get(url);
        if (cached !== undefined) return cached;
        const outcome = await checkUrl(url, {
          fetch: options.fetch,
          timeout: options.timeout,
          maxRedirects: options.maxRedirects,
          retries: options.retries,
          sleep: options.sleep,
          now: options.now
        });
        options.cache?.set(url, outcome);
        return outcome;
      };
      requests.set(url, options.limiter ? options.limiter.run(hostOf(url), check) : check());
    }
    return requests.get(url);
  };

  async function checkOne(link) {
    let target = classifyLink(link.url);
    if (target.type === 'skipped') return makeResult(link, 'skipped', target.reason);
    if (target.type === 'local' && target.rootRelative) {
      if (options.baseUrl) target = classifyLink(new URL(link.url, options.baseUrl).href);
      else if (!options.root) return makeResult(link, 'skipped', 'root-relative links need --root or --base-url');
    }
    if (options.ignore && options.ignore(link.url)) return makeResult(link, 'skipped', 'ignored by an ignore pattern');
    if (target.type === 'external') {
      const outcome = await request(requestUrl(target.url));
      const extra = { httpStatus: outcome.status };
      if (outcome.finalUrl !== undefined) extra.finalUrl = outcome.finalUrl;
      return makeResult(link, outcome.level, outcome.message, extra);
    }
    return checkLocal(link, target, options);
  }

  const check = async link => {
    const result = await checkOne(link);
    options.onProgress?.();
    return result;
  };
  return mapLimit(links, options.concurrency ?? 8, check);
}
