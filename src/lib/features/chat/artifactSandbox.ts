// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

/**
 * Isolation for AI-generated HTML artifacts (ENGG-462).
 *
 * Artifacts render in an iframe sandboxed WITHOUT allow-same-origin, so they
 * get an opaque origin and can't read this app's localStorage (where the auth
 * tokens live), cookies or DOM. On top of that, the document gets a
 * restrictive CSP and an in-memory storage shim, prepended by
 * `buildArtifactDocument()`.
 */

/** Sandbox tokens for the artifact iframe. Never add allow-same-origin: with
 *  allow-scripts, it would let the artifact remove its own sandbox. */
export const ARTIFACT_SANDBOX = 'allow-scripts';

/**
 * Safe list of script/style CDNs an artifact may load from: five script CDNs,
 * with jsDelivr restricted to `/npm/`, plus Google Fonts (handled separately
 * below). Grengin's API is deliberately absent, so any request to it is blocked
 * by the CSP. Fixed in code on purpose: this is a trust boundary and widening it
 * must go through code review — never derive it from artifact content.
 */
export const ARTIFACT_CDN_HOSTS: readonly string[] = [
  'https://cdnjs.cloudflare.com',
  'https://cdn.jsdelivr.net/npm/',
  'https://unpkg.com',
  'https://cdn.tailwindcss.com',
  'https://code.jquery.com',
];

const CDNS = ARTIFACT_CDN_HOSTS.join(' ');

export const ARTIFACT_CSP = [
  "default-src 'none'",
  // 'unsafe-eval': Tailwind's play CDN and some chart libraries compile at runtime.
  `script-src 'unsafe-inline' 'unsafe-eval' blob: ${CDNS}`,
  // Stylesheets from the trusted CDNs plus the Google Fonts stylesheet host.
  `style-src 'unsafe-inline' ${CDNS} https://fonts.googleapis.com`,
  // Web fonts from the trusted CDNs (icon fonts), Google Fonts, or data URIs.
  `font-src data: ${CDNS} https://fonts.gstatic.com`,
  // Images and media only as data/blob URIs: remote images are blocked.
  'img-src data: blob:',
  'media-src data: blob:',
  // fetch/XHR/WebSocket reach only local schemes and the Google Fonts hosts.
  'connect-src data: blob: https://fonts.googleapis.com https://fonts.gstatic.com',
  'worker-src blob:',
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'",
].join('; ');

/**
 * Inside an opaque origin, reading `localStorage`, `sessionStorage` or
 * `document.cookie` throws a SecurityError, which would crash artifacts that
 * use them. Swap in in-memory stand-ins that last for the page's lifetime.
 */
const STORAGE_SHIM = `(function () {
  function memoryStorage() {
    var d = new Map();
    return Object.create({
      get length() { return d.size; },
      key: function (i) { var k = Array.from(d.keys())[i]; return k === undefined ? null : k; },
      getItem: function (k) { k = String(k); return d.has(k) ? d.get(k) : null; },
      setItem: function (k, v) { d.set(String(k), String(v)); },
      removeItem: function (k) { d.delete(String(k)); },
      clear: function () { d.clear(); }
    });
  }
  ['localStorage', 'sessionStorage'].forEach(function (name) {
    try { window[name]; } catch (e) {
      try { Object.defineProperty(window, name, { value: memoryStorage(), configurable: true }); } catch (e2) {}
    }
  });
  try { document.cookie; } catch (e) {
    var jar = {};
    try {
      Object.defineProperty(document, 'cookie', {
        configurable: true,
        get: function () { return Object.keys(jar).map(function (k) { return k + '=' + jar[k]; }).join('; '); },
        set: function (v) {
          var pair = String(v).split(';')[0], i = pair.indexOf('=');
          if (i > 0) jar[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
        }
      });
    } catch (e2) {}
  }
})();`;


const PREAMBLE =
  `<meta http-equiv="Content-Security-Policy" content="${ARTIFACT_CSP}">` +
  `<script>${STORAGE_SHIM}</script>`;

/** A leading doctype (optionally after a BOM, whitespace or comments). */
const LEADING_DOCTYPE = /^﻿?\s*(?:<!--[\s\S]*?-->\s*)*<!doctype[^>]*>/i;

/**
 * Wrap artifact HTML for the sandboxed iframe: the CSP meta and storage shim go
 * first, ahead of any artifact markup, so the policy covers everything the
 * artifact loads. They're placed after a leading doctype so the page keeps
 * standards mode. The HTML parser hoists them into <head> either way, and an
 * artifact's own CSP can only tighten this one, never loosen it.
 */
export function buildArtifactDocument(html: string): string {
  const doctype = html.match(LEADING_DOCTYPE)?.[0] ?? '';
  return doctype + PREAMBLE + html.slice(doctype.length);
}
