<script lang="ts">
  import { tick } from "svelte";
  import AdminPanelCard from "../AdminPanelCard.svelte";
  import LoadingSpinner from "../LoadingSpinner.svelte";
  import type { AnalyticsOverview, AnalyticsTimeseries } from "../../types.js";
  import embed from "vega-embed";
  import { _ } from 'svelte-i18n';

  interface Props {
    overviewData: AnalyticsOverview | null;
    timeseriesData: AnalyticsTimeseries | null;
    isLoading: boolean;
    chartsLoading: boolean;
    comparisonPeriodLabel: string;
    error: string | null;
    onRetry: () => void;
    granularity: 'hour' | 'day' | 'week' | 'month';
    onGranularityChange: (value: 'hour' | 'day' | 'week' | 'month') => void;
  }

  let { overviewData, timeseriesData, isLoading, chartsLoading, comparisonPeriodLabel, error, onRetry, granularity, onGranularityChange }: Props = $props();

  function formatNumber(num: number): string {
    if (num >= 1000000) {
      const val = num / 1000000;
      return (val % 1 === 0 ? val.toString() : val.toFixed(1)) + 'M';
    } else if (num >= 1000) {
      const val = num / 1000;
      return (val % 1 === 0 ? val.toString() : val.toFixed(1)) + 'K';
    }
    return Math.round(num).toString();
  }

  function formatCurrency(num: number): string {
    return '$' + num.toFixed(2);
  }

  function formatPercentage(num: number): string {
    const sign = num >= 0 ? '+' : '';
    return sign + (num * 100).toFixed(1) + '%';
  }

  function renderCharts() {
    if (!timeseriesData || !timeseriesData.data || timeseriesData.data.length === 0) return;

    setTimeout(() => renderMultiMetricChart(), 50);
    setTimeout(() => renderRequestsTokensChart(), 100);
    setTimeout(() => renderSuccessErrorChart(), 150);
    setTimeout(() => renderCostTrendChart(), 200);
  }

  function renderMultiMetricChart() {
    const el = document.getElementById('multi-metric-chart');
    if (!timeseriesData || !el) return;

    const spec = {
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      width: 'container',
      height: 280,
      data: { values: timeseriesData.data },
      layer: [
        {
          mark: { type: 'line', strokeWidth: 3, interpolate: 'monotone' },
          encoding: {
            x: {
              field: 'timestamp',
              type: 'temporal'
            },
            y: {
              field: 'total_requests',
              type: 'quantitative'
            },
            color: { value: '#4079c5' }
          }
        },
        {
          mark: { type: 'point', filled: true, size: 100 },
          encoding: {
            x: { field: 'timestamp', type: 'temporal' },
            y: { field: 'total_requests', type: 'quantitative' },
            color: { value: '#4079c5' },
            tooltip: [
              { field: 'timestamp', type: 'temporal', title: $_('analytics.charts.multiMetric.date'), format: '%b %d, %Y' },
              { field: 'total_requests', type: 'quantitative', title: $_('analytics.charts.multiMetric.requests'), format: ',.0f' },
              { field: 'total_tokens', type: 'quantitative', title: $_('analytics.charts.multiMetric.tokens'), format: ',.0f' },
              { field: 'average_latency', type: 'quantitative', title: $_('analytics.charts.multiMetric.latencyMs'), format: '.2f' }
            ]
          }
        }
      ],
      config: {
        background: 'transparent',
        view: { stroke: null }
      }
    };

    embed(el, spec, { actions: false, renderer: 'svg' }).catch(console.error);
  }

  function renderRequestsTokensChart() {
    const el = document.getElementById('requests-tokens-chart');
    if (!timeseriesData || !el) return;

    const spec = {
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      width: 'container',
      height: 280,
      data: { values: timeseriesData.data },
      layer: [
        {
          mark: { type: 'bar', opacity: 0.8, cornerRadiusEnd: 4 },
          encoding: {
            x: {
              field: 'timestamp',
              type: 'temporal'
            },
            y: {
              field: 'total_requests',
              type: 'quantitative',
              scale: { zero: true }
            },
            color: { value: '#4079c5' },
            tooltip: [
              { field: 'timestamp', type: 'temporal', title: $_('analytics.charts.multiMetric.date'), format: '%b %d, %Y' },
              { field: 'total_requests', type: 'quantitative', title: $_('analytics.charts.usageGrowth.requests'), format: ',.0f' },
              { field: 'total_tokens', type: 'quantitative', title: $_('analytics.charts.usageGrowth.tokens'), format: ',.0f' }
            ]
          }
        },
        {
          mark: { type: 'line', strokeWidth: 3, interpolate: 'monotone' },
          encoding: {
            x: { field: 'timestamp', type: 'temporal' },
            y: {
              field: 'total_tokens',
              type: 'quantitative'
            },
            color: { value: '#2d906b' }
          }
        },
        {
          mark: { type: 'point', filled: true, size: 100 },
          encoding: {
            x: { field: 'timestamp', type: 'temporal' },
            y: { field: 'total_tokens', type: 'quantitative' },
            color: { value: '#2d906b' }
          }
        }
      ],
      config: {
        background: 'transparent',
        view: { stroke: null }
      }
    };

    embed(el, spec, { actions: false, renderer: 'svg' }).catch(console.error);
  }

  function renderSuccessErrorChart() {
    const el = document.getElementById('success-error-chart');
    if (!timeseriesData || !el) return;

    const spec = {
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      width: 'container',
      height: 280,
      data: { values: timeseriesData.data },
      mark: { type: 'bar', cornerRadiusEnd: 4 },
      encoding: {
        x: {
          field: 'timestamp',
          type: 'temporal'
        },
        y: {
          field: 'value',
          type: 'quantitative'
        },
        color: {
          field: 'type',
          type: 'nominal',
          scale: {
            domain: ['Success', 'Errors'],
            range: ['#00C853', '#DF000C']
          },
          legend: null
        },
        tooltip: [
          { field: 'timestamp', type: 'temporal', title: $_('analytics.charts.multiMetric.date'), format: '%b %d, %Y' },
          { field: 'type', type: 'nominal', title: $_('analytics.charts.apiReliability.type') },
          { field: 'value', type: 'quantitative', title: $_('analytics.charts.apiReliability.count'), format: ',.0f' }
        ]
      },
      transform: [
        { fold: ['success_count', 'error_count'], as: ['type', 'value'] },
        { calculate: "datum.type === 'success_count' ? 'Success' : 'Errors'", as: 'type' }
      ],
      config: {
        background: 'transparent',
        view: { stroke: null }
      }
    };

    embed(el, spec, { actions: false, renderer: 'svg' }).catch(console.error);
  }

  function renderCostTrendChart() {
    const el = document.getElementById('cost-trend-chart');
    if (!timeseriesData || !el) return;

    const spec = {
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      width: 'container',
      height: 280,
      data: { values: timeseriesData.data },
      layer: [
        {
          mark: { type: 'area', opacity: 0.3, line: true, interpolate: 'monotone' },
          encoding: {
            x: {
              field: 'timestamp',
              type: 'temporal'
            },
            y: {
              field: 'total_cost',
              type: 'quantitative',
              scale: { zero: true }
            },
            color: { value: '#2d906b' }
          }
        },
        {
          mark: { type: 'line', strokeWidth: 3, interpolate: 'monotone' },
          encoding: {
            x: { field: 'timestamp', type: 'temporal' },
            y: { field: 'total_cost', type: 'quantitative' },
            color: { value: '#2d906b' }
          }
        },
        {
          mark: { type: 'point', filled: true, size: 100 },
          encoding: {
            x: { field: 'timestamp', type: 'temporal' },
            y: { field: 'total_cost', type: 'quantitative' },
            color: { value: '#2d906b' },
            tooltip: [
              { field: 'timestamp', type: 'temporal', title: $_('analytics.charts.multiMetric.date'), format: '%b %d, %Y' },
              { field: 'total_cost', type: 'quantitative', title: $_('analytics.charts.costTrend.totalCost'), format: '$,.2f' }
            ]
          }
        }
      ],
      config: {
        background: 'transparent',
        view: { stroke: null }
      }
    };

    embed(el, spec, { actions: false, renderer: 'svg' }).catch(console.error);
  }

  // Re-render charts when data changes and not loading
  $effect(() => {
    if (!chartsLoading && timeseriesData && timeseriesData.data && timeseriesData.data.length > 0) {
      tick().then(() => renderCharts());
    }
  });
</script>

{#if isLoading}
  <div class="loading-container">
    <LoadingSpinner />
  </div>
{:else if error}
  <AdminPanelCard>
    <div class="error-state">
      <p class="error-message">{error}</p>
      <button class="btn-primary" onclick={onRetry}>{$_('analytics.retry')}</button>
    </div>
  </AdminPanelCard>
{:else if overviewData}
  <div class="analytics-content">
    <section class="overview-section">
      <h2 class="section-title">{$_('analytics.overview.title')}</h2>

      <div class="metrics-grid">
        <AdminPanelCard class="metric-card">
          <div class="metric-content">
            <div class="metric-header">
              <span class="metric-label">{$_('analytics.overview.totalUsers')}</span>
              {#if overviewData.request_growth_rate !== 0}
                <div class="metric-growth-wrapper">
                  <span class="metric-growth" class:positive={overviewData.request_growth_rate > 0} class:negative={overviewData.request_growth_rate < 0}>
                    {formatPercentage(overviewData.request_growth_rate)}
                  </span>
                  <span class="metric-growth-period">{comparisonPeriodLabel}</span>
                </div>
              {/if}
            </div>
            <div class="metric-value">{formatNumber(overviewData.total_users)}</div>
            <div class="metric-subtext">{$_('analytics.overview.activeUsers', { values: { count: formatNumber(overviewData.active_users) } })}</div>
          </div>
        </AdminPanelCard>

        <AdminPanelCard class="metric-card">
          <div class="metric-content">
            <div class="metric-header">
              <span class="metric-label">{$_('analytics.overview.totalRequests')}</span>
              {#if overviewData.request_growth_rate !== 0}
                <div class="metric-growth-wrapper">
                  <span class="metric-growth" class:positive={overviewData.request_growth_rate > 0} class:negative={overviewData.request_growth_rate < 0}>
                    {formatPercentage(overviewData.request_growth_rate)}
                  </span>
                  <span class="metric-growth-period">{comparisonPeriodLabel}</span>
                </div>
              {/if}
            </div>
            <div class="metric-value">{formatNumber(overviewData.total_requests)}</div>
            <div class="metric-subtext">{$_('analytics.overview.avgPerUser', { values: { count: overviewData.average_requests_per_user.toFixed(1) } })}</div>
          </div>
        </AdminPanelCard>

        <AdminPanelCard class="metric-card">
          <div class="metric-content">
            <div class="metric-header">
              <span class="metric-label">{$_('analytics.overview.totalTokens')}</span>
              {#if overviewData.token_growth_rate !== 0}
                <div class="metric-growth-wrapper">
                  <span class="metric-growth" class:positive={overviewData.token_growth_rate > 0} class:negative={overviewData.token_growth_rate < 0}>
                    {formatPercentage(overviewData.token_growth_rate)}
                  </span>
                  <span class="metric-growth-period">{comparisonPeriodLabel}</span>
                </div>
              {/if}
            </div>
            <div class="metric-value">{formatNumber(overviewData.total_tokens)}</div>
          </div>
        </AdminPanelCard>

        <AdminPanelCard class="metric-card">
          <div class="metric-content">
            <div class="metric-header">
              <span class="metric-label">{$_('analytics.overview.totalCost')}</span>
              {#if overviewData.cost_growth_rate !== 0}
                <div class="metric-growth-wrapper">
                  <span class="metric-growth" class:positive={overviewData.cost_growth_rate > 0} class:negative={overviewData.cost_growth_rate < 0}>
                    {formatPercentage(overviewData.cost_growth_rate)}
                  </span>
                  <span class="metric-growth-period">{comparisonPeriodLabel}</span>
                </div>
              {/if}
            </div>
            <div class="metric-value">{formatCurrency(overviewData.total_cost)}</div>
          </div>
        </AdminPanelCard>
      </div>
    </section>

    {#if overviewData.top_models && overviewData.top_models.length > 0}
      <section class="top-models-section">
        <h2 class="section-title">{$_('analytics.topModels.title')}</h2>
        <AdminPanelCard padded={false}>
          <div class="table-container">
            <table class="models-table">
              <thead>
                <tr>
                  <th>{$_('analytics.topModels.model')}</th>
                  <th>{$_('analytics.topModels.provider')}</th>
                  <th>{$_('analytics.topModels.requests')}</th>
                  <th>{$_('analytics.topModels.tokens')}</th>
                  <th>{$_('analytics.topModels.cost')}</th>
                </tr>
              </thead>
              <tbody>
                {#each overviewData.top_models as model}
                  <tr>
                    <td class="model-name">{model.model_name}</td>
                    <td class="provider-name">{model.model_provider}</td>
                    <td>{formatNumber(model.total_requests)}</td>
                    <td>{formatNumber(model.total_tokens)}</td>
                    <td>{formatCurrency(model.total_cost)}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </AdminPanelCard>
      </section>
    {/if}

    <section class="charts-section">
      <div class="section-header">
        <h2 class="section-title">{$_('analytics.charts.title')}</h2>
        <div class="aggregation-control">
          <span class="aggregation-label">{$_('analytics.filters.aggregated')}</span>
          <div class="pill-group pill-group--compact">
            <button
              class="pill-group__item"
              class:pill-group__item--active={granularity === 'hour'}
              onclick={() => onGranularityChange('hour')}
            >
              {$_('analytics.filters.hour')}
            </button>
            <button
              class="pill-group__item"
              class:pill-group__item--active={granularity === 'day'}
              onclick={() => onGranularityChange('day')}
            >
              {$_('analytics.filters.day')}
            </button>
            <button
              class="pill-group__item"
              class:pill-group__item--active={granularity === 'week'}
              onclick={() => onGranularityChange('week')}
            >
              {$_('analytics.filters.week')}
            </button>
            <button
              class="pill-group__item"
              class:pill-group__item--active={granularity === 'month'}
              onclick={() => onGranularityChange('month')}
            >
              {$_('analytics.filters.month')}
            </button>
          </div>
        </div>
      </div>

      {#if !timeseriesData || !timeseriesData.data || timeseriesData.data.length === 0}
        <div class="empty-state">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3">
            <path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>
          </svg>
          <p class="empty-state-text">{$_('analytics.charts.emptyState.title')}</p>
          <p class="empty-state-hint">{$_('analytics.charts.emptyState.hint')}</p>
        </div>
      {:else}
      <div class="charts-grid">
        <div class="chart-card">
          <div class="chart-header">
            <div class="chart-icon" style="background: rgba(64, 121, 197, 0.1);">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4079c5" stroke-width="2">
                <path d="M3 3v18h18"/><path d="M7 12l3-3 3 3 5-5"/>
              </svg>
            </div>
            <div>
              <h3 class="chart-title">{$_('analytics.charts.multiMetric.title')}</h3>
              <p class="chart-subtitle">{$_('analytics.charts.multiMetric.subtitle')}</p>
            </div>
          </div>
          {#if chartsLoading}
            <div class="chart-loading"><LoadingSpinner /></div>
          {:else}
            <div class="chart-legend">
              <span class="legend-item"><span class="legend-dot" style="background: #4079c5;"></span>{$_('analytics.charts.multiMetric.requests')}</span>
              <span class="legend-item"><span class="legend-dot" style="background: #2d906b;"></span>{$_('analytics.charts.multiMetric.tokens')}</span>
              <span class="legend-item"><span class="legend-dot" style="background: #DF000C;"></span>{$_('analytics.charts.multiMetric.latency')}</span>
            </div>
            <div id="multi-metric-chart" class="chart-container"></div>
          {/if}
        </div>

        <div class="chart-card">
          <div class="chart-header">
            <div class="chart-icon" style="background: rgba(45, 144, 107, 0.1);">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2d906b" stroke-width="2">
                <path d="M3 3v18h18"/><rect x="7" y="10" width="3" height="7"/><rect x="14" y="5" width="3" height="12"/>
              </svg>
            </div>
            <div>
              <h3 class="chart-title">{$_('analytics.charts.usageGrowth.title')}</h3>
              <p class="chart-subtitle">{$_('analytics.charts.usageGrowth.subtitle')}</p>
            </div>
          </div>
          {#if chartsLoading}
            <div class="chart-loading"><LoadingSpinner /></div>
          {:else}
            <div class="chart-legend">
              <span class="legend-item"><span class="legend-dot" style="background: #4079c5;"></span>{$_('analytics.charts.usageGrowth.requests')}</span>
              <span class="legend-item"><span class="legend-dot" style="background: #2d906b;"></span>{$_('analytics.charts.usageGrowth.tokens')}</span>
            </div>
            <div id="requests-tokens-chart" class="chart-container"></div>
          {/if}
        </div>

        <div class="chart-card">
          <div class="chart-header">
            <div class="chart-icon" style="background: rgba(0, 200, 83, 0.1);">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00C853" stroke-width="2">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </svg>
            </div>
            <div>
              <h3 class="chart-title">{$_('analytics.charts.apiReliability.title')}</h3>
              <p class="chart-subtitle">{$_('analytics.charts.apiReliability.subtitle')}</p>
            </div>
          </div>
          {#if chartsLoading}
            <div class="chart-loading"><LoadingSpinner /></div>
          {:else}
            <div class="chart-legend">
              <span class="legend-item"><span class="legend-dot" style="background: #00C853;"></span>{$_('analytics.charts.apiReliability.success')}</span>
              <span class="legend-item"><span class="legend-dot" style="background: #DF000C;"></span>{$_('analytics.charts.apiReliability.errors')}</span>
            </div>
            <div id="success-error-chart" class="chart-container"></div>
          {/if}
        </div>

        <div class="chart-card">
          <div class="chart-header">
            <div class="chart-icon" style="background: rgba(45, 144, 107, 0.1);">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2d906b" stroke-width="2">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
              </svg>
            </div>
            <div>
              <h3 class="chart-title">{$_('analytics.charts.costTrend.title')}</h3>
              <p class="chart-subtitle">{$_('analytics.charts.costTrend.subtitle')}</p>
            </div>
          </div>
          {#if chartsLoading}
            <div class="chart-loading"><LoadingSpinner /></div>
          {:else}
            <div id="cost-trend-chart" class="chart-container"></div>
          {/if}
        </div>
      </div>
      {/if}
    </section>
  </div>
{/if}

<style>
  .loading-container {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 400px;
  }

  .error-state {
    text-align: center;
    padding: var(--space-3xl);
  }

  .error-message {
    color: var(--brand-red);
    margin-bottom: var(--space-xl);
    font-size: 1rem;
  }

  .analytics-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-3xl);
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-xl);
    flex-wrap: wrap;
    gap: var(--space-md);
  }

  .section-header .section-title {
    margin-bottom: 0;
  }

  .section-title {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0;
    letter-spacing: -0.02em;
    margin-bottom: var(--space-md);
  }

  /* Aggregation control inline with title */
  .aggregation-control {
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }

  .aggregation-label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-secondary);
  }

  .pill-group--compact {
    padding: 0.125rem;
  }

  .pill-group--compact .pill-group__item {
    padding: 0.375rem 0.75rem;
    font-size: 0.8125rem;
  }

  /* Enhanced active state for aggregation buttons */
  .aggregation-control .pill-group__item--active {
    background: var(--brand);
    color: white;
    font-weight: 600;
    box-shadow:
      0 2px 8px rgba(var(--brand-rgb), 0.3),
      0 1px 2px rgba(0, 0, 0, 0.1);
  }

  .aggregation-control .pill-group__item--active:hover {
    background: color-mix(in oklab, var(--brand) 90%, white);
    color: white;
  }

  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 0fr));
    gap: var(--space-xl);
  }

  :global(.metric-card) {
    transition: transform 0.2s ease;
  }

  .metric-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .metric-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .metric-label {
    font-size: 0.875rem;
    color: var(--text-secondary);
    font-weight: 500;
  }

  .metric-growth {
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.25rem 0.5rem;
    border-radius: var(--radius-full);
  }

  .metric-growth.positive {
    color: var(--brand-green);
    background: color-mix(in oklab, var(--brand-green) 15%, transparent);
  }

  .metric-growth.negative {
    color: var(--brand-red);
    background: color-mix(in oklab, var(--brand-red) 15%, transparent);
  }

  .metric-growth-wrapper {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
  }

  .metric-growth-period {
    font-size: 0.625rem;
    color: var(--text-tertiary);
    font-weight: 400;
  }

  .metric-value {
    font-size: 2rem;
    font-weight: 700;
    color: var(--text-primary);
    letter-spacing: -0.02em;
  }

  .metric-subtext {
    font-size: 0.8125rem;
    color: var(--text-secondary);
  }

  .table-container {
    overflow-x: auto;
  }

  .models-table {
    width: 100%;
    border-collapse: collapse;
  }

  .models-table thead {
    background: var(--btn-secondary);
    border-bottom: 1px solid var(--glass-stroke-dark);
  }

  .models-table th {
    padding: var(--space-lg);
    text-align: left;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .models-table td {
    padding: var(--space-lg);
    border-bottom: 1px solid var(--glass-stroke-dark);
    font-size: 0.9375rem;
    color: var(--text-primary);
  }

  .models-table tbody tr {
    transition: background 0.2s ease;
  }

  .models-table tbody tr:hover {
    background: var(--btn-tertiary);
  }

  .model-name {
    font-weight: 600;
    color: var(--brand);
  }

  .provider-name {
    color: var(--text-secondary);
  }

  .charts-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(480px, 1fr));
    gap: var(--space-2xl);
    min-height: 800px; /* Prevent layout shift during chart re-renders */
  }

  .chart-card {
    background: var(--button-bg);
    border: 1px solid var(--glass-stroke-dark);
    border-radius: var(--radius-lg);
    padding: var(--space-2xl);
    box-shadow: var(--glass-shadow-dark);
    transition: all 0.3s ease;
    min-height: 420px; /* Prevent layout shift during loading/re-render */
  }

  .chart-card:hover {
    box-shadow: var(--glass-shadow-emphasis);
    transform: translateY(-2px);
    border-color: var(--glass-stroke-light);
  }

  .chart-header {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    margin-bottom: var(--space-2xl);
  }

  .chart-icon {
    width: 40px;
    height: 40px;
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .chart-title {
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
    line-height: 1.3;
  }

  .chart-subtitle {
    font-size: 0.8125rem;
    color: var(--text-secondary);
    margin: 0.25rem 0 0 0;
    font-weight: 400;
  }

  .chart-legend {
    display: flex;
    gap: var(--space-lg);
    margin-bottom: var(--space-md);
    flex-wrap: wrap;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8125rem;
    color: var(--text-secondary);
  }

  .legend-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    display: inline-block;
  }

  .chart-container {
    min-height: 280px;
    width: 100%;
    position: relative;
  }

  .chart-loading {
    min-height: 280px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-4xl) var(--space-2xl);
    text-align: center;
    background: var(--button-bg);
    border: 1px solid var(--glass-stroke-dark);
    border-radius: var(--radius-lg);
    margin-top: var(--space-xl);
  }

  .empty-state svg {
    margin-bottom: var(--space-xl);
    color: var(--text-secondary);
  }

  .empty-state-text {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: var(--space-sm);
  }

  .empty-state-hint {
    font-size: 0.9375rem;
    color: var(--text-secondary);
    margin: 0;
  }

  @media (max-width: 1200px) {
    .charts-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 768px) {
    .metrics-grid {
      grid-template-columns: 1fr;
    }

    .metric-value {
      font-size: 1.5rem;
    }
  }
</style>
