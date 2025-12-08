// Core client
export { ApiError, request, setAuthAccessors } from './client.js';

// Auth API
export { login, logout, initiateOAuth, getCurrentUser } from './auth.js';
export type { LoginResponse } from './auth.js';

// Admin API
export * from './adminDashboard.js';
export * from './adminUsers.js';
export * from './adminSettings.js';
export * from './adminAudit.js';