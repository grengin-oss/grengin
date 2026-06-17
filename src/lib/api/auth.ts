import type { components } from '../types/api.js';
import { API_BASE, ApiError, request, parseErrorDetail } from './client.js';

type User = components['schemas']['User'];

export interface LoginResponse {
  requires_mfa: boolean;
  mfa_token?: string;
  accessToken?: string;
  refreshToken?: string;
  user?: User;
}

interface AuthInitResponse {
  auth_url: string;
  state: string;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail = parseErrorDetail(body);
    throw new ApiError(response.status, detail);
  }

  return response.json();
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

  // Store provider in sessionStorage so callback can retrieve it
  sessionStorage.setItem('oauth_provider', provider);

  const query = params.toString();
  const url = `${API_BASE}/auth/${provider}${query ? `?${query}` : ''}`;

  // Try fetch first to handle JSON response (200 with auth_url)
  // If backend returns redirect, fetch will fail due to opaque redirect, fall back to navigation
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      redirect: 'manual', // Don't follow redirects automatically
    });

    // If we get a redirect response, navigate to the redirect target
    if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
      // When the API is same-origin (e.g. SSO proxy via Cloudflare Worker), the Location header
      // is readable. Navigate there directly to avoid a second backend request that would
      // generate a new state value and break SSO state validation.
      const location = response.headers.get('Location');
      window.location.href = location || url;
      return;
    }

    // If we get a JSON response with auth_url, redirect to it
    if (response.ok) {
      const data = await response.json();
      if (data.auth_url) {
        window.location.href = data.auth_url;
        return;
      }
    }

    // If response wasn't ok and wasn't a redirect, throw error
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const detail = parseErrorDetail(body);
      throw new ApiError(response.status, detail);
    }
  } catch (err) {
    // If it's already an ApiError, rethrow it
    if (err instanceof ApiError) {
      throw err;
    }
    // For network errors or other issues, fall back to direct navigation
    window.location.href = url;
  }
}

export async function handleOAuthCallback(provider: string, code: string | null, state: string, assertion?: string | null): Promise<LoginResponse> {
  const url = `${API_BASE}/auth/${provider}/callback`;
  const payload: Record<string, string> = { state };
  if (code) payload.code = code;
  if (assertion) payload.assertion = assertion;
  const body = JSON.stringify(payload);

  // Use POST with body to avoid URL length limits (Azure codes are very long)
  // Backend retrieves redirect_uri from stored state, so we only send code and state
  const response = await fetch(url, {
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

  return response.json();
}

export async function getCurrentUser(): Promise<User> {
  return request<User>('/me');
}
