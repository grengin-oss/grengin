<script lang="ts">
  import type { Department, BudgetPeriod, BudgetOverview, ActionOnExceed } from "../types.js";
  import { departmentsStore } from "../stores/index.js";
  import { toast } from "../../components/Toaster.svelte";
  import { ApiError } from "../../api/client.js";
  import { getLocalizedError } from "../../utils/errorLocalization.js";
  import { _ } from "svelte-i18n";
  import { getBudgetOverview } from "../../api/admin/departments.js";
  import LoadingSpinner from "./LoadingSpinner.svelte";
  import DepartmentAllowedModels from "./DepartmentAllowedModels.svelte";
  import Modal from "./Modal.svelte";
  
  interface Props {
    department: Department;
    canEditBudget?: boolean;
  }
  
  let { department, canEditBudget = true }: Props = $props();
  
  let isEditingBudget = $state(false);
  let budgetAmount = $state(department.budget_allocated);
  let budgetPeriod = $state<BudgetPeriod>(department.budget_period);
  let actionOnExceed = $state<ActionOnExceed>(department.action_on_exceed || 'warn');
  let isSubmitting = $state(false);
  let budgetOverview = $state<BudgetOverview | null>(null);
  let isLoadingOverview = $state(false);
  let showSaveBudgetConfirmation = $state(false);
  
  // Reactively fetch budget overview whenever department changes
  $effect(() => {
    isEditingBudget = false;
    showSaveBudgetConfirmation = false;
    fetchBudgetOverview();
  });
   
  async function fetchBudgetOverview() {
    isLoadingOverview = true;
    try {
      budgetOverview = await getBudgetOverview(department.id);
    } catch (error) {
      const errorMessage = error instanceof ApiError 
        ? getLocalizedError(error, 'description', $_) 
        : $_('admin.departments.failedToLoadBudget');
      toast.error(errorMessage);
    } finally {
      isLoadingOverview = false;
    }
  }
  
  const usagePercent = $derived(
    budgetOverview && budgetOverview.budget_allocated > 0 
      ? (budgetOverview.budget_used / budgetOverview.budget_allocated) * 100 
      : 0
  );
  
  const usageTotalPercent = $derived(
    budgetOverview && budgetOverview.budget_allocated > 0 
      ? (budgetOverview.budget_used_total / budgetOverview.budget_allocated) * 100 
      : 0
  );
  
  const availablePercent = $derived(
    budgetOverview && budgetOverview.budget_allocated > 0 
      ? (budgetOverview.budget_available / budgetOverview.budget_allocated) * 100 
      : 0
  );
  
  const distributedPercent = $derived(
    budgetOverview && budgetOverview.budget_allocated > 0 
      ? (budgetOverview.budget_distributed / budgetOverview.budget_allocated) * 100 
      : 0
  );
  
  // Helper to get status color classes based on usage percentage
  const getUsageColorClass = (percent: number) => {
    if (percent >= 80) return 'danger';
    if (percent >= 60) return 'warning';
    return 'ok';
  };
  
  function startEditing() {
    if (!canEditBudget) return;
    // Use budgetOverview data if available (most recent), otherwise fall back to department data
    if (budgetOverview) {
      budgetAmount = budgetOverview.budget_allocated;
      budgetPeriod = budgetOverview.period;
    } else {
      budgetAmount = department.budget_allocated;
      budgetPeriod = department.budget_period;
    }
    actionOnExceed = department.action_on_exceed || 'warn';
    isEditingBudget = true;
  }
  
  function cancelEditing() {
    isEditingBudget = false;
    showSaveBudgetConfirmation = false;
  }
  
  function saveBudget() {
    if (budgetAmount < 0) {
      toast.error($_('admin.departments.budgetMustBePositive'));
      return;
    }
    
    if (budgetOverview && budgetAmount < budgetOverview.budget_distributed) {
      toast.error($_('admin.departments.budgetCannotBeLessThanDistributed'));
      return;
    }
    
    // Show confirmation UI
    showSaveBudgetConfirmation = true;
  }
  
  function cancelSaveConfirmation() {
    showSaveBudgetConfirmation = false;
  }
  
  async function confirmSave() {
    isSubmitting = true;
    try {
      await departmentsStore.setBudget(department.id, {
        budget_allocated: budgetAmount,
        budget_period: budgetPeriod,
        action_on_exceed: actionOnExceed,
      });
      toast.success($_('admin.departments.budgetUpdated'));
      isEditingBudget = false;
      showSaveBudgetConfirmation = false;
    } catch (error) {
      const errorMessage = error instanceof ApiError 
        ? getLocalizedError(error, 'description', $_) 
        : $_('admin.departments.failedToUpdateBudget');
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
    <h3>{$_('admin.departments.budgetOverview')}</h3>
    {#if !isEditingBudget && canEditBudget}
      <button class="btn-secondary" onclick={startEditing}>
        {$_('admin.departments.editBudget')}
      </button>
    {/if}
  </div>
  
  {#if isLoadingOverview}
    <div class="loading-state">
      <LoadingSpinner size="md" text={$_('admin.departments.loadingBudgets')} />
    </div>
  {:else if budgetOverview}
    <div class="budget-stats">
        <div class="stat-row">
          <div class="stat-item">
            <span class="stat-label">{$_('admin.departments.budgetAllocated')}</span>
            <span class="stat-value">{formatCurrency(budgetOverview.budget_allocated)}</span>
            <span class="stat-period">{$_('admin.departments.budgetPer')} {$_(`admin.departments.budgetPeriods.${budgetOverview.period}`)}</span>
          </div>
          
          <div class="stat-item">
            <span class="stat-label">{$_('admin.departments.budgetUsedDirect')}</span>
            <span class="stat-value {getUsageColorClass(usagePercent)}">
              {formatCurrency(budgetOverview.budget_used)}
            </span>
            <span class="stat-period {getUsageColorClass(usagePercent)}">{usagePercent.toFixed(1)}%</span>
          </div>
          
          <div class="stat-item">
            <span class="stat-label">{$_('admin.departments.budgetUsedTotal')}</span>
            <span class="stat-value {getUsageColorClass(usageTotalPercent)}">
              {formatCurrency(budgetOverview.budget_used_total)}
            </span>
            <span class="stat-period {getUsageColorClass(usageTotalPercent)}">{usageTotalPercent.toFixed(1)}%</span>
          </div>
          
          <div class="stat-item">
            <span class="stat-label">{$_('admin.departments.budgetDistributed')}</span>
            <span class="stat-value">{formatCurrency(budgetOverview.budget_distributed)}</span>
            <span class="stat-period">{distributedPercent.toFixed(1)}%</span>
          </div>
          
          <div class="stat-item">
            <span class="stat-label">{$_('admin.departments.budgetAvailable')}</span>
            <span class="stat-value success">{formatCurrency(budgetOverview.budget_available)}</span>
            <span class="stat-period">{availablePercent.toFixed(1)}%</span>
          </div>
        </div>
        
        <div class="period-info">
          <div class="period-row">
            <span class="period-label">{$_('admin.departments.budgetPeriodLabel')}:</span>
            <span class="period-date">{new Date(budgetOverview.period_start).toLocaleDateString()}</span>
            <span class="period-separator">—</span>
            <span class="period-date">{new Date(budgetOverview.period_end).toLocaleDateString()}</span>
          </div>
          {#if department.action_on_exceed}
            <div class="period-row">
              <span class="period-label">{$_('admin.departments.actionOnExceed')}:</span>
              <span class="period-value" class:warn-badge={department.action_on_exceed === 'warn'} class:block-badge={department.action_on_exceed === 'block'}>
                {department.action_on_exceed === 'warn' ? $_('admin.departments.actionOnExceedWarn') : $_('admin.departments.actionOnExceedBlock')}
              </span>
            </div>
          {/if}
        </div>
      </div>
  {:else}
    <div class="empty-state">
      <p>{$_('admin.departments.noBudgetData')}</p>
    </div>
  {/if}
  
  {#if budgetOverview}
    <div class="budget-visualization">
      <div class="progress-bar">
        <div 
          class="progress-segment used {getUsageColorClass(usagePercent)}" 
          style="width: {Math.min(usagePercent, 100)}%"
          title={$_('admin.departments.progressBarTooltipUsedDirect', {
            values: {
              amount: formatCurrency(budgetOverview.budget_used),
              percent: usagePercent.toFixed(1),
            },
          })}
        ></div>
        <div 
          class="progress-segment distributed" 
          style="width: {Math.min(distributedPercent, 100 - usagePercent)}%"
          title={$_('admin.departments.progressBarTooltipDistributed', {
            values: { amount: formatCurrency(budgetOverview.budget_distributed) },
          })}
        ></div>
      </div>
      
      <div class="progress-legend">
        <div class="legend-item">
          <span class="legend-color used {getUsageColorClass(usagePercent)}"></span>
          <span>{$_('admin.departments.legendUsedDirect')}</span>
        </div>
        <div class="legend-item">
          <span class="legend-color distributed"></span>
          <span>{$_('admin.departments.legendDistributed')}</span>
        </div>
        <div class="legend-item">
          <span class="legend-color available"></span>
          <span>{$_('admin.departments.legendAvailable')}</span>
        </div>
      </div>
    </div>
  {/if}

  {#if budgetOverview && budgetOverview.sub_department_budgets.length > 0}
    <div class="child-budgets">
      <h4>{$_('admin.departments.childBudgets')}</h4>
      <div class="child-budget-list">
        {#each budgetOverview.sub_department_budgets as subDept}
          {@const subDeptPercent = subDept.allocated > 0 ? (subDept.used / subDept.allocated) * 100 : 0}
          <div class="child-budget-item">
            <div class="child-info">
              <span class="child-name">{subDept.name}</span>
              <span class="child-budget">{formatCurrency(subDept.allocated)}</span>
            </div>
            <div class="child-progress">
              <div class="mini-progress-bar">
                <div 
                  class="mini-progress-fill {getUsageColorClass(subDeptPercent)}"
                  style="width: {Math.min(subDeptPercent, 100)}%"
                ></div>
              </div>
              <span class="child-usage {getUsageColorClass(subDeptPercent)}">{formatCurrency(subDept.used)}</span>
              <span class="child-percentage {getUsageColorClass(subDeptPercent)}">
                {subDeptPercent.toFixed(1)}%
              </span>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <DepartmentAllowedModels {department} canEditModels={canEditBudget} />
  
  {#if isEditingBudget}
    <Modal isOpen={isEditingBudget} onclose={cancelEditing} title={$_('admin.departments.editBudget')}>
      <div class="budget-form">
        {#if !showSaveBudgetConfirmation}
          <div class="form-row">
            <div class="form-group">
              <label for="budget-amount">{$_('admin.departments.budgetAmount')}</label>
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
              <label for="budget-period">{$_('admin.departments.budgetPeriod')}</label>
              <select
                id="budget-period"
                bind:value={budgetPeriod}
                disabled={isSubmitting}
              >
                <option value="daily">{$_('admin.departments.budgetPeriods.daily')}</option>
                <option value="weekly">{$_('admin.departments.budgetPeriods.weekly')}</option>
                <option value="monthly">{$_('admin.departments.budgetPeriods.monthly')}</option>
                <option value="quarterly">{$_('admin.departments.budgetPeriods.quarterly')}</option>
                <option value="yearly">{$_('admin.departments.budgetPeriods.yearly')}</option>
              </select>
            </div>
            
            <div class="form-group">
              <label for="action-on-exceed">{$_('admin.departments.actionOnExceed')}</label>
              <select
                id="action-on-exceed"
                bind:value={actionOnExceed}
                disabled={isSubmitting}
              >
                <option value="warn">{$_('admin.departments.actionOnExceedWarn')}</option>
                <option value="block">{$_('admin.departments.actionOnExceedBlock')}</option>
              </select>
            </div>
          </div>
        {/if}
        
        {#if !showSaveBudgetConfirmation}
          <div class="form-actions">
            <button 
              class="btn-secondary" 
              onclick={cancelEditing}
              disabled={isSubmitting}
            >
              {$_('common.cancel')}
            </button>
            <button 
              class="btn-primary" 
              onclick={saveBudget}
              disabled={isSubmitting}
            >
              {$_('admin.departments.saveBudget')}
            </button>
          </div>
        {:else}
          <div class="save-confirmation">
            <div class="confirmation-message">
              <h4>{$_('admin.departments.confirmBudgetUpdate')}</h4>
              <p>{$_('admin.departments.confirmBudgetMessage')}</p>
              <div class="confirmation-details">
                <div class="detail-row">
                  <span class="detail-label">{$_('admin.departments.budgetAmount')}:</span>
                  <span class="detail-value">{formatCurrency(budgetAmount)}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">{$_('admin.departments.budgetPeriod')}:</span>
                  <span class="detail-value">{$_(`admin.departments.budgetPeriods.${budgetPeriod}`)}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">{$_('admin.departments.actionOnExceed')}:</span>
                  <span class="detail-value">{actionOnExceed === 'warn' ? $_('admin.departments.actionOnExceedWarn') : $_('admin.departments.actionOnExceedBlock')}</span>
                </div>
              </div>
            </div>
            <div class="confirmation-actions">
              <button 
                class="btn-secondary" 
                onclick={cancelSaveConfirmation}
                disabled={isSubmitting}
              >
                {$_('common.cancel')}
              </button>
              <button 
                class="btn-primary danger" 
                onclick={confirmSave}
                disabled={isSubmitting}
              >
                {isSubmitting ? $_('admin.common.saving') : $_('admin.departments.confirmAndSave')}
              </button>
            </div>
          </div>
        {/if}
      </div>
    </Modal>
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
    grid-template-columns: 2fr 1fr 1fr;
    gap: 16px;
    margin-bottom: 20px;
  }
  
  @media (max-width: 768px) {
    .form-row {
      grid-template-columns: 1fr;
    }
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
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 20px;
    margin-bottom: 16px;
  }
  
  .period-info {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 16px;
    border-top: 1px solid var(--glass-stroke-light);
    font-size: 13px;
  }
  
  .period-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  
  .period-label {
    color: var(--text-secondary);
    font-weight: 500;
  }
  
  .period-date {
    color: var(--text-primary);
  }
  
  .period-separator {
    color: var(--text-secondary);
  }
  
  .period-value {
    color: var(--text-primary);
    padding: 2px 8px;
    border-radius: var(--radius-sm);
    font-size: 12px;
    font-weight: 500;
  }
  
  .period-value.warn-badge {
    background: rgba(251, 191, 36, 0.15);
    color: #f59e0b;
  }
  
  .period-value.block-badge {
    background: rgba(239, 68, 68, 0.15);
    color: var(--brand-red);
  }
  
  .loading-state {
    background: var(--btn-secondary);
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 200px;
  }
  
  .empty-state {
    background: var(--btn-secondary);
    border-radius: var(--radius-md);
    padding: 40px 20px;
    text-align: center;
    color: var(--text-secondary);
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
  
  .stat-value.ok {
    color: var(--brand-green);
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
  
  .stat-period.ok {
    color: var(--brand-green);
    font-weight: 600;
  }
  
  .stat-period.warning {
    color: #f59e0b;
    font-weight: 600;
  }
  
  .stat-period.danger {
    color: var(--brand-red);
    font-weight: 600;
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
    transition: width 0.3s ease, background 0.3s ease;
  }
  
  .progress-segment.used {
    background: linear-gradient(90deg, var(--brand), var(--brand-hover));
  }
  
  .progress-segment.used.ok {
    background: linear-gradient(90deg, #10b981, #059669);
  }
  
  .progress-segment.used.warning {
    background: linear-gradient(90deg, #f59e0b, #d97706);
  }
  
  .progress-segment.used.danger {
    background: linear-gradient(90deg, #ef4444, #dc2626);
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
    transition: background 0.3s ease;
  }
  
  .legend-color.used {
    background: var(--brand);
  }
  
  .legend-color.used.ok {
    background: #10b981;
  }
  
  .legend-color.used.warning {
    background: #f59e0b;
  }
  
  .legend-color.used.danger {
    background: #ef4444;
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
    transition: width 0.3s ease, background 0.3s ease;
  }
  
  .mini-progress-fill.ok {
    background: #10b981;
  }
  
  .mini-progress-fill.warning {
    background: #f59e0b;
  }
  
  .mini-progress-fill.danger {
    background: #ef4444;
  }
  
  .child-usage {
    font-size: 12px;
    color: var(--text-secondary);
    white-space: nowrap;
  }
  
  .child-usage.ok {
    color: var(--brand-green);
    font-weight: 600;
  }
  
  .child-usage.warning {
    color: #f59e0b;
    font-weight: 600;
  }
  
  .child-usage.danger {
    color: var(--brand-red);
    font-weight: 600;
  }
  
  .child-percentage {
    font-size: 12px;
    color: var(--text-secondary);
    font-weight: 500;
    white-space: nowrap;
  }
  
  .child-percentage.ok {
    color: var(--brand-green);
    font-weight: 600;
  }
  
  .child-percentage.warning {
    color: #f59e0b;
    font-weight: 600;
  }
  
  .child-percentage.danger {
    color: var(--brand-red);
    font-weight: 600;
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
  
  .btn-primary.danger {
    background: var(--brand-red);
  }
  
  .btn-primary.danger:hover:not(:disabled) {
    background: #dc2626;
  }
  
  .save-confirmation {
    background: var(--glass-bg-dark);
    border: 1px solid var(--glass-stroke-light);
    border-radius: var(--radius-md);
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  
  .confirmation-message h4 {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 8px 0;
  }
  
  .confirmation-message p {
    font-size: 14px;
    color: var(--text-secondary);
    margin: 0 0 16px 0;
  }
  
  .confirmation-details {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    background: rgba(var(--glass-tint), 0.03);
    border: 1px solid var(--glass-stroke-light);
    border-radius: var(--radius-sm);
  }
  
  .detail-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .detail-label {
    font-size: 13px;
    color: var(--text-secondary);
    font-weight: 500;
  }
  
  .detail-value {
    font-size: 14px;
    color: var(--text-primary);
    font-weight: 600;
    text-transform: capitalize;
  }
  
  .confirmation-actions {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
  }
</style>
