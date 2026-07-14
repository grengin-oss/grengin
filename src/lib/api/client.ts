import type { components } from '../types/api.js';
import { isTauriRuntime } from '../platform/tauri.js';

type User = components['schemas']['User'];

const defaultWebApiBase = '/api';
const defaultTauriApiBase =
  import.meta.env?.VITE_TAURI_API_BASE || 'https://api.demo.devel.grengin.com';
const rawApiBase = import.meta.env?.VITE_API_BASE;

const getDefaultApiBase = (): string => {
  return isTauriRuntime() ? defaultTauriApiBase : defaultWebApiBase;
};

const normalizeBase = (base: string, fallback = getDefaultApiBase()): string => {
  if (!base) {
    return fallback;
  }
  return base.endsWith('/') ? base.slice(0, -1) : base;
};

// Web builds use /api so requests can be proxied locally and via Pages Functions.
// Packaged Tauri builds need an absolute backend URL because local assets are not behind that proxy.
export const API_BASE = normalizeBase(rawApiBase ?? getDefaultApiBase());

export type ApiFetchInit = RequestInit & {
  maxRedirections?: number;
  connectTimeout?: number;
};

export async function apiFetch(input: URL | Request | string, init?: ApiFetchInit): Promise<Response> {
  if (isTauriRuntime()) {
    const { fetch: nativeFetch } = await import('@tauri-apps/plugin-http');
    return nativeFetch(input, init);
  }

  return fetch(input, init);
}

export interface RichErrorDetail {
  type: 'rich';
  code: number;
  description: string;
  solution: string;
  description_key: string;
  solution_key: string;
  params: Record<string, string>;
  external_code: string | null;
}

export class ApiError extends Error {
  public detail: string | RichErrorDetail;

  constructor(
    public status: number,
    detail: string | RichErrorDetail
  ) {
    // Use description as the message if it's a rich error, otherwise use the detail string
    super(typeof detail === 'string' ? detail : detail.description);
    this.name = 'ApiError';
    this.detail = detail;
  }

  // Check if this is a rich error with full internationalization support
  isRichError(): this is ApiError & { detail: RichErrorDetail } {
    return typeof this.detail === 'object' && this.detail.type === 'rich';
  }

  // Convenience getters for rich error properties
  get code(): number | undefined {
    return this.isRichError() ? this.detail.code : undefined;
  }

  get description(): string {
    return this.isRichError() ? this.detail.description : this.detail as string;
  }

  get solution(): string | undefined {
    return this.isRichError() ? this.detail.solution : undefined;
  }

  get descriptionKey(): string | undefined {
    return this.isRichError() ? this.detail.description_key : undefined;
  }

  get solutionKey(): string | undefined {
    return this.isRichError() ? this.detail.solution_key : undefined;
  }

  get params(): Record<string, string> | undefined {
    return this.isRichError() ? this.detail.params : undefined;
  }

  get externalCode(): string | null | undefined {
    return this.isRichError() ? this.detail.external_code : undefined;
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

// Helper to parse error detail from response body (supports both old and new formats)
export function parseErrorDetail(body: any): string | RichErrorDetail {
  if (!body || !body.detail) {
    return 'Request failed';
  }

  const detail = body.detail;

  // New rich error format
  if (typeof detail === 'object' && detail.type === 'rich') {
    return detail as RichErrorDetail;
  }

  // Old string format
  if (typeof detail === 'string') {
    return detail;
  }

  // Old format with message property
  if (typeof detail === 'object' && detail.message) {
    return detail.message;
  }

  return 'Request failed';
}

async function tryRefreshToken(): Promise<boolean> {
  const refreshToken = localStorage.getItem('grengin_refresh_token');
  if (!refreshToken || refreshToken === '') {
    return false;
  }

  try {
    const response = await apiFetch(`${API_BASE}/auth/refresh`, {
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

// Handle 401 errors by attempting token refresh
export async function handleUnauthorized(): Promise<string | null> {
  const refreshed = await tryRefreshToken();
  if (refreshed) {
    return getAccessTokenFn?.() ?? null;
  }
  
  // Refresh failed, clear auth and redirect to login
  clearAuthFn?.();
  window.location.href = '/';
  return null;
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

  const response = await apiFetch(`${API_BASE}${endpoint}`, {
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
      const retryResponse = await apiFetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
      });
      if (!retryResponse.ok) {
        const body = await retryResponse.json().catch(() => null);
        const detail = parseErrorDetail(body);
        throw new ApiError(retryResponse.status, detail);
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
    throw new ApiError(401, {
      type: 'rich',
      code: 401,
      description: 'Session expired. Please log in again.',
      solution: 'Please log in again to continue using the application',
      description_key: 'error.auth.invalid_token.description',
      solution_key: 'error.auth.invalid_token.solution',
      params: {},
      external_code: null,
    });
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail = parseErrorDetail(body);
    throw new ApiError(response.status, detail);
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
