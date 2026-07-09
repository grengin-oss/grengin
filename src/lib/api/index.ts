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
