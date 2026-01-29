<script lang="ts">
  import { onMount, tick } from "svelte";
  import PageHeader from "../components/PageHeader.svelte";
  import AdminPanelCard from "../components/AdminPanelCard.svelte";
  import { getAnalyticsOverview, getAnalyticsTimeseries } from "../../api/admin/analytics.js";
  import type { AnalyticsOverview, AnalyticsTimeseries } from "../types.js";
  import { toast } from "../../components/Toaster.svelte";
  import { ApiError } from "../../api/client.js";
  import { _ } from 'svelte-i18n';
  import AnalyticsOverviewTab from "../components/analytics/AnalyticsOverviewTab.svelte";
  import UserAnalyticsTab from "../components/analytics/UserAnalyticsTab.svelte";
  import DepartmentAnalyticsTab from "../components/analytics/DepartmentAnalyticsTab.svelte";

  // Tab state
  type AnalyticsTab = 'overview' | 'by-user' | 'by-department' | 'by-model';
  let currentTab = $state<AnalyticsTab>('overview');

  // Initialize tab from URL hash
  onMount(() => {
    const hash = window.location.hash.slice(1);
    if (['overview', 'by-user', 'by-department', 'by-model'].includes(hash)) {
      currentTab = hash as AnalyticsTab;
    }
  });

  function setTab(tab: AnalyticsTab) {
    currentTab = tab;
    window.history.replaceState(null, '', `#${tab}`);
  }

  let isLoading = $state(true);
  let chartsLoading = $state(false);
  let overviewData = $state<AnalyticsOverview | null>(null);
  let timeseriesData = $state<AnalyticsTimeseries | null>(null);
  let error = $state<string | null>(null);
  
  // Refresh callbacks for different tabs
  let userAnalyticsRefresh: (() => Promise<void>) | null = null;
  let departmentAnalyticsRefresh: (() => Promise<void>) | null = null;
  
  // Track loading state across all tabs
  let isRefreshing = $state(false);
  
  // Polling configuration
  const POLLING_INTERVAL = 2 * 60 * 1000; // 2 minutes in milliseconds
  let pollingTimer: number | null = null;

  // Date preset options
  type DatePreset = 'last7' | 'last30' | 'last90' | 'thisMonth' | 'custom';
  let selectedPreset = $state<DatePreset>('last7');
  let startDate = $state(getDefaultStartDate('last7'));
  let endDate = $state(getDefaultEndDate());
  let granularity = $state<'hour' | 'day' | 'week' | 'month'>('day');

  function getDefaultStartDate(preset: DatePreset): string {
    const date = new Date();
    switch (preset) {
      case 'last7':
        date.setDate(date.getDate() - 7);
        break;
      case 'last30':
        date.setDate(date.getDate() - 30);
        break;
      case 'last90':
        date.setDate(date.getDate() - 90);
        break;
      case 'thisMonth':
        date.setDate(1);
        break;
      default:
        date.setDate(date.getDate() - 30);
    }
    return date.toISOString().split('T')[0];
  }

  function getDefaultEndDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  function setDatePreset(preset: DatePreset) {
    selectedPreset = preset;
    if (preset !== 'custom') {
      startDate = getDefaultStartDate(preset);
      endDate = getDefaultEndDate();
    }
  }

  async function fetchAnalytics({showLoading = true}) {
    if(showLoading) {
      isLoading = true;
    }
    error = null;

    try {
      const [overview, timeseries] = await Promise.all([
        getAnalyticsOverview({ start_date: startDate, end_date: endDate }),
        getAnalyticsTimeseries({ start_date: startDate, end_date: endDate, granularity })
      ]);

      overviewData = overview;
      timeseriesData = timeseries;

      if(showLoading) {
        await tick();
        if (timeseriesData && timeseriesData.data && timeseriesData.data.length > 0) {
          chartsLoading = true;
          setTimeout(() => {
            chartsLoading = false;
          }, 100);
        }
      }
    } catch (err: any) {
      const errorMessage = err instanceof ApiError ? err.message : err.message;
      error = errorMessage;
      toast.error(errorMessage || $_('analytics.errors.fetchFailed'));
      console.error('Analytics fetch error:', err);
    } finally {
      if(showLoading) {
        isLoading = false;
      }
    }
  }

  // Fetch only timeseries data (for granularity changes - no full page reload)
  async function fetchTimeseries() {
    chartsLoading = true;

    try {
      const timeseries = await getAnalyticsTimeseries({ start_date: startDate, end_date: endDate, granularity });
      timeseriesData = timeseries;

      await tick();

      // Small delay to allow charts to re-render
      setTimeout(() => {
        chartsLoading = false;
      }, 100);
    } catch (err: any) {
      const errorMessage = err instanceof ApiError ? err.message : err.message;
      toast.error(errorMessage || $_('analytics.errors.fetchFailed'));
      console.error('Timeseries fetch error:', err);
      chartsLoading = false;
    }
  }

  // Handle refresh based on current tab
  async function handleRefresh() {
    if(isRefreshing) {
      return;
    }

    isRefreshing = true;

    if (currentTab === 'overview') {
      await fetchAnalytics({showLoading: false});
    } else if (currentTab === 'by-user' && userAnalyticsRefresh) {
      await userAnalyticsRefresh();
    } else if (currentTab === 'by-department' && departmentAnalyticsRefresh) {
      await departmentAnalyticsRefresh();
    }

    isRefreshing = false;
  }

  // Background polling function (silent refresh without showing spinner)
  async function pollAnalytics() {
    // Don't poll if already refreshing manually
    if (isRefreshing) return;

    try {
      if (currentTab === 'overview') {
        await fetchAnalytics({showLoading: false});
      } else if (currentTab === 'by-user') {
        // Silent refresh for user analytics
        if(userAnalyticsRefresh) {
          await userAnalyticsRefresh();
        }
      } else if (currentTab === 'by-department') {
        // Silent refresh for department analytics
        if(departmentAnalyticsRefresh) {
          await departmentAnalyticsRefresh();
        }
      }
    } catch (err) {
      // Silent failure - don't show error toast for background updates
      console.error('Background analytics update failed:', err);
    }
  }

  // Start polling
  function startPolling() {
    stopPolling(); // Clear any existing timer
    pollingTimer = window.setInterval(pollAnalytics, POLLING_INTERVAL);
  }

  // Stop polling
  function stopPolling() {
    if (pollingTimer !== null) {
      clearInterval(pollingTimer);
      pollingTimer = null;
    }
  }

  // Restart polling when tab changes
  function restartPolling() {
    startPolling();
  }

  // Calculate the comparison period label based on selected date range
  const comparisonPeriodLabel = $derived(() => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end

    return $_('analytics.overview.vsPreviousDays', { values: { count: diffDays } });
  });

  // Track previous values to detect what changed
  let prevStartDate = $state(startDate);
  let prevEndDate = $state(endDate);
  let prevGranularity = $state(granularity);

  $effect(() => {
    if (currentTab !== 'overview') return;
    if (!startDate || !endDate) return;

    const dateChanged = startDate !== prevStartDate || endDate !== prevEndDate;
    const granularityChanged = granularity !== prevGranularity;

    // Update previous values
    prevStartDate = startDate;
    prevEndDate = endDate;
    prevGranularity = granularity;

    if (dateChanged) {
      // Date range changed - fetch everything
      fetchAnalytics({showLoading: true});
    } else if (granularityChanged && overviewData) {
      // Only granularity changed and we have data - just update charts
      fetchTimeseries();
    } else if (!overviewData) {
      // Initial load
      fetchAnalytics({showLoading: true});
    }
  });

  // Start polling on mount and clean up on unmount
  onMount(() => {
    startPolling();
    
    return () => {
      stopPolling();
    };
  });

  // Restart polling when tab changes
  $effect(() => {
    // Watch currentTab to restart polling
    currentTab;
    restartPolling();
  });
</script>

<div class="analytics-page">
  <PageHeader title={$_('analytics.title')} subtitle={$_('analytics.subtitle')}>
    <div class="filters-toolbar" class:filters-toolbar-custom={selectedPreset === 'custom'}>
      <!-- Date Range Presets -->
      <div class="filter-section">
        <span class="filter-label">{$_('analytics.filters.dateRange')}</span>
        <div class="pill-group">
          <button
            class="pill-group__item"
            class:pill-group__item--active={selectedPreset === 'last7'}
            onclick={() => setDatePreset('last7')}
          >
            {$_('analytics.filters.presets.last7Days')}
          </button>
          <button
            class="pill-group__item"
            class:pill-group__item--active={selectedPreset === 'last30'}
            onclick={() => setDatePreset('last30')}
          >
            {$_('analytics.filters.presets.last30Days')}
          </button>
          <button
            class="pill-group__item"
            class:pill-group__item--active={selectedPreset === 'last90'}
            onclick={() => setDatePreset('last90')}
          >
            {$_('analytics.filters.presets.last90Days')}
          </button>
          <button
            class="pill-group__item"
            class:pill-group__item--active={selectedPreset === 'thisMonth'}
            onclick={() => setDatePreset('thisMonth')}
          >
            {$_('analytics.filters.presets.thisMonth')}
          </button>
          <button
            class="pill-group__item"
            class:pill-group__item--active={selectedPreset === 'custom'}
            onclick={() => setDatePreset('custom')}
          >
            {$_('analytics.filters.presets.custom')}
          </button>
        </div>
      </div>

      <!-- Custom Date Inputs (only shown when Custom is selected) -->
      {#if selectedPreset === 'custom'}
        <div class="filter-section">
          <div class="date-inputs">
            <input
              type="date"
              bind:value={startDate}
              class="date-input"
            />
            <span class="date-separator">{$_('analytics.filters.to')}</span>
            <input
              type="date"
              bind:value={endDate}
              class="date-input"
            />
          </div>
        </div>
      {/if}
    </div>
  </PageHeader>

  <!-- Tab Navigation -->
  <div class="tabs-wrapper">
    <div class="tabs" role="tablist" aria-label="Analytics views">
      <button
        role="tab"
        class="tab"
        class:tab--active={currentTab === 'overview'}
        aria-selected={currentTab === 'overview'}
        onclick={() => setTab('overview')}
      >
        {$_('analytics.tabs.overview')}
      </button>
      <button
        role="tab"
        class="tab"
        class:tab--active={currentTab === 'by-user'}
        aria-selected={currentTab === 'by-user'}
        onclick={() => setTab('by-user')}
      >
        {$_('analytics.tabs.byUser')}
      </button>
      <button
        role="tab"
        class="tab"
        class:tab--active={currentTab === 'by-department'}
        aria-selected={currentTab === 'by-department'}
        onclick={() => setTab('by-department')}
      >
        {$_('analytics.tabs.byDepartment')}
      </button>
      <button
        role="tab"
        class="tab"
        class:tab--active={currentTab === 'by-model'}
        aria-selected={currentTab === 'by-model'}
        onclick={() => setTab('by-model')}
      >
        {$_('analytics.tabs.byModel')}
      </button>
    </div>
    <button
      class="refresh-button"
      onclick={handleRefresh}
      disabled={isRefreshing}
      title={$_('analytics.refresh')}
      aria-label={$_('analytics.refresh')}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class:spinning={isRefreshing}>
        <polyline points="23 4 23 10 17 10"></polyline>
        <polyline points="1 20 1 14 7 14"></polyline>
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
      </svg>
      <span class="refresh-button-text">{$_('analytics.refreshButton')}</span>
    </button>
  </div>

  {#if currentTab === 'overview'}
    <AnalyticsOverviewTab
      {overviewData}
      {timeseriesData}
      {isLoading}
      {chartsLoading}
      comparisonPeriodLabel={comparisonPeriodLabel()}
      {error}
      onRetry={() => fetchAnalytics({showLoading: true})}
      {granularity}
      onGranularityChange={(value) => granularity = value}
    />
  {:else if currentTab === 'by-user'}
    <UserAnalyticsTab 
      {startDate} 
      {endDate}
      onRefresh={(callback) => userAnalyticsRefresh = callback}
    />
  {:else if currentTab === 'by-department'}
    <DepartmentAnalyticsTab 
      {startDate} 
      {endDate}
      onRefresh={(callback) => departmentAnalyticsRefresh = callback}
    />
  {/if}

  {#if currentTab === 'by-model'}
    <div class="tab-placeholder">
      <AdminPanelCard>
        <div class="placeholder-content">
          <p>{$_('analytics.tabs.byModel')} - Coming soon</p>
          <p class="placeholder-hint">Model analytics will be available here</p>
        </div>
      </AdminPanelCard>
    </div>
  {/if}
</div>

<style>
  .analytics-page {
    padding: var(--space-3xl);
    max-width: 1600px;
    margin: 0 auto;
  }

  /* Filters Toolbar */
  .filters-toolbar {
    display: flex;
    flex-direction: row;
    align-items: flex-end;
    gap: var(--space-xl);
    justify-content: flex-end;
  }

  .filters-toolbar-custom{
    flex-direction: column;
  }

  .filter-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .filter-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  /* Enhanced selection state for filter buttons */
  .filter-section .pill-group__item--active {
    background: var(--brand);
    color: white;
    font-weight: 600;
    box-shadow:
      0 2px 8px rgba(var(--brand-rgb), 0.3),
      0 1px 2px rgba(0, 0, 0, 0.1);
  }

  .filter-section .pill-group__item--active:hover {
    background: color-mix(in oklab, var(--brand) 90%, white);
    color: white;
  }

  .date-inputs {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .date-input {
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--radius-sm);
    border: 1px solid var(--glass-stroke-dark);
    background: var(--btn-secondary);
    color: var(--text-primary);
    font-size: 0.875rem;
    font-family: inherit;
    transition: all 0.2s ease;
  }

  .date-input:focus {
    outline: none;
    border-color: var(--brand);
    box-shadow: 0 0 0 2px var(--brand-ring);
  }

  .date-separator {
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  /* Tabs Wrapper */
  .tabs-wrapper {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-lg);
  }

  /* Refresh Button */
  .refresh-button {
    padding: 0.625rem 0.875rem;
    border-radius: var(--radius-lg);
    border: 1px solid var(--glass-stroke-dark);
    background: var(--btn-secondary);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    flex-shrink: 0;
    min-width: 44px;
    min-height: 44px;
    box-shadow: 
      0 1px 2px rgba(0, 0, 0, 0.05),
      inset 0 1px 0 rgba(255, 255, 255, 0.05);
    position: relative;
    overflow: hidden;
  }

  .refresh-button::before {
    content: '';
    position: absolute;
    inset: 0;
    background: var(--brand);
    opacity: 0;
    transition: opacity 0.2s ease;
  }

  .refresh-button svg {
    position: relative;
    z-index: 1;
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .refresh-button:hover:not(:disabled) {
    background: var(--btn-tertiary);
    border-color: var(--brand);
    color: var(--brand);
    transform: translateY(-1px);
    box-shadow: 
      0 4px 12px rgba(0, 0, 0, 0.08),
      0 2px 4px rgba(0, 0, 0, 0.04),
      inset 0 1px 0 rgba(255, 255, 255, 0.1);
  }

  .refresh-button:hover:not(:disabled)::before {
    opacity: 0.05;
  }

  .refresh-button:active:not(:disabled) {
    transform: translateY(0);
    box-shadow: 
      0 1px 2px rgba(0, 0, 0, 0.05),
      inset 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .refresh-button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    transform: none;
  }

  .refresh-button svg.spinning {
    animation: spin 1s linear infinite;
  }

  .refresh-button-text {
    font-size: 0.875rem;
    font-weight: 500;
    white-space: nowrap;
    position: relative;
    z-index: 1;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  /* Tab Placeholder Content */
  .tab-placeholder {
    margin-top: var(--space-xl);
  }

  .placeholder-content {
    text-align: center;
    padding: var(--space-4xl) var(--space-2xl);
  }

  .placeholder-content p {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 var(--space-sm) 0;
  }

  .placeholder-content .placeholder-hint {
    font-size: 0.9375rem;
    font-weight: 400;
    color: var(--text-secondary);
  }

  @media (max-width: 768px) {
    .analytics-page {
      padding: var(--space-xl);
    }

    .filters-toolbar {
      flex-direction: column;
      align-items: stretch;
      gap: var(--space-lg);
    }

    .filter-section .pill-group {
      flex-wrap: wrap;
    }

    .date-inputs {
      flex-direction: column;
      align-items: stretch;
    }

    .tabs-wrapper {
      flex-direction: column;
      gap: var(--space-md);
    }

    .tabs {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      width: 100%;
    }

    .refresh-button {
      width: 100%;
      justify-content: center;
      padding: 0.75rem 1rem;
    }

    .refresh-button-text {
      font-size: 0.9375rem;
    }
  }
</style>
