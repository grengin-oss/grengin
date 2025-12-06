<script lang="ts">
  interface Props {
    message: string;
    onretry?: () => void;
  }

  let { message, onretry }: Props = $props();
</script>

<div class="error-message" role="alert" aria-live="assertive">
  <svg class="error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="8" x2="12" y2="12"/>
    <line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
  <div class="error-content">
    <p class="error-text">{message}</p>
    {#if onretry}
      <button class="btn-primary" onclick={onretry}>
        Try Again
      </button>
    {/if}
  </div>
</div>

<style>
  .error-message {
    display: flex;
    align-items: flex-start;
    gap: var(--space-lg);
    padding: var(--space-xl);
    background: var(--danger-surface);
    border-left: 4px solid var(--brand-red);
    border-radius: var(--radius-md);
    margin: var(--space-xl) 0;
  }

  .error-icon {
    width: 1.5rem;
    height: 1.5rem;
    color: var(--brand-red);
    flex-shrink: 0;
  }

  .error-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .error-text {
    font-size: 0.9375rem;
    color: var(--text-primary);
    margin: 0;
  }
</style>

