<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { onMount } from "svelte";
  import { _ } from "svelte-i18n";
  import LoadingSpinner from "./LoadingSpinner.svelte";
  import Modal from "./Modal.svelte";
  import PromptPreviewModal from "./prompt-library/PromptPreviewModal.svelte";
  import { toast } from "../../components/Toaster.svelte";
  import { ApiError } from "../../api/client.js";
  import { getLocalizedError } from "../../utils/errorLocalization.js";
  import {
    getDepartmentPrompts,
    assignDepartmentPrompt,
    updateDepartmentPrompt,
    unassignDepartmentPrompt,
    type DepartmentPrompt,
  } from "../../api/admin/departmentPrompts.js";
  import { getRolePrompts, type RolePrompt } from "../../api/admin/rolePrompts.js";
  import type { Department } from "../types.js";

  interface Props {
    department: Department;
    canManage: boolean;
  }

  let { department, canManage }: Props = $props();

  // State
  let assignedPrompts = $state<DepartmentPrompt[]>([]);
  let allPrompts = $state<RolePrompt[]>([]);
  let loading = $state(true);
  let assignedLoading = $state(false);

  // Modal state
  let assignModalOpen = $state(false);
  let unassignConfirmOpen = $state(false);
  let promptToUnassign = $state<DepartmentPrompt | null>(null);
  let isUnassigning = $state(false);
  let previewOpen = $state(false);
  let previewPrompt = $state<RolePrompt | null>(null);

  // Drag state
  let dragIndex = $state<number | null>(null);
  let dragOverIndex = $state<number | null>(null);

  // Derived
  let promptMap = $derived(
    allPrompts.reduce(
      (m, p) => {
        m[p.id] = p;
        return m;
      },
      {} as Record<string, RolePrompt>,
    ),
  );

  let sortedAssigned = $derived(
    [...assignedPrompts].sort((a, b) => a.priority - b.priority),
  );

  let assignedPromptIds = $derived(
    new Set(assignedPrompts.map((ap) => ap.prompt_id)),
  );

  let availablePrompts = $derived(
    allPrompts.filter((p) => !assignedPromptIds.has(p.id)),
  );

  let hasPrompts = $derived(sortedAssigned.length > 0);

  $effect(() => {
    // Re-load whenever the department changes (not just on first mount)
    const _deptId = department.id;
    loadInitialData();
  });

  async function loadInitialData() {
    loading = true;
    try {
      const [assignedRes, promptsRes] = await Promise.all([
        getDepartmentPrompts(department.id),
        getRolePrompts(),
      ]);
      assignedPrompts = assignedRes;
      allPrompts = promptsRes;
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? getLocalizedError(err, "description", () => "")
          : (err as Error).message;
      toast.error(msg || $_('admin.departmentPrompts.toast.failedToLoad'));
    } finally {
      loading = false;
    }
  }

  async function handleAssignPrompt(promptId: string) {
    const maxPriority = assignedPrompts.length > 0
      ? Math.max(...assignedPrompts.map((p) => p.priority))
      : 0;
    try {
      await assignDepartmentPrompt({
        department_id: department.id,
        prompt_id: promptId,
        priority: maxPriority + 1000,
      });
      toast.success($_('admin.departmentPrompts.toast.assigned'));
      await loadInitialData();
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? getLocalizedError(err, "description", () => "")
          : (err as Error).message;
      toast.error(msg || $_('admin.departmentPrompts.toast.failedToAssign'));
    }
  }

  function confirmUnassign(dp: DepartmentPrompt) {
    promptToUnassign = dp;
    unassignConfirmOpen = true;
  }

  async function handleUnassign() {
    if (!promptToUnassign) return;
    isUnassigning = true;
    try {
      await unassignDepartmentPrompt(promptToUnassign.id);
      toast.success($_('admin.departmentPrompts.toast.unassigned'));
      unassignConfirmOpen = false;
      promptToUnassign = null;
      await loadInitialData();
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? getLocalizedError(err, "description", () => "")
          : (err as Error).message;
      toast.error(msg || $_('admin.departmentPrompts.toast.failedToUnassign'));
    } finally {
      isUnassigning = false;
    }
  }

  function openPreview(prompt: RolePrompt) {
    previewPrompt = prompt;
    previewOpen = true;
  }

  // Drag-and-drop reordering
  function handleDragStart(index: number) {
    dragIndex = index;
  }

  function handleDragOver(event: DragEvent, index: number) {
    event.preventDefault();
    dragOverIndex = index;
  }

  function handleDragLeave() {
    dragOverIndex = null;
  }

  async function handleDrop(event: DragEvent, targetIndex: number) {
    event.preventDefault();
    dragOverIndex = null;
    if (dragIndex === null || dragIndex === targetIndex) {
      dragIndex = null;
      return;
    }

    const items = [...sortedAssigned];
    const [moved] = items.splice(dragIndex, 1);
    items.splice(targetIndex, 0, moved);

    // Recalculate priorities with spacing
    const updates: Promise<DepartmentPrompt>[] = [];
    for (let i = 0; i < items.length; i++) {
      const newPriority = (i + 1) * 1000;
      if (items[i].priority !== newPriority) {
        updates.push(
          updateDepartmentPrompt(items[i].id, { priority: newPriority }),
        );
      }
    }

    dragIndex = null;

    if (updates.length > 0) {
      try {
        await Promise.all(updates);
        toast.success($_('admin.departmentPrompts.toast.reordered'));
        await loadInitialData();
      } catch (err) {
        const msg =
          err instanceof ApiError
            ? getLocalizedError(err, "description", () => "")
            : (err as Error).message;
        toast.error(msg || $_('admin.departmentPrompts.toast.failedToReorder'));
      }
    }
  }

  function handleDragEnd() {
    dragIndex = null;
    dragOverIndex = null;
  }

  function getPromptName(promptId: string): string {
    return promptMap[promptId]?.name ?? $_('admin.departmentPrompts.unknown');
  }

  function getPromptText(promptId: string): string {
    return promptMap[promptId]?.prompt_text ?? "";
  }

  function truncateText(text: string, max: number): string {
    if (text.length <= max) return text;
    return text.slice(0, max) + "...";
  }

  function formatDate(dateStr: string): string {
    try {
      return new Date(dateStr).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateStr;
    }
  }
</script>

<div class="prompts-tab">
  {#if loading}
    <LoadingSpinner text={$_('admin.departmentPrompts.loading')} />
  {:else if !hasPrompts}
    <!-- Design: flush header above a bordered empty-state card -->
    <div class="panel-header panel-header--flush">
      <h3>{$_('admin.departmentPrompts.assignedPrompts')}</h3>
      {#if canManage}
        <button class="btn-primary-sm" onclick={() => assignModalOpen = true}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {$_('admin.departmentPrompts.assignPrompt')}
        </button>
      {/if}
    </div>

    {#if assignedLoading}
      <LoadingSpinner text={$_('admin.departmentPrompts.loadingAssigned')} />
    {:else}
      <div class="empty-state">
        <span class="empty-icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
        </span>
        <div class="empty-text">
          <span class="empty-title">{$_('admin.departmentPrompts.noAssignedTitle')}</span>
          <span class="empty-body">{$_('admin.departmentPrompts.noAssignedMessage')}</span>
        </div>
      </div>
    {/if}
  {:else}
    <!-- Single column layout when prompts exist -->
    <div class="panel assigned-panel">
      <div class="panel-header">
        <h3>{$_('admin.departmentPrompts.assignedPrompts')}</h3>
        {#if canManage}
          <button class="btn-primary-sm" onclick={() => assignModalOpen = true}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            {$_('admin.departmentPrompts.assignPrompt')}
          </button>
        {/if}
      </div>

      {#if assignedLoading}
        <LoadingSpinner text={$_('admin.departmentPrompts.loadingAssigned')} />
      {:else}
        <div class="drag-hint">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="5 9 2 12 5 15" />
            <polyline points="9 5 12 2 15 5" />
            <polyline points="15 19 12 22 9 19" />
            <polyline points="19 9 22 12 19 15" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <line x1="12" y1="2" x2="12" y2="22" />
          </svg>
          {$_('admin.departmentPrompts.dragHint')}
        </div>
        <div class="assigned-list" role="list">
          {#each sortedAssigned as dp, index (dp.id)}
            <div
              class="assigned-item"
              class:dragging={dragIndex === index}
              class:drag-over={dragOverIndex === index}
              draggable={canManage}
              ondragstart={() => handleDragStart(index)}
              ondragover={(e) => handleDragOver(e, index)}
              ondragleave={handleDragLeave}
              ondrop={(e) => handleDrop(e, index)}
              ondragend={handleDragEnd}
              role="listitem"
            >
              <div class="drag-handle" aria-label={$_('admin.departmentPrompts.dragToReorder')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="8" y1="6" x2="8" y2="6" />
                  <line x1="16" y1="6" x2="16" y2="6" />
                  <line x1="8" y1="12" x2="8" y2="12" />
                  <line x1="16" y1="12" x2="16" y2="12" />
                  <line x1="8" y1="18" x2="8" y2="18" />
                  <line x1="16" y1="18" x2="16" y2="18" />
                </svg>
              </div>
              <div class="priority-badge">#{index + 1}</div>
              <div class="assigned-item-info">
                <span class="assigned-item-name">{getPromptName(dp.prompt_id)}</span>
                <span class="assigned-item-preview">{truncateText(getPromptText(dp.prompt_id), 80)}</span>
              </div>
              <div class="assigned-item-meta">
                <span class="date-text">{formatDate(dp.created_at)}</span>
              </div>
              <div class="assigned-item-actions">
                <button
                  class="action-btn preview"
                  onclick={() => {
                    const rp = promptMap[dp.prompt_id];
                    if (rp) openPreview(rp);
                  }}
                  title={$_('admin.departmentPrompts.previewPrompt')}
                  aria-label={$_('admin.departmentPrompts.previewPrompt')}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </button>
                {#if canManage}
                  <button
                    class="action-btn delete"
                    onclick={() => confirmUnassign(dp)}
                    title={$_('admin.departmentPrompts.unassignPrompt')}
                    aria-label={$_('admin.departmentPrompts.unassignPrompt')}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                {/if}
              </div>
            </div>
          {/each}
        </div>

        <div class="table-footer">
          <span class="result-count">
            {sortedAssigned.length} {sortedAssigned.length !== 1 ? $_('admin.departmentPrompts.prompts') : $_('admin.departmentPrompts.prompt')}
          </span>
        </div>
      {/if}
    </div>
  {/if}
</div>

<!-- Assign Prompt Modal -->
<Modal
  isOpen={assignModalOpen}
  onclose={() => { assignModalOpen = false; }}
  title={$_('admin.departmentPrompts.assignPrompt')}
>
  <div class="assign-modal-body">
    {#if availablePrompts.length === 0}
      <p class="no-available">{$_('admin.departmentPrompts.noAvailablePrompts')}</p>
    {:else}
      <p class="assign-hint">{$_('admin.departmentPrompts.assignHint')}</p>
      <div class="available-list">
        {#each availablePrompts as prompt (prompt.id)}
          <div class="available-item">
            <div class="available-item-info">
              <span class="available-item-name">{prompt.name}</span>
              <span class="available-item-text">{truncateText(prompt.prompt_text, 60)}</span>
            </div>
            <div class="available-item-actions">
              <button
                class="action-btn preview"
                onclick={() => openPreview(prompt)}
                title={$_('admin.departmentPrompts.previewPrompt')}
                aria-label={$_('admin.departmentPrompts.previewPrompt')}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
              <button
                class="btn-assign"
                onclick={() => { handleAssignPrompt(prompt.id); assignModalOpen = false; }}
              >
                {$_('admin.departmentPrompts.assign')}
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</Modal>

<!-- Preview Modal (reuse PromptPreviewModal) -->
<PromptPreviewModal
  bind:isOpen={previewOpen}
  onClose={() => { previewOpen = false; previewPrompt = null; }}
  prompt={previewPrompt}
/>

<!-- Unassign Confirmation Modal -->
<Modal
  isOpen={unassignConfirmOpen}
  onclose={() => { unassignConfirmOpen = false; promptToUnassign = null; }}
  title={$_('admin.departmentPrompts.unassignPrompt')}
>
  <div class="delete-confirm">
    <p>
      {$_('admin.departmentPrompts.unassignConfirmMessage')}
      <strong>{promptToUnassign ? getPromptName(promptToUnassign.prompt_id) : ''}</strong>?
    </p>
    <p class="delete-warning">{$_('admin.departmentPrompts.unassignWarning')}</p>
    <div class="delete-actions">
      <button
        class="btn-secondary"
        onclick={() => { unassignConfirmOpen = false; promptToUnassign = null; }}
        disabled={isUnassigning}
      >
        {$_('common.cancel')}
      </button>
      <button
        class="btn-danger"
        onclick={handleUnassign}
        disabled={isUnassigning}
      >
        {isUnassigning ? $_('admin.departmentPrompts.unassigning') : $_('admin.departmentPrompts.unassign')}
      </button>
    </div>
  </div>
</Modal>

<style>
  /* app.css gives every button backdrop-filter: blur(); on the flat
     Organization surfaces that repaints the 1px hairlines behind them
     (the tab-row ring, the tree's branch rails), so switch it off. */
  button {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .prompts-tab {
    display: flex;
    flex-direction: column;
    gap: 20px;
    align-self: stretch;
    width: 100%;
    font-family: var(--gx-font);
  }

  /* Panels */
  .panel {
    background: transparent;
    border: 0;
    border-radius: 12px;
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .panel-header--flush {
    padding: 0;
    align-self: stretch;
  }

  .empty-state {
    border-radius: 12px;
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 48px 24px;
    justify-content: center;
    align-items: center;
    align-self: stretch;
  }

  .empty-icon {
    width: 48px;
    height: 48px;
    border-radius: 999px;
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--gx-slate-500);
  }

  .empty-text {
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: center;
    text-align: center;
  }

  .empty-title {
    font-weight: 700;
    font-size: 15px;
    line-height: 100%;
    color: var(--gx-slate-900);
  }

  .empty-body {
    font-weight: 400;
    font-size: 13px;
    line-height: 100%;
    color: var(--gx-slate-500);
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 20px;
  }

  .panel-header h3 {
    font-weight: 700;
    font-size: 14px;
    line-height: 100%;
    color: var(--gx-slate-900);
    margin: 0;
  }

  /* Drag hint */
  .drag-hint {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: var(--space-sm) var(--space-lg);
    font-size: 12px;
    color: var(--text-secondary);
    background: rgba(var(--glass-tint), 0.03);
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }

  /* Assigned List */
  .assigned-list {
    flex: 1;
    max-height: 420px;
    overflow-y: auto;
    padding: var(--space-sm);
  }

  .assigned-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    margin-bottom: 4px;
    border-radius: var(--radius-md);
    border: 1px solid transparent;
    background: var(--bg-primary);
    transition: all 0.15s;
    cursor: grab;
  }

  .assigned-item:hover {
    border-color: rgba(255, 255, 255, 0.1);
    background: rgba(var(--glass-tint), 0.05);
  }

  .assigned-item.dragging {
    opacity: 0.5;
    border-color: var(--brand);
  }

  .assigned-item.drag-over {
    border-color: var(--brand);
    background: color-mix(in oklab, var(--brand) 8%, var(--bg-primary));
  }

  .drag-handle {
    display: flex;
    align-items: center;
    color: var(--text-secondary);
    cursor: grab;
    flex-shrink: 0;
  }

  .drag-handle:active {
    cursor: grabbing;
  }

  .priority-badge {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: var(--radius-full);
    background: color-mix(in oklab, var(--brand) 15%, var(--button-bg));
    color: var(--brand);
    font-size: 12px;
    font-weight: 700;
    flex-shrink: 0;
  }

  .assigned-item-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .assigned-item-name {
    font-weight: 600;
    font-size: 14px;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .assigned-item-preview {
    font-size: 12px;
    color: var(--text-secondary);
    line-height: 1.4;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .assigned-item-meta {
    flex-shrink: 0;
  }

  .date-text {
    font-size: 12px;
    color: var(--text-secondary);
  }

  .assigned-item-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.15s;
  }

  .action-btn.preview:hover {
    background: color-mix(in oklab, var(--brand) 12%, var(--button-bg));
    color: var(--brand);
  }

  .action-btn.delete:hover {
    background: color-mix(in oklab, var(--brand-red) 12%, var(--button-bg));
    color: var(--brand-red);
  }

  .table-footer {
    display: flex;
    justify-content: flex-end;
    padding: var(--space-sm) var(--space-lg);
    border-top: 1px solid rgba(255, 255, 255, 0.05);
  }

  .result-count {
    font-size: 13px;
    color: var(--text-secondary);
  }

  
  /* Assign Modal */
  .assign-modal-body {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .no-available {
    font-size: 14px;
    color: var(--text-secondary);
    text-align: center;
    padding: var(--space-xl);
  }

  .assign-hint {
    font-size: 13px;
    color: var(--text-secondary);
    margin: 0;
  }

  .available-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 400px;
    overflow-y: auto;
  }

  .available-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    border: 1px solid var(--surface-border);
    border-radius: var(--radius-md);
    background: var(--bg-primary);
    transition: border-color 0.15s;
  }

  .available-item:hover {
    border-color: var(--brand);
  }

  .available-item-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .available-item-name {
    font-weight: 600;
    font-size: 14px;
    color: var(--text-primary);
  }

  .available-item-text {
    font-size: 12px;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .available-item-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .btn-assign {
    padding: 6px 14px;
    background: var(--brand);
    border: none;
    border-radius: var(--radius-sm);
    font-size: 13px;
    font-weight: 600;
    color: white;
    cursor: pointer;
    transition: background 0.2s;
  }

  .btn-assign:hover {
    background: var(--brand-hover);
  }

  .btn-primary-sm {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 33px;
    padding: 0 14px;
    background: var(--gx-org-brand);
    border: 0;
    border-radius: 8px;
    box-shadow: none;
    font-family: inherit;
    font-size: 13px;
    font-weight: 600;
    color: #fff;
    white-space: nowrap;
    cursor: pointer;
    flex-shrink: 0;
    transition: background-color 120ms ease;
  }

  .btn-primary-sm:hover {
    background: var(--gx-org-brand-hover);
    transform: none;
  }

  .btn-primary-sm svg {
    flex-shrink: 0;
  }

  /* Delete/Unassign confirmation */
  .delete-confirm {
    padding: 4px;
  }

  .delete-confirm p {
    font-size: 14px;
    color: var(--text-primary);
    margin: 0 0 8px 0;
    line-height: 1.6;
  }

  .delete-warning {
    font-size: 13px !important;
    color: var(--brand-red) !important;
  }

  .delete-actions {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
    margin-top: 24px;
    padding-top: 20px;
    border-top: 1px solid var(--glass-stroke-dark);
  }

  .btn-secondary {
    padding: 10px 20px;
    background: var(--button-bg);
    border: 1px solid var(--button-border);
    border-radius: var(--radius-sm);
    font-size: 14px;
    font-weight: 500;
    color: var(--text-primary);
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--btn-secondary);
    border-color: var(--glass-stroke-light);
    transform: none;
    box-shadow: none;
  }

  .btn-secondary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-danger {
    padding: 10px 20px;
    background: var(--brand-red);
    border: none;
    border-radius: var(--radius-sm);
    font-size: 14px;
    font-weight: 500;
    color: white;
    cursor: pointer;
    transition: background 0.2s;
  }

  .btn-danger:hover:not(:disabled) {
    background: color-mix(in oklab, var(--brand-red) 85%, black);
    transform: none;
    box-shadow: none;
  }

  .btn-danger:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  </style>

