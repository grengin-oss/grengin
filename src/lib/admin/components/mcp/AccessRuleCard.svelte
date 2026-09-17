<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import type { McpAccessRule } from '../../types.js';
  import { _ } from 'svelte-i18n';

  interface Props {
    rule: McpAccessRule;
    inherited?: boolean;
    deleting?: boolean;
    onDelete?: (ruleId: string) => void;
  }

  let { rule, inherited = false, deleting = false, onDelete }: Props = $props();

  const displayName = $derived(() => {
    switch (rule.access_type) {
      case 'role': return rule.role_name || rule.role_id || '';
      case 'department': return rule.department_name || rule.department_id || '';
      case 'user': return rule.user_email || rule.user_id || '';
      default: return '';
    }
  });

  const permissionLabel = $derived(() => {
    switch (rule.permission) {
      case 'full': return $_('admin.mcpAccess.permissions.full');
      case 'read_only': return $_('admin.mcpAccess.permissions.readOnly');
      case 'denied': return $_('admin.mcpAccess.permissions.denied');
      default: return rule.permission;
    }
  });

  const typeLabel = $derived(() => {
    switch (rule.access_type) {
      case 'role': return $_('admin.mcpAccess.types.role');
      case 'department': return $_('admin.mcpAccess.types.department');
      case 'user': return $_('admin.mcpAccess.types.user');
      default: return rule.access_type;
    }
  });
</script>

<!-- ".rule-row" — mcp-server-detail.html -->
<div class="rule-row" class:rule-row--inherited={inherited}>
  <div class="rule-row-left">
    <span class="rule-kind">{typeLabel()}</span>
    <span class="rule-name" title={displayName()}>{displayName()}</span>
    {#if rule.access_type === 'department' && rule.inherit_departments}
      <span class="rule-sub">{$_('admin.mcpAccess.includesSubDepts')}</span>
    {/if}
  </div>
  <div class="rule-row-right">
    <span
      class="rule-perm"
      class:rule-perm--full={rule.permission === 'full'}
      class:rule-perm--read-only={rule.permission === 'read_only'}
      class:rule-perm--denied={rule.permission === 'denied'}
    >
      <span class="rule-perm-dot"></span>
      {permissionLabel()}
    </span>
    {#if inherited}
      <span class="rule-inherited">{$_('admin.mcpAccess.inherited')}</span>
    {:else if onDelete}
      <button
        class="rule-remove"
        type="button"
        onclick={() => onDelete?.(rule.id)}
        disabled={deleting}
        aria-label={$_('admin.mcpAccess.removeRule')}
        title={$_('admin.mcpAccess.removeRule')}
      >
        {#if deleting}
          <span class="rule-remove-spinner" aria-hidden="true"></span>
        {:else}
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
            <path
              d="M2.5 3.5h8M5 3.5V2h3v1.5M3.5 3.5 4 11h5l.5-7.5"
              stroke="currentColor"
              stroke-width="1.1"
              fill="none"
            />
          </svg>
        {/if}
      </button>
    {/if}
  </div>
</div>

<style>
  /* ===== mcp-server-detail.html ".rule-row", transcribed. ===== */
  button {
    padding: 0;
    border: 0;
    border-radius: 0;
    background: none;
    box-shadow: none;
    color: inherit;
    font: inherit;
    line-height: normal;
    cursor: pointer;
    transition: none;
  }

  button:hover,
  button:active {
    transform: none;
    box-shadow: none;
    background: none;
  }

  button:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .rule-row {
    border-radius: 10px;
    background: var(--gx-surface);
    box-shadow: inset 0 0 0 1px var(--gx-ring-soft);
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    font-family: var(--gx-font);
  }

  /* A tool rule that comes down from the server is shown, not editable. */
  .rule-row--inherited {
    opacity: 0.65;
  }

  .rule-row-left {
    display: flex;
    gap: 10px;
    align-items: center;
    min-width: 0;
  }

  .rule-kind {
    border-radius: 6px;
    background: var(--gx-an-field-bg);
    padding: 3px 8px;
    font-weight: 700;
    font-size: 10px;
    line-height: 100%;
    letter-spacing: 0.4px;
    text-transform: uppercase;
    color: var(--gx-an-sub);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .rule-name {
    font-weight: 600;
    font-size: 13px;
    line-height: 100%;
    color: var(--gx-org-ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .rule-sub {
    border-radius: 6px;
    background: var(--gx-ring-soft);
    padding: 3px 8px;
    font-weight: 600;
    font-size: 10px;
    line-height: 100%;
    color: var(--gx-tx-accent);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .rule-row-right {
    display: flex;
    gap: 14px;
    align-items: center;
    flex-shrink: 0;
  }

  .rule-perm {
    font-weight: 600;
    font-size: 12px;
    line-height: 100%;
    display: flex;
    gap: 6px;
    align-items: center;
    white-space: nowrap;
  }

  .rule-perm-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: currentColor;
    flex-shrink: 0;
  }

  .rule-perm--full {
    color: var(--gx-mcpd-perm-full);
  }

  .rule-perm--read-only {
    color: var(--gx-mcpd-perm-read);
  }

  .rule-perm--denied {
    color: var(--gx-mcpd-perm-denied);
  }

  .rule-inherited {
    font-size: 11px;
    color: var(--gx-an-sub);
    font-style: italic;
  }

  .rule-remove {
    width: 24px;
    height: 24px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--gx-an-sub);
    flex-shrink: 0;
    transition: background-color 120ms ease;
  }

  .rule-remove:hover:not(:disabled) {
    background: var(--gx-an-field-bg);
  }

  .rule-remove:focus-visible {
    outline: 2px solid var(--gx-tx-accent);
    outline-offset: 2px;
  }

  .rule-remove-spinner {
    width: 12px;
    height: 12px;
    border: 2px solid var(--gx-ring-soft);
    border-top-color: var(--gx-an-sub);
    border-radius: 50%;
    animation: rule-spin 0.6s linear infinite;
  }

  @keyframes rule-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 640px) {
    .rule-row {
      flex-direction: column;
      align-items: flex-start;
    }

    .rule-row-right {
      align-self: flex-end;
    }
  }
</style>
