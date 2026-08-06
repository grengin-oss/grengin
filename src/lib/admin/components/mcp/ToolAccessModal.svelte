<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { onMount } from 'svelte';
  import type {
    McpToolAccess,
    McpAccessRule,
    McpAccessRuleCreatePayload,
    McpToolAccessUpdatePayload,
  } from '../../types.js';
  import {
    getToolAccess,
    updateToolAccess,
  } from '../../../api/admin/mcpServers.js';
  import AccessRuleCard from './AccessRuleCard.svelte';
  import AddAccessRuleModal from './AddAccessRuleModal.svelte';
  import Modal from '../Modal.svelte';
  import LoadingSpinner from '../LoadingSpinner.svelte';
  import { toast } from '../../../components/Toaster.svelte';
  import { ApiError } from '../../../api/client.js';
  import { getLocalizedError } from '../../../utils/errorLocalization.js';
  import { _ } from 'svelte-i18n';

  interface Props {
    toolId: string;
    toolName: string;
    isOpen: boolean;
    onClose: () => void;
    onSaved: () => void;
  }

  let { toolId, toolName, isOpen = $bindable(), onClose, onSaved }: Props = $props();

  let toolAccess = $state<McpToolAccess | null>(null);
  let isLoading = $state(false);
  let isSaving = $state(false);
  let inheritFromServer = $state(true);
  let localRules = $state<McpAccessRule[]>([]);
  let addRuleModalOpen = $state(false);
  let addingRule = $state(false);

  $effect(() => {
    if (isOpen && toolId) {
      loadToolAccess();
    }
  });

  async function loadToolAccess() {
    isLoading = true;
    try {
      toolAccess = await getToolAccess(toolId);
      inheritFromServer = toolAccess.inherit_from_server;
      localRules = [...toolAccess.rules];
    } catch (err: any) {
      const msg = err instanceof ApiError ? getLocalizedError(err, 'description', $_) : err.message;
      toast.error(msg || $_('admin.mcpAccess.failedToLoad'));
    } finally {
      isLoading = false;
    }
  }

  function handleRemoveLocalRule(ruleId: string) {
    localRules = localRules.filter(r => r.id !== ruleId);
  }

  function handleAddLocalRule(rule: McpAccessRuleCreatePayload) {
    const newRule: McpAccessRule = {
      id: `local-${Date.now()}`,
      access_type: rule.access_type,
      permission: rule.permission,
      role_id: rule.role_id || null,
      role_name: rule.role_name || null,
      department_id: rule.department_id || null,
      department_name: null,
      user_id: rule.user_id || null,
      user_email: null,
      inherit_departments: rule.inherit_departments ?? false,
      priority: 0,
    };
    localRules = [...localRules, newRule];
    addRuleModalOpen = false;
  }

  async function handleSave() {
    if (isSaving) return;
    isSaving = true;
    try {
      const payload: McpToolAccessUpdatePayload = {
        inherit_from_server: inheritFromServer,
        rules: inheritFromServer ? [] : localRules.map(r => ({
          access_type: r.access_type,
          permission: r.permission,
          role_id: r.role_id || undefined,
          role_name: r.role_name || undefined,
          department_id: r.department_id || undefined,
          user_id: r.user_id || undefined,
          inherit_departments: r.inherit_departments,
        })),
      };
      await updateToolAccess(toolId, payload);
      toast.success($_('admin.mcpAccess.toolAccessSaved'));
      onSaved();
      onClose();
    } catch (err: any) {
      const msg = err instanceof ApiError ? getLocalizedError(err, 'description', $_) : err.message;
      toast.error(msg || $_('admin.mcpAccess.failedToSaveToolAccess'));
    } finally {
      isSaving = false;
    }
  }
</script>

<Modal
  title={`${toolName} › ${$_('admin.mcpAccess.accessControl')}`}
  {isOpen}
  onclose={onClose}
>
  {#snippet children()}
    {#if isLoading}
      <LoadingSpinner text={$_('admin.mcpAccess.loading')} size="md" />
    {:else}
      <div class="tool-access-form">
        <div class="inherit-section">
          <label class="inherit-option" class:inherit-option--active={inheritFromServer}>
            <input type="radio" name="tool_inherit" value="inherit" checked={inheritFromServer} onchange={() => { inheritFromServer = true; }} />
            <div class="inherit-radio"><div class="inherit-dot"></div></div>
            <div class="inherit-content">
              <span class="inherit-label">{$_('admin.mcpAccess.inheritFromServer')}</span>
              <span class="inherit-desc">{$_('admin.mcpAccess.inheritFromServerDesc')}</span>
            </div>
          </label>
          <label class="inherit-option" class:inherit-option--active={!inheritFromServer}>
            <input type="radio" name="tool_inherit" value="custom" checked={!inheritFromServer} onchange={() => { inheritFromServer = false; }} />
            <div class="inherit-radio"><div class="inherit-dot"></div></div>
            <div class="inherit-content">
              <span class="inherit-label">{$_('admin.mcpAccess.customRules')}</span>
              <span class="inherit-desc">{$_('admin.mcpAccess.customRulesDesc')}</span>
            </div>
          </label>
        </div>

        {#if !inheritFromServer}
          <div class="custom-rules-section">
            <div class="custom-rules-header">
              <h4 class="custom-rules-title">{$_('admin.mcpAccess.accessRules')}</h4>
              <button class="btn-add-rule-sm" onclick={() => addRuleModalOpen = true}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                <span>{$_('admin.mcpAccess.addRule')}</span>
              </button>
            </div>

            {#if localRules.length === 0}
              <div class="empty-custom-rules">
                <span>{$_('admin.mcpAccess.noCustomRules')}</span>
              </div>
            {:else}
              <div class="custom-rules-list">
                {#each localRules as rule (rule.id)}
                  <AccessRuleCard
                    {rule}
                    onDelete={handleRemoveLocalRule}
                  />
                {/each}
              </div>
            {/if}
          </div>
        {/if}

        <div class="tool-form-actions">
          <button type="button" class="btn-secondary" onclick={onClose} disabled={isSaving}>
            {$_('common.cancel')}
          </button>
          <button type="button" class="btn-accent" onclick={handleSave} disabled={isSaving}>
            {isSaving ? $_('admin.mcpAccess.saving') : $_('admin.mcpAccess.save')}
          </button>
        </div>
      </div>
    {/if}
  {/snippet}
</Modal>

<AddAccessRuleModal
  isOpen={addRuleModalOpen}
  onClose={() => addRuleModalOpen = false}
  onAdd={handleAddLocalRule}
  isSubmitting={addingRule}
/>

<style>
  .tool-access-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-xl);
  }

  .inherit-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .inherit-option {
    display: flex;
    align-items: flex-start;
    gap: var(--space-md);
    padding: var(--space-md) var(--space-lg);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .inherit-option input[type="radio"] {
    display: none;
  }

  .inherit-option:hover {
    border-color: rgba(255, 255, 255, 0.12);
    background: rgba(var(--glass-tint), 0.03);
  }

  .inherit-option--active {
    border-color: var(--brand);
    background: rgba(var(--brand-rgb), 0.04);
  }

  .inherit-radio {
    width: 18px;
    height: 18px;
    border: 2px solid rgba(255, 255, 255, 0.2);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    margin-top: 1px;
    transition: border-color 0.2s ease;
  }

  .inherit-option--active .inherit-radio {
    border-color: var(--brand);
  }

  .inherit-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: transparent;
    transition: background 0.2s ease;
  }

  .inherit-option--active .inherit-dot {
    background: var(--brand);
  }

  .inherit-content {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .inherit-label {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .inherit-desc {
    font-size: 0.75rem;
    color: var(--text-tertiary);
    line-height: 1.4;
  }

  .custom-rules-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    padding-top: var(--space-md);
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    animation: fadeIn 0.2s ease;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .custom-rules-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .custom-rules-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
  }

  .btn-add-rule-sm {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2xs);
    padding: var(--space-2xs) var(--space-sm);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--brand);
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn-add-rule-sm:hover {
    background: rgba(var(--brand-rgb), 0.06);
    border-color: rgba(var(--brand-rgb), 0.3);
  }

  .custom-rules-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .empty-custom-rules {
    padding: var(--space-lg);
    text-align: center;
    color: var(--text-tertiary);
    font-size: 0.8125rem;
    border: 1px dashed rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-md);
  }

  .tool-form-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-md);
    padding-top: var(--space-lg);
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }
</style>
