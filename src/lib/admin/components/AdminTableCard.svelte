<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    children?: Snippet;
    class?: string;
    minWidth?: string;
  }

  let { children, class: className = "", minWidth = "720px" }: Props = $props();
</script>

<div
  class={`admin-table-card ${className}`.trim()}
  style={`--table-min-width: ${minWidth};`}
>
  <div class="table-scroll">
    {@render children?.()}
  </div>
</div>

<style>
  :global {
    .admin-table-card {
      background: var(--button-bg);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: var(--radius-lg);
      box-shadow: var(--glass-shadow-dark);
      overflow: hidden;
      width: 100%;
    }

    .table-scroll {
      overflow-x: auto;
    }

    table {
      width: 100%;
      min-width: var(--table-min-width);
      border-collapse: collapse;
    }

    thead {
      background: rgba(var(--glass-tint), 0.03);
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }

    th,
    td {
      padding: var(--space-lg);
      text-align: left;
    }

    th {
      font-weight: 600;
      color: var(--text-secondary);
      font-size: 0.875rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    tbody tr {
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      transition: background 0.2s ease;
    }

    tbody tr:last-child {
      border-bottom: none;
    }

    tbody tr:hover {
      background: rgba(var(--glass-tint), 0.03);
    }
  }
</style>
