// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

import DOMPurify from 'dompurify';

/**
 * Provider icons from the models catalog arrive in two shapes:
 *   1. Raw inline SVG markup (`<svg …>…</svg>`) — the common case.
 *   2. A URL or data URI pointing at an image.
 *
 * The old code fed both straight into `<img src={…}>`. That works for URLs but
 * silently breaks for raw SVG markup: the browser resolves the markup as a
 * relative URL, the request 404s, and every provider logo renders blank
 * (naturalWidth === 0). Inline SVG also lets `fill="currentColor"` follow the
 * theme, which an `<img>` can never do.
 *
 * These helpers classify the icon value so callers can render markup inline
 * (via `{@html}`) and URLs via `<img>`.
 */

const SANITIZE_SVG_OPTS = {
  USE_PROFILES: { svg: true, svgFilters: true },
} as const;

function isSvgMarkup(icon: string): boolean {
  return icon.trim().startsWith('<svg');
}

/**
 * Returns sanitized inline SVG markup when the icon is raw SVG, otherwise
 * `undefined` (the icon is a URL — use {@link providerIconUrl}).
 */
export function providerIconSvg(icon?: string | null): string | undefined {
  if (!icon || !isSvgMarkup(icon)) return undefined;
  return DOMPurify.sanitize(icon.trim(), SANITIZE_SVG_OPTS);
}

/**
 * Returns the icon URL when the icon is a URL/data URI, otherwise `undefined`
 * (the icon is inline SVG markup — use {@link providerIconSvg}).
 */
export function providerIconUrl(icon?: string | null): string | undefined {
  if (!icon || isSvgMarkup(icon)) return undefined;
  return icon.trim();
}
