<script lang="ts">
  interface Props {
    size?: 'sm' | 'md' | 'lg';
    text?: string;
  }

  let { size = 'md', text }: Props = $props();
</script>

<div class="loading-spinner" role="status" aria-live="polite">
  <div class="spinner spinner-{size}"></div>
  {#if text}
    <p class="loading-text">{text}</p>
  {/if}
</div>

<style>
  .loading-spinner {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-lg);
    padding: var(--space-3xl);
  }

  .spinner {
    border: 3px solid rgba(var(--brand-rgb), 0.1);
    border-top-color: var(--brand);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .spinner-sm {
    width: 1rem;
    height: 1rem;
  }

  .spinner-md {
    width: 2rem;
    height: 2rem;
  }

  .spinner-lg {
    width: 3rem;
    height: 3rem;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .loading-text {
    font-size: 0.875rem;
    color: var(--text-secondary);
    margin: 0;
  }
</style>
