<script lang="ts">
  import { onMount } from "svelte";
  import { departmentsStore, usersStore } from "../stores/index.js";
  import type { Department } from "../types.js";
  import LoadingSpinner from "../components/LoadingSpinner.svelte";
  import DepartmentTreeNode from "../components/DepartmentTreeNode.svelte";
  import DepartmentDetailsPanel from "../components/DepartmentDetailsPanel.svelte";
  import DepartmentFormModal from "../components/DepartmentFormModal.svelte";
  import UsersPanel from "../components/organization/UsersPanel.svelte";
  import { toast } from "../../components/Toaster.svelte";
  import { ApiError } from "../../api/client.js";
  import { getLocalizedError } from "../../utils/errorLocalization.js";
  import { _ } from "svelte-i18n";

  // Selection types: 'all-users', 'unassigned', or department ID
  type SelectionType = 'all-users' | 'unassigned' | string;

  let selectedItem = $state<SelectionType>('all-users');
  let showCreateModal = $state(false);
  let showEditModal = $state(false);
  let editingDepartment = $state<Department | null>(null);

  // Use derived to reactively read store values
  const deptStore = $derived($departmentsStore);

  onMount(() => {
    departmentsStore.fetchDepartments();
    usersStore.fetchUsers();
  });

  // Handle errors - track previous error to avoid infinite loop
  let lastErrorId = $state<string | null>(null);
  $effect(() => {
    const error = deptStore.error;
    if (error) {
      const errorId = error.message || 'unknown';
      if (errorId !== lastErrorId) {
        lastErrorId = errorId;
        const errorMessage = error instanceof ApiError
          ? getLocalizedError(error, 'description', $_)
          : error.message;
        toast.error(errorMessage || $_('admin.departments.failedToFetch'));
        departmentsStore.clearError();
      }
    }
  });

  const rootDepartments = $derived(
    deptStore.departments
      .filter(d => d.parent_id === null)
      .sort((a, b) => a.name.localeCompare(b.name))
  );

  // Compute counts for virtual nodes
  const totalUserCount = $derived(usersStore.total);
  const unassignedUserCount = $derived(
    usersStore.users.filter(u => !u.department || u.department === '').length
  );

  // Determine if selection is a department
  const selectedDepartment = $derived(
    selectedItem !== 'all-users' && selectedItem !== 'unassigned'
      ? deptStore.departments.find(d => d.id === selectedItem) || null
      : null
  );

  function handleSelectDepartment(dept: Department) {
    selectedItem = dept.id;
  }

  function handleSelectVirtualNode(type: 'all-users' | 'unassigned') {
    selectedItem = type;
  }

  function handleCloseDetails() {
    selectedItem = 'all-users';
  }

  function openCreateModal() {
    showCreateModal = true;
  }

  function openEditModal(dept: Department) {
    editingDepartment = dept;
    showEditModal = true;
  }

  async function handleCreateDepartment(data: {
    name: string;
    description: string;
    parent_id: string | null;
    leader_ids: string[]
  }) {
    try {
      await departmentsStore.createDepartment(data);
      toast.success($_('admin.departments.departmentCreated'));
      showCreateModal = false;
    } catch (error) {
      const errorMessage = error instanceof ApiError
        ? getLocalizedError(error, 'description', $_)
        : 'Failed to create department';
      toast.error(errorMessage);
      throw error;
    }
  }

  async function handleUpdateDepartment(data: {
    name: string;
    description: string;
    parent_id: string | null;
    leader_ids: string[]
  }) {
    if (!editingDepartment) return;

    try {
      await departmentsStore.updateDepartment(editingDepartment.id, data);
      toast.success($_('admin.departments.departmentUpdated'));
      showEditModal = false;
      editingDepartment = null;
    } catch (error) {
      const errorMessage = error instanceof ApiError
        ? getLocalizedError(error, 'description', $_)
        : 'Failed to update department';
      toast.error(errorMessage);
      throw error;
    }
  }

  async function handleDeleteDepartment(dept: Department) {
    try {
      await departmentsStore.deleteDepartment(dept.id);
      toast.success($_('admin.departments.departmentDeleted'));
      selectedItem = 'all-users';
    } catch (error) {
      const errorMessage = error instanceof ApiError
        ? getLocalizedError(error, 'description', $_)
        : 'Failed to delete department';
      toast.error(errorMessage);
    }
  }

  async function handleMoveDepartment(deptId: string, newParentId: string | null) {
    try {
      await departmentsStore.moveDepartment(deptId, newParentId);
      toast.success($_('admin.departments.departmentMoved'));
    } catch (error) {
      const errorMessage = error instanceof ApiError
        ? getLocalizedError(error, 'description', $_)
        : 'Failed to move department';
      toast.error(errorMessage);
    }
  }
</script>

<div class="organization-page">
  <div class="page-content">
    <div class="organization-layout">
      <div class="tree-section">
        <div class="tree-header">
          <h2>{$_('admin.organization.title')}</h2>
          <button class="btn-primary" onclick={openCreateModal}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 3V13M3 8H13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
            {$_('admin.departments.createDepartment')}
          </button>
        </div>

        <div class="tree-container">
          {#if deptStore.loading && deptStore.departments.length === 0}
            <div class="loading-state">
              <LoadingSpinner />
              <p>{$_('admin.departments.loading')}</p>
            </div>
          {:else}
            <div class="tree-list">
              <!-- All Users virtual node -->
              <div
                class="virtual-node"
                class:selected={selectedItem === 'all-users'}
                role="button"
                tabindex="0"
                onclick={() => handleSelectVirtualNode('all-users')}
                onkeydown={(e) => e.key === 'Enter' && handleSelectVirtualNode('all-users')}
              >
                <div class="virtual-node-content">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                    <circle cx="9" cy="7" r="4"></circle>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                  </svg>
                  <span class="node-name">{$_('admin.organization.allUsers')}</span>
                  <span class="node-count">{totalUserCount}</span>
                </div>
              </div>

              <!-- Unassigned virtual node -->
              <div
                class="virtual-node"
                class:selected={selectedItem === 'unassigned'}
                role="button"
                tabindex="0"
                onclick={() => handleSelectVirtualNode('unassigned')}
                onkeydown={(e) => e.key === 'Enter' && handleSelectVirtualNode('unassigned')}
              >
                <div class="virtual-node-content">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                    <circle cx="8.5" cy="7" r="4"></circle>
                    <line x1="18" y1="8" x2="23" y2="8"></line>
                  </svg>
                  <span class="node-name">{$_('admin.organization.unassigned')}</span>
                  <span class="node-count">{unassignedUserCount}</span>
                </div>
              </div>

              <!-- Departments divider -->
              {#if deptStore.departments.length > 0}
                <div class="tree-divider">
                  <span>{$_('admin.organization.departments')}</span>
                </div>
              {/if}

              <!-- Department tree -->
              {#each rootDepartments as dept (dept.id)}
                <DepartmentTreeNode
                  department={dept}
                  allDepartments={deptStore.departments}
                  onSelect={handleSelectDepartment}
                  selectedId={selectedDepartment?.id}
                  onMove={handleMoveDepartment}
                />
              {/each}

              {#if deptStore.departments.length === 0 && !deptStore.loading}
                <div class="no-departments">
                  <p>{$_('admin.organization.noDepartments')}</p>
                </div>
              {/if}
            </div>
          {/if}
        </div>
      </div>

      <!-- Context Panel -->
      <div class="details-section">
        {#if selectedItem === 'all-users'}
          <UsersPanel departmentFilter={undefined} />
        {:else if selectedItem === 'unassigned'}
          <UsersPanel departmentFilter={null} />
        {:else if selectedDepartment}
          <DepartmentDetailsPanel
            department={selectedDepartment}
            allDepartments={deptStore.departments}
            onClose={handleCloseDetails}
            onEdit={openEditModal}
            onDelete={handleDeleteDepartment}
          />
        {:else}
          <div class="placeholder">
            <div class="placeholder-content">
              <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
                <path d="M40 10L10 25V45C10 58.8071 22.5736 70 40 70C57.4264 70 70 58.8071 70 45V25L40 10Z" stroke="#e5e7eb" stroke-width="2"/>
                <circle cx="40" cy="35" r="8" stroke="#e5e7eb" stroke-width="2"/>
                <path d="M27.5 55C27.5 49.4772 33.0964 45 40 45C46.9036 45 52.5 49.4772 52.5 55" stroke="#e5e7eb" stroke-width="2" stroke-linecap="round"/>
              </svg>
              <h3>{$_('admin.organization.selectItem')}</h3>
              <p>{$_('admin.organization.selectItemDescription')}</p>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>

{#if showCreateModal}
  <DepartmentFormModal
    isOpen={showCreateModal}
    onClose={() => showCreateModal = false}
    onSubmit={handleCreateDepartment}
    allDepartments={deptStore.departments}
    mode="create"
  />
{/if}

{#if showEditModal && editingDepartment}
  <DepartmentFormModal
    isOpen={showEditModal}
    onClose={() => { showEditModal = false; editingDepartment = null; }}
    onSubmit={handleUpdateDepartment}
    department={editingDepartment}
    allDepartments={deptStore.departments}
    mode="edit"
  />
{/if}

<style>
  .organization-page {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--bg-primary);
  }

  .page-content {
    flex: 1;
    overflow: hidden;
    padding: 24px;
  }

  .organization-layout {
    display: grid;
    grid-template-columns: 360px 1fr;
    gap: 24px;
    height: 100%;
  }

  .tree-section {
    display: flex;
    flex-direction: column;
    background: var(--glass-bg-dark);
    backdrop-filter: blur(var(--glass-blur));
    border-radius: var(--radius-lg);
    box-shadow: var(--glass-shadow-dark);
    border: 1px solid var(--glass-stroke-dark);
    overflow: hidden;
  }

  .tree-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px;
    border-bottom: 1px solid var(--glass-stroke-dark);
  }

  .tree-header h2 {
    font-size: 18px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
  }

  .tree-container {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
  }

  .tree-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .virtual-node {
    padding: 10px 12px;
    margin: 2px 0;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
    border: 1px solid transparent;
  }

  .virtual-node:hover {
    background-color: var(--btn-tertiary);
  }

  .virtual-node.selected {
    background-color: color-mix(in oklab, var(--brand) 20%, transparent);
    border-color: color-mix(in oklab, var(--brand) 30%, transparent);
  }

  .virtual-node-content {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .virtual-node-content svg {
    color: var(--text-secondary);
    flex-shrink: 0;
  }

  .virtual-node.selected .virtual-node-content svg {
    color: var(--brand);
  }

  .node-name {
    font-weight: 500;
    color: var(--text-primary);
    font-size: 14px;
    flex: 1;
  }

  .node-count {
    font-size: 12px;
    color: var(--text-secondary);
    background: var(--btn-secondary);
    padding: 2px 8px;
    border-radius: var(--radius-full);
  }

  .tree-divider {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 16px 0 8px 0;
    padding: 0 4px;
  }

  .tree-divider span {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    white-space: nowrap;
  }

  .tree-divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--glass-stroke-dark);
  }

  .no-departments {
    padding: 20px;
    text-align: center;
  }

  .no-departments p {
    color: var(--text-secondary);
    font-size: 14px;
    margin: 0;
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

  .details-section {
    background: var(--glass-bg-dark);
    backdrop-filter: blur(var(--glass-blur));
    border-radius: var(--radius-lg);
    box-shadow: var(--glass-shadow-dark);
    border: 1px solid var(--glass-stroke-dark);
    overflow: hidden;
  }

  .placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
  }

  .placeholder-content {
    text-align: center;
    padding: 40px;
  }

  .placeholder-content svg {
    margin-bottom: 24px;
  }

  .placeholder-content h3 {
    font-size: 18px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 8px 0;
  }

  .placeholder-content p {
    color: var(--text-secondary);
    font-size: 14px;
    margin: 0;
  }

  @media (max-width: 1024px) {
    .organization-layout {
      grid-template-columns: 1fr;
    }

    .details-section {
      display: none;
    }

    .details-section:not(.placeholder) {
      display: block;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 50;
      border-radius: 0;
    }
  }
</style>
