<script module lang="ts">
  const inFlightOAuthCallbacks = new Map<string, Promise<void>>();
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import { navigate } from 'svelte-routing';
  import { setAuth, ApiError, handleOAuthCallback } from '../index.js';
  import { toast } from '../../../components/Toaster.svelte';
  import { _ } from 'svelte-i18n';
  import { getLocalizedError } from '../../../utils/errorLocalization';
  import { API_BASE, apiFetch } from '../../../api/client.js';
  import type { LoginResponse } from '../../../api/auth.js';

  // UI State
  type CallbackStatus = 'processing' | 'success' | 'error';
  let status = $state<CallbackStatus>('processing');

  // Constants
  const REDIRECT_DELAY_SUCCESS = 300; // ms
  const REDIRECT_DELAY_ERROR = 3000; // ms

  function getProviderFromPath(): string | null {
    return window.location.pathname.match(/^\/auth\/([^/]+)\/(?:mobile\/)?callback$/)?.[1] ?? null;
  }

  function isMobileCallbackPath(): boolean {
    return /^\/auth\/[^/]+\/mobile\/callback$/.test(window.location.pathname);
  }

  /**
   * Try SSO proxy fallback — frontend only.
   * When sso.grengin.com completes auth server-side, the callback URL may have
   * no standard code/state. Check all URL locations for a token the proxy may
   * have passed directly (access_token, token, id_token — in query or hash).
   */
  async function trySSOProxyFallback(): Promise<boolean> {
    const queryParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));

    // Debug: log every param in the URL so we can see what the SSO proxy sent
    console.debug('[AuthCallback] SSO proxy fallback — URL params:', {
      search: window.location.search,
      hash: window.location.hash,
      query: Object.fromEntries(queryParams.entries()),
      hash_params: Object.fromEntries(hashParams.entries()),
    });

    // Check all common token param names (query string first, then hash fragment)
    const accessToken =
      queryParams.get('access_token') ?? hashParams.get('access_token') ??
      queryParams.get('token')        ?? hashParams.get('token')        ??
      queryParams.get('id_token')     ?? hashParams.get('id_token');

    if (!accessToken) return false;

    try {
      // SSO proxy passed a token directly — validate it and fetch user profile
      const response = await apiFetch(`${API_BASE}/me`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      });
      if (response.ok) {
        const user = await response.json();
        if (user?.id) {
          setAuth(accessToken, '', user);
          return true;
        }
      }
    } catch {
      // Network error — fall through to show normal error
    }
    return false;
  }

  /**
   * Process OAuth callback
   * Extracts parameters, calls backend, and handles authentication.
   * Supports: standard OAuth code/state flow, SSO proxy token flow, and hash fragment params.
   */
  async function processOAuthCallback(): Promise<void> {
    const params = new URLSearchParams(window.location.search);
    // Also check hash fragment (some SSO proxies use implicit flow)
    const hashParams = new URLSearchParams(window.location.hash.replace('#', ''));

    // 1. Check for OAuth provider errors
    const error = params.get('error') || hashParams.get('error');
    if (error) {
      const errorDesc = params.get('error_description') || hashParams.get('error_description') || error;
      toast.error(errorDesc);
      throw new Error(errorDesc);
    }

    // 2. Extract OAuth parameters — check both query string and hash fragment
    const state = params.get('state') || hashParams.get('state');
    const code = params.get('code') || hashParams.get('code');
    const assertion = params.get('assertion') || hashParams.get('assertion');

    // 3. Retrieve provider from session storage, with path fallback for native deep links
    const provider = sessionStorage.getItem('oauth_provider') || getProviderFromPath();
    if (!provider) {
      const message = $_('error.auth.oauth_provider_not_found');
      throw new ApiError(400, message);
    }

    const isMobileCallback =
      isMobileCallbackPath() || sessionStorage.getItem('oauth_mobile_callback') === 'true';

    if (!state || (!code && !assertion)) {
      // No standard code/state and no assertion - try legacy SSO proxy fallback (token in URL)
      console.warn('[AuthCallback] No code/state/assertion in URL, attempting SSO proxy fallback...');
      const ssoSuccess = await trySSOProxyFallback();
      if (ssoSuccess) {
        return;
      }
      const message = $_('error.auth.missing_oauth_params');
      throw new ApiError(400, message);
    }

    const callbackKey = `${provider}:${state}:${isMobileCallback ? 'mobile' : 'web'}`;
    const existingCallback = inFlightOAuthCallbacks.get(callbackKey);
    if (existingCallback) {
      await existingCallback;
      return;
    }

    const callbackPromise = (async () => {
      let response: LoginResponse;

      if (assertion) {
        // SSO proxy flow: assertion JWT + state - forward directly to API callback
        response = await handleOAuthCallback(provider, null, state, {
          assertion,
          mobile: isMobileCallback,
        });
      } else {
        // Standard OAuth code flow
        response = await handleOAuthCallback(provider, code, state, {
          mobile: isMobileCallback,
        });
      }

      // Validate response and store authentication
      if (!response?.accessToken || !response?.user) {
        const message = $_('error.auth.invalid_auth_response');
        toast.error(message);
        throw new Error(message);
      }

      setAuth(response.accessToken, response.refreshToken || '', response.user);
    })();

    inFlightOAuthCallbacks.set(callbackKey, callbackPromise);

    try {
      await callbackPromise;
    } finally {
      window.setTimeout(() => {
        if (inFlightOAuthCallbacks.get(callbackKey) === callbackPromise) {
          inFlightOAuthCallbacks.delete(callbackKey);
        }
      }, 30_000);
    }
  }

  /**
   * Clean up session storage
   */
  function cleanupSessionStorage(): void {
    sessionStorage.removeItem('oauth_provider');
    sessionStorage.removeItem('oauth_mobile_callback');
  }

  function navigateInApp(target: string): void {
    try {
      const parsed = new URL(target, window.location.origin);
      if (parsed.origin === window.location.origin) {
        navigate(`${parsed.pathname}${parsed.search}${parsed.hash}`, { replace: true });
        return;
      }
    } catch {
      // Fallback below.
    }

    window.location.assign(target);
  }

  /**
   * Redirect to return URL after successful authentication
   */
  function redirectAfterSuccess(): void {
    const returnUrl = sessionStorage.getItem('auth_return_url') || '/';
    sessionStorage.removeItem('auth_return_url');
    
    setTimeout(() => {
      navigateInApp(returnUrl);
    }, REDIRECT_DELAY_SUCCESS);
  }

  /**
   * Redirect to home page after error
   */
  function redirectAfterError(): void {
    setTimeout(() => {
      navigate('/', { replace: true });
    }, REDIRECT_DELAY_ERROR);
  }

  /**
   * Handle errors and show toast notification
   */
  function handleError(err: ApiError): void {
    console.error('OAuth callback error:', err);
    
    const errorMessage = getLocalizedError(err, 'description', $_) || err.description;
    
    // Show error toast
    toast.error(errorMessage);
    
    status = 'error';
    redirectAfterError();
  }

  // Initialize OAuth callback processing on component mount
  onMount(async () => {
    try {
      await processOAuthCallback();
      cleanupSessionStorage();
      status = 'success';
      redirectAfterSuccess();
    } catch (err: unknown) {
      cleanupSessionStorage();
      // Convert all errors to ApiError for consistent handling
      const apiError = err instanceof ApiError 
        ? err 
        : new ApiError(500, err instanceof Error ? err.message : $_('error.fallback.description'));
      handleError(apiError);
    }
  });
</script>

<div class="callback-container">
  <div class="callback-card">
    {#if status === 'processing'}
      <div class="callback-content">
        <div class="brand-header">
          <img src="/grengin-icon.svg" alt="Grengin" class="callback-logo" />
          <div class="brand-text">
            <h1 class="brand-name">Grengin</h1>
            <p class="brand-tagline">{$_('auth.authenticationInProgress')}</p>
          </div>
        </div>
        
        <div class="processing-section">
          <div class="spinner-container">
            <div class="spinner"></div>
            <div class="pulse-ring"></div>
          </div>
          <div class="status-text">
            <h2>{$_('auth.completingSignIn')}</h2>
            <p class="status-message">{$_('auth.pleaseWaitVerifying')}</p>
          </div>
        </div>
      </div>
    {:else if status === 'success'}
      <div class="callback-content">
        <div class="brand-header">
          <img src="/grengin-icon.svg" alt="Grengin" class="callback-logo" />
          <div class="brand-text">
            <h1 class="brand-name">Grengin</h1>
            <p class="brand-tagline">{$_('auth.authenticationComplete')}</p>
          </div>
        </div>
        
        <div class="success-section">
          <div class="status-icon success">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
          <div class="status-text">
            <h2>{$_('auth.signInSuccessful')}</h2>
            <p class="status-message">{$_('auth.redirectingToWorkspace')}</p>
          </div>
        </div>
      </div>
    {:else if status === 'error'}
      <div class="callback-content">
        <div class="brand-header">
          <img src="/grengin-icon.svg" alt="Grengin" class="callback-logo" />
          <div class="brand-text">
            <h1 class="brand-name">Grengin</h1>
            <p class="brand-tagline">{$_('auth.authenticationFailed')}</p>
          </div>
        </div>
        
        <div class="error-section">
          <div class="status-icon error">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="15" y1="9" x2="9" y2="15"></line>
              <line x1="9" y1="9" x2="15" y2="15"></line>
            </svg>
          </div>
          <div class="status-text">
            <h2>{$_('auth.signInFailed')}</h2>
            <p class="status-submessage">{$_('auth.redirectingToLogin')}</p>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .callback-container {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  }

  .callback-card {
    width: 100%;
    max-width: 400px;
    padding: 0;
    background: rgba(255, 255, 255, 0.98);
    border: 1px solid #eaeaea;
    border-radius: 20px;
    box-shadow: 
      0 32px 64px rgba(0, 0, 0, 0.12),
      0 0 0 1px rgba(255, 255, 255, 0.1);
    overflow: hidden;
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
  }

  .callback-content {
    display: flex;
    flex-direction: column;
    min-height: 400px;
  }

  .brand-header {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 32px 32px 24px 32px;
    background: linear-gradient(135deg, rgba(102, 126, 234, 0.05) 0%, rgba(118, 75, 162, 0.05) 100%);
    border-bottom: 1px solid rgba(102, 126, 234, 0.1);
  }

  .callback-logo {
    width: 48px;
    height: 48px;
    flex-shrink: 0;
  }

  .brand-text {
    flex: 1;
  }

  .brand-name {
    font-size: 24px;
    font-weight: 700;
    color: #1a202c;
    margin: 0 0 4px 0;
    letter-spacing: -0.025em;
  }

  .brand-tagline {
    font-size: 14px;
    color: #718096;
    margin: 0;
    font-weight: 500;
  }

  .processing-section,
  .success-section,
  .error-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 40px 32px;
    text-align: center;
    flex: 1;
  }

  .spinner-container {
    position: relative;
    width: 80px;
    height: 80px;
    margin-bottom: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid rgba(102, 126, 234, 0.15);
    border-top-color: #667eea;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    z-index: 2;
    position: relative;
  }

  .pulse-ring {
    position: absolute;
    width: 80px;
    height: 80px;
    border: 2px solid rgba(102, 126, 234, 0.2);
    border-radius: 50%;
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes pulse {
    0% {
      transform: scale(0.8);
      opacity: 1;
    }
    50% {
      transform: scale(1.1);
      opacity: 0.3;
    }
    100% {
      transform: scale(0.8);
      opacity: 1;
    }
  }

  .status-icon {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 24px;
  }

  .status-icon.success {
    background: linear-gradient(135deg, rgba(72, 187, 120, 0.1) 0%, rgba(56, 161, 105, 0.1) 100%);
    color: #48bb78;
    border: 1px solid rgba(72, 187, 120, 0.2);
  }

  .status-icon.error {
    background: linear-gradient(135deg, rgba(245, 101, 101, 0.1) 0%, rgba(229, 62, 62, 0.1) 100%);
    color: #f56565;
    border: 1px solid rgba(245, 101, 101, 0.2);
  }

  .status-icon svg {
    width: 32px;
    height: 32px;
  }

  .status-text {
    max-width: 320px;
  }

  h2 {
    font-size: 20px;
    font-weight: 600;
    color: #1a202c;
    margin: 0 0 8px 0;
    letter-spacing: -0.025em;
  }

  .status-message {
    font-size: 15px;
    color: #4a5568;
    margin: 0;
    line-height: 1.5;
  }

  .status-submessage {
    font-size: 14px;
    color: #718096;
    margin: 8px 0 0 0;
    line-height: 1.4;
  }

  /* Mobile responsive */
  @media (max-width: 480px) {
    .callback-container {
      padding: 16px;
    }

    .callback-card {
      max-width: 100%;
    }

    .brand-header {
      padding: 24px 20px 20px 20px;
    }

    .processing-section,
    .success-section,
    .error-section {
      padding: 32px 20px;
    }

    .brand-name {
      font-size: 20px;
    }

    .brand-tagline {
      font-size: 13px;
    }

    h2 {
      font-size: 18px;
    }

    .status-message {
      font-size: 14px;
    }

    .spinner-container {
      width: 64px;
      height: 64px;
    }

    .spinner {
      width: 32px;
      height: 32px;
    }

    .pulse-ring {
      width: 64px;
      height: 64px;
    }

    .status-icon {
      width: 56px;
      height: 56px;
    }

    .status-icon svg {
      width: 28px;
      height: 28px;
    }
  }

  /* Dark mode support */
  @media (prefers-color-scheme: dark) {
    .callback-card {
      background: rgba(45, 55, 72, 0.98);
      color: #e2e8f0;
    }

    .brand-header {
      background: linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%);
      border-bottom-color: rgba(102, 126, 234, 0.2);
    }

    .brand-name {
      color: #f7fafc;
    }

    .brand-tagline {
      color: #cbd5e0;
    }

    h2 {
      color: #f7fafc;
    }

    .status-message {
      color: #cbd5e0;
    }

    .status-submessage {
      color: #a0aec0;
    }
  }
</style>
