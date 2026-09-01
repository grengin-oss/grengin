// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

export interface AuthProviderSummary {
  provider: string;
  name: string;
  login_path: string;
  is_enabled?: boolean;
  auto_redirect: boolean;
}

export interface ProviderIconSources {
  light: string;
  dark: string;
}

const PROVIDER_SLUG = /^[a-z][a-z0-9-]{0,62}$/;
const LOCAL_ICONS = new Set(['azure', 'github', 'google']);

export function normalizeAuthProviders(value: unknown): AuthProviderSummary[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry): AuthProviderSummary[] => {
    if (!entry || typeof entry !== 'object') return [];
    const provider = 'provider' in entry ? entry.provider : undefined;
    const name = 'name' in entry ? entry.name : undefined;
    const loginPath = 'login_path' in entry ? entry.login_path : undefined;
    const isEnabled = 'is_enabled' in entry ? entry.is_enabled : undefined;
    const autoRedirect = 'auto_redirect' in entry ? entry.auto_redirect : false;

    if (
      typeof provider !== 'string' ||
      !PROVIDER_SLUG.test(provider) ||
      typeof name !== 'string' ||
      !name.trim() ||
      typeof loginPath !== 'string' ||
      loginPath !== `/auth/${provider}` ||
      (isEnabled !== undefined && typeof isEnabled !== 'boolean') ||
      typeof autoRedirect !== 'boolean'
    ) {
      return [];
    }

    return [{
      provider,
      name: name.trim(),
      login_path: loginPath,
      is_enabled: isEnabled,
      auto_redirect: autoRedirect,
    }];
  });
}

export function enabledAuthProviders(providers: AuthProviderSummary[]): AuthProviderSummary[] {
  // Older API versions returned enabled providers only and omitted is_enabled.
  return providers.filter((provider) => provider.is_enabled !== false);
}

export function providerFromCallbackPath(pathname: string): string | null {
  const match = pathname.match(/^\/auth\/([^/]+)\/callback$/);
  if (!match) return null;

  let provider: string;
  try {
    provider = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  return PROVIDER_SLUG.test(provider) ? provider : null;
}

export function providerIconSources(provider: string): ProviderIconSources {
  if (LOCAL_ICONS.has(provider)) {
    return { light: `/${provider}.svg`, dark: `/${provider}.svg` };
  }

  const encodedProvider = encodeURIComponent(provider);
  const base = `https://meta.grengin.com/auth-providers/${encodedProvider}`;
  return {
    light: `${base}/icon.svg`,
    dark: `${base}/icon-dark.svg`,
  };
}
