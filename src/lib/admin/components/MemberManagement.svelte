<script lang="ts">
  import type { Department } from "../types.js";
  import { onMount, untrack } from "svelte";
  import * as departmentsApi from "../../api/admin/departments.js";
  import { departmentsStore } from "../stores/index.js";
  import { toast } from "../../components/Toaster.svelte";
  import { ApiError } from "../../api/client.js";
  import { getLocalizedError } from "../../utils/errorLocalization.js";
  import { _ } from "svelte-i18n";
  import LoadingSpinner from "./LoadingSpinner.svelte";
  import AddMemberModal from "./AddMemberModal.svelte";
  import { formatDate } from "$lib/utils/format.js";
  
  interface Props {
    department: Department;
  }
  
  let { department }: Props = $props();
  
  let members = $state<any[]>([]);
  let loading = $state(false);
  let includeSubDepartments = $state(false);
  let showAddMember = $state(false);
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
  
  async function handleRemoveMembers() {
    if (selectedMembers.size === 0) return;
    
    const confirmed = confirm($_('admin.departments.selectMembers'));
    if (!confirmed) return;
    
    loading = true;
    try {
      await departmentsApi.removeDepartmentMembers(department.id, Array.from(selectedMembers));
      const count = selectedMembers.size;
      toast.success($_('admin.departments.membersRemoved', { values: { count } }));
      selectedMembers = new Set(); // Create new Set to trigger reactivity
      await loadMembers();
      // Refresh departments to update member counts
      await departmentsStore.fetchDepartments();
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
    await departmentsStore.fetchDepartments();
  }
  
</script>

<div class="member-management">
  <div class="member-header">
    <div class="header-left">
      <h3>{$_('admin.departments.members')}</h3>
      <label class="checkbox-label">
        <input 
          type="checkbox" 
          bind:checked={includeSubDepartments}
          onchange={loadMembers}
        />
        <span>{$_('admin.departments.includeSubDepartments')}</span>
      </label>
    </div>
    
    <div class="header-actions">
      {#if selectedMembers.size > 0}
        <button class="btn-danger" onclick={handleRemoveMembers}>
          {$_('admin.departments.removeMembers')} ({selectedMembers.size})
        </button>
      {/if}
      <button class="btn-primary" onclick={() => {
        showAddMember = true;
      }}>
        {$_('admin.departments.addMembers')}
      </button>
    </div>
  </div>
  
  {#if loading}
    <div class="loading-state">
      <LoadingSpinner />
      <p>{$_('admin.departments.loadingMembers')}</p>
    </div>
  {:else if members.length === 0}
    <div class="empty-state">
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
        <circle cx="32" cy="24" r="8" stroke="#d1d5db" stroke-width="2"/>
        <path d="M16 48C16 39.1634 23.1634 32 32 32C40.8366 32 48 39.1634 48 48" stroke="#d1d5db" stroke-width="2" stroke-linecap="round"/>
      </svg>
      <h4>{$_('admin.departments.noMembers')}</h4>
      <p>{$_('admin.departments.noMembersDescription')}</p>
      <button class="btn-primary" onclick={() => showAddMember = true}>
        {$_('admin.departments.addMembers')}
      </button>
    </div>
  {:else}
    <div class="member-table">
      <table>
        <thead>
          <tr>
            <th class="checkbox-col">
              <input 
                type="checkbox" 
                checked={selectedMembers.size === members.length && members.length > 0}
                onchange={toggleSelectAll}
              />
            </th>
            <th>{$_('admin.common.name')}</th>
            <th>{$_('admin.common.email')}</th>
            <th>{$_('admin.common.role')}</th>
            <th>{$_('admin.departments.addedOn')}</th>
          </tr>
        </thead>
        <tbody>
          {#each members as member (member.id)}
            <tr>
              <td class="checkbox-col">
                <input 
                  type="checkbox" 
                  checked={selectedMembers.has(member.id)}
                  onchange={() => toggleMemberSelection(member.id)}
                />
              </td>
              <td class="name-col">{member.name || 'N/A'}</td>
              <td class="email-col">{member.email}</td>
              <td class="role-col">
                <span class="role-badge">{member.role || 'user'}</span>
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
</div>

<style>
  .member-management {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  
  .member-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
  }
  
  .header-left {
    display: flex;
    align-items: center;
    gap: 20px;
  }
  
  .member-header h3 {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
  }
  
  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
    color: var(--text-primary);
    cursor: pointer;
  }
  
  .checkbox-label input[type="checkbox"] {
    cursor: pointer;
  }

  .checkbox-label input[type="checkbox"] {
    width: auto !important;
  }
  
  .header-actions {
    display: flex;
    gap: 8px;
  }
  
  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 20px;
    gap: 16px;
  }
  
  .loading-state p {
    color: var(--text-secondary);
    font-size: 14px;
  }
  
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 20px;
    text-align: center;
    background: var(--btn-secondary);
    border-radius: var(--radius-md);
  }
  
  .empty-state svg {
    margin-bottom: 20px;
  }
  
  .empty-state h4 {
    font-size: 18px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 8px 0;
  }
  
  .empty-state p {
    color: var(--text-secondary);
    font-size: 14px;
    margin: 0 0 24px 0;
  }
  
  .member-table {
    background: var(--glass-bg-dark);
    border: 1px solid var(--glass-stroke-dark);
    border-radius: var(--radius-md);
    overflow: hidden;
  }
  
  table {
    width: 100%;
    border-collapse: collapse;
  }
  
  thead {
    background: var(--btn-secondary);
    border-bottom: 1px solid var(--glass-stroke-dark);
  }
  
  th {
    padding: 12px 16px;
    text-align: left;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  
  td {
    padding: 12px 16px;
    font-size: 14px;
    color: var(--text-primary);
    border-bottom: 1px solid var(--glass-stroke-dark);
  }
  
  tbody tr:last-child td {
    border-bottom: none;
  }
  
  tbody tr:hover {
    background: var(--btn-tertiary);
  }
  
  .checkbox-col {
    width: 40px;
    text-align: center;
  }
  
  .checkbox-col input[type="checkbox"] {
    cursor: pointer;
  }
  
  .name-col {
    font-weight: 500;
  }
  
  .email-col {
    color: var(--text-secondary);
  }
  
  .role-badge {
    display: inline-block;
    padding: 4px 8px;
    background: color-mix(in oklab, var(--brand) 20%, transparent);
    color: var(--brand);
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
  }
  
  .date-col {
    color: var(--text-secondary);
    font-size: 13px;
  }
  
  .btn-primary {
    padding: 8px 16px;
    background: var(--brand);
    border: none;
    border-radius: var(--radius-sm);
    font-size: 14px;
    font-weight: 500;
    color: white;
    cursor: pointer;
    transition: background 0.2s;
  }
  
  .btn-primary:hover {
    background: var(--brand-hover);
  }
  
  .btn-danger {
    padding: 8px 16px;
    background: var(--brand-red);
    border: none;
    border-radius: var(--radius-sm);
    font-size: 14px;
    font-weight: 500;
    color: white;
    cursor: pointer;
    transition: background 0.2s;
  }
  
  .btn-danger:hover {
    background: color-mix(in oklab, var(--brand-red) 90%, black);
  }
</style>
