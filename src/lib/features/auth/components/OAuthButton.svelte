<script lang="ts">
  import { initiateOAuth, ApiError } from '../index.js';
  import { toast } from '../../../components/Toaster.svelte';
  import { _ } from 'svelte-i18n';
  import { getLocalizedError } from '../../../utils/errorLocalization';

  type OAuthProvider = 'google' | 'azure' | 'keycloak';
  type ButtonSize = 'small' | 'medium' | 'large';

  interface Props {
    provider: OAuthProvider;
    redirectUri?: string;
    size?: ButtonSize;
    disabled?: boolean;
    onStart?: () => void;
    onSuccess?: () => void;
    onError?: (error: string) => void;

  }

  let {
    provider,
    redirectUri,
    size = 'medium',
    disabled = false,
    onStart,
    onSuccess,
    onError,
  }: Props = $props();

  // Always send redirect_uri so the backend knows where to redirect after OAuth
  // Use provider-specific callback path to match Azure/OAuth provider configuration
  const effectiveRedirectUri = $derived(
    redirectUri ?? window.location.origin + `/auth/${provider}/callback`
  );

  let isLoading = $state(false);

  // Capitalize provider name
  const providerName = $derived(provider.charAt(0).toUpperCase() + provider.slice(1));
  
  // Icon path
  const iconPath = $derived(`/${provider}.svg`);

  async function handleClick() {
    if (isLoading || disabled) return;
    
    isLoading = true;
    onStart?.(); // Notify parent that OAuth flow is starting

    try {
      await initiateOAuth(provider, effectiveRedirectUri);
    } catch (err) {
      isLoading = false;
      const errorMessage = err instanceof ApiError 
        ? getLocalizedError(err, 'description', $_) || err.description
        : $_('error.fallback.description');
      
      toast.error(errorMessage);
      onError?.(errorMessage);
    }
  }
</script>

<button 
  type="button" 
  class="oauth-button"
  class:size-small={size === 'small'}
  class:size-medium={size === 'medium'}
  class:size-large={size === 'large'}
  class:provider-google={provider === 'google'}
  class:provider-azure={provider === 'azure'}
  class:provider-keycloak={provider === 'keycloak'}
  onclick={handleClick}
  disabled={isLoading || disabled}
  aria-label={$_('auth.signInWith', { values: { provider: providerName } })}
>
  {#if isLoading}
    <span class="spinner"></span>
    <span>{$_('auth.connectingTo', { values: { provider: providerName } })}</span>
  {:else}
    <img src={iconPath} alt="{providerName} logo" class="icon" />
    <span>{$_('auth.signInWith', { values: { provider: providerName } })}</span>
  {/if}
</button>

<style>
  .oauth-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-md);
    width: 100%;
    font-weight: 600;
    border: none;
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    color: var(--text-primary);
    backdrop-filter: blur(var(--glass-blur));
    -webkit-backdrop-filter: blur(var(--glass-blur));
    box-shadow:
      var(--glass-highlight),
      var(--glass-edge-glow),
      0 2px 8px rgba(0, 0, 0, 0.1);
  }

  /* Size variants */
  .size-small {
    padding: var(--space-sm) var(--space-lg);
    font-size: 0.875rem;
    min-height: 2.5rem;
  }

  .size-medium {
    padding: var(--space-md) var(--space-xl);
    font-size: 1rem;
    min-height: 3rem;
  }

  .size-large {
    padding: var(--space-lg) var(--space-2xl);
    font-size: 1.125rem;
    min-height: 3.5rem;
  }

  /* Hover states */
  .oauth-button:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow:
      var(--glass-highlight),
      var(--glass-edge-glow),
      0 4px 16px rgba(0, 0, 0, 0.15);
  }

  .oauth-button:active:not(:disabled) {
    transform: translateY(0);
  }

  /* Disabled state */
  .oauth-button:disabled {
    cursor: wait;
    opacity: 0.7;
  }

  /* Icon styling */
  .icon {
    display: block;
    width: 24px;
    height: 24px;
    flex-shrink: 0;
  }

  /* Spinner */
  .spinner {
    display: inline-block;
    width: 1.25rem;
    height: 1.25rem;
    border: 3px solid #e0e0e0;
    border-top-color: #4285F4;
    border-right-color: #4285F4;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
    flex-shrink: 0;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* Focus state for accessibility */
  .oauth-button:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }

  /* Mobile optimization */
  @media (max-width: 480px) {
    .oauth-button {
      min-height: 44px; /* Minimum touch target size */
    }

    .size-small {
      min-height: 44px;
      padding: var(--space-md) var(--space-lg);
    }
  }
</style>
