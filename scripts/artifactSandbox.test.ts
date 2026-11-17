// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

/**
 * artifactSandbox.test.ts
 *
 * Tests for ENGG-462: artifacts run without allow-same-origin, behind a CSP
 * and an in-memory storage shim.
 *
 * Runs standalone under tsx (no test runner is configured):
 *   pnpm test
 */
import assert from 'node:assert/strict';
import {
  ARTIFACT_CDN_HOSTS,
  ARTIFACT_CSP,
  ARTIFACT_SANDBOX,
  buildArtifactDocument,
} from '../src/lib/features/chat/artifactSandbox.js';

// API hosts from the .env files; the CSP must never allow them.
const API_BASE_FOR_TEST = ['https://grengin-test-production.up.railway.app', 'http://localhost:3000'];

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const CSP_META = '<meta http-equiv="Content-Security-Policy"';

function directive(name: string): string[] {
  const d = ARTIFACT_CSP.split(';').map((s) => s.trim()).find((s) => s.startsWith(`${name} `));
  assert.ok(d, `missing ${name}`);
  return d.split(/\s+/).slice(1);
}

console.log('artifact sandbox (ENGG-462)');

test('sandbox never grants allow-same-origin', () => {
  assert.equal(ARTIFACT_SANDBOX.includes('allow-same-origin'), false);
  assert.ok(ARTIFACT_SANDBOX.includes('allow-scripts'));
});

test('CSP defaults to none and allows inline scripts/styles', () => {
  assert.deepEqual(directive('default-src'), ["'none'"]);
  assert.ok(directive('script-src').includes("'unsafe-inline'"));
  assert.ok(directive('style-src').includes("'unsafe-inline'"));
  assert.deepEqual(directive('object-src'), ["'none'"]);
  assert.deepEqual(directive('base-uri'), ["'none'"]);
  assert.deepEqual(directive('form-action'), ["'none'"]);
});

test('CSP has no wildcard sources that would reach the API', () => {
  for (const src of ARTIFACT_CSP.split(/[;\s]+/)) {
    assert.notEqual(src, '*', 'no * source');
    assert.notEqual(src, 'https:', 'no https: scheme source');
    assert.notEqual(src, 'http:', 'no http: scheme source');
    assert.notEqual(src, "'self'", "no 'self' source");
  }
  for (const api of API_BASE_FOR_TEST) {
    assert.equal(ARTIFACT_CSP.includes(new URL(api).host), false, `${api} must be blocked`);
  }
});

test('CSP allows the CDNs used for Mermaid, charts and Tailwind', () => {
  const scripts = directive('script-src');
  for (const cdn of ['https://cdn.jsdelivr.net/npm/', 'https://cdnjs.cloudflare.com', 'https://unpkg.com', 'https://cdn.tailwindcss.com', 'https://code.jquery.com']) {
    assert.ok(scripts.includes(cdn), cdn);
  }
});

test('allowlist mirrors Claude\'s documented hosts and nothing else', () => {
  // Exhaustive list from Anthropic's artifact docs: 5 script CDNs, jsDelivr on /npm/.
  assert.deepEqual([...ARTIFACT_CDN_HOSTS].sort(), [
    'https://cdn.jsdelivr.net/npm/',
    'https://cdn.tailwindcss.com',
    'https://cdnjs.cloudflare.com',
    'https://code.jquery.com',
    'https://unpkg.com',
  ].sort());
  // Hosts that are NOT on Claude's list must not appear anywhere in the CSP.
  for (const host of ['esm.sh', 'cdn.plot.ly', 'd3js.org']) {
    assert.equal(ARTIFACT_CSP.includes(host), false, `${host} must not be allowed`);
  }
  // jsDelivr is path-restricted to /npm/, not the bare host.
  assert.equal(/cdn\.jsdelivr\.net(?!\/npm\/)/.test(ARTIFACT_CSP), false, 'jsDelivr must be /npm/ only');
});

test('Google Fonts are allowed for styles and fonts', () => {
  assert.ok(directive('style-src').includes('https://fonts.googleapis.com'));
  assert.ok(directive('font-src').includes('https://fonts.gstatic.com'));
});

test('remote images and media are blocked (data/blob only)', () => {
  for (const name of ['img-src', 'media-src']) {
    assert.deepEqual(directive(name), ['data:', 'blob:'], name);
  }
});

test('page code cannot fetch the CDNs or the API', () => {
  const connect = directive('connect-src');
  for (const cdn of ARTIFACT_CDN_HOSTS) {
    assert.equal(connect.includes(cdn), false, `connect-src must not reach ${cdn}`);
  }
  assert.ok(connect.includes('https://fonts.gstatic.com'));
});

test('preamble goes first when there is no doctype', () => {
  const doc = buildArtifactDocument('<html><body>hi</body></html>');
  assert.ok(doc.startsWith(CSP_META));
  assert.ok(doc.endsWith('<html><body>hi</body></html>'));
});

test('preamble goes after a leading doctype so the page keeps standards mode', () => {
  const doc = buildArtifactDocument('<!DOCTYPE html>\n<html><head><title>x</title></head></html>');
  assert.ok(doc.startsWith(`<!DOCTYPE html>${CSP_META}`));
  assert.ok(doc.endsWith('\n<html><head><title>x</title></head></html>'));
});

test('handles a BOM, whitespace and comments before the doctype', () => {
  const doc = buildArtifactDocument('﻿  <!-- generated -->\n<!doctype html><p>x</p>');
  assert.ok(doc.startsWith('﻿  <!-- generated -->\n<!doctype html>' + CSP_META));
});

test('a doctype later in the document is not treated as leading', () => {
  const doc = buildArtifactDocument('<p>x</p><!doctype html>');
  assert.ok(doc.startsWith(CSP_META));
});

test('bare SVG and empty content still get the preamble', () => {
  assert.ok(buildArtifactDocument('<svg viewBox="0 0 1 1"></svg>').startsWith(CSP_META));
  assert.ok(buildArtifactDocument('').startsWith(CSP_META));
});

test('preamble includes the storage shim before artifact code runs', () => {
  const doc = buildArtifactDocument('<script>localStorage.setItem("a","b")</script>');
  const shim = doc.indexOf('memoryStorage');
  assert.ok(shim > 0 && shim < doc.indexOf('localStorage.setItem("a"'));
});

console.log(`\n${passed} passed`);
