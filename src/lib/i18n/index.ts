// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

import { addMessages, init, getLocaleFromNavigator, locale } from 'svelte-i18n';
import { get } from 'svelte/store';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SUPPORTED_LOCALES = {
  en: 'English',
  fr: 'Français',
  ja: '日本語',
  es: 'Español',
  ko: '한국어',
  pt: 'Português',
  ar: 'العربية',
} as const;

export type SupportedLocale = keyof typeof SUPPORTED_LOCALES;

// ---------------------------------------------------------------------------
// RTL (Right-to-Left) language support
// ---------------------------------------------------------------------------

/**
 * Locales that should render with `dir="rtl"`. Adding a locale here flips the
 * UI direction (sidebar position, alignments, logical properties, …) and is
 * the single source of truth for direction across the app.
 */
export const RTL_LOCALES: ReadonlySet<string> = new Set(['ar', 'ur']);

export type Direction = 'ltr' | 'rtl';

/** Returns `true` when the given locale should render right-to-left. */
export function isRTL(lang: string | null | undefined): boolean {
  if (!lang) return false;
  // Match both bare codes ("ar") and tagged codes ("ar-EG").
  const short = lang.split('-')[0].toLowerCase();
  return RTL_LOCALES.has(short);
}

/** Returns the writing direction (`'ltr'` or `'rtl'`) for the given locale. */
export function getDirection(lang: string | null | undefined): Direction {
  return isRTL(lang) ? 'rtl' : 'ltr';
}

/**
 * Apply the writing direction & language to the root `<html>` element.
 * Safe to call from any environment — silently no-ops when `document` is
 * unavailable (e.g. SSR or test runners without a DOM).
 */
export function applyDocumentDirection(lang: string | null | undefined): void {
  if (typeof document === 'undefined') return;
  const dir = getDirection(lang);
  const html = document.documentElement;
  if (html.getAttribute('dir') !== dir) html.setAttribute('dir', dir);
  if (lang && html.getAttribute('lang') !== lang) html.setAttribute('lang', lang);
}

/**
 * Every namespace that a locale can be split into.
 * "common" is always loaded at boot; others are loaded on demand.
 */
export const NAMESPACES = [
  'common',
  'auth',
  'sidebar',
  'alerts',
  'chat',
  'admin',
  'analytics',
  'settings',
  'error',
  'projects',
] as const;

export type Namespace = (typeof NAMESPACES)[number];

// ---------------------------------------------------------------------------
// Route → required namespaces mapping
// ---------------------------------------------------------------------------

/**
 * Maps route prefixes to the set of namespaces they need.
 * `common` is implicitly included for every route.
 */
const ROUTE_NAMESPACES: Record<string, Namespace[]> = {
  '/admin/analytics':           ['admin', 'analytics', 'sidebar'],
  '/admin/ai-engines':          ['admin', 'sidebar'],
  '/admin/users':               ['admin', 'sidebar'],
  '/admin/departments':         ['admin', 'sidebar'],
  '/admin/access-control':      ['admin', 'sidebar'],
  '/admin/settings':            ['admin', 'sidebar', 'settings'],
  '/admin/mcp-servers':         ['admin', 'sidebar'],
  '/admin/prompt-library':      ['admin', 'sidebar'],
  '/admin/prompt-effectiveness':['admin', 'sidebar'],
  '/admin/audit-logs':          ['admin', 'sidebar'],
  '/admin/system-metrics':      ['admin', 'sidebar'],
  '/admin/overview':            ['admin', 'analytics', 'sidebar'],
  '/admin/alerts':              ['alerts', 'admin', 'sidebar'],
  '/admin':                     ['admin', 'sidebar'],
  '/settings':                  ['settings', 'admin', 'sidebar'],
  '/projects':                   ['sidebar', 'chat', 'projects'],
  '/alerts':                    ['alerts', 'sidebar'],
  '/auth':                      ['auth'],
  '/forbidden':                 ['sidebar'],
  '/mcp/oauth/callback':        ['admin'],
  '/':                          ['chat', 'sidebar'],
};

// ---------------------------------------------------------------------------
// Dynamic import map (Vite-compatible)
// ---------------------------------------------------------------------------

/**
 * Each entry returns a dynamic `import()` call.  Vite will code-split these
 * into separate chunks that are fetched only when requested.
 */
const LOADERS: Record<string, () => Promise<{ default: Record<string, unknown> }>> = {
  'en/common':    () => import('./locales/en/common.json'),
  'en/auth':      () => import('./locales/en/auth.json'),
  'en/sidebar':   () => import('./locales/en/sidebar.json'),
  'en/alerts':    () => import('./locales/en/alerts.json'),
  'en/chat':      () => import('./locales/en/chat.json'),
  'en/admin':     () => import('./locales/en/admin.json'),
  'en/analytics': () => import('./locales/en/analytics.json'),
  'en/settings':  () => import('./locales/en/settings.json'),
  'en/error':     () => import('./locales/en/error.json'),
  'en/projects':  () => import('./locales/en/projects.json'),

  'es/common':    () => import('./locales/es/common.json'),
  'es/auth':      () => import('./locales/es/auth.json'),
  'es/sidebar':   () => import('./locales/es/sidebar.json'),
  'es/alerts':    () => import('./locales/es/alerts.json'),
  'es/chat':      () => import('./locales/es/chat.json'),
  'es/admin':     () => import('./locales/es/admin.json'),
  'es/analytics': () => import('./locales/es/analytics.json'),
  'es/settings':  () => import('./locales/es/settings.json'),
  'es/error':     () => import('./locales/es/error.json'),
  'es/projects':  () => import('./locales/es/projects.json'),

  'fr/common':    () => import('./locales/fr/common.json'),
  'fr/auth':      () => import('./locales/fr/auth.json'),
  'fr/sidebar':   () => import('./locales/fr/sidebar.json'),
  'fr/alerts':    () => import('./locales/fr/alerts.json'),
  'fr/chat':      () => import('./locales/fr/chat.json'),
  'fr/admin':     () => import('./locales/fr/admin.json'),
  'fr/analytics': () => import('./locales/fr/analytics.json'),
  'fr/settings':  () => import('./locales/fr/settings.json'),
  'fr/error':     () => import('./locales/fr/error.json'),
  'fr/projects':  () => import('./locales/fr/projects.json'),

  'ja/common':    () => import('./locales/ja/common.json'),
  'ja/auth':      () => import('./locales/ja/auth.json'),
  'ja/sidebar':   () => import('./locales/ja/sidebar.json'),
  'ja/alerts':    () => import('./locales/ja/alerts.json'),
  'ja/chat':      () => import('./locales/ja/chat.json'),
  'ja/admin':     () => import('./locales/ja/admin.json'),
  'ja/analytics': () => import('./locales/ja/analytics.json'),
  'ja/settings':  () => import('./locales/ja/settings.json'),
  'ja/error':     () => import('./locales/ja/error.json'),
  'ja/projects':  () => import('./locales/ja/projects.json'),

  'ko/common':    () => import('./locales/ko/common.json'),
  'ko/auth':      () => import('./locales/ko/auth.json'),
  'ko/sidebar':   () => import('./locales/ko/sidebar.json'),
  'ko/alerts':    () => import('./locales/ko/alerts.json'),
  'ko/chat':      () => import('./locales/ko/chat.json'),
  'ko/admin':     () => import('./locales/ko/admin.json'),
  'ko/analytics': () => import('./locales/ko/analytics.json'),
  'ko/settings':  () => import('./locales/ko/settings.json'),
  'ko/error':     () => import('./locales/ko/error.json'),
  'ko/projects':  () => import('./locales/ko/projects.json'),

  'pt/common':    () => import('./locales/pt/common.json'),
  'pt/auth':      () => import('./locales/pt/auth.json'),
  'pt/sidebar':   () => import('./locales/pt/sidebar.json'),
  'pt/alerts':    () => import('./locales/pt/alerts.json'),
  'pt/chat':      () => import('./locales/pt/chat.json'),
  'pt/admin':     () => import('./locales/pt/admin.json'),
  'pt/analytics': () => import('./locales/pt/analytics.json'),
  'pt/settings':  () => import('./locales/pt/settings.json'),
  'pt/error':     () => import('./locales/pt/error.json'),
  'pt/projects':  () => import('./locales/pt/projects.json'),

  // RTL locales
  'ar/common':    () => import('./locales/ar/common.json'),
  'ar/auth':      () => import('./locales/ar/auth.json'),
  'ar/sidebar':   () => import('./locales/ar/sidebar.json'),
  'ar/alerts':    () => import('./locales/ar/alerts.json'),
  'ar/chat':      () => import('./locales/ar/chat.json'),
  'ar/admin':     () => import('./locales/ar/admin.json'),
  'ar/analytics': () => import('./locales/ar/analytics.json'),
  'ar/settings':  () => import('./locales/ar/settings.json'),
  'ar/error':     () => import('./locales/ar/error.json'),
  'ar/projects':  () => import('./locales/ar/projects.json'),
};

// ---------------------------------------------------------------------------
// Cache & loading helpers
// ---------------------------------------------------------------------------

/** Tracks which locale+namespace combos have already been loaded. */
const loaded = new Set<string>();

/** In-flight promises so we don't double-fetch the same chunk. */
const inflight = new Map<string, Promise<void>>();

/**
 * Load a single namespace for a single locale.
 * Silently falls back to `en` if the target locale fails.
 * Already-loaded combos are skipped (no re-fetch).
 */
async function loadNamespace(lang: SupportedLocale, ns: Namespace): Promise<void> {
  const key = `${lang}/${ns}`;
  if (loaded.has(key)) return;

  // Deduplicate concurrent calls for the same key
  if (inflight.has(key)) return inflight.get(key);

  const promise = (async () => {
    try {
      const loader = LOADERS[key];
      if (!loader) {
        // If no loader exists for this locale, fall back to en
        if (lang !== 'en') {
          await loadNamespace('en', ns);
        }
        return;
      }
      const mod = await loader();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      addMessages(lang, (mod.default ?? mod) as any);
      loaded.add(key);
    } catch (err) {
      console.warn(`[i18n] Failed to load ${key}, falling back to en`, err);
      if (lang !== 'en') {
        await loadNamespace('en', ns);
      }
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
}

/**
 * Load multiple namespaces for a locale in parallel.
 * `common` is always included.
 */
export async function loadNamespaces(
  namespaces: Namespace[],
  lang?: SupportedLocale,
): Promise<void> {
  const targetLang = lang ?? (get(locale) as SupportedLocale) ?? 'en';
  const nsSet = new Set<Namespace>(['common', ...namespaces]);

  // Always load the en fallback for each namespace first (if not already loaded)
  // so svelte-i18n has something to show while the target locale loads.
  const fallbackLoads = targetLang !== 'en'
    ? [...nsSet].map((ns) => loadNamespace('en', ns))
    : [];

  const targetLoads = [...nsSet].map((ns) => loadNamespace(targetLang, ns));

  await Promise.all([...fallbackLoads, ...targetLoads]);
}

// ---------------------------------------------------------------------------
// Route-based namespace resolution
// ---------------------------------------------------------------------------

/**
 * Given a pathname, return the namespaces required for that route.
 */
export function getNamespacesForRoute(pathname: string): Namespace[] {
  // Try most-specific prefix first (longest match)
  const sorted = Object.keys(ROUTE_NAMESPACES).sort((a, b) => b.length - a.length);
  for (const prefix of sorted) {
    if (pathname.startsWith(prefix)) {
      return ROUTE_NAMESPACES[prefix];
    }
  }
  // Default: chat + sidebar
  return ['chat', 'sidebar'];
}

/**
 * Load namespaces required for a given route pathname.
 */
export async function loadNamespacesForRoute(pathname: string, lang?: SupportedLocale): Promise<void> {
  const namespaces = getNamespacesForRoute(pathname);
  return loadNamespaces(namespaces, lang);
}

// ---------------------------------------------------------------------------
// Language switch
// ---------------------------------------------------------------------------

/**
 * Switch the active locale. Loads all namespaces that are currently loaded
 * for the old locale into the new one, then sets the locale.
 */
export async function switchLocale(newLang: SupportedLocale): Promise<void> {
  // Determine which namespaces are currently loaded for *any* language
  const namespacesToLoad = new Set<Namespace>();
  for (const key of loaded) {
    const ns = key.split('/')[1] as Namespace;
    namespacesToLoad.add(ns);
  }

  // Load all those namespaces for the new language
  await loadNamespaces([...namespacesToLoad], newLang);
  locale.set(newLang);
  localStorage.setItem('locale', newLang);
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

function resolveInitialLocale(): SupportedLocale {
  const saved = localStorage.getItem('locale');
  if (saved && saved in SUPPORTED_LOCALES) return saved as SupportedLocale;

  const detected = getLocaleFromNavigator() ?? 'en';
  // Match "en-US" → "en", "fr-FR" → "fr", etc.
  const short = detected.split('-')[0];
  if (short in SUPPORTED_LOCALES) return short as SupportedLocale;

  return 'en';
}

const initialLocale = resolveInitialLocale();

// Initialize svelte-i18n with empty messages — they'll be filled lazily
init({
  fallbackLocale: 'en',
  initialLocale,
});

// Apply the initial direction synchronously so the very first paint already
// renders RTL when the user previously selected an RTL locale.
applyDocumentDirection(initialLocale);

// Keep `<html dir>` and `<html lang>` in sync with the active locale. This is
// the single place that mutates document direction at runtime — every other
// caller goes through `switchLocale` (which sets the store).
locale.subscribe((value) => {
  if (value) applyDocumentDirection(value);
});

// Eagerly load only `common` + `error` for the initial locale (+ en fallback).
// The route-specific namespaces will be loaded by the router integration.
export const i18nReady: Promise<void> = loadNamespaces(['common', 'error'], initialLocale);
