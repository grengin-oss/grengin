<script lang="ts">
  import { onMount } from 'svelte';
  import { dashboardStore } from '../stores';
  import PageHeader from '../components/PageHeader.svelte';
  import StatCard from '../components/StatCard.svelte';
  import LoadingSpinner from '../components/LoadingSpinner.svelte';
  import ErrorMessage from '../components/ErrorMessage.svelte';
  import ChartWrapper from '../components/ChartWrapper.svelte';
  import type { AdminDashboard } from '../types';

  let dashboardData = $state<{
    data: AdminDashboard | null;
    isLoading: boolean;
    error: string | null;
    lastFetch: number | null;
  }>({ data: null, isLoading: false, error: null, lastFetch: null });
  
  $effect(() => {
    const unsubscribe = dashboardStore.subscribe(state => {
      console.log('dashboardData', state);
      dashboardData = state;
    });
    return unsubscribe;
  });

  onMount(() => {
    dashboardStore.fetch();

    // Set up auto-refresh every 30 seconds for near real-time updates
    const interval = setInterval(() => {
      dashboardStore.refresh();
    }, 30000);

    return () => clearInterval(interval);
  });

  const costTrendChart = $derived({
    labels: dashboardData.data?.cost_trend.map(d => d.date) || [],
    datasets: [
      {
        label: 'Cost ($)',
        data: dashboardData.data?.cost_trend.map(d => d.cost) || [],
        borderColor: 'rgb(64, 121, 197)',
        backgroundColor: 'rgba(64, 121, 197, 0.1)',
        tension: 0.4,
      },
    ],
  });

  const modelUsageChart = $derived({
    labels: dashboardData.data?.usage.most_used_models.map(m => m.model) || [],
    datasets: [
      {
        label: 'Requests',
        data: dashboardData.data?.usage.most_used_models.map(m => m.requests) || [],
        backgroundColor: [
          'rgba(64, 121, 197, 0.8)',
          'rgba(45, 144, 107, 0.8)',
          'rgba(58, 129, 167, 0.8)',
        ],
        borderWidth: 0,
      },
    ],
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

<PageHeader
  title="Admin Dashboard"
  subtitle="System overview and key metrics"
>
  {#snippet children()}
    <button
      class="btn-primary"
      onclick={() => dashboardStore.refresh()}
      disabled={dashboardData.isLoading}
    >
      Refresh
    </button>
  {/snippet}
</PageHeader>

{#if dashboardData.isLoading && !dashboardData.data}
  <LoadingSpinner size="lg" text="Loading dashboard..." />
{:else if dashboardData.error}
  <ErrorMessage
    message={dashboardData.error}
    onretry={() => dashboardStore.fetch()}
  />
{:else if dashboardData.data}
  <div class="dashboard-content">
    <!-- User Stats -->
    <section class="dashboard-section">
      <h2 class="section-title">User Statistics</h2>
      <div class="stats-grid">
        <StatCard
          title="Total Users"
          value={formatNumber(dashboardData.data.users.total)}
          icon="👥"
        />
        <StatCard
          title="Active Users"
          value={formatNumber(dashboardData.data.users.active)}
          subtitle={`${formatNumber(dashboardData.data.usage.active_users)} active this month`}
          icon="✅"
        />
        <StatCard
          title="New This Month"
          value={formatNumber(dashboardData.data.users.new_this_month)}
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
          value={formatNumber(dashboardData.data.usage.total_conversations)}
          icon="💬"
        />
        <StatCard
          title="Total Messages"
          value={formatNumber(dashboardData.data.usage.total_messages)}
          subtitle={`Avg ${dashboardData.data.usage.avg_messages_per_conversation} per conversation`}
          icon="📝"
        />
        <StatCard
          title="Avg Requests/User"
          value={formatNumber(dashboardData.data.usage.avg_requests_per_user)}
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
          value={formatCurrency(dashboardData.data.costs.total_cost)}
          subtitle="Current period"
          icon="💰"
        />
        <StatCard
          title="Total Requests"
          value={formatNumber(dashboardData.data.costs.total_requests)}
          icon="🔄"
        />
        <StatCard
          title="Total Tokens"
          value={formatNumber(dashboardData.data.costs.total_tokens)}
          subtitle={`${formatNumber(dashboardData.data.costs.input_tokens)} in / ${formatNumber(dashboardData.data.costs.output_tokens)} out`}
          icon="🎯"
        />
      </div>
    </section>

    <!-- Charts -->
    <div class="charts-grid">
      <section class="chart-card">
        <h3 class="chart-title">Cost Trend</h3>
        <ChartWrapper type="line" data={costTrendChart} />
      </section>

      <section class="chart-card">
        <h3 class="chart-title">Model Usage</h3>
        <ChartWrapper type="doughnut" data={modelUsageChart} />
      </section>
    </div>

    <!-- System Health -->
    <section class="dashboard-section">
      <h2 class="section-title">System Health</h2>
      <div class="health-card">
        <div class="health-status {dashboardData.data.system_health.status}">
          <span class="status-indicator"></span>
          <span class="status-text">
            {dashboardData.data.system_health.status.toUpperCase()}
          </span>
        </div>
        <div class="health-services">
          <div class="service-item">
            <span class="service-label">Database:</span>
            <span class="service-status {dashboardData.data.system_health.services.database}">
              {dashboardData.data.system_health.services.database}
            </span>
          </div>
          <div class="service-item">
            <span class="service-label">Redis:</span>
            <span class="service-status {dashboardData.data.system_health.services.redis}">
              {dashboardData.data.system_health.services.redis}
            </span>
          </div>
          {#each Object.entries(dashboardData.data.system_health.services.llm_providers) as [provider, status]}
            <div class="service-item">
              <span class="service-label">{provider}:</span>
              <span class="service-status {status}">{status}</span>
            </div>
          {/each}
        </div>
        <div class="health-meta">
          <p>Version: {dashboardData.data.system_health.version}</p>
          <p>Last updated: {new Date(dashboardData.data.system_health.timestamp).toLocaleString()}</p>
        </div>
      </div>
    </section>
  </div>
{/if}

<style>
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

