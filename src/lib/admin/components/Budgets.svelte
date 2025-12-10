<script lang="ts">
  import { onMount } from 'svelte';
  import AdminEmptyState from './AdminEmptyState.svelte';
  import AdminPanelCard from './AdminPanelCard.svelte';
  import AdminSectionHeader from './AdminSectionHeader.svelte';
  import AdminTableCard from './AdminTableCard.svelte';
  import LoadingSpinner from './LoadingSpinner.svelte';
  import Modal from './Modal.svelte';
  import { toast } from '../../components/Toaster.svelte';
  import type { Budget } from '../types.js';
  import { getBudgets, createBudget, updateBudget, deleteBudget } from '../../api/adminSettings.js';

  const scopeOptions = [
    { value: '', label: 'All Scopes' },
    { value: 'global', label: 'Global' },
    { value: 'user', label: 'User' },
    { value: 'provider', label: 'Provider' },
  ];

  const scopeFormOptions = [
    { value: 'global', label: 'Global' },
    { value: 'user', label: 'User' },
    { value: 'provider', label: 'Provider' },
  ];

  const periodOptions = [
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' },
  ];

  const actionOptions = [
    { value: 'warn', label: 'Warn' },
    { value: 'block', label: 'Block' },
  ];

  let budgets = $state<Budget[]>([]);
  let loading = $state(true);
  let showModal = $state(false);
  let editingBudget = $state<Budget | null>(null);
  let filterScope = $state('');

  let formData = $state({
    scope: 'global',
    scope_id: '',
    limit_amount: '',
    period: 'monthly',
    alert_thresholds: [50, 75, 90] as number[],
    action_on_exceed: 'warn',
    is_active: true,
  });

  let newThreshold = $state('');

  let filteredBudgets = $derived.by(() => {
    if (!filterScope) return budgets;
    return budgets.filter(b => b.scope === filterScope);
  });

  async function loadBudgets() {
    try {
      loading = true;
      budgets = await getBudgets();
    } catch (err: any) {
      toast.error(err.message || 'Failed to load budgets');
    } finally {
      loading = false;
    }
  }

  function openAddModal() {
    editingBudget = null;
    formData = {
      scope: 'global',
      scope_id: '',
      limit_amount: '',
      period: 'monthly',
      alert_thresholds: [50, 75, 90],
      action_on_exceed: 'warn',
      is_active: true,
    };
    newThreshold = '';
    showModal = true;
  }

  function openEditModal(budget: Budget) {
    editingBudget = budget;
    formData = {
      scope: budget.scope,
      scope_id: budget.scope_id || '',
      limit_amount: budget.limit_amount.toString(),
      period: budget.period,
      alert_thresholds: [...budget.alert_thresholds],
      action_on_exceed: budget.action_on_exceed,
      is_active: budget.is_active,
    };
    newThreshold = '';
    showModal = true;
  }

  function closeModal() {
    showModal = false;
    editingBudget = null;
  }

  async function handleSubmit() {
    try {
      const data = {
        scope: formData.scope,
        scope_id: formData.scope !== 'global' && formData.scope_id ? formData.scope_id : undefined,
        limit_amount: parseFloat(formData.limit_amount),
        period: formData.period,
        alert_thresholds: formData.alert_thresholds.sort((a, b) => a - b),
        action_on_exceed: formData.action_on_exceed,
        is_active: formData.is_active,
      };

      if (editingBudget) {
        await updateBudget(editingBudget.id, data);
      } else {
        await createBudget(data);
      }

      toast.success(editingBudget ? 'Budget updated' : 'Budget created');
      await loadBudgets();
      closeModal();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save budget');
    }
  }

  async function handleDelete(budgetId: string) {
    if (!confirm('Are you sure you want to delete this budget?')) {
      return;
    }
    try {
      await deleteBudget(budgetId);
      toast.success('Budget deleted');
      await loadBudgets();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete budget');
    }
  }

  async function toggleStatus(budget: Budget) {
    try {
      await updateBudget(budget.id, { is_active: !budget.is_active });
      await loadBudgets();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update budget status');
    }
  }

  function formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value);
  }

  function getUsagePercentage(budget: Budget): number {
    if (budget.limit_amount === 0) return 0;
    return Math.round((budget.current_spend / budget.limit_amount) * 100);
  }

  function getUsageColor(percentage: number): string {
    if (percentage >= 90) return 'var(--brand-red)';
    if (percentage >= 75) return '#f59e0b';
    return 'var(--brand-green)';
  }

  function getScopeLabel(scope: string): string {
    const option = scopeFormOptions.find(o => o.value === scope);
    return option?.label || scope;
  }

  function getPeriodLabel(period: string): string {
    const option = periodOptions.find(o => o.value === period);
    return option?.label || period;
  }

  function getActionLabel(action: string): string {
    const option = actionOptions.find(o => o.value === action);
    return option?.label || action;
  }

  function addThreshold() {
    const value = parseInt(newThreshold);
    if (value && value > 0 && value <= 100 && !formData.alert_thresholds.includes(value)) {
      formData.alert_thresholds = [...formData.alert_thresholds, value].sort((a, b) => a - b);
      newThreshold = '';
    }
  }

  function removeThreshold(value: number) {
    formData.alert_thresholds = formData.alert_thresholds.filter(t => t !== value);
  }

  function handleThresholdKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addThreshold();
    }
  }

  onMount(() => {
    loadBudgets();
  });
</script>

<div class="budgets-container">
  <AdminSectionHeader
    title="Budgets"
    subtitle="Manage monetary spending limits globally or for specific entities."
  >
    {#snippet actions()}
      <button class="btn-primary" onclick={openAddModal}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Create Budget
      </button>
    {/snippet}
  </AdminSectionHeader>

  <AdminPanelCard>
    <div class="filter-row">
      <div class="filter-group">
        <label for="filter-scope">Filter Scope</label>
        <select id="filter-scope" bind:value={filterScope}>
          {#each scopeOptions as option}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
      </div>
    </div>
  </AdminPanelCard>

  {#if loading}
    <AdminPanelCard>
      <LoadingSpinner text="Loading budgets..." />
    </AdminPanelCard>
  {:else if filteredBudgets.length === 0}
    <AdminPanelCard>
      <AdminEmptyState
        title={filterScope ? `No budgets for ${getScopeLabel(filterScope)}` : 'No budgets configured'}
        message="Create a budget to control spend."
      >
        {#snippet icon()}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="1" x2="12" y2="23" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
        {/snippet}
        {#snippet actions()}
          <button class="btn-primary" onclick={openAddModal}>
            Create Your First Budget
          </button>
        {/snippet}
      </AdminEmptyState>
    </AdminPanelCard>
  {:else}
    <AdminTableCard minWidth="1040px">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Scope</th>
            <th>Scope ID</th>
            <th>Limit</th>
            <th>Period</th>
            <th>Spend</th>
            <th>Usage</th>
            <th>Action on Exceed</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each filteredBudgets as budget (budget.id)}
            {@const percentage = getUsagePercentage(budget)}
            <tr>
              <td class="scope-cell">
                <span class="scope-label">{getScopeLabel(budget.scope)}</span>
              </td>
              <td class="scope-id-cell">
                <span class="scope-id-text">{budget.scope_id || '-'}</span>
              </td>
              <td class="amount-cell">
                {formatCurrency(budget.limit_amount)}
              </td>
              <td class="period-cell">
                {getPeriodLabel(budget.period)}
              </td>
              <td class="amount-cell">
                {formatCurrency(budget.current_spend)}
              </td>
              <td class="usage-cell">
                <div class="usage-bar-wrapper">
                  <div
                    class="usage-bar"
                    style="width: {Math.min(percentage, 100)}%; background-color: {getUsageColor(percentage)};"
                  >
                    <span class="usage-label">{percentage}%</span>
                  </div>
                </div>
              </td>
              <td class="action-cell">
                {getActionLabel(budget.action_on_exceed)}
              </td>
              <td>
                <button
                  class="status-toggle"
                  class:active={budget.is_active}
                  onclick={() => toggleStatus(budget)}
                  aria-label={budget.is_active ? 'Active' : 'Inactive'}
                >
                  <span class="toggle-label">{budget.is_active ? 'ON' : 'OFF'}</span>
                  <span class="toggle-slider"></span>
                </button>
              </td>
              <td>
                <div class="actions">
                  <button
                    class="action-btn edit-btn"
                    onclick={() => openEditModal(budget)}
                    aria-label="Edit budget"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                  <button
                    class="action-btn delete-btn"
                    onclick={() => handleDelete(budget.id)}
                    aria-label="Delete budget"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </AdminTableCard>
  {/if}
</div>

<Modal
  bind:isOpen={showModal}
  title={editingBudget ? 'Edit Budget' : 'Create Budget'}
  onclose={closeModal}
>
  {#snippet children()}
    <form class="budget-form" onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
      <div class="form-row">
        <div class="form-group">
          <label for="scope">Scope</label>
          <select
            id="scope"
            bind:value={formData.scope}
            disabled={!!editingBudget}
            required
          >
            {#each scopeFormOptions as option}
              <option value={option.value}>{option.label}</option>
            {/each}
          </select>
        </div>

        <div class="form-group">
          <label for="scope_id">
            Scope ID {#if formData.scope !== 'global'}<span class="required">*</span>{/if}
          </label>
          <input
            type="text"
            id="scope_id"
            bind:value={formData.scope_id}
            placeholder={formData.scope === 'global' ? '-' : formData.scope === 'user' ? 'e.g., user@example.com' : 'e.g., openai'}
            disabled={formData.scope === 'global'}
            required={formData.scope !== 'global'}
          />
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="limit_amount">
            Limit Amount ($) <span class="required">*</span>
          </label>
          <input
            type="number"
            id="limit_amount"
            bind:value={formData.limit_amount}
            placeholder="e.g., 1000"
            min="0"
            step="0.01"
            required
          />
        </div>

        <div class="form-group">
          <label for="period">
            Period <span class="required">*</span>
          </label>
          <select id="period" bind:value={formData.period} required>
            {#each periodOptions as option}
              <option value={option.value}>{option.label}</option>
            {/each}
          </select>
        </div>
      </div>

      <div class="form-group">
        <label for="alert_thresholds">
          Alert Thresholds (%) <span class="required">*</span>
        </label>
        <div class="thresholds-container">
          <div class="threshold-tags">
            {#each formData.alert_thresholds as threshold}
              <span class="threshold-tag">
                {threshold}%
                <button
                  type="button"
                  class="threshold-remove"
                  onclick={() => removeThreshold(threshold)}
                  aria-label="Remove threshold"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </span>
            {/each}
            <input
              type="number"
              class="threshold-input"
              bind:value={newThreshold}
              onkeydown={handleThresholdKeydown}
              placeholder="Add more"
              min="1"
              max="100"
            />
          </div>
          <button
            type="button"
            class="clear-thresholds"
            onclick={() => formData.alert_thresholds = []}
            aria-label="Clear all thresholds"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>

      <div class="form-group">
        <label for="action_on_exceed">Action on Exceed</label>
        <select id="action_on_exceed" bind:value={formData.action_on_exceed}>
          {#each actionOptions as option}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
      </div>

      <div class="form-group">
        <label for="status">Status</label>
        <div class="status-toggle-wrapper">
          <button
            type="button"
            class="status-toggle"
            class:active={formData.is_active}
            onclick={() => formData.is_active = !formData.is_active}
            aria-label={formData.is_active ? 'Active' : 'Inactive'}
          >
            <span class="toggle-label">{formData.is_active ? 'ON' : 'OFF'}</span>
            <span class="toggle-slider"></span>
          </button>
          <span class="status-label">- {formData.is_active ? 'Active' : 'Inactive'}</span>
        </div>
      </div>

      <div class="form-actions">
        <button type="button" class="btn-secondary" onclick={closeModal}>
          Cancel
        </button>
        <button type="submit" class="btn-primary">
          {editingBudget ? 'Save Changes' : 'Create'}
        </button>
      </div>
    </form>
  {/snippet}
</Modal>

<style>
  .budgets-container {
    display: flex;
    flex-direction: column;
    gap: var(--space-xl);
  }

  .filter-row {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-md);
  }

  .filter-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .filter-group label {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-secondary);
  }

  .filter-group select {
    padding: var(--space-sm) var(--space-md);
    padding-right: var(--space-2xl);
    background: rgba(var(--glass-tint), 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: 0.875rem;
    cursor: pointer;
    min-width: 10rem;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 0.75rem center;
  }

  .filter-group select:focus {
    outline: none;
    border-color: var(--brand);
  }

  .scope-cell {
    font-weight: 500;
  }

  .scope-label {
    font-size: 0.9375rem;
    color: var(--text-primary);
    text-transform: capitalize;
  }

  .scope-id-cell {
    font-family: 'Courier New', monospace;
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .scope-id-text {
    display: inline-block;
    max-width: 10rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .amount-cell {
    font-family: 'Courier New', monospace;
    font-size: 0.875rem;
    color: var(--text-primary);
  }

  .period-cell {
    text-transform: capitalize;
    font-size: 0.875rem;
  }

  .usage-cell {
    min-width: 8rem;
  }

  .usage-bar-wrapper {
    width: 100%;
    height: 1.5rem;
    background: rgba(var(--glass-tint), 0.1);
    border-radius: var(--radius-sm);
    overflow: hidden;
    position: relative;
  }

  .usage-bar {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: width 0.3s ease;
    min-width: 2.5rem;
  }

  .usage-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: white;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  }

  .action-cell {
    text-transform: capitalize;
    font-size: 0.875rem;
  }

  .status-toggle {
    position: relative;
    display: inline-flex;
    align-items: center;
    width: 3.5rem;
    height: 1.5rem;
    background: rgba(255, 255, 255, 0.1);
    border: none;
    border-radius: 0.75rem;
    cursor: pointer;
    transition: background 0.2s ease;
    margin-right: var(--space-sm);
    padding-left: 0.25rem;
  }

  .status-toggle.active {
    background: var(--brand-green);
  }

  .toggle-label {
    font-size: 0.625rem;
    font-weight: 700;
    color: white;
    z-index: 1;
    margin-left: 0.125rem;
  }

  .toggle-slider {
    position: absolute;
    top: 0.125rem;
    left: 0.125rem;
    width: 1.25rem;
    height: 1.25rem;
    background: white;
    border-radius: 50%;
    transition: transform 0.2s ease;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .status-toggle.active .toggle-slider {
    transform: translateX(2rem);
  }

  .status-toggle.active .toggle-label {
    margin-left: 0.125rem;
  }

  .actions {
    display: flex;
    gap: var(--space-sm);
  }

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    padding: 0;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .action-btn svg {
    width: 1rem;
    height: 1rem;
  }

  .edit-btn {
    background: rgba(var(--brand-rgb), 0.1);
    color: var(--brand);
  }

  .edit-btn:hover {
    background: rgba(var(--brand-rgb), 0.2);
  }

  .delete-btn {
    background: rgba(var(--brand-red-rgb), 0.1);
    color: var(--brand-red);
  }

  .delete-btn:hover {
    background: rgba(var(--brand-red-rgb), 0.2);
  }

  .budget-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-lg);
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .form-group label {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .form-group .required {
    color: var(--brand-red);
    font-weight: 400;
  }

  .form-group input,
  .form-group select {
    padding: var(--space-md);
    background: rgba(var(--glass-tint), 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: 0.9375rem;
    transition: all 0.2s ease;
  }

  .form-group input:focus,
  .form-group select:focus {
    outline: none;
    border-color: var(--brand);
    background: rgba(var(--glass-tint), 0.05);
  }

  .form-group input::placeholder {
    color: var(--text-secondary);
    opacity: 0.5;
  }

  .form-group input:disabled,
  .form-group select:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .thresholds-container {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm);
    background: rgba(var(--glass-tint), 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-md);
  }

  .threshold-tags {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-sm);
    flex: 1;
  }

  .threshold-tag {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    background: var(--brand-green);
    color: white;
    border-radius: var(--radius-sm);
    font-size: 0.8125rem;
    font-weight: 500;
  }

  .threshold-remove {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1rem;
    height: 1rem;
    padding: 0;
    background: none;
    border: none;
    color: white;
    cursor: pointer;
    opacity: 0.7;
    transition: opacity 0.2s;
  }

  .threshold-remove:hover {
    opacity: 1;
  }

  .threshold-remove svg {
    width: 0.75rem;
    height: 0.75rem;
  }

  .threshold-input {
    flex: 1;
    min-width: 5rem;
    padding: 0.25rem 0.5rem !important;
    background: transparent !important;
    border: none !important;
    font-size: 0.875rem;
  }

  .threshold-input:focus {
    outline: none;
  }

  .clear-thresholds {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    padding: 0;
    background: none;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    opacity: 0.5;
    transition: opacity 0.2s;
  }

  .clear-thresholds:hover {
    opacity: 1;
  }

  .clear-thresholds svg {
    width: 1rem;
    height: 1rem;
  }

  .status-toggle-wrapper {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .status-label {
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-md);
    margin-top: var(--space-lg);
    padding-top: var(--space-lg);
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  @media (max-width: 768px) {
    .filter-row {
      justify-content: flex-start;
    }

    .form-row {
      grid-template-columns: 1fr;
    }

    .form-actions {
      flex-direction: column-reverse;
    }

    .form-actions button {
      width: 100%;
    }
  }
</style>
