<script lang="ts">
  import { onMount } from 'svelte';
  import { login, ApiError } from '../index.js';
  import { setAuth } from '../index.js';
  import { toast } from '../../../components/Toaster.svelte';
  import { getLocalizedError } from '../../../utils/errorLocalization';
  import OAuthButton from './OAuthButton.svelte';
  import { _ } from 'svelte-i18n';
  import { loadNamespaces } from '$lib/i18n/index.js';
  import { isTauriRuntime } from '../../../platform/tauri.js';
  import BackendUrlSettings from '../../../components/BackendUrlSettings.svelte';

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
  const isNativeLogin = $derived(isTauriRuntime());

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
        toast.error($_('error.auth.mfa_not_implemented'));
        return;
      }

      if (response.accessToken && response.refreshToken && response.user) {
        setAuth(response.accessToken, response.refreshToken, response.user);
        onLoginSuccess?.();
      }
    } catch (err) {
      const errorMessage = err instanceof ApiError 
        ? getLocalizedError(err, 'description', $_) || err.description
        : $_('error.fallback.description');
      toast.error(errorMessage);
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

  onMount(() => {
    // Ensure auth namespace is loaded for translations
    loadNamespaces(['auth']);
  });
</script>

<main class="login-container" class:login-container--native={isNativeLogin}>
  <div class="login-card">
    <div class="brand-header">
      <img src="/grengin-icon.svg" alt="Grengin" class="login-logo" />
      <div class="brand-text">
        <h1 class="brand-name">{$_('auth.welcomeToGrengin')}</h1>
        <p class="brand-tagline">{$_('auth.signInToContinue')}</p>
      </div>
    </div>

    <div class="login-backend-settings">
      <BackendUrlSettings compact />
    </div>

    <div class="auth-content">
      {#if hasAdminLogin}
        <form onsubmit={handleSubmit} class="login-form" aria-label={$_('auth.emailAndPassword')}>
          <div class="form-section">
            <h2 class="section-title">{$_('auth.emailAndPassword')}</h2>
            <div class="form-group">
              <label for="email">{$_('auth.emailAddress')}</label>
              <input
                type="email"
                id="email"
                bind:value={email}
                placeholder={$_('auth.emailPlaceholder')}
                required
                disabled={isLoading}
                autocomplete="email"
                inputmode="email"
                class="form-input"
              />
            </div>

            <div class="form-group">
              <label for="password">{$_('auth.password')}</label>
              <input
                type="password"
                id="password"
                bind:value={password}
                placeholder={$_('auth.passwordPlaceholder')}
                required
                disabled={isLoading}
                autocomplete="current-password"
                class="form-input"
              />
            </div>

            <button type="submit" class="login-btn" disabled={isLoading}>
              {#if isLoading}
                <div class="btn-spinner"></div>
                {$_('auth.signingIn')}
              {:else}
                {$_('auth.signIn')}
              {/if}
            </button>
          </div>
        </form>

        <div class="demo-section" role="region" aria-label={$_('auth.demoAccount')}>
          <div class="demo-info">
            <svg class="demo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            <div class="demo-text">
              <p class="demo-title">{$_('auth.demoAccount')}</p>
              <code class="demo-credentials">admin@grengin.com / Demo123456!@</code>
            </div>
          </div>
        </div>
      {/if}

      {#if hasOAuthProviders && hasAdminLogin}
        <div class="divider" aria-hidden="true">
          <span>{$_('auth.orContinueWith')}</span>
        </div>
      {/if}

      {#if hasOAuthProviders}
        <section class="oauth-section" aria-label={$_('auth.socialLogin') || 'Social login'}>
          <div class="oauth-buttons">
            {#each oauthProviders as provider}
              <OAuthButton 
                {provider}
                size={isNativeLogin ? 'large' : 'medium'}
                disabled={isOAuthLoading}
                onStart={handleOAuthStart}
                onError={handleOAuthError}
                onCancel={handleOAuthError}
                onSuccess={handleOAuthSuccess}
              />
            {/each}
          </div>
        </section>
      {/if}

      {#if !hasOAuthProviders && !hasAdminLogin}
        <div class="no-auth-section" role="alert">
          <div class="no-auth-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="15" y1="9" x2="9" y2="15"></line>
              <line x1="9" y1="9" x2="15" y2="15"></line>
            </svg>
          </div>
          <h2>{$_('auth.noAuthMethods')}</h2>
          <p>{$_('auth.noAuthMethodsDescription')}</p>
        </div>
      {/if}
    </div>

    <footer class="legal-footer">
      <nav class="legal-links" aria-label={$_('auth.legalLinks') || 'Legal'}>
        <a href="/terms" target="_blank" rel="noopener noreferrer">{$_('auth.termsOfService')}</a>
        <span class="separator" aria-hidden="true">•</span>
        <a href="/privacy" target="_blank" rel="noopener noreferrer">{$_('auth.privacyPolicy')}</a>
      </nav>
      <p class="copyright">{$_('auth.copyright')}</p>
    </footer>
  </div>
</main>

<style>
  .login-container {
    min-height: 100vh;
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: max(1.25rem, env(safe-area-inset-top)) max(1.25rem, env(safe-area-inset-right)) max(1.25rem, env(safe-area-inset-bottom)) max(1.25rem, env(safe-area-inset-left));
    background: var(--bg-primary);
    color: var(--text-primary);
  }

  .login-card {
    width: min(100%, 26.5rem);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid var(--surface-border);
    border-radius: 16px;
    background: var(--surface-elevated);
    box-shadow: var(--glass-shadow-dark);
  }

  .login-container--native .login-card {
    width: min(100%, 28rem);
  }

  .brand-header {
    display: flex;
    align-items: center;
    gap: var(--space-lg);
    padding: var(--space-3xl) var(--space-3xl) var(--space-2xl);
    border-bottom: 1px solid var(--surface-border);
    background: var(--surface-card);
  }

  .login-logo {
    width: 3.25rem;
    height: 3.25rem;
    flex: 0 0 auto;
  }

  .brand-text {
    min-width: 0;
  }

  .login-backend-settings {
    padding: var(--space-md) var(--space-3xl) 0;
    background: var(--surface-elevated);
  }

  .brand-name {
    margin: 0 0 var(--space-xs);
    color: var(--text-primary);
    font-size: 1.45rem;
    font-weight: 800;
    line-height: 1.15;
    letter-spacing: 0;
  }

  .brand-tagline {
    margin: 0;
    color: var(--text-secondary);
    font-size: 0.92rem;
    font-weight: 600;
    line-height: 1.35;
  }

  .auth-content {
    flex: 1;
    padding: var(--space-3xl);
  }

  .section-title {
    margin: 0 0 var(--space-xl);
    color: var(--text-primary);
    font-size: 1rem;
    font-weight: 700;
    letter-spacing: 0;
  }

  .login-form {
    display: flex;
    flex-direction: column;
  }

  .form-group {
    margin-bottom: var(--space-lg);
  }

  .form-group label {
    display: block;
    margin-bottom: var(--space-sm);
    color: var(--text-secondary);
    font-size: 0.88rem;
    font-weight: 700;
  }

  .form-input {
    width: 100%;
    min-height: 3.25rem;
    padding: 0.85rem 1rem;
    border: 1px solid var(--surface-border);
    border-radius: 8px;
    outline: none;
    background: var(--surface-card);
    color: var(--text-primary);
    font: inherit;
    font-size: 1rem;
    transition:
      border-color 0.2s ease,
      box-shadow 0.2s ease,
      background 0.2s ease;
  }

  .form-input:focus {
    border-color: var(--brand);
    box-shadow: 0 0 0 3px rgba(var(--brand-rgb), 0.18);
  }

  .form-input:disabled {
    background: var(--surface-subtle);
    color: var(--text-secondary);
    cursor: not-allowed;
  }

  .form-input::placeholder {
    color: color-mix(in oklab, var(--text-secondary) 72%, transparent);
  }

  .login-btn {
    width: 100%;
    min-height: 3.25rem;
    margin-top: var(--space-sm);
    padding: 0.85rem 1.25rem;
    border: none;
    border-radius: 8px;
    background: var(--brand);
    color: white;
    font-size: 1rem;
    font-weight: 800;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-sm);
    transition:
      background 0.2s ease,
      box-shadow 0.2s ease,
      transform 0.2s ease;
  }

  .login-btn:hover:not(:disabled) {
    background: var(--brand-hover);
    transform: translateY(-1px);
    box-shadow: 0 0.75rem 1.75rem rgba(var(--brand-rgb), 0.28);
  }

  .login-btn:active:not(:disabled) {
    transform: translateY(0);
  }

  .login-btn:disabled {
    cursor: wait;
    opacity: 0.7;
    transform: none;
    box-shadow: none;
  }

  .btn-spinner {
    width: 1rem;
    height: 1rem;
    border: 2px solid rgba(255, 255, 255, 0.35);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .demo-section {
    margin-bottom: var(--space-3xl);
    padding: var(--space-lg);
    border: 1px solid color-mix(in oklab, var(--brand-green-accent) 28%, var(--surface-border));
    border-radius: 8px;
    background: color-mix(in oklab, var(--brand-green-accent) 9%, var(--surface-card));
  }

  .demo-info {
    display: flex;
    align-items: flex-start;
    gap: var(--space-md);
  }

  .demo-icon {
    width: 1.25rem;
    height: 1.25rem;
    color: var(--brand-green-accent);
    flex: 0 0 auto;
    margin-top: 0.125rem;
  }

  .demo-text {
    min-width: 0;
  }

  .demo-title {
    margin: 0 0 var(--space-xs);
    color: var(--text-primary);
    font-size: 0.88rem;
    font-weight: 700;
  }

  .demo-credentials {
    display: inline-block;
    max-width: 100%;
    padding: 0.4rem 0.55rem;
    border: 1px solid color-mix(in oklab, var(--brand-green-accent) 25%, var(--surface-border));
    border-radius: 6px;
    background: color-mix(in oklab, var(--brand-green-accent) 12%, var(--surface-elevated));
    color: var(--text-primary);
    font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
    font-size: 0.78rem;
    overflow-wrap: anywhere;
  }

  .divider {
    display: flex;
    align-items: center;
    gap: var(--space-lg);
    margin: var(--space-3xl) 0;
    color: var(--text-secondary);
    font-size: 0.88rem;
    font-weight: 700;
    text-align: center;
  }

  .divider::before,
  .divider::after {
    content: '';
    flex: 1;
    border-bottom: 1px solid var(--surface-border);
  }

  .oauth-buttons {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .no-auth-section {
    padding: var(--space-3xl) var(--space-xl);
    text-align: center;
  }

  .no-auth-icon {
    width: 4rem;
    height: 4rem;
    margin: 0 auto var(--space-xl);
    border: 1px solid color-mix(in oklab, var(--brand-red) 28%, var(--surface-border));
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in oklab, var(--brand-red) 10%, var(--surface-card));
    color: var(--brand-red);
  }

  .no-auth-icon svg {
    width: 2rem;
    height: 2rem;
  }

  .no-auth-section h2 {
    margin: 0 0 var(--space-sm);
    color: var(--text-primary);
    font-size: 1.1rem;
    font-weight: 800;
  }

  .no-auth-section p {
    margin: 0;
    color: var(--text-secondary);
    font-size: 0.92rem;
    line-height: 1.5;
  }

  .legal-footer {
    padding: var(--space-xl) var(--space-3xl);
    border-top: 1px solid var(--surface-border);
    background: var(--surface-card);
    text-align: center;
  }

  .legal-links {
    margin-bottom: var(--space-sm);
  }

  .legal-links a {
    color: var(--text-secondary);
    font-size: 0.82rem;
    font-weight: 700;
    text-decoration: none;
    transition: color 0.2s ease;
  }

  .legal-links a:hover {
    color: var(--brand);
    text-decoration: underline;
  }

  .legal-links a:focus-visible {
    outline: 2px solid var(--brand-ring);
    outline-offset: 2px;
  }

  .separator {
    margin: 0 var(--space-sm);
    color: color-mix(in oklab, var(--text-secondary) 50%, transparent);
  }

  .copyright {
    margin: 0;
    color: var(--text-secondary);
    font-size: 0.75rem;
  }

  @media (max-width: 640px) {
    .login-container {
      align-items: stretch;
      padding: 0;
    }

    .login-card {
      width: 100%;
      max-width: none;
      min-height: 100vh;
      min-height: 100dvh;
      border: none;
      border-radius: 0;
      box-shadow: none;
    }

    .brand-header {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-md);
      padding: calc(2.5rem + env(safe-area-inset-top)) 1.5rem var(--space-lg);
      border-bottom: none;
      background: transparent;
    }

    .login-logo {
      width: 4rem;
      height: 4rem;
    }

    .login-backend-settings {
      padding: 0 1.5rem var(--space-md);
    }

    .brand-name {
      font-size: 1.65rem;
    }

    .brand-tagline {
      font-size: 1rem;
    }

    .auth-content {
      display: flex;
      flex: 1;
      flex-direction: column;
      justify-content: center;
      padding: var(--space-lg) 1.5rem;
    }

    .section-title {
      margin-bottom: var(--space-lg);
    }

    .form-input,
    .login-btn {
      min-height: 3.5rem;
    }

    .demo-section {
      margin-bottom: var(--space-2xl);
    }

    .divider {
      margin: var(--space-2xl) 0;
    }

    .legal-footer {
      padding: var(--space-xl) 1.5rem calc(var(--space-xl) + env(safe-area-inset-bottom));
      border-top: none;
      background: transparent;
    }
  }

  @media (max-height: 700px) and (max-width: 640px) {
    .brand-header {
      padding-top: calc(1.5rem + env(safe-area-inset-top));
    }

    .auth-content {
      justify-content: flex-start;
    }
  }
</style>
