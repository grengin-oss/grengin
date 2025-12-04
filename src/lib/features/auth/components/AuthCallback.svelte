<script lang="ts">
  import { onMount } from 'svelte';
  import { setAuth, ApiError, handleOAuthCallback } from '../index.js';
  import { toast } from '../../../components/Toaster.svelte';

  // UI State
  type CallbackStatus = 'processing' | 'success' | 'error';
  let status = $state<CallbackStatus>('processing');

  // Constants
  const REDIRECT_DELAY_SUCCESS = 300; // ms
  const REDIRECT_DELAY_ERROR = 3000; // ms

  /**
   * Process OAuth callback
   * Extracts parameters, calls backend, and handles authentication
   */
  async function processOAuthCallback(): Promise<void> {
    const params = new URLSearchParams(window.location.search);

    // 1. Check for OAuth provider errors
    const error = params.get('error');
    if (error) {
      const errorDesc = params.get('error_description') || error;
      toast.error(errorDesc);
      throw new Error(errorDesc);
    }

    // 2. Validate required OAuth parameters
    const state = params.get('state');
    const code = params.get('code');
    if (!state || !code) {
      const message = 'Missing required OAuth parameters (state or code)';
      toast.error(message);
      throw new Error(message);
    }

    // 3. Retrieve provider from session storage
    const provider = sessionStorage.getItem('oauth_provider');
    if (!provider) {
      const message = 'OAuth provider not found. Please try logging in again.';
      toast.error(message);
      throw new Error(message);
    }

    // 4. Call backend OAuth callback endpoint
    const response = await handleOAuthCallback(provider, code, state);

    // 5. Validate response and store authentication
    if (!response?.accessToken || !response?.user) {
      const message = 'Invalid authentication response from server';
      toast.error(message);
      throw new Error(message);
    }

    setAuth(response.accessToken, response.refresh_token || '', response.user);
    return;
  }

  /**
   * Clean up session storage
   */
  function cleanupSessionStorage(): void {
    sessionStorage.removeItem('oauth_provider');
  }

  /**
   * Redirect to return URL after successful authentication
   */
  function redirectAfterSuccess(): void {
    const returnUrl = sessionStorage.getItem('auth_return_url') || '/';
    sessionStorage.removeItem('auth_return_url');
    
    setTimeout(() => {
      window.location.href = returnUrl;
    }, REDIRECT_DELAY_SUCCESS);
  }

  /**
   * Redirect to home page after error
   */
  function redirectAfterError(): void {
    setTimeout(() => {
      window.location.href = '/';
    }, REDIRECT_DELAY_ERROR);
  }

  /**
   * Handle errors and show toast notification
   */
  function handleError(err: unknown): void {
    console.error('OAuth callback error:', err);
    
    let errorMessage: string;
    if (err instanceof ApiError) {
      errorMessage = err.detail;
    } else if (err instanceof Error) {
      errorMessage = err.message;
    } else {
      errorMessage = 'An unexpected error occurred during authentication';
    }
    
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
      handleError(err);
    }
  });
</script>

<div class="callback-container">
  <div class="callback-card">
    <img src="/grengin-icon.svg" alt="Grengin" class="callback-logo" />

    {#if status === 'processing'}
      <div class="callback-content">
        <div class="status-icon processing">
          <div class="spinner"></div>
        </div>
        <h2>Completing sign in...</h2>
        <p class="status-message">Please wait while we verify your credentials</p>
      </div>
    {:else if status === 'success'}
      <div class="callback-content">
        <div class="status-icon success">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>
        <h2>Sign in successful!</h2>
        <p class="status-message">Redirecting you to the application...</p>
      </div>
    {:else if status === 'error'}
      <div class="callback-content">
        <div class="status-icon error">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="15" y1="9" x2="9" y2="15"></line>
            <line x1="9" y1="9" x2="15" y2="15"></line>
          </svg>
        </div>
        <h2>Sign in failed</h2>
        <p class="status-submessage">Redirecting you back to the login page...</p>
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
    padding: var(--space-xl);
    background: var(--bg-primary);
  }

  .callback-card {
    width: 100%;
    max-width: 400px;
    padding: var(--space-3xl);
    background: rgba(var(--glass-tint), 0.04);
    backdrop-filter: blur(1.5rem);
    -webkit-backdrop-filter: blur(1.5rem);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-xl);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.08),
      0 8px 32px rgba(0, 0, 0, 0.12);
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-xl);
  }

  .callback-logo {
    width: 4rem;
    height: 4rem;
  }

  .callback-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-lg);
  }

  .status-icon {
    width: 4rem;
    height: 4rem;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .status-icon.processing {
    background: rgba(var(--brand-rgb), 0.15);
  }

  .status-icon.success {
    background: rgba(var(--brand-green-rgb), 0.15);
    color: var(--brand-green);
  }

  .status-icon.error {
    background: rgba(var(--brand-red-rgb), 0.15);
    color: var(--brand-red);
  }

  .status-icon svg {
    width: 2rem;
    height: 2rem;
  }

  .spinner {
    width: 2rem;
    height: 2rem;
    border: 3px solid rgba(var(--brand-rgb), 0.2);
    border-top-color: var(--brand);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  h2 {
    color: var(--text-primary);
    font-size: 1.5rem;
    font-weight: 600;
    margin: 0;
  }

  .status-message {
    color: var(--text-secondary);
    font-size: 1rem;
    margin: 0;
  }

  .status-submessage {
    color: var(--text-secondary);
    font-size: 0.875rem;
    opacity: 0.7;
    margin: 0;
  }

  @media (max-width: 480px) {
    .callback-card {
      padding: var(--space-2xl);
    }

    h2 {
      font-size: 1.25rem;
    }

    .status-message {
      font-size: 0.875rem;
    }
  }
</style>
