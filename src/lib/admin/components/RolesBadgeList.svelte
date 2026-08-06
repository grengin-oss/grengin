<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { _ } from "svelte-i18n";

  interface Props {
    roles?: string[] | null;
    emptyLabel?: string;
  }

  let { roles, emptyLabel = "-" }: Props = $props();

  const rolesList = $derived(() => {
    const baseRoles = Array.isArray(roles) ? roles : roles ? [roles] : [];
    return [...new Set(baseRoles.filter(Boolean))];
  });
</script>

<div class="roles-cell">
  {#if rolesList().length > 0}
    <span class="role-badge">{rolesList()[0]}</span>
    {#if rolesList().length > 1}
      <button
        class="roles-more-btn"
        type="button"
        aria-label={$_("admin.users.moreRoles", {
          values: { count: rolesList().length - 1 },
        })}
      >
        +{rolesList().length - 1}
        <span class="roles-tooltip">
          {#each rolesList() as roleName}
            <span class="roles-tooltip-item">{roleName}</span>
          {/each}
        </span>
      </button>
    {/if}
  {:else}
    <span class="role-empty">{emptyLabel}</span>
  {/if}
</div>

<style>
  .role-badge {
    display: inline-block;
    padding: var(--space-xs) var(--space-sm);
    border-radius: var(--radius-sm);
    font-size: 0.8125rem;
    font-weight: 600;
    text-transform: none;
    background: rgba(var(--glass-tint), 0.1);
    color: var(--text-secondary);
  }

  .roles-cell {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    min-height: 28px;
  }

  .roles-more-btn {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    padding: 2px var(--space-xs);
    border-radius: var(--radius-sm);
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: var(--surface-subtle);
    color: var(--text-secondary);
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .roles-more-btn:hover,
  .roles-more-btn:focus-visible {
    color: var(--text-primary);
    background: var(--surface-card);
    border-color: rgba(255, 255, 255, 0.12);
    z-index: 1001;
  }

  .roles-tooltip {
    position: absolute;
    bottom: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%) translateY(4px);
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--radius-lg);
    background: var(--surface-card);
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow:
      0 10px 24px rgba(0, 0, 0, 0.18),
      0 0 0 1px rgba(255, 255, 255, 0.04) inset;
    white-space: nowrap;
    opacity: 0;
    z-index: 9999;
    pointer-events: none;
    transition:
      opacity 0.2s ease,
      transform 0.2s ease;
  }

  .roles-tooltip::before {
    content: "";
    position: absolute;
    z-index: 9999;
    bottom: -6px;
    left: 50%;
    transform: translateX(-50%) rotate(45deg);
    width: 10px;
    height: 10px;
    background: var(--surface-card);
    border-right: 1px solid rgba(255, 255, 255, 0.1);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .roles-more-btn:hover .roles-tooltip,
  .roles-more-btn:focus-visible .roles-tooltip {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }

  .roles-tooltip-item {
    padding: 2px var(--space-sm);
    border-radius: var(--radius-md);
    background: rgba(var(--glass-tint), 0.08);
    border: 1px solid rgba(255, 255, 255, 0.08);
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .role-empty {
    color: var(--text-secondary);
    font-size: 0.875rem;
  }
</style>
