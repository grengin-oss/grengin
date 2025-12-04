// Auth state management
export {
  initAuth,
  setAuth,
  clearAuth,
  logout,
  getAuthState,
  getAccessToken,
  getUser,
  isAuthenticated,
} from './state.svelte.js';
export type { AuthState } from './state.svelte.js';

// Auth API functions (re-exported for convenience)
export { login, initiateOAuth, handleOAuthCallback, getCurrentUser } from '../../api/auth.js';
export { ApiError } from '../../api/client.js';
export { default as OAuthButton } from './components/OAuthButton.svelte';

