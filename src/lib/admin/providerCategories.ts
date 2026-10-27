// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

/**
 * Provider categories for the "Browse Providers" dialog (ai-engines.html
 * .bp-modal), which groups the engines you have not connected yet under
 * headings and offers the same headings as filter tabs.
 *
 * The grouping is published per distribution version at
 *   https://meta.grengin.com/distributions/grengin-api/<version>/categories.json
 * and loaded at runtime (see `aiEnginesStore`). The version comes from the
 * backend health check. The JSON carries:
 *   - `categories`: the ordered list of groups, each with an `id`, a display
 *     `label` and a `description`.
 *   - `providers`: a map of `engine_key` -> category `id`.
 *
 * Any engine the map does not mention falls into the synthetic `other` group,
 * so a new backend engine still shows up — it just lands in the last group
 * instead of a named one. When the file cannot be loaded at all, every provider
 * falls into `other` and the modal shows a single ungrouped bucket.
 */

/** One group as published in categories.json. */
export interface ProviderCategoryDef {
  id: string;
  label: string;
  description: string;
}

/** The shape of the published categories.json document. */
export interface ProviderCategoriesData {
  categories: ProviderCategoryDef[];
  /** `engine_key` (lowercase) -> category `id`. */
  providers: Record<string, string>;
  formatVersion?: string;
  grenginApiVersion?: string;
}

/**
 * Base host that serves the per-version distribution metadata. Defaults to the
 * public meta host; override with VITE_META_BASE (e.g. point it at the mock
 * server in development, which serves these files with CORS enabled).
 */
const rawMetaBase = import.meta.env?.VITE_META_BASE;
export const META_BASE = (
  rawMetaBase && rawMetaBase.trim() ? rawMetaBase.trim() : 'https://meta.grengin.com'
).replace(/\/$/, '');

/** Synthetic bucket for engines the published map does not categorize. */
export const OTHER_CATEGORY_ID = 'other';

/** URL of the categories document for a given distribution version. */
export function categoriesUrl(version: string): string {
  const v = encodeURIComponent(version.trim());
  return `${META_BASE}/distributions/grengin-api/${v}/categories.json`;
}

/**
 * Fetch the published categories for a distribution version. This is a public,
 * unauthenticated static file on a different origin than the API, so it uses a
 * plain `fetch()` rather than the authenticated `request()` helper. Throws on a
 * network error or a non-OK response; callers fall back to the `other` bucket.
 */
export async function fetchProviderCategories(
  version: string,
): Promise<ProviderCategoriesData> {
  const res = await fetch(categoriesUrl(version), {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Failed to load provider categories (${res.status})`);
  }
  const data = (await res.json()) as ProviderCategoriesData;
  if (!data || !Array.isArray(data.categories) || !data.providers) {
    throw new Error('Malformed provider categories document');
  }
  return data;
}

/**
 * The category an engine belongs to, as the published map says; falls back to
 * `other` for anything unlisted or when no document is loaded.
 */
export function categoryForEngine(
  data: ProviderCategoriesData | null,
  engineKey: string,
): string {
  if (!data) return OTHER_CATEGORY_ID;
  return data.providers[engineKey.trim().toLowerCase()] ?? OTHER_CATEGORY_ID;
}

/**
 * Render order of the groups: the published order, with the synthetic `other`
 * bucket appended last. The caller filters this to the groups that actually
 * have engines.
 */
export function categoryOrder(data: ProviderCategoriesData | null): string[] {
  const ids = data?.categories.map((c) => c.id) ?? [];
  return [...ids, OTHER_CATEGORY_ID];
}

/**
 * The published label for a category `id`, or `null` when it is the synthetic
 * `other` bucket or no document is loaded — the caller supplies a localized
 * fallback for those.
 */
export function categoryLabel(
  data: ProviderCategoriesData | null,
  id: string,
): string | null {
  return data?.categories.find((c) => c.id === id)?.label ?? null;
}
