<script lang="ts">
  interface Props {
    children?: any;
    class?: string;
    padded?: boolean;
  }

  let {
    children,
    class: className = '',
    padded = true,
  }: Props = $props();
</script>

<section class={`admin-panel-card ${padded ? 'padded' : 'flush'} ${className}`.trim()}>
  {@render children?.()}
</section>

<style>
  .admin-panel-card {
    background: var(--button-bg);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-lg);
    box-shadow: var(--glass-shadow-dark);
    width: 100%;
    transition: box-shadow 0.2s ease, transform 0.2s ease;
  }

  .admin-panel-card.padded {
    padding: var(--space-xl);
  }

  .admin-panel-card.flush {
    padding: 0;
  }

  .admin-panel-card:hover {
    box-shadow: var(--glass-shadow-emphasis);
    transform: translateY(-1px);
  }
</style>

