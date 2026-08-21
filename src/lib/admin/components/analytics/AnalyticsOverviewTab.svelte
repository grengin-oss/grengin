<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { tick } from "svelte";
  import LoadingSpinner from "../LoadingSpinner.svelte";
  import ChartDataTableModal from "./ChartDataTableModal.svelte";
  import AnalyticsTrendChart from "./AnalyticsTrendChart.svelte";
  import type {
    AnalyticsOverview,
    AnalyticsTimeseries,
    TimeseriesDataPoint,
  } from "../../types.js";
  import { _ } from "svelte-i18n";

  interface Props {
    overviewData: AnalyticsOverview | null;
    timeseriesData: AnalyticsTimeseries | null;
    isLoading: boolean;
    chartsLoading: boolean;
    comparisonPeriodLabel: string;
    /** Selected range, e.g. "Last 30 days" — the section captions in the design. */
    rangeLabel: string;
    error: string | null;
    onRetry: () => void;
  }

  let {
    overviewData,
    timeseriesData,
    isLoading,
    chartsLoading,
    comparisonPeriodLabel,
    rangeLabel,
    error,
    onRetry,
  }: Props = $props();

  type ChartId =
    | "multi-metric"
    | "usage-growth"
    | "api-reliability"
    | "cost-trend";

  let activeChart = $state<ChartId>("multi-metric");
  let isDataTableOpen = $state(false);

  interface TableColumn {
    id: string;
    label: string;
    value: (row: TimeseriesDataPoint) => string | number;
  }

  const points = $derived(timeseriesData?.data ?? []);
  const hasPoints = $derived(points.length > 0);
  const lowercaseRange = $derived(rangeLabel.toLocaleLowerCase());

  function formatNumber(num: number): string {
    if (num >= 1000000) {
      const val = num / 1000000;
      return (val % 1 === 0 ? val.toString() : val.toFixed(1)) + "M";
    } else if (num >= 1000) {
      const val = num / 1000;
      return (val % 1 === 0 ? val.toString() : val.toFixed(1)) + "K";
    }
    return Math.round(num).toString();
  }

  function formatCurrency(num: number): string {
    return "$" + num.toFixed(2);
  }

  /** Cost axis/tooltip: cents by default, three decimals for sub-cent values. */
  function formatCurrencyPrecise(num: number): string {
    return "$" + num.toFixed(num > 0 && num < 0.01 ? 3 : 2);
  }

  function formatPercentage(num: number): string {
    const sign = num >= 0 ? "+" : "";
    return sign + (num * 100).toFixed(1) + "%";
  }

  function formatMs(num: number): string {
    return Math.round(num) + "ms";
  }

  /** Granularity decides whether a tick reads as a day or an hour. */
  function tickLabel(timestamp: string): string {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return timestamp;
    if (timeseriesData?.granularity === "hour") {
      return date.toLocaleTimeString(undefined, { hour: "numeric" });
    }
    if (timeseriesData?.granularity === "month") {
      return date.toLocaleDateString(undefined, {
        month: "short",
        year: "2-digit",
      });
    }
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "2-digit",
    });
  }

  function fullLabel(timestamp: string): string {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return timestamp;
    return timeseriesData?.granularity === "hour"
      ? date.toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "numeric",
        })
      : date.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
  }

  const tickLabels = $derived(
    points.map((point) => tickLabel(point.timestamp)),
  );
  const fullLabels = $derived(
    points.map((point) => fullLabel(point.timestamp)),
  );

  interface ChartConfig {
    id: ChartId;
    tabLabel: string;
    title: string;
    subtitle: string;
    series: {
      key: string;
      label: string;
      color: string;
      values: number[];
      axis?: "left" | "right";
      tooltipOnly?: boolean;
      format?: (value: number) => string;
    }[];
    columns: TableColumn[];
    /** Series the insight sentence talks about. */
    insightKey: string;
  }

  const CHART_CONFIGS = $derived<ChartConfig[]>([
    {
      id: "multi-metric",
      tabLabel: $_("analytics.charts.multiMetric.tabLabel"),
      title: $_("analytics.charts.multiMetric.title"),
      subtitle: $_("analytics.charts.multiMetric.subtitle"),
      series: [
        {
          key: "requests",
          label: $_("analytics.charts.multiMetric.requests"),
          color: "var(--gx-an-line)",
          values: points.map((point) => point.total_requests),
          format: formatNumber,
        },
        {
          key: "tokens",
          label: $_("analytics.charts.multiMetric.tokens"),
          color: "var(--gx-an-green)",
          values: points.map((point) => point.total_tokens),
          tooltipOnly: true,
          format: formatNumber,
        },
        {
          key: "latency",
          label: $_("analytics.charts.multiMetric.latency"),
          color: "var(--gx-an-red)",
          values: points.map((point) => point.average_latency),
          tooltipOnly: true,
          format: formatMs,
        },
      ],
      columns: [
        {
          id: "date",
          label: $_("analytics.charts.multiMetric.date"),
          value: (row) => fullLabel(row.timestamp),
        },
        {
          id: "requests",
          label: $_("analytics.charts.multiMetric.requests"),
          value: (row) => formatNumber(row.total_requests),
        },
        {
          id: "tokens",
          label: $_("analytics.charts.multiMetric.tokens"),
          value: (row) => formatNumber(row.total_tokens),
        },
        {
          id: "latency",
          label: $_("analytics.charts.multiMetric.latencyMs"),
          value: (row) => row.average_latency.toFixed(2),
        },
      ],
      insightKey: "requests",
    },
    {
      id: "usage-growth",
      tabLabel: $_("analytics.charts.usageGrowth.title"),
      title: $_("analytics.charts.usageGrowth.title"),
      subtitle: $_("analytics.charts.usageGrowth.subtitle"),
      series: [
        {
          key: "requests",
          label: $_("analytics.charts.usageGrowth.requests"),
          color: "var(--gx-an-line)",
          values: points.map((point) => point.total_requests),
          format: formatNumber,
        },
        {
          key: "tokens",
          label: $_("analytics.charts.usageGrowth.tokens"),
          color: "var(--gx-an-green)",
          values: points.map((point) => point.total_tokens),
          axis: "right",
          format: formatNumber,
        },
      ],
      columns: [
        {
          id: "date",
          label: $_("analytics.charts.multiMetric.date"),
          value: (row) => fullLabel(row.timestamp),
        },
        {
          id: "requests",
          label: $_("analytics.charts.usageGrowth.requests"),
          value: (row) => formatNumber(row.total_requests),
        },
        {
          id: "tokens",
          label: $_("analytics.charts.usageGrowth.tokens"),
          value: (row) => formatNumber(row.total_tokens),
        },
      ],
      insightKey: "tokens",
    },
    {
      id: "api-reliability",
      tabLabel: $_("analytics.charts.apiReliability.title"),
      title: $_("analytics.charts.apiReliability.title"),
      subtitle: $_("analytics.charts.apiReliability.subtitle"),
      series: [
        {
          key: "success",
          label: $_("analytics.charts.apiReliability.success"),
          color: "var(--gx-an-green)",
          values: points.map((point) => point.success_count),
          format: formatNumber,
        },
        {
          key: "errors",
          label: $_("analytics.charts.apiReliability.errors"),
          color: "var(--gx-an-red)",
          values: points.map((point) => point.error_count),
          format: formatNumber,
        },
      ],
      columns: [
        {
          id: "date",
          label: $_("analytics.charts.multiMetric.date"),
          value: (row) => fullLabel(row.timestamp),
        },
        {
          id: "success",
          label: $_("analytics.charts.apiReliability.success"),
          value: (row) => formatNumber(row.success_count),
        },
        {
          id: "errors",
          label: $_("analytics.charts.apiReliability.errors"),
          value: (row) => formatNumber(row.error_count),
        },
      ],
      insightKey: "success",
    },
    {
      id: "cost-trend",
      tabLabel: $_("analytics.charts.costTrend.title"),
      title: $_("analytics.charts.costTrend.title"),
      subtitle: $_("analytics.charts.costTrend.subtitle"),
      series: [
        {
          key: "cost",
          label: $_("analytics.charts.costTrend.totalCost"),
          color: "var(--gx-an-line)",
          values: points.map((point) => point.total_cost),
          format: formatCurrencyPrecise,
        },
      ],
      columns: [
        {
          id: "date",
          label: $_("analytics.charts.multiMetric.date"),
          value: (row) => fullLabel(row.timestamp),
        },
        {
          id: "cost",
          label: $_("analytics.charts.costTrend.totalCost"),
          value: (row) => formatCurrency(row.total_cost),
        },
      ],
      insightKey: "cost",
    },
  ]);

  const chart = $derived(
    CHART_CONFIGS.find((config) => config.id === activeChart) ??
      CHART_CONFIGS[0],
  );

  /** The design's insight strip: peak point of the chart's headline series. */
  const insight = $derived.by(() => {
    const series =
      chart.series.find((item) => item.key === chart.insightKey) ??
      chart.series[0];
    if (!series || series.values.length < 2) return "";
    const format = series.format ?? formatNumber;
    let peakIndex = 0;
    let peak = series.values[0];
    let low = series.values[0];
    series.values.forEach((value, index) => {
      if (value > peak) {
        peak = value;
        peakIndex = index;
      }
      if (value < low) low = value;
    });
    if (peak <= 0 || peak === low) {
      return $_("analytics.charts.insight.flat", {
        values: { metric: series.label },
      });
    }
    const peakDate = new Date(points[peakIndex]?.timestamp ?? "");
    const day = Number.isNaN(peakDate.getTime())
      ? (fullLabels[peakIndex] ?? "")
      : timeseriesData?.granularity === "hour"
        ? (fullLabels[peakIndex] ?? "")
        : peakDate.toLocaleDateString(undefined, { weekday: "long" });
    const ratio = low > 0 ? (peak / low).toFixed(1) : format(peak);
    return $_("analytics.charts.insight.peak", {
      values: { metric: series.label, day, value: format(peak), ratio },
    });
  });

  const PROVIDER_COLORS: Record<string, string> = {
    openai: "var(--gx-org-kpi-icon-fg)",
    anthropic: "var(--gx-an-violet)",
    google: "var(--gx-an-amber)",
    azure: "var(--gx-an-blue)",
    mistral: "var(--gx-an-rose)",
  };

  function providerColor(provider: string): string {
    return (
      PROVIDER_COLORS[provider?.toLowerCase?.() ?? ""] ?? "var(--gx-an-axis)"
    );
  }

  function growthBadgeClass(rate: number): string {
    return rate < 0
      ? "stat-badge stat-badge--down"
      : "stat-badge stat-badge--up";
  }

  function closeDataTable() {
    isDataTableOpen = false;
    tick().then(() => {
      (document.querySelector(".view-data-btn") as HTMLElement | null)?.focus();
    });
  }

  function handleGlobalKeydown(event: KeyboardEvent) {
    if (event.key === "Escape" && isDataTableOpen) {
      event.preventDefault();
      closeDataTable();
    }
  }
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

{#if isLoading}
  <div
    class="loading-container"
    role="status"
    aria-live="polite"
    aria-busy="true"
  >
    <LoadingSpinner />
  </div>
{:else if error}
  <div class="error-state" role="alert">
    <p class="error-message">{error}</p>
    <button type="button" class="retry-btn" onclick={onRetry}
      >{$_("analytics.retry")}</button
    >
  </div>
{:else if overviewData}
  <div class="analytics-content">
    <!-- ===================== Quick Stats ===================== -->
    <section class="section" aria-label={$_("analytics.overview.quickStats")}>
      <div class="section-head">
        <h2 class="section-title">{$_("analytics.overview.quickStats")}</h2>
        <span class="section-sub">{rangeLabel}</span>
      </div>

      <div class="stats-row">
        <div class="stat-card">
          <span class="stat-card__bar" style="background: var(--gx-an-green)"
          ></span>
          <div class="stat-card__head">
            <span class="stat-title">{$_("analytics.overview.totalUsers")}</span
            >
          </div>
          <span class="stat-value"
            >{formatNumber(overviewData.total_users)}</span
          >
          <div class="stat-desc">
            <span class="stat-desc-dot" style="background: var(--gx-an-green)"
            ></span>
            <span class="stat-desc-text" style="color: var(--gx-an-green)">
              {$_("analytics.overview.activeUsers", {
                values: { count: formatNumber(overviewData.active_users) },
              })}
            </span>
          </div>
        </div>

        <div class="stat-card">
          <span class="stat-card__bar" style="background: var(--gx-an-bar-blue)"
          ></span>
          <div class="stat-card__head">
            <span class="stat-title"
              >{$_("analytics.overview.totalRequests")}</span
            >
            {#if overviewData.request_growth_rate !== 0}
              <span
                class={growthBadgeClass(overviewData.request_growth_rate)}
                title={comparisonPeriodLabel}
              >
                {formatPercentage(overviewData.request_growth_rate)}
              </span>
            {/if}
          </div>
          <span class="stat-value"
            >{formatNumber(overviewData.total_requests)}</span
          >
          <span class="stat-desc-muted">{rangeLabel}</span>
        </div>

        <div class="stat-card">
          <span class="stat-card__bar" style="background: var(--gx-an-bar-blue)"
          ></span>
          <div class="stat-card__head">
            <span class="stat-title"
              >{$_("analytics.overview.totalTokens")}</span
            >
            {#if overviewData.token_growth_rate !== 0}
              <span
                class={growthBadgeClass(overviewData.token_growth_rate)}
                title={comparisonPeriodLabel}
              >
                {formatPercentage(overviewData.token_growth_rate)}
              </span>
            {/if}
          </div>
          <span class="stat-value"
            >{formatNumber(overviewData.total_tokens)}</span
          >
          <span class="stat-desc-muted">{rangeLabel}</span>
        </div>

        <div class="stat-card">
          <span class="stat-card__bar" style="background: var(--gx-an-bar-blue)"
          ></span>
          <div class="stat-card__head">
            <span class="stat-title">{$_("analytics.overview.totalCost")}</span>
            {#if overviewData.cost_growth_rate !== 0}
              <span
                class={growthBadgeClass(overviewData.cost_growth_rate)}
                title={comparisonPeriodLabel}
              >
                {formatPercentage(overviewData.cost_growth_rate)}
              </span>
            {/if}
          </div>
          <span class="stat-value"
            >{formatCurrency(overviewData.total_cost)}</span
          >
          <span class="stat-desc-muted">{rangeLabel}</span>
        </div>
      </div>
    </section>

    <!-- ===================== trends card ===================== -->
    <div class="chart-card">
      <div
        class="chart-tabs"
        role="tablist"
        aria-label={$_("analytics.charts.title")}
      >
        {#each CHART_CONFIGS as config (config.id)}
          <button
            type="button"
            class="chart-tab"
            class:chart-tab--active={activeChart === config.id}
            class:chart-tab--inactive={activeChart !== config.id}
            role="tab"
            aria-selected={activeChart === config.id}
            onclick={() => (activeChart = config.id)}
          >
            {#if config.id === "multi-metric"}
              <svg
                width="14"
                height="13"
                viewBox="0 0 14 13"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M1 9.5L4.5 5.5L7 7.5L13 1.5"
                  stroke="currentColor"
                  stroke-width="1.3"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            {:else if config.id === "usage-growth"}
              <svg
                width="14"
                height="13"
                viewBox="0 0 14 13"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M2.25 11.5V7M7 11.5V2.5M11.75 11.5V5"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                />
              </svg>
            {:else if config.id === "api-reliability"}
              <svg
                width="11"
                height="13"
                viewBox="0 0 11 13"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M5.5 1L10 2.6v4.1c0 2.6-1.8 4.4-4.5 5.3C2.8 11.1 1 9.3 1 6.7V2.6L5.5 1Z"
                  stroke="currentColor"
                  stroke-width="1"
                />
                <path
                  d="M3.6 6.5l1.5 1.5 2.4-2.8"
                  stroke="currentColor"
                  stroke-width="1"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            {:else}
              <svg
                width="9"
                height="13"
                viewBox="0 0 9 13"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M4.5 1v11"
                  stroke="currentColor"
                  stroke-width="1"
                  stroke-linecap="round"
                />
                <path
                  d="M7 3.4C6.3 2.6 5.5 2.2 4.4 2.2 3 2.2 2 2.9 2 4.1c0 1.3 1.2 1.7 2.6 2 1.5.3 2.6.8 2.6 2.1 0 1.3-1.1 2-2.6 2-1.2 0-2.1-.4-2.8-1.3"
                  stroke="currentColor"
                  stroke-width="1"
                  stroke-linecap="round"
                />
              </svg>
            {/if}
            {config.tabLabel}
          </button>
        {/each}
      </div>

      <div class="chart-title-row">
        <div class="chart-title-group">
          <h3 class="chart-title">{chart.title}</h3>
          <span class="chart-subtitle">{chart.subtitle}</span>
        </div>
        <button
          type="button"
          class="view-data-btn"
          onclick={() => (isDataTableOpen = true)}
          disabled={!hasPoints}
          aria-label={$_("analytics.charts.accessibility.viewDataTableFor", {
            values: { chartName: chart.title },
          })}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 14 14"
            fill="none"
            aria-hidden="true"
          >
            <rect
              x="1.75"
              y="1.75"
              width="10.5"
              height="10.5"
              rx="2"
              stroke="currentColor"
              stroke-width="1.3"
            />
            <path
              d="M1.75 5.5h10.5M5.5 5.5v6.75"
              stroke="currentColor"
              stroke-width="1.3"
            />
          </svg>
          <span>{$_("analytics.charts.accessibility.viewDataTable")}</span>
        </button>
      </div>

      {#if chartsLoading}
        <div class="chart-loading"><LoadingSpinner /></div>
      {:else if !hasPoints}
        <div class="empty-state">
          <p class="empty-state-text">
            {$_("analytics.charts.emptyState.title")}
          </p>
          <p class="empty-state-hint">
            {$_("analytics.charts.emptyState.hint")}
          </p>
        </div>
      {:else}
        <div class="legend">
          {#each chart.series.filter((item) => !item.tooltipOnly) as item (item.key)}
            <span class="legend-item">
              <span class="legend-dot" style="background: {item.color}"></span>
              <span>{item.label}</span>
            </span>
          {/each}
        </div>

        <p class="sr-only">
          {chart.title}. {chart.subtitle}.
          {$_("analytics.charts.accessibility.dataPoints", {
            values: { count: points.length },
          })}.
        </p>

        <AnalyticsTrendChart
          series={chart.series}
          labels={tickLabels}
          tooltipLabels={fullLabels}
          axisLabel={$_("analytics.charts.multiMetric.date")}
        />

        {#if insight}
          <div class="insight-bar">
            <svg
              width="12"
              height="12"
              viewBox="0 0 14 14"
              fill="none"
              aria-hidden="true"
            >
              <circle
                cx="7"
                cy="7"
                r="5.25"
                stroke="currentColor"
                stroke-width="1.3"
              />
              <path
                d="M7 4.2v.6M7 6.4v3.4"
                stroke="currentColor"
                stroke-width="1.3"
                stroke-linecap="round"
              />
            </svg>
            <span>{insight}</span>
          </div>
        {/if}
      {/if}
    </div>

    <!-- ===================== Top Models ===================== -->
    {#if overviewData.top_models && overviewData.top_models.length > 0}
      <section class="section" aria-label={$_("analytics.topModels.title")}>
        <div class="section-head">
          <h2 class="section-title">{$_("analytics.topModels.title")}</h2>
          <span class="section-sub">
            {$_("analytics.topModels.subtitleByCost", {
              values: { range: lowercaseRange },
            })}
          </span>
        </div>

        <div
          class="table-container"
          role="table"
          aria-label={$_("analytics.aria.topModelsCaption")}
        >
          <div class="table-header" role="row">
            <span role="columnheader">{$_("analytics.topModels.model")}</span>
            <span role="columnheader">{$_("analytics.topModels.provider")}</span
            >
            <span role="columnheader">{$_("analytics.topModels.requests")}</span
            >
            <span role="columnheader">{$_("analytics.topModels.tokens")}</span>
            <span role="columnheader">{$_("analytics.topModels.cost")}</span>
          </div>
          {#each overviewData.top_models as model (model.model_name + model.model_provider)}
            <div class="model-row" role="row">
              <div role="cell">
                <span class="model-name">{model.model_name}</span>
              </div>
              <div role="cell">
                <span
                  class="provider-dot"
                  style="background: {providerColor(model.model_provider)}"
                ></span>
                <span class="provider-name">{model.model_provider}</span>
              </div>
              <div role="cell">
                <span class="table-value"
                  >{formatNumber(model.total_requests)}</span
                >
              </div>
              <div role="cell">
                <span class="table-value"
                  >{formatNumber(model.total_tokens)}</span
                >
              </div>
              <div role="cell">
                <span class="table-value--cost"
                  >{formatCurrency(model.total_cost)}</span
                >
              </div>
            </div>
          {/each}
        </div>
      </section>
    {/if}
  </div>
{/if}

{#if isDataTableOpen && hasPoints}
  <ChartDataTableModal
    title={chart.title}
    caption={`${chart.title} data`}
    rows={points}
    columns={chart.columns}
    onClose={closeDataTable}
  />
{/if}

<style>
  button {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .analytics-content {
    display: flex;
    flex-direction: column;
    gap: 28px;
    font-family: var(--gx-font);
  }

  .loading-container,
  .chart-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 64px 20px;
  }

  .error-state {
    display: flex;
    flex-direction: column;
    gap: 16px;
    align-items: center;
    padding: 48px 24px;
    border-radius: 16px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-an-ring);
  }

  .error-message {
    margin: 0;
    font-size: 13px;
    color: var(--gx-an-sub);
  }

  .retry-btn {
    height: 33px;
    border: 0;
    border-radius: 8px;
    background: var(--gx-org-brand);
    box-shadow: none;
    padding: 0 14px;
    font-family: inherit;
    font-weight: 600;
    font-size: 13px;
    color: #fff;
    cursor: pointer;
  }

  /* ---------------- section shell ---------------- */
  .section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .section-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
  }

  .section-title {
    margin: 0;
    font-weight: 700;
    font-size: 15px;
    line-height: 100%;
    color: var(--gx-ink);
  }

  .section-sub {
    font-weight: 500;
    font-size: 14px;
    line-height: 100%;
    color: var(--gx-an-sub);
  }

  /* ---------------- quick stats ---------------- */
  .stats-row {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
  }

  .stat-card {
    position: relative;
    flex: 1 1 200px;
    min-height: 124px;
    overflow: hidden;
    border-radius: 12px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-an-ring);
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
  }

  .stat-card__bar {
    position: absolute;
    inset-inline-start: 0;
    top: 0;
    width: 100%;
    height: 3px;
  }

  .stat-card__head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }

  .stat-title {
    font-weight: 500;
    font-size: 14px;
    line-height: 100%;
    color: var(--gx-an-sub);
    white-space: nowrap;
  }

  .stat-badge {
    border-radius: 4px;
    padding: 2px 6px;
    font-weight: 700;
    font-size: 10px;
    line-height: 1.4;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .stat-badge--down {
    background: var(--gx-an-badge-down-bg);
    color: var(--gx-an-badge-down-fg);
  }

  .stat-badge--up {
    background: var(--gx-an-badge-up-bg);
    color: var(--gx-an-badge-up-fg);
  }

  .stat-value {
    font-weight: 700;
    font-size: 28px;
    line-height: 100%;
    color: var(--gx-ink);
  }

  .stat-desc {
    display: flex;
    gap: 4px;
    align-items: center;
  }

  .stat-desc-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .stat-desc-text {
    font-weight: 600;
    font-size: 14px;
    line-height: 100%;
  }

  .stat-desc-muted {
    font-weight: 400;
    font-size: 11px;
    line-height: 100%;
    color: var(--gx-slate-400);
  }

  /* ---------------- trends card ---------------- */
  .chart-card {
    border-radius: 16px;
    background: var(--gx-card);
    box-shadow: var(--gx-an-card-shadow);
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 24px;
  }

  .chart-tabs {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .chart-tab {
    height: 32px;
    border: 0;
    border-radius: 8px;
    display: flex;
    gap: 8px;
    padding: 6px 12px;
    align-items: center;
    font-family: inherit;
    font-weight: 500;
    font-size: 12px;
    line-height: 100%;
    white-space: nowrap;
    cursor: pointer;
    transition:
      background-color 120ms ease,
      color 120ms ease;
  }

  .chart-tab svg {
    flex-shrink: 0;
  }

  .chart-tab--inactive {
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-an-chip-ring);
    color: var(--gx-an-chip-fg);
  }

  .chart-tab--inactive:hover {
    background: var(--gx-an-blue-tint-soft);
    color: var(--gx-an-blue);
    transform: none;
  }

  .chart-tab--active {
    background: var(--gx-an-blue-tint);
    box-shadow: none;
    padding-inline-start: 6px;
    color: var(--gx-an-blue);
  }

  .chart-tab--active:hover {
    background: var(--gx-an-blue-tint);
    transform: none;
  }

  .chart-title-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
  }

  .chart-title-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .chart-title {
    margin: 0;
    font-family: var(--gx-font-display);
    font-weight: 700;
    font-size: 18px;
    line-height: 100%;
    color: var(--gx-an-strong);
  }

  .chart-subtitle {
    font-weight: 400;
    font-size: 13px;
    line-height: 100%;
    color: var(--gx-an-sub);
  }

  .view-data-btn {
    height: 32px;
    border: 0;
    border-radius: 8px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-an-chip-ring);
    display: flex;
    gap: 4px;
    padding: 6px 12px;
    align-items: center;
    flex-shrink: 0;
    font-family: inherit;
    color: var(--gx-an-chip-fg);
    cursor: pointer;
    transition: background-color 120ms ease;
  }

  .view-data-btn span {
    font-weight: 500;
    font-size: 10px;
    line-height: 100%;
    white-space: nowrap;
  }

  .view-data-btn:hover:not(:disabled) {
    background: var(--gx-an-blue-tint-soft);
    color: var(--gx-an-blue);
    transform: none;
  }

  .view-data-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .legend {
    display: flex;
    gap: 16px;
    align-items: center;
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

  .legend-item span {
    font-weight: 500;
    font-size: 12px;
    line-height: 100%;
    color: var(--gx-an-strong);
  }

  .insight-bar {
    min-height: 32px;
    border-radius: 8px;
    background: var(--gx-an-insight-bg);
    display: flex;
    gap: 4px;
    padding: 10px 16px;
    align-items: center;
  }

  .insight-bar svg {
    flex-shrink: 0;
    color: var(--gx-an-chip-fg);
  }

  .insight-bar span {
    font-weight: 400;
    font-size: 10px;
    line-height: 1.4;
    color: var(--gx-an-insight-fg);
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: center;
    padding: 48px 24px;
    border-radius: 12px;
    box-shadow: inset 0 0 0 1px var(--gx-an-ring);
  }

  .empty-state-text {
    margin: 0;
    font-weight: 600;
    font-size: 13px;
    color: var(--gx-an-strong);
  }

  .empty-state-hint {
    margin: 0;
    font-size: 12px;
    color: var(--gx-an-sub);
  }

  /* ---------------- top models ---------------- */
  .table-container {
    border-radius: 12px;
    overflow: hidden;
    box-shadow: inset 0 0 0 1px var(--gx-an-table-ring);
  }

  .table-header {
    min-height: 41px;
    background: var(--gx-an-thead-bg);
    border: 1px solid var(--gx-an-ring);
    display: flex;
    padding: 12px 16px;
    align-items: center;
    gap: 12px;
  }

  .table-header span {
    flex: 1;
    min-width: 0;
    font-weight: 600;
    font-size: 14px;
    line-height: 100%;
    text-transform: uppercase;
    color: var(--gx-an-sub);
  }

  .model-row {
    min-height: 41px;
    background: var(--gx-card);
    border: 1px solid var(--gx-an-ring);
    border-top: none;
    display: flex;
    padding: 12px 16px;
    align-items: center;
    gap: 12px;
  }

  .model-row > div {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .model-name {
    font-weight: 700;
    font-size: 13px;
    line-height: 100%;
    color: var(--gx-ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .provider-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .provider-name {
    font-weight: 500;
    font-size: 14px;
    line-height: 100%;
    color: var(--gx-ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .table-value {
    font-weight: 500;
    font-size: 14px;
    line-height: 100%;
    color: var(--gx-ink);
  }

  .table-value--cost {
    font-weight: 700;
    font-size: 13px;
    line-height: 100%;
    color: var(--gx-ink);
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .chart-tab:focus-visible,
  .view-data-btn:focus-visible,
  .retry-btn:focus-visible {
    outline: 2px solid var(--gx-an-blue);
    outline-offset: 2px;
  }

  @media (max-width: 900px) {
    .stat-card {
      flex-basis: 45%;
    }

    .table-header,
    .model-row {
      font-size: 12px;
    }
  }
</style>
