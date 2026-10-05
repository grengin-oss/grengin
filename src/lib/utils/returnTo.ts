// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

/**
 * Deep links through login: remember the page a signed-out user was trying to
 * reach, and send them back there once they sign in instead of to the home page.
 *
 * Saved in sessionStorage (per tab) because SSO leaves the app for the identity
 * provider and comes back through /auth/:provider/callback. Only same-origin
 * app paths are ever saved or returned, so a crafted link can't bounce the user
 * to another site after login.
 */

const KEY = 'auth_return_url';

/** Paths that are login screens or the SSO callback, never a destination. */
function isAuthPath(pathname: string): boolean {
  return pathname === '/' || pathname === '/admin' || /^\/auth\//.test(pathname);
}

/** `raw` as a same-origin "/path?query#hash", or null when it isn't one. */
export function safeReturnPath(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return null;
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin || isAuthPath(url.pathname)) return null;
    return url.pathname + url.search + url.hash;
  } catch {
    return null;
  }
}

/** Remember `path` (default: the current page) to return to after login. */
export function rememberReturnTo(
  path = window.location.pathname + window.location.search + window.location.hash,
): void {
  const safe = safeReturnPath(path);
  if (!safe) return;
  try {
    sessionStorage.setItem(KEY, safe);
  } catch {
    // Storage blocked: the user lands on the home page instead.
  }
}

/** The remembered page, cleared so it is used only once. */
export function consumeReturnTo(): string | null {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
  } catch {
    return null;
  }
  return safeReturnPath(raw);
}

export function clearReturnTo(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Best effort.
  }
}
