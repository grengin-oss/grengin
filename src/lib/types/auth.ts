import type { components } from './api.js';

export type User = components['schemas']['User'];

export interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface LoginResponse {
  requires_mfa: boolean;
  mfa_token?: string;
  accessToken?: string;
  refresh_token?: string;
  user?: User;
}
