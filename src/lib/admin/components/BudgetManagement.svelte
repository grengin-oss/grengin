<script lang="ts">
  import type { Department, BudgetPeriod } from "../types.js";
  import { departmentsStore } from "../stores/index.js";
  import { toast } from "../../components/Toaster.svelte";
  import { ApiError } from "../../api/client.js";
  import { getLocalizedError } from "../../utils/errorLocalization.js";
  import { _ } from "svelte-i18n";
  
  interface Props {
    department: Department;
    allDepartments: Department[];
  }
  
  let { department, allDepartments }: Props = $props();
  
  let isEditing = $state(false);
  let budgetAmount = $state(department.budget_allocated);
  let budgetPeriod = $state<BudgetPeriod>(department.budget_period);
  let isSubmitting = $state(false);
  
  const usagePercent = $derived(
    department.budget_allocated > 0 
      ? (department.budget_used / department.budget_allocated) * 100 
      : 0
  );
  
  const availablePercent = $derived(
    department.budget_allocated > 0 
      ? (department.budget_available / department.budget_allocated) * 100 
      : 0
  );
  
  const distributedPercent = $derived(
    department.budget_allocated > 0 
      ? (department.budget_distributed / department.budget_allocated) * 100 
      : 0
  );
  
  const childDepartments = $derived(
    allDepartments.filter(d => d.parent_id === department.id)
  );
  
  function startEditing() {
    budgetAmount = department.budget_allocated;
    budgetPeriod = department.budget_period;
    isEditing = true;
  }
  
  function cancelEditing() {
    isEditing = false;
  }
  
  async function saveBudget() {
    if (budgetAmount < 0) {
      toast.error('Budget amount must be positive');
      return;
    }
    
    if (budgetAmount < department.budget_distributed) {
      toast.error('Budget cannot be less than already distributed amount');
      return;
    }
    
    isSubmitting = true;
    try {
      await departmentsStore.setBudget(department.id, budgetAmount, budgetPeriod);
      toast.success('Budget updated successfully');
      isEditing = false;
    } catch (error) {
      const errorMessage = error instanceof ApiError 
        ? getLocalizedError(error, 'description', $_) 
        : 'Failed to update budget';
      toast.error(errorMessage);
    } finally {
      isSubmitting = false;
    }
  }
  
  function formatCurrency(amount: number): string {
    return `$${amount.toFixed(2)}`;
  }
</script>

<div class="budget-management">
  <div class="budget-header">
    <h3>Budget Overview</h3>
    {#if !isEditing}
      <button class="btn-secondary" onclick={startEditing}>Edit Budget</button>
    {/if}
  </div>
  
  {#if isEditing}
    <div class="budget-form">
      <div class="form-row">
        <div class="form-group">
          <label for="budget-amount">Budget Amount</label>
          <input
            id="budget-amount"
            type="number"
            step="0.01"
            min="0"
            bind:value={budgetAmount}
            disabled={isSubmitting}
          />
        </div>
        
        <div class="form-group">
          <label for="budget-period">Period</label>
          <select
            id="budget-period"
            bind:value={budgetPeriod}
            disabled={isSubmitting}
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>
      </div>
      
      <div class="form-actions">
        <button 
          class="btn-secondary" 
          onclick={cancelEditing}
          disabled={isSubmitting}
        >
          Cancel
        </button>
        <button 
          class="btn-primary" 
          onclick={saveBudget}
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Saving...' : 'Save Budget'}
        </button>
      </div>
    </div>
  {:else}
    <div class="budget-stats">
      <div class="stat-row">
        <div class="stat-item">
          <span class="stat-label">Allocated</span>
          <span class="stat-value">{formatCurrency(department.budget_allocated)}</span>
          <span class="stat-period">per {department.budget_period}</span>
        </div>
        
        <div class="stat-item">
          <span class="stat-label">Used</span>
          <span class="stat-value" class:warning={usagePercent >= 80} class:danger={usagePercent >= 100}>
            {formatCurrency(department.budget_used)}
          </span>
          <span class="stat-period">{usagePercent.toFixed(1)}%</span>
        </div>
        
        <div class="stat-item">
          <span class="stat-label">Distributed</span>
          <span class="stat-value">{formatCurrency(department.budget_distributed)}</span>
          <span class="stat-period">{distributedPercent.toFixed(1)}%</span>
        </div>
        
        <div class="stat-item">
          <span class="stat-label">Available</span>
          <span class="stat-value success">{formatCurrency(department.budget_available)}</span>
          <span class="stat-period">{availablePercent.toFixed(1)}%</span>
        </div>
      </div>
    </div>
    
    <div class="budget-visualization">
      <div class="progress-bar">
        <div 
          class="progress-segment used" 
          style="width: {Math.min(usagePercent, 100)}%"
          title="Used: {formatCurrency(department.budget_used)}"
        ></div>
        <div 
          class="progress-segment distributed" 
          style="width: {Math.min(distributedPercent - usagePercent, 100 - usagePercent)}%"
          title="Distributed: {formatCurrency(department.budget_distributed)}"
        ></div>
      </div>
      
      <div class="progress-legend">
        <div class="legend-item">
          <span class="legend-color used"></span>
          <span>Used</span>
        </div>
        <div class="legend-item">
          <span class="legend-color distributed"></span>
          <span>Distributed to children</span>
        </div>
        <div class="legend-item">
          <span class="legend-color available"></span>
          <span>Available</span>
        </div>
      </div>
    </div>
  {/if}
  
  {#if childDepartments.length > 0}
    <div class="child-budgets">
      <h4>Child Department Budgets</h4>
      <div class="child-budget-list">
        {#each childDepartments as child}
          <div class="child-budget-item">
            <div class="child-info">
              <span class="child-name">{child.name}</span>
              <span class="child-budget">{formatCurrency(child.budget_allocated)} / {child.budget_period}</span>
            </div>
            <div class="child-progress">
              <div class="mini-progress-bar">
                <div 
                  class="mini-progress-fill"
                  class:ok={child.budget_allocated > 0 && (child.budget_used / child.budget_allocated) < 0.8}
                  class:warning={child.budget_allocated > 0 && (child.budget_used / child.budget_allocated) >= 0.8 && (child.budget_used / child.budget_allocated) < 1}
                  class:danger={child.budget_allocated > 0 && (child.budget_used / child.budget_allocated) >= 1}
                  style="width: {child.budget_allocated > 0 ? Math.min((child.budget_used / child.budget_allocated) * 100, 100) : 0}%"
                ></div>
              </div>
              <span class="child-usage">{formatCurrency(child.budget_used)}</span>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .budget-management {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }
  
  .budget-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .budget-header h3 {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
  }
  
  .budget-form {
    background: var(--btn-secondary);
    border-radius: var(--radius-md);
    padding: 20px;
  }
  
  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-bottom: 20px;
  }
  
  .form-group {
    display: flex;
    flex-direction: column;
  }
  
  .form-group label {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-primary);
    margin-bottom: 6px;
  }
  
  .form-group input,
  .form-group select {
    padding: 10px 12px;
    border: 1px solid var(--button-border);
    border-radius: var(--radius-sm);
    font-size: 14px;
    color: var(--text-primary);
    background: var(--button-bg);
  }
  
  .form-group input:focus,
  .form-group select:focus {
    outline: none;
    border-color: var(--brand);
    background: var(--btn-secondary);
  }
  
  .form-actions {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
  }
  
  .budget-stats {
    background: var(--btn-secondary);
    border-radius: var(--radius-md);
    padding: 20px;
  }
  
  .stat-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 20px;
  }
  
  .stat-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  
  .stat-label {
    font-size: 12px;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-weight: 500;
  }
  
  .stat-value {
    font-size: 24px;
    font-weight: 600;
    color: var(--text-primary);
  }
  
  .stat-value.success {
    color: var(--brand-green);
  }
  
  .stat-value.warning {
    color: #f59e0b;
  }
  
  .stat-value.danger {
    color: var(--brand-red);
  }
  
  .stat-period {
    font-size: 12px;
    color: var(--text-secondary);
  }
  
  .budget-visualization {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  
  .progress-bar {
    height: 32px;
    background: var(--btn-quaternary);
    border-radius: var(--radius-sm);
    overflow: hidden;
    display: flex;
  }
  
  .progress-segment {
    height: 100%;
    transition: width 0.3s ease;
  }
  
  .progress-segment.used {
    background: linear-gradient(90deg, var(--brand), var(--brand-hover));
  }
  
  .progress-segment.distributed {
    background: linear-gradient(90deg, #8b5cf6, #7c3aed);
  }
  
  .progress-legend {
    display: flex;
    gap: 20px;
    justify-content: center;
  }
  
  .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--text-secondary);
  }
  
  .legend-color {
    width: 12px;
    height: 12px;
    border-radius: 2px;
  }
  
  .legend-color.used {
    background: var(--brand);
  }
  
  .legend-color.distributed {
    background: #8b5cf6;
  }
  
  .legend-color.available {
    background: var(--btn-quaternary);
  }
  
  .child-budgets {
    background: var(--btn-secondary);
    border-radius: var(--radius-md);
    padding: 20px;
  }
  
  .child-budgets h4 {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 16px 0;
  }
  
  .child-budget-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  
  .child-budget-item {
    background: var(--glass-bg-dark);
    border-radius: var(--radius-sm);
    padding: 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
  }
  
  .child-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
  }
  
  .child-name {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-primary);
  }
  
  .child-budget {
    font-size: 12px;
    color: var(--text-secondary);
  }
  
  .child-progress {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    max-width: 200px;
  }
  
  .mini-progress-bar {
    flex: 1;
    height: 8px;
    background: var(--btn-quaternary);
    border-radius: 4px;
    overflow: hidden;
  }
  
  .mini-progress-fill {
    height: 100%;
    transition: width 0.3s ease;
  }
  
  .mini-progress-fill.ok {
    background: var(--brand-green);
  }
  
  .mini-progress-fill.warning {
    background: #f59e0b;
  }
  
  .mini-progress-fill.danger {
    background: var(--brand-red);
  }
  
  .child-usage {
    font-size: 12px;
    color: var(--text-secondary);
    white-space: nowrap;
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
  
  .btn-secondary:hover:not(:disabled) {
    background: var(--btn-secondary);
    border-color: var(--glass-stroke-light);
  }
  
  .btn-secondary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
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
  
  .btn-primary:hover:not(:disabled) {
    background: var(--brand-hover);
  }
  
  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
