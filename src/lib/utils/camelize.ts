// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

/**
 * Rewrite snake_case object keys to camelCase, recursively.
 *
 * Some endpoints answer in snake_case on the real backend (`updated_at`,
 * `chat_count`) while the mock server answers in camelCase, and the UI types
 * are camelCase throughout. Converting on the way in satisfies both shapes,
 * because a key with no underscore is passed through untouched.
 *
 * Only the keys of plain objects are rewritten. Strings are left alone, so
 * free-form content is never touched, and non-plain objects (Date, File, Blob)
 * are returned as they are rather than being flattened into `{}`.
 */
export function toCamelCase(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

export function camelizeKeys<T>(value: unknown): T {
  if (Array.isArray(value)) {
    return value.map((item) => camelizeKeys(item)) as unknown as T;
  }

  if (
    value !== null &&
    typeof value === 'object' &&
    (value as object).constructor === Object
  ) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[toCamelCase(k)] = camelizeKeys(v);
    }
    return out as T;
  }

  return value as T;
}
