<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import PageHeader from "../components/PageHeader.svelte";
  import AdminPanelCard from "../components/AdminPanelCard.svelte";
  import LoadingSpinner from "../components/LoadingSpinner.svelte";
  import { getSystemMetrics, getHealthStatus } from "../../api/admin/systemMetrics.js";
  import type { HealthStatus } from "../../api/admin/systemMetrics.js";
  import type { SystemMetrics } from "../types.js";
  import { toast } from "../../components/Toaster.svelte";
  import { ApiError } from "../../api/client.js";
  import { _ } from 'svelte-i18n';

  let isLoading = $state(true);
  let metricsData = $state<SystemMetrics | null>(null);
  let healthData = $state<HealthStatus | null>(null);
  let error = $state<string | null>(null);
  let autoRefresh = $state(false);
  let refreshInterval: ReturnType<typeof setInterval> | null = null;

  async function fetchHealthStatus() {
    try {
      healthData = await getHealthStatus();
    } catch (err: any) {
      console.error('Health status fetch error:', err);
    }
  }

  async function fetchMetrics() {
    isLoading = !metricsData;
    error = null;

    try {
      const [metrics] = await Promise.all([
        getSystemMetrics(),
        !healthData ? fetchHealthStatus() : Promise.resolve(),
      ]);
      metricsData = metrics;
    } catch (err: any) {
      const errorMessage = err instanceof ApiError ? err.message : err.message;
      error = errorMessage;
      toast.error(errorMessage || $_('systemMetrics.errors.fetchFailed'));
      console.error('System metrics fetch error:', err);
    } finally {
      isLoading = false;
    }
  }

  function toggleAutoRefresh() {
    autoRefresh = !autoRefresh;
    if (autoRefresh) {
      refreshInterval = setInterval(fetchMetrics, 15000);
    } else if (refreshInterval) {
      clearInterval(refreshInterval);
      refreshInterval = null;
    }
  }

  function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const value = bytes / Math.pow(1024, i);
    return `${value < 10 ? value.toFixed(2) : value < 100 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
  }

  function formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h ${mins}m`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  }

  function formatNumber(num: number): string {
    if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1) + 'B';
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
    if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K';
    return Math.round(num).toLocaleString();
  }

  function formatPercent(value: number): string {
    return value.toFixed(1) + '%';
  }

  function formatMs(ms: number): string {
    if (ms < 1) return (ms * 1000).toFixed(0) + ' µs';
    if (ms >= 1000) return (ms / 1000).toFixed(2) + ' s';
    return ms.toFixed(2) + ' ms';
  }

  function formatTimestamp(iso: string): string {
    return new Date(iso).toLocaleString();
  }

  function getCacheHitRatio(db: SystemMetrics['database']): number {
    const total = db.blksHit + db.blksRead;
    if (total === 0) return 0;
    return (db.blksHit / total) * 100;
  }

  function getMemoryPercent(used: number, total: number): number {
    if (total === 0) return 0;
    return (used / total) * 100;
  }

  function getDiskUsedBytes(disk: { totalSpaceBytes: number; availableSpaceBytes: number }): number {
    return disk.totalSpaceBytes - disk.availableSpaceBytes;
  }

  onMount(() => {
    fetchMetrics();
  });

  onDestroy(() => {
    if (refreshInterval) {
      clearInterval(refreshInterval);
    }
  });
</script>

<div class="system-metrics-page">
  <PageHeader
    title={$_('systemMetrics.title')}
    subtitle={$_('systemMetrics.subtitle')}
  >
    <div class="header-actions">
      <button
        class="btn-auto-refresh"
        class:active={autoRefresh}
        onclick={toggleAutoRefresh}
        aria-pressed={autoRefresh}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="23 4 23 10 17 10"></polyline>
          <polyline points="1 20 1 14 7 14"></polyline>
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
        </svg>
        {$_('systemMetrics.autoRefresh')}
      </button>
      <button class="btn-refresh" onclick={fetchMetrics} disabled={isLoading}>
        <svg class="refresh-icon" class:spinning={isLoading} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="23 4 23 10 17 10"></polyline>
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
        </svg>
        {$_('systemMetrics.refresh')}
      </button>
    </div>
  </PageHeader>

  {#if isLoading}
    <div class="loading-container" role="status" aria-live="polite" aria-label={$_('admin.common.loading')}>
      <LoadingSpinner />
    </div>
  {:else if error}
    <AdminPanelCard>
      <div class="error-state" role="alert" aria-live="assertive">
        <p class="error-message">{error}</p>
        <button class="btn-primary" onclick={fetchMetrics}>{$_('systemMetrics.refresh')}</button>
      </div>
    </AdminPanelCard>
  {:else if metricsData}
    <!-- ====== VERSION & STATUS BANNER ====== -->
    <div class="status-banner">
      <div class="status-banner__left">
        {#if healthData}
          <div class="version-badge">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"></path><line x1="16" y1="8" x2="2" y2="22"></line><line x1="17.5" y1="15" x2="9" y2="15"></line></svg>
            <div class="version-info">
              <span class="version-label">Grengin</span>
              <span class="version-number">v{healthData.version}</span>
            </div>
          </div>
          <div class="health-indicator" class:healthy={healthData.status === 'Okay'} class:unhealthy={healthData.status !== 'Okay'}>
            <span class="health-dot"></span>
            <span class="health-text">{healthData.status === 'Okay' ? 'All Systems Operational' : healthData.status}</span>
          </div>
        {:else}
          <div class="version-badge">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"></path><line x1="16" y1="8" x2="2" y2="22"></line><line x1="17.5" y1="15" x2="9" y2="15"></line></svg>
            <div class="version-info">
              <span class="version-label">Grengin</span>
              <span class="version-number version-number--loading">Loading...</span>
            </div>
          </div>
        {/if}
      </div>
      <div class="status-banner__right">
        {#if metricsData.generatedAt}
          <span class="generated-at">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            {formatTimestamp(metricsData.generatedAt)}
          </span>
        {/if}
      </div>
    </div>

    <div class="metrics-content">
      <!-- ====== MACHINE SECTION ====== -->
      <section class="metrics-section" aria-labelledby="machine-title">
        <h2 class="section-title" id="machine-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
          {$_('systemMetrics.machine.title')}
        </h2>

        <div class="cards-grid cards-grid--4">
          <!-- CPU -->
          <AdminPanelCard ariaLabel={$_('systemMetrics.machine.cpuUsage')}>
            <div class="stat-card">
              <span class="stat-label">{$_('systemMetrics.machine.cpuUsage')}</span>
              <span class="stat-value">{formatPercent(metricsData.machine.cpuUsagePercent)}</span>
              <div class="progress-bar" role="progressbar" aria-valuenow={metricsData.machine.cpuUsagePercent} aria-valuemin={0} aria-valuemax={100}>
                <div
                  class="progress-fill"
                  class:warn={metricsData.machine.cpuUsagePercent > 70}
                  class:critical={metricsData.machine.cpuUsagePercent > 90}
                  style="width: {Math.min(metricsData.machine.cpuUsagePercent, 100)}%"
                ></div>
              </div>
            </div>
          </AdminPanelCard>

          <!-- Memory -->
          <AdminPanelCard ariaLabel={$_('systemMetrics.machine.memoryUsage')}>
            <div class="stat-card">
              <span class="stat-label">{$_('systemMetrics.machine.memoryUsage')}</span>
              <span class="stat-value">{formatPercent(getMemoryPercent(metricsData.machine.usedMemoryBytes, metricsData.machine.totalMemoryBytes))}</span>
              <div class="progress-bar" role="progressbar" aria-valuenow={getMemoryPercent(metricsData.machine.usedMemoryBytes, metricsData.machine.totalMemoryBytes)} aria-valuemin={0} aria-valuemax={100}>
                <div
                  class="progress-fill"
                  class:warn={getMemoryPercent(metricsData.machine.usedMemoryBytes, metricsData.machine.totalMemoryBytes) > 70}
                  class:critical={getMemoryPercent(metricsData.machine.usedMemoryBytes, metricsData.machine.totalMemoryBytes) > 90}
                  style="width: {Math.min(getMemoryPercent(metricsData.machine.usedMemoryBytes, metricsData.machine.totalMemoryBytes), 100)}%"
                ></div>
              </div>
              <div class="stat-detail">
                {formatBytes(metricsData.machine.usedMemoryBytes)} / {formatBytes(metricsData.machine.totalMemoryBytes)}
              </div>
            </div>
          </AdminPanelCard>

          <!-- Load Average -->
          <AdminPanelCard ariaLabel={$_('systemMetrics.machine.loadAverage')}>
            <div class="stat-card">
              <span class="stat-label">{$_('systemMetrics.machine.loadAverage')}</span>
              <div class="load-averages">
                <div class="load-item">
                  <span class="load-period">{$_('systemMetrics.machine.load1m')}</span>
                  <span class="load-value">{metricsData.machine.loadAverage1m.toFixed(2)}</span>
                </div>
                <div class="load-item">
                  <span class="load-period">{$_('systemMetrics.machine.load5m')}</span>
                  <span class="load-value">{metricsData.machine.loadAverage5m.toFixed(2)}</span>
                </div>
                <div class="load-item">
                  <span class="load-period">{$_('systemMetrics.machine.load15m')}</span>
                  <span class="load-value">{metricsData.machine.loadAverage15m.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </AdminPanelCard>

          <!-- Uptime -->
          <AdminPanelCard ariaLabel={$_('systemMetrics.machine.uptime')}>
            <div class="stat-card">
              <span class="stat-label">{$_('systemMetrics.machine.uptime')}</span>
              <span class="stat-value stat-value--accent">{formatUptime(metricsData.machine.uptimeSeconds)}</span>
            </div>
          </AdminPanelCard>
        </div>

        <!-- Swap -->
        {#if metricsData.machine.totalSwapBytes > 0}
          <div class="cards-grid cards-grid--1 mt-lg">
            <AdminPanelCard ariaLabel={$_('systemMetrics.machine.swapUsage')}>
              <div class="stat-card stat-card--inline">
                <span class="stat-label">{$_('systemMetrics.machine.swapUsage')}</span>
                <div class="inline-bar-group">
                  <div class="progress-bar progress-bar--wide" role="progressbar" aria-valuenow={getMemoryPercent(metricsData.machine.usedSwapBytes, metricsData.machine.totalSwapBytes)} aria-valuemin={0} aria-valuemax={100}>
                    <div
                      class="progress-fill"
                      class:warn={getMemoryPercent(metricsData.machine.usedSwapBytes, metricsData.machine.totalSwapBytes) > 70}
                      class:critical={getMemoryPercent(metricsData.machine.usedSwapBytes, metricsData.machine.totalSwapBytes) > 90}
                      style="width: {Math.min(getMemoryPercent(metricsData.machine.usedSwapBytes, metricsData.machine.totalSwapBytes), 100)}%"
                    ></div>
                  </div>
                  <span class="stat-detail">{formatBytes(metricsData.machine.usedSwapBytes)} / {formatBytes(metricsData.machine.totalSwapBytes)}</span>
                </div>
              </div>
            </AdminPanelCard>
          </div>
        {/if}

        <!-- Disks -->
        {#if metricsData.machine.disks && metricsData.machine.disks.length > 0}
          <h3 class="subsection-title">{$_('systemMetrics.machine.disks')}</h3>
          <div class="cards-grid cards-grid--2">
            {#each metricsData.machine.disks as disk}
              <AdminPanelCard ariaLabel={disk.mountPoint}>
                <div class="stat-card">
                  <span class="stat-label mono">{disk.mountPoint}</span>
                  <div class="progress-bar" role="progressbar" aria-valuenow={getMemoryPercent(getDiskUsedBytes(disk), disk.totalSpaceBytes)} aria-valuemin={0} aria-valuemax={100}>
                    <div
                      class="progress-fill"
                      class:warn={getMemoryPercent(getDiskUsedBytes(disk), disk.totalSpaceBytes) > 80}
                      class:critical={getMemoryPercent(getDiskUsedBytes(disk), disk.totalSpaceBytes) > 95}
                      style="width: {Math.min(getMemoryPercent(getDiskUsedBytes(disk), disk.totalSpaceBytes), 100)}%"
                    ></div>
                  </div>
                  <div class="stat-detail">
                    {formatBytes(getDiskUsedBytes(disk))} / {formatBytes(disk.totalSpaceBytes)}
                    ({formatPercent(getMemoryPercent(getDiskUsedBytes(disk), disk.totalSpaceBytes))})
                  </div>
                </div>
              </AdminPanelCard>
            {/each}
          </div>
        {/if}
      </section>

      <!-- ====== DATABASE SECTION ====== -->
      <section class="metrics-section" aria-labelledby="database-title">
        <h2 class="section-title" id="database-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg>
          {$_('systemMetrics.database.title')}
        </h2>

        <div class="cards-grid cards-grid--4">
          <!-- Connections -->
          <AdminPanelCard ariaLabel={$_('systemMetrics.database.connections')}>
            <div class="stat-card">
              <span class="stat-label">{$_('systemMetrics.database.connections')}</span>
              <span class="stat-value">{formatNumber(metricsData.database.totalConnections)}</span>
              <div class="stat-breakdown">
                <span class="badge badge--green">{$_('systemMetrics.database.active')}: {metricsData.database.activeConnections}</span>
                <span class="badge badge--muted">{$_('systemMetrics.database.idle')}: {metricsData.database.idleConnections}</span>
              </div>
            </div>
          </AdminPanelCard>

          <!-- Latency -->
          <AdminPanelCard ariaLabel={$_('systemMetrics.database.latency')}>
            <div class="stat-card">
              <span class="stat-label">{$_('systemMetrics.database.latency')}</span>
              <span class="stat-value">{formatMs(metricsData.database.roundtripLatencyMs)}</span>
            </div>
          </AdminPanelCard>

          <!-- DB Size -->
          <AdminPanelCard ariaLabel={$_('systemMetrics.database.size')}>
            <div class="stat-card">
              <span class="stat-label">{$_('systemMetrics.database.size')}</span>
              <span class="stat-value">{formatBytes(metricsData.database.databaseSizeBytes)}</span>
            </div>
          </AdminPanelCard>

          <!-- Cache Hit Ratio -->
          <AdminPanelCard ariaLabel={$_('systemMetrics.database.cacheHitRatio')}>
            <div class="stat-card">
              <span class="stat-label">{$_('systemMetrics.database.cacheHitRatio')}</span>
              <span class="stat-value" class:stat-value--success={getCacheHitRatio(metricsData.database) > 95}>
                {formatPercent(getCacheHitRatio(metricsData.database))}
              </span>
              <div class="progress-bar" role="progressbar" aria-valuenow={getCacheHitRatio(metricsData.database)} aria-valuemin={0} aria-valuemax={100}>
                <div
                  class="progress-fill progress-fill--accent"
                  style="width: {Math.min(getCacheHitRatio(metricsData.database), 100)}%"
                ></div>
              </div>
            </div>
          </AdminPanelCard>
        </div>

        <!-- Transactions -->
        <div class="cards-grid cards-grid--2 mt-lg">
          <AdminPanelCard ariaLabel={$_('systemMetrics.database.transactions')}>
            <div class="stat-card">
              <span class="stat-label">{$_('systemMetrics.database.transactions')}</span>
              <div class="kv-grid">
                <span class="kv-key">{$_('systemMetrics.database.commits')}</span>
                <span class="kv-val">{formatNumber(metricsData.database.xactCommit)}</span>
                <span class="kv-key">{$_('systemMetrics.database.rollbacks')}</span>
                <span class="kv-val kv-val--warn">{formatNumber(metricsData.database.xactRollback)}</span>
              </div>
            </div>
          </AdminPanelCard>

          <!-- Tuples -->
          <AdminPanelCard ariaLabel={$_('systemMetrics.database.tuples')}>
            <div class="stat-card">
              <span class="stat-label">{$_('systemMetrics.database.tuples')}</span>
              <div class="kv-grid">
                <span class="kv-key">{$_('systemMetrics.database.fetched')}</span>
                <span class="kv-val">{formatNumber(metricsData.database.tupFetched)}</span>
                <span class="kv-key">{$_('systemMetrics.database.inserted')}</span>
                <span class="kv-val">{formatNumber(metricsData.database.tupInserted)}</span>
                <span class="kv-key">{$_('systemMetrics.database.updated')}</span>
                <span class="kv-val">{formatNumber(metricsData.database.tupUpdated)}</span>
                <span class="kv-key">{$_('systemMetrics.database.deleted')}</span>
                <span class="kv-val">{formatNumber(metricsData.database.tupDeleted)}</span>
                <span class="kv-key">{$_('systemMetrics.database.returned')}</span>
                <span class="kv-val">{formatNumber(metricsData.database.tupReturned)}</span>
              </div>
            </div>
          </AdminPanelCard>
        </div>
      </section>

      <!-- ====== CONTAINER SECTION ====== -->
      <section class="metrics-section" aria-labelledby="container-title">
        <h2 class="section-title" id="container-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
          {$_('systemMetrics.container.title')}
        </h2>

        <div class="cards-grid cards-grid--4">
          <!-- Inside Container -->
          <AdminPanelCard ariaLabel={$_('systemMetrics.container.insideContainer')}>
            <div class="stat-card">
              <span class="stat-label">{$_('systemMetrics.container.insideContainer')}</span>
              <span class="stat-value">
                {#if metricsData.container.insideContainer}
                  <span class="badge badge--green">{$_('systemMetrics.container.yes')}</span>
                {:else}
                  <span class="badge badge--muted">{$_('systemMetrics.container.no')}</span>
                {/if}
              </span>
            </div>
          </AdminPanelCard>

          <!-- Cgroup Version -->
          <AdminPanelCard ariaLabel={$_('systemMetrics.container.cgroupVersion')}>
            <div class="stat-card">
              <span class="stat-label">{$_('systemMetrics.container.cgroupVersion')}</span>
              <span class="stat-value mono">{metricsData.container.cgroupVersion || '—'}</span>
            </div>
          </AdminPanelCard>

          <!-- CPU Quota -->
          <AdminPanelCard ariaLabel={$_('systemMetrics.container.cpuQuota')}>
            <div class="stat-card">
              <span class="stat-label">{$_('systemMetrics.container.cpuQuota')}</span>
              <span class="stat-value">{metricsData.container.cpuQuotaCores.toFixed(2)} <span class="stat-unit">{$_('systemMetrics.container.cores')}</span></span>
            </div>
          </AdminPanelCard>

          <!-- CPU Usage -->
          <AdminPanelCard ariaLabel={$_('systemMetrics.container.cpuUsage')}>
            <div class="stat-card">
              <span class="stat-label">{$_('systemMetrics.container.cpuUsage')}</span>
              <span class="stat-value">{metricsData.container.cpuUsageSeconds.toFixed(1)} <span class="stat-unit">{$_('systemMetrics.container.seconds')}</span></span>
            </div>
          </AdminPanelCard>
        </div>

        <!-- Container Memory -->
        <div class="cards-grid cards-grid--3 mt-lg">
          <AdminPanelCard ariaLabel={$_('systemMetrics.container.memoryUsage')}>
            <div class="stat-card">
              <span class="stat-label">{$_('systemMetrics.container.memoryUsage')}</span>
              <span class="stat-value">{formatBytes(metricsData.container.memoryUsageBytes)}</span>
              {#if metricsData.container.memoryLimitBytes > 0}
                <div class="progress-bar" role="progressbar" aria-valuenow={getMemoryPercent(metricsData.container.memoryUsageBytes, metricsData.container.memoryLimitBytes)} aria-valuemin={0} aria-valuemax={100}>
                  <div
                    class="progress-fill"
                    class:warn={getMemoryPercent(metricsData.container.memoryUsageBytes, metricsData.container.memoryLimitBytes) > 70}
                    class:critical={getMemoryPercent(metricsData.container.memoryUsageBytes, metricsData.container.memoryLimitBytes) > 90}
                    style="width: {Math.min(getMemoryPercent(metricsData.container.memoryUsageBytes, metricsData.container.memoryLimitBytes), 100)}%"
                  ></div>
                </div>
                <div class="stat-detail">
                  {formatPercent(getMemoryPercent(metricsData.container.memoryUsageBytes, metricsData.container.memoryLimitBytes))} of limit
                </div>
              {/if}
            </div>
          </AdminPanelCard>

          <AdminPanelCard ariaLabel={$_('systemMetrics.container.memoryLimit')}>
            <div class="stat-card">
              <span class="stat-label">{$_('systemMetrics.container.memoryLimit')}</span>
              <span class="stat-value">{formatBytes(metricsData.container.memoryLimitBytes)}</span>
            </div>
          </AdminPanelCard>

          <AdminPanelCard ariaLabel={$_('systemMetrics.container.memoryAvailable')}>
            <div class="stat-card">
              <span class="stat-label">{$_('systemMetrics.container.memoryAvailable')}</span>
              <span class="stat-value">{formatBytes(metricsData.container.memoryAvailableBytes)}</span>
            </div>
          </AdminPanelCard>
        </div>
      </section>
    </div>
  {/if}
</div>

<style>
  .system-metrics-page {
    padding: var(--space-3xl);
    max-width: 1600px;
    margin: 0 auto;
    overflow-y: auto;
    height: 100%;
  }

  /* ====== Header Actions ====== */
  .header-actions {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .btn-refresh,
  .btn-auto-refresh {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    padding: 0.5rem 1rem;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: var(--radius-md);
    background: var(--button-bg);
    color: var(--text-secondary);
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn-refresh:hover,
  .btn-auto-refresh:hover {
    background: var(--btn-secondary);
    color: var(--text-primary);
    border-color: rgba(255, 255, 255, 0.18);
  }

  .btn-refresh:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-auto-refresh.active {
    background: color-mix(in oklab, var(--brand) 15%, transparent);
    border-color: var(--brand);
    color: var(--brand);
  }

  .refresh-icon.spinning {
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* ====== Status Banner ====== */
  .status-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-lg) var(--space-xl);
    margin-bottom: var(--space-xl);
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0.02) 100%);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-lg);
    gap: var(--space-lg);
    flex-wrap: wrap;
  }

  .status-banner__left {
    display: flex;
    align-items: center;
    gap: var(--space-xl);
    flex-wrap: wrap;
  }

  .status-banner__right {
    display: flex;
    align-items: center;
  }

  .version-badge {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .version-badge :global(svg) {
    color: var(--brand);
    flex-shrink: 0;
  }

  .version-info {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .version-label {
    font-size: 0.6875rem;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    line-height: 1;
  }

  .version-number {
    font-size: 1.125rem;
    font-weight: 700;
    color: var(--text-primary);
    letter-spacing: -0.01em;
    line-height: 1.2;
    font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
  }

  .version-number--loading {
    font-size: 0.8125rem;
    color: var(--text-secondary);
    font-family: inherit;
    font-weight: 500;
  }

  .health-indicator {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding: 0.375rem 0.75rem;
    border-radius: 100px;
    font-size: 0.8125rem;
    font-weight: 600;
  }

  .health-indicator.healthy {
    background: rgba(52, 211, 153, 0.1);
    color: #34d399;
  }

  .health-indicator.unhealthy {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
  }

  .health-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .healthy .health-dot {
    background: #34d399;
    box-shadow: 0 0 8px rgba(52, 211, 153, 0.5);
    animation: pulse-green 2s ease-in-out infinite;
  }

  .unhealthy .health-dot {
    background: #ef4444;
    box-shadow: 0 0 8px rgba(239, 68, 68, 0.5);
    animation: pulse-red 1.5s ease-in-out infinite;
  }

  @keyframes pulse-green {
    0%, 100% { box-shadow: 0 0 4px rgba(52, 211, 153, 0.4); }
    50% { box-shadow: 0 0 12px rgba(52, 211, 153, 0.7); }
  }

  @keyframes pulse-red {
    0%, 100% { box-shadow: 0 0 4px rgba(239, 68, 68, 0.4); }
    50% { box-shadow: 0 0 12px rgba(239, 68, 68, 0.7); }
  }

  .health-text {
    white-space: nowrap;
  }

  .generated-at {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    font-size: 0.8125rem;
    color: var(--text-secondary);
    margin: 0;
  }

  .generated-at :global(svg) {
    opacity: 0.6;
    flex-shrink: 0;
  }

  /* ====== Loading & Error ====== */
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

  /* ====== Metrics Content ====== */
  .metrics-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-3xl);
  }

  .metrics-section {
    display: flex;
    flex-direction: column;
  }

  .section-title {
    font-size: 1.125rem;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0 0 var(--space-lg) 0;
    letter-spacing: -0.02em;
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding-bottom: var(--space-sm);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  .section-title :global(svg) {
    color: var(--brand);
    flex-shrink: 0;
  }

  .subsection-title {
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--text-secondary);
    margin: var(--space-xl) 0 var(--space-md) 0;
  }

  /* ====== Card Grid Layouts ====== */
  .cards-grid {
    display: grid;
    gap: var(--space-lg);
  }

  .cards-grid--1 { grid-template-columns: 1fr; }
  .cards-grid--2 { grid-template-columns: repeat(2, 1fr); }
  .cards-grid--3 { grid-template-columns: repeat(3, 1fr); }
  .cards-grid--4 { grid-template-columns: repeat(4, 1fr); }

  .mt-lg { margin-top: var(--space-lg); }

  /* ====== Stat Cards ====== */
  .stat-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .stat-card--inline {
    flex-direction: row;
    align-items: center;
    gap: var(--space-lg);
  }

  .stat-label {
    font-size: 0.8125rem;
    color: var(--text-secondary);
    font-weight: 500;
    letter-spacing: 0.01em;
  }

  .stat-value {
    font-size: 1.75rem;
    font-weight: 700;
    color: var(--text-primary);
    letter-spacing: -0.03em;
    line-height: 1.2;
  }

  .stat-value--accent { color: var(--brand); }
  .stat-value--success { color: #34d399; }

  .stat-unit {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-secondary);
  }

  .stat-detail {
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .stat-breakdown {
    display: flex;
    gap: var(--space-sm);
    flex-wrap: wrap;
  }

  .mono { font-family: 'SF Mono', 'Menlo', 'Consolas', monospace; }

  /* ====== Progress Bars ====== */
  .progress-bar {
    height: 6px;
    background: rgba(255, 255, 255, 0.06);
    border-radius: 3px;
    overflow: hidden;
  }

  .progress-bar--wide {
    flex: 1;
    min-width: 120px;
  }

  .progress-fill {
    height: 100%;
    border-radius: 3px;
    background: var(--brand);
    transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .progress-fill.warn { background: #f59e0b; }
  .progress-fill.critical { background: #ef4444; }
  .progress-fill--accent { background: #34d399; }

  /* ====== Badges ====== */
  .badge {
    display: inline-flex;
    align-items: center;
    padding: 0.1875rem 0.625rem;
    border-radius: var(--radius-sm);
    font-size: 0.75rem;
    font-weight: 600;
  }

  .badge--green {
    background: rgba(52, 211, 153, 0.12);
    color: #34d399;
  }

  .badge--muted {
    background: rgba(255, 255, 255, 0.06);
    color: var(--text-secondary);
  }

  /* ====== Load Averages ====== */
  .load-averages {
    display: flex;
    gap: var(--space-lg);
    margin-top: var(--space-xs);
  }

  .load-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .load-period {
    font-size: 0.6875rem;
    color: var(--text-secondary);
    text-transform: uppercase;
    font-weight: 600;
    letter-spacing: 0.05em;
  }

  .load-value {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  /* ====== Key-Value Grid ====== */
  .kv-grid {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--space-xs) var(--space-lg);
    margin-top: var(--space-xs);
  }

  .kv-key {
    font-size: 0.8125rem;
    color: var(--text-secondary);
  }

  .kv-val {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text-primary);
    text-align: right;
  }

  .kv-val--warn { color: #f59e0b; }

  .inline-bar-group {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    flex: 1;
  }

  /* ====== Responsive ====== */
  @media (max-width: 1200px) {
    .cards-grid--4 { grid-template-columns: repeat(2, 1fr); }
    .cards-grid--3 { grid-template-columns: repeat(2, 1fr); }
  }

  @media (max-width: 768px) {
    .system-metrics-page { padding: var(--space-xl); }
    .cards-grid--4,
    .cards-grid--3,
    .cards-grid--2 { grid-template-columns: 1fr; }
    .stat-value { font-size: 1.5rem; }
    .header-actions { flex-direction: column; width: 100%; }
    .btn-refresh, .btn-auto-refresh { width: 100%; justify-content: center; }
    .stat-card--inline { flex-direction: column; }
    .status-banner { flex-direction: column; align-items: flex-start; }
    .status-banner__left { flex-direction: column; align-items: flex-start; }
  }
</style>
