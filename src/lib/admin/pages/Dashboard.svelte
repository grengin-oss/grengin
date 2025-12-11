<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { dashboardStore } from '../stores/index.js';
  import PageHeader from '../components/PageHeader.svelte';
  import StatCard from '../components/StatCard.svelte';
  import LoadingSpinner from '../components/LoadingSpinner.svelte';
  import ChartWrapper from '../components/ChartWrapper.svelte';
  import { toast } from '../../components/Toaster.svelte';
  import type { VisualizationSpec } from 'vega-embed';

  let costTrendSpec = $state<VisualizationSpec | null>(null);
  let modelUsageSpec = $state<VisualizationSpec | null>(null);
  let lastErrorShown = $state<string | null>(null);

  onMount(() => {
    dashboardStore.fetch();

    // Set up auto-refresh every 30 seconds for near real-time updates
    const interval = setInterval(() => {
      dashboardStore.refresh();
    }, 30000);

    return () => clearInterval(interval);
  });

  // Build chart specs when data changes
  $effect(() => {
    const data = dashboardStore.data;

    untrack(() => {
      if (data?.cost_trend?.length) {
        costTrendSpec = {
          $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
          width: 'container',
          height: 300,
          data: {
            values: data.cost_trend.map(d => ({
              date: d.date,
              cost: d.cost,
            })),
          },
          mark: {
            type: 'line',
            point: true,
            color: 'rgb(64, 121, 197)',
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
              field: 'cost',
              type: 'quantitative',
              title: 'Cost ($)',
            },
            tooltip: [
              { field: 'date', type: 'temporal', title: 'Date' },
              { field: 'cost', type: 'quantitative', title: 'Cost ($)', format: '$.2f' },
            ],
          },
        };
      } else {
        costTrendSpec = null;
      }

      if (data?.usage?.most_used_models?.length) {
        modelUsageSpec = {
          $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
          width: 'container',
          height: 300,
          data: {
            values: data.usage.most_used_models.map(m => ({
              model: m.model,
              requests: m.requests,
            })),
          },
          mark: {
            type: 'arc',
            innerRadius: 60,
          },
          encoding: {
            theta: {
              field: 'requests',
              type: 'quantitative',
            },
            color: {
              field: 'model',
              type: 'nominal',
              title: 'Model',
              scale: {
                range: ['rgba(64, 121, 197, 0.8)', 'rgba(45, 144, 107, 0.8)', 'rgba(58, 129, 167, 0.8)'],
              },
            },
            tooltip: [
              { field: 'model', type: 'nominal', title: 'Model' },
              { field: 'requests', type: 'quantitative', title: 'Requests' },
            ],
          },
        };
      } else {
        modelUsageSpec = null;
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

  function formatNumber(num: number): string {
    return new Intl.NumberFormat().format(num);
  }

  function formatCurrency(num: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(num);
  }
</script>

<div class="dashboard-container">
  <PageHeader
    title="Admin Dashboard"
    subtitle="System overview and key metrics"
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
    <LoadingSpinner size="lg" text="Loading dashboard..." />
  {:else if dashboardStore.data}
    <div class="dashboard-content">
      <!-- User Stats -->
      <section class="dashboard-section">
        <h2 class="section-title">User Statistics</h2>
        <div class="stats-grid">
          <StatCard
            title="Total Users"
            value={formatNumber(dashboardStore.data.users.total)}
            icon="👥"
          />
          <StatCard
            title="Active Users"
            value={formatNumber(dashboardStore.data.users.active)}
            subtitle={`${formatNumber(dashboardStore.data.usage.active_users)} active this month`}
            icon="✅"
          />
          <StatCard
            title="New This Month"
            value={formatNumber(dashboardStore.data.users.new_this_month)}
            icon="🆕"
          />
        </div>
      </section>

      <!-- Usage Stats -->
      <section class="dashboard-section">
        <h2 class="section-title">Usage Statistics</h2>
        <div class="stats-grid">
          <StatCard
            title="Total Conversations"
            value={formatNumber(dashboardStore.data.usage.total_conversations)}
            icon="💬"
          />
          <StatCard
            title="Total Messages"
            value={formatNumber(dashboardStore.data.usage.total_messages)}
            subtitle={`Avg ${dashboardStore.data.usage.avg_messages_per_conversation} per conversation`}
            icon="📝"
          />
          <StatCard
            title="Avg Requests/User"
            value={formatNumber(dashboardStore.data.usage.avg_requests_per_user)}
            icon="📊"
          />
        </div>
      </section>

      <!-- Cost Stats -->
      <section class="dashboard-section">
        <h2 class="section-title">Cost Overview</h2>
        <div class="stats-grid">
          <StatCard
            title="Total Cost"
            value={formatCurrency(dashboardStore.data.costs.total_cost)}
            subtitle="Current period"
            icon="💰"
          />
          <StatCard
            title="Total Requests"
            value={formatNumber(dashboardStore.data.costs.total_requests)}
            icon="🔄"
          />
          <StatCard
            title="Total Tokens"
            value={formatNumber(dashboardStore.data.costs.total_tokens)}
            subtitle={`${formatNumber(dashboardStore.data.costs.input_tokens)} in / ${formatNumber(dashboardStore.data.costs.output_tokens)} out`}
            icon="🎯"
          />
        </div>
      </section>

      <!-- Charts -->
      <div class="charts-grid">
        <section class="chart-card">
          <h3 class="chart-title">Cost Trend</h3>
          {#if costTrendSpec}
            <ChartWrapper spec={costTrendSpec} />
          {:else}
            <div class="chart-empty">No cost trend data available</div>
          {/if}
        </section>

        <section class="chart-card">
          <h3 class="chart-title">Model Usage</h3>
          {#if modelUsageSpec}
            <ChartWrapper spec={modelUsageSpec} />
          {:else}
            <div class="chart-empty">No model usage data available</div>
          {/if}
        </section>
      </div>

      <!-- System Health -->
      <section class="dashboard-section">
        <h2 class="section-title">System Health</h2>
        <div class="health-card">
          <div class="health-status {dashboardStore.data.system_health.status}">
            <span class="status-indicator"></span>
            <span class="status-text">
              {dashboardStore.data.system_health.status.toUpperCase()}
            </span>
          </div>
          <div class="health-services">
            <div class="service-item">
              <span class="service-label">Database:</span>
              <span class="service-status {dashboardStore.data.system_health.services.database}">
                {dashboardStore.data.system_health.services.database}
              </span>
            </div>
            <div class="service-item">
              <span class="service-label">Redis:</span>
              <span class="service-status {dashboardStore.data.system_health.services.redis}">
                {dashboardStore.data.system_health.services.redis}
              </span>
            </div>
            {#each Object.entries(dashboardStore.data.system_health.services.llm_providers) as [provider, status]}
              <div class="service-item">
                <span class="service-label">{provider}:</span>
                <span class="service-status {status}">{status}</span>
              </div>
            {/each}
          </div>
          <div class="health-meta">
            <p>Version: {dashboardStore.data.system_health.version}</p>
            <p>Last updated: {new Date(dashboardStore.data.system_health.timestamp).toLocaleString()}</p>
          </div>
        </div>
      </section>
    </div>
  {/if}
</div>

<style>
  .dashboard-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    background: var(--bg-primary);
    padding: var(--space-3xl);
  }

  .dashboard-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-3xl);
  }

  .dashboard-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-xl);
  }

  .section-title {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: var(--space-xl);
  }

  .charts-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
    gap: var(--space-xl);
  }

  .chart-card {
    padding: var(--space-xl);
    background: rgba(var(--glass-tint), 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-lg);
  }

  .chart-title {
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 var(--space-xl) 0;
  }

  .chart-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 300px;
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .health-card {
    padding: var(--space-xl);
    background: rgba(var(--glass-tint), 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-lg);
    display: flex;
    flex-direction: column;
    gap: var(--space-xl);
  }

  .health-status {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    font-size: 1.125rem;
    font-weight: 700;
  }

  .status-indicator {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--brand-green);
    animation: pulse 2s infinite;
  }

  .health-status.degraded .status-indicator {
    background: #FFA500;
  }

  .health-status.down .status-indicator {
    background: var(--brand-red);
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .status-text {
    color: var(--brand-green);
  }

  .health-status.degraded .status-text {
    color: #FFA500;
  }

  .health-status.down .status-text {
    color: var(--brand-red);
  }

  .health-services {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: var(--space-lg);
  }

  .service-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-md);
    background: rgba(var(--glass-tint), 0.03);
    border-radius: var(--radius-sm);
  }

  .service-label {
    font-weight: 500;
    color: var(--text-secondary);
    text-transform: capitalize;
  }

  .service-status {
    font-weight: 600;
    text-transform: uppercase;
    font-size: 0.8125rem;
    padding: var(--space-xs) var(--space-sm);
    border-radius: var(--radius-sm);
  }

  .service-status.up {
    color: var(--brand-green);
    background: rgba(var(--brand-green-rgb), 0.1);
  }

  .service-status.down {
    color: var(--brand-red);
    background: rgba(var(--brand-red-rgb), 0.1);
  }

  .health-meta {
    padding-top: var(--space-lg);
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    display: flex;
    justify-content: space-between;
    gap: var(--space-lg);
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .health-meta p {
    margin: 0;
  }

  @media (max-width: 768px) {
    .stats-grid {
      grid-template-columns: 1fr;
    }

    .charts-grid {
      grid-template-columns: 1fr;
    }

    .health-services {
      grid-template-columns: 1fr;
    }

    .health-meta {
      flex-direction: column;
      gap: var(--space-sm);
    }
  }
</style>
