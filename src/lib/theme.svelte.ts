import { isTauriRuntime } from './platform/tauri.js';

export type ThemePreference = 'light' | 'system' | 'dark';

export const THEME_CHANGE_EVENT = 'grengin-themechange';

const STORAGE_KEY = 'grengin_theme_preference';
const validThemePreferences: ThemePreference[] = ['light', 'system', 'dark'];

interface ThemeState {
  preference: ThemePreference;
  isDark: boolean;
}

const themeState = $state<ThemeState>({
  preference: 'system',
  isDark: false,
});

let initialized = false;
let mediaQuery: MediaQueryList | null = null;

function isThemePreference(value: string | null): value is ThemePreference {
  return validThemePreferences.includes(value as ThemePreference);
}

function readStoredPreference(): ThemePreference {
  if (typeof localStorage === 'undefined') {
    return 'system';
  }

  const stored = localStorage.getItem(STORAGE_KEY);
  return isThemePreference(stored) ? stored : 'system';
}

function resolveIsDark(preference: ThemePreference): boolean {
  if (preference === 'dark') return true;
  if (preference === 'light') return false;
  return mediaQuery?.matches ?? false;
}

async function syncTauriWindowTheme(preference: ThemePreference): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }

  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().setTheme(preference === 'system' ? null : preference);
  } catch {
    // The web build and older webviews can safely ignore native theme syncing.
  }
}

function emitThemeChange(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(THEME_CHANGE_EVENT, {
      detail: {
        preference: themeState.preference,
        isDark: themeState.isDark,
      },
    }),
  );
}

function applyTheme(): void {
  if (typeof document === 'undefined') {
    return;
  }

  const root = document.documentElement;
  themeState.isDark = resolveIsDark(themeState.preference);

  if (themeState.preference === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.dataset.theme = themeState.preference;
  }

  root.classList.toggle('dark', themeState.isDark);
  root.style.colorScheme = themeState.isDark ? 'dark' : 'light';
  void syncTauriWindowTheme(themeState.preference);
  emitThemeChange();
}

function handleSystemThemeChange(): void {
  if (themeState.preference === 'system') {
    applyTheme();
  }
}

export function initTheme(): void {
  if (initialized || typeof window === 'undefined') {
    return;
  }

  initialized = true;
  mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  themeState.preference = readStoredPreference();
  mediaQuery.addEventListener('change', handleSystemThemeChange);
  applyTheme();
}

export function getThemeState(): ThemeState {
  return themeState;
}

export function setThemePreference(preference: ThemePreference): void {
  themeState.preference = preference;

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, preference);
  }

  applyTheme();
}

export function getEffectiveIsDark(): boolean {
  if (typeof document === 'undefined') {
    return themeState.isDark;
  }

  const explicitPreference = document.documentElement.dataset.theme;
  if (explicitPreference === 'dark') return true;
  if (explicitPreference === 'light') return false;

  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}
