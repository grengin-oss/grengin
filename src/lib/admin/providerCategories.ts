// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

/** Provider grouping returned by the backend discovery endpoint. */
export interface ProviderCategoryDef {
  id: string;
  label: string;
  description?: string;
}
export interface ProviderCategoriesData {
  categories: ProviderCategoryDef[];
  providers: Record<string, string>;
}
export const OTHER_CATEGORY_ID = 'other';

/**
 * The category an engine belongs to, as the published map says; falls back to
 * `other` for anything unlisted or when no document is loaded.
 */
export function categoryForEngine(
  data: ProviderCategoriesData | null,
  engineKey: string,
): string {
  if (!data) return OTHER_CATEGORY_ID;
  const id = data.providers[engineKey.trim().toLowerCase()];
  return data.categories.some((category) => category.id === id) ? id : OTHER_CATEGORY_ID;
}

/**
 * Render order of the groups: the published order, with the synthetic `other`
 * bucket appended last. The caller filters this to the groups that actually
 * have engines.
 */
export function categoryOrder(data: ProviderCategoriesData | null): string[] {
  const ids = data?.categories.map((c) => c.id) ?? [];
  return [...new Set([...ids, OTHER_CATEGORY_ID])];
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
