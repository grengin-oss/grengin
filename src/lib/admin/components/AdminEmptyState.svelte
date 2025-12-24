<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title?: string;
    message: string;
    icon?: Snippet;
    actions?: Snippet;
    class?: string;
  }

  let {
    title = '',
    message,
    icon,
    actions,
    class: className = '',
  }: Props = $props();
</script>

<div class={`admin-empty-state ${className}`.trim()} role="status">
  {#if icon}
    <div class="empty-icon" aria-hidden="true">
      {@render icon?.()}
    </div>
  {/if}

  {#if title}
    <h3>{title}</h3>
  {/if}
  <p>{message}</p>

  {#if actions}
    <div class="empty-actions">
      {@render actions?.()}
    </div>
  {/if}
</div>

<style>
  .admin-empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-lg);
    padding: var(--space-3xl);
    text-align: center;
    color: var(--text-secondary);
  }

  .empty-icon {
    width: 3rem;
    height: 3rem;
    display: grid;
    place-items: center;
    color: var(--text-secondary);
    opacity: 0.7;
  }

  h3 {
    margin: 0;
    color: var(--text-primary);
    font-size: 1.1rem;
    font-weight: 700;
  }

  p {
    margin: 0;
    font-size: 0.95rem;
  }

  .empty-actions {
    display: flex;
    gap: var(--space-sm);
    flex-wrap: wrap;
    justify-content: center;
  }
</style>

