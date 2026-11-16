<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { initiateOAuth, ApiError } from '../index.js';
  import { toast } from '../../../components/Toaster.svelte';
  import { _ } from 'svelte-i18n';
  import { getLocalizedError } from '../../../utils/errorLocalization';

  type ButtonSize = 'small' | 'medium' | 'large';

  interface Props {
    /** Provider slug, e.g. "google", "azure", "keycloak", or any custom slug. */
    provider: string;
    /** Display label; falls back to the capitalized slug when omitted. */
    name?: string;
    redirectUri?: string;
    size?: ButtonSize;
    disabled?: boolean;
    onStart?: () => void;
    onSuccess?: () => void;
    onError?: (error: string) => void;

  }

  let {
    provider,
    name,
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
  // Unknown provider slugs have no bundled icon; fall back to a generic glyph
  // instead of a broken image.
  let iconError = $state(false);

  // Display label — the server-provided name, else the capitalized slug.
  const providerName = $derived(
    name?.trim() || provider.charAt(0).toUpperCase() + provider.slice(1),
  );

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
    <span class="spinner" aria-hidden="true"></span>
    <span>{$_('auth.connectingTo', { values: { provider: providerName } })}</span>
  {:else}
    {#if iconError}
      <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
      </svg>
    {:else}
      <img
        src={iconPath}
        alt="{providerName} logo"
        class="icon"
        aria-hidden="true"
        onerror={() => (iconError = true)}
      />
    {/if}
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
