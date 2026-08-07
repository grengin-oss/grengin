// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

import type { components } from '../types/api.js';
import { API_BASE, ApiError, request, parseErrorDetail, apiFetch } from './client.js';
import {
  isTauriRuntime,
  normalizeMobileCallbackProvider,
  openNativeExternalUrl,
  openNativeOAuthPopup,
  shouldUseNativeExternalOAuth,
} from '../platform/tauri.js';
import { savePendingOAuth } from '../features/auth/pendingOAuth.js';
import { watchForPendingOAuthCallback } from '../features/auth/nativeDeepLink.js';

type User = components['schemas']['User'];

export interface LoginResponse {
  requires_mfa: boolean;
  mfa_token?: string;
  accessToken?: string;
  refreshToken?: string;
  access_token?: string;
  refresh_token?: string;
  user?: User;
}

interface AuthInitResponse {
  auth_url: string;
  state: string;
}

async function getOAuthRedirectTarget(url: string): Promise<string> {
  const response = await apiFetch(url, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
    redirect: 'manual',
    maxRedirections: 0,
  });

  if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
    return response.headers.get('Location') || url;
  }

  if (response.ok) {
    const data: Partial<AuthInitResponse> = await response.json();
    if (data.auth_url) {
      return data.auth_url;
    }
    return url;
  }

  const body = await response.json().catch(() => null);
  const detail = parseErrorDetail(body);
  throw new ApiError(response.status, detail);
}

async function openOAuthUrl(url: string, provider: string): Promise<void> {
  if (isTauriRuntime()) {
    if (shouldUseNativeExternalOAuth(provider)) {
      const didOpenExternal = await openNativeExternalUrl(url);
      if (didOpenExternal) {
        return;
      }

      // Microsoft refuses to sign in from an embedded WebView, and navigating the
      // app's own WebView to the auth URL destroys the app shell with no way back
      // (the `msauth://` redirect cannot re-enter a page that no longer exists).
      // Surface the failure instead of falling into either dead end.
      throw new Error(`Failed to open the system browser for ${provider} sign-in`);
    }

    const didOpenPopup = await openNativeOAuthPopup(url);
    if (didOpenPopup) {
      return;
    }
  }

  window.location.href = url;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const response = await apiFetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail = parseErrorDetail(body);
    throw new ApiError(response.status, detail);
  }

  const data: LoginResponse = await response.json();
  return {
    ...data,
    accessToken: data.accessToken ?? data.access_token,
    refreshToken: data.refreshToken ?? data.refresh_token,
  };
}

export async function logout(): Promise<void> {
  try {
    await request('/auth/logout', { method: 'POST' });
  } catch {
    // Ignore errors on logout
  }
}

export async function initiateOAuth(provider: string, redirectUri?: string): Promise<void> {
  const params = new URLSearchParams();
  if (redirectUri) {
    params.set('redirect_uri', redirectUri);
  }

  const isNativeExternal = isTauriRuntime() && shouldUseNativeExternalOAuth(provider);

  // Store provider in sessionStorage so callback can retrieve it
  sessionStorage.setItem('oauth_provider', provider);

  // The native flow hands off to the system browser, and Android may destroy this
  // WebView (or the whole process) before the callback returns — which wipes
  // sessionStorage. Everything the callback needs also goes to localStorage.
  savePendingOAuth({
    provider,
    mobile: isNativeExternal,
    returnUrl: sessionStorage.getItem('auth_return_url') || '/',
  });

  const query = params.toString();
  const url = `${API_BASE}/auth/${provider}${query ? `?${query}` : ''}`;

  // On native Android, use the system auth surface for Azure/MSA. Opening the
  // resolved Microsoft URL avoids rendering the backend redirect hop.
  if (isNativeExternal) {
    sessionStorage.setItem('oauth_mobile_callback', 'true');
    const authUrl = await getOAuthRedirectTarget(url);

    // Arm the deep-link recovery poll before we lose the foreground, so a dropped
    // `deep-link://new-url` event is still picked up from the native intent.
    watchForPendingOAuthCallback();

    await openOAuthUrl(authUrl, provider);
    return;
  }

  // Try fetch first to handle JSON response (200 with auth_url)
  // If backend returns redirect, fetch will fail due to opaque redirect, fall back to navigation
  try {
    await openOAuthUrl(await getOAuthRedirectTarget(url), provider);
  } catch (err) {
    // If it's already an ApiError, rethrow it
    if (err instanceof ApiError) {
      throw err;
    }
    // For network errors or other issues, fall back to direct navigation
    await openOAuthUrl(url, provider);
  }
}

export async function handleOAuthCallback(
  provider: string,
  code: string | null,
  state: string,
  options: { assertion?: string | null; mobile?: boolean } = {}
): Promise<LoginResponse> {
  // The mobile (public-client) exchange only exists for Azure; a tenant labelled
  // `microsoft` must still POST to the azure route.
  const callbackPath = options.mobile
    ? `/auth/${normalizeMobileCallbackProvider(provider)}/mobile/callback`
    : `/auth/${provider}/callback`;
  const url = `${API_BASE}${callbackPath}`;
  const payload: Record<string, string> = { state };
  if (code) payload.code = code;
  if (options.assertion) payload.assertion = options.assertion;
  const body = JSON.stringify(payload);

  // Use POST with body to avoid URL length limits (Azure codes are very long)
  // Backend retrieves redirect_uri from stored state, so we only send code and state
  const response = await apiFetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body,
  });

  if (!response.ok) {
    const responseText = await response.text();
    const body = responseText ? JSON.parse(responseText) : null;
    const detail = parseErrorDetail(body);
    throw new ApiError(response.status, detail);
  }

  const data: LoginResponse = await response.json();
  return {
    ...data,
    accessToken: data.accessToken ?? data.access_token,
    refreshToken: data.refreshToken ?? data.refresh_token,
  };
}

export async function getCurrentUser(): Promise<User> {
  return request<User>('/me');
}
