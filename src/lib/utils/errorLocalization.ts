import { ApiError } from '../api/client';

/**
 * Get localized error text using i18n keys from ApiError
 * Falls back to the provided default text if key doesn't exist
 * 
 * @param error - The error (string, ApiError, or null)
 * @param type - Whether to get 'description' or 'solution'
 * @param translate - The translation function (e.g., $_ from svelte-i18n)
 * @returns Localized error message
 */
export function getLocalizedError(
  error: string | ApiError | null,
  type: 'description' | 'solution',
  translate: (key: string, options?: { values?: Record<string, string> }) => string
): string {
  if (!error) return '';
  
  if (typeof error === 'string') {
    return type === 'description' ? error : '';
  }

  if (error instanceof ApiError) {
    const key = type === 'description' ? error.descriptionKey : error.solutionKey;
    const fallback = type === 'description' ? error.description : error.solution;
    
    if (!key) return fallback || '';
    
    // Get translated text with parameter substitution
    const translated = translate(key, { values: error.params || {} });
    
    // If translation returns the key itself (not found), use fallback
    return translated === key ? (fallback || '') : translated;
  }

  return '';
}

