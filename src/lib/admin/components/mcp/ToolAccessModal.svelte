<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
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

<!-- "MODAL: Tool Access Control" — mcp-server-detail.html -->
<Modal
  title={`${toolName} › ${$_('admin.mcpAccess.accessControl')}`}
  subtitle={$_('admin.mcpAccess.toolAccessSubtitle')}
  {isOpen}
  onclose={onClose}
  variant="mcp-tool"
>
  {#snippet children()}
    {#if isLoading}
      <LoadingSpinner text={$_('admin.mcpAccess.loading')} size="md" />
    {:else}
      <!-- "#toolAccessModeOptions" -->
      <div class="access-modes">
        <label class="access-mode-option" data-selected={inheritFromServer}>
          <input
            type="radio"
            name="tool_inherit"
            value="inherit"
            checked={inheritFromServer}
            onchange={() => { inheritFromServer = true; }}
          />
          <span class="access-mode-radio"></span>
          <span class="access-mode-copy">
            <span class="access-mode-title">{$_('admin.mcpAccess.inheritFromServer')}</span>
            <span class="access-mode-desc">{$_('admin.mcpAccess.inheritFromServerDesc')}</span>
          </span>
        </label>
        <label class="access-mode-option" data-selected={!inheritFromServer}>
          <input
            type="radio"
            name="tool_inherit"
            value="custom"
            checked={!inheritFromServer}
            onchange={() => { inheritFromServer = false; }}
          />
          <span class="access-mode-radio"></span>
          <span class="access-mode-copy">
            <span class="access-mode-title">{$_('admin.mcpAccess.customRules')}</span>
            <span class="access-mode-desc">{$_('admin.mcpAccess.customRulesDesc')}</span>
          </span>
        </label>
      </div>

      <!-- "#toolRulesSection" — dimmed and inert while the tool inherits -->
      <div class="tool-rules-section" data-mode={inheritFromServer ? 'inherit' : 'custom'}>
        <div class="tool-rules-heading">
          <div>
            <div class="tool-rules-heading-title">{$_('admin.mcpAccess.accessRules')}</div>
            <div class="tool-rules-count">
              {$_('admin.mcpAccess.toolStatus.custom', { values: { count: localRules.length } })}
            </div>
          </div>
          <button class="btn-secondary-sm" type="button" onclick={() => addRuleModalOpen = true}>
            + {$_('admin.mcpAccess.addRule')}
          </button>
        </div>

        {#if localRules.length === 0}
          <div class="tool-rules-empty">
            <span class="tool-empty-icon" aria-hidden="true">＋</span>
            <span class="rules-empty-title">{$_('admin.mcpAccess.noCustomRulesTitle')}</span>
            <span class="rules-empty-desc">{$_('admin.mcpAccess.noCustomRulesHint')}</span>
          </div>
        {:else}
          <div class="tool-rules-list">
            {#each localRules as rule (rule.id)}
              <AccessRuleCard {rule} onDelete={handleRemoveLocalRule} />
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  {/snippet}

  {#snippet footer()}
    <button class="btn-cancel" type="button" onclick={onClose} disabled={isSaving}>
      {$_('common.cancel')}
    </button>
    <button class="btn-primary" type="button" onclick={handleSave} disabled={isSaving || isLoading}>
      {isSaving ? $_('admin.mcpAccess.saving') : $_('admin.mcpAccess.save')}
    </button>
  {/snippet}
</Modal>

<AddAccessRuleModal
  isOpen={addRuleModalOpen}
  onClose={() => addRuleModalOpen = false}
  onAdd={handleAddLocalRule}
  isSubmitting={addingRule}
/>

<style>
  /* ===== mcp-server-detail.html "MODAL: Tool Access Control", transcribed.
     The card itself (680px, gradient rule, 32px gutters) is Modal's "mcp-tool"
     variant; this sheet is only its contents. ===== */
  button {
    padding: 0;
    border: 0;
    border-radius: 0;
    background: none;
    box-shadow: none;
    color: inherit;
    font: inherit;
    line-height: normal;
    text-align: start;
    white-space: nowrap;
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

  /* ---------------- ".access-mode-option" ---------------- */
  .access-modes {
    display: flex;
    flex-direction: column;
    gap: 12px;
    align-self: stretch;
    width: 100%;
    font-family: var(--gx-font);
  }

  .access-mode-option {
    border-radius: 12px;
    background: var(--gx-surface);
    box-shadow: inset 0 0 0 1px var(--gx-ring-soft);
    display: flex;
    gap: 12px;
    padding: 16px;
    align-items: center;
    cursor: pointer;
    transition:
      box-shadow 120ms ease,
      background-color 120ms ease;
  }

  .access-mode-option input[type="radio"] {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .access-mode-option[data-selected="true"] {
    box-shadow: inset 0 0 0 1.5px var(--gx-tx-accent);
    background: color-mix(in oklab, var(--gx-tx-accent) 6%, var(--gx-surface));
  }

  .access-mode-option:focus-within {
    outline: 2px solid var(--gx-tx-accent);
    outline-offset: 2px;
  }

  .access-mode-radio {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    box-shadow: inset 0 0 0 1.5px var(--gx-ring-soft);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--gx-surface);
  }

  .access-mode-option[data-selected="true"] .access-mode-radio {
    box-shadow: none;
    background: var(--gx-tx-accent);
  }

  .access-mode-option[data-selected="true"] .access-mode-radio::after {
    content: "";
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--gx-surface);
  }

  .access-mode-copy {
    min-width: 0;
  }

  .access-mode-title {
    display: block;
    font-weight: 600;
    font-size: 14px;
    line-height: 100%;
    color: var(--gx-mcp-m-ink);
    margin-bottom: 4px;
  }

  .access-mode-desc {
    display: block;
    font-weight: 400;
    font-size: 12px;
    line-height: 1.4;
    color: var(--gx-mcp-dim);
  }

  /* ---------------- "#toolRulesSection" ---------------- */
  .tool-rules-section {
    align-self: stretch;
    width: 100%;
    font-family: var(--gx-font);
  }

  .tool-rules-section[data-mode="inherit"] {
    opacity: 0.45;
    pointer-events: none;
  }

  .tool-rules-heading {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }

  .tool-rules-heading-title {
    font-family: var(--gx-font-display);
    font-weight: 700;
    font-size: 14px;
    line-height: 100%;
    color: var(--gx-mcp-m-ink);
  }

  .tool-rules-count {
    font-weight: 400;
    font-size: 11px;
    line-height: 100%;
    color: var(--gx-mcp-dim);
    margin-top: 2px;
  }

  .btn-secondary-sm {
    height: 33px;
    border-radius: 8px;
    background: var(--gx-surface);
    box-shadow: inset 0 0 0 1px var(--gx-mcp-m-ring);
    padding: 8px 14px;
    font-weight: 600;
    font-size: 13px;
    line-height: 100%;
    color: var(--gx-mcp-m-ink);
    flex-shrink: 0;
    transition: background-color 120ms ease;
  }

  .btn-secondary-sm:hover:not(:disabled) {
    background: var(--gx-mcp-m-hair);
  }

  .tool-rules-empty {
    margin-top: 12px;
    border-radius: 12px;
    background: var(--gx-an-field-bg);
    box-shadow: inset 0 0 0 1px var(--gx-ring-soft);
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 24px 32px;
    align-items: center;
    text-align: center;
  }

  .tool-empty-icon {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    background: color-mix(in oklab, var(--gx-tx-accent) 12%, var(--gx-surface));
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--gx-tx-accent);
    font-weight: 700;
    font-size: 18px;
  }

  .rules-empty-title {
    font-family: var(--gx-font-display);
    font-weight: 600;
    font-size: 13px;
    line-height: 100%;
    color: var(--gx-org-ink);
  }

  .rules-empty-desc {
    font-weight: 400;
    font-size: 12px;
    line-height: 1.4;
    color: var(--gx-an-sub);
  }

  .tool-rules-list {
    margin-top: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* ---------------- footer actions ---------------- */
  .btn-cancel {
    height: 33px;
    border-radius: 8px;
    background: var(--gx-surface);
    box-shadow: inset 0 0 0 1px var(--gx-mcp-m-cancel-ring);
    padding: 8px 16px;
    font-weight: 600;
    font-size: 13px;
    line-height: 100%;
    color: var(--gx-mcp-m-cancel-fg);
    transition: background-color 120ms ease;
  }

  .btn-cancel:hover:not(:disabled) {
    background: var(--gx-mcp-m-hair);
  }

  .btn-primary {
    height: 33px;
    border-radius: 8px;
    background: var(--gx-vdt-cta);
    padding: 8px 16px;
    font-weight: 600;
    font-size: 13px;
    line-height: 100%;
    color: var(--gx-surface);
    transition: background-color 120ms ease;
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--gx-mcpd-cta-hover);
  }

  .btn-cancel:focus-visible,
  .btn-primary:focus-visible,
  .btn-secondary-sm:focus-visible {
    outline: 2px solid var(--gx-tx-accent);
    outline-offset: 2px;
  }
</style>
