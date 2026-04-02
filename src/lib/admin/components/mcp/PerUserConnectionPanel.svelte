<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { onMount } from 'svelte';
  import type { MCPServer } from '../../types.js';
  import { getConnectedUsersCount } from '../../../api/admin/mcpServers.js';

  interface Props {
    server: MCPServer;
  }

  let { server }: Props = $props();

  let connectedCount = $state<number>(server.connected_users_count ?? 0);
  let loading = $state(false);

  async function loadCount() {
    loading = true;
    try {
      const response = await getConnectedUsersCount(server.id);
      connectedCount = response.count;
    } catch {
      // keep fallback from server prop
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    loadCount();
  });

  const providerLabel = $derived(server.oauth_provider
    ? server.oauth_provider.charAt(0).toUpperCase() + server.oauth_provider.slice(1)
    : 'OAuth'
  );
</script>

<div class="per-user-panel">
  <div class="panel-header">
    <h4 class="panel-title">{$_('admin.mcpOAuth.perUserConnection.title')}</h4>
  </div>

  <div class="panel-body">
    <div class="info-icon">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="16" x2="12" y2="12"/>
        <line x1="12" y1="8" x2="12.01" y2="8"/>
      </svg>
    </div>
    <div class="info-content">
      <p class="info-text">
        {$_('admin.mcpOAuth.perUserConnection.description', { values: { provider: providerLabel } })}
      </p>

      <div class="connected-count">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        <span class="count-label">{$_('admin.mcpOAuth.perUserConnection.connectedUsers')}</span>
        {#if loading}
          <span class="count-spinner"></span>
        {:else}
          <span class="count-value">{connectedCount}</span>
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  .per-user-panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    padding: var(--space-lg);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: var(--radius-lg);
    background: rgba(var(--glass-tint), 0.02);
  }

  .panel-header {
    display: flex;
    align-items: center;
  }

  .panel-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
  }

  .panel-body {
    display: flex;
    gap: var(--space-md);
    align-items: flex-start;
  }

  .info-icon {
    flex-shrink: 0;
    color: var(--brand);
    opacity: 0.8;
    margin-top: 2px;
  }

  .info-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    flex: 1;
  }

  .info-text {
    font-size: 0.8125rem;
    color: var(--text-secondary);
    line-height: 1.6;
    margin: 0;
  }

  .connected-count {
    display: inline-flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    background: rgba(var(--glass-tint), 0.04);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: var(--radius-md);
    color: var(--text-secondary);
    font-size: 0.8125rem;
    align-self: flex-start;
  }

  .count-label {
    font-weight: 500;
  }

  .count-value {
    font-weight: 700;
    color: var(--text-primary);
    font-size: 0.9375rem;
  }

  .count-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.2);
    border-top-color: var(--text-primary);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
