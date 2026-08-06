// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

import type { components } from '../../types/api.js';
import { setAuthAccessors } from '../../api/client.js';
import { logout as apiLogout } from '../../api/auth.js';

type User = components['schemas']['User'];

const TOKEN_KEY = 'grengin_access_token';
const REFRESH_TOKEN_KEY = 'grengin_refresh_token';
const USER_KEY = 'grengin_user';

export interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

// Reactive state using Svelte 5 signals
let authState = $state<AuthState>({
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  isLoading: true,
});

function loadFromStorage(): void {
  try {
    const accessToken = localStorage.getItem(TOKEN_KEY);
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    const userJson = localStorage.getItem(USER_KEY);
    const user = userJson ? JSON.parse(userJson) : null;

    // For now, just check if token exists (skip validation)
    // Token validation will happen when making actual API calls
    if (accessToken && user) {
      authState.accessToken = accessToken;
      authState.refreshToken = refreshToken;
      authState.user = user;
      authState.isAuthenticated = true;
    } else {
      clearAuth();
    }
  } catch {
    clearAuth();
  }
  authState.isLoading = false;
}

function saveToStorage(accessToken: string, refreshToken: string, user: User): void {
  localStorage.setItem(TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

function clearStorage(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function initAuth(): void {
  // Register auth accessors with the API client
  setAuthAccessors(getAccessToken, setAuth, clearAuth);
  loadFromStorage();
}

export function setAuth(accessToken: string, refreshToken: string, user: User): void {
  saveToStorage(accessToken, refreshToken, user);
  authState.accessToken = accessToken;
  authState.refreshToken = refreshToken;
  authState.user = user;
  authState.isAuthenticated = true;
  authState.isLoading = false;
}

export function clearAuth(): void {
  clearStorage();
  authState.accessToken = null;
  authState.refreshToken = null;
  authState.user = null;
  authState.isAuthenticated = false;
  authState.isLoading = false;
}

export async function logout(): Promise<void> {
  try {
    await apiLogout();
  } finally {
    clearAuth();
  }
}

export function getAuthState(): AuthState {
  return authState;
}

export function getAccessToken(): string | null {
  return authState.accessToken;
}

export function getUser(): User | null {
  return authState.user;
}

export function isAuthenticated(): boolean {
  return authState.isAuthenticated;
}
