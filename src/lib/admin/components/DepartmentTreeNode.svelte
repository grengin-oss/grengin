<script lang="ts">
  import type { Department } from "../types.js";
  import DepartmentTreeNode from './DepartmentTreeNode.svelte';
  
  interface Props {
    department: Department;
    allDepartments?: Department[];
    onSelect: (dept: Department) => void;
    selectedId?: string;
    onMove?: (deptId: string, newParentId: string | null) => void;
  }
  
  let { department, allDepartments = [], onSelect, selectedId, onMove }: Props = $props();
  
  let isExpanded = $state(true);
  let isDragOver = $state(false);
  
  const budgetStatus = $derived(() => {
    const usagePercent = department.budget_allocated > 0 
      ? (department.budget_used / department.budget_allocated) * 100 
      : 0;
    
    if (usagePercent >= 100) return 'exceeded';
    if (usagePercent >= 80) return 'warning';
    return 'ok';
  });
  
  function toggleExpand() {
    isExpanded = !isExpanded;
  }
  
  function handleSelect() {
    onSelect(department);
  }
  
  function handleDragStart(e: DragEvent) {
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', department.id);
    }
  }
  
  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
    isDragOver = true;
  }
  
  function handleDragLeave() {
    isDragOver = false;
  }
  
  function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDragOver = false;
    
    const draggedId = e.dataTransfer?.getData('text/plain');
    if (draggedId && draggedId !== department.id && onMove) {
      const draggedDept = allDepartments.find(d => d.id === draggedId);
      if (draggedDept && !isDescendant(draggedId, department.id)) {
        onMove(draggedId, department.id);
      }
    }
  }
  
  function isDescendant(ancestorId: string, descendantId: string): boolean {
    let current = allDepartments.find(d => d.id === descendantId);
    while (current) {
      if (current.parent_id === ancestorId) return true;
      current = allDepartments.find(d => d.id === current!.parent_id);
    }
    return false;
  }
</script>

<div class="department-node">
  <div 
    class="department-item"
    class:selected={selectedId === department.id}
    class:drag-over={isDragOver}
    draggable="true"
    ondragstart={handleDragStart}
    ondragover={handleDragOver}
    ondragleave={handleDragLeave}
    ondrop={handleDrop}
    role="button"
    tabindex="0"
    onclick={handleSelect}
    onkeydown={(e) => e.key === 'Enter' && handleSelect()}
  >
    <div class="department-header">
      {#if department.children && department.children.length > 0}
        <button 
          class="expand-btn" 
          onclick={(e) => { e.stopPropagation(); toggleExpand(); }}
          aria-label={isExpanded ? 'Collapse' : 'Expand'}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path 
              d={isExpanded ? "M4 6L8 10L12 6" : "M6 4L10 8L6 12"}
              stroke="currentColor" 
              stroke-width="2" 
              stroke-linecap="round" 
              stroke-linejoin="round"
            />
          </svg>
        </button>
      {:else}
        <span class="expand-placeholder"></span>
      {/if}
      
      <div class="department-info">
        <div class="department-name-row">
          <span class="department-name">{department.name}</span>
          <span class="budget-indicator {budgetStatus()}" title="Budget status"></span>
        </div>
        <div class="department-meta">
          <span class="meta-item">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M8 8C9.65685 8 11 6.65685 11 5C11 3.34315 9.65685 2 8 2C6.34315 2 5 3.34315 5 5C5 6.65685 6.34315 8 8 8Z" stroke="currentColor" stroke-width="1.5"/>
              <path d="M3 14C3 11.2386 5.23858 9 8 9C10.7614 9 13 11.2386 13 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            {department.member_count}
          </span>
          <span class="meta-item">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M2 4H14V13C14 13.5523 13.5523 14 13 14H3C2.44772 14 2 13.5523 2 13V4Z" stroke="currentColor" stroke-width="1.5"/>
              <path d="M5 2H11V4H5V2Z" stroke="currentColor" stroke-width="1.5"/>
            </svg>
            ${department.budget_used.toFixed(2)} / ${department.budget_allocated.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  </div>
  
  {#if isExpanded && department.children && department.children.length > 0}
    <div class="children">
      {#each department.children as child (child.id)}
        <DepartmentTreeNode 
          department={child} 
          {allDepartments}
          {onSelect}
          {selectedId}
          {onMove}
        />
      {/each}
    </div>
  {/if}
</div>

<style>
  .department-node {
    margin-left: 0;
  }
  
  .department-item {
    padding: 8px 12px;
    margin: 2px 0;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
    border: 1px solid transparent;
  }
  
  .department-item:hover {
    background-color: var(--btn-tertiary);
  }
  
  .department-item.selected {
    background-color: color-mix(in oklab, var(--brand) 20%, transparent);
    border-color: color-mix(in oklab, var(--brand) 30%, transparent);
  }
  
  .department-item.drag-over {
    background-color: color-mix(in oklab, var(--brand) 25%, transparent);
    border-color: var(--brand);
    border-style: dashed;
  }
  
  .department-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  
  .expand-btn {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
    transition: color 0.2s;
    width: 20px;
    height: 20px;
    flex-shrink: 0;
  }
  
  .expand-btn:hover {
    color: var(--text-primary);
  }
  
  .expand-placeholder {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
  }
  
  .department-info {
    flex: 1;
    min-width: 0;
  }
  
  .department-name-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }
  
  .department-name {
    font-weight: 500;
    color: var(--text-primary);
    font-size: 14px;
  }
  
  .budget-indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  
  .budget-indicator.ok {
    background-color: var(--brand-green);
  }
  
  .budget-indicator.warning {
    background-color: #f59e0b;
  }
  
  .budget-indicator.exceeded {
    background-color: var(--brand-red);
  }
  
  .department-meta {
    display: flex;
    gap: 12px;
    font-size: 12px;
    color: var(--text-secondary);
  }
  
  .meta-item {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  
  .meta-item svg {
    flex-shrink: 0;
  }
  
  .children {
    margin-left: 24px;
    border-left: 1px solid var(--glass-stroke-dark);
    padding-left: 8px;
  }
</style>
