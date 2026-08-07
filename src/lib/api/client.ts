// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

import type { components } from '../types/api.js';
import { isTauriRuntime } from '../platform/tauri.js';

type User = components['schemas']['User'];

const defaultWebApiBase = 'https://grengin-test-production.up.railway.app';
const defaultTauriApiBase =
  import.meta.env?.VITE_TAURI_API_BASE || 'https://api.demo.devel.grengin.com';
const rawApiBase = import.meta.env?.VITE_API_BASE;
const apiBaseOverrideStorageKey = 'grengin_api_base_override';

export const API_BASE_CHANGE_EVENT = 'grengin-api-base-change';

const getRuntimeDefaultApiBase = (): string => {
  return isTauriRuntime() ? defaultTauriApiBase : defaultWebApiBase;
};

const normalizeBase = (base: string, fallback = getRuntimeDefaultApiBase()): string => {
  const value = base.trim() || fallback;
  return value.replace(/\/+$/, '');
};

function getLocalStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function readStoredApiBaseOverride(): string | null {
  const storage = getLocalStorage();
  const stored = storage?.getItem(apiBaseOverrideStorageKey)?.trim();

  if (!stored) {
    return null;
  }

  try {
    return normalizeApiBaseInput(stored);
  } catch {
    try {
      storage?.removeItem(apiBaseOverrideStorageKey);
    } catch {
      // Ignore storage failures and fall back to the configured default.
    }
    return null;
  }
}

function emitApiBaseChange(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(API_BASE_CHANGE_EVENT, {
      detail: { apiBase: API_BASE, override: getApiBaseOverride() },
    }),
  );
}

export function getDefaultApiBase(): string {
  if (isTauriRuntime()) {
    return normalizeBase(defaultTauriApiBase);
  }

  return normalizeBase(rawApiBase ?? defaultWebApiBase);
}

export function getApiBaseOverride(): string | null {
  return readStoredApiBaseOverride();
}

export function getApiBase(): string {
  return API_BASE;
}

export function normalizeApiBaseInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error('Backend URL is required.');
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Enter a valid absolute URL.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Backend URL must start with http:// or https://.');
  }

  if (isTauriRuntime() && !import.meta.env.DEV && parsed.protocol !== 'https:') {
    throw new Error('Packaged apps require an HTTPS backend URL.');
  }

  if (parsed.search || parsed.hash) {
    throw new Error('Backend URL cannot include query parameters or fragments.');
  }

  return normalizeBase(parsed.href);
}

export function setApiBaseOverride(value: string): string {
  const storage = getLocalStorage();
  if (!storage) {
    throw new Error('Backend URL storage is unavailable.');
  }

  const normalized = normalizeApiBaseInput(value);
  try {
    storage.setItem(apiBaseOverrideStorageKey, normalized);
  } catch {
    throw new Error('Backend URL storage is unavailable.');
  }

  API_BASE = normalized;
  emitApiBaseChange();
  return API_BASE;
}

export function resetApiBaseOverride(): string {
  try {
    getLocalStorage()?.removeItem(apiBaseOverrideStorageKey);
  } catch {
    // Ignore storage failures; the in-memory value still resets for this session.
  }

  API_BASE = getDefaultApiBase();
  emitApiBaseChange();
  return API_BASE;
}

// Web builds use main's default backend unless VITE_API_BASE overrides it.
// Packaged Tauri builds need an absolute backend URL because local assets are not behind that proxy.
export let API_BASE = getApiBaseOverride() ?? getDefaultApiBase();

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
