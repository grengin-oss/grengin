// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

/**
 * Escape text for interpolation into an HTML string.
 *
 * Needed wherever user-controlled values reach `{@html}` — notably i18n
 * messages that carry markup (`<strong>{name}</strong>`): svelte-i18n does not
 * escape `values`, so a project, file or member name containing HTML would
 * otherwise be injected and executed.
 */
export function escapeHtml(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
