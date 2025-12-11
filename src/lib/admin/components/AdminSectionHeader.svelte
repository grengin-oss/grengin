<script lang="ts">
  interface Props {
    title: string;
    subtitle?: string;
    actions?: any;
    class?: string;
  }

  let {
    title,
    subtitle = '',
    actions,
    class: className = '',
  }: Props = $props();
</script>

<header class={`admin-section-header ${className}`.trim()} aria-label={subtitle || title}>
  <div class="heading">
    <h2>{title}</h2>
    {#if subtitle}
      <p>{subtitle}</p>
    {/if}
  </div>
  {#if actions}
    <div class="actions">
      {@render actions?.()}
    </div>
  {/if}
</header>

<style>
  .admin-section-header {
    display: flex;
    justify-content: space-between;
    gap: var(--space-lg);
    align-items: flex-start;
    flex-wrap: wrap;
    margin-bottom: var(--space-xl);
  }

  .heading h2 {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0 0 var(--space-xs) 0;
  }

  .heading p {
    margin: 0;
    color: var(--text-secondary);
    font-size: 0.9375rem;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    flex-wrap: wrap;
  }
</style>

