<script lang="ts">
  import { onMount } from 'svelte';
  import { navigate } from 'svelte-routing';
  import { setAuth } from '../index.js';

  let status = $state<'processing' | 'success' | 'error'>('processing');
  let errorMessage = $state('');

  onMount(async () => {
    try {
      // svelte-routing uses path-based routing, so query params are in window.location.search
      const params = new URLSearchParams(window.location.search);

      // Check for error from provider
      const error = params.get('error');
      if (error) {
        const errorDesc = params.get('error_description') || error;
        throw new Error(errorDesc);
      }

      // Extract tokens from URL (backend redirects with tokens in query params)
      const accessToken = params.get('access_token') || params.get('accessToken');
      const refreshToken = params.get('refresh_token') || params.get('refreshToken');
      const userParam = params.get('user');

      if (!accessToken || !userParam) {
        throw new Error('Missing authentication tokens');
      }

      const user = JSON.parse(decodeURIComponent(userParam));
      setAuth(accessToken, refreshToken || '', user);

      status = 'success';

      // Get the return URL (where user originally wanted to go)
      const returnUrl = sessionStorage.getItem('auth_return_url') || '/';
      sessionStorage.removeItem('auth_return_url');

      // Redirect to the original URL using window.location to force full page update
      setTimeout(() => {
        window.location.href = returnUrl;
      }, 300);
    } catch (err: unknown) {
      console.error('Authentication callback error:', err);
      status = 'error';
      errorMessage = err instanceof Error ? err.message : 'Authentication failed';

      // Redirect to home after error
      setTimeout(() => navigate('/', { replace: true }), 3000);
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
        <p class="status-message error">{errorMessage}</p>
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

  .status-message.error {
    color: var(--brand-red);
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
