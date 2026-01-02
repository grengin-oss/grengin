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
 * Format a date according to the user's locale
 * @param date - Date object or ISO string
 * @param options - Intl.DateTimeFormatOptions for customization
 * @returns Formatted date string
 */
export function formatDate(
  date: Date | string,
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }
): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
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

