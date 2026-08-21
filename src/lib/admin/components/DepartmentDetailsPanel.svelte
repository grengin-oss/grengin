<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import type { Department } from "../types.js";
  import { _ } from "svelte-i18n";
  import Modal from "./Modal.svelte";
  import BudgetManagement from "./BudgetManagement.svelte";
  import MemberManagement from "./MemberManagement.svelte";
  import DepartmentAdminsSection from "./DepartmentAdminsSection.svelte";
  import DepartmentPromptsTab from "./DepartmentPromptsTab.svelte";
  import { formatCurrency } from "$lib/utils/format.js";
  import { permissionsStore } from "$lib/features/auth/index.js";
  import { tick } from "svelte";

  interface Props {
    department: Department | null;
    allDepartments: Department[];
    onClose: () => void;
    onEdit: (dept: Department) => void;
    onDelete: (dept: Department) => void;
  }

  let { department, allDepartments, onClose, onEdit, onDelete }: Props = $props();

  type TabId = 'overview' | 'members' | 'budget' | 'prompts';

  let activeTab = $state<TabId>('overview');
  let showDeleteConfirm = $state(false);

  const canViewBudget = $derived(
    department ? permissionsStore.canViewBudgetForDepartment(department.id) : false
  );

  const canEditBudget = $derived(
    department ? permissionsStore.canAllocateBudgetForDepartment(department.id) : false
  );

  const canManageDepartments = $derived(
    permissionsStore.canManageDepartments()
  );

  const initial = $derived((department?.name?.trim()?.[0] ?? "?").toUpperCase());

  const visibleTabs = $derived<TabId[]>(
    canViewBudget
      ? ['overview', 'members', 'budget', 'prompts']
      : ['overview', 'members', 'prompts']
  );

  $effect(() => {
    if (activeTab === 'budget' && !canViewBudget) {
      activeTab = 'overview';
    }
  });

  function tabLabel(tab: TabId): string {
    if (tab === 'members') {
      return `${$_('admin.departments.members')} (${department?.member_count ?? 0})`;
    }
    return $_(`admin.departments.${tab}`);
  }

  function handleEdit() {
    if (department) {
      onEdit(department);
    }
  }

  function confirmDelete() {
    showDeleteConfirm = true;
  }

  function handleDelete() {
    if (department) {
      showDeleteConfirm = false;
      onDelete(department);
    }
  }

  function getTabId(tab: string) {
    const prefix = department ? `department-${department.id}` : "department";
    return `${prefix}-${tab}`;
  }

  function getTabPanelId(tab: string) {
    return `${getTabId(tab)}-panel`;
  }

  function handleTabKeydown(event: KeyboardEvent, tab: TabId) {
    const tabs = visibleTabs;
    const currentIndex = tabs.indexOf(tab);
    let newTab: TabId | null = null;

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      newTab = tabs[(currentIndex + 1) % tabs.length];
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      newTab = tabs[(currentIndex - 1 + tabs.length) % tabs.length];
    } else if (event.key === 'Home') {
      event.preventDefault();
      newTab = tabs[0];
    } else if (event.key === 'End') {
      event.preventDefault();
      newTab = tabs[tabs.length - 1];
    }

    if (newTab && newTab !== activeTab) {
      activeTab = newTab;
      const target = newTab;
      tick().then(() => {
        document.getElementById(getTabId(target))?.focus();
      });
    }
  }
</script>

{#if department}
  <div class="details-panel">
    <div class="detail-header">
      <div class="detail-header__left">
        <span class="detail-avatar" aria-hidden="true">{initial}</span>
        <div class="detail-info">
          <div class="detail-name-row">
            <span class="detail-name" title={department.name}>{department.name}</span>
            <span class="detail-live" aria-hidden="true"></span>
          </div>
          <span class="detail-desc">
            {department.description || $_('admin.organization.noDescription')}
          </span>
          <div class="detail-facts">
            <span class="detail-fact">
              {$_('admin.departments.memberCount', { values: { count: department.member_count } })}
            </span>
            <span class="detail-fact">
              {formatCurrency(department.budget_used)} / {formatCurrency(department.budget_allocated)}
            </span>
            <span class="detail-fact">
              {$_('admin.organization.childDeptCount', { values: { count: department.child_count } })}
            </span>
          </div>
        </div>
      </div>
      <div class="detail-actions">
        {#if canManageDepartments}
          <button type="button" class="btn-secondary" onclick={handleEdit}>
            {$_('common.edit')}
          </button>
        {/if}
        <button
          type="button"
          class="detail-close"
          onclick={onClose}
          aria-label={$_('admin.common.closeModal')}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
    </div>

    <div class="inner-tabs" role="tablist" aria-label={$_('admin.departments.details')}>
      {#each visibleTabs as tab (tab)}
        <button
          type="button"
          class="inner-tab"
          role="tab"
          id={getTabId(tab)}
          aria-selected={activeTab === tab}
          aria-controls={getTabPanelId(tab)}
          tabindex={activeTab === tab ? 0 : -1}
          onclick={() => (activeTab = tab)}
          onkeydown={(e) => handleTabKeydown(e, tab)}
        >
          {tabLabel(tab)}
          <span class="inner-tab__rule" aria-hidden="true"></span>
        </button>
      {/each}
    </div>

    <div class="tab-content">
      {#if activeTab === 'overview'}
        <div
          class="tab-panel"
          role="tabpanel"
          id={getTabPanelId('overview')}
          aria-labelledby={getTabId('overview')}
          tabindex="0"
        >
          <DepartmentAdminsSection {department} canManage={canManageDepartments} />

          <div class="stats-row">
            <div class="stat">
              <span class="stat__value">{department.member_count}</span>
              <span class="stat__label">{$_('admin.departments.directMembers')}</span>
            </div>
            <div class="stat">
              <span class="stat__value">{department.total_member_count}</span>
              <span class="stat__label">{$_('admin.departments.totalMembers')}</span>
            </div>
            <div class="stat">
              <span class="stat__value">{department.child_count}</span>
              <span class="stat__label">{$_('admin.departments.childCount')}</span>
            </div>
          </div>

          {#if canManageDepartments}
            <div class="danger-zone">
              <div class="danger-text">
                <span class="danger-title">{$_('admin.departments.deleteDepartment')}</span>
                <span class="danger-body">{$_('admin.organization.deleteDepartmentCaption')}</span>
              </div>
              <button type="button" class="btn-destructive" onclick={confirmDelete}>
                {$_('admin.departments.deleteDepartment')}
              </button>
            </div>
          {/if}
        </div>
      {:else if activeTab === 'members'}
        <div
          class="tab-panel"
          role="tabpanel"
          id={getTabPanelId('members')}
          aria-labelledby={getTabId('members')}
          tabindex="0"
        >
          <MemberManagement {department} canManage={canManageDepartments} />
        </div>
      {:else if activeTab === 'budget' && canViewBudget}
        <div
          class="tab-panel"
          role="tabpanel"
          id={getTabPanelId('budget')}
          aria-labelledby={getTabId('budget')}
          tabindex="0"
        >
          <BudgetManagement {department} {canEditBudget} />
        </div>
      {:else if activeTab === 'prompts'}
        <div
          class="tab-panel"
          role="tabpanel"
          id={getTabPanelId('prompts')}
          aria-labelledby={getTabId('prompts')}
          tabindex="0"
        >
          <DepartmentPromptsTab {department} canManage={canManageDepartments} />
        </div>
      {/if}
    </div>
  </div>
{/if}

{#if showDeleteConfirm}
  <Modal
    isOpen={showDeleteConfirm}
    onclose={() => showDeleteConfirm = false}
    title={$_('admin.departments.deleteConfirmTitle')}
  >
    <div class="delete-confirm">
      <p>{$_('admin.departments.deleteConfirmMessage')}</p>
      <p class="warning">{$_('admin.departments.deleteConfirmWarning')}</p>

      <div class="modal-actions">
        <button type="button" class="btn-secondary" onclick={() => showDeleteConfirm = false}>
          {$_('common.cancel')}
        </button>
        <button type="button" class="btn-destructive" onclick={handleDelete}>
          {$_('common.delete')}
        </button>
      </div>
    </div>
  </Modal>
{/if}

<style>
  /* app.css gives every button backdrop-filter: blur(); on the flat
     Organization surfaces that repaints the 1px hairlines behind them
     (the tab-row ring, the tree's branch rails), so switch it off. */
  button {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .details-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    font-family: var(--gx-font);
  }

  /* ---------------- header ---------------- */
  .detail-header {
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    display: flex;
    padding: 20px;
    gap: 16px;
    justify-content: space-between;
    align-items: center;
    align-self: stretch;
    flex-shrink: 0;
  }

  .detail-header__left {
    display: flex;
    gap: 12px;
    align-items: center;
    min-width: 0;
  }

  .detail-avatar {
    width: 40px;
    height: 40px;
    border-radius: 8px;
    background: var(--gx-org-brand-tint);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    font-weight: 700;
    font-size: 16px;
    line-height: 100%;
    color: var(--gx-org-brand);
  }

  .detail-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .detail-name-row {
    display: flex;
    gap: 6px;
    align-items: center;
    min-width: 0;
  }

  .detail-name {
    font-weight: 700;
    font-size: 18px;
    line-height: 100%;
    color: var(--gx-slate-900);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .detail-live {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--gx-org-brand);
    flex-shrink: 0;
  }

  .detail-desc {
    font-weight: 400;
    font-size: 13px;
    line-height: 100%;
    color: var(--gx-slate-500);
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .detail-facts {
    display: flex;
    gap: 12px;
    align-items: center;
    flex-wrap: wrap;
  }

  .detail-fact {
    font-weight: 400;
    font-size: 12px;
    line-height: 100%;
    color: var(--gx-slate-500);
    white-space: nowrap;
  }

  .detail-actions {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-shrink: 0;
  }

  .btn-secondary {
    height: 33px;
    border: 0;
    border-radius: 8px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    padding: 0 14px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-family: inherit;
    font-weight: 600;
    font-size: 13px;
    color: var(--gx-slate-500);
    white-space: nowrap;
    cursor: pointer;
    transition: background-color 120ms ease;
  }

  .btn-secondary:hover {
    background: var(--gx-org-track);
    transform: none;
  }

  .detail-close {
    width: 30px;
    height: 30px;
    padding: 0;
    border: 0;
    border-radius: 8px;
    background: var(--gx-org-track);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--gx-slate-500);
    cursor: pointer;
    box-shadow: none;
    transition: background-color 120ms ease;
  }

  .detail-close:hover {
    background: var(--gx-org-track-hover);
    transform: none;
  }

  /* ---------------- inner tabs ---------------- */
  .inner-tabs {
    height: 50px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    display: flex;
    gap: 24px;
    padding: 0 20px;
    align-self: stretch;
    flex-shrink: 0;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .inner-tabs::-webkit-scrollbar {
    display: none;
  }

  .inner-tab {
    height: 50px;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 0 10px;
    align-items: center;
    justify-content: flex-start;
    flex-grow: 1;
    font-family: inherit;
    font-weight: 600;
    font-size: 13px;
    line-height: 100%;
    color: var(--gx-slate-500);
    white-space: nowrap;
    cursor: pointer;
    transition: color 120ms ease;
  }

  .inner-tab:hover {
    color: var(--gx-org-slate-800);
    background: transparent;
    transform: none;
  }

  .inner-tab__rule {
    height: 2px;
    border-radius: 1px;
    background: transparent;
    align-self: stretch;
    margin-top: auto;
  }

  .inner-tab[aria-selected="true"] {
    color: var(--gx-org-brand);
  }

  .inner-tab[aria-selected="true"] .inner-tab__rule {
    background: var(--gx-org-brand);
  }

  .inner-tab:focus-visible {
    outline: 2px solid var(--gx-org-brand-alt);
    outline-offset: -2px;
  }

  /* ---------------- panels ---------------- */
  .tab-content {
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 20px;
    align-items: flex-start;
    align-self: stretch;
    flex-grow: 1;
    min-height: 0;
    overflow-y: auto;
  }

  .tab-panel {
    display: flex;
    flex-direction: column;
    gap: 20px;
    align-items: flex-start;
    align-self: stretch;
  }

  .stats-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 16px;
    align-self: stretch;
    flex-shrink: 0;
  }

  .stat {
    border-radius: 12px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 16px;
    align-items: center;
  }

  .stat__value {
    font-weight: 700;
    font-size: 20px;
    line-height: 100%;
    color: var(--gx-slate-900);
  }

  .stat__label {
    font-weight: 400;
    font-size: 12px;
    line-height: 100%;
    color: var(--gx-slate-500);
    text-align: center;
  }

  .danger-zone {
    border-radius: 12px;
    background: var(--gx-org-danger-bg);
    box-shadow: inset 0 0 0 1px var(--gx-org-danger-line);
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 20px;
    align-items: flex-start;
    align-self: stretch;
    flex-shrink: 0;
  }

  .danger-text {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .danger-title {
    font-weight: 700;
    font-size: 14px;
    line-height: 100%;
    color: var(--gx-org-danger);
  }

  .danger-body {
    font-weight: 400;
    font-size: 13px;
    line-height: 100%;
    color: var(--gx-slate-500);
  }

  .btn-destructive {
    height: 33px;
    border: 0;
    border-radius: 8px;
    background: var(--gx-org-danger);
    padding: 0 14px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    font-family: inherit;
    font-weight: 600;
    font-size: 13px;
    color: #fff;
    white-space: nowrap;
    cursor: pointer;
    box-shadow: none;
    transition: background-color 120ms ease;
  }

  .btn-destructive:hover {
    background: var(--gx-org-danger-hover);
    transform: none;
  }

  .danger-zone .btn-destructive {
    width: 161px;
  }

  .delete-confirm {
    padding: 20px;
    font-family: var(--gx-font);
  }

  .delete-confirm p {
    margin: 0 0 12px 0;
    color: var(--gx-slate-900);
    font-size: 14px;
  }

  .delete-confirm .warning {
    color: var(--gx-org-danger);
    font-size: 13px;
  }

  .modal-actions {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
    margin-top: 24px;
  }

  @media (max-width: 1024px) {
    .detail-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .detail-actions {
      align-self: flex-end;
    }
  }
</style>
