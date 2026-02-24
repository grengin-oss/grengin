<script lang="ts">
  import { onMount } from "svelte";
  import { departmentsStore } from "../stores/index.js";
  import type { Department } from "../types.js";
  import LoadingSpinner from "../components/LoadingSpinner.svelte";
  import DepartmentTreeNode from "../components/DepartmentTreeNode.svelte";
  import DepartmentDetailsPanel from "../components/DepartmentDetailsPanel.svelte";
  import DepartmentFormModal from "../components/DepartmentFormModal.svelte";
  import { toast } from "../../components/Toaster.svelte";
  import { ApiError } from "../../api/client.js";
  import { getLocalizedError } from "../../utils/errorLocalization.js";
  import { _ } from "svelte-i18n";
  
  let store = $state($departmentsStore);
  let selectedDepartment = $state<Department | null>(null);
  let showCreateModal = $state(false);
  let showEditModal = $state(false);
  let editingDepartment = $state<Department | null>(null);
  
  $effect(() => {
    store = $departmentsStore;
  });
  
  function filterDepartmentTree(departments: Department[], permittedIds: Set<string>): Department[] {
    if(!departments || departments.length === 0) return []; 

    const newTree = [];
    for (const dept of departments) {
      if (permittedIds.has(dept.id)) {
        newTree.push(dept);
      }else if(dept.children && dept.children.length > 0){
        newTree.push(...filterDepartmentTree(dept.children, permittedIds));
      }
    }

    return newTree;
  }
  
  const filteredDepartmentsTree = $derived(
    filterDepartmentTree(store.departmentsTree, new Set(store.administeredDepartmentIds))
  );
  
  onMount(() => {
    departmentsStore.fetchDepartmentsTree();
    departmentsStore.fetchAdministeredDepartments();
    departmentsStore.fetchDepartments();
  });
  
  $effect(() => {
    if (store.error) {
      const errorMessage = store.error instanceof ApiError 
        ? getLocalizedError(store.error, 'description', $_) 
        : store.error.message;
      toast.error(errorMessage || $_('admin.departments.failedToFetch'));
      departmentsStore.clearError();
    }
  });
  
  
  $effect(() => {
    if (!selectedDepartment && filteredDepartmentsTree.length > 0 && !store.loading) {
      selectedDepartment = filteredDepartmentsTree[0];
    }
  });

  // Keep selectedDepartment in sync with store updates
  $effect(() => {
    const current = selectedDepartment;
    if (current) {
      const updated = store.departments.find(d => d.id === current.id);
      if (updated && updated !== current) {
        selectedDepartment = updated;
      }
    }
  });
  
  function handleSelectDepartment(dept: Department) {
    selectedDepartment = dept;
  }
  
  function handleCloseDetails() {
    selectedDepartment = null;
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
      selectedDepartment = null;
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

<div class="departments-page">
  <div class="page-content">
    <div class="departments-layout">
      <div class="tree-section">
        <div class="tree-header">
          <h2>{$_('admin.departments.organization')}</h2>
          <button class="btn-primary" onclick={openCreateModal}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 3V13M3 8H13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
            {$_('admin.departments.createDepartment')}
          </button>
        </div>
        
        <div class="tree-container">
          {#if store.loading && filteredDepartmentsTree.length === 0}
            <div class="loading-state">
              <LoadingSpinner />
              <p>{$_('admin.departments.loading')}</p>
            </div>
          {:else if filteredDepartmentsTree.length === 0}
            <div class="empty-state">
              <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                <path d="M32 8L8 20V36C8 47.0457 17.9543 56 32 56C46.0457 56 56 47.0457 56 36V20L32 8Z" stroke="#d1d5db" stroke-width="2"/>
                <circle cx="32" cy="28" r="6" stroke="#d1d5db" stroke-width="2"/>
                <path d="M22 44C22 39.5817 26.4772 36 32 36C37.5228 36 42 39.5817 42 44" stroke="#d1d5db" stroke-width="2" stroke-linecap="round"/>
              </svg>
              <h3>{$_('admin.departments.noDepartments')}</h3>
              <p>{$_('admin.departments.noDepartmentsDescription')}</p>
              <button class="btn-primary" onclick={openCreateModal}>
                {$_('admin.departments.createDepartment')}
              </button>
            </div>
          {:else}
            <div class="tree-list">
              {#each filteredDepartmentsTree as dept (dept.id)}
                <DepartmentTreeNode 
                  department={dept}
                  allDepartments={store.departments}
                  onSelect={handleSelectDepartment}
                  selectedId={selectedDepartment?.id}
                  onMove={handleMoveDepartment}
                />
              {/each}
            </div>
          {/if}
        </div>
      </div>
      
      {#if selectedDepartment}
        <div class="details-section">
          <DepartmentDetailsPanel 
            department={selectedDepartment}
            allDepartments={store.departments}
            onClose={handleCloseDetails}
            onEdit={openEditModal}
            onDelete={handleDeleteDepartment}
          />
        </div>
      {:else}
        <div class="details-section placeholder">
          <div class="placeholder-content">
            <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
              <path d="M40 10L10 25V45C10 58.8071 22.5736 70 40 70C57.4264 70 70 58.8071 70 45V25L40 10Z" stroke="#e5e7eb" stroke-width="2"/>
              <circle cx="40" cy="35" r="8" stroke="#e5e7eb" stroke-width="2"/>
              <path d="M27.5 55C27.5 49.4772 33.0964 45 40 45C46.9036 45 52.5 49.4772 52.5 55" stroke="#e5e7eb" stroke-width="2" stroke-linecap="round"/>
            </svg>
            <h3>{$_('admin.departments.selectDepartment')}</h3>
            <p>{$_('admin.departments.selectDepartmentDescription')}</p>
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>

{#if showCreateModal}
  <DepartmentFormModal 
    isOpen={showCreateModal}
    onClose={() => showCreateModal = false}
    onSubmit={handleCreateDepartment}
    allDepartments={store.departments}
    mode="create"
  />
{/if}

{#if showEditModal && editingDepartment}
  <DepartmentFormModal 
    isOpen={showEditModal}
    onClose={() => { showEditModal = false; editingDepartment = null; }}
    onSubmit={handleUpdateDepartment}
    department={editingDepartment}
    allDepartments={store.departments}
    mode="edit"
  />
{/if}

<style>
  .departments-page {
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
  
  .departments-layout {
    display: grid;
    grid-template-columns: 400px 1fr;
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
  }
  
  .empty-state svg {
    margin-bottom: 20px;
  }
  
  .empty-state h3 {
    font-size: 18px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 8px 0;
  }
  
  .empty-state p {
    color: var(--text-secondary);
    font-size: 14px;
    margin: 0 0 24px 0;
    max-width: 300px;
  }
  
  .details-section {
    background: var(--glass-bg-dark);
    backdrop-filter: blur(var(--glass-blur));
    border-radius: var(--radius-lg);
    box-shadow: var(--glass-shadow-dark);
    border: 1px solid var(--glass-stroke-dark);
    overflow: hidden;
  }
  
  .details-section.placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
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
    .departments-layout {
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
