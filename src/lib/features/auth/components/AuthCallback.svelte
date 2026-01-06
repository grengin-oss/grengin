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
      redirectAfterError();
      return;
    }

    // 3. Retrieve provider from session storage
    const provider = sessionStorage.getItem('oauth_provider');
    if (!provider) {
      const message = 'OAuth provider not found. Please try logging in again.';
      toast.error(message);
      redirectAfterError();
      return;
    }

    // 4. Call backend OAuth callback endpoint
    const response = await handleOAuthCallback(provider, code, state);

    // 5. Validate response and store authentication
    if (!response?.accessToken || !response?.user) {
      const message = 'Invalid authentication response from server';
      toast.error(message);
      throw new Error(message);
    }

    setAuth(response.accessToken, response.refreshToken || '', response.user);
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
    console.log('AuthCallback mounted, status:', status);
    try {
      await processOAuthCallback();
      cleanupSessionStorage();
      status = 'success';
      console.log('AuthCallback success, status:', status);
      redirectAfterSuccess();
    } catch (err: unknown) {
      cleanupSessionStorage();
      console.log('AuthCallback error, status:', status);
      handleError(err);
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
            <p class="brand-tagline">Authentication in progress</p>
          </div>
        </div>
        
        <div class="processing-section">
          <div class="spinner-container">
            <div class="spinner"></div>
            <div class="pulse-ring"></div>
          </div>
          <div class="status-text">
            <h2>Completing sign in...</h2>
            <p class="status-message">Please wait while we verify your credentials</p>
          </div>
        </div>
      </div>
    {:else if status === 'success'}
      <div class="callback-content">
        <div class="brand-header">
          <img src="/grengin-icon.svg" alt="Grengin" class="callback-logo" />
          <div class="brand-text">
            <h1 class="brand-name">Grengin</h1>
            <p class="brand-tagline">Authentication complete</p>
          </div>
        </div>
        
        <div class="success-section">
          <div class="status-icon success">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
          <div class="status-text">
            <h2>Sign in successful!</h2>
            <p class="status-message">Redirecting you to your workspace...</p>
          </div>
        </div>
      </div>
    {:else if status === 'error'}
      <div class="callback-content">
        <div class="brand-header">
          <img src="/grengin-icon.svg" alt="Grengin" class="callback-logo" />
          <div class="brand-text">
            <h1 class="brand-name">Grengin</h1>
            <p class="brand-tagline">Authentication failed</p>
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
            <h2>Sign in failed</h2>
            <p class="status-submessage">Redirecting you back to the login page...</p>
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
