<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { dashboardStore } from '../stores/index.js';
  import PageHeader from '../components/PageHeader.svelte';
  import LoadingSpinner from '../components/LoadingSpinner.svelte';
  import ChartWrapper from '../components/ChartWrapper.svelte';
  import { toast } from '../../components/Toaster.svelte';
  import type { VisualizationSpec } from 'vega-embed';

  let modelUsageBarSpec = $state<VisualizationSpec | null>(null);
  let costTrendSpec = $state<VisualizationSpec | null>(null);
  let lastErrorShown = $state<string | null>(null);

  onMount(() => {
    dashboardStore.fetch();
  });

  // Build chart specs when data changes
  $effect(() => {
    const data = dashboardStore.data;

    untrack(() => {
      if (data?.usage?.most_used_models?.length) {
        modelUsageBarSpec = {
          $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
          width: 'container',
          height: 350,
          data: {
            values: data.usage.most_used_models.map(m => ({
              model: m.model,
              requests: m.requests,
            })),
          },
          mark: {
            type: 'bar',
            color: 'rgba(64, 121, 197, 0.7)',
            cornerRadiusEnd: 4,
          },
          encoding: {
            x: {
              field: 'model',
              type: 'nominal',
              title: 'Model',
              axis: { labelAngle: -45 },
            },
            y: {
              field: 'requests',
              type: 'quantitative',
              title: 'Requests',
            },
            tooltip: [
              { field: 'model', type: 'nominal', title: 'Model' },
              { field: 'requests', type: 'quantitative', title: 'Requests' },
            ],
          },
        };
      } else {
        modelUsageBarSpec = null;
      }

      if (data?.cost_trend?.length) {
        costTrendSpec = {
          $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
          width: 'container',
          height: 350,
          data: {
            values: data.cost_trend.flatMap(d => [
              { date: d.date, value: d.cost, metric: 'Cost ($)' },
              { date: d.date, value: d.requests, metric: 'Requests' },
            ]),
          },
          layer: [
            {
              mark: {
                type: 'line',
                point: true,
                strokeWidth: 2,
              },
              encoding: {
                x: {
                  field: 'date',
                  type: 'temporal',
                  title: 'Date',
                  axis: { format: '%b %d' },
                },
                y: {
                  field: 'value',
                  type: 'quantitative',
                  title: 'Value',
                },
                color: {
                  field: 'metric',
                  type: 'nominal',
                  title: 'Metric',
                  scale: {
                    domain: ['Cost ($)', 'Requests'],
                    range: ['rgb(64, 121, 197)', 'rgb(45, 144, 107)'],
                  },
                },
                tooltip: [
                  { field: 'date', type: 'temporal', title: 'Date' },
                  { field: 'metric', type: 'nominal', title: 'Metric' },
                  { field: 'value', type: 'quantitative', title: 'Value' },
                ],
              },
            },
          ],
          resolve: {
            scale: { y: 'independent' },
          },
        };
      } else {
        costTrendSpec = null;
      }
    });
  });

  // Handle errors with toast - only show each error once
  $effect(() => {
    const error = dashboardStore.error;
    untrack(() => {
      if (error && error !== lastErrorShown) {
        lastErrorShown = error;
        toast.error(error);
      }
    });
  });
</script>

<div class="usage-container">
  <PageHeader
    title="Usage & Analytics"
    subtitle="Detailed usage statistics and trends"
  >
    {#snippet children()}
      <button
        class="btn-primary"
        onclick={() => dashboardStore.refresh()}
        disabled={dashboardStore.isLoading}
      >
        Refresh
      </button>
    {/snippet}
  </PageHeader>

  {#if dashboardStore.isLoading && !dashboardStore.data}
    <LoadingSpinner size="lg" text="Loading analytics..." />
  {:else if dashboardStore.data}
    <div class="usage-content">
      <!-- Summary Stats -->
      <div class="stats-grid">
        <div class="stat-card">
          <h3>Total Conversations</h3>
          <p class="stat-value">{dashboardStore.data.usage.total_conversations.toLocaleString()}</p>
        </div>
        <div class="stat-card">
          <h3>Total Messages</h3>
          <p class="stat-value">{dashboardStore.data.usage.total_messages.toLocaleString()}</p>
        </div>
        <div class="stat-card">
          <h3>Active Users</h3>
          <p class="stat-value">{dashboardStore.data.usage.active_users.toLocaleString()}</p>
        </div>
        <div class="stat-card">
          <h3>Avg Msgs/Conv</h3>
          <p class="stat-value">{dashboardStore.data.usage.avg_messages_per_conversation.toFixed(1)}</p>
        </div>
      </div>

      <!-- Model Usage -->
      <section class="chart-section">
        <h2 class="section-title">Model Usage Distribution</h2>
        <div class="chart-container">
          {#if modelUsageBarSpec}
            <ChartWrapper spec={modelUsageBarSpec} />
          {:else}
            <div class="chart-empty">No model usage data available</div>
          {/if}
        </div>
      </section>

      <!-- Cost & Request Trends -->
      <section class="chart-section">
        <h2 class="section-title">Cost & Request Trends</h2>
        <div class="chart-container">
          {#if costTrendSpec}
            <ChartWrapper spec={costTrendSpec} />
          {:else}
            <div class="chart-empty">No trend data available</div>
          {/if}
        </div>
      </section>

      <!-- Model Details Table -->
      <section class="table-section">
        <h2 class="section-title">Model Details</h2>
        <table class="details-table">
          <thead>
            <tr>
              <th>Model</th>
              <th>Requests</th>
              <th>Percentage</th>
            </tr>
          </thead>
          <tbody>
            {#each dashboardStore.data.usage.most_used_models as model}
              <tr>
                <td>{model.model}</td>
                <td>{model.requests.toLocaleString()}</td>
                <td>
                  <div class="percentage-bar">
                    <div class="percentage-fill" style="width: {model.percentage}%"></div>
                    <span class="percentage-text">{model.percentage.toFixed(1)}%</span>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </section>
    </div>
  {/if}
</div>

<style>
  .usage-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    background: var(--bg-primary);
    padding: var(--space-3xl);
  }

  .usage-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-3xl);
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--space-xl);
  }

  .stat-card {
    padding: var(--space-xl);
    background: rgba(var(--glass-tint), 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-lg);
  }

  .stat-card h3 {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-secondary);
    margin: 0 0 var(--space-md) 0;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .stat-value {
    font-size: 2rem;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0;
  }

  .chart-section {
    padding: var(--space-xl);
    background: rgba(var(--glass-tint), 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-lg);
  }

  .section-title {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0 0 var(--space-xl) 0;
  }

  .chart-container {
    min-height: 400px;
  }

  .chart-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 350px;
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .table-section {
    padding: var(--space-xl);
    background: rgba(var(--glass-tint), 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-lg);
  }

  .details-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: var(--space-lg);
  }

  .details-table th,
  .details-table td {
    padding: var(--space-lg);
    text-align: left;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }

  .details-table th {
    font-weight: 600;
    color: var(--text-secondary);
    font-size: 0.875rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .percentage-bar {
    position: relative;
    width: 100%;
    height: 24px;
    background: rgba(var(--glass-tint), 0.05);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }

  .percentage-fill {
    position: absolute;
    left: 0;
    top: 0;
    height: 100%;
    background: var(--brand);
    transition: width 0.3s ease;
  }

  .percentage-text {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  @media (max-width: 768px) {
    .stats-grid {
      grid-template-columns: repeat(2, 1fr);
    }

    .chart-container {
      min-height: 300px;
    }
  }
</style>
