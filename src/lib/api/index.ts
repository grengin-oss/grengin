// Core client
export { ApiError, request, setAuthAccessors } from './client.js';

// Auth API
export { login, logout, initiateOAuth, getCurrentUser } from './auth.js';
export type { LoginResponse } from './auth.js';
