<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { onMount } from "svelte";
  import { _ } from "svelte-i18n";
  import LoadingSpinner from "../../admin/components/LoadingSpinner.svelte";
  import AdminTableCard from "../../admin/components/AdminTableCard.svelte";
  import Modal from "../../admin/components/Modal.svelte";
  import type {
    McpServer,
    McpConnection,
    McpToolDetail,
  } from "../../types/integrations.js";
  import {
    getMcpServers,
    getMcpConnections,
    authorizeMcpConnection,
    disconnectMcpConnection,
    getMcpTools,
  } from "../../api/integrations.js";
  import { ApiError } from "../../api/client.js";
  import { toast } from "../../components/Toaster.svelte";
  import { openNativeMcpOAuth } from "$lib/platform/nativeMcpOAuth";

  type ConnectionStatus = 'connected' | 'expired' | 'error' | 'disconnected';

  interface MergedServer {
    id: string;
    name: string;
    description: string;
    icon: string;
    transport_type: string;
    connected: boolean;
    status: ConnectionStatus;
    connected_at: string | null;
    expires_at: string | null;
    account_email: string | null;
    scopes: string[];
    tools: { name: string; description: string }[];
  }

  function computeStatus(conn: import("../../types/integrations.js").McpConnection | undefined): ConnectionStatus {
    if (!conn) return 'disconnected';
    if (conn.status === 'error') return 'error';
    if (conn.status === 'expired') return 'expired';
    if (conn.expires_at) {
      const expiresAt = new Date(conn.expires_at);
      if (expiresAt.getTime() < Date.now()) return 'expired';
    }
    return conn.connected ? 'connected' : 'disconnected';
  }

  let servers = $state<MergedServer[]>([]);
  let loading = $state(true);
  let connectingId = $state<string | null>(null);
  let disconnectingId = $state<string | null>(null);
  let disconnectConfirmId = $state<string | null>(null);
  let filterStatus = $state<"all" | "connected" | "available">("all");
  let viewMode = $state<"grid" | "table">("grid");
  let serverTools = $state<McpToolDetail[]>([]);
  let toolsLoading = $state(false);
  let toolsModalOpen = $state(false);
  let toolsModalServerName = $state("");

  const filteredServers = $derived(() => {
    if (filterStatus === "all") return servers;
    if (filterStatus === "connected")
      return servers.filter((s) => s.connected);
    if (filterStatus === "available")
      return servers.filter((s) => !s.connected);
    return servers;
  });

  const connectedCount = $derived(
    servers.filter((s) => s.connected).length
  );
  const availableCount = $derived(
    servers.filter((s) => !s.connected).length
  );

  async function loadData() {
    loading = true;
    try {
      const [serversRes, connectionsRes] = await Promise.all([
        getMcpServers(),
        getMcpConnections(),
      ]);

      const connectionMap = new Map<string, McpConnection>();
      for (const conn of connectionsRes.connections) {
        connectionMap.set(conn.server_id, conn);
      }

      servers = serversRes.servers.map((s) => {
        const conn = connectionMap.get(s.id);
        const status = computeStatus(conn);
        return {
          id: s.id,
          name: s.name,
          description: s.description,
          icon: s.icon,
          transport_type: s.transport_type,
          connected: status === 'connected',
          status,
          connected_at: conn?.connected_at ?? null,
          expires_at: conn?.expires_at ?? null,
          account_email: conn?.account_email ?? null,
          scopes: conn?.scopes ?? [],
          tools: s.tools ?? [],
        };
      });
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.description || $_("userIntegrations.failedToLoad")
          : $_("userIntegrations.failedToLoad");
      toast.error(message);
    } finally {
      loading = false;
    }
  }

  async function handleConnect(server: MergedServer) {
    if (connectingId) return;
    connectingId = server.id;
    try {
      const response = await authorizeMcpConnection(server.id);
      if (response?.authorization_url) {
        sessionStorage.setItem('mcp_oauth_origin', 'user');
        sessionStorage.setItem('mcp_oauth_redirect_url', window.location.pathname + window.location.search);

        const nativeResult = await openNativeMcpOAuth(response.authorization_url);
        if (nativeResult) {
          if (nativeResult.success) {
            await loadData();
          } else {
            toast.error(nativeResult.error || $_("userIntegrations.failedToConnect", { values: { name: server.name } }));
          }
          connectingId = null;
          return;
        }

        window.location.href = response.authorization_url;
      } else {
        toast.error($_("userIntegrations.failedToGetAuthUrl"));
        connectingId = null;
      }
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.description || $_("userIntegrations.failedToConnect", { values: { name: server.name } })
          : $_("userIntegrations.failedToConnect", { values: { name: server.name } });
      toast.error(message);
      connectingId = null;
    }
  }

  async function handleDisconnect(server: MergedServer) {
    if (disconnectingId) return;
    disconnectingId = server.id;
    disconnectConfirmId = null;
    try {
      const response = await disconnectMcpConnection(server.id);
      if (response.success) {
        servers = servers.map((s) =>
          s.id === server.id
            ? { ...s, connected: false, status: 'disconnected' as ConnectionStatus, connected_at: null, expires_at: null, account_email: null, scopes: [] }
            : s
        );
        toast.success($_("userIntegrations.disconnected", { values: { name: server.name } }));
      }
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.description || $_("userIntegrations.failedToDisconnect", { values: { name: server.name } })
          : $_("userIntegrations.failedToDisconnect", { values: { name: server.name } });
      toast.error(message);
    } finally {
      disconnectingId = null;
    }
  }

  async function openToolsModal(server: MergedServer) {
    toolsModalServerName = server.name;
    toolsModalOpen = true;
    toolsLoading = true;
    serverTools = [];
    try {
      const res = await getMcpTools({ server_id: server.id });
      serverTools = res.tools;
    } catch {
      serverTools = [];
    } finally {
      toolsLoading = false;
    }
  }

  function closeToolsModal() {
    toolsModalOpen = false;
    serverTools = [];
    toolsModalServerName = "";
  }

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  onMount(() => {
    loadData();
  });
</script>

<div class="integrations-container">
  {#if loading}
    <LoadingSpinner size="md" text={$_("userIntegrations.loading")} />
  {:else}
    <!-- Summary bar -->
    <div class="integrations-summary">
      <div class="summary-stats">
        <span class="stat">
          <span class="stat-value">{connectedCount}</span>
          <span class="stat-label">{$_("userIntegrations.stats.connected")}</span>
        </span>
        <span class="stat-divider"></span>
        <span class="stat">
          <span class="stat-value">{availableCount}</span>
          <span class="stat-label">{$_("userIntegrations.stats.available")}</span>
        </span>
        <span class="stat-divider"></span>
        <span class="stat">
          <span class="stat-value">{servers.length}</span>
          <span class="stat-label">{$_("userIntegrations.stats.total")}</span>
        </span>
      </div>
      <div class="toolbar-right">
        <div class="view-toggle" role="group" aria-label="View mode">
          <button
            class="view-toggle-btn"
            class:view-toggle-btn--active={viewMode === "grid"}
            onclick={() => (viewMode = "grid")}
            aria-label={$_("admin.viewMode.grid")}
            title={$_("admin.viewMode.grid")}
          >
          <span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
          </span>
          </button>
          <button
            class="view-toggle-btn"
            class:view-toggle-btn--active={viewMode === "table"}
            onclick={() => (viewMode = "table")}
            aria-label={$_("admin.viewMode.table")}
            title={$_("admin.viewMode.table")}
          >
          <span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="6" x2="20" y2="6"></line><line x1="4" y1="12" x2="20" y2="12"></line><line x1="4" y1="18" x2="20" y2="18"></line></svg>
          </span>
          </button>
        </div>
        <div class="filter-group" role="tablist" aria-label={$_("userIntegrations.filters.filterAria")}>
          <button
            class="filter-btn"
            class:filter-btn--active={filterStatus === "all"}
            onclick={() => (filterStatus = "all")}
            role="tab"
            aria-selected={filterStatus === "all"}
          >
            {$_("userIntegrations.filters.all")}
          </button>
          <button
            class="filter-btn"
            class:filter-btn--active={filterStatus === "connected"}
            onclick={() => (filterStatus = "connected")}
            role="tab"
            aria-selected={filterStatus === "connected"}
          >
            {$_("userIntegrations.filters.connected")}
          </button>
          <button
            class="filter-btn"
            class:filter-btn--active={filterStatus === "available"}
            onclick={() => (filterStatus = "available")}
            role="tab"
            aria-selected={filterStatus === "available"}
          >
            {$_("userIntegrations.filters.available")}
          </button>
        </div>
      </div>
    </div>

    <!-- Empty state -->
    {#if filteredServers().length === 0}
      <div class="empty-state">
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        >
          <path
            d="M13.828 10.172a4 4 0 0 0-5.656 0l-4 4a4 4 0 1 0 5.656 5.656l1.102-1.101"
          />
          <path
            d="M10.172 13.828a4 4 0 0 0 5.656 0l4-4a4 4 0 0 0-5.656-5.656l-1.1 1.1"
          />
        </svg>
        <p class="empty-title">{$_("userIntegrations.empty.title")}</p>
        <p class="empty-subtitle">
          {#if filterStatus === "connected"}
            {$_("userIntegrations.empty.noConnected")}
          {:else if filterStatus === "available"}
            {$_("userIntegrations.empty.noAvailable")}
          {:else}
            {$_("userIntegrations.empty.noConfigured")}
          {/if}
        </p>
        {#if filterStatus !== "all"}
          <button class="empty-reset-btn" onclick={() => (filterStatus = "all")}>
            {$_("userIntegrations.empty.viewAll")}
          </button>
        {/if}
      </div>

    <!-- Table View -->
    {:else if viewMode === "table"}
      <AdminTableCard minWidth="760px">
        <table class="admin-table integrations-table">
          <thead>
            <tr>
              <th>{$_("userIntegrations.columns.name")}</th>
              <th>{$_("userIntegrations.columns.transport")}</th>
              <th>{$_("userIntegrations.columns.status")}</th>
              <th>{$_("userIntegrations.columns.tools")}</th>
              <th>{$_("userIntegrations.columns.connectedAt")}</th>
              <th>{$_("userIntegrations.columns.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {#each filteredServers() as server (server.id)}
              <tr>
                <td>
                  <div class="name-cell">
                    <div class="table-icon-wrapper">
                      {#if server.icon}
                        <img
                          src={server.icon}
                          alt={server.name}
                          class="table-icon"
                          onerror={(e) => {
                            const target = e.currentTarget as HTMLImageElement;
                            target.style.display = 'none';
                            const parent = target.parentElement;
                            if (parent && !parent.querySelector('.table-icon-fallback')) {
                              const fb = document.createElement('span');
                              fb.className = 'table-icon-fallback';
                              fb.textContent = server.name.charAt(0).toUpperCase();
                              parent.appendChild(fb);
                            }
                          }}
                        />
                      {:else}
                        <span class="table-icon-fallback">{server.name.charAt(0).toUpperCase()}</span>
                      {/if}
                    </div>
                    <div class="name-text">
                      <span class="server-name">{server.name}</span>
                      {#if server.description}
                        <span class="server-description">{server.description}</span>
                      {/if}
                    </div>
                  </div>
                </td>
                <td>
                  <span class="transport-badge">{server.transport_type}</span>
                </td>
                <td>
                  <span
                    class="status-badge"
                    class:status-badge--connected={server.status === 'connected'}
                    class:status-badge--disconnected={server.status === 'disconnected'}
                    class:status-badge--expired={server.status === 'expired'}
                    class:status-badge--error={server.status === 'error'}
                  >
                    <span class="status-dot"></span>
                    {$_(`userIntegrations.status.${server.status}`)}
                  </span>
                </td>
                <td>
                  <button
                    class="tools-count-btn"
                    onclick={() => openToolsModal(server)}
                    title={$_("userIntegrations.actions.viewTools")}
                  >
                    {server.tools.length} {server.tools.length !== 1 ? $_("admin.viewMode.tools") : $_("admin.viewMode.tool")}
                  </button>
                </td>
                <td>
                  <div class="date-cell">
                    {#if server.account_email}
                      <span class="account-email">{server.account_email}</span>
                    {/if}
                    <span class="date-text">
                      {server.connected_at ? formatDate(server.connected_at) : "—"}
                    </span>
                  </div>
                </td>
                <td>
                  <div class="action-buttons">
                    {#if server.status === 'connected'}
                      <button
                        class="action-btn action-btn--reconnect"
                        onclick={() => handleConnect(server)}
                        disabled={connectingId === server.id}
                        title={$_("userIntegrations.actions.reconnect")}
                      >
                        {#if connectingId === server.id}
                          <span class="btn-spinner"></span>
                        {:else}
                          {$_("userIntegrations.actions.reconnect")}
                        {/if}
                      </button>
                      {#if disconnectConfirmId === server.id}
                        <div class="confirm-disconnect">
                          <span class="confirm-text">{$_("userIntegrations.actions.disconnectConfirm")}</span>
                          <button
                            class="confirm-btn confirm-btn--yes"
                            onclick={() => handleDisconnect(server)}
                            disabled={disconnectingId === server.id}
                          >
                            {#if disconnectingId === server.id}
                              <span class="btn-spinner"></span>
                            {:else}
                              {$_("userIntegrations.actions.yes")}
                            {/if}
                          </button>
                          <button
                            class="confirm-btn confirm-btn--no"
                            onclick={() => (disconnectConfirmId = null)}
                            disabled={disconnectingId === server.id}
                          >
                            {$_("userIntegrations.actions.no")}
                          </button>
                        </div>
                      {:else}
                        <button
                          class="action-btn action-btn--disconnect"
                          onclick={() => (disconnectConfirmId = server.id)}
                          disabled={disconnectingId === server.id}
                        >
                          {$_("userIntegrations.actions.disconnect")}
                        </button>
                      {/if}
                    {:else if server.status === 'expired'}
                      <div class="expired-warning">
                        <span class="expired-text">{$_("userIntegrations.status.expiredWarning")}</span>
                      </div>
                      <button
                        class="action-btn action-btn--reconnect"
                        onclick={() => handleConnect(server)}
                        disabled={connectingId === server.id}
                      >
                        {#if connectingId === server.id}
                          <span class="btn-spinner"></span>
                          {$_("userIntegrations.actions.connecting")}
                        {:else}
                          {$_("userIntegrations.actions.reconnect")}
                        {/if}
                      </button>
                    {:else if server.status === 'error'}
                      <button
                        class="action-btn action-btn--reconnect"
                        onclick={() => handleConnect(server)}
                        disabled={connectingId === server.id}
                      >
                        {#if connectingId === server.id}
                          <span class="btn-spinner"></span>
                          {$_("userIntegrations.actions.connecting")}
                        {:else}
                          {$_("userIntegrations.actions.reconnect")}
                        {/if}
                      </button>
                    {:else}
                      <button
                        class="action-btn action-btn--connect"
                        onclick={() => handleConnect(server)}
                        disabled={connectingId === server.id}
                      >
                        {#if connectingId === server.id}
                          <span class="btn-spinner"></span>
                          {$_("userIntegrations.actions.connecting")}
                        {:else}
                          {$_("userIntegrations.actions.connect")}
                        {/if}
                      </button>
                    {/if}
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </AdminTableCard>

    <!-- Grid View -->
    {:else}
      <div class="integrations-grid">
        {#each filteredServers() as server (server.id)}
          <div
            class="integration-card"
            class:integration-card--connected={server.status === 'connected'}
            class:integration-card--expired={server.status === 'expired'}
            class:integration-card--error={server.status === 'error'}
          >
            <div class="card-header">
              <div class="card-icon-wrapper">
                {#if server.icon}
                  <img
                    src={server.icon}
                    alt={server.name}
                    class="card-icon"
                    onerror={(e) => {
                      const target = e.currentTarget as HTMLImageElement;
                      target.style.display = 'none';
                      const parent = target.parentElement;
                      if (parent && !parent.querySelector('.card-icon-fallback')) {
                        const fallback = document.createElement('div');
                        fallback.className = 'card-icon-fallback';
                        fallback.textContent = server.name.charAt(0).toUpperCase();
                        parent.appendChild(fallback);
                      }
                    }}
                  />
                {:else}
                  <div class="card-icon-fallback">{server.name.charAt(0).toUpperCase()}</div>
                {/if}
              </div>
              <div class="card-title-group">
                <h3 class="card-title">{server.name}</h3>
                <span
                  class="card-status"
                  class:status--connected={server.status === 'connected'}
                  class:status--disconnected={server.status === 'disconnected'}
                  class:status--expired={server.status === 'expired'}
                  class:status--error={server.status === 'error'}
                >
                  <span class="status-dot"></span>
                  {$_(`userIntegrations.status.${server.status}`)}
                </span>
              </div>
            </div>

            <p class="card-description">{server.description}</p>

            <div class="card-meta">
              <span class="meta-tag">{server.transport_type}</span>
              <button
                class="meta-tools-btn"
                onclick={() => openToolsModal(server)}
              >
                {server.tools.length} {server.tools.length !== 1 ? $_("admin.viewMode.tools") : $_("admin.viewMode.tool")}
              </button>
            </div>

            {#if server.status === 'expired'}
              <div class="card-expired-warning">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                <span>{$_("userIntegrations.status.expiredWarning")}</span>
              </div>
            {/if}

            {#if (server.status === 'connected' || server.status === 'expired') && server.connected_at}
              <div class="card-connection-info">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                {#if server.account_email}
                  <span class="account-email">{server.account_email}</span>
                  <span class="connection-separator">·</span>
                {/if}
                <span class="connection-date">
                  {$_("userIntegrations.connectedSince", { values: { date: formatDate(server.connected_at) } })}
                </span>
              </div>
            {/if}

            <div class="card-actions">
              {#if server.status === 'connected'}
                <button
                  class="action-btn action-btn--reconnect"
                  onclick={() => handleConnect(server)}
                  disabled={connectingId === server.id}
                  style="margin-right: var(--space-sm);"
                >
                  {#if connectingId === server.id}
                    <span class="btn-spinner"></span>
                  {:else}
                    {$_("userIntegrations.actions.reconnect")}
                  {/if}
                </button>
                {#if disconnectConfirmId === server.id}
                  <div class="confirm-disconnect">
                    <span class="confirm-text">{$_("userIntegrations.actions.disconnectConfirm")}</span>
                    <button
                      class="confirm-btn confirm-btn--yes"
                      onclick={() => handleDisconnect(server)}
                      disabled={disconnectingId === server.id}
                    >
                      {#if disconnectingId === server.id}
                        <span class="btn-spinner"></span>
                      {:else}
                        {$_("userIntegrations.actions.yes")}
                      {/if}
                    </button>
                    <button
                      class="confirm-btn confirm-btn--no"
                      onclick={() => (disconnectConfirmId = null)}
                      disabled={disconnectingId === server.id}
                    >
                      {$_("userIntegrations.actions.no")}
                    </button>
                  </div>
                {:else}
                  <button
                    class="action-btn action-btn--disconnect"
                    onclick={() => (disconnectConfirmId = server.id)}
                    disabled={disconnectingId === server.id}
                  >
                    {$_("userIntegrations.actions.disconnect")}
                  </button>
                {/if}
              {:else if server.status === 'expired'}
                <button
                  class="action-btn action-btn--reconnect"
                  onclick={() => handleConnect(server)}
                  disabled={connectingId === server.id}
                >
                  {#if connectingId === server.id}
                    <span class="btn-spinner"></span>
                    {$_("userIntegrations.actions.connecting")}
                  {:else}
                    {$_("userIntegrations.actions.reconnect")}
                  {/if}
                </button>
              {:else if server.status === 'error'}
                <button
                  class="action-btn action-btn--reconnect"
                  onclick={() => handleConnect(server)}
                  disabled={connectingId === server.id}
                >
                  {#if connectingId === server.id}
                    <span class="btn-spinner"></span>
                    {$_("userIntegrations.actions.connecting")}
                  {:else}
                    {$_("userIntegrations.actions.reconnect")}
                  {/if}
                </button>
              {:else}
                <button
                  class="action-btn action-btn--connect"
                  onclick={() => handleConnect(server)}
                  disabled={connectingId === server.id}
                >
                  {#if connectingId === server.id}
                    <span class="btn-spinner"></span>
                    {$_("userIntegrations.actions.connecting")}
                  {:else}
                    {$_("userIntegrations.actions.connect")}
                  {/if}
                </button>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<Modal isOpen={toolsModalOpen} title={$_("userIntegrations.tools.modalTitle", { values: { name: toolsModalServerName } })} onclose={closeToolsModal}>
  {#if toolsLoading}
    <div class="tools-loading">
      <span class="btn-spinner"></span>
      {$_("userIntegrations.tools.loading")}
    </div>
  {:else if serverTools.length === 0}
    <div class="tools-empty">{$_("userIntegrations.tools.empty")}</div>
  {:else}
    <div class="tools-modal-list">
      {#each serverTools as tool (tool.id)}
        <div class="tool-item">
          <span class="tool-name">{tool.name}</span>
          <span class="tool-desc">{tool.description}</span>
        </div>
      {/each}
    </div>
  {/if}
</Modal>

<style>
  .integrations-container {
    padding: var(--space-lg);
    min-height: 100%;
  }

  /* Summary bar */
  .integrations-summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-lg);
    margin-bottom: var(--space-2xl);
    flex-wrap: wrap;
  }

  .summary-stats {
    display: flex;
    align-items: center;
    gap: var(--space-xl);
  }

  .stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2xs);
  }

  .stat-value {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--text-primary);
    line-height: 1;
  }

  .stat-label {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .stat-divider {
    width: 1px;
    height: 2rem;
    background: rgba(255, 255, 255, 0.08);
  }

  /* Toolbar right */
  .toolbar-right {
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }

  /* View toggle */
  .view-toggle {
    display: flex;
    align-items: center;
    gap: var(--space-2xs);
    padding: var(--space-2xs);
    background: rgba(var(--glass-tint), 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: var(--radius-md);
  }

  .view-toggle-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s ease;
    padding: 0;
    line-height: 0;
  }

  .view-toggle-btn:hover:not(.view-toggle-btn--active) {
    color: var(--text-primary);
    background: rgba(var(--glass-tint), 0.05);
  }

  .view-toggle-btn--active {
    color: var(--text-primary);
    background: rgba(var(--glass-tint), 0.1);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
  }


  /* Filter buttons */
  .filter-group {
    display: flex;
    align-items: center;
    gap: var(--space-2xs);
    padding: var(--space-2xs);
    background: rgba(var(--glass-tint), 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: var(--radius-full);
  }

  .filter-btn {
    padding: var(--space-xs) var(--space-lg);
    border: none;
    border-radius: var(--radius-full);
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-secondary);
    background: transparent;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: none;
  }

  .filter-btn:hover:not(.filter-btn--active) {
    color: var(--text-primary);
    background: rgba(var(--glass-tint), 0.05);
  }

  .filter-btn--active {
    color: var(--text-primary);
    background: rgba(var(--glass-tint), 0.1);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
  }

  /* ===== TABLE VIEW ===== */
  .integrations-table {
    width: 100%;
  }

  .name-cell {
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }

  .table-icon-wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    min-width: 36px;
    border-radius: var(--radius-md);
    background: rgba(var(--glass-tint), 0.06);
    border: 1px solid rgba(255, 255, 255, 0.06);
    overflow: hidden;
  }

  .table-icon {
    width: 22px;
    height: 22px;
    object-fit: contain;
  }

  :global(.table-icon-fallback) {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.875rem;
    font-weight: 700;
    color: var(--brand);
    background: rgba(var(--brand-rgb), 0.1);
  }

  .name-text {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
    max-width: 200px;
  }

  .server-name {
    font-weight: 600;
    color: var(--text-primary);
  }

  .server-description {
    font-size: 0.8125rem;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .transport-badge {
    display: inline-block;
    padding: var(--space-2xs) var(--space-sm);
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--text-secondary);
    background: rgba(var(--glass-tint), 0.06);
    border-radius: var(--radius-sm);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    font-size: 0.8125rem;
    font-weight: 500;
  }

  .status-badge--connected {
    color: var(--brand-green);
  }

  .status-badge--disconnected {
    color: var(--text-secondary);
  }

  .status-badge--expired {
    color: var(--brand-yellow, #ecc94b);
  }

  .status-badge--error {
    color: var(--brand-red);
  }

  .status-badge--expired .status-dot {
    background: var(--brand-yellow, #ecc94b);
    box-shadow: 0 0 6px rgba(236, 201, 75, 0.4);
  }

  .status-badge--error .status-dot {
    background: var(--brand-red);
    box-shadow: 0 0 6px rgba(var(--brand-red-rgb), 0.4);
  }

  .date-cell {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
  }

  .account-email {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-primary);
  }

  .connection-separator {
    color: var(--text-secondary);
    opacity: 0.5;
  }

  .expired-warning {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
  }

  .expired-text {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--brand-yellow, #ecc94b);
  }

  .tools-count-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-2xs) var(--space-sm);
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--brand);
    background: rgba(var(--brand-rgb), 0.06);
    border: 1px solid rgba(var(--brand-rgb), 0.12);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .tools-count-btn:hover {
    background: rgba(var(--brand-rgb), 0.1);
    border-color: rgba(var(--brand-rgb), 0.2);
  }

  .date-text {
    font-size: 0.8125rem;
    color: var(--text-secondary);
  }

  .action-buttons {
    display: flex;
    gap: var(--space-sm);
    align-items: center;
  }

  .tool-item {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
    padding: var(--space-sm) var(--space-md);
    background: rgba(var(--glass-tint), 0.04);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: var(--radius-sm);
    margin-bottom: var(--space-sm);
  }

  .tool-name {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .tool-desc {
    font-size: 0.75rem;
    color: var(--text-secondary);
    line-height: 1.4;
  }

  .tools-loading {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-md);
    font-size: 0.8125rem;
    color: var(--text-secondary);
  }

  .tools-empty {
    padding: var(--space-md);
    font-size: 0.8125rem;
    color: var(--text-secondary);
    opacity: 0.7;
  }

  /* ===== GRID VIEW ===== */
  .integrations-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    gap: var(--space-xl);
  }

  /* Card */
  .integration-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    padding: var(--space-xl);
    background: rgba(var(--glass-tint), 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: var(--radius-lg);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .integration-card:hover {
    border-color: rgba(255, 255, 255, 0.12);
    background: rgba(var(--glass-tint), 0.05);
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  }

  .integration-card--connected {
    border-color: color-mix(in oklab, var(--brand-green) 20%, transparent);
  }

  .integration-card--connected:hover {
    border-color: color-mix(in oklab, var(--brand-green) 35%, transparent);
  }

  .integration-card--expired {
    border-color: color-mix(in oklab, var(--brand-yellow, #ecc94b) 25%, transparent);
  }

  .integration-card--expired:hover {
    border-color: color-mix(in oklab, var(--brand-yellow, #ecc94b) 40%, transparent);
  }

  .integration-card--error {
    border-color: color-mix(in oklab, var(--brand-red) 20%, transparent);
  }

  .integration-card--error:hover {
    border-color: color-mix(in oklab, var(--brand-red) 35%, transparent);
  }

  /* Card header */
  .card-header {
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }

  .card-icon-wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    min-width: 44px;
    border-radius: var(--radius-md);
    background: rgba(var(--glass-tint), 0.06);
    border: 1px solid rgba(255, 255, 255, 0.06);
    overflow: hidden;
  }

  .card-icon {
    width: 26px;
    height: 26px;
    object-fit: contain;
  }

  :global(.card-icon-fallback) {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--brand);
    background: rgba(var(--brand-rgb), 0.1);
  }

  .card-title-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
    min-width: 0;
  }

  .card-title {
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
    letter-spacing: -0.01em;
  }

  .card-status {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    font-size: 0.75rem;
    font-weight: 500;
  }

  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .status--connected {
    color: var(--brand-green);
  }

  .status--connected .status-dot {
    background: var(--brand-green);
    box-shadow: 0 0 6px rgba(var(--brand-green-rgb), 0.4);
  }

  .status--disconnected {
    color: var(--text-secondary);
  }

  .status--disconnected .status-dot {
    background: var(--text-secondary);
    opacity: 0.5;
  }

  .status--expired {
    color: var(--brand-yellow, #ecc94b);
  }

  .status--expired .status-dot {
    background: var(--brand-yellow, #ecc94b);
    box-shadow: 0 0 6px rgba(236, 201, 75, 0.4);
  }

  .status--error {
    color: var(--brand-red);
  }

  .status--error .status-dot {
    background: var(--brand-red);
    box-shadow: 0 0 6px rgba(var(--brand-red-rgb), 0.4);
  }

  .status-badge .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .status-badge--connected .status-dot {
    background: var(--brand-green);
    box-shadow: 0 0 6px rgba(var(--brand-green-rgb), 0.4);
  }

  .status-badge--disconnected .status-dot {
    background: var(--text-secondary);
    opacity: 0.5;
  }

  /* Card description */
  .card-description {
    font-size: 0.8125rem;
    line-height: 1.6;
    color: var(--text-secondary);
    margin: 0;
    flex: 1;
  }

  /* Card meta (transport + tools) */
  .card-meta {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .meta-tag {
    display: inline-block;
    padding: var(--space-2xs) var(--space-sm);
    font-size: 0.6875rem;
    font-weight: 500;
    color: var(--text-secondary);
    background: rgba(var(--glass-tint), 0.06);
    border-radius: var(--radius-sm);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .meta-tools-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2xs);
    padding: var(--space-2xs) var(--space-sm);
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--brand);
    background: transparent;
    border: none;
    cursor: pointer;
    transition: color 0.2s ease;
  }

  .meta-tools-btn:hover {
    color: var(--brand-hover);
  }

  /* Card expired warning */
  .card-expired-warning {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    background: rgba(236, 201, 75, 0.08);
    border: 1px solid rgba(236, 201, 75, 0.15);
    border-radius: var(--radius-sm);
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--brand-yellow, #ecc94b);
  }

  .card-expired-warning svg {
    flex-shrink: 0;
  }

  /* Connection info */
  .card-connection-info {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    background: rgba(var(--brand-green-rgb), 0.06);
    border: 1px solid rgba(var(--brand-green-rgb), 0.1);
    border-radius: var(--radius-sm);
    font-size: 0.75rem;
    color: var(--text-secondary);
    flex-wrap: wrap;
  }



  .connection-date {
    opacity: 0.7;
  }

  /* Card actions */
  .card-actions {
    display: flex;
    align-items: center;
    padding-top: var(--space-sm);
    border-top: 1px solid rgba(255, 255, 255, 0.05);
    margin-top: auto;
  }

  .action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-xl);
    border-radius: var(--radius-sm);
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    border: none;
    min-height: 36px;
  }

  .action-btn--connect {
    background: var(--brand);
    color: white;
    box-shadow: 0 2px 8px rgba(var(--brand-rgb), 0.2);
  }

  .action-btn--connect:hover:not(:disabled) {
    background: var(--brand-hover);
    box-shadow: 0 4px 12px rgba(var(--brand-rgb), 0.3);
    transform: translateY(-1px);
  }

  .action-btn--disconnect {
    background: transparent;
    color: var(--text-secondary);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .action-btn--disconnect:hover:not(:disabled) {
    color: var(--brand-red);
    border-color: color-mix(in oklab, var(--brand-red) 30%, transparent);
    background: rgba(var(--brand-red-rgb), 0.06);
    transform: translateY(-1px);
  }

  .action-btn--reconnect {
    background: transparent;
    color: var(--text-secondary);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .action-btn--reconnect:hover:not(:disabled) {
    color: var(--brand);
    border-color: color-mix(in oklab, var(--brand) 30%, transparent);
    background: rgba(var(--brand-rgb), 0.06);
    transform: translateY(-1px);
  }

  .action-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }

  /* Disconnect confirm */
  .confirm-disconnect {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .confirm-text {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--brand-red);
  }

  .confirm-btn {
    padding: var(--space-xs) var(--space-md);
    border-radius: var(--radius-sm);
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    border: none;
    min-height: 28px;
    transition: all 0.2s ease;
  }

  .confirm-btn--yes {
    background: var(--brand-red);
    color: white;
  }

  .confirm-btn--yes:hover:not(:disabled) {
    opacity: 0.9;
  }

  .confirm-btn--no {
    background: transparent;
    color: var(--text-secondary);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .confirm-btn--no:hover:not(:disabled) {
    background: rgba(var(--glass-tint), 0.05);
    color: var(--text-primary);
  }

  /* Spinner inside buttons */
  .btn-spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* Empty state */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-3xl) var(--space-xl);
    text-align: center;
    gap: var(--space-md);
  }

 

  .empty-title {
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
  }

  .empty-subtitle {
    font-size: 0.875rem;
    color: var(--text-secondary);
    margin: 0;
    max-width: 320px;
  }

  .empty-reset-btn {
    padding: var(--space-sm) var(--space-xl);
    border-radius: var(--radius-sm);
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--brand);
    background: rgba(var(--brand-rgb), 0.08);
    border: 1px solid rgba(var(--brand-rgb), 0.15);
    cursor: pointer;
    transition: all 0.2s ease;
    margin-top: var(--space-sm);
  }

  .empty-reset-btn:hover {
    background: rgba(var(--brand-rgb), 0.14);
    border-color: rgba(var(--brand-rgb), 0.25);
    transform: translateY(-1px);
  }

  /* Responsive */
  @media (max-width: 768px) {
    .integrations-container {
      padding: var(--space-md);
    }

    .integrations-summary {
      flex-direction: column;
      align-items: stretch;
      gap: var(--space-md);
    }

    .toolbar-right {
      justify-content: center;
      flex-wrap: wrap;
    }

    .summary-stats {
      justify-content: center;
    }

    .filter-group {
      justify-content: center;
    }

    .integrations-grid {
      grid-template-columns: 1fr;
      gap: var(--space-md);
    }
  }

  @media (orientation: landscape) and (max-height: 600px) {
    :global(html[data-app-layout='mobile']) .integrations-container {
      padding: var(--space-sm);
    }

    :global(html[data-app-layout='mobile']) .integrations-summary {
      gap: var(--space-sm);
      margin-bottom: var(--space-md);
    }

    :global(html[data-app-layout='mobile']) .summary-stats {
      gap: var(--space-lg);
    }

    :global(html[data-app-layout='mobile']) .toolbar-right {
      justify-content: flex-start;
      overflow-x: auto;
      padding-bottom: 2px;
    }

    :global(html[data-app-layout='mobile']) .integrations-grid {
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: var(--space-sm);
    }

    :global(html[data-app-layout='mobile']) .integration-card {
      padding: var(--space-md);
      gap: var(--space-sm);
    }
  }

  @media (max-width: 480px) {
    .integrations-container {
      padding: var(--space-sm);
    }

    .integration-card {
      padding: var(--space-lg);
    }

    .card-icon-wrapper {
      width: 38px;
      height: 38px;
      min-width: 38px;
    }

    .card-icon {
      width: 22px;
      height: 22px;
    }

    .card-description {
      font-size: 0.75rem;
    }

    .summary-stats {
      gap: var(--space-lg);
    }

    .stat-value {
      font-size: 1.25rem;
    }

    .filter-btn {
      padding: var(--space-xs) var(--space-md);
      font-size: 0.75rem;
    }
  }

  @media (min-width: 1400px) {
    .integrations-grid {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  /* Light mode overrides */
  @media (prefers-color-scheme: light) {
    .integration-card {
      background: rgba(0, 0, 0, 0.02);
      border-color: rgba(0, 0, 0, 0.08);
    }

    .integration-card:hover {
      background: rgba(0, 0, 0, 0.03);
      border-color: rgba(0, 0, 0, 0.12);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.06);
    }

    .integration-card--connected {
      border-color: color-mix(in oklab, var(--brand-green) 25%, transparent);
    }

    .stat-divider {
      background: rgba(0, 0, 0, 0.1);
    }

    .filter-group {
      background: rgba(0, 0, 0, 0.03);
      border-color: rgba(0, 0, 0, 0.06);
    }

    .filter-btn--active {
      background: white;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
    }

    .view-toggle {
      background: rgba(0, 0, 0, 0.03);
      border-color: rgba(0, 0, 0, 0.06);
    }

    .view-toggle-btn--active {
      background: white;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
    }

    .card-icon-wrapper {
      background: rgba(0, 0, 0, 0.04);
      border-color: rgba(0, 0, 0, 0.06);
    }

    .table-icon-wrapper {
      background: rgba(0, 0, 0, 0.04);
      border-color: rgba(0, 0, 0, 0.06);
    }

    .card-connection-info {
      background: rgba(var(--brand-green-rgb), 0.05);
      border-color: rgba(var(--brand-green-rgb), 0.1);
    }

    .card-actions {
      border-top-color: rgba(0, 0, 0, 0.06);
    }

    .action-btn--disconnect {
      border-color: rgba(0, 0, 0, 0.12);
    }

    .action-btn--reconnect {
      border-color: rgba(0, 0, 0, 0.12);
    }

    .confirm-btn--no {
      border-color: rgba(0, 0, 0, 0.12);
    }

    .integration-card--expired {
      border-color: color-mix(in oklab, var(--brand-yellow, #ecc94b) 30%, transparent);
    }

    .integration-card--error {
      border-color: color-mix(in oklab, var(--brand-red) 25%, transparent);
    }

    .card-expired-warning {
      background: rgba(236, 201, 75, 0.06);
      border-color: rgba(236, 201, 75, 0.12);
    }

    .tool-item {
      background: rgba(0, 0, 0, 0.02);
      border-color: rgba(0, 0, 0, 0.06);
    }
  }
</style>
