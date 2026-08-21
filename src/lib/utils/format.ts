// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

import { get } from 'svelte/store';
import { locale } from 'svelte-i18n';

/**
 * Get the current locale string from svelte-i18n store
 * Falls back to 'en' if locale is not available
 */
function getCurrentLocale(): string {
  const currentLocale = get(locale);
  return currentLocale || 'en';
}

/**
 * Check if a date is the Unix epoch (Jan 1, 1970) or invalid
 * Used to detect null/unset timestamps that default to epoch
 */
function isEpochOrInvalid(date: Date): boolean {
  if (isNaN(date.getTime())) return true;
  // Check if date is within 24 hours of Unix epoch (Jan 1, 1970)
  const epochThreshold = 24 * 60 * 60 * 1000; // 24 hours in ms
  return date.getTime() < epochThreshold;
}

/**
 * Format a date according to the user's locale
 * @param date - Date object or ISO string (can be null/undefined)
 * @param options - Intl.DateTimeFormatOptions for customization
 * @param fallback - Text to show for null/invalid/epoch dates (default: "Never")
 * @returns Formatted date string or fallback text
 */
export function formatDate(
  date: Date | string | null | undefined,
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  },
  fallback: string = 'Never'
): string {
  // Handle null/undefined/empty string
  if (!date || (typeof date === 'string' && !date.trim())) {
    return fallback;
  }

  const dateObj = typeof date === 'string' ? new Date(date) : date;

  // Handle invalid dates and Unix epoch (Jan 1, 1970)
  if (isEpochOrInvalid(dateObj)) {
    return fallback;
  }

  const currentLocale = getCurrentLocale();

  try {
    return new Intl.DateTimeFormat(currentLocale, options).format(dateObj);
  } catch {
    // Fallback: use browser default with Intl API
    return new Intl.DateTimeFormat(undefined, options).format(dateObj);
  }
}

/**
 * Format a number according to the user's locale
 * @param value - Number to format
 * @param options - Intl.NumberFormatOptions for customization
 * @returns Formatted number string
 */
export function formatNumber(
  value: number,
  options: Intl.NumberFormatOptions = {}
): string {
  const currentLocale = getCurrentLocale();
  
  try {
    return new Intl.NumberFormat(currentLocale, options).format(value);
  } catch {
    // Fallback: use browser default with Intl API
    return new Intl.NumberFormat(undefined, options).format(value);
  }
}


/**
 * Format a USD amount the way the admin budget UI does everywhere ("$25.00").
 * Kept fixed-locale on purpose: budgets are stored and quoted in USD.
 */
export function formatCurrency(amount: number): string {
  return `$${(amount ?? 0).toFixed(2)}`;
}

/**
 * "Last active" style timestamp, as drawn in usage-analytics-overview.html:
 * "Today, 2:14 PM" for today, "Yesterday", "4 days ago" inside a week, and a
 * plain date beyond that. Wording comes from Intl.RelativeTimeFormat, so no
 * i18n keys are needed.
 */
export function formatRelativeDay(
  date: Date | string | null | undefined,
  fallback: string = 'Never'
): string {
  if (!date || (typeof date === 'string' && !date.trim())) {
    return fallback;
  }

  const dateObj = typeof date === 'string' ? new Date(date) : date;
  if (isEpochOrInvalid(dateObj)) {
    return fallback;
  }

  const currentLocale = getCurrentLocale();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfDay = new Date(dateObj);
  startOfDay.setHours(0, 0, 0, 0);
  const dayDelta = Math.round((startOfDay.getTime() - startOfToday.getTime()) / 86400000);

  if (dayDelta > 0 || dayDelta < -6) {
    return formatDate(
      dateObj,
      { year: 'numeric', month: 'short', day: 'numeric' },
      fallback
    );
  }

  let relative: string;
  try {
    relative = new Intl.RelativeTimeFormat(currentLocale, { numeric: 'auto' }).format(
      dayDelta,
      'day'
    );
  } catch {
    relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(
      dayDelta,
      'day'
    );
  }
  relative = relative.charAt(0).toLocaleUpperCase(currentLocale) + relative.slice(1);

  if (dayDelta !== 0) {
    return relative;
  }

  const time = formatDate(dateObj, { hour: 'numeric', minute: '2-digit' }, fallback);
  return `${relative}, ${time}`;
}
