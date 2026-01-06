import type { components } from '../types/api.js';

type User = components['schemas']['User'];

// Always use /api - proxied by Vite dev server locally, Cloudflare Pages Function in production
export const API_BASE = '/api';

export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string
  ) {
    super(detail);
    this.name = 'ApiError';
  }
}

interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

// Auth state accessors - will be set by auth module to avoid circular deps
let getAccessTokenFn: (() => string | null) | null = null;
let setAuthFn: ((accessToken: string, refreshToken: string, user: User) => void) | null = null;
let clearAuthFn: (() => void) | null = null;

export function setAuthAccessors(
  getToken: () => string | null,
  setAuth: (accessToken: string, refreshToken: string, user: User) => void,
  clearAuth: () => void
): void {
  getAccessTokenFn = getToken;
  setAuthFn = setAuth;
  clearAuthFn = clearAuth;
}

async function tryRefreshToken(): Promise<boolean> {
  const refreshToken = localStorage.getItem('grengin_refresh_token');
  if (!refreshToken || refreshToken === '') {
    return false;
  }

  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!response.ok) {
      return false;
    }

    const data: RefreshResponse = await response.json();
    if (!data.accessToken || !data.user) {
      return false;
    }
    
    setAuthFn?.(data.accessToken, refreshToken, data.user);
    return true;
  } catch {
    return false;
  }
}

export async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAccessTokenFn?.();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    // Try to refresh token
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      // Retry the original request with new token
      const newToken = getAccessTokenFn?.();
      (headers as Record<string, string>)['Authorization'] = `Bearer ${newToken}`;
      const retryResponse = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
      });
      if (!retryResponse.ok) {
        const error = await retryResponse.json().catch(() => ({ detail: 'Request failed' }));
        throw new ApiError(retryResponse.status, error.detail || 'Request failed');
      }
      if (retryResponse.status === 204) {
        return undefined as T;
      }
      return retryResponse.json();
    }
    // Refresh failed, clear auth and redirect to login
    clearAuthFn?.();
    // Redirect to root path - app will show Login component when not authenticated
    window.location.href = '/';
    // Throw error to prevent further execution (though redirect will happen)
    throw new ApiError(401, 'Session expired. Please log in again.');
  }

  if (!response.ok) {
    const error = await response.json().then((body) => (
      { detail: body?.detail?.message || 'Request failed' }
    )).catch(() => (
      { detail: 'Request failed' })
    );

    throw new ApiError(response.status, error.detail || 'Request failed');
  }

  if (response.status === 204) {
    return undefined as T;
  }

  try {
    return await response.json();
  } catch {
    return "Request successful but invalid JSON response." as T;
  }
}
