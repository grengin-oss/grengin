<script lang="ts">
  import Modal from "./Modal.svelte";
  import { _ } from "svelte-i18n";
  import { onMount } from "svelte";
  import * as usersApi from "../../api/admin/users.js";
  import * as departmentsApi from "../../api/admin/departments.js";
  import { toast } from "../../components/Toaster.svelte";
  import { ApiError } from "../../api/client.js";
  import { getLocalizedError } from "../../utils/errorLocalization.js";
  import LoadingSpinner from "./LoadingSpinner.svelte";
  import type { User } from "../types.js";

  interface Props {
    departmentId: string;
    onclose: () => void;
    onSuccess: () => void;
  }

  let { departmentId, onclose, onSuccess }: Props = $props();

  let users = $state<User[]>([]);
  let selectedUsers = $state<Set<string>>(new Set());
  let loading = $state(false);
  let saving = $state(false);
  let searchQuery = $state("");
  let currentPage = $state(1);
  let totalPages = $state(1);
  let totalCount = $state(0);

  const pageSize = 10;

  let searchTimeout: ReturnType<typeof setTimeout> | undefined;
  let isInitialLoad = true;

  onMount(() => {
    loadUsers();
  });

  // Debounced search effect (skip initial load)
  $effect(() => {
    searchQuery;
    
    // Skip the effect on initial load since onMount handles it
    if (isInitialLoad) {
      isInitialLoad = false;
      return;
    }
    
    currentPage = 1;
    
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
    
    searchTimeout = setTimeout(() => {
      loadUsers();
    }, 500);

    return () => {
      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }
    };
  });

  async function loadUsers() {
    loading = true;
    try {
      const offset = (currentPage - 1) * pageSize;
      const response = await usersApi.getUsers({
        limit: pageSize,
        offset: offset,
        search: searchQuery || undefined,
      });
      users = response.users;
      totalCount = response.total;
      totalPages = Math.ceil(response.total / pageSize);
    } catch (error) {
      const errorMessage = error instanceof ApiError
        ? getLocalizedError(error, 'description', $_)
        : $_('admin.users.failedToFetchUsers');
      toast.error(errorMessage);
    } finally {
      loading = false;
    }
  }

  function toggleUserSelection(userId: string) {
    const newSet = new Set(selectedUsers);
    if (newSet.has(userId)) {
      newSet.delete(userId);
    } else {
      newSet.add(userId);
    }
    selectedUsers = newSet;
  }

  function handlePreviousPage() {
    if (currentPage > 1) {
      currentPage--;
      loadUsers();
    }
  }

  function handleNextPage() {
    if (currentPage < totalPages) {
      currentPage++;
      loadUsers();
    }
  }

  async function handleAddMembers() {
    if (selectedUsers.size === 0) {
      toast.error($_('admin.departments.selectMembers'));
      return;
    }

    saving = true;
    try {
      await departmentsApi.addDepartmentMembers(departmentId, Array.from(selectedUsers));
      const count = selectedUsers.size;
      toast.success($_('admin.departments.memberAdded'));
      onSuccess();
      onclose();
    } catch (error) {
      const errorMessage = error instanceof ApiError
        ? getLocalizedError(error, 'description', $_)
        : $_('admin.departments.failedToAddMember');
      toast.error(errorMessage);
    } finally {
      saving = false;
    }
  }
</script>

<Modal isOpen={true} {onclose} title={$_('admin.departments.addMembers')}>
  <div class="add-member-modal">
    <div class="search-section">
      <div class="search-box">
        <input
          type="text"
          bind:value={searchQuery}
          placeholder={$_('admin.users.searchByNameOrEmail')}
        />
      </div>
      {#if selectedUsers.size > 0}
        <div class="selection-info">
          {$_('admin.departments.memberCount', { values: { count: selectedUsers.size } })}
        </div>
      {/if}
    </div>

    {#if loading}
      <div class="loading-state">
        <LoadingSpinner />
        <p>{$_('admin.users.loadingUsers')}</p>
      </div>
    {:else if users.length === 0}
      <div class="empty-state">
        <p>{$_('admin.users.noUsersFound')}</p>
      </div>
    {:else}
      <div class="users-list">
        <table>
          <thead>
            <tr>
              <th class="checkbox-col"></th>
              <th>{$_('admin.common.name')}</th>
              <th>{$_('admin.common.email')}</th>
              <th>{$_('admin.common.role')}</th>
            </tr>
          </thead>
          <tbody>
            {#each users as user (user.id)}
              <tr>
                <td class="checkbox-col">
                  <input
                    type="checkbox"
                    checked={selectedUsers.has(user.id)}
                    onchange={() => toggleUserSelection(user.id)}
                  />
                </td>
                <td class="name-col">{user.name || 'N/A'}</td>
                <td class="email-col">{user.email}</td>
                <td class="role-col">
                  <span class="role-badge">{user.role}</span>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <div class="pagination">
        <button
          class="btn-secondary"
          onclick={handlePreviousPage}
          disabled={currentPage === 1}
        >
          {$_('admin.common.previous')}
        </button>
        <span class="page-info">
          {$_('admin.common.pageInfo', { 
            values: { current: currentPage, total: totalPages, count: totalCount } 
          })}
        </span>
        <button
          class="btn-secondary"
          onclick={handleNextPage}
          disabled={currentPage === totalPages}
        >
          {$_('admin.common.next')}
        </button>
      </div>
    {/if}

    <div class="modal-actions">
      <button class="btn-secondary" onclick={onclose} disabled={saving}>
        {$_('common.cancel')}
      </button>
      <button
        class="btn-primary"
        onclick={handleAddMembers}
        disabled={saving || selectedUsers.size === 0}
      >
        {#if saving}
          {$_('admin.common.adding')}
        {:else}
          {$_('admin.departments.addMembers')} ({selectedUsers.size})
        {/if}
      </button>
    </div>
  </div>
</Modal>

<style>
  .add-member-modal {
    display: flex;
    flex-direction: column;
    gap: 20px;
    min-height: 400px;
  }

  .search-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .search-box {
    display: flex;
  }

  .search-box input {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--glass-stroke-dark);
    border-radius: var(--radius-md);
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 14px;
  }

  .search-box input:focus {
    outline: none;
    border-color: var(--primary);
  }

  .selection-info {
    padding: 8px 12px;
    background: var(--glass-bg-dark);
    border: 1px solid var(--glass-stroke-dark);
    border-radius: var(--radius-md);
    font-size: 14px;
    color: var(--text-primary);
    text-align: center;
  }

  .loading-state,
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px;
    gap: 12px;
    flex: 1;
    min-height: 200px;
  }

  .loading-state p,
  .empty-state p {
    color: var(--text-secondary);
    font-size: 14px;
    margin: 0;
  }

  .users-list {
    flex: 1;
    overflow-y: auto;
    border: 1px solid var(--glass-stroke-dark);
    border-radius: var(--radius-md);
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  thead {
    position: sticky;
    top: 0;
    background: var(--bg-primary);
    z-index: 1;
  }

  th {
    padding: 12px;
    text-align: left;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    border-bottom: 1px solid var(--glass-stroke-dark);
  }

  td {
    padding: 12px;
    font-size: 14px;
    color: var(--text-primary);
    border-bottom: 1px solid var(--glass-stroke-dark);
  }

  tbody tr {
    cursor: pointer;
    transition: background-color 0.2s;
  }

  tbody tr:hover {
    background: var(--glass-bg-dark);
  }

  .checkbox-col {
    width: 40px;
    text-align: center;
  }

  .checkbox-col input[type="checkbox"] {
    cursor: pointer;
    width: 16px;
    height: 16px;
  }

  .role-badge {
    display: inline-block;
    padding: 4px 8px;
    background: var(--glass-bg-dark);
    border: 1px solid var(--glass-stroke-dark);
    border-radius: var(--radius-sm);
    font-size: 12px;
    font-weight: 500;
    color: var(--text-primary);
    text-transform: capitalize;
  }

  .pagination {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px;
    background: var(--glass-bg-dark);
    border: 1px solid var(--glass-stroke-dark);
    border-radius: var(--radius-md);
  }

  .page-info {
    font-size: 14px;
    color: var(--text-secondary);
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding-top: 12px;
    border-top: 1px solid var(--glass-stroke-dark);
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
