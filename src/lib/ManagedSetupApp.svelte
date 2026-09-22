<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import AuthCallback from './features/auth/components/AuthCallback.svelte';
  import { getAuthState, initAuth, initiateOAuth } from './features/auth/index.js';
  import type { ManagedProvider } from './managed-setup';
  let { provider }: { provider: ManagedProvider } = $props();
  const auth = getAuthState();
  let callback = $state(/^\/auth\/(google|azure)\/callback$/.test(window.location.pathname));
  let busy = $state(false);
  let error = $state('');
  // This component never initializes permissions, notification streams or ordinary application routes.
  // Restoring the backend session from storage does not issue /me or refresh requests.
  onMount(() => initAuth());
  async function signIn() {
    busy = true; error = '';
    try { await initiateOAuth(provider, `${window.location.origin}/auth/${provider}/callback`); }
    catch { error = 'Sign-in could not be started. Please try again.'; busy = false; }
  }
  function completed() {
    window.history.replaceState(null, '', '/');
    callback = false;
  }
</script>

{#if callback}
  <AuthCallback managedSetup creatorProvider={provider} onSetupComplete={completed} />
{:else}
  <main class="setup-screen">
    <section aria-labelledby="setup-title">
      <img src="/grengin-icon.svg" width="48" height="48" alt="Grengin" />
      <h1 id="setup-title">{auth.isAuthenticated ? 'Verifying your workspace' : 'Finish setting up your workspace'}</h1>
      <p>{auth.isAuthenticated ? 'Your sign-in is saved on this device. We are verifying your administrator account. You can return to Grengin Cloud while setup finishes.' : 'Sign in with the same account you used to create this workspace. This establishes your administrator account.'}</p>
      <button onclick={signIn} disabled={busy}>{busy ? 'Opening sign-in…' : auth.isAuthenticated ? 'Sign in again' : `Continue with ${provider === 'google' ? 'Google' : 'Microsoft'}`}</button>
      {#if error}<p role="alert">{error}</p>{/if}
      {#if auth.isAuthenticated}<button class="secondary" onclick={() => window.location.reload()}>Check workspace readiness</button>{/if}
      <a href="https://grengin.com/grengin-cloud" rel="noreferrer">Return to Grengin Cloud</a>
    </section>
  </main>
{/if}

<style>
  .setup-screen { min-height: 100vh; display: grid; place-items: center; padding: 24px; background: var(--bg-primary); color: var(--text-primary); }
  section { width: 100%; max-width: 460px; padding: 32px; border: 1px solid var(--border-color, #ddd); border-radius: 16px; }
  h1 { font-size: 1.7rem; line-height: 1.2; margin: 24px 0 16px; }
  p { line-height: 1.6; }
  button, a { display: block; width: 100%; margin-top: 16px; min-height: 44px; }
  button { padding: 12px 16px; border-radius: 8px; border: 1px solid #667eea; background: #667eea; color: #fff; font: inherit; cursor: pointer; }
  button:disabled { opacity: .65; cursor: wait; }
  .secondary { background: transparent; color: inherit; }
  a { text-align: center; color: inherit; line-height: 44px; }
</style>
