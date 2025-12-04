import type { components } from '../types/api.js';
import { API_BASE, ApiError, request } from './client.js';

type User = components['schemas']['User'];

export interface LoginResponse {
  requires_mfa: boolean;
  mfa_token?: string;
  accessToken?: string;
  refresh_token?: string;
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
    const error = await response.json().catch(() => ({ detail: 'Login failed' }));
    throw new ApiError(response.status, error.detail || 'Login failed');
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

export async function initiateOAuth(provider: string, redirectUri?: string): Promise<AuthInitResponse | undefined> {
  let url = `${API_BASE}/auth/${provider}`;
  
  if (redirectUri) {
    const params = new URLSearchParams({ redirect_uri: redirectUri });
    url += `?${params.toString()}`;
  }

  // Store provider in sessionStorage so callback can retrieve it
  sessionStorage.setItem('oauth_provider', provider);

  // For OAuth, just redirect directly to the endpoint
  // The server will return 303 and browser will follow to OAuth provider
  window.location.href = url;
  return undefined;
}

export async function handleOAuthCallback(provider: string, code: string, state: string): Promise<LoginResponse> {
  const params = new URLSearchParams({ code, state });
  const url = `${API_BASE}/auth/${provider}/callback?${params.toString()}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: { 'accept': 'application/json' },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'OAuth callback failed' }));
    throw new ApiError(response.status, error.detail || 'OAuth callback failed');
  }

  return response.json();
}

export async function getCurrentUser(): Promise<User> {
  return request<User>('/me');
}
