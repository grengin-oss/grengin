<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { onMount } from 'svelte';
  import type {
    MCPServer,
    McpServerAccessResponse,
    McpAccessRule,
    McpAccessRuleCreatePayload,
    McpDefaultAccess,
  } from '../../types.js';
  import {
    getServerAccess,
    updateServerDefaultAccess,
    createServerAccessRule,
    deleteServerAccessRule,
  } from '../../../api/admin/mcpServers.js';
  import AccessRuleCard from './AccessRuleCard.svelte';
  import AddAccessRuleModal from './AddAccessRuleModal.svelte';
  import LoadingSpinner from '../LoadingSpinner.svelte';
  import { toast } from '../../../components/Toaster.svelte';
  import { ApiError } from '../../../api/client.js';
  import { getLocalizedError } from '../../../utils/errorLocalization.js';
  import { _ } from 'svelte-i18n';

  interface Props {
    server: MCPServer;
  }

  let { server }: Props = $props();

  let accessData = $state<McpServerAccessResponse | null>(null);
  let isLoading = $state(false);
  let defaultAccess = $state<McpDefaultAccess | null>(null);
  let savingDefault = $state(false);
  let deletingRuleId = $state<string | null>(null);
  let addRuleModalOpen = $state(false);
  let addingRule = $state(false);

  const defaultAccessOptions: { value: McpDefaultAccess; labelKey: string; descKey: string }[] = [
    { value: 'all_users', labelKey: 'admin.mcpAccess.defaultAccess.allUsers', descKey: 'admin.mcpAccess.defaultAccess.allUsersDesc' },
    { value: 'admin_only', labelKey: 'admin.mcpAccess.defaultAccess.adminOnly', descKey: 'admin.mcpAccess.defaultAccess.adminOnlyDesc' },
    { value: 'explicit_only', labelKey: 'admin.mcpAccess.defaultAccess.explicitOnly', descKey: 'admin.mcpAccess.defaultAccess.explicitOnlyDesc' },
  ];

  onMount(() => {
    loadAccess();
  });

  async function loadAccess() {
    isLoading = true;
    try {
      accessData = await getServerAccess(server.id);
      defaultAccess = accessData.default_access;
    } catch (err: any) {
      const msg = err instanceof ApiError ? getLocalizedError(err, 'description', $_) : err.message;
      toast.error(msg || $_('admin.mcpAccess.failedToLoad'));
    } finally {
      isLoading = false;
    }
  }

  async function handleDefaultAccessChange(value: McpDefaultAccess) {
    if (savingDefault || value === defaultAccess) return;
    savingDefault = true;
    const prev = defaultAccess;
    defaultAccess = value;
    try {
      const response = await updateServerDefaultAccess(server.id, value);
      accessData = response;
      defaultAccess = response.default_access;
      toast.success($_('admin.mcpAccess.defaultAccessUpdated'));
    } catch (err: any) {
      defaultAccess = prev;
      const msg = err instanceof ApiError ? getLocalizedError(err, 'description', $_) : err.message;
      toast.error(msg || $_('admin.mcpAccess.failedToUpdateDefault'));
    } finally {
      savingDefault = false;
    }
  }

  async function handleAddRule(rule: McpAccessRuleCreatePayload) {
    addingRule = true;
    try {
      await createServerAccessRule(server.id, rule);
      await loadAccess();
      addRuleModalOpen = false;
      toast.success($_('admin.mcpAccess.ruleAdded'));
    } catch (err: any) {
      const msg = err instanceof ApiError ? getLocalizedError(err, 'description', $_) : err.message;
      toast.error(msg || $_('admin.mcpAccess.failedToAddRule'));
    } finally {
      addingRule = false;
    }
  }

  async function handleDeleteRule(ruleId: string) {
    if (deletingRuleId) return;
    deletingRuleId = ruleId;
    try {
      await deleteServerAccessRule(server.id, ruleId);
      if (accessData) {
        accessData = {
          ...accessData,
          rules: (accessData.rules || []).filter(r => r.id !== ruleId),
        };
      }
      toast.success($_('admin.mcpAccess.ruleRemoved'));
    } catch (err: any) {
      const msg = err instanceof ApiError ? getLocalizedError(err, 'description', $_) : err.message;
      toast.error(msg || $_('admin.mcpAccess.failedToRemoveRule'));
    } finally {
      deletingRuleId = null;
    }
  }
</script>

<div class="access-panel">
  {#if isLoading}
    <LoadingSpinner text={$_('admin.mcpAccess.loading')} size="md" />
  {:else if accessData}
    <div class="access-section">
      <div class="section-header">
        <h3 class="section-title">{$_('admin.mcpAccess.defaultAccessTitle')}</h3>
      </div>
      <div class="default-access-options">
        {#each defaultAccessOptions as option (option.value)}
          <label
            class="default-access-option"
            class:default-access-option--active={defaultAccess === option.value}
            class:default-access-option--saving={savingDefault}
          >
            <input
              type="radio"
              name="default_access"
              value={option.value}
              checked={defaultAccess === option.value}
              onchange={() => handleDefaultAccessChange(option.value)}
              disabled={savingDefault}
            />
            <div class="option-header">
              <div class="default-access-radio">
                <div class="radio-dot"></div>
              </div>
              <span class="default-access-label">{$_(option.labelKey)}</span>
            </div>
            <span class="default-access-desc">{$_(option.descKey)}</span>
          </label>
        {/each}
      </div>
    </div>

    <div class="section-divider"></div>

    <div class="access-section">
      <div class="section-header">
        <h3 class="section-title">{$_('admin.mcpAccess.accessRules')}</h3>
        <button class="btn-add-rule" onclick={() => addRuleModalOpen = true}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          <span>{$_('admin.mcpAccess.addRule')}</span>
        </button>
      </div>

      {#if !accessData.rules || accessData.rules.length === 0}
        <div class="empty-rules">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          <p>{$_('admin.mcpAccess.noRules')}</p>
          <span class="empty-rules-hint">{$_('admin.mcpAccess.noRulesHint')}</span>
        </div>
      {:else}
        <div class="rules-list">
          {#each (accessData.rules || []) as rule (rule.id)}
            <AccessRuleCard
              {rule}
              deleting={deletingRuleId === rule.id}
              onDelete={handleDeleteRule}
            />
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

<AddAccessRuleModal
  isOpen={addRuleModalOpen}
  onClose={() => addRuleModalOpen = false}
  onAdd={handleAddRule}
  isSubmitting={addingRule}
/>

<style>
  .access-panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .access-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-md);
  }

  .section-title {
    font-size: 0.9375rem;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0;
    letter-spacing: -0.01em;
  }

  .section-divider {
    height: 1px;
    background: rgba(255, 255, 255, 0.06);
    margin: var(--space-sm) 0;
  }

  .default-access-options {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-md);
  }

  .default-access-option {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    padding: var(--space-lg);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    background: rgba(var(--glass-tint), 0.02);
  }

  .default-access-option input[type="radio"] {
    display: none;
  }

  .default-access-option:hover:not(.default-access-option--saving) {
    border-color: rgba(255, 255, 255, 0.16);
    background: rgba(var(--glass-tint), 0.05);
    transform: translateY(-2px);
  }

  .default-access-option--active {
    border-color: var(--brand);
    background: rgba(var(--brand-rgb), 0.06);
    box-shadow: 0 0 0 1px var(--brand);
  }

  .default-access-option--saving {
    opacity: 0.6;
    cursor: wait;
  }

  .option-header {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .default-access-radio {
    width: 18px;
    height: 18px;
    border: 2px solid rgba(255, 255, 255, 0.2);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: border-color 0.2s ease;
  }

  .default-access-option--active .default-access-radio {
    border-color: var(--brand);
  }

  .radio-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: transparent;
    transition: background 0.2s ease;
  }

  .default-access-option--active .radio-dot {
    background: var(--brand);
  }

  .default-access-label {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .default-access-desc {
    font-size: 0.75rem;
    color: var(--text-tertiary);
    line-height: 1.4;
  }

  @media (max-width: 768px) {
    .default-access-options {
      grid-template-columns: 1fr;
    }
  }

  .btn-add-rule {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-xs) var(--space-md);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--brand);
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
  }

  .btn-add-rule:hover {
    background: rgba(var(--brand-rgb), 0.06);
    border-color: rgba(var(--brand-rgb), 0.3);
  }

  .rules-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .empty-rules {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-2xl) var(--space-lg);
    text-align: center;
    color: var(--text-tertiary);
  }

  .empty-rules svg {
    opacity: 0.3;
  }

  .empty-rules p {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-secondary);
    margin: 0;
  }

  .empty-rules-hint {
    font-size: 0.75rem;
    color: var(--text-tertiary);
  }

  @media (prefers-color-scheme: light) {
    .section-divider {
      background: rgba(0, 0, 0, 0.08);
    }

    .default-access-option {
      border-color: rgba(0, 0, 0, 0.08);
    }

    .default-access-option:hover:not(.default-access-option--saving) {
      border-color: rgba(0, 0, 0, 0.15);
      background: rgba(0, 0, 0, 0.02);
    }

    .default-access-radio {
      border-color: rgba(0, 0, 0, 0.2);
    }
  }
</style>
