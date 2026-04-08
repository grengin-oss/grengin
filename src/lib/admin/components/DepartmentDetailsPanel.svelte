<script lang="ts">
  import type { Department } from "../types.js";
  import { _ } from "svelte-i18n";
  import Modal from "./Modal.svelte";
  import BudgetManagement from "./BudgetManagement.svelte";
  import MemberManagement from "./MemberManagement.svelte";
  import DepartmentAdminsSection from "./DepartmentAdminsSection.svelte";
  import { formatDate } from "$lib/utils/format.js";
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
  
  let activeTab = $state<'overview' | 'members' | 'budget'>('overview');
  let showDeleteConfirm = $state(false);
  
  const parentDepartment = $derived(
    department?.parent_id 
      ? allDepartments.find(d => d.id === department.parent_id)
      : null
  );
  
  const childDepartments = $derived(
    department 
      ? allDepartments.filter(d => d.parent_id === department.id)
      : []
  );
  
  const canViewBudget = $derived(
    department ? permissionsStore.canViewBudgetForDepartment(department.id) : false
  );

  const canEditBudget = $derived(
    department ? permissionsStore.canAllocateBudgetForDepartment(department.id) : false
  );

  const canManageDepartments = $derived(
    permissionsStore.canManageDepartments()
  );

  $effect(() => {
    if (activeTab === 'budget' && !canViewBudget) {
      activeTab = 'overview';
    }
  });
  
  function handleEdit() {
    if (department) {
      onEdit(department);
    }
  }
  
  function confirmDelete() {
    showDeleteConfirm = true;
  }
  
  async function handleDelete() {
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

  function handleTabKeydown(event: KeyboardEvent, tab: 'overview' | 'members' | 'budget') {
    const tabs: ('overview' | 'members' | 'budget')[] = canViewBudget 
      ? ['overview', 'members', 'budget'] 
      : ['overview', 'members'];
    
    const currentIndex = tabs.indexOf(tab);
    let newTab: 'overview' | 'members' | 'budget' | null = null;
    
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      const nextIndex = (currentIndex + 1) % tabs.length;
      newTab = tabs[nextIndex];
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      newTab = tabs[prevIndex];
    } else if (event.key === 'Home') {
      event.preventDefault();
      newTab = tabs[0];
    } else if (event.key === 'End') {
      event.preventDefault();
      newTab = tabs[tabs.length - 1];
    }
    
    if (newTab && newTab !== activeTab) {
      activeTab = newTab;
      tick().then(() => {
        const newTabElement = document.getElementById(getTabId(newTab!));
        newTabElement?.focus();
      });
    }
  }
  
</script>

{#if department}
  <div class="details-panel">
    <div class="panel-header">
      <div class="header-content">
        <h2>{department.name}</h2>
        <button
          type="button"
          class="close-btn"
          onclick={onClose}
          aria-label={$_('admin.common.closeModal')}
        >
          <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
            <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
      
      <div
        class="tabs"
        role="tablist"
        aria-label={$_('admin.departments.details')}
      >
        <button
          type="button"
          class="tab"
          class:active={activeTab === 'overview'}
          role="tab"
          id={getTabId('overview')}
          aria-selected={activeTab === 'overview'}
          aria-controls={getTabPanelId('overview')}
          tabindex="0"
          onclick={() => (activeTab = 'overview')}
          onkeydown={(e) => handleTabKeydown(e, 'overview')}
        >
          {$_('admin.departments.overview')}
        </button>
        <button
          type="button"
          class="tab"
          class:active={activeTab === 'members'}
          role="tab"
          id={getTabId('members')}
          aria-selected={activeTab === 'members'}
          aria-controls={getTabPanelId('members')}
          tabindex="0"
          onclick={() => (activeTab = 'members')}
          onkeydown={(e) => handleTabKeydown(e, 'members')}
        >
          {$_('admin.departments.members')} ({department.member_count})
        </button>
        {#if canViewBudget}
          <button
            type="button"
            class="tab"
            class:active={activeTab === 'budget'}
            role="tab"
            id={getTabId('budget')}
            aria-selected={activeTab === 'budget'}
            aria-controls={getTabPanelId('budget')}
            tabindex="0"
            onclick={() => (activeTab = 'budget')}
            onkeydown={(e) => handleTabKeydown(e, 'budget')}
          >
            {$_('admin.departments.budget')}
          </button>
        {/if}
      </div>
    </div>
    
    <div class="panel-content">
      {#if activeTab === 'overview'}
        <div
          class="overview-tab"
          role="tabpanel"
          id={getTabPanelId('overview')}
          aria-labelledby={getTabId('overview')}
          tabindex="0"
        >
          <div class="section">
            <div class="section-header">
              <h3>{$_('admin.departments.details')}</h3>
              {#if canManageDepartments}
                <button type="button" class="btn-secondary" onclick={handleEdit}>
                  {$_('common.edit')}
                </button>
              {/if}
            </div>
            
            <div class="field-group">
              <p class="field-label">{$_('admin.departments.name')}</p>
              <div class="field-value">{department.name}</div>
            </div>
            
            <div class="field-group">
              <p class="field-label">{$_('admin.departments.description')}</p>
              <div class="field-value">{department.description || 'No description'}</div>
            </div>
            
            <div class="field-group">
              <p class="field-label">{$_('admin.departments.parentDepartment')}</p>
              <div class="field-value">
                {parentDepartment?.name || 'None (Root Department)'}
              </div>
            </div>
            
            <div class="field-group">
              <p class="field-label">{$_('admin.departments.path')}</p>
              <div class="field-value path">{department.name}</div>
            </div>
            
            <div class="field-group">
              <p class="field-label">{$_('admin.departments.depth')}</p>
              <div class="field-value">Level {department.depth}</div>
            </div>
          </div>
          
          <DepartmentAdminsSection {department} canManage={canManageDepartments} />
          
          <div class="section">
            <h3>{$_('admin.departments.statistics')}</h3>
            
            <div class="stats-grid">
              <div class="stat-card">
                <div class="stat-label">{$_('admin.departments.directMembers')}</div>
                <div class="stat-value">{department.member_count}</div>
              </div>
              
              <div class="stat-card">
                <div class="stat-label">{$_('admin.departments.totalMembers')}</div>
                <div class="stat-value">{department.total_member_count}</div>
              </div>
              
              <div class="stat-card">
                <div class="stat-label">{$_('admin.departments.childCount')}</div>
                <div class="stat-value">{department.child_count}</div>
              </div>
            </div>
          </div>
          
          <div class="section">
            <h3>{$_('admin.departments.childDepartments')}</h3>
            {#if childDepartments.length > 0}
              <div class="child-list">
                {#each childDepartments as child}
                  <div class="child-item">
                    <span class="child-name">{child.name}</span>
                    <span class="child-members">{child.total_member_count} members</span>
                  </div>
                {/each}
              </div>
            {:else}
              <p>{$_('admin.departments.noChildDepartments')}</p>
            {/if}
          </div>
          
          <div class="section">
            <h3>{$_('admin.common.metadata')}</h3>
            
            <div class="field-group">
              <p class="field-label">{$_('admin.common.created')}</p>
              <div class="field-value">{formatDate(department.created_at)}</div>
            </div>
            
            <div class="field-group">
              <p class="field-label">{$_('admin.common.lastUpdated')}</p>
              <div class="field-value">{formatDate(department.updated_at)}</div>
            </div>
          </div>
          
          {#if canManageDepartments}
            <div class="section danger-zone">
              <h3>{$_('admin.departments.deleteDepartment')}</h3>
              <button type="button" class="btn-danger" onclick={confirmDelete}>
                {$_('admin.departments.deleteDepartment')}
              </button>
            </div>
          {/if}
        </div>
      {/if}
      
      {#if activeTab === 'members'}
        <div
          class="members-tab"
          role="tabpanel"
          id={getTabPanelId('members')}
          aria-labelledby={getTabId('members')}
          tabindex="0"
        >
          <MemberManagement {department} canManage={canManageDepartments} />
        </div>
      {/if}
      
      {#if activeTab === 'budget' && canViewBudget}
        <div
          class="budget-tab"
          role="tabpanel"
          id={getTabPanelId('budget')}
          aria-labelledby={getTabId('budget')}
          tabindex="0"
        >
          <BudgetManagement {department} canEdit={canEditBudget}/>
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
        <button type="button" class="btn-danger" onclick={handleDelete}>
          {$_('common.delete')}
        </button>
      </div>
    </div>
  </Modal>
{/if}

<style>
  .details-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--glass-bg-dark);
    border-left: 1px solid var(--glass-stroke-dark);
  }
  
  .panel-header {
    border-bottom: 1px solid var(--glass-stroke-dark);
    padding: 20px;
  }
  
  .header-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }
  
  .header-content h2 {
    font-size: 20px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
  }
  
  .close-btn {
    background: none;
    border: none;
    padding: 4px;
    cursor: pointer;
    color: var(--text-secondary);
    transition: color 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .close-btn:hover {
    color: var(--text-primary);
  }
  
  .tabs {
    display: flex;
    gap: 4px;
  }
  
  .tab {
    padding: 8px 16px;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    color: var(--text-secondary);
    transition: all 0.2s;
  }
  
  .tab:hover {
    color: var(--text-primary);
  }

  .tab:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
    color: var(--text-primary);
  }
  
  .tab.active {
    color: var(--brand);
    border-bottom-color: var(--brand);
  }
  
  .panel-content {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
  }
  
  .overview-tab {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }
  
  .section {
    background: var(--btn-secondary);
    border-radius: var(--radius-md);
    padding: 16px;
  }
  
  .section h3 {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 16px 0;
  }
  
  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }
  
  .section-header h3 {
    margin: 0;
  }
  
  .field-group {
    margin-bottom: 12px;
  }
  
  .field-group:last-child {
    margin-bottom: 0;
  }
  
  .field-group .field-label {
    display: block;
    font-size: 12px;
    font-weight: 500;
    color: var(--text-secondary);
    margin-bottom: 4px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  
  .field-value {
    font-size: 14px;
    color: var(--text-primary);
  }
  
  .field-value.path {
    font-family: monospace;
    font-size: 13px;
    color: var(--text-secondary);
  }
  
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 12px;
  }
  
  .stat-card {
    background: var(--glass-bg-dark);
    border-radius: var(--radius-sm);
    padding: 12px;
    text-align: center;
  }
  
  .stat-label {
    font-size: 12px;
    color: var(--text-secondary);
    margin-bottom: 4px;
  }
  
  .stat-value {
    font-size: 24px;
    font-weight: 600;
    color: var(--text-primary);
  }
  
  .child-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  
  .child-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    background: var(--glass-bg-dark);
    border-radius: var(--radius-sm);
  }
  
  .child-name {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-primary);
  }
  
  .child-members {
    font-size: 12px;
    color: var(--text-secondary);
  }
  
  .danger-zone {
    background: var(--danger-surface);
    border: 1px solid color-mix(in oklab, var(--brand-red) 30%, transparent);
  }
  
  .btn-secondary {
    padding: 8px 16px;
    background: var(--button-bg);
    border: 1px solid var(--button-border);
    border-radius: var(--radius-sm);
    font-size: 14px;
    font-weight: 500;
    color: var(--text-primary);
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .btn-secondary:hover {
    background: var(--btn-secondary);
    border-color: var(--glass-stroke-light);
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
  
  .delete-confirm {
    padding: 20px;
  }
  
  .delete-confirm p {
    margin: 0 0 12px 0;
    color: var(--text-primary);
  }
  
  .delete-confirm .warning {
    color: var(--brand-red);
    font-size: 14px;
  }
  
  .modal-actions {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
    margin-top: 24px;
  }
  
  .members-tab,
  .budget-tab {
    min-height: 200px;
  }
</style>
