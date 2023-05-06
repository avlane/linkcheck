import { checkUrl } from './check-url.js';
import { classifyLink } from './classify.js';
import { checkLocal } from './local.js';
import { makeResult } from './result.js';

async function checkOne(link, options) {
  const target = classifyLink(link.url);
  if (target.type === 'skipped') return makeResult(link, 'skipped', target.reason);
  if (target.type === 'external') {
    const outcome = await checkUrl(target.url, { fetch: options.fetch });
    if (outcome.ok) return makeResult(link, 'ok', undefined, { httpStatus: outcome.status });
    return makeResult(link, 'broken', outcome.status === null ? outcome.error : String(outcome.status), { httpStatus: outcome.status });
  }
  return checkLocal(link, target, options);
}

// Check links one after the other. Each link is { file, line, column, url, kind };
// options are { fetch, anchors, stat }. Returns one result per link.
export async function checkLinks(links, options) {
  const results = [];
  for (const link of links) results.push(await checkOne(link, options));
  return results;
}
