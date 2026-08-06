// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

// API client
export { ApiError, request } from './api/index.js';

// Auth feature (includes state + API)
export {
  // State management
  initAuth,
  setAuth,
  clearAuth,
  logout,
  getAuthState,
  getAccessToken,
  getUser,
  isAuthenticated,
  // API functions
  login,
  initiateOAuth,
  getCurrentUser,
} from './features/auth/index.js';
export type { AuthState } from './features/auth/index.js';

// Components
export * from './components/layout/index.js';

// Routes
export * from './routes/index.js';
