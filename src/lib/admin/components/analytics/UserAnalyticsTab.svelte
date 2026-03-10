<script lang="ts">
  import { onMount } from 'svelte';
  import AdminPanelCard from '../AdminPanelCard.svelte';
  import LoadingSpinner from "../LoadingSpinner.svelte";
  import { getUserAnalytics, type GetUserAnalyticsParams } from '$lib/api/admin/analytics.js';
  import type { UserAnalyticsItem } from '../../types.js';
  import { toast } from "$lib/components/Toaster.svelte";
  import { _ } from 'svelte-i18n';
  import { formatDate } from '$lib/utils/format.js';

  interface Props {
    startDate: string;
    endDate: string;
    onRefresh?: (callback: () => Promise<void>) => void;
  }

  let { startDate, endDate, onRefresh }: Props = $props();

  let isLoading = $state(true);
  let users = $state<UserAnalyticsItem[]>([]);
  let total = $state(0);
  let currentPage = $state(0);
  let pageSize = $state(20);
  let totalPages = $state(0);

  // Sorting & filtering
  let sortBy = $state<
    | 'name'
    | 'email'
    | 'totalRequests'
    | 'totalTokens'
    | 'totalCost'
    | 'averageLatency'
    | 'lastActivity'
  >('totalRequests');
  let sortOrder = $state<'asc' | 'desc'>('desc');
  let searchQuery = $state('');
  let pendingDate : {startDate: string, endDate: string} | null = null;
  let isInitialLoadCompleted = $state(false);

  async function fetchUserAnalytics(newStartDate: string = startDate, newEndDate: string = endDate) {    
    isLoading = true;
    pendingDate = {startDate: newStartDate, endDate: newEndDate};

    try {
      const params: GetUserAnalyticsParams = {
        start_date: newStartDate,
        end_date: newEndDate,
        page: currentPage,
        limit: pageSize,
        sort_by: sortBy,
        order: sortOrder,
        search: searchQuery.trim() || undefined
      };

      const response = await getUserAnalytics(params);
      users = response.users;
      total = response.total;
      totalPages = response.total_pages;
      currentPage = response.page;
    } catch (err: any) {
      const errorMessage = err?.message || err?.error;
      toast.error(errorMessage || $_('userAnalytics.errors.fetchFailed'));
      console.error('User analytics fetch error:', err);
    } finally {
      isLoading = false;
      pendingDate = null;
      isInitialLoadCompleted = true;
    }
  }

  function handleSort(column: typeof sortBy) {
    if (sortBy === column) {
      sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      sortBy = column;
      sortOrder = 'desc';
    }
    currentPage = 0;
    fetchUserAnalytics();
  }

  function handlePageChange(newPage: number) {
    currentPage = newPage;
    fetchUserAnalytics();
  }

  function handlePageSizeChange() {
    currentPage = 0;
    fetchUserAnalytics();
  }

  function formatNumber(num: number): string {
    return new Intl.NumberFormat('en-US').format(num);
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

  function formatDateTime(dateString: string | null | undefined): string {
    return formatDate(dateString, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }, $_('common.never'));
  }

  // Fetch data on mount and when date range changes
  onMount(() => {
    fetchUserAnalytics();
    
    // Register refresh callback with parent
    if (onRefresh) {
      onRefresh(async () => {
        if(isLoading) {
          return;
        }
        
        await fetchUserAnalytics();
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
      currentPage = 0;
      fetchUserAnalytics(startDate, endDate);
    }, 1000);

    return () => {
      if (pendingDateUpdateTimer) {
        clearTimeout(pendingDateUpdateTimer);
      }
    };
  });

  // Auto-search when search query changes (with 300ms debounce)
  $effect(() => {
    if (!isInitialLoadCompleted || searchQuery === null || searchQuery === undefined) {
      return;
    }

    const searchTimer = setTimeout(() => {
      currentPage = 0;
      fetchUserAnalytics();
    }, 300);

    return () => {
      clearTimeout(searchTimer);
    };
  });
</script>

<div class="user-analytics-tab">
  {#if isLoading && users.length === 0}
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
              <label for="search">{$_('userAnalytics.filters.search')}</label>
              <input
                id="search"
                type="text"
                bind:value={searchQuery}
                placeholder={$_('userAnalytics.filters.searchPlaceholder')}
                class="search-input"
              />
            </div>

            <div class="filter-group">
              <label for="page-size">{$_('userAnalytics.filters.perPage')}</label>
              <select
                id="page-size"
                bind:value={pageSize}
                onchange={handlePageSizeChange}
                class="select-input"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>

          <div class="stats-row">
            <div class="stat-item">
              <span class="stat-label">{$_('userAnalytics.stats.totalUsers')}:</span>
              <span class="stat-value">{formatNumber(total)}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">{$_('userAnalytics.stats.showing')}:</span>
              <span class="stat-value">{$_('userAnalytics.stats.showingCount', { values: { filtered: users.length, total } })}</span>
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
                <th onclick={() => handleSort('name')} class="sortable">
                  {$_('userAnalytics.table.userName')}
                  {#if sortBy === 'name'}
                    <span class="sort-icon">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                  {/if}
                </th>
                <th onclick={() => handleSort('email')} class="sortable">
                  {$_('userAnalytics.table.email')}
                  {#if sortBy === 'email'}
                    <span class="sort-icon">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                  {/if}
                </th>
                <th>{$_('userAnalytics.table.department')}</th>
                <th onclick={() => handleSort('totalRequests')} class="sortable numeric">
                  {$_('userAnalytics.table.requests')}
                  {#if sortBy === 'totalRequests'}
                    <span class="sort-icon">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                  {/if}
                </th>
                <th class="numeric">{$_('userAnalytics.table.success')}</th>
                <th class="numeric">{$_('userAnalytics.table.errors')}</th>
                <th onclick={() => handleSort('totalTokens')} class="sortable numeric">
                  {$_('userAnalytics.table.tokens')}
                  {#if sortBy === 'totalTokens'}
                    <span class="sort-icon">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                  {/if}
                </th>
                <th onclick={() => handleSort('totalCost')} class="sortable numeric">
                  {$_('userAnalytics.table.cost')}
                  {#if sortBy === 'totalCost'}
                    <span class="sort-icon">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                  {/if}
                </th>
                <th onclick={() => handleSort('averageLatency')} class="sortable numeric">
                  {$_('userAnalytics.table.avgLatency')}
                  {#if sortBy === 'averageLatency'}
                    <span class="sort-icon">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                  {/if}
                </th>
                <th onclick={() => handleSort('lastActivity')} class="sortable">
                  {$_('userAnalytics.table.lastActivity')}
                  {#if sortBy === 'lastActivity'}
                    <span class="sort-icon">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                  {/if}
                </th>
              </tr>
            </thead>
            <tbody>
              {#if users.length === 0}
                <tr>
                  <td colspan="10" class="empty-state">
                    {#if searchQuery}
                      {$_('userAnalytics.emptyState.noMatch', { values: { query: searchQuery } })}
                    {:else}
                      {$_('userAnalytics.emptyState.noData')}
                    {/if}
                  </td>
                </tr>
              {:else}
                {#each users as user (user.user_id)}
                  <tr>
                    <td class="user-name">{user.user_name}</td>
                    <td class="user-email">{user.user_email}</td>
                    <td>{user.department || '-'}</td>
                    <td class="numeric">{formatNumber(user.total_requests)}</td>
                    <td class="numeric success">{formatNumber(user.success_count)}</td>
                    <td class="numeric error">{formatNumber(user.error_count)}</td>
                    <td class="numeric">{formatNumber(user.total_tokens)}</td>
                    <td class="numeric cost">{formatCurrency(user.total_cost)}</td>
                    <td class="numeric">{formatLatency(user.average_latency)}</td>
                    <td class="date">{formatDateTime(user.last_activity)}</td>
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
              {$_('userAnalytics.pagination.previous')}
            </button>

            <span class="pagination-info">
              {$_('userAnalytics.pagination.pageInfo', { values: { current: currentPage + 1, total: totalPages } })}
            </span>

            <button
              class="pagination-btn"
              disabled={currentPage >= totalPages - 1}
              onclick={() => handlePageChange(currentPage + 1)}
            >
              {$_('userAnalytics.pagination.next')}
            </button>
          </div>
        {/if}
      </AdminPanelCard>
    </div>
  {/if}
</div>

<style>
  .user-analytics-tab {
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

  .analytics-table th.sortable {
    cursor: pointer;
    user-select: none;
    transition: color 0.2s ease;
  }

  .analytics-table th.sortable:hover {
    color: var(--brand);
  }

  .sort-icon {
    margin-left: 0.25rem;
    font-size: 0.75rem;
    color: var(--brand);
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

  .analytics-table td.user-name {
    font-weight: 600;
  }

  .analytics-table td.user-email {
    color: var(--text-secondary);
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

  .analytics-table td.date {
    color: var(--text-secondary);
    font-size: 0.875rem;
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
      min-width: 1200px;
    }
  }
</style>
