// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

// Core client
export { ApiError, request, setAuthAccessors } from './client.js';

// Auth API
export { login, logout, initiateOAuth, getCurrentUser, listAuthProviders } from './auth.js';
export type { LoginResponse } from './auth.js';
export type { AuthProviderSummary } from '../authProviders.js';

// Admin API
export * from './admin/AiEngines.js';
