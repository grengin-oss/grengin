<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    subtitle?: string;
    children?: Snippet;
  }

  let { title, subtitle, children }: Props = $props();
</script>

<header class="page-header">
  <div class="page-header-content">
    <h1 class="page-title">{title}</h1>
    {#if subtitle}
      <p class="page-subtitle">{subtitle}</p>
    {/if}
  </div>
  {#if children}
    <div class="page-header-actions">
      {@render children()}
    </div>
  {/if}
</header>

<style>
  .page-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-xl);
    padding-bottom: var(--space-xl);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .page-header-content {
    flex: 1;
  }

  .page-title {
    font-size: 2rem;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0 0 var(--space-sm) 0;
    letter-spacing: -0.02em;
  }

  .page-subtitle {
    font-size: 1rem;
    color: var(--text-secondary);
    margin: 0;
  }

  .page-header-actions {
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }

  @media (max-width: 768px) {
    .page-header {
      flex-direction: column;
      align-items: stretch;
    }

    .page-title {
      font-size: 1.5rem;
    }

    .page-header-actions {
      width: 100%;
    }
  }
</style>

