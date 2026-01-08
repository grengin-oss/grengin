<script lang="ts">
  import { login, ApiError } from '../index.js';
  import { setAuth } from '../index.js';
  import { toast } from '../../../components/Toaster.svelte';
  import OAuthButton from './OAuthButton.svelte';
  import { _ } from 'svelte-i18n';

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
          toast.error($_('auth.mfaRequired'));
        return;
      }

      if (response.accessToken && response.refreshToken && response.user) {
        setAuth(response.accessToken, response.refreshToken, response.user);
        onLoginSuccess?.();
      }
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.description);
      } else {
        toast.error($_('auth.unexpectedError'));
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
    <div class="brand-header">
      <img src="/grengin-icon.svg" alt="Grengin" class="login-logo" />
      <div class="brand-text">
        <h1 class="brand-name">{$_('auth.welcomeToGrengin')}</h1>
        <p class="brand-tagline">{$_('auth.signInToContinue')}</p>
      </div>
    </div>

    <div class="auth-content">
      {#if hasAdminLogin}
        <form onsubmit={handleSubmit} class="login-form">
          <div class="form-section">
            <h3 class="section-title">{$_('auth.emailAndPassword')}</h3>
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

        <div class="demo-section">
          <div class="demo-info">
            <svg class="demo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            <div class="demo-text">
              <p class="demo-title">{$_('auth.demoAccount')}</p>
              <p class="demo-credentials">admin@grengin.com / Demo123456!@</p>
            </div>
          </div>
        </div>
      {/if}

      {#if hasOAuthProviders && hasAdminLogin}
        <div class="divider">
          <span>{$_('auth.orContinueWith')}</span>
        </div>
      {/if}

      {#if hasOAuthProviders}
        <div class="oauth-section">
          <div class="oauth-buttons">
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
        </div>
      {/if}

      {#if !hasOAuthProviders && !hasAdminLogin}
        <div class="no-auth-section">
          <div class="no-auth-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="15" y1="9" x2="9" y2="15"></line>
              <line x1="9" y1="9" x2="15" y2="15"></line>
            </svg>
          </div>
          <h3>{$_('auth.noAuthMethods')}</h3>
          <p>{$_('auth.noAuthMethodsDescription')}</p>
        </div>
      {/if}
    </div>

    <div class="legal-footer">
      <div class="legal-links">
        <a href="/terms" target="_blank" rel="noopener noreferrer">{$_('auth.termsOfService')}</a>
        <span class="separator">•</span>
        <a href="/privacy" target="_blank" rel="noopener noreferrer">{$_('auth.privacyPolicy')}</a>
      </div>
      <p class="copyright">{$_('auth.copyright')}</p>
    </div>
  </div>
</div>

<style>
  .login-container {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }

  .login-card {
    width: 100%;
    max-width: 400px;
    padding: 0;
    background: rgba(255, 255, 255, 0.98);
    border-radius: 20px;
    border: 1px solid #eaeaea;
    box-shadow: 
      0 32px 64px rgba(0, 0, 0, 0.12),
      0 0 0 1px rgba(255, 255, 255, 0.1);
    overflow: hidden;
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
  }

  .brand-header {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 32px 32px 24px 32px;
    background: linear-gradient(135deg, rgba(102, 126, 234, 0.05) 0%, rgba(118, 75, 162, 0.05) 100%);
    border-bottom: 1px solid rgba(102, 126, 234, 0.1);
  }

  .login-logo {
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

  .auth-content {
    padding: 32px;
  }

  .section-title {
    font-size: 16px;
    font-weight: 600;
    color: #2d3748;
    margin: 0 0 20px 0;
    letter-spacing: -0.025em;
  }

  .login-form {
    display: flex;
    flex-direction: column;
  }

  .form-group {
    margin-bottom: 20px;
  }

  .form-group label {
    display: block;
    font-size: 14px;
    font-weight: 600;
    color: #4a5568;
    margin-bottom: 8px;
  }

  .form-input {
    width: 100%;
    padding: 12px 16px;
    border: 2px solid #e2e8f0;
    border-radius: 10px;
    font-size: 15px;
    background: white;
    color: #1a202c;
    transition: all 0.2s ease;
    outline: none;
  }

  .form-input:focus {
    border-color: #667eea;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
  }

  .form-input:disabled {
    background: #f7fafc;
    color: #a0aec0;
    cursor: not-allowed;
  }

  .form-input::placeholder {
    color: #a0aec0;
  }

  .login-btn {
    width: 100%;
    padding: 14px 20px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 10px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin-top: 8px;
  }

  .login-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 8px 16px rgba(102, 126, 234, 0.3);
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
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255, 255, 255, 0.3);
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
    margin-bottom: 32px;
    padding: 16px;
    background: linear-gradient(135deg, rgba(72, 187, 120, 0.05) 0%, rgba(56, 161, 105, 0.05) 100%);
    border: 1px solid rgba(72, 187, 120, 0.2);
    border-radius: 12px;
  }

  .demo-info {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }

  .demo-icon {
    width: 20px;
    height: 20px;
    color: #48bb78;
    flex-shrink: 0;
    margin-top: 2px;
  }

  .demo-text {
    flex: 1;
  }

  .demo-title {
    font-size: 14px;
    font-weight: 600;
    color: #2d3748;
    margin: 0 0 4px 0;
  }

  .demo-credentials {
    font-size: 13px;
    color: #4a5568;
    margin: 0;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
    background: rgba(72, 187, 120, 0.1);
    padding: 6px 10px;
    border-radius: 6px;
    border: 1px solid rgba(72, 187, 120, 0.2);
  }

  .divider {
    display: flex;
    align-items: center;
    text-align: center;
    margin: 32px 0;
    color: #718096;
    font-size: 14px;
    font-weight: 500;
  }

  .divider::before,
  .divider::after {
    content: '';
    flex: 1;
    border-bottom: 1px solid #e2e8f0;
  }

  .divider span {
    padding: 0 16px;
    background: rgba(255, 255, 255, 0.98);
  }

  .oauth-buttons {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .no-auth-section {
    text-align: center;
    padding: 40px 20px;
  }

  .no-auth-icon {
    width: 64px;
    height: 64px;
    margin: 0 auto 20px auto;
    background: rgba(245, 101, 101, 0.1);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #f56565;
    border: 1px solid rgba(245, 101, 101, 0.2);
  }

  .no-auth-icon svg {
    width: 32px;
    height: 32px;
  }

  .no-auth-section h3 {
    font-size: 18px;
    font-weight: 600;
    color: #1a202c;
    margin: 0 0 8px 0;
  }

  .no-auth-section p {
    font-size: 14px;
    color: #718096;
    margin: 0;
    line-height: 1.5;
  }

  .legal-footer {
    padding: 24px 32px;
    background: linear-gradient(135deg, rgba(102, 126, 234, 0.02) 0%, rgba(118, 75, 162, 0.02) 100%);
    border-top: 1px solid rgba(102, 126, 234, 0.1);
    text-align: center;
  }

  .legal-links {
    margin-bottom: 12px;
  }

  .legal-links a {
    color: #718096;
    text-decoration: none;
    font-size: 13px;
    transition: color 0.2s ease;
  }

  .legal-links a:hover {
    color: #667eea;
    text-decoration: underline;
  }

  .separator {
    margin: 0 8px;
    color: #cbd5e0;
  }

  .copyright {
    font-size: 12px;
    color: #a0aec0;
    margin: 0;
  }

  /* Mobile responsive */
  @media (max-width: 480px) {
    .login-container {
      padding: 16px;
    }

    .login-card {
      max-width: 100%;
    }

    .brand-header {
      padding: 24px 20px 20px 20px;
    }

    .auth-content {
      padding: 24px 20px;
    }

    .legal-footer {
      padding: 20px;
    }

    .brand-name {
      font-size: 20px;
    }

    .brand-tagline {
      font-size: 13px;
    }

    .section-title {
      font-size: 15px;
    }

    .form-input {
      padding: 12px 14px;
      font-size: 16px; /* Prevents zoom on iOS */
    }

    .login-btn {
      padding: 14px 18px;
      font-size: 16px;
    }

    .demo-section {
      padding: 14px;
    }

    .divider {
      margin: 24px 0;
    }

    .no-auth-section {
      padding: 32px 16px;
    }
  }

  /* Dark mode support */
  @media (prefers-color-scheme: dark) {
    .login-card {
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

    .section-title {
      color: #f7fafc;
    }

    .form-group label {
      color: #cbd5e0;
    }

    .form-input {
      background: #2d3748;
      border-color: #4a5568;
      color: #e2e8f0;
    }

    .form-input:focus {
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.2);
    }

    .form-input:disabled {
      background: #1a202c;
      color: #718096;
    }

    .form-input::placeholder {
      color: #718096;
    }

    .demo-section {
      background: linear-gradient(135deg, rgba(72, 187, 120, 0.1) 0%, rgba(56, 161, 105, 0.1) 100%);
      border-color: rgba(72, 187, 120, 0.3);
    }

    .demo-title {
      color: #f7fafc;
    }

    .demo-credentials {
      color: #cbd5e0;
      background: rgba(72, 187, 120, 0.2);
      border-color: rgba(72, 187, 120, 0.3);
    }

    .divider {
      color: #cbd5e0;
    }

    .divider::before,
    .divider::after {
      border-bottom-color: #4a5568;
    }

    .divider span {
      background: rgba(45, 55, 72, 0.98);
    }

    .no-auth-icon {
      background: rgba(245, 101, 101, 0.2);
      border-color: rgba(245, 101, 101, 0.3);
    }

    .no-auth-section h3 {
      color: #f7fafc;
    }

    .no-auth-section p {
      color: #cbd5e0;
    }

    .legal-footer {
      background: linear-gradient(135deg, rgba(102, 126, 234, 0.05) 0%, rgba(118, 75, 162, 0.05) 100%);
      border-top-color: rgba(102, 126, 234, 0.2);
    }

    .legal-links a {
      color: #cbd5e0;
    }

    .legal-links a:hover {
      color: #90cdf4;
    }

    .separator {
      color: #718096;
    }

    .copyright {
      color: #718096;
    }
  }
</style>
