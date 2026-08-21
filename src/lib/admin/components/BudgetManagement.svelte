<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

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
  <div class="panel-header">
    <span class="panel-title">{$_('admin.departments.budgetOverview')}</span>
    {#if !isEditingBudget && canEditBudget}
      <button type="button" class="btn-secondary" onclick={startEditing}>
        {$_('admin.departments.editBudget')}
      </button>
    {/if}
  </div>

  {#if isLoadingOverview}
    <div class="budget-state">
      <LoadingSpinner size="md" text={$_('admin.departments.loadingBudgets')} />
    </div>
  {:else if budgetOverview}
    <div class="budget-kpis">
      <div class="kpi-budget">
        <span class="kpi-budget__label">{$_('admin.departments.budgetAllocated')}</span>
        <span class="kpi-budget__value">{formatCurrency(budgetOverview.budget_allocated)}</span>
        <span class="kpi-budget__unit">
          {$_('admin.departments.budgetPer')} {$_(`admin.departments.budgetPeriods.${budgetOverview.period}`)}
        </span>
      </div>
      <div class="kpi-budget">
        <span class="kpi-budget__label">{$_('admin.departments.budgetUsedDirect')}</span>
        <span class="kpi-budget__value {getUsageColorClass(usagePercent)}">
          {formatCurrency(budgetOverview.budget_used)}
        </span>
        <span class="kpi-budget__unit">{usagePercent.toFixed(1)}%</span>
      </div>
      <div class="kpi-budget">
        <span class="kpi-budget__label">{$_('admin.departments.budgetUsedTotal')}</span>
        <span class="kpi-budget__value {getUsageColorClass(usageTotalPercent)}">
          {formatCurrency(budgetOverview.budget_used_total)}
        </span>
        <span class="kpi-budget__unit">{usageTotalPercent.toFixed(1)}%</span>
      </div>
      <div class="kpi-budget">
        <span class="kpi-budget__label">{$_('admin.departments.budgetDistributed')}</span>
        <span class="kpi-budget__value">{formatCurrency(budgetOverview.budget_distributed)}</span>
        <span class="kpi-budget__unit">{distributedPercent.toFixed(1)}%</span>
      </div>
      <div class="kpi-budget">
        <span class="kpi-budget__label">{$_('admin.departments.budgetAvailable')}</span>
        <span class="kpi-budget__value positive">{formatCurrency(budgetOverview.budget_available)}</span>
        <span class="kpi-budget__unit">{availablePercent.toFixed(1)}%</span>
      </div>
    </div>

    <div class="budget-meta">
      <span class="budget-period">
        {$_('admin.departments.budgetPeriodLabel')}:
        {new Date(budgetOverview.period_start).toLocaleDateString()}
        &mdash;
        {new Date(budgetOverview.period_end).toLocaleDateString()}
      </span>
      {#if department.action_on_exceed}
        <span
          class="exceed-badge"
          class:exceed-badge--block={department.action_on_exceed === 'block'}
        >
          {$_('admin.departments.actionOnExceed')}:
          {department.action_on_exceed === 'warn'
            ? $_('admin.departments.actionOnExceedWarn')
            : $_('admin.departments.actionOnExceedBlock')}
        </span>
      {/if}
    </div>

    <div
      class="progress-stack"
      role="img"
      aria-label={$_('admin.departments.progressBarTooltipUsedDirect', {
        values: {
          amount: formatCurrency(budgetOverview.budget_used),
          percent: usagePercent.toFixed(1),
        },
      })}
    >
      <span
        class="progress-stack__used"
        style="width: {Math.min(usagePercent, 100)}%"
        title={$_('admin.departments.progressBarTooltipUsedDirect', {
          values: {
            amount: formatCurrency(budgetOverview.budget_used),
            percent: usagePercent.toFixed(1),
          },
        })}
      ></span>
      <span
        class="progress-stack__dist"
        style="width: {Math.max(0, Math.min(distributedPercent, 100 - usagePercent))}%"
        title={$_('admin.departments.progressBarTooltipDistributed', {
          values: { amount: formatCurrency(budgetOverview.budget_distributed) },
        })}
      ></span>
    </div>

    <div class="legend">
      <span class="legend-item">
        <span class="legend-dot legend-dot--used"></span>
        <span class="legend-label">{$_('admin.departments.legendUsedDirect')}</span>
      </span>
      <span class="legend-item">
        <span class="legend-dot legend-dot--dist"></span>
        <span class="legend-label">{$_('admin.departments.legendDistributed')}</span>
      </span>
      <span class="legend-item">
        <span class="legend-dot legend-dot--avail"></span>
        <span class="legend-label">{$_('admin.departments.legendAvailable')}</span>
      </span>
    </div>
  {:else}
    <div class="budget-state">
      <p>{$_('admin.departments.noBudgetData')}</p>
    </div>
  {/if}

  {#if budgetOverview && budgetOverview.sub_department_budgets.length > 0}
    <div class="card-block">
      <span class="panel-title">{$_('admin.departments.childBudgets')}</span>
      {#each budgetOverview.sub_department_budgets as subDept (subDept.name)}
        {@const subDeptPercent = subDept.allocated > 0 ? (subDept.used / subDept.allocated) * 100 : 0}
        <div class="subdept-row">
          <div class="subdept-text">
            <span class="subdept-name">{subDept.name}</span>
            <span class="subdept-alloc">{formatCurrency(subDept.allocated)}</span>
          </div>
          <div class="subdept-meter">
            <span class="meter-track">
              <span
                class="meter-fill {getUsageColorClass(subDeptPercent)}"
                style="width: {Math.min(subDeptPercent, 100)}%"
              ></span>
            </span>
            <span class="subdept-value">
              {formatCurrency(subDept.used)} &middot; {subDeptPercent.toFixed(1)}%
            </span>
          </div>
        </div>
      {/each}
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
  /* app.css gives every button backdrop-filter: blur(); on the flat
     Organization surfaces that repaints the 1px hairlines behind them
     (the tab-row ring, the tree's branch rails), so switch it off. */
  button {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .budget-management {
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
    gap: 12px;
  }

  .panel-title {
    font-weight: 700;
    font-size: 14px;
    line-height: 100%;
    color: var(--gx-slate-900);
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
    flex-shrink: 0;
    font-family: inherit;
    font-weight: 600;
    font-size: 13px;
    color: var(--gx-slate-500);
    white-space: nowrap;
    cursor: pointer;
    transition: background-color 120ms ease;
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--gx-org-track);
    transform: none;
  }

  .budget-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px 20px;
    align-self: stretch;
  }

  .budget-state p {
    margin: 0;
    font-size: 13px;
    color: var(--gx-slate-500);
  }

  /* ---------------- KPI cards ---------------- */
  .budget-kpis {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 16px;
    align-self: stretch;
  }

  .kpi-budget {
    min-height: 99px;
    border-radius: 12px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 16px;
    align-items: flex-start;
    justify-content: center;
  }

  .kpi-budget__label {
    font-weight: 700;
    font-size: 11px;
    line-height: 100%;
    letter-spacing: 0.4px;
    text-transform: uppercase;
    color: var(--gx-slate-400);
  }

  .kpi-budget__value {
    font-weight: 700;
    font-size: 24px;
    line-height: 100%;
    color: var(--gx-slate-900);
    white-space: nowrap;
  }

  .kpi-budget__value.positive {
    color: var(--gx-org-used);
  }

  .kpi-budget__value.warning {
    color: var(--gx-org-warn);
  }

  .kpi-budget__value.danger {
    color: var(--gx-org-danger);
  }

  .kpi-budget__unit {
    font-weight: 400;
    font-size: 12px;
    line-height: 100%;
    color: var(--gx-slate-500);
    white-space: nowrap;
  }

  /* ---------------- period + progress ---------------- */
  .budget-meta {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    align-self: stretch;
  }

  .budget-period {
    font-weight: 400;
    font-size: 12px;
    line-height: 100%;
    color: var(--gx-slate-400);
  }

  .exceed-badge {
    display: inline-flex;
    align-items: center;
    height: 22px;
    padding: 0 10px;
    border-radius: 6px;
    background: var(--gx-amber-soft);
    color: var(--gx-amber);
    font-size: 11px;
    font-weight: 600;
  }

  .exceed-badge--block {
    background: var(--gx-org-danger-bg);
    color: var(--gx-org-danger);
  }

  .progress-stack {
    height: 10px;
    overflow: hidden;
    border-radius: 5px;
    background: var(--gx-org-track);
    display: flex;
    align-self: stretch;
    flex-shrink: 0;
  }

  .progress-stack__used {
    background: var(--gx-org-used);
    flex-shrink: 0;
  }

  .progress-stack__dist {
    background: var(--gx-org-dist);
    flex-shrink: 0;
  }

  .legend {
    display: flex;
    gap: 24px;
    align-items: center;
    align-self: stretch;
    flex-wrap: wrap;
  }

  .legend-item {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .legend-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .legend-dot--used {
    background: var(--gx-org-used);
  }

  .legend-dot--dist {
    background: var(--gx-org-dist);
  }

  .legend-dot--avail {
    background: var(--gx-hair);
  }

  .legend-label {
    font-weight: 400;
    font-size: 12px;
    line-height: 100%;
    color: var(--gx-slate-500);
    white-space: nowrap;
  }

  /* ---------------- sub-department budgets ---------------- */
  .card-block {
    border-radius: 12px;
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 20px;
    align-items: flex-start;
    align-self: stretch;
  }

  .subdept-row {
    min-height: 58px;
    border-radius: 8px;
    background: var(--gx-org-track);
    display: flex;
    padding: 12px;
    gap: 12px;
    justify-content: space-between;
    align-items: center;
    align-self: stretch;
    flex-wrap: wrap;
  }

  .subdept-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .subdept-name {
    font-weight: 600;
    font-size: 13px;
    line-height: 100%;
    color: var(--gx-slate-900);
  }

  .subdept-alloc {
    font-weight: 400;
    font-size: 12px;
    line-height: 100%;
    color: var(--gx-slate-500);
  }

  .subdept-meter {
    display: flex;
    gap: 12px;
    align-items: center;
    flex-shrink: 0;
  }

  .meter-track {
    width: 120px;
    height: 6px;
    overflow: hidden;
    border-radius: 3px;
    background: var(--gx-hair);
    display: flex;
    flex-shrink: 0;
  }

  .meter-fill {
    background: var(--gx-org-used);
  }

  .meter-fill.warning {
    background: var(--gx-org-warn);
  }

  .meter-fill.danger {
    background: var(--gx-org-danger);
  }

  .subdept-value {
    font-weight: 600;
    font-size: 13px;
    line-height: 100%;
    color: var(--gx-slate-900);
    white-space: nowrap;
  }

  /* ---------------- edit budget modal ---------------- */
  .budget-form {
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 20px;
    font-family: var(--gx-font);
  }

  .form-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 16px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .form-group label {
    font-size: 12px;
    font-weight: 600;
    color: var(--gx-slate-500);
  }

  .form-actions,
  .confirmation-actions {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
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

  .btn-primary:hover:not(:disabled) {
    background: var(--gx-org-brand-hover);
    transform: none;
  }

  .btn-primary:disabled,
  .btn-secondary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-primary.danger {
    background: var(--gx-org-danger);
  }

  .btn-primary.danger:hover:not(:disabled) {
    background: var(--gx-org-danger-hover);
  }

  .save-confirmation {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .confirmation-message h4 {
    margin: 0 0 8px 0;
    font-size: 15px;
    font-weight: 700;
    color: var(--gx-slate-900);
  }

  .confirmation-message p {
    margin: 0 0 12px 0;
    font-size: 13px;
    color: var(--gx-slate-500);
  }

  .confirmation-details {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 16px;
    border-radius: 8px;
    background: var(--gx-org-track);
  }

  .detail-row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 13px;
  }

  .detail-label {
    color: var(--gx-slate-500);
  }

  .detail-value {
    font-weight: 600;
    color: var(--gx-slate-900);
  }
</style>
