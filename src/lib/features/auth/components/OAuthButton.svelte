<script lang="ts">
  import { initiateOAuth, ApiError } from '../index.js';
  import { toast } from '../../../components/Toaster.svelte';

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
    redirectUri = window.location.origin + '/auth/callback',
    size = 'medium',
    disabled = false,
    onStart,
    onSuccess,
    onError
  }: Props = $props();

  let isLoading = $state(false);

  // Provider configurations
  const providerConfig = {
    google: {
      name: 'Google',
      displayName: 'Sign in with Google',
      loadingText: 'Connecting to Google...',
      icon: `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>`
    },
    azure: {
      name: 'Microsoft',
      displayName: 'Sign in with Microsoft',
      loadingText: 'Connecting to Microsoft...',
      icon: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path fill="#F25022" d="M11.4 24H0V12.6h11.4V24z"/>
        <path fill="#00A4EF" d="M24 24H12.6V12.6H24V24z"/>
        <path fill="#7FBA00" d="M11.4 11.4H0V0h11.4v11.4z"/>
        <path fill="#FFB900" d="M24 11.4H12.6V0H24v11.4z"/>
      </svg>`
    },
    keycloak: {
      name: 'Keycloak',
      displayName: 'Sign in with Keycloak',
      loadingText: 'Connecting to Keycloak...',
      icon: `<svg width="24" height="24" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <circle cx="512" cy="512" r="512" style="fill:#008aaa"/>
            <path d="M786.2 395.5h-80.6c-1.5 0-3-.8-3.7-2.1l-64.7-112.2c-.8-1.3-2.2-2.1-3.8-2.1h-264c-1.5 0-3 .8-3.7 2.1l-67.3 116.4-64.8 112.2c-.7 1.3-.7 2.9 0 4.3l64.8 112.2 67.2 116.5c.7 1.3 2.2 2.2 3.7 2.1h264.1c1.5 0 3-.8 3.8-2.1L702 630.6c.7-1.3 2.2-2.2 3.7-2.1h80.6c2.7 0 4.8-2.2 4.8-4.8V400.4c-.1-2.7-2.3-4.9-4.9-4.9zM477.5 630.6l-20.3 35c-.3.5-.8 1-1.3 1.3-.6.3-1.2.5-1.9.5h-40.3c-1.4 0-2.7-.7-3.3-2l-60.1-104.3-5.9-10.3-21.6-36.9c-.3-.5-.5-1.1-.4-1.8 0-.6.2-1.3.5-1.8l21.7-37.6 65.9-114c.7-1.2 2-2 3.3-2H454c.7 0 1.4.2 2.1.5.5.3 1 .7 1.3 1.3l20.3 35.2c.6 1.2.5 2.7-.2 3.8l-65.1 112.8c-.3.5-.4 1.1-.4 1.6 0 .6.2 1.1.4 1.6l65.1 112.7c.9 1.5.8 3.1 0 4.4zm202.1-116.7L658 550.8l-5.9 10.3L592 665.4c-.7 1.2-1.9 2-3.3 2h-40.3c-.7 0-1.3-.2-1.9-.5-.5-.3-1-.7-1.3-1.3l-20.3-35c-.9-1.3-.9-2.9-.1-4.2l65.1-112.7c.3-.5.4-1.1.4-1.6 0-.6-.2-1.1-.4-1.6l-65.1-112.8c-.7-1.2-.8-2.6-.2-3.8l20.3-35.2c.3-.5.8-1 1.3-1.3.6-.4 1.3-.5 2.1-.5h40.4c1.4 0 2.7.7 3.3 2l65.9 114 21.7 37.6c.3.6.5 1.2.5 1.8 0 .4-.2 1-.5 1.6z" style="fill:#fff"/>
        </svg>`
    }
  };

  const config = $derived(providerConfig[provider]);

  async function handleClick() {
    if (isLoading || disabled) return;
    
    isLoading = true;
    onStart?.(); // Notify parent that OAuth flow is starting

    try {
      const response = await initiateOAuth(provider, redirectUri);
      onSuccess?.();
    } catch (err) {
      console.log(err);
      isLoading = false;
      const errorMessage = err instanceof ApiError 
        ? err.detail 
        : `Failed to initiate ${config.name} login`;
      
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
  aria-label={config.displayName}
>
  {#if isLoading}
    <span class="spinner"></span>
    <span>{config.loadingText}</span>
  {:else}
    <span class="icon">{@html config.icon}</span>
    <span>{config.displayName}</span>
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
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .icon :global(svg) {
    display: block;
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
