<script lang="ts">
  import { login, initiateOAuth, ApiError } from '../index.js';
  import { setAuth } from '../index.js';

  // TODO: This should come from the server (API update)
  type AuthMode = 'google' | 'admin';

  interface Props {
    mode?: AuthMode;
    onLoginSuccess?: () => void;
  }

  let { mode = 'google', onLoginSuccess }: Props = $props();

  let email = $state('');
  let password = $state('');
  let error = $state('');
  let isLoading = $state(false);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    error = '';
    isLoading = true;

    try {
      const response = await login(email, password);

      if (response.requires_mfa) {
        error = 'MFA is required but not yet implemented';
        return;
      }

      if (response.access_token && response.refresh_token && response.user) {
        setAuth(response.access_token, response.refresh_token, response.user);
        onLoginSuccess?.();
      }
    } catch (err) {
      if (err instanceof ApiError) {
        error = err.detail;
      } else {
        error = 'An unexpected error occurred';
      }
    } finally {
      isLoading = false;
    }
  }

  async function handleGoogleLogin() {
    error = '';
    isLoading = true;

    try {
      const response = await initiateOAuth('google', window.location.origin + '/auth/callback');
      window.location.href = response.auth_url;
    } catch (err) {
      if (err instanceof ApiError) {
        error = err.detail;
      } else {
        error = 'Failed to initiate Google login';
      }
      isLoading = false;
    }
  }
</script>

<div class="login-container">
  <div class="login-card">
    <div class="login-header">
      <img src="/grengin-icon.svg" alt="Grengin" class="login-logo" />
      <h1>Welcome to Grengin</h1>
      <p class="login-subtitle">Sign in to continue</p>
    </div>

    {#if error}
      <div class="error-message">{error}</div>
    {/if}

    {#if mode === 'google'}
      <div class="login-form">
        <button type="button" class="btn-primary btn-google" onclick={handleGoogleLogin} disabled={isLoading}>
          <svg class="google-icon" viewBox="0 0 24 24" width="20" height="20">
            <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </button>
      </div>
    {:else}
      <form onsubmit={handleSubmit} class="login-form">
        <div class="form-group">
          <label for="email">Email</label>
          <input
            type="email"
            id="email"
            bind:value={email}
            placeholder="Enter your email"
            required
            disabled={isLoading}
            autocomplete="email"
          />
        </div>

        <div class="form-group">
          <label for="password">Password</label>
          <input
            type="password"
            id="password"
            bind:value={password}
            placeholder="Enter your password"
            required
            disabled={isLoading}
            autocomplete="current-password"
          />
        </div>

        <button type="submit" class="btn-primary login-btn" disabled={isLoading}>
          {#if isLoading}
            <span class="spinner"></span>
            Signing in...
          {:else}
            Sign in
          {/if}
        </button>
      </form>

      <div class="login-footer">
        <p class="demo-credentials">
          Demo: admin@grengin.com / Demo123456!@
        </p>
      </div>
    {/if}
  </div>
</div>

<style>
  .login-container {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-xl);
    background: var(--bg-primary);
  }

  .login-card {
    width: 100%;
    max-width: 420px;
    padding: var(--space-3xl);
    background: var(--glass-bg-dark);
    backdrop-filter: blur(var(--glass-blur)) saturate(1.3);
    -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(1.3);
    border-radius: var(--radius-xl);
    box-shadow:
      var(--glass-highlight),
      var(--glass-edge-glow),
      var(--glass-shadow-dark);
  }

  .login-header {
    text-align: center;
    margin-bottom: var(--space-3xl);
  }

  .login-logo {
    width: 4rem;
    height: 4rem;
    margin-bottom: var(--space-lg);
  }

  .login-header h1 {
    font-size: 1.75rem;
    margin-bottom: var(--space-sm);
  }

  .login-subtitle {
    color: var(--text-secondary);
    font-size: 0.9375rem;
  }

  .login-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-xl);
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .form-group label {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-secondary);
  }

  .error-message {
    padding: var(--space-md) var(--space-lg);
    background: rgba(var(--brand-red-rgb), 0.12);
    backdrop-filter: blur(0.5rem);
    -webkit-backdrop-filter: blur(0.5rem);
    border-radius: var(--radius-md);
    color: var(--brand-red);
    font-size: 0.875rem;
    text-align: center;
    margin-bottom: var(--space-xl);
    box-shadow:
      var(--glass-edge-glow),
      inset 0 1px 0 rgba(var(--brand-red-rgb), 0.15);
  }

  .btn-google {
    gap: var(--space-md);
    width: 100%;
    padding: var(--space-md) var(--space-xl);
    font-size: 1rem;
  }

  .google-icon {
    flex-shrink: 0;
  }

  .login-btn {
    width: 100%;
    padding: var(--space-md) var(--space-xl);
    font-size: 1rem;
    margin-top: var(--space-md);
  }

  .login-btn:disabled {
    cursor: wait;
  }

  .spinner {
    display: inline-block;
    width: 1rem;
    height: 1rem;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin-right: var(--space-sm);
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .login-footer {
    margin-top: var(--space-3xl);
    text-align: center;
  }

  .demo-credentials {
    font-size: 0.8125rem;
    color: var(--text-secondary);
    opacity: 0.7;
    font-family: 'SF Mono', Monaco, Menlo, monospace;
  }

  @media (max-width: 480px) {
    .login-container {
      padding: var(--space-lg);
    }

    .login-card {
      padding: var(--space-2xl);
    }

    .login-header h1 {
      font-size: 1.5rem;
    }
  }
</style>
