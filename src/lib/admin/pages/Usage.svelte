<script lang="ts">
  import { onMount } from 'svelte';
  import { dashboardStore } from '../stores';
  import PageHeader from '../components/PageHeader.svelte';
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
      dashboardData = state;
    });
    return unsubscribe;
  });

  onMount(() => {
    dashboardStore.fetch();
  });

  const modelUsageBarChart = $derived({
    labels: dashboardData.data?.usage.most_used_models.map(m => m.model) || [],
    datasets: [
      {
        label: 'Requests',
        data: dashboardData.data?.usage.most_used_models.map(m => m.requests) || [],
        backgroundColor: 'rgba(64, 121, 197, 0.7)',
        borderColor: 'rgb(64, 121, 197)',
        borderWidth: 1,
      },
    ],
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
        fill: true,
      },
      {
        label: 'Requests',
        data: dashboardData.data?.cost_trend.map(d => d.requests) || [],
        borderColor: 'rgb(45, 144, 107)',
        backgroundColor: 'rgba(45, 144, 107, 0.1)',
        tension: 0.4,
        fill: true,
        yAxisID: 'y1',
      },
    ],
  });

  const chartOptions = {
    responsive: true,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    scales: {
      y: {
        type: 'linear' as const,
        display: true,
        position: 'left' as const,
        title: {
          display: true,
          text: 'Cost ($)',
          color: 'rgba(255, 255, 255, 0.7)',
        },
      },
      y1: {
        type: 'linear' as const,
        display: true,
        position: 'right' as const,
        title: {
          display: true,
          text: 'Requests',
          color: 'rgba(255, 255, 255, 0.7)',
        },
        grid: {
          drawOnChartArea: false,
        },
      },
    },
  };
</script>

<PageHeader
  title="Usage & Analytics"
  subtitle="Detailed usage statistics and trends"
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
  <LoadingSpinner size="lg" text="Loading analytics..." />
{:else if dashboardData.error}
  <ErrorMessage
    message={dashboardData.error}
    onretry={() => dashboardStore.fetch()}
  />
{:else if dashboardData.data}
  <div class="usage-content">
    <!-- Summary Stats -->
    <div class="stats-grid">
      <div class="stat-card">
        <h3>Total Conversations</h3>
        <p class="stat-value">{dashboardData.data.usage.total_conversations.toLocaleString()}</p>
      </div>
      <div class="stat-card">
        <h3>Total Messages</h3>
        <p class="stat-value">{dashboardData.data.usage.total_messages.toLocaleString()}</p>
      </div>
      <div class="stat-card">
        <h3>Active Users</h3>
        <p class="stat-value">{dashboardData.data.usage.active_users.toLocaleString()}</p>
      </div>
      <div class="stat-card">
        <h3>Avg Msgs/Conv</h3>
        <p class="stat-value">{dashboardData.data.usage.avg_messages_per_conversation.toFixed(1)}</p>
      </div>
    </div>

    <!-- Model Usage -->
    <section class="chart-section">
      <h2 class="section-title">Model Usage Distribution</h2>
      <div class="chart-container">
        <ChartWrapper type="bar" data={modelUsageBarChart} />
      </div>
    </section>

    <!-- Cost & Request Trends -->
    <section class="chart-section">
      <h2 class="section-title">Cost & Request Trends</h2>
      <div class="chart-container">
        <ChartWrapper type="line" data={costTrendChart} options={chartOptions} />
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
          {#each dashboardData.data.usage.most_used_models as model}
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

<style>
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

