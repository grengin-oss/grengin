<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { onMount } from 'svelte';
  import type {
    MCPServer,
    McpServerAccessResponse,
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

<!-- ".panel[data-panel=access]" — mcp-server-detail.html -->
<div class="panel">
  {#if isLoading}
    <LoadingSpinner text={$_('admin.mcpAccess.loading')} size="md" />
  {:else if accessData}
    <!-- ".default-access" -->
    <div class="default-access">
      <span class="section-label">{$_('admin.mcpAccess.defaultAccessTitle')}</span>
      <span class="section-desc">{$_('admin.mcpAccess.defaultAccessDesc')}</span>
      <div class="access-options">
        {#each defaultAccessOptions as option (option.value)}
          <label
            class="access-option"
            data-selected={defaultAccess === option.value}
            class:access-option--saving={savingDefault}
          >
            <input
              type="radio"
              name="default_access"
              value={option.value}
              checked={defaultAccess === option.value}
              onchange={() => handleDefaultAccessChange(option.value)}
              disabled={savingDefault}
            />
            <span class="access-option-head">
              <span class="access-option-title">{$_(option.labelKey)}</span>
              <span class="access-radio"></span>
            </span>
            <span class="access-option-desc">{$_(option.descKey)}</span>
          </label>
        {/each}
      </div>
    </div>

    <!-- ".rules-section" -->
    <div class="rules-section">
      <div class="rules-heading">
        <span class="section-label">{$_('admin.mcpAccess.accessRules')}</span>
        <button class="btn-add-rule" type="button" onclick={() => addRuleModalOpen = true}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M7 2v10M2 7h10" stroke="currentColor" stroke-width="1.6" />
          </svg>
          <span>{$_('admin.mcpAccess.addRules')}</span>
        </button>
      </div>

      {#if !accessData.rules || accessData.rules.length === 0}
        <div class="rules-empty">
          <span class="rules-empty-title">{$_('admin.mcpAccess.noRules')}</span>
          <span class="rules-empty-desc">{$_('admin.mcpAccess.noRulesHint')}</span>
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
  /* ===== mcp-server-detail.html, ".panel[data-panel=access]" transcribed.
     Design values that no --gx-* token already carried live in app.css as
     --gx-mcpd-*. ===== */

  /* app.css paints every bare <button>/<input> as a glass pill. Every control
     below is flat, so strip that once here. */
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

  .panel {
    border-radius: 18px;
    background: var(--gx-surface);
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 18px;
    align-self: stretch;
    font-family: var(--gx-font);
  }

  .section-label {
    font-family: var(--gx-font-display);
    font-weight: 700;
    font-size: 18px;
    line-height: 100%;
    color: var(--gx-org-ink);
  }

  .section-desc {
    font-weight: 400;
    font-size: 12px;
    line-height: 100%;
    color: var(--gx-an-sub);
  }

  /* ---------------- ".default-access" ---------------- */
  .default-access {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .access-options {
    display: flex;
    gap: 10px;
    align-self: stretch;
  }

  .access-option {
    flex: 1 1 0;
    min-width: 0;
    border-radius: 12px;
    background: var(--gx-surface);
    box-shadow: inset 0 0 0 1px var(--gx-ring-soft);
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 16px;
    cursor: pointer;
    transition:
      box-shadow 120ms ease,
      background-color 120ms ease;
  }

  .access-option input[type="radio"] {
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

  .access-option[data-selected="true"] {
    box-shadow: inset 0 0 0 1.5px var(--gx-tx-accent);
    background: color-mix(in oklab, var(--gx-tx-accent) 6%, var(--gx-surface));
  }

  .access-option:hover:not(.access-option--saving) {
    box-shadow: inset 0 0 0 1.5px var(--gx-tx-accent);
  }

  .access-option:focus-within {
    outline: 2px solid var(--gx-tx-accent);
    outline-offset: 2px;
  }

  .access-option--saving {
    opacity: 0.6;
    cursor: wait;
  }

  .access-option-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }

  .access-option-title {
    font-family: var(--gx-font-display);
    font-weight: 600;
    font-size: 14px;
    line-height: 100%;
    color: var(--gx-org-ink);
  }

  .access-radio {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    box-shadow: inset 0 0 0 2px var(--gx-ring-soft);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .access-option[data-selected="true"] .access-radio {
    box-shadow: none;
    background: var(--gx-tx-accent);
  }

  .access-option[data-selected="true"] .access-radio::after {
    content: "";
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--gx-surface);
  }

  .access-option-desc {
    font-weight: 400;
    font-size: 12px;
    line-height: 1.45;
    color: var(--gx-an-sub);
  }

  /* ---------------- ".rules-section" ---------------- */
  .rules-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
    align-self: stretch;
  }

  .rules-heading {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }

  .btn-add-rule {
    height: 33px;
    border-radius: 8px;
    background: var(--gx-tx-accent);
    display: flex;
    gap: 6px;
    padding: 8px 14px;
    align-items: center;
    flex-shrink: 0;
    font-weight: 600;
    font-size: 13px;
    line-height: 100%;
    color: var(--gx-surface);
    transition: background-color 120ms ease;
  }

  .btn-add-rule:hover {
    background: var(--gx-ac-cta-hover);
  }

  .btn-add-rule:focus-visible {
    outline: 2px solid var(--gx-tx-accent);
    outline-offset: 2px;
  }

  .btn-add-rule svg {
    display: block;
    flex-shrink: 0;
  }

  .rules-empty {
    border-radius: 12px;
    background: var(--gx-an-field-bg);
    box-shadow: inset 0 0 0 1px var(--gx-ring-soft);
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 30px;
    align-items: center;
    justify-content: center;
    align-self: stretch;
    text-align: center;
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

  .rules-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-self: stretch;
  }

  /* The three default-access cards sit side by side on the design's 1000px
     canvas; below that there is no room for three 16px-padded columns. */
  @media (max-width: 860px) {
    .access-options {
      flex-direction: column;
    }
  }

  @media (max-width: 640px) {
    .panel {
      padding: 16px;
    }
  }
</style>
