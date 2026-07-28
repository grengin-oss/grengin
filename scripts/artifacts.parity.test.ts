/**
 * artifacts.parity.test.ts
 *
 * Tests for ENGG-387. The client is server-driven: artifacts come from the
 * backend's structured `parts.artifacts` metadata, NOT from parsing message
 * text. The message body only gets the server-delimited <artifact> block
 * stripped for clean display.
 *
 * Runs standalone under tsx (no test runner is configured):
 *   pnpm test
 */
import assert from 'node:assert/strict';
import { extractMessageArtifacts, stripArtifactTags } from '../src/lib/features/chat/artifacts.js';

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log('artifacts (ENGG-387, server-driven from parts.artifacts)');

test('builds a card per server-declared artifact, content left empty', () => {
  const items = extractMessageArtifacts([
    { id: 'a1', file_id: 'f1', title: 'One', content_type: 'text/html' },
    { id: 'a2', file_id: 'f2', title: 'Doc', content_type: 'text/markdown' },
  ]);
  assert.equal(items.length, 2);
  assert.deepEqual(items.map((i) => i.id), ['a1', 'a2']);
  assert.deepEqual(items.map((i) => i.type), ['html', 'markdown']);
  assert.deepEqual(items.map((i) => i.code), ['', ''], 'content is fetched by id later');
});

test('ignores entries without an id (nothing to fetch)', () => {
  const items = extractMessageArtifacts([
    { id: '', title: 'bad' } as never,
    { id: 'ok', title: 'good', content_type: 'text/html' },
  ]);
  assert.deepEqual(items.map((i) => i.id), ['ok']);
});

test('no artifacts metadata → no cards', () => {
  assert.equal(extractMessageArtifacts().length, 0);
  assert.equal(extractMessageArtifacts([]).length, 0);
});

test('strips a complete <artifact> block from the shown text', () => {
  const raw =
    'Here are 3 components.\n\n<artifact type="text/html" title="X">\n<!DOCTYPE html><body>hi</body>\n</artifact>';
  const display = stripArtifactTags(raw);
  assert.equal(display, 'Here are 3 components.');
  assert.ok(!/<artifact/i.test(display));
});

test('strips a trailing UNCLOSED <artifact> block (mid-stream)', () => {
  const raw = 'Building it now.\n\n<artifact type="text/html" title="X">\n<!DOCTYPE html><bod';
  const display = stripArtifactTags(raw);
  assert.equal(display, 'Building it now.');
  assert.ok(!/<artifact/i.test(display));
});

test('leaves plain prose and code fences untouched', () => {
  const raw = 'Use rel="noopener" on external links.\n\n```html\n<a rel="noopener">x</a>\n```';
  assert.equal(stripArtifactTags(raw), raw.trim());
});

console.log(`\n${passed} passed`);
