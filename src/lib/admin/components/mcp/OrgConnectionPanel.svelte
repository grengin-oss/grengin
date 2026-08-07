<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { toast } from '../../../components/Toaster.svelte';
  import type { MCPServer, McpOrgConnection } from '../../types.js';
  import {
    authorizeMcpConnection,
    disconnectOrgConnection,
    getOrgConnection,
  } from '../../../api/admin/mcpServers.js';
  import { openNativeMcpOAuth } from '$lib/platform/nativeMcpOAuth';

  interface Props {
    server: MCPServer;
  }

  let { server }: Props = $props();

  let connection = $state<McpOrgConnection | null>(server.org_connection ?? null);
  let loading = $state(false);
  let connecting = $state(false);
  let disconnecting = $state(false);
  let popupWindow: Window | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function getExpiryInfo(dateStr: string | null): { text: string; isExpiringSoon: boolean; isExpired: boolean } {
    if (!dateStr) return { text: '', isExpiringSoon: false, isExpired: false };
    const now = new Date();
    const expiry = new Date(dateStr);
    const diffMs = expiry.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { text: $_('admin.mcpOAuth.orgConnection.expired'), isExpiringSoon: false, isExpired: true };
    }
    if (diffDays <= 7) {
      return { text: $_('admin.mcpOAuth.orgConnection.expiresIn', { values: { days: diffDays } }), isExpiringSoon: true, isExpired: false };
    }
    return { text: formatDate(dateStr), isExpiringSoon: false, isExpired: false };
  }

  async function refreshConnection() {
    loading = true;
    try {
      connection = await getOrgConnection(server.id);
    } catch {
      // keep existing
    } finally {
      loading = false;
    }
  }

  function cleanup() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    popupWindow = null;
  }

  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => {
      if (!popupWindow || popupWindow.closed) {
        cleanup();
        connecting = false;
        refreshConnection();
      }
    }, 500);
  }

  async function handleConnect() {
    if (connecting) return;
    connecting = true;

    try {
      const response = await authorizeMcpConnection(server.id);
      if (!response?.authorization_url) {
        throw new Error($_('admin.mcpOAuth.orgConnection.failedToGetUrl'));
      }

      const nativeResult = await openNativeMcpOAuth(response.authorization_url);
      if (nativeResult) {
        if (nativeResult.success) {
          await refreshConnection();
        } else {
          toast.error(nativeResult.error || $_('admin.mcpOAuth.orgConnection.connectFailed'));
        }
        connecting = false;
        return;
      }

      const width = 600;
      const height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;

      popupWindow = window.open(
        response.authorization_url,
        `mcp_org_oauth_${server.id}`,
        `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes,resizable=yes`
      );

      if (!popupWindow) {
        throw new Error($_('admin.mcpOAuth.orgConnection.popupBlocked'));
      }

      startPolling();
    } catch (err: any) {
      toast.error(err?.message || $_('admin.mcpOAuth.orgConnection.connectFailed'));
      connecting = false;
    }
  }

  async function handleDisconnect() {
    if (disconnecting) return;
    disconnecting = true;
    try {
      await disconnectOrgConnection(server.id);
      connection = { connected: false, connected_as: null, connected_at: null, token_expires_at: null, scopes: [] };
      toast.success($_('admin.mcpOAuth.orgConnection.disconnected'));
    } catch (err: any) {
      toast.error(err?.message || $_('admin.mcpOAuth.orgConnection.disconnectFailed'));
    } finally {
      disconnecting = false;
    }
  }

  const isConnected = $derived(connection?.connected === true);
  const expiryInfo = $derived(getExpiryInfo(connection?.token_expires_at ?? null));
</script>

<div class="org-connection-panel">
  <div class="panel-header">
    <h4 class="panel-title">{$_('admin.mcpOAuth.orgConnection.title')}</h4>
  </div>

  {#if loading}
    <div class="panel-loading">
      <span class="spinner"></span>
      <span>{$_('common.loading')}</span>
    </div>
  {:else if isConnected}
    <div class="connection-status">
      <div class="status-row">
        <span class="status-indicator status-indicator--connected"></span>
        <span class="status-label">{$_('admin.mcpOAuth.orgConnection.status')}</span>
        <span class="status-value status-value--connected">
          {$_('admin.mcpOAuth.orgConnection.connectedAs', { values: { email: connection?.connected_as || 'Unknown' } })}
        </span>
      </div>

      {#if connection?.token_expires_at}
        <div class="status-row">
          <span class="status-label">{$_('admin.mcpOAuth.orgConnection.expires')}</span>
          <span class="status-value" class:status-value--warning={expiryInfo.isExpiringSoon} class:status-value--error={expiryInfo.isExpired}>
            {expiryInfo.text}
          </span>
        </div>
      {/if}

      {#if connection?.scopes && connection.scopes.length > 0}
        <div class="status-row status-row--scopes">
          <span class="status-label">{$_('admin.mcpOAuth.orgConnection.scopes')}</span>
          <div class="scopes-list">
            {#each connection.scopes as scope}
              <span class="scope-badge">{scope}</span>
            {/each}
          </div>
        </div>
      {/if}

      <div class="connection-actions">
        <button
          type="button"
          class="btn-action btn-action--secondary"
          onclick={handleConnect}
          disabled={connecting}
        >
          {#if connecting}
            <span class="spinner spinner--small"></span>
          {/if}
          {$_('admin.mcpOAuth.orgConnection.reconnect')}
        </button>
        <button
          type="button"
          class="btn-action btn-action--danger"
          onclick={handleDisconnect}
          disabled={disconnecting}
        >
          {#if disconnecting}
            <span class="spinner spinner--small"></span>
          {/if}
          {$_('admin.mcpOAuth.orgConnection.disconnect')}
        </button>
      </div>
    </div>
  {:else}
    <div class="connection-status connection-status--disconnected">
      <div class="status-row">
        <span class="status-indicator"></span>
        <span class="status-label">{$_('admin.mcpOAuth.orgConnection.status')}</span>
        <span class="status-value">{$_('admin.mcpOAuth.orgConnection.notConnected')}</span>
      </div>

      <p class="connection-hint">{$_('admin.mcpOAuth.orgConnection.connectHint')}</p>

      <div class="connection-actions">
        <button
          type="button"
          class="btn-action btn-action--primary"
          onclick={handleConnect}
          disabled={connecting}
        >
          {#if connecting}
            <span class="spinner spinner--small"></span>
          {/if}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M13.828 10.172a4 4 0 0 0-5.656 0l-4 4a4 4 0 1 0 5.656 5.656l1.102-1.101"/>
            <path d="M10.172 13.828a4 4 0 0 0 5.656 0l4-4a4 4 0 0 0-5.656-5.656l-1.1 1.1"/>
          </svg>
          {$_('admin.mcpOAuth.orgConnection.connect')}
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .org-connection-panel {
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
    justify-content: space-between;
  }

  .panel-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
  }

  .panel-loading {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    color: var(--text-secondary);
    font-size: 0.8125rem;
    padding: var(--space-md) 0;
  }

  .connection-status {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .status-row {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-size: 0.8125rem;
  }

  .status-row--scopes {
    align-items: flex-start;
  }

  .status-indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--text-tertiary);
    flex-shrink: 0;
  }

  .status-indicator--connected {
    background: var(--brand-green);
    box-shadow: 0 0 6px rgba(var(--brand-green-rgb), 0.4);
  }

  .status-label {
    color: var(--text-secondary);
    font-weight: 500;
    min-width: 60px;
  }

  .status-value {
    color: var(--text-primary);
  }

  .status-value--connected {
    color: var(--brand-green);
    font-weight: 500;
  }

  .status-value--warning {
    color: #f59e0b;
    font-weight: 500;
  }

  .status-value--error {
    color: var(--brand-red);
    font-weight: 500;
  }

  .scopes-list {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .scope-badge {
    font-size: 0.6875rem;
    padding: 2px 6px;
    border-radius: 4px;
    background: rgba(var(--glass-tint), 0.06);
    color: var(--text-secondary);
    border: 1px solid rgba(255, 255, 255, 0.06);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  }

  .connection-hint {
    font-size: 0.8125rem;
    color: var(--text-tertiary);
    line-height: 1.5;
    margin: 0;
  }

  .connection-actions {
    display: flex;
    gap: var(--space-sm);
    padding-top: var(--space-xs);
  }

  .btn-action {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-sm) var(--space-md);
    font-size: 0.8125rem;
    font-weight: 500;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all 0.2s ease;
    background: transparent;
    color: var(--text-primary);
  }

  .btn-action:hover:not(:disabled) {
    background: rgba(var(--glass-tint), 0.06);
    border-color: rgba(255, 255, 255, 0.16);
  }

  .btn-action:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-action--primary {
    background: var(--brand);
    border-color: var(--brand);
    color: white;
  }

  .btn-action--primary:hover:not(:disabled) {
    background: var(--brand-hover);
    border-color: var(--brand-hover);
  }

  .btn-action--danger {
    color: var(--brand-red);
    border-color: rgba(239, 68, 68, 0.2);
  }

  .btn-action--danger:hover:not(:disabled) {
    background: rgba(239, 68, 68, 0.1);
    border-color: rgba(239, 68, 68, 0.3);
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255, 255, 255, 0.2);
    border-top-color: var(--text-primary);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  .spinner--small {
    width: 12px;
    height: 12px;
    border-width: 1.5px;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
