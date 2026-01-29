<script lang="ts">
  import { onMount } from 'svelte';
  import AdminPanelCard from '../AdminPanelCard.svelte';
  import LoadingSpinner from "../LoadingSpinner.svelte";
  import { getDepartmentAnalytics, type GetDepartmentAnalyticsParams } from '$lib/api/admin/analytics.js';
  import type { DepartmentAnalyticsItem } from '../../types.js';
  import { toast } from "$lib/components/Toaster.svelte";
  import { _ } from 'svelte-i18n';
  import { formatNumber } from '$lib/utils/format.js';

  interface Props {
    startDate: string;
    endDate: string;
    onRefresh?: (callback: () => Promise<void>) => void;
  }

  let { startDate, endDate, onRefresh }: Props = $props();

  let isLoading = $state(true);
  let departments = $state<DepartmentAnalyticsItem[]>([]);
  let total = $state(0);
  let currentPage = $state(0);
  let pageSize = $state(20);
  let totalPages = $state(0);
  let searchQuery = $state('');
  const pageSizeOptions = [10, 20, 50, 100];
  let pendingDate : {startDate: string, endDate: string} | null = null;

  // Track if this is the first run to skip initial mount
  let isInitialLoadCompleted = $state(false);

  async function fetchDepartmentAnalytics(newStartDate: string = startDate, newEndDate: string = endDate) { 
    isLoading = true;
    pendingDate = {startDate: newStartDate, endDate: newEndDate};

    try {
      const params: GetDepartmentAnalyticsParams = {
        start_date: newStartDate,
        end_date: newEndDate,
        offset: currentPage * pageSize,
        limit: pageSize,
        search: searchQuery.trim() || undefined
      };

      const response = await getDepartmentAnalytics(params);
      departments = response.departments;
      total = response.total;
      totalPages = response.total_pages;
    } catch (err: any) {
      const errorMessage = err?.message || err?.error;
      toast.error(errorMessage || $_('departmentAnalytics.errors.fetchFailed'));
      console.error('Department analytics fetch error:', err);
    } finally {
      isLoading = false;
      pendingDate = null;
      isInitialLoadCompleted = true;
    }
  }

  function handlePageChange(newPage: number) {
    currentPage = newPage;
    fetchDepartmentAnalytics();
  }

  function handlePageSizeChange() {
    currentPage = 0;
    fetchDepartmentAnalytics();
  }

  function formatCurrency(num: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(num);
  }

  function formatLatency(ms: number): string {
    return `${ms.toFixed(2)}ms`;
  }

  // Fetch data on mount
  onMount(() => {
    fetchDepartmentAnalytics();
    
    // Register refresh callback with parent
    if (onRefresh) {      
      onRefresh(async () => {
        if(isLoading) {
          return;
        }
        
        await fetchDepartmentAnalytics();
      });
    }
  });

  // Re-fetch when date range changes from parent
  $effect(() => {
    if (!startDate || !endDate) {
      return;
    }

    if(pendingDate && pendingDate.startDate === startDate && pendingDate.endDate === endDate) {
      return;
    }

    pendingDate = {startDate, endDate};

    const pendingDateUpdateTimer = setTimeout(() => {
      fetchDepartmentAnalytics(startDate, endDate);
    }, 1000);

    return () => {
      if (pendingDateUpdateTimer) {
        clearTimeout(pendingDateUpdateTimer);
      }
    };
  });

  // Auto-search when search query changes (with 200ms debounce)
  $effect(() => {
    if (!isInitialLoadCompleted || searchQuery === null || searchQuery === undefined) {
      return;
    }

    // Debounce the search
    const searchTimer = setTimeout(() => {
      currentPage = 0;
      fetchDepartmentAnalytics();
    }, 300);

    return () => {
      clearTimeout(searchTimer);
    };
  });
</script>

<div class="department-analytics-tab">
  {#if isLoading && !isInitialLoadCompleted}
    <div class="loading-container">
      <LoadingSpinner />
    </div>
  {:else}
    <div class="analytics-content">
      <!-- Filters Section -->
      <AdminPanelCard>
        <div class="filters-section">
          <div class="filters-row">
            <div class="filter-group">
              <label for="search">{$_('departmentAnalytics.filters.search')}</label>
              <input
                id="search"
                type="text"
                bind:value={searchQuery}
                placeholder={$_('departmentAnalytics.filters.searchPlaceholder')}
                class="search-input"
              />
            </div>

            <div class="filter-group">
              <label for="page-size">{$_('departmentAnalytics.filters.perPage')}</label>
              <select
                id="page-size"
                bind:value={pageSize}
                onchange={handlePageSizeChange}
                class="select-input"
              >
                {#each pageSizeOptions as size}
                  <option value={size}>{formatNumber(size)}</option>
                {/each}
              </select>
            </div>
          </div>

          <div class="stats-row">
            <div class="stat-item">
              <span class="stat-label">{$_('departmentAnalytics.stats.totalDepartments')}:</span>
              <span class="stat-value">{formatNumber(total)}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">{$_('departmentAnalytics.stats.showing')}:</span>
              <span class="stat-value">{$_('departmentAnalytics.stats.showingCount', { values: { showing: departments.length, total } })}</span>
            </div>
          </div>
        </div>
      </AdminPanelCard>

      <!-- Table Section -->
      <AdminPanelCard padded={false}>
        <div class="table-container">
          <table class="analytics-table">
            <thead>
              <tr>
                <th>{$_('departmentAnalytics.table.department')}</th>
                <th class="numeric">{$_('departmentAnalytics.table.users')}</th>
                <th class="numeric">{$_('departmentAnalytics.table.requests')}</th>
                <th class="numeric">{$_('departmentAnalytics.table.success')}</th>
                <th class="numeric">{$_('departmentAnalytics.table.errors')}</th>
                <th class="numeric">{$_('departmentAnalytics.table.tokens')}</th>
                <th class="numeric">{$_('departmentAnalytics.table.cost')}</th>
                <th class="numeric">{$_('departmentAnalytics.table.avgLatency')}</th>
              </tr>
            </thead>
            <tbody>
              {#if departments.length === 0}
                <tr>
                  <td colspan="8" class="empty-state">
                    {#if searchQuery}
                      {$_('departmentAnalytics.emptyState.noMatch', { values: { query: searchQuery } })}
                    {:else}
                      {$_('departmentAnalytics.emptyState.noData')}
                    {/if}
                  </td>
                </tr>
              {:else}
                {#each departments as department, index (`${department.department}-${index}`)}
                  <tr>
                    <td class="department-name">{department.department || '-'}</td>
                    <td class="numeric">{formatNumber(department.total_users)}</td>
                    <td class="numeric">{formatNumber(department.total_requests)}</td>
                    <td class="numeric success">{formatNumber(department.success_count)}</td>
                    <td class="numeric error">{formatNumber(department.error_count)}</td>
                    <td class="numeric">{formatNumber(department.total_tokens)}</td>
                    <td class="numeric cost">{formatCurrency(department.total_cost)}</td>
                    <td class="numeric">{formatLatency(department.average_latency)}</td>
                  </tr>
                {/each}
              {/if}
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        {#if totalPages > 1}
          <div class="pagination">
            <button
              class="pagination-btn"
              disabled={currentPage === 0}
              onclick={() => handlePageChange(currentPage - 1)}
            >
              {$_('departmentAnalytics.pagination.previous')}
            </button>

            <span class="pagination-info">
              {$_('departmentAnalytics.pagination.pageInfo', { values: { current: currentPage + 1, total: totalPages } })}
            </span>

            <button
              class="pagination-btn"
              disabled={currentPage >= totalPages - 1}
              onclick={() => handlePageChange(currentPage + 1)}
            >
              {$_('departmentAnalytics.pagination.next')}
            </button>
          </div>
        {/if}
      </AdminPanelCard>
    </div>
  {/if}
</div>

<style>
  .department-analytics-tab {
    margin-top: var(--space-lg);
  }

  .loading-container {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 400px;
  }

  .analytics-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-xl);
  }

  .filters-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .filters-row {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: var(--space-lg);
  }

  .filter-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .filter-group label {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-secondary);
  }

  .search-input,
  .select-input {
    padding: 0.625rem 0.875rem;
    background: var(--btn-secondary);
    border: 1px solid var(--glass-stroke-dark);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: 0.9375rem;
    transition: all 0.2s ease;
  }

  .search-input:focus,
  .select-input:focus {
    outline: none;
    border-color: var(--brand);
    background: var(--btn-tertiary);
  }

  .stats-row {
    display: flex;
    gap: var(--space-2xl);
    padding-top: var(--space-md);
    border-top: 1px solid var(--glass-stroke-dark);
  }

  .stat-item {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .stat-label {
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .stat-value {
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .table-container {
    overflow-x: auto;
  }

  .analytics-table {
    width: 100%;
    border-collapse: collapse;
  }

  .analytics-table thead {
    background: var(--btn-secondary);
    border-bottom: 2px solid var(--glass-stroke-dark);
  }

  .analytics-table th {
    padding: var(--space-lg) var(--space-md);
    text-align: left;
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    white-space: nowrap;
  }

  .analytics-table th.numeric {
    text-align: right;
  }

  .analytics-table tbody tr {
    border-bottom: 1px solid var(--glass-stroke-dark);
    transition: background-color 0.2s ease;
  }

  .analytics-table tbody tr:hover {
    background: var(--btn-tertiary);
  }

  .analytics-table td {
    padding: var(--space-md);
    font-size: 0.9375rem;
    color: var(--text-primary);
  }

  .analytics-table td.numeric {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .analytics-table td.department-name {
    font-weight: 600;
  }

  .analytics-table td.success {
    color: var(--brand-green);
  }

  .analytics-table td.error {
    color: var(--brand-red);
  }

  .analytics-table td.cost {
    font-weight: 600;
    color: var(--brand);
  }

  .analytics-table td.empty-state {
    text-align: center;
    padding: var(--space-3xl);
    color: var(--text-secondary);
    font-style: italic;
  }

  .pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-lg);
    padding: var(--space-xl);
    border-top: 1px solid var(--glass-stroke-dark);
  }

  .pagination-btn {
    padding: 0.5rem 1rem;
    background: var(--btn-secondary);
    border: 1px solid var(--glass-stroke-dark);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .pagination-btn:hover:not(:disabled) {
    background: var(--btn-tertiary);
    border-color: var(--brand);
  }

  .pagination-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .pagination-info {
    font-size: 0.875rem;
    color: var(--text-secondary);
    min-width: 120px;
    text-align: center;
  }

  @media (max-width: 768px) {
    .filters-row {
      grid-template-columns: 1fr;
    }

    .stats-row {
      flex-direction: column;
      gap: var(--space-md);
    }

    .table-container {
      overflow-x: scroll;
    }

    .analytics-table {
      min-width: 900px;
    }
  }
</style>
