// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

// Core client
export { ApiError, request, setAuthAccessors } from './client.js';

// Auth API
export { login, logout, initiateOAuth, getCurrentUser } from './auth.js';
export type { LoginResponse } from './auth.js';

// User settings API
export { getSettings, updateSettings } from './settings.js';
export type { UserSettings } from './settings.js';

// Admin API
export * from './admin/AiEngines.js';
