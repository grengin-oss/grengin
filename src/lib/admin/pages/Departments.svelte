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
  import { permissionsStore } from "$lib/features/auth/index.js";
  
  const SELECTED_DEPARTMENT_QUERY_KEY = "departmentId";
  const store = $derived($departmentsStore);
  /** Selection is id-only; full row comes from store via $derived (no sync effect). */
  let selectedDepartmentId = $state<string | null>(null);
  let requestedDepartmentId = $state<string | null>(null);
  let initialExpandedDepartmentIds = $state<Set<string>>(new Set());
  let hasAppliedInitialExpansion = $state(false);
  let hasResolvedInitialSelection = $state(false);

  const selectedDepartment = $derived.by((): Department | null => {
    const id = selectedDepartmentId;
    if (!id) return null;
    const fromAdmin = store.administeredDepartments.find((d) => d.id === id);
    if (fromAdmin) return fromAdmin;
    return findDepartmentInTree(store.departmentsTree, id);
  });
  let showCreateModal = $state(false);
  let showEditModal = $state(false);
  let editingDepartment = $state<Department | null>(null);
  /** Narrow layout only: collapsible org tree (CSS gates visibility of toggle + collapsed body). */
  let mobileTreeExpanded = $state(true);
  const canManageDepartments = $derived(permissionsStore.canManageDepartments());

  function findDepartmentInTree(
    departments: Department[],
    departmentId: string
  ): Department | null {
    for (const department of departments) {
      if (department.id === departmentId) {
        return department;
      }
      if (department.children?.length) {
        const nestedMatch = findDepartmentInTree(department.children, departmentId);
        if (nestedMatch) {
          return nestedMatch;
        }
      }
    }
    return null;
  }

  function syncSelectedDepartmentToUrl(departmentId: string | null) {
    const url = new URL(window.location.href);
    const current = url.searchParams.get(SELECTED_DEPARTMENT_QUERY_KEY);
    if (departmentId) {
      if (current !== departmentId) {
        url.searchParams.set(SELECTED_DEPARTMENT_QUERY_KEY, departmentId);
        window.history.replaceState(window.history.state, "", url.toString());
      }
    } else if (current != null) {
      url.searchParams.delete(SELECTED_DEPARTMENT_QUERY_KEY);
      window.history.replaceState(window.history.state, "", url.toString());
    }
  }

  function getExpandedPathIds(
    department: Department | null,
    allDepartments: Department[]
  ): Set<string> {
    const expandedIds = new Set<string>();
    if (!department) return expandedIds;

    const byId = new Map(allDepartments.map((d) => [d.id, d]));
    let current: Department | undefined = department;

    while (current && current.parent_id) {
      expandedIds.add(current.parent_id);
      current = current.parent_id ? byId.get(current.parent_id) : undefined;
    }

    return expandedIds;
  }
  
  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    requestedDepartmentId = params.get(SELECTED_DEPARTMENT_QUERY_KEY);
    departmentsStore.fetchDepartmentsTree();
    departmentsStore.fetchAdministeredDepartments();
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
  
  // Initial selection + one-shot URL expansion path
  $effect(() => {
    if (!hasResolvedInitialSelection && store.departmentsTree.length > 0 && !store.loading) {
      let picked: Department | null = null;
      if (requestedDepartmentId) {
        picked = findDepartmentInTree(store.departmentsTree, requestedDepartmentId);
      }
      if (!picked) {
        picked = store.departmentsTree[0];
      }
      selectedDepartmentId = picked.id;
      hasResolvedInitialSelection = true;
      syncSelectedDepartmentToUrl(selectedDepartmentId);
    }

    if (
      !hasAppliedInitialExpansion &&
      requestedDepartmentId &&
      selectedDepartmentId === requestedDepartmentId &&
      store.administeredDepartments.length > 0
    ) {
      const dept =
        store.administeredDepartments.find((d) => d.id === selectedDepartmentId) ??
        findDepartmentInTree(store.departmentsTree, selectedDepartmentId);
      if (dept) {
        initialExpandedDepartmentIds = getExpandedPathIds(dept, store.administeredDepartments);
        hasAppliedInitialExpansion = true;
      }
    }
  });
  
  function handleSelectDepartment(dept: Department) {
    selectedDepartmentId = dept.id;
    syncSelectedDepartmentToUrl(dept.id);
  }
  
  function handleCloseDetails() {
    selectedDepartmentId = null;
    syncSelectedDepartmentToUrl(null);
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
    admin_ids: string[] 
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
    admin_ids: string[] 
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
      selectedDepartmentId = null;
      syncSelectedDepartmentToUrl(null);
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
  <div
    class="page-content"
    aria-labelledby="departments-organization-heading"
  >
    <div class="departments-layout">
      <section class="tree-section" class:mobile-tree-collapsed={!mobileTreeExpanded}>
        <div class="tree-header">
          <button
            type="button"
            class="tree-mobile-toggle"
            onclick={() => (mobileTreeExpanded = !mobileTreeExpanded)}
            aria-expanded={mobileTreeExpanded}
            aria-controls="departments-tree-panel"
            aria-label={mobileTreeExpanded
              ? $_("admin.departments.collapseOrganizationTree")
              : $_("admin.departments.expandOrganizationTree")}
          >
            <svg
              class="tree-mobile-toggle-chevron"
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M6 8L10 12L14 8"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
          <h2 id="departments-organization-heading">{$_('admin.departments.organization')}</h2>
          {#if canManageDepartments}
            <button type="button" class="btn-primary" onclick={openCreateModal}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 3V13M3 8H13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
              {$_('admin.departments.createDepartment')}
            </button>
          {/if}
        </div>
        
        <div class="tree-container" id="departments-tree-panel">
          {#if store.loading && store.departmentsTree.length === 0}
            <div class="loading-state">
              <LoadingSpinner />
              <p>{$_('admin.departments.loading')}</p>
            </div>
          {:else if store.departmentsTree.length === 0}
            <div class="empty-state">
              <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                <path d="M32 8L8 20V36C8 47.0457 17.9543 56 32 56C46.0457 56 56 47.0457 56 36V20L32 8Z" stroke="#d1d5db" stroke-width="2"/>
                <circle cx="32" cy="28" r="6" stroke="#d1d5db" stroke-width="2"/>
                <path d="M22 44C22 39.5817 26.4772 36 32 36C37.5228 36 42 39.5817 42 44" stroke="#d1d5db" stroke-width="2" stroke-linecap="round"/>
              </svg>
              <h3>{$_('admin.departments.noDepartments')}</h3>
              <p>{$_('admin.departments.noDepartmentsDescription')}</p>
              {#if canManageDepartments}
                <button type="button" class="btn-primary" onclick={openCreateModal}>
                  {$_('admin.departments.createDepartment')}
                </button>
              {/if}
            </div>
          {:else}
            <div
              class="tree-list"
              role="tree"
              aria-label={$_('admin.departments.organizationStructure')}
            >
              {#each store.departmentsTree as dept (dept.id)}
                <DepartmentTreeNode 
                  department={dept}
                  allDepartments={store.administeredDepartments}
                  onSelect={handleSelectDepartment}
                  selectedId={selectedDepartment?.id}
                  shouldExpandOnInitialRender={initialExpandedDepartmentIds.has(dept.id)}
                  {initialExpandedDepartmentIds}
                  onMove={handleMoveDepartment}
                />
              {/each}
            </div>
          {/if}
        </div>
      </section>
      
      {#if selectedDepartment}
        <section
          class="details-section"
          aria-live="polite"
          aria-label={$_('admin.departments.details')}
        >
          <DepartmentDetailsPanel 
            department={selectedDepartment}
            allDepartments={store.administeredDepartments}
            onClose={handleCloseDetails}
            onEdit={openEditModal}
            onDelete={handleDeleteDepartment}
          />
        </section>
      {:else}
        <section
          class="details-section placeholder"
          aria-live="polite"
          aria-label={$_('admin.departments.selectDepartment')}
        >
          <div class="placeholder-content">
            <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
              <path d="M40 10L10 25V45C10 58.8071 22.5736 70 40 70C57.4264 70 70 58.8071 70 45V25L40 10Z" stroke="#e5e7eb" stroke-width="2"/>
              <circle cx="40" cy="35" r="8" stroke="#e5e7eb" stroke-width="2"/>
              <path d="M27.5 55C27.5 49.4772 33.0964 45 40 45C46.9036 45 52.5 49.4772 52.5 55" stroke="#e5e7eb" stroke-width="2" stroke-linecap="round"/>
            </svg>
            <h3>{$_('admin.departments.selectDepartment')}</h3>
            <p>{$_('admin.departments.selectDepartmentDescription')}</p>
          </div>
        </section>
      {/if}
    </div>
  </div>
</div>

{#if showCreateModal}
  <DepartmentFormModal 
    isOpen={showCreateModal}
    onClose={() => showCreateModal = false}
    onSubmit={handleCreateDepartment}
    allDepartments={store.administeredDepartments}
    mode="create"
  />
{/if}

{#if showEditModal && editingDepartment}
  <DepartmentFormModal 
    isOpen={showEditModal}
    onClose={() => { showEditModal = false; editingDepartment = null; }}
    onSubmit={handleUpdateDepartment}
    department={editingDepartment}
    allDepartments={store.administeredDepartments}
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
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    padding: 24px;
  }
  
  .departments-layout {
    display: grid;
    grid-template-columns: minmax(260px, 400px) minmax(0, 1fr);
    gap: 24px;
    align-items: start;
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
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    padding: 20px;
    border-bottom: 1px solid var(--glass-stroke-dark);
  }

  .tree-mobile-toggle {
    display: none;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    margin: -8px 0 -8px -8px;
    padding: 0;
    border: none;
    border-radius: var(--radius-md);
    background: var(--btn-tertiary);
    color: var(--text-primary);
    cursor: pointer;
    transition: background 0.2s;
  }

  .tree-mobile-toggle:hover {
    background: var(--button-bg);
  }

  .tree-mobile-toggle:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }

  .tree-mobile-toggle-chevron {
    transition: transform 0.2s ease;
  }

  .tree-section.mobile-tree-collapsed .tree-mobile-toggle-chevron {
    transform: rotate(-90deg);
  }
  
  .tree-header h2 {
    flex: 1;
    font-size: 18px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
  }

  .tree-header .btn-primary {
    align-self: flex-end;
  }
  
  .tree-container {
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
    min-width: 0;
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
    .page-content {
      padding: 16px;
    }

    .departments-layout {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .tree-section, .details-section {
      width: 100%;
    }

    .tree-mobile-toggle {
      display: flex;
    }

    .tree-section.mobile-tree-collapsed .tree-container {
      display: none;
    }

    .tree-section.mobile-tree-collapsed .tree-header {
      border-bottom: none;
    }

    .tree-header {
      flex-wrap: wrap;
    }
  }
</style>
