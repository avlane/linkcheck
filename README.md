# linkcheck

A link checker for Markdown files. No dependencies; uses the `fetch` that
ships with Node and needs Node 20 or newer.

    node bin/linkcheck.js README.md docs/
    node bin/linkcheck.js --format github --strict docs/ > annotations.txt
    cat notes.md | node bin/linkcheck.js -

    examples/docs/index.md:4:48  broken  #nope  no heading with the anchor #nope in this file
    examples/docs/index.md:8:61  broken  http://example.com/old  404 Not Found
    examples/docs/index.md:10:41  broken  images/missing.png  no such file: images/missing.png
    examples/docs/index.md:12:35  broken  no definition for the reference [nothing]
    4 broken links

Exit status: 0 when no link is broken, 1 when one is (also when there is a
warning and `--strict` is given), 2 for usage problems such as an unreadable
file.

## What is checked

- inline links and images, `[text][ref]` references and their `[ref]: url`
  definitions, `<autolinks>`, bare URLs in text, and `href`/`src` attributes of
  inline HTML. Code blocks and code spans are ignored.
- **http and https** links with a `HEAD` request (`GET` for servers that
  refuse `HEAD`). Redirects are followed by hand: a permanent one (301, 308)
  is a warning that names the new address, 401 and 403 are warnings, other
  failures are broken. Flaky answers (429, 502, 503, 504, resets, timeouts)
  are retried, honouring `Retry-After`, and a link that is still rate limited
  is a warning.
- **files**: a relative link must exist. A `#fragment` on a Markdown file
  (including the file itself) must match one of its headings, using GitHub's
  rules (lower case, punctuation dropped, `-1`/`-2` for repeats, links and
  emphasis in headings removed, Setext headings, `<a name>` and `id`).
- `/root-relative` links need `--root DIR` (look below DIR) or `--base-url`
  (check as a URL on that site); otherwise they are skipped.
- `mailto:`, `tel:` and other schemes are not sent anywhere; malformed URLs
  and `mailto:` without an address are broken.

Every distinct URL is requested once per run, however many files mention it,
and at most `--per-host` requests (default 2) run at a time per host.

## Options

    -t, --timeout MS     give up on a server after MS milliseconds (default: 10000)
    -c, --concurrency N  check up to N links at once (default: 8)
        --retries N      retry rate-limited or unreliable servers N times (default: 2)
        --per-host N     at most N requests at a time to one host (default: 2)
        --delay MS       wait at least MS between requests to one host (default: 0)
        --ignore REGEX   do not check links matching REGEX (repeatable)
        --exclude GLOB   leave out matching files and folders (repeatable)
        --config FILE    read options from FILE (default: .linkcheckrc.json)
        --no-config      do not read an options file
        --root DIR       where /root-relative links point to (a folder)
        --base-url URL   check /root-relative links on this site instead
        --no-anchors     do not check #fragments against headings
        --cache          remember working links between runs
        --cache-file F   where --cache keeps them (default: .linkcheck-cache.json)
        --cache-ttl H    forget them after H hours (default: 24)
    -q, --quiet          print only the problems, no summary
    -v, --verbose        also list links that were fine or skipped
        --format FMT     text (default), json or github
        --json           same as --format json
        --strict         exit with 1 on warnings too
    -h, --help           show this help

Folders are searched for `.md`, `.markdown`, `.mdown` and `.mkd` files,
skipping `node_modules` and dot folders. `-` reads one document from standard
input and reports it as `<stdin>`.

### Configuration file

`.linkcheckrc.json` in the current folder (or the file given with `--config`)
can hold `timeout`, `concurrency`, `retries`, `perHost`, `delay`, `ignore`,
`exclude`, `root` and `baseUrl`. The command line wins over the file; `ignore`
and `exclude` lists from both are combined.

    { "ignore": ["^https://localhost", "internal\\.example\\.com"], "exclude": ["CHANGELOG.md"], "retries": 1 }

### Output formats

`text` lists broken links and warnings with `file:line:column`, `json` prints
`{ summary, results }` with a result for every link, and `github` prints
`::error`/`::warning` workflow commands so a CI job can annotate the files.
On a terminal a progress counter runs on standard error.

## Caching

With `--cache`, links that returned 2xx without any warning are remembered
for 24 hours in `.linkcheck-cache.json` and not requested again. Failures and
warnings are never cached.

## Development

    npm test

The tests use `node:test`, a fake `fetch` (see `test/helpers.js`) and real
temporary folders; nothing touches the network. `examples/docs/` holds a small
document set with deliberately broken links.
