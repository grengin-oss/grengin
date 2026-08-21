<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { onMount, tick } from "svelte";
  import AdminTabs from "../components/AdminTabs.svelte";
  import AnalyticsRangePicker from "../components/analytics/AnalyticsRangePicker.svelte";
  import { getAnalyticsOverview, getAnalyticsTimeseries } from "../../api/admin/analytics.js";
  import type { AnalyticsOverview, AnalyticsTimeseries } from "../types.js";
  import { toast } from "../../components/Toaster.svelte";
  import { ApiError } from "../../api/client.js";
  import { _ } from 'svelte-i18n';
  import AnalyticsOverviewTab from "../components/analytics/AnalyticsOverviewTab.svelte";
  import UserAnalyticsTab from "../components/analytics/UserAnalyticsTab.svelte";
  import DepartmentAnalyticsTab from "../components/analytics/DepartmentAnalyticsTab.svelte";
  import ModelAnalyticsTab from "../components/analytics/ModelAnalyticsTab.svelte";
  import { permissionsStore } from "../../features/auth/index.js";

  // Tab state
  type AnalyticsTab = "overview" | "by-user" | "by-department" | "by-model";
  interface TabConfig {
    id: AnalyticsTab;
    label: string;
    ariaLabel: string;
  }

  let currentTab = $state<AnalyticsTab>("overview");
  const canViewOverview = $derived(
    permissionsStore.isPermissionGlobal("analytics:view")
  );
  let defaultTab = $derived<AnalyticsTab>(
    canViewOverview ? "overview" : "by-user"
  );

  function makeTab(
    id: AnalyticsTab,
    label: string,
    ariaLabel: string
  ): TabConfig {
    return { id, label, ariaLabel };
  }

  let tabs = $derived<TabConfig[]>([
    ...(canViewOverview
      ? [
          makeTab(
            "overview",
            $_("analytics.tabs.overview"),
            $_("analytics.tabsAria.overview"),
          ),
        ]
      : []),
    makeTab(
      "by-user",
      $_("analytics.tabs.byUser"),
      $_("analytics.tabsAria.byUser"),
    ),
    makeTab(
      "by-department",
      $_("analytics.tabs.byDepartment"),
      $_("analytics.tabsAria.byDepartment"),
    ),
    // By Model reads /admin/analytics/overview's top_models, so it needs the
    // same global permission the Overview tab does.
    ...(canViewOverview
      ? [
          makeTab(
            "by-model",
            $_("analytics.tabs.byModel"),
            $_("analytics.tabsAria.byModel"),
          ),
        ]
      : []),
  ]);

  let prevTab = $state<string | null>(null);

  // Redirect to by-user tab if user does not have overview permission
  $effect(() => {
    if (!canViewOverview && (currentTab === "overview" || currentTab === "by-model")) {
      currentTab = "by-user";
    }
  });

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

  function setCustomRange(start: string, end: string) {
    selectedPreset = 'custom';
    if (start) startDate = start;
    if (end) endDate = end;
  }

  /** Days covered by the current range, both ends included. */
  const rangeDays = $derived.by(() => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 30;
    return Math.max(1, Math.ceil(Math.abs(end.getTime() - start.getTime()) / 86400000) + 1);
  });

  /** The design has no granularity control, so the range picks the bucket. */
  $effect(() => {
    const next: typeof granularity =
      rangeDays <= 2 ? 'hour' : rangeDays <= 62 ? 'day' : rangeDays <= 210 ? 'week' : 'month';
    if (next !== granularity) granularity = next;
  });

  const PRESET_LABEL_KEYS: Record<Exclude<DatePreset, 'custom'>, string> = {
    last7: 'analytics.filters.presets.last7Days',
    last30: 'analytics.filters.presets.last30Days',
    last90: 'analytics.filters.presets.last90Days',
    thisMonth: 'analytics.filters.presets.thisMonth',
  };

  /** Caption used by the Quick Stats / Top Models headings. */
  const rangeLabel = $derived(
    selectedPreset === 'custom'
      ? `${formatRangeDate(startDate)} – ${formatRangeDate(endDate)}`
      : $_(PRESET_LABEL_KEYS[selectedPreset]),
  );

  function formatRangeDate(value: string): string {
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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

    if (currentTab === 'overview' || currentTab === 'by-model') {
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
      if (currentTab === 'overview' || currentTab === 'by-model') {
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
  let prevStartDate = $state<string | undefined>(undefined);
  let prevEndDate = $state<string | undefined>(undefined);
  let prevGranularity = $state<typeof granularity | undefined>(undefined);

  $effect(() => {
    if (currentTab !== 'overview' && currentTab !== 'by-model') return;
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

  $effect(() => {
    if (prevTab !== null && currentTab !== prevTab) {
      tick().then(() => {
        document.getElementById(`${currentTab}-panel`)?.focus();
      });
    }
    prevTab = currentTab;
  });
</script>

<div class="analytics-page" role="region" aria-label={$_("analytics.aria.mainRegion")}>
  <div class="header-block">
    <div class="header-text">
      <h1 class="page-title">{$_('analytics.title')}</h1>
      <span class="page-sub">{$_('analytics.subtitle')}</span>
    </div>
    <AnalyticsRangePicker
      preset={selectedPreset}
      {startDate}
      {endDate}
      onPresetChange={setDatePreset}
      onCustomRangeChange={setCustomRange}
    />
  </div>

  <div class="tabs-row">
    <AdminTabs
      {tabs}
      {defaultTab}
      variant="segmented"
      tabListLabel={$_("admin.tabListLabels.analytics")}
      bind:currentTab
    />
    <button
      type="button"
      class="refresh-btn"
      onclick={handleRefresh}
      disabled={isRefreshing}
      title={$_('analytics.refresh')}
      aria-label={$_('analytics.refresh')}
      aria-busy={isRefreshing}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" class:spinning={isRefreshing}>
        <path d="M14 8a6 6 0 1 1-1.76-4.24" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
        <path d="M14 2v3.5h-3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span>{$_('analytics.refreshButton')}</span>
    </button>
  </div>

  {#if currentTab === 'overview' && canViewOverview}
    <div
      id="overview-panel"
      class="analytics-tab-panel"
      role="tabpanel"
      aria-labelledby="tab-overview"
      tabindex="-1"
    >
      <AnalyticsOverviewTab
        {overviewData}
        {timeseriesData}
        {isLoading}
        {chartsLoading}
        comparisonPeriodLabel={comparisonPeriodLabel()}
        {rangeLabel}
        {error}
        onRetry={() => fetchAnalytics({showLoading: true})}
      />
    </div>
  {:else if currentTab === 'by-user'}
    <div
      id="by-user-panel"
      class="analytics-tab-panel"
      role="tabpanel"
      aria-labelledby="tab-by-user"
      tabindex="-1"
    >
      <UserAnalyticsTab
        {startDate}
        {endDate}
        onRefresh={(callback) => userAnalyticsRefresh = callback}
      />
    </div>
  {:else if currentTab === 'by-department'}
    <div
      id="by-department-panel"
      class="analytics-tab-panel"
      role="tabpanel"
      aria-labelledby="tab-by-department"
      tabindex="-1"
    >
      <DepartmentAnalyticsTab
        {startDate}
        {endDate}
        {rangeLabel}
        onRefresh={(callback) => departmentAnalyticsRefresh = callback}
      />
    </div>
  {:else if currentTab === 'by-model' && canViewOverview}
    <div
      id="by-model-panel"
      class="analytics-tab-panel"
      role="tabpanel"
      aria-labelledby="tab-by-model"
      tabindex="-1"
    >
      <ModelAnalyticsTab
        {overviewData}
        {isLoading}
        {rangeLabel}
        {error}
        onRetry={() => fetchAnalytics({showLoading: true})}
      />
    </div>
  {/if}
</div>

<style>
  button {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  /* Design (usage-analytics-overview.html): 32px page padding, 28px stack. */
  .analytics-page {
    display: flex;
    flex-direction: column;
    gap: 28px;
    padding: 32px;
    font-family: var(--gx-font);
  }

  .header-block {
    display: flex;
    gap: 16px;
    align-items: flex-start;
    align-self: stretch;
  }

  .header-text {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex-grow: 1;
    min-width: 0;
  }

  .page-title {
    margin: 0;
    font-family: var(--gx-font-display);
    font-weight: 700;
    font-size: 28px;
    line-height: 100%;
    color: var(--gx-ink);
  }

  .page-sub {
    font-weight: 400;
    font-size: 13px;
    line-height: 100%;
    color: var(--gx-an-sub);
  }

  .tabs-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    align-self: stretch;
    gap: 16px;
    flex-wrap: wrap;
  }

  /* Outlined chip, hug x hug (97x32 at the design's metrics): white fill,
     Primary-100 hairline drawn inside, Primary-500 label. */
  .refresh-btn {
    border: 1px solid var(--gx-org-primary-100);
    border-radius: 8px;
    background: var(--gx-card);
    box-shadow: none;
    display: flex;
    gap: 6px;
    padding: 8px 14px;
    justify-content: center;
    align-items: center;
    flex-shrink: 0;
    font-family: inherit;
    color: var(--gx-org-primary-500);
    cursor: pointer;
    transition:
      background-color 120ms ease,
      border-color 120ms ease;
  }

  .refresh-btn span {
    font-weight: 500;
    font-size: 13px;
    line-height: 14px;
    white-space: nowrap;
  }

  .refresh-btn svg {
    flex-shrink: 0;
  }

  .refresh-btn:hover:not(:disabled) {
    background: var(--gx-org-primary-tint);
    border-color: var(--gx-org-primary-500);
    transform: none;
  }

  .refresh-btn:disabled {
    opacity: 0.65;
    cursor: progress;
  }

  .refresh-btn:focus-visible {
    outline: 2px solid var(--gx-org-brand-alt);
    outline-offset: 2px;
  }

  .refresh-btn svg.spinning {
    animation: analytics-spin 900ms linear infinite;
  }

  @keyframes analytics-spin {
    to {
      transform: rotate(360deg);
    }
  }

  .analytics-tab-panel {
    outline: none;
  }

  .analytics-tab-panel:focus-visible {
    outline: 2px solid var(--gx-an-blue);
    outline-offset: 2px;
  }

  @media (max-width: 768px) {
    .analytics-page {
      padding: 20px;
    }

    .header-block {
      flex-direction: column;
      gap: 12px;
    }

    .tabs-row {
      flex-direction: column;
      align-items: stretch;
    }

    .refresh-btn {
      width: 100%;
    }
  }
</style>
