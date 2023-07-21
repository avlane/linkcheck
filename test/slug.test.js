import test from 'node:test';
import assert from 'node:assert/strict';
import { headingAnchors, slugify } from '../lib/slug.js';

test('slugify follows the GitHub rules', () => {
  assert.equal(slugify('Hello, World!'), 'hello-world');
  assert.equal(slugify('How do I install?'), 'how-do-i-install');
  assert.equal(slugify('  Spaces  inside '), 'spaces--inside');
  assert.equal(slugify('snake_case and kebab-case'), 'snake_case-and-kebab-case');
  assert.equal(slugify('Caf\u00e9 \u00dcber'), 'caf\u00e9-\u00fcber');
  assert.equal(slugify('v1.2.3 (beta)'), 'v123-beta');
});

test('headingAnchors collects ATX headings of every level', () => {
  const anchors = headingAnchors('# One\n\ntext\n\n## Two words\n###### Six ##\n####### too many hashes\n#nospace\n');
  assert.deepEqual([...anchors], ['one', 'two-words', 'six']);
});

test('headingAnchors numbers repeated headings', () => {
  const anchors = headingAnchors('# Intro\n## Usage\n## Usage\n## Usage\n# Intro\n');
  assert.deepEqual([...anchors], ['intro', 'usage', 'usage-1', 'usage-2', 'intro-1']);
});

test('headingAnchors ignores headings in code blocks', () => {
  const anchors = headingAnchors('# Real\n```\n# Not a heading\n```\n## Also real\n');
  assert.deepEqual([...anchors], ['real', 'also-real']);
});

test('headingAnchors also offers HTML ids and names', () => {
  const anchors = headingAnchors('# Title\n<a name="Old-Style"></a>\n<div id=\'box\'>text</div>\n<p>no id</p>\n');
  assert.deepEqual([...anchors], ['title', 'old-style', 'box']);
});

test('headingAnchors allows trailing hashes and indentation', () => {
  assert.deepEqual([...headingAnchors('   ## Indented ##   \n')], ['indented']);
});
