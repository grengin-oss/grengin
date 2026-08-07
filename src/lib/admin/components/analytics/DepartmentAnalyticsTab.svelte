<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { onMount } from 'svelte';
  import AdminPanelCard from '../AdminPanelCard.svelte';
  import LoadingSpinner from "../LoadingSpinner.svelte";
  import { getDepartmentAnalytics, type GetDepartmentAnalyticsParams } from '$lib/api/admin/analytics.js';
  import type { DepartmentAnalyticsItem } from '../../types.js';
  import { toast } from "$lib/components/Toaster.svelte";
  import { _ } from 'svelte-i18n';
  import { formatNumber } from '$lib/utils/format.js';

  /** null = server default: updated_at (not shown in table) */
  type NameSort = 'asc' | 'desc' | null;

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
  let nameSort = $state<NameSort>(null);
  let pendingDate : {startDate: string, endDate: string} | null = null;
  let isInitialLoadCompleted = $state(false);
  let latestRequestId = 0;

  async function fetchDepartmentAnalytics(newStartDate: string = startDate, newEndDate: string = endDate) {
    const requestId = ++latestRequestId;
    isLoading = true;
    pendingDate = {startDate: newStartDate, endDate: newEndDate};

    try {
      const params: GetDepartmentAnalyticsParams = {
        start_date: newStartDate,
        end_date: newEndDate,
        offset: currentPage * pageSize,
        limit: pageSize,
        search: searchQuery.trim() || undefined,
        ...(nameSort !== null
          ? { sort: 'name' as const, ascending: nameSort === 'asc' }
          : { sort: 'updated_at' as const, ascending: false })
      };

      const response = await getDepartmentAnalytics(params);
      if (requestId !== latestRequestId) return;
      departments = response.departments;
      total = response.total;
      totalPages = response.total_pages;
    } catch (err: any) {
      if (requestId !== latestRequestId) return;
      const errorMessage = err?.message || err?.error;
      toast.error(errorMessage || $_('departmentAnalytics.errors.fetchFailed'));
      console.error('Department analytics fetch error:', err);
    } finally {
      if (requestId !== latestRequestId) return;
      isLoading = false;
      pendingDate = null;
      isInitialLoadCompleted = true;
    }
  }

  function handleDepartmentNameSort() {
    if (nameSort === null) {
      nameSort = 'desc';
    } else if (nameSort === 'desc') {
      nameSort = 'asc';
    } else {
      nameSort = null;
    }
    currentPage = 0;
    fetchDepartmentAnalytics();
  }

  function handlePageChange(newPage: number) {
    currentPage = newPage;
    fetchDepartmentAnalytics();
  }

  function handlePageSizeChange(event: Event) {
    const target = event.currentTarget as HTMLSelectElement;
    pageSize = Number(target.value);
    currentPage = 0;
    fetchDepartmentAnalytics();
  }

  function clearSearch() {
    if (!searchQuery) return;
    searchQuery = '';
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

  function ariaSortForDepartment(): 'ascending' | 'descending' | 'none' {
    if (nameSort === null) return 'none';
    return nameSort === 'asc' ? 'ascending' : 'descending';
  }

  onMount(() => {
    fetchDepartmentAnalytics();

    if (onRefresh) {
      onRefresh(async () => {
        if (isLoading) {
          return;
        }

        await fetchDepartmentAnalytics();
      });
    }
  });

  $effect(() => {
    if (!startDate || !endDate) {
      return;
    }

    if (pendingDate && pendingDate.startDate === startDate && pendingDate.endDate === endDate) {
      return;
    }

    pendingDate = {startDate, endDate};

    const pendingDateUpdateTimer = setTimeout(() => {
      currentPage = 0;
      fetchDepartmentAnalytics(startDate, endDate);
    }, 1000);

    return () => {
      if (pendingDateUpdateTimer) {
        clearTimeout(pendingDateUpdateTimer);
      }
    };
  });

  $effect(() => {
    if (!isInitialLoadCompleted || searchQuery === null || searchQuery === undefined) {
      return;
    }

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
  {#if isLoading && departments.length === 0}
    <div class="loading-container" role="status" aria-live="polite" aria-busy="true">
      <LoadingSpinner />
    </div>
  {:else}
    <div class="analytics-content">
      <AdminPanelCard>
        <div class="filters-section">
          <div class="filters-row">
            <div class="filter-group">
              <label for="dept-analytics-search">{$_('departmentAnalytics.filters.search')}</label>
              <div class="search-input-wrap">
                <input
                  id="dept-analytics-search"
                  type="search"
                  bind:value={searchQuery}
                  placeholder={$_('departmentAnalytics.filters.searchPlaceholder')}
                  class="search-input"
                  autocomplete="off"
                />
                {#if searchQuery}
                  <button
                    type="button"
                    class="search-clear-btn"
                    onclick={clearSearch}
                    aria-label={$_('common.clear')}
                    title={$_('common.clear')}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      aria-hidden="true"
                      class="search-clear-icon"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                {/if}
              </div>
            </div>

            <div class="filter-group">
              <label for="dept-analytics-page-size">{$_('departmentAnalytics.filters.perPage')}</label>
              <select
                id="dept-analytics-page-size"
                bind:value={pageSize}
                onchange={handlePageSizeChange}
                class="select-input"
              >
                <option value={10}>{formatNumber(10)}</option>
                <option value={20}>{formatNumber(20)}</option>
                <option value={50}>{formatNumber(50)}</option>
                <option value={100}>{formatNumber(100)}</option>
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

      <AdminPanelCard padded={false}>
        <div class="table-container">
          <table class="analytics-table">
            <caption class="sr-only">{$_('analytics.aria.departmentTableCaption')}</caption>
            <thead>
              <tr>
                <th scope="col" class="sortable col-department" aria-sort={ariaSortForDepartment()}>
                  <button type="button" class="sort-header-btn" onclick={handleDepartmentNameSort}>
                    <span class="th-content">
                      {$_('departmentAnalytics.table.department')}
                      {@render nameSortGlyph()}
                    </span>
                  </button>
                </th>
                <th scope="col" class="numeric col-plain">{$_('departmentAnalytics.table.users')}</th>
                <th scope="col" class="numeric col-plain">{$_('departmentAnalytics.table.requests')}</th>
                <th scope="col" class="numeric col-plain">{$_('departmentAnalytics.table.success')}</th>
                <th scope="col" class="numeric col-plain">{$_('departmentAnalytics.table.errors')}</th>
                <th scope="col" class="numeric col-plain">{$_('departmentAnalytics.table.tokens')}</th>
                <th scope="col" class="numeric col-plain">{$_('departmentAnalytics.table.cost')}</th>
                <th scope="col" class="numeric col-plain">{$_('departmentAnalytics.table.avgLatency')}</th>
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

        {#if totalPages > 1}
          <nav class="pagination" aria-label={$_('analytics.aria.pagination')}>
            <button
              type="button"
              class="pagination-btn"
              disabled={currentPage === 0}
              onclick={() => handlePageChange(currentPage - 1)}
            >
              {$_('departmentAnalytics.pagination.previous')}
            </button>

            <span class="pagination-info" aria-live="polite">
              {$_('departmentAnalytics.pagination.pageInfo', { values: { current: currentPage + 1, total: totalPages } })}
            </span>

            <button
              type="button"
              class="pagination-btn"
              disabled={currentPage >= totalPages - 1}
              onclick={() => handlePageChange(currentPage + 1)}
            >
              {$_('departmentAnalytics.pagination.next')}
            </button>
          </nav>
        {/if}
      </AdminPanelCard>
    </div>

    {#snippet nameSortGlyph()}
      <span class="sort-icon" class:sort-icon-active={nameSort !== null} aria-hidden="true">
        {#if nameSort !== null}
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 320 512" class="sort-svg">
            {#if nameSort === 'asc'}
              <path fill="currentColor" d="M279 224H41c-21.4 0-32.1-25.9-17-41L143 64c9.4-9.4 24.6-9.4 33.9 0l119 119c15.2 15.1 4.5 41-16.9 41"/>
            {:else}
              <path fill="currentColor" d="M41 288h238c21.4 0 32.1 25.9 17 41L177 448c-9.4 9.4-24.6 9.4-33.9 0L24 329c-15.1-15.1-4.4-41 17-41"/>
            {/if}
          </svg>
        {:else}
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 1024 1408" class="sort-svg sort-svg-unsorted">
            <path fill="currentColor" d="M1024 896q0 26-19 45l-448 448q-19 19-45 19t-45-19L19 941Q0 922 0 896t19-45t45-19h896q26 0 45 19t19 45m0-384q0 26-19 45t-45 19H64q-26 0-45-19T0 512t19-45L467 19q19-19 45-19t45 19l448 448q19 19 19 45"/>
          </svg>
        {/if}
      </span>
    {/snippet}
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
    grid-template-columns: 1fr auto;
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

  .search-input-wrap {
    position: relative;
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

  .search-input:focus-visible,
  .select-input:focus-visible {
    outline: 2px solid var(--brand-ring);
    outline-offset: 2px;
  }

  .search-input-wrap .search-input {
    padding-right: 2.5rem;
  }

  .search-input::-webkit-search-cancel-button,
  .search-input::-webkit-search-decoration {
    -webkit-appearance: none;
    appearance: none;
  }

  .search-input::-ms-clear,
  .search-input::-ms-reveal {
    display: none;
    width: 0;
    height: 0;
  }

  .search-clear-btn {
    position: absolute;
    top: 50%;
    right: 0.5rem;
    transform: translateY(-50%);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s ease;
    padding: 0.25rem;
    box-shadow: 0 0 0 1px var(--glass-stroke-dark);
  }

  .search-clear-btn:hover {
    color: var(--text-primary);
    background: rgba(var(--glass-tint), 0.08);
  }

  .search-clear-btn:focus-visible {
    outline: 2px solid var(--brand-ring);
    outline-offset: 2px;
  }

  .search-clear-icon {
    width: 1rem;
    height: 1rem;
    display: block;
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
    border-bottom: 1px solid var(--glass-stroke-dark);
  }

  .analytics-table th {
    text-align: left;
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    white-space: nowrap;
    vertical-align: middle;
  }

  .analytics-table th.col-plain {
    padding: var(--space-md) var(--space-md);
  }

  .analytics-table th.numeric {
    text-align: right;
  }

  .sort-header-btn {
    display: inline-flex;
    align-items: center;
    width: 100%;
    margin: 0;
    padding: var(--space-md) var(--space-md);
    border: none;
    background: transparent;
    font: inherit;
    color: inherit;
    text-transform: inherit;
    letter-spacing: inherit;
    cursor: pointer;
    text-align: left;
    transition: color 0.15s ease;
  }

  .th-content {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
  }

  .sort-header-btn:hover {
    color: var(--text-primary);
  }

  .sort-header-btn:hover .sort-icon:not(.sort-icon-active) {
    opacity: 0.8;
    color: var(--brand);
  }

  .sort-header-btn:focus-visible {
    outline: 2px solid var(--brand-ring);
    outline-offset: 2px;
    border-radius: var(--radius-sm);
  }

  .sort-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
    color: var(--text-secondary);
    opacity: 0.5;
  }

  .sort-icon-active {
    opacity: 1;
    color: color-mix(in oklab, var(--brand) 85%, black);
  }

  .sort-svg {
    display: block;
  }

  .sort-svg-unsorted {
    width: 12px;
    height: 12px;
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

  .pagination-btn:focus-visible {
    outline: 2px solid var(--brand-ring);
    outline-offset: 2px;
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
