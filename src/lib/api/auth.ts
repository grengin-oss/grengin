import type { components } from '../types/api.js';
import { API_BASE, ApiError, request } from './client.js';

type User = components['schemas']['User'];

export interface LoginResponse {
  requires_mfa: boolean;
  mfa_token?: string;
  access_token?: string;
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

export async function initiateOAuth(provider: string, redirectUri?: string): Promise<AuthInitResponse> {
  const params = new URLSearchParams();
  if (redirectUri) {
    params.set('redirect_uri', redirectUri);
  }
  const query = params.toString();
  const url = `${API_BASE}/auth/${provider}${query ? `?${query}` : ''}`;

  const response = await fetch(url);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to initiate login' }));
    throw new ApiError(response.status, error.detail || 'Failed to initiate login');
  }

  return response.json();
}

export async function getCurrentUser(): Promise<User> {
  return request<User>('/me');
}
