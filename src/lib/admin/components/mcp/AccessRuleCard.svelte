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

  const typeIcon = $derived(() => {
    switch (rule.access_type) {
      case 'role': return 'role';
      case 'department': return 'department';
      case 'user': return 'user';
      default: return 'user';
    }
  });

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

  const displayId = $derived(() => {
    switch (rule.access_type) {
      case 'role': return rule.role_id || '';
      case 'department': return rule.department_id || '';
      case 'user': return rule.user_id || '';
      default: return '';
    }
  });
</script>

<div class="rule-card" class:rule-card--inherited={inherited}>
  <div class="rule-main">
    <div class="rule-icon" class:rule-icon--role={rule.access_type === 'role'} class:rule-icon--department={rule.access_type === 'department'} class:rule-icon--user={rule.access_type === 'user'}>
      {#if rule.access_type === 'role'}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
      {:else if rule.access_type === 'department'}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
      {:else}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
      {/if}
    </div>
    <div class="rule-content">
      <div class="rule-header">
        <span class="rule-name" title={displayName()}>{displayName()}</span>
        {#if rule.access_type === 'department' && rule.inherit_departments}
          <span class="rule-badge">{$_('admin.mcpAccess.includesSubDepts')}</span>
        {/if}
      </div>
      <div class="rule-meta">
        <span class="rule-type">{typeLabel()}</span>
        {#if displayId()}
          <span class="rule-separator">•</span>
          <span class="rule-id" title={displayId()}>ID: {displayId().substring(0, 8)}&hellip;</span>
        {/if}
      </div>
    </div>
  </div>
  <div class="rule-actions">
    <span
      class="permission-badge"
      class:permission-badge--full={rule.permission === 'full'}
      class:permission-badge--read-only={rule.permission === 'read_only'}
      class:permission-badge--denied={rule.permission === 'denied'}
    >
      <span class="permission-dot"></span>
      {permissionLabel()}
    </span>
    {#if inherited}
      <span class="inherited-label">{$_('admin.mcpAccess.inherited')}</span>
    {:else if onDelete}
      <button
        class="rule-delete-btn"
        onclick={() => onDelete?.(rule.id)}
        disabled={deleting}
        aria-label={$_('admin.mcpAccess.removeRule')}
        title={$_('admin.mcpAccess.removeRule')}
      >
        {#if deleting}
          <span class="rule-delete-spinner"></span>
        {:else}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        {/if}
      </button>
    {/if}
  </div>
</div>

<style>
  .rule-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-md);
    padding: var(--space-md) var(--space-lg);
    background: rgba(var(--glass-tint), 0.02);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: var(--radius-lg);
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .rule-card:hover {
    border-color: rgba(255, 255, 255, 0.12);
    background: rgba(var(--glass-tint), 0.04);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  }

  .rule-card--inherited {
    opacity: 0.65;
    border-style: dashed;
  }

  .rule-main {
    display: flex;
    align-items: center;
    gap: var(--space-lg);
    min-width: 0;
    flex: 1;
  }

  .rule-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: var(--radius-md);
    flex-shrink: 0;
  }

  .rule-icon--role {
    background: rgba(139, 92, 246, 0.12);
    color: #a78bfa;
  }

  .rule-icon--department {
    background: rgba(59, 130, 246, 0.12);
    color: #60a5fa;
  }

  .rule-icon--user {
    background: rgba(16, 185, 129, 0.12);
    color: #34d399;
  }

  .rule-content {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .rule-header {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .rule-name {
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .rule-badge {
    font-size: 0.6875rem;
    padding: 2px 6px;
    border-radius: 4px;
    background: rgba(59, 130, 246, 0.1);
    color: #60a5fa;
    border: 1px solid rgba(59, 130, 246, 0.2);
    white-space: nowrap;
  }

  .rule-meta {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    font-size: 0.75rem;
    color: var(--text-tertiary);
  }

  .rule-type {
    font-weight: 500;
  }

  .rule-separator {
    opacity: 0.4;
    font-size: 0.625rem;
  }

  .rule-id {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    opacity: 0.8;
  }

  .rule-actions {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    flex-shrink: 0;
  }

  .permission-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    font-size: 0.75rem;
    font-weight: 600;
    border-radius: 9999px;
    border: 1px solid transparent;
    white-space: nowrap;
  }

  .permission-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }

  .permission-badge--full {
    background: rgba(16, 185, 129, 0.08);
    color: #34d399;
    border-color: rgba(16, 185, 129, 0.2);
  }
  .permission-badge--full .permission-dot { background: #34d399; }

  .permission-badge--read-only {
    background: rgba(59, 130, 246, 0.08);
    color: #60a5fa;
    border-color: rgba(59, 130, 246, 0.2);
  }
  .permission-badge--read-only .permission-dot { background: #60a5fa; }

  .permission-badge--denied {
    background: rgba(239, 68, 68, 0.08);
    color: #f87171;
    border-color: rgba(239, 68, 68, 0.2);
  }
  .permission-badge--denied .permission-dot { background: #f87171; }

  .inherited-label {
    font-size: 0.6875rem;
    color: var(--text-tertiary);
    font-style: italic;
  }

  .rule-delete-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 1px solid rgba(239, 68, 68, 0.2);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-tertiary);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .rule-delete-btn:hover:not(:disabled) {
    background: rgba(239, 68, 68, 0.08);
    border-color: rgba(239, 68, 68, 0.4);
    color: #f87171;
  }

  .rule-delete-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .rule-delete-spinner {
    display: inline-block;
    width: 12px;
    height: 12px;
    border: 2px solid rgba(224, 224, 224, 0.4);
    border-top-color: var(--brand-red);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  @media (max-width: 640px) {
    .rule-card {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-sm);
    }

    .rule-actions {
      align-self: flex-end;
    }
  }
</style>
