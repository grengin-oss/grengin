<script lang="ts">
  import { onMount } from "svelte";
  import PageHeader from "../components/PageHeader.svelte";
  import AdminPanelCard from "../components/AdminPanelCard.svelte";
  import LoadingSpinner from "../components/LoadingSpinner.svelte";
  import { getAnalyticsOverview } from "../../api/admin/analytics.js";
  import type { AnalyticsOverview } from "../types.js";
  import { toast } from "../../components/Toaster.svelte";
  import { ApiError } from "../../api/client.js";
  import { _ } from 'svelte-i18n';
  import { Link } from "svelte-routing";

  let isLoading = $state(true);
  let overviewData = $state<AnalyticsOverview | null>(null);
  let error = $state<string | null>(null);

  // Get date range for last 30 days
  function getDefaultStartDate(): string {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date.toISOString().split('T')[0];
  }

  function getDefaultEndDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  async function fetchOverview() {
    isLoading = true;
    error = null;

    try {
      const overview = await getAnalyticsOverview({
        start_date: getDefaultStartDate(),
        end_date: getDefaultEndDate()
      });
      overviewData = overview;
    } catch (err: any) {
      const errorMessage = err instanceof ApiError ? err.message : err.message;
      error = errorMessage;
      toast.error(errorMessage || $_('adminOverview.errors.fetchFailed'));
      console.error('Overview fetch error:', err);
    } finally {
      isLoading = false;
    }
  }

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

  onMount(() => {
    fetchOverview();
  });
</script>

<div class="overview-page">
  <PageHeader
    title={$_('adminOverview.title')}
    subtitle={$_('adminOverview.subtitle')}
  />

  {#if isLoading}
    <div class="loading-container">
      <LoadingSpinner />
    </div>
  {:else if error}
    <AdminPanelCard>
      <div class="error-state">
        <p class="error-message">{error}</p>
        <button class="btn-primary" onclick={fetchOverview}>{$_('adminOverview.retry')}</button>
      </div>
    </AdminPanelCard>
  {:else if overviewData}
    <div class="overview-content">
      <!-- Quick Stats Section -->
      <section class="quick-stats-section">
        <h2 class="section-title">{$_('adminOverview.quickStats')}</h2>

        <div class="metrics-grid">
          <AdminPanelCard class="metric-card">
            <div class="metric-content">
              <div class="metric-header">
                <span class="metric-label">{$_('adminOverview.totalUsers')}</span>
              </div>
              <div class="metric-value">{formatNumber(overviewData.total_users)}</div>
              <div class="metric-subtext">{$_('adminOverview.activeUsers', { values: { count: formatNumber(overviewData.active_users) } })}</div>
            </div>
          </AdminPanelCard>

          <AdminPanelCard class="metric-card">
            <div class="metric-content">
              <div class="metric-header">
                <span class="metric-label">{$_('adminOverview.totalRequests')}</span>
                {#if overviewData.request_growth_rate !== 0}
                  <span class="tag" class:tag--success={overviewData.request_growth_rate > 0} class:tag--danger={overviewData.request_growth_rate < 0}>
                    {formatPercentage(overviewData.request_growth_rate)}
                  </span>
                {/if}
              </div>
              <div class="metric-value">{formatNumber(overviewData.total_requests)}</div>
              <div class="metric-subtext">{$_('adminOverview.last30Days')}</div>
            </div>
          </AdminPanelCard>

          <AdminPanelCard class="metric-card">
            <div class="metric-content">
              <div class="metric-header">
                <span class="metric-label">{$_('adminOverview.totalTokens')}</span>
                {#if overviewData.token_growth_rate !== 0}
                  <span class="tag" class:tag--success={overviewData.token_growth_rate > 0} class:tag--danger={overviewData.token_growth_rate < 0}>
                    {formatPercentage(overviewData.token_growth_rate)}
                  </span>
                {/if}
              </div>
              <div class="metric-value">{formatNumber(overviewData.total_tokens)}</div>
              <div class="metric-subtext">{$_('adminOverview.last30Days')}</div>
            </div>
          </AdminPanelCard>

          <AdminPanelCard class="metric-card">
            <div class="metric-content">
              <div class="metric-header">
                <span class="metric-label">{$_('adminOverview.totalCost')}</span>
                {#if overviewData.cost_growth_rate !== 0}
                  <span class="tag" class:tag--success={overviewData.cost_growth_rate > 0} class:tag--danger={overviewData.cost_growth_rate < 0}>
                    {formatPercentage(overviewData.cost_growth_rate)}
                  </span>
                {/if}
              </div>
              <div class="metric-value">{formatCurrency(overviewData.total_cost)}</div>
              <div class="metric-subtext">{$_('adminOverview.last30Days')}</div>
            </div>
          </AdminPanelCard>
        </div>
      </section>

      <!-- Quick Links Section -->
      <section class="quick-links-section">
        <h2 class="section-title">{$_('adminOverview.quickLinks')}</h2>

        <div class="links-grid">
          <Link to="/admin/users">
            <AdminPanelCard class="link-card">
              <div class="link-content">
                <div class="link-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                    <circle cx="9" cy="7" r="4"></circle>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                  </svg>
                </div>
                <div class="link-text">
                  <span class="link-title">{$_('sidebar.users')}</span>
                  <span class="link-description">{$_('adminOverview.manageUsers')}</span>
                </div>
                <div class="link-arrow">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="9,18 15,12 9,6"></polyline>
                  </svg>
                </div>
              </div>
            </AdminPanelCard>
          </Link>

          <Link to="/admin/departments">
            <AdminPanelCard class="link-card">
              <div class="link-content">
                <div class="link-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                    <polyline points="9 22 9 12 15 12 15 22"></polyline>
                  </svg>
                </div>
                <div class="link-text">
                  <span class="link-title">{$_('admin.departments.title')}</span>
                  <span class="link-description">{$_('adminOverview.manageDepartments')}</span>
                </div>
                <div class="link-arrow">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="9,18 15,12 9,6"></polyline>
                  </svg>
                </div>
              </div>
            </AdminPanelCard>
          </Link>

          <Link to="/admin/analytics">
            <AdminPanelCard class="link-card">
              <div class="link-content">
                <div class="link-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 3v18h18"></path>
                    <path d="M18 17V9"></path>
                    <path d="M13 17V5"></path>
                    <path d="M8 17v-3"></path>
                  </svg>
                </div>
                <div class="link-text">
                  <span class="link-title">{$_('sidebar.usageAnalytics')}</span>
                  <span class="link-description">{$_('adminOverview.viewAnalytics')}</span>
                </div>
                <div class="link-arrow">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="9,18 15,12 9,6"></polyline>
                  </svg>
                </div>
              </div>
            </AdminPanelCard>
          </Link>

          <Link to="/admin/settings">
            <AdminPanelCard class="link-card">
              <div class="link-content">
                <div class="link-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 8a4 4 0 0 1 4 4a4 4 0 0 1-4 4a4 4 0 0 1-4-4a4 4 0 0 1 4-4m0 2a2 2 0 0 0-2 2a2 2 0 0 0 2 2a2 2 0 0 0 2-2a2 2 0 0 0-2-2m-2 12c-.25 0-.46-.18-.5-.42l-.37-2.65c-.63-.25-1.17-.59-1.69-.99l-2.49 1.01c-.22.08-.49 0-.61-.22l-2-3.46a.493.493 0 0 1 .12-.64l2.11-1.66L4.5 12l.07-1l-2.11-1.63a.493.493 0 0 1-.12-.64l2-3.46c.12-.22.39-.31.61-.22l2.49 1c.52-.39 1.06-.73 1.69-.98l.37-2.65c.04-.24.25-.42.5-.42h4c.25 0 .46.18.5.42l.37 2.65c.63.25 1.17.59 1.69.98l2.49-1c.22-.09.49 0 .61.22l2 3.46c.13.22.07.49-.12.64L19.43 11l.07 1l-.07 1l2.11 1.63c.19.15.25.42.12.64l-2 3.46c-.12.22-.39.31-.61.22l-2.49-1c-.52.39-1.06.73-1.69.98l-.37 2.65c-.04.24-.25.42-.5.42z"/>
                  </svg>
                </div>
                <div class="link-text">
                  <span class="link-title">{$_('sidebar.settings')}</span>
                  <span class="link-description">{$_('adminOverview.configureSettings')}</span>
                </div>
                <div class="link-arrow">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="9,18 15,12 9,6"></polyline>
                  </svg>
                </div>
              </div>
            </AdminPanelCard>
          </Link>
        </div>
      </section>

      <!-- Top Models Section -->
      {#if overviewData.top_models && overviewData.top_models.length > 0}
        <section class="top-models-section">
          <h2 class="section-title">{$_('adminOverview.topModels')}</h2>
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
                  {#each overviewData.top_models.slice(0, 5) as model}
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
    </div>
  {/if}
</div>

<style>
  .overview-page {
    padding: var(--space-3xl);
    max-width: 1600px;
    margin: 0 auto;
    overflow-y: auto;
    height: 100%;
  }

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

  .overview-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-3xl);
  }

  .section-title {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0;
    letter-spacing: -0.02em;
    margin-bottom: var(--space-lg);
  }

  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
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

  /* Quick Links */
  .links-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: var(--space-lg);
  }

  .links-grid :global(a) {
    text-decoration: none;
  }

  :global(.link-card) {
    transition: all 0.2s ease;
    cursor: pointer;
  }

  :global(.link-card:hover) {
    transform: translateY(-2px);
    box-shadow: var(--glass-shadow-emphasis);
  }

  .link-content {
    display: flex;
    align-items: center;
    gap: var(--space-lg);
  }

  .link-icon {
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in oklab, var(--brand) 12%, transparent);
    border-radius: var(--radius-md);
    color: var(--brand);
    flex-shrink: 0;
  }

  .link-text {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .link-title {
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .link-description {
    font-size: 0.8125rem;
    color: var(--text-secondary);
  }

  .link-arrow {
    color: var(--text-secondary);
    transition: transform 0.2s ease;
  }

  :global(.link-card:hover) .link-arrow {
    transform: translateX(4px);
    color: var(--brand);
  }

  /* Top Models Table */
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

  @media (max-width: 768px) {
    .overview-page {
      padding: var(--space-xl);
    }

    .metrics-grid {
      grid-template-columns: 1fr;
    }

    .links-grid {
      grid-template-columns: 1fr;
    }

    .metric-value {
      font-size: 1.5rem;
    }
  }
</style>
