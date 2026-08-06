<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    children?: Snippet;
    class?: string;
    padded?: boolean;
    ariaLabel?: string;
  }

  let {
    children,
    class: className = '',
    padded = true,
    ariaLabel = '',
  }: Props = $props();
</script>

<section class={`admin-panel-card ${padded ? 'padded' : 'flush'} ${className}`.trim()} aria-label={ariaLabel}>
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

