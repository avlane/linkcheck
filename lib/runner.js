import { checkUrl } from './check-url.js';
import { classifyLink } from './classify.js';
import { checkLocal } from './local.js';
import { makeResult } from './result.js';

async function checkOne(link, options) {
  const target = classifyLink(link.url);
  if (target.type === 'skipped') return makeResult(link, 'skipped', target.reason);
  if (target.type === 'external') {
    const outcome = await checkUrl(target.url, { fetch: options.fetch, timeout: options.timeout });
    return makeResult(link, outcome.level, outcome.message, { httpStatus: outcome.status });
  }
  return checkLocal(link, target, options);
}

// Check links one after the other. Each link is { file, line, column, url, kind };
// options are { fetch, timeout, anchors, stat }. Returns one result per link.
export async function checkLinks(links, options) {
  const results = [];
  for (const link of links) results.push(await checkOne(link, options));
  return results;
}
