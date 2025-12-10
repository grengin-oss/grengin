<script lang="ts">
  interface Props {
    title: string;
    value: string | number;
    subtitle?: string;
    trend?: {
      value: number;
      isPositive: boolean;
    };
    icon?: string;
  }

  let { title, value, subtitle, trend, icon }: Props = $props();
</script>

<div class="stat-card">
  {#if icon}
    <div class="stat-icon">{icon}</div>
  {/if}
  <div class="stat-content">
    <h3 class="stat-title">{title}</h3>
    <p class="stat-value">{value}</p>
    {#if subtitle}
      <p class="stat-subtitle">{subtitle}</p>
    {/if}
    {#if trend}
      <div class="stat-trend {trend.isPositive ? 'positive' : 'negative'}">
        <svg class="trend-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          {#if trend.isPositive}
            <polyline points="18,15 12,9 6,15"/>
          {:else}
            <polyline points="6,9 12,15 18,9"/>
          {/if}
        </svg>
        <span>{Math.abs(trend.value)}%</span>
      </div>
    {/if}
  </div>
</div>

<style>
  .stat-card {
    display: flex;
    gap: var(--space-lg);
    padding: var(--space-xl);
    background: rgba(var(--glass-tint), 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-lg);
    transition: all 0.3s ease;
  }

  .stat-card:hover {
    background: rgba(var(--glass-tint), 0.06);
    border-color: rgba(255, 255, 255, 0.12);
    transform: translateY(-2px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  }

  .stat-icon {
    font-size: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 3rem;
    height: 3rem;
    background: rgba(var(--brand-rgb), 0.1);
    border-radius: var(--radius-md);
    flex-shrink: 0;
  }

  .stat-content {
    flex: 1;
  }

  .stat-title {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-secondary);
    margin: 0 0 var(--space-sm) 0;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .stat-value {
    font-size: 2rem;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0 0 var(--space-xs) 0;
    line-height: 1;
  }

  .stat-subtitle {
    font-size: 0.8125rem;
    color: var(--text-secondary);
    margin: 0;
  }

  .stat-trend {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-xs) var(--space-sm);
    border-radius: var(--radius-sm);
    font-size: 0.8125rem;
    font-weight: 600;
    margin-top: var(--space-sm);
  }

  .stat-trend.positive {
    color: var(--brand-green);
    background: rgba(var(--brand-green-rgb), 0.1);
  }

  .stat-trend.negative {
    color: var(--brand-red);
    background: rgba(var(--brand-red-rgb), 0.1);
  }

  .trend-arrow {
    width: 0.875rem;
    height: 0.875rem;
  }
</style>
