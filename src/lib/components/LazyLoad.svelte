<script lang="ts">
  import type { Component } from 'svelte';

  let {
    loader,
    componentProps = {},
  }: {
    /** Dynamic import; default export typing varies per module, so we resolve at runtime. */
    loader: () => Promise<unknown>;
    componentProps?: Record<string, unknown>;
  } = $props();
</script>

{#await loader()}
  <div class="lazy-pending" aria-busy="true" aria-live="polite">
    <div class="lazy-spinner"></div>
  </div>
{:then mod}
  {@const Cmp = (mod as { default: Component<Record<string, unknown>> }).default}
  <Cmp {...componentProps} />
{:catch}
  <p class="lazy-error" role="alert">Failed to load this screen.</p>
{/await}

<style>
  .lazy-pending {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 12rem;
    padding: 2rem;
  }

  .lazy-spinner {
    width: 2.5rem;
    height: 2.5rem;
    border: 3px solid rgba(var(--brand-rgb, 102 126 234), 0.2);
    border-top-color: var(--brand, #667eea);
    border-radius: 50%;
    animation: lazy-spin 0.8s linear infinite;
  }

  .lazy-error {
    margin: 2rem;
    color: var(--color-text-secondary, #666);
    text-align: center;
  }

  @keyframes lazy-spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
