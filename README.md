# linkcheck

A link checker for Markdown files. No dependencies; uses the `fetch` that
ships with Node and needs Node 20 or newer.

    node bin/linkcheck.js README.md

So far it only lists the links it finds, with their line numbers.
