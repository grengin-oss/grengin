<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import type { Department, User } from "../types.js";
  import { onMount } from "svelte";
  import * as departmentsApi from "../../api/admin/departments.js";
  import { departmentsStore } from "../stores/index.js";
  import { toast } from "../../components/Toaster.svelte";
  import { ApiError } from "../../api/client.js";
  import { getLocalizedError } from "../../utils/errorLocalization.js";
  import { _ } from "svelte-i18n";
  import LoadingSpinner from "./LoadingSpinner.svelte";
  import AddMemberModal from "./AddMemberModal.svelte";
  import Modal from "./Modal.svelte";
  import RolesBadgeList from "./RolesBadgeList.svelte";
  import { formatDate } from "$lib/utils/format.js";
  
  interface Props {
    department: Department;
    canManage?: boolean;
  }
  
  let { department, canManage = true }: Props = $props();
  
  let members = $state<User[]>([]);
  let loading = $state(false);
  let includeSubDepartments = $state(false);
  let showAddMember = $state(false);
  let showRemoveConfirm = $state(false);
  let selectedMembers = $state<Set<string>>(new Set());
  
  onMount(() => {
    loadMembers();
  });
  
  $effect(() => {
    department.id;
    includeSubDepartments;
    loadMembers();
  });
  
  async function loadMembers() {
    loading = true;
    try {
      const response = await departmentsApi.getDepartmentMembers(
        department.id, 
        includeSubDepartments
      );
      members = response.members;
    } catch (error) {
      const errorMessage = error instanceof ApiError 
        ? getLocalizedError(error, 'description', $_) 
        : $_('admin.departments.failedToFetchMembers');
      toast.error(errorMessage);
    } finally {
      loading = false;
    }
  }
  
  function toggleMemberSelection(userId: string) {
    const newSet = new Set(selectedMembers);
    if (newSet.has(userId)) {
      newSet.delete(userId);
    } else {
      newSet.add(userId);
    }
    selectedMembers = newSet;
  }
  
  function toggleSelectAll() {
    if (selectedMembers.size === members.length && members.length > 0) {
      selectedMembers = new Set();
    } else {
      selectedMembers = new Set(members.map(m => m.id));
    }
  }
  
  function confirmRemoveMembers() {
    if (selectedMembers.size === 0) return;
    showRemoveConfirm = true;
  }
  
  async function handleRemoveMembers() {
    showRemoveConfirm = false;
    loading = true;
    try {
      await departmentsApi.removeDepartmentMembers(department.id, Array.from(selectedMembers));
      const count = selectedMembers.size;
      toast.success($_('admin.departments.membersRemoved', { values: { count } }));
      selectedMembers = new Set(); // Create new Set to trigger reactivity
      await loadMembers();
      // Refresh departments to update member counts
      await departmentsStore.fetchAdministeredDepartments();
    } catch (error) {
      const errorMessage = error instanceof ApiError 
        ? getLocalizedError(error, 'description', $_) 
        : $_('admin.departments.failedToRemoveMember');
      toast.error(errorMessage);
    } finally {
      loading = false;
    }
  }
  
  async function handleMemberAdded() {
    await loadMembers();
    // Refresh departments to update member counts
    await departmentsStore.fetchAdministeredDepartments();
  }
  
</script>

<div class="member-management">
  <div class="panel-header">
    <label class="checkbox-row">
      <input
        type="checkbox"
        bind:checked={includeSubDepartments}
        onchange={loadMembers}
      />
      <span class="checkbox-box" aria-hidden="true">
        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
          <path d="M1 4L3.5 6.5L9 1" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </span>
      <span class="checkbox-label">{$_('admin.departments.includeSubDepartments')}</span>
    </label>

    <div class="header-actions">
      {#if canManage}
        {#if selectedMembers.size > 0}
          <button type="button" class="btn-destructive" onclick={confirmRemoveMembers}>
            {$_('admin.departments.removeMembers')} ({selectedMembers.size})
          </button>
        {/if}
        <button type="button" class="btn-primary" onclick={() => (showAddMember = true)}>
          {$_('admin.departments.addMembers')}
        </button>
      {/if}
    </div>
  </div>
  
  {#if loading}
    <div class="loading-state">
      <LoadingSpinner />
      <p>{$_('admin.departments.loadingMembers')}</p>
    </div>
  {:else if members.length === 0}
    <div class="empty-state">
      <span class="empty-icon" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
          <circle cx="9.5" cy="7" r="4"/>
          <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
        </svg>
      </span>
      <div class="empty-text">
        <span class="empty-title">{$_('admin.departments.noMembers')}</span>
        <span class="empty-body">{$_('admin.departments.noMembersDescription')}</span>
      </div>
      {#if canManage}
        <button type="button" class="btn-primary" onclick={() => (showAddMember = true)}>
          {$_('admin.departments.addMembers')}
        </button>
      {/if}
    </div>
  {:else}
    <div class="member-table">
      <table>
        <thead>
          <tr>
            {#if canManage}
              <th class="checkbox-col">
                <input 
                  type="checkbox" 
                  checked={selectedMembers.size === members.length && members.length > 0}
                  onchange={toggleSelectAll}
                />
              </th>
            {/if}
            <th>{$_('admin.common.name')}</th>
            <th>{$_('admin.common.email')}</th>
            <th>{$_('admin.common.role')}</th>
            <th>{$_('admin.departments.addedOn')}</th>
          </tr>
        </thead>
        <tbody>
          {#each members as member (member.id)}
            <tr>
              {#if canManage}
                <td class="checkbox-col">
                  <input 
                    type="checkbox" 
                    checked={selectedMembers.has(member.id)}
                    onchange={() => toggleMemberSelection(member.id)}
                  />
                </td>
              {/if}
              <td class="name-col">{member.name || 'N/A'}</td>
              <td class="email-col">{member.email}</td>
              <td class="role-col">
                <RolesBadgeList roles={member.roles}/>
              </td>
              <td class="date-col">{formatDate(member.created_at)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
  
  {#if showAddMember}
    <AddMemberModal
      departmentId={department.id}
      onclose={() => showAddMember = false}
      onSuccess={handleMemberAdded}
    />
  {/if}
  
  {#if showRemoveConfirm}
    <Modal 
      isOpen={showRemoveConfirm}
      onclose={() => showRemoveConfirm = false}
      title={$_('admin.departments.removeMembersConfirmTitle')}
    >
      <div class="remove-confirm">
        <p>{$_('admin.departments.removeMembersConfirmMessage', { values: { count: selectedMembers.size } })}</p>
        <p class="warning">{$_('admin.departments.removeMembersConfirmWarning')}</p>
        
        <div class="modal-actions">
          <button class="btn-secondary" onclick={() => showRemoveConfirm = false}>
            {$_('common.cancel')}
          </button>
          <button type="button" class="btn-destructive" onclick={handleRemoveMembers}>
            {$_('admin.departments.removeMembers')}
          </button>
        </div>
      </div>
    </Modal>
  {/if}
</div>

<style>
  /* app.css gives every button backdrop-filter: blur(); on the flat
     Organization surfaces that repaints the 1px hairlines behind them
     (the tab-row ring, the tree's branch rails), so switch it off. */
  button {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .member-management {
    display: flex;
    flex-direction: column;
    gap: 20px;
    align-self: stretch;
    width: 100%;
    font-family: var(--gx-font);
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    align-self: stretch;
    flex-wrap: wrap;
    gap: 12px;
  }

  /* Custom checkbox: the native input stays for a11y, the box is the visual. */
  .checkbox-row {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-shrink: 0;
    cursor: pointer;
  }

  .checkbox-row input[type="checkbox"] {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    margin: 0;
  }

  .checkbox-box {
    width: 16px;
    height: 16px;
    border-radius: 4px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1.5px var(--gx-hair);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: transparent;
    transition:
      background-color 120ms ease,
      box-shadow 120ms ease;
  }

  .checkbox-row input:checked + .checkbox-box {
    background: var(--gx-org-brand);
    box-shadow: inset 0 0 0 1.5px var(--gx-org-brand);
    color: #fff;
  }

  .checkbox-row input:focus-visible + .checkbox-box {
    outline: 2px solid var(--gx-org-brand-alt);
    outline-offset: 2px;
  }

  .checkbox-label {
    font-weight: 400;
    font-size: 13px;
    line-height: 100%;
    color: var(--gx-slate-500);
    white-space: nowrap;
  }

  .header-actions {
    display: flex;
    gap: 8px;
    flex-shrink: 0;
  }

  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 48px 20px;
    gap: 16px;
  }

  .loading-state p {
    color: var(--gx-slate-500);
    font-size: 13px;
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

  /* Large member lists scroll inside the card instead of stretching the tab. */
  .member-table {
    align-self: stretch;
    border-radius: 12px;
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    max-height: 360px;
    overflow: auto;
  }

  .member-table thead th {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--gx-card);
  }

  table {
    width: 100%;
    min-width: 560px;
    border-collapse: collapse;
  }

  th {
    padding: 14px 16px;
    text-align: start;
    font-weight: 700;
    font-size: 11px;
    line-height: 100%;
    letter-spacing: 0.55px;
    text-transform: uppercase;
    color: var(--gx-slate-500);
    box-shadow: inset 0 -1px 0 0 var(--gx-hair);
  }

  td {
    padding: 14px 16px;
    font-size: 13px;
    color: var(--gx-org-slate-800);
    box-shadow: inset 0 -1px 0 0 var(--gx-hair);
  }

  tbody tr:last-child td {
    box-shadow: none;
  }

  tbody tr:hover td {
    background: var(--gx-org-table-row-hover);
  }

  .checkbox-col {
    width: 44px;
    text-align: center;
  }

  .checkbox-col input[type="checkbox"] {
    width: auto;
    cursor: pointer;
    accent-color: var(--gx-org-brand);
  }

  .name-col {
    font-weight: 600;
    color: var(--gx-slate-900);
  }

  .email-col {
    color: var(--gx-slate-500);
  }

  .date-col {
    color: var(--gx-slate-500);
    font-size: 12px;
  }

  .btn-primary {
    height: 33px;
    border: 0;
    border-radius: 8px;
    background: var(--gx-org-brand);
    padding: 0 14px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-family: inherit;
    font-weight: 600;
    font-size: 13px;
    color: #fff;
    white-space: nowrap;
    cursor: pointer;
    box-shadow: none;
    transition: background-color 120ms ease;
  }

  .btn-primary:hover {
    background: var(--gx-org-brand-hover);
    transform: none;
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

  .remove-confirm {
    padding: 20px;
    font-family: var(--gx-font);
  }

  .remove-confirm p {
    margin: 0 0 12px 0;
    color: var(--gx-slate-900);
    font-size: 14px;
  }

  .remove-confirm .warning {
    color: var(--gx-org-danger);
    font-size: 13px;
  }

  .modal-actions {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
    margin-top: 24px;
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
    cursor: pointer;
    transition: background-color 120ms ease;
  }

  .btn-secondary:hover {
    background: var(--gx-org-track);
    transform: none;
  }
</style>
