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
    | null
  >('totalRequests');
  let sortOrder = $state<'asc' | 'desc'>('desc');
  let searchQuery = $state('');
  let pendingDate : {startDate: string, endDate: string} | null = null;
  let isInitialLoadCompleted = $state(false);
  let latestRequestId = 0;

  async function fetchUserAnalytics(newStartDate: string = startDate, newEndDate: string = endDate) {    
    const requestId = ++latestRequestId;
    isLoading = true;
    pendingDate = {startDate: newStartDate, endDate: newEndDate};

    try {
      const params: GetUserAnalyticsParams = {
        start_date: newStartDate,
        end_date: newEndDate,
        page: currentPage,
        limit: pageSize,
        sort_by: sortBy ?? undefined,
        order: sortBy ? sortOrder : undefined,
        search: searchQuery.trim() || undefined
      };

      const response = await getUserAnalytics(params);
      if (requestId !== latestRequestId) return;
      users = response.users;
      total = response.total;
      totalPages = response.total_pages;
      currentPage = response.page;
    } catch (err: any) {
      if (requestId !== latestRequestId) return;
      const errorMessage = err?.message || err?.error;
      toast.error(errorMessage || $_('userAnalytics.errors.fetchFailed'));
      console.error('User analytics fetch error:', err);
    } finally {
      if (requestId !== latestRequestId) return;
      isLoading = false;
      pendingDate = null;
      isInitialLoadCompleted = true;
    }
  }

  function handleSort(column: typeof sortBy) {
    if (sortBy !== column) {
      sortBy = column;
      sortOrder = 'desc';
    } else if (sortOrder === 'desc') {
      sortOrder = 'asc';
    } else {
      sortBy = null;
      sortOrder = 'desc';
    }
    currentPage = 0;
    fetchUserAnalytics();
  }

  function handlePageChange(newPage: number) {
    currentPage = newPage;
    fetchUserAnalytics();
  }

  function handlePageSizeChange(event: Event) {
    const target = event.currentTarget as HTMLSelectElement;
    pageSize = Number(target.value);
    currentPage = 0;
    fetchUserAnalytics();
  }

  function clearSearch() {
    if (!searchQuery) return;
    searchQuery = '';
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

  function ariaSortFor(column: Exclude<typeof sortBy, null>): 'ascending' | 'descending' | 'none' {
    if (sortBy !== column) return 'none';
    return sortOrder === 'asc' ? 'ascending' : 'descending';
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
    <div class="loading-container" role="status" aria-live="polite" aria-busy="true">
      <LoadingSpinner />
    </div>
  {:else}
    <div class="analytics-content">
      <!-- Filters Section -->
      <AdminPanelCard>
        <div class="filters-section">
          <div class="filters-row">
            <div class="filter-group">
              <label for="user-analytics-search">{$_('userAnalytics.filters.search')}</label>
              <div class="search-input-wrap">
                <input
                  id="user-analytics-search"
                  type="search"
                  bind:value={searchQuery}
                  placeholder={$_('userAnalytics.filters.searchPlaceholder')}
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
              <label for="user-analytics-page-size">{$_('userAnalytics.filters.perPage')}</label>
              <select
                id="user-analytics-page-size"
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
            <caption class="sr-only">{$_('analytics.aria.userTableCaption')}</caption>
            <thead>
              <tr>
                <th scope="col" class="sortable" aria-sort={ariaSortFor('name')}>
                  <button type="button" class="sort-header-btn" onclick={() => handleSort('name')}>
                    <span class="th-content">
                      {$_('userAnalytics.table.userName')}
                      <span class="sort-icon" class:sort-icon-active={sortBy === 'name'} aria-hidden="true">
                        {#if sortBy === 'name'}
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 320 512" class="sort-svg">
                            {#if sortOrder === 'asc'}
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
                    </span>
                  </button>
                </th>
                <th scope="col" class="sortable" aria-sort={ariaSortFor('email')}>
                  <button type="button" class="sort-header-btn" onclick={() => handleSort('email')}>
                    <span class="th-content">
                      {$_('userAnalytics.table.email')}
                      <span class="sort-icon" class:sort-icon-active={sortBy === 'email'} aria-hidden="true">
                        {#if sortBy === 'email'}
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 320 512" class="sort-svg">
                            {#if sortOrder === 'asc'}
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
                    </span>
                  </button>
                </th>
                <th scope="col">{$_('userAnalytics.table.department')}</th>
                <th scope="col" class="sortable numeric" aria-sort={ariaSortFor('totalRequests')}>
                  <button type="button" class="sort-header-btn" onclick={() => handleSort('totalRequests')}>
                    <span class="th-content">
                      {$_('userAnalytics.table.requests')}
                      <span class="sort-icon" class:sort-icon-active={sortBy === 'totalRequests'} aria-hidden="true">
                        {#if sortBy === 'totalRequests'}
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 320 512" class="sort-svg">
                            {#if sortOrder === 'asc'}
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
                    </span>
                  </button>
                </th>
                <th scope="col" class="numeric">{$_('userAnalytics.table.success')}</th>
                <th scope="col" class="numeric">{$_('userAnalytics.table.errors')}</th>
                <th scope="col" class="sortable numeric" aria-sort={ariaSortFor('totalTokens')}>
                  <button type="button" class="sort-header-btn" onclick={() => handleSort('totalTokens')}>
                    <span class="th-content">
                      {$_('userAnalytics.table.tokens')}
                      <span class="sort-icon" class:sort-icon-active={sortBy === 'totalTokens'} aria-hidden="true">
                        {#if sortBy === 'totalTokens'}
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 320 512" class="sort-svg">
                            {#if sortOrder === 'asc'}
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
                    </span>
                  </button>
                </th>
                <th scope="col" class="sortable numeric" aria-sort={ariaSortFor('totalCost')}>
                  <button type="button" class="sort-header-btn" onclick={() => handleSort('totalCost')}>
                    <span class="th-content">
                      {$_('userAnalytics.table.cost')}
                      <span class="sort-icon" class:sort-icon-active={sortBy === 'totalCost'} aria-hidden="true">
                        {#if sortBy === 'totalCost'}
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 320 512" class="sort-svg">
                            {#if sortOrder === 'asc'}
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
                    </span>
                  </button>
                </th>
                <th scope="col" class="sortable numeric" aria-sort={ariaSortFor('averageLatency')}>
                  <button type="button" class="sort-header-btn" onclick={() => handleSort('averageLatency')}>
                    <span class="th-content">
                      {$_('userAnalytics.table.avgLatency')}
                      <span class="sort-icon" class:sort-icon-active={sortBy === 'averageLatency'} aria-hidden="true">
                        {#if sortBy === 'averageLatency'}
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 320 512" class="sort-svg">
                            {#if sortOrder === 'asc'}
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
                    </span>
                  </button>
                </th>
                <th scope="col" class="sortable" aria-sort={ariaSortFor('lastActivity')}>
                  <button type="button" class="sort-header-btn" onclick={() => handleSort('lastActivity')}>
                    <span class="th-content">
                      {$_('userAnalytics.table.lastActivity')}
                      <span class="sort-icon" class:sort-icon-active={sortBy === 'lastActivity'} aria-hidden="true">
                        {#if sortBy === 'lastActivity'}
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 320 512" class="sort-svg">
                            {#if sortOrder === 'asc'}
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
                    </span>
                  </button>
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
          <nav class="pagination" aria-label={$_('analytics.aria.pagination')}>
            <button
              type="button"
              class="pagination-btn"
              disabled={currentPage === 0}
              onclick={() => handlePageChange(currentPage - 1)}
            >
              {$_('userAnalytics.pagination.previous')}
            </button>

            <span class="pagination-info" aria-live="polite">
              {$_('userAnalytics.pagination.pageInfo', { values: { current: currentPage + 1, total: totalPages } })}
            </span>

            <button
              type="button"
              class="pagination-btn"
              disabled={currentPage >= totalPages - 1}
              onclick={() => handlePageChange(currentPage + 1)}
            >
              {$_('userAnalytics.pagination.next')}
            </button>
          </nav>
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

  .analytics-table th:not(.sortable) {
    padding: var(--space-md) var(--space-md);
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

  .analytics-table th.numeric .sort-header-btn {
    justify-content: flex-end;
    text-align: right;
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
      min-width: 1200px;
    }
  }
</style>
