<script lang="ts">
  import { login, ApiError } from '../index.js';
  import { setAuth } from '../index.js';
  import { toast } from '../../../components/Toaster.svelte';
  import OAuthButton from './OAuthButton.svelte';

  // TODO: This should come from the server (API update)
  type AuthMode = 'google' | 'azure' | 'keycloak' | 'admin';

  interface Props {
    modes?: AuthMode[];
    onLoginSuccess?: () => void;
  }

  let { modes = ['google', 'azure'], onLoginSuccess }: Props = $props();

  // Determine if OAuth providers are enabled
  const hasOAuthProviders = $derived(modes.some(m => ['google', 'azure', 'keycloak'].includes(m)));
  const hasAdminLogin = $derived(modes.includes('admin'));
  const oauthProviders = $derived(modes.filter(m => ['google', 'azure', 'keycloak'].includes(m)) as ('google' | 'azure' | 'keycloak')[]);

  let email = $state('');
  let password = $state('');
  let isLoading = $state(false);
  let isOAuthLoading = $state(false);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    isLoading = true;

    try {
      const response = await login(email, password);

      if (response.requires_mfa) {
          toast.error('MFA is required but not yet implemented');
        return;
      }

      if (response.accessToken && response.refresh_token && response.user) {
        setAuth(response.accessToken, response.refresh_token, response.user);
        onLoginSuccess?.();
      }
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.detail);
      } else {
        toast.error('An unexpected error occurred');
      }
    } finally {
      isLoading = false;
    }
  }

  function handleOAuthStart() {
    isOAuthLoading = true;
  }

  function handleOAuthError() {
    isOAuthLoading = false;
  }

  function handleOAuthSuccess() {
    onLoginSuccess?.();
  }
</script>

<div class="login-container">
  <div class="login-card">
    <div class="login-header">
      <img src="/grengin-icon.svg" alt="Grengin" class="login-logo" />
      <h1>Welcome to Grengin</h1>
      <p class="login-subtitle">Sign in to continue</p>
    </div>

    {#if hasAdminLogin}
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

    {#if hasOAuthProviders && hasAdminLogin}
      <div class="divider">
        <span>or</span>
      </div>
    {/if}

    {#if hasOAuthProviders}
      <div class="login-form">
        {#each oauthProviders as provider}
          <OAuthButton 
            {provider}
            size="medium"
            disabled={isOAuthLoading}
            onStart={handleOAuthStart}
            onError={handleOAuthError}
            onSuccess={handleOAuthSuccess}
          />
        {/each}
      </div>
    {/if}

    {#if !hasOAuthProviders && !hasAdminLogin}
      <div class="no-auth-methods">
        <p>No authentication methods configured</p>
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

  .divider {
    display: flex;
    align-items: center;
    text-align: center;
    margin: var(--space-2xl) 0;
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .divider::before,
  .divider::after {
    content: '';
    flex: 1;
    border-bottom: 1px solid var(--border-color);
  }

  .divider span {
    padding: 0 var(--space-lg);
  }

  .no-auth-methods {
    text-align: center;
    padding: var(--space-3xl);
    color: var(--text-secondary);
  }

  .no-auth-methods p {
    font-size: 0.9375rem;
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
