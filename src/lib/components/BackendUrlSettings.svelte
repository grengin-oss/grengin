<script lang="ts">
  import { onMount } from 'svelte';
  import {
    API_BASE_CHANGE_EVENT,
    getApiBase,
    getApiBaseOverride,
    getDefaultApiBase,
    resetApiBaseOverride,
    setApiBaseOverride,
  } from '../api/client.js';

  interface Props {
    compact?: boolean;
  }

  function readApiBaseState(): {
    currentUrl: string;
    defaultUrl: string;
    overrideUrl: string | null;
  } {
    return {
      currentUrl: getApiBase(),
      defaultUrl: getDefaultApiBase(),
      overrideUrl: getApiBaseOverride(),
    };
  }

  let { compact = false }: Props = $props();
  const initialApiBaseState = readApiBaseState();

  let currentUrl = $state(initialApiBaseState.currentUrl);
  let defaultUrl = $state(initialApiBaseState.defaultUrl);
  let overrideUrl = $state<string | null>(initialApiBaseState.overrideUrl);
  let draftUrl = $state(initialApiBaseState.overrideUrl ?? initialApiBaseState.currentUrl);
  let error = $state('');
  let status = $state('');
  let compactEditorOpen = $state(false);

  let isUsingDefault = $derived(overrideUrl === null);
  let showEditor = $derived(!compact || compactEditorOpen);
  let canSave = $derived(draftUrl.trim() !== (overrideUrl ?? currentUrl));

  function syncFromClient(): void {
    const state = readApiBaseState();
    currentUrl = state.currentUrl;
    defaultUrl = state.defaultUrl;
    overrideUrl = state.overrideUrl;
    draftUrl = overrideUrl ?? currentUrl;
  }

  function displayHost(url: string): string {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  }

  function handleSave(event: SubmitEvent): void {
    event.preventDefault();
    error = '';
    status = '';

    try {
      currentUrl = setApiBaseOverride(draftUrl);
      overrideUrl = getApiBaseOverride();
      draftUrl = currentUrl;
      status = 'Backend URL saved.';
      if (compact) {
        compactEditorOpen = false;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to save backend URL.';
    }
  }

  function handleReset(): void {
    error = '';
    currentUrl = resetApiBaseOverride();
    overrideUrl = null;
    draftUrl = currentUrl;
    status = 'Using default backend URL.';
    if (compact) {
      compactEditorOpen = false;
    }
  }

  onMount(() => {
    syncFromClient();

    const handleApiBaseChange = () => {
      syncFromClient();
    };

    window.addEventListener(API_BASE_CHANGE_EVENT, handleApiBaseChange);
    return () => window.removeEventListener(API_BASE_CHANGE_EVENT, handleApiBaseChange);
  });
</script>

<section
  class="backend-settings"
  class:backend-settings--compact={compact}
  aria-labelledby={compact ? undefined : 'backend-url-heading'}
>
  <div class="backend-header">
    <div>
      {#if compact}
        <p class="backend-eyebrow">Backend</p>
      {:else}
        <h2 id="backend-url-heading">Backend URL</h2>
      {/if}
      <p class="backend-summary">
        {isUsingDefault ? 'Default' : 'Custom'}: <span title={currentUrl}>{displayHost(currentUrl)}</span>
      </p>
    </div>
    {#if compact}
      <button
        type="button"
        class="backend-edit"
        aria-expanded={compactEditorOpen}
        onclick={() => {
          error = '';
          status = '';
          compactEditorOpen = !compactEditorOpen;
        }}
      >
        {compactEditorOpen ? 'Close' : 'Edit'}
      </button>
    {:else if !isUsingDefault}
      <span class="backend-badge">Custom</span>
    {/if}
  </div>

  {#if showEditor}
    <form class="backend-form" onsubmit={handleSave}>
      <label for={compact ? 'login-backend-url' : 'settings-backend-url'}>API base URL</label>
      <div class="backend-input-row">
        <input
          id={compact ? 'login-backend-url' : 'settings-backend-url'}
          type="url"
          bind:value={draftUrl}
          placeholder={defaultUrl}
          autocomplete="url"
          autocapitalize="off"
          spellcheck="false"
        />
        <button type="submit" class="backend-save" disabled={!canSave}>Save</button>
      </div>
      <div class="backend-actions">
        <button type="button" class="backend-reset" disabled={isUsingDefault} onclick={handleReset}>
          Reset default
        </button>
        <span class="backend-default" title={defaultUrl}>Default: {displayHost(defaultUrl)}</span>
      </div>
      {#if error}
        <p class="backend-message backend-message--error">{error}</p>
      {:else if status}
        <p class="backend-message backend-message--success">{status}</p>
      {/if}
    </form>
  {/if}
</section>

<style>
  .backend-settings {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
    padding: var(--space-lg);
    border: 1px solid var(--surface-border);
    border-radius: 8px;
    background: var(--surface-card);
  }

  .backend-settings--compact {
    gap: var(--space-sm);
    padding: var(--space-md);
    background: color-mix(in oklab, var(--surface-card) 86%, transparent);
  }

  .backend-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-md);
  }

  .backend-header h2,
  .backend-eyebrow {
    margin: 0 0 var(--space-xs);
    color: var(--text-primary);
    font-size: 1rem;
    font-weight: 750;
    line-height: 1.2;
  }

  .backend-eyebrow {
    font-size: 0.82rem;
    text-transform: uppercase;
    letter-spacing: 0;
  }

  .backend-summary {
    margin: 0;
    color: var(--text-secondary);
    font-size: 0.84rem;
    font-weight: 600;
    line-height: 1.35;
    word-break: break-word;
  }

  .backend-badge {
    flex: 0 0 auto;
    padding: 0.22rem 0.45rem;
    border: 1px solid color-mix(in oklab, var(--brand) 40%, var(--surface-border));
    border-radius: 6px;
    color: var(--brand);
    font-size: 0.7rem;
    font-weight: 750;
    line-height: 1;
  }

  .backend-edit {
    flex: 0 0 auto;
    min-width: 3.25rem;
    height: 2rem;
    padding: 0 0.65rem;
    border: 1px solid var(--surface-border);
    border-radius: 8px;
    background: var(--surface-elevated);
    color: var(--text-primary);
    font-size: 0.78rem;
    font-weight: 750;
    cursor: pointer;
  }

  .backend-edit:hover {
    background: var(--surface-card-interactive);
  }

  .backend-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .backend-form label {
    color: var(--text-secondary);
    font-size: 0.78rem;
    font-weight: 700;
  }

  .backend-input-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--space-sm);
  }

  .backend-input-row input {
    min-width: 0;
    width: 100%;
    height: 2.5rem;
    padding: 0 var(--space-md);
    border: 1px solid var(--surface-border);
    border-radius: 8px;
    background: var(--surface-elevated);
    color: var(--text-primary);
    font-size: 0.88rem;
    outline: none;
  }

  .backend-input-row input:focus {
    border-color: var(--brand);
    box-shadow: 0 0 0 3px color-mix(in oklab, var(--brand) 16%, transparent);
  }

  .backend-save,
  .backend-reset {
    border: 1px solid transparent;
    border-radius: 8px;
    font-weight: 750;
    cursor: pointer;
    transition:
      background 0.15s ease,
      border-color 0.15s ease,
      opacity 0.15s ease;
  }

  .backend-save {
    height: 2.5rem;
    padding: 0 var(--space-md);
    background: var(--brand);
    color: white;
  }

  .backend-save:disabled,
  .backend-reset:disabled {
    cursor: not-allowed;
    opacity: 0.48;
  }

  .backend-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm);
    min-width: 0;
  }

  .backend-reset {
    padding: 0.38rem 0.55rem;
    background: transparent;
    border-color: var(--surface-border);
    color: var(--text-secondary);
    font-size: 0.76rem;
  }

  .backend-reset:not(:disabled):hover {
    background: var(--surface-card-interactive);
    color: var(--text-primary);
  }

  .backend-default {
    min-width: 0;
    color: var(--text-tertiary);
    font-size: 0.74rem;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .backend-message {
    margin: 0;
    font-size: 0.78rem;
    font-weight: 650;
  }

  .backend-message--error {
    color: #ef4444;
  }

  .backend-message--success {
    color: var(--brand-green, #22c55e);
  }

  @media (max-width: 480px) {
    .backend-input-row {
      grid-template-columns: 1fr;
    }

    .backend-save {
      width: 100%;
    }
  }
</style>
