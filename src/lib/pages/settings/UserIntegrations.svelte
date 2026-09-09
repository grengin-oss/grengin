<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { onMount } from "svelte";
  import { _ } from "svelte-i18n";
  import LoadingSpinner from "../../admin/components/LoadingSpinner.svelte";
  import Modal from "../../admin/components/Modal.svelte";
  import type { McpConnection, McpToolDetail } from "../../types/integrations.js";
  import {
    getMcpServers,
    getMcpConnections,
    authorizeMcpConnection,
    disconnectMcpConnection,
    getMcpTools,
  } from "../../api/integrations.js";
  import { ApiError } from "../../api/client.js";
  import { toast } from "../../components/Toaster.svelte";

  type ConnectionStatus = "connected" | "expired" | "error" | "disconnected";

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

  function computeStatus(
    conn: import("../../types/integrations.js").McpConnection | undefined,
  ): ConnectionStatus {
    if (!conn) return "disconnected";
    if (conn.status === "error") return "error";
    if (conn.status === "expired") return "expired";
    if (conn.expires_at) {
      const expiresAt = new Date(conn.expires_at);
      if (expiresAt.getTime() < Date.now()) return "expired";
    }
    return conn.connected ? "connected" : "disconnected";
  }

  let servers = $state<MergedServer[]>([]);
  let loading = $state(true);
  let connectingId = $state<string | null>(null);
  let disconnectingId = $state<string | null>(null);
  let disconnectConfirmId = $state<string | null>(null);
  let filterStatus = $state<"all" | "connected" | "available">("all");
  let search = $state("");
  let serverTools = $state<McpToolDetail[]>([]);
  let toolsLoading = $state(false);
  let toolsModalOpen = $state(false);
  let toolsModalServerName = $state("");

  const filteredServers = $derived.by(() => {
    const q = search.trim().toLowerCase();
    return servers.filter((s) => {
      if (filterStatus === "connected" && !s.connected) return false;
      if (filterStatus === "available" && s.connected) return false;
      if (q) {
        const hay = `${s.name} ${s.description ?? ""} ${s.transport_type}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  });

  const connectedCount = $derived(servers.filter((s) => s.connected).length);
  const availableCount = $derived(servers.filter((s) => !s.connected).length);

  const FILTERS: { id: "all" | "connected" | "available"; label: string }[] = $derived([
    { id: "all", label: $_("userIntegrations.filters.all") },
    { id: "connected", label: $_("userIntegrations.filters.connected") },
    { id: "available", label: $_("userIntegrations.filters.available") },
  ]);

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
          connected: status === "connected",
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
        sessionStorage.setItem("mcp_oauth_origin", "user");
        sessionStorage.setItem(
          "mcp_oauth_redirect_url",
          window.location.pathname + window.location.search,
        );
        window.location.href = response.authorization_url;
      } else {
        toast.error($_("userIntegrations.failedToGetAuthUrl"));
        connectingId = null;
      }
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.description ||
            $_("userIntegrations.failedToConnect", { values: { name: server.name } })
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
            ? {
                ...s,
                connected: false,
                status: "disconnected" as ConnectionStatus,
                connected_at: null,
                expires_at: null,
                account_email: null,
                scopes: [],
              }
            : s,
        );
        toast.success($_("userIntegrations.disconnected", { values: { name: server.name } }));
      }
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.description ||
            $_("userIntegrations.failedToDisconnect", { values: { name: server.name } })
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

  function toolsLabel(count: number): string {
    return `${count} ${count !== 1 ? $_("admin.viewMode.tools") : $_("admin.viewMode.tool")}`;
  }

  onMount(() => {
    loadData();
  });
</script>

<!-- The spinner glyph the mockup uses for every "Connecting…" affordance. -->
{#snippet spinner()}
  <svg class="spin" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path
      d="M7 1.75a5.25 5.25 0 1 0 5.25 5.25"
      stroke="currentColor"
      stroke-width="1.5"
      fill="none"
      stroke-linecap="round"
    />
  </svg>
{/snippet}

<div class="integrations-panel">
  {#if loading}
    <LoadingSpinner size="md" text={$_("userIntegrations.loading")} />
  {:else}
    <!-- ".stat-strip" -->
    <div class="stat-strip">
      <div class="stat-cell">
        <span class="stat-label">{$_("userIntegrations.stats.connected")}</span>
        <span class="stat-value">{connectedCount}</span>
      </div>
      <div class="stat-cell">
        <span class="stat-label">{$_("userIntegrations.stats.available")}</span>
        <span class="stat-value stat-value--accent">{availableCount}</span>
      </div>
      <div class="stat-cell">
        <span class="stat-label">{$_("userIntegrations.stats.total")}</span>
        <span class="stat-value">{servers.length}</span>
      </div>
    </div>

    <!-- ".toolbar" -->
    <div class="toolbar">
      <div class="search-input">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.3" />
          <path d="m13 13-2.3-2.3" stroke="currentColor" stroke-width="1.3" />
        </svg>
        <input
          type="text"
          bind:value={search}
          placeholder={$_("userIntegrations.searchPlaceholder")}
          aria-label={$_("userIntegrations.searchPlaceholder")}
        />
      </div>

      <!-- ".filter-segment" -->
      <div class="filter-segment" role="tablist" aria-label={$_("userIntegrations.filters.filterAria")}>
        {#each FILTERS as f (f.id)}
          <button
            class="seg-btn"
            type="button"
            role="tab"
            aria-selected={filterStatus === f.id}
            onclick={() => (filterStatus = f.id)}
          >
            {f.label}
          </button>
        {/each}
      </div>
    </div>

    {#if filteredServers.length === 0}
      <!-- ".placeholder-card", reused as the empty state -->
      <div class="empty-state">
        <span class="empty-icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M13.828 10.172a4 4 0 0 0-5.656 0l-4 4a4 4 0 1 0 5.656 5.656l1.102-1.101" />
            <path d="M10.172 13.828a4 4 0 0 0 5.656 0l4-4a4 4 0 0 0-5.656-5.656l-1.1 1.1" />
          </svg>
        </span>
        <span class="empty-title">{$_("userIntegrations.empty.title")}</span>
        <span class="empty-desc">
          {#if filterStatus === "connected"}
            {$_("userIntegrations.empty.noConnected")}
          {:else if filterStatus === "available"}
            {$_("userIntegrations.empty.noAvailable")}
          {:else}
            {$_("userIntegrations.empty.noConfigured")}
          {/if}
        </span>
        {#if filterStatus !== "all" || search.trim()}
          <button
            class="int-btn int-btn--connect"
            type="button"
            onclick={() => {
              filterStatus = "all";
              search = "";
            }}
          >
            {$_("userIntegrations.empty.viewAll")}
          </button>
        {/if}
      </div>
    {:else}
      <!-- ".cards-grid" -->
      <div class="cards-grid">
        {#each filteredServers as server (server.id)}
          <div class="int-card">
            <div class="int-card-header">
              <span class="int-card-name" title={server.name}>{server.name}</span>
              <span class="status-tag status-tag--{server.status}">
                {$_(`userIntegrations.status.${server.status}`)}
              </span>
            </div>

            <span class="int-card-desc">{server.description}</span>

            {#if server.status === "expired"}
              <div class="warn-note">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <path d="M12 9v4M12 17h.01" />
                </svg>
                <span>{$_("userIntegrations.status.expiredWarning")}</span>
              </div>
            {/if}

            {#if (server.status === "connected" || server.status === "expired") && server.connected_at}
              <div class="conn-note">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                {#if server.account_email}
                  <span>{server.account_email}</span>
                  <span aria-hidden="true">·</span>
                {/if}
                <span>
                  {$_("userIntegrations.connectedSince", {
                    values: { date: formatDate(server.connected_at) },
                  })}
                </span>
              </div>
            {/if}

            <!-- ".badges-row" -->
            <div class="badges-row">
              <span class="badge-transport">{server.transport_type}</span>
              <button
                class="badge-tools"
                type="button"
                onclick={() => openToolsModal(server)}
                title={$_("userIntegrations.actions.viewTools")}
              >
                {toolsLabel(server.tools.length)}
              </button>
            </div>

            <!-- ".int-btn" row -->
            <div class="int-card-actions">
              {#if connectingId === server.id}
                <span class="int-btn int-btn--connecting">
                  {@render spinner()}
                  {$_("userIntegrations.actions.connecting")}
                </span>
              {:else if server.status === "connected"}
                <button class="int-btn int-btn--ghost" type="button" onclick={() => handleConnect(server)}>
                  {$_("userIntegrations.actions.reconnect")}
                </button>
                {#if disconnectConfirmId === server.id}
                  <span class="confirm-row">
                    <span class="confirm-text">{$_("userIntegrations.actions.disconnectConfirm")}</span>
                    <button
                      class="int-btn int-btn--danger"
                      type="button"
                      onclick={() => handleDisconnect(server)}
                      disabled={disconnectingId === server.id}
                    >
                      {#if disconnectingId === server.id}
                        {@render spinner()}
                      {:else}
                        {$_("userIntegrations.actions.yes")}
                      {/if}
                    </button>
                    <button
                      class="int-btn int-btn--ghost"
                      type="button"
                      onclick={() => (disconnectConfirmId = null)}
                      disabled={disconnectingId === server.id}
                    >
                      {$_("userIntegrations.actions.no")}
                    </button>
                  </span>
                {:else}
                  <button
                    class="int-btn int-btn--danger"
                    type="button"
                    onclick={() => (disconnectConfirmId = server.id)}
                    disabled={disconnectingId === server.id}
                  >
                    {$_("userIntegrations.actions.disconnect")}
                  </button>
                {/if}
              {:else if server.status === "expired" || server.status === "error"}
                <button class="int-btn int-btn--connect" type="button" onclick={() => handleConnect(server)}>
                  {$_("userIntegrations.actions.reconnect")}
                </button>
              {:else}
                <button class="int-btn int-btn--connect" type="button" onclick={() => handleConnect(server)}>
                  {$_("userIntegrations.actions.connect")}
                </button>
              {/if}
            </div>
          </div>
        {/each}
      </div>
      <!-- ".int-table" — the mockup stacks the same list below the cards. -->
      <div class="int-table">
        <div class="int-table-scroll">
          <div class="int-thead">
            <span class="col-int-name">{$_("userIntegrations.columns.name")}</span>
            <span class="col-int-transport">{$_("userIntegrations.columns.transport")}</span>
            <span class="col-int-status">{$_("userIntegrations.columns.status")}</span>
            <span class="col-int-tools">{$_("userIntegrations.columns.tools")}</span>
            <span class="col-int-last">{$_("userIntegrations.columns.connectedAt")}</span>
            <span class="col-int-actions">{$_("userIntegrations.columns.actions")}</span>
          </div>

          {#each filteredServers as server (server.id)}
            <div class="int-row">
              <span class="int-row-name" title={server.name}>{server.name}</span>
              <span class="int-row-transport">{server.transport_type}</span>
              <span class="int-row-status int-row-status--{server.status}">
                {#if connectingId === server.id}
                  {@render spinner()}
                  {$_("userIntegrations.actions.connecting")}
                {:else}
                  {$_(`userIntegrations.status.${server.status}`)}
                {/if}
              </span>
              <span class="int-row-tools">
                <button
                  class="tools-link"
                  type="button"
                  onclick={() => openToolsModal(server)}
                  title={$_("userIntegrations.actions.viewTools")}
                >
                  {toolsLabel(server.tools.length)}
                </button>
              </span>
              <span class="int-row-last" title={server.account_email ?? undefined}>
                {server.connected_at ? formatDate(server.connected_at) : "—"}
              </span>
              <div class="int-row-action">
                {#if connectingId === server.id}
                  <span class="small-btn small-btn--connecting">
                    {@render spinner()}
                    {$_("userIntegrations.actions.connecting")}
                  </span>
                {:else if server.status === "connected"}
                  <button class="small-btn small-btn--ghost" type="button" onclick={() => handleConnect(server)}>
                    {$_("userIntegrations.actions.reconnect")}
                  </button>
                  {#if disconnectConfirmId === server.id}
                    <span class="confirm-text">{$_("userIntegrations.actions.disconnectConfirm")}</span>
                    <button
                      class="small-btn small-btn--danger"
                      type="button"
                      onclick={() => handleDisconnect(server)}
                      disabled={disconnectingId === server.id}
                    >
                      {#if disconnectingId === server.id}
                        {@render spinner()}
                      {:else}
                        {$_("userIntegrations.actions.yes")}
                      {/if}
                    </button>
                    <button
                      class="small-btn small-btn--ghost"
                      type="button"
                      onclick={() => (disconnectConfirmId = null)}
                      disabled={disconnectingId === server.id}
                    >
                      {$_("userIntegrations.actions.no")}
                    </button>
                  {:else}
                    <button
                      class="small-btn small-btn--danger"
                      type="button"
                      onclick={() => (disconnectConfirmId = server.id)}
                      disabled={disconnectingId === server.id}
                    >
                      {$_("userIntegrations.actions.disconnect")}
                    </button>
                  {/if}
                {:else if server.status === "expired" || server.status === "error"}
                  <button class="small-btn small-btn--connect" type="button" onclick={() => handleConnect(server)}>
                    {$_("userIntegrations.actions.reconnect")}
                  </button>
                {:else}
                  <button class="small-btn small-btn--connect" type="button" onclick={() => handleConnect(server)}>
                    {$_("userIntegrations.actions.connect")}
                  </button>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</div>

<Modal
  isOpen={toolsModalOpen}
  title={$_("userIntegrations.tools.modalTitle", { values: { name: toolsModalServerName } })}
  onclose={closeToolsModal}
>
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
  /* ===== user-settings.html, Integrations panel. Colours come from the --us-*
     block UserSettings.svelte declares on ".us-page"; this file only lays out.

     Like the mockup, the panel stacks ".cards-grid" over ".int-table": the
     cards carry each server's description and primary action, the table the
     same list at a glance. ===== */

  /* app.css paints every bare control as a glass pill; every control here is
     flat. Kept as bare selectors so the class rules below out-rank the reset. */
  button {
    padding: 0;
    border: 0;
    border-radius: 0;
    background: none;
    box-shadow: none;
    color: inherit;
    font: inherit;
    line-height: normal;
    text-align: start;
    white-space: nowrap;
    cursor: pointer;
    transition: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  button:hover,
  button:active {
    transform: none;
    box-shadow: none;
    background: none;
  }

  button:focus-visible,
  input:focus-visible {
    outline: 2px solid var(--us-cta);
    outline-offset: 2px;
  }

  input {
    width: 100%;
    padding: 0;
    border: 0;
    border-radius: 0;
    outline: none;
    background: transparent;
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    font-family: var(--gx-font);
    color: inherit;
    transition: none;
  }

  input:focus {
    background: transparent;
    box-shadow: none;
  }

  .integrations-panel {
    display: flex;
    flex-direction: column;
    gap: 32px;
    align-self: stretch;
    min-width: 0;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .spin {
    display: block;
    flex-shrink: 0;
    color: var(--us-accent);
    animation: spin 1s linear infinite;
  }

  /* ---------------- ".stat-strip" ---------------- */
  .stat-strip {
    border-radius: 12px;
    background: var(--us-surface);
    box-shadow:
      inset 0 0 0 1px var(--us-border),
      var(--us-card-shadow);
    display: flex;
    align-self: stretch;
    flex-wrap: wrap;
  }

  .stat-cell {
    flex: 1 1 0;
    min-width: 140px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 20px;
    border-inline-end: 1px solid var(--us-border);
  }

  .stat-cell:last-child {
    border-inline-end: 0;
  }

  .stat-label {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.5px;
    color: var(--us-muted);
    text-transform: uppercase;
  }

  .stat-value {
    font-size: 24px;
    font-weight: 800;
    line-height: 1.1;
    color: var(--us-title);
  }

  .stat-value--accent {
    color: var(--us-accent);
  }

  /* ---------------- ".toolbar" ---------------- */
  .toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    align-self: stretch;
    flex-shrink: 0;
    flex-wrap: wrap;
  }

  .search-input {
    width: 240px;
    height: 37px;
    border-radius: 8px;
    background: var(--us-surface);
    box-shadow: inset 0 0 0 1px var(--us-border);
    display: flex;
    gap: 8px;
    padding: 0 14px;
    align-items: center;
  }

  .search-input:focus-within {
    box-shadow: inset 0 0 0 1px var(--us-cta);
  }

  .search-input svg {
    display: block;
    color: var(--us-muted);
    flex-shrink: 0;
  }

  .search-input input {
    font-size: 14px;
    line-height: 1.2;
    flex-grow: 1;
    min-width: 0;
    color: var(--us-title);
  }

  .search-input input::placeholder {
    color: var(--us-muted);
    opacity: 1;
  }

  /* ---------------- ".filter-segment" ---------------- */
  .filter-segment {
    border-radius: 8px;
    background: var(--us-track);
    display: flex;
    gap: 2px;
    padding: 3px;
    flex-shrink: 0;
  }

  .seg-btn {
    border-radius: 6px;
    padding: 6px 12px;
    font-size: 13px;
    font-weight: 600;
    color: var(--us-body);
    white-space: nowrap;
    transition:
      background-color 120ms ease,
      box-shadow 120ms ease,
      color 120ms ease;
  }

  .seg-btn[aria-selected="true"] {
    background: var(--us-surface);
    box-shadow: var(--us-card-shadow);
    color: var(--us-tab-active);
  }

  /* ---------------- ".int-card" ---------------- */
  .cards-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 20px;
    align-self: stretch;
  }

  .int-card {
    /* Mockup: "flex: 1 1 0" — cards share one row at equal width. The 300px
       basis is the mockup's own card width (944px content / 3 - gaps), so >3
       servers wrap to a new row rather than shrinking to slivers. */
    flex: 1 1 300px;
    border-radius: 12px;
    background: var(--us-surface);
    box-shadow:
      inset 0 0 0 1px var(--us-border),
      var(--us-card-shadow);
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 20px;
    min-width: 0;
  }

  .int-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }

  .int-card-name {
    font-family: var(--us-mono);
    font-size: 14px;
    font-weight: 700;
    color: var(--us-title);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .int-card-desc {
    font-size: 13px;
    font-weight: 400;
    line-height: 1.4;
    color: var(--us-body);
    flex-grow: 1;
  }

  /* ---------------- ".status-tag" ---------------- */
  .status-tag {
    border-radius: 4px;
    background: var(--us-track);
    padding: 3px 8px;
    font-size: 11px;
    font-weight: 600;
    color: var(--us-body);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .status-tag--connected {
    background: var(--us-mint);
    color: var(--us-ok);
  }

  .status-tag--expired {
    background: var(--us-warn-bg);
    color: var(--us-warn);
  }

  .status-tag--error {
    background: var(--us-danger-bg);
    color: var(--us-danger);
  }

  /* ---------------- ".badges-row" ---------------- */
  .badges-row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .badge-transport,
  .badge-tools {
    border-radius: 4px;
    padding: 2px 6px;
    font-family: var(--us-mono);
    font-size: 11px;
    font-weight: 700;
  }

  .badge-transport {
    background: var(--us-tint);
    color: var(--us-accent);
  }

  .badge-tools {
    background: var(--us-track);
    color: var(--us-body);
    transition:
      background-color 120ms ease,
      color 120ms ease;
  }

  .badge-tools:hover {
    background: var(--us-tint);
    color: var(--us-accent);
  }

  /* ---------------- ".warn-note" / ".conn-note" ---------------- */
  .warn-note,
  .conn-note {
    display: flex;
    gap: 6px;
    align-items: center;
    font-size: 12px;
    line-height: 1.4;
    min-width: 0;
  }

  .warn-note {
    border-radius: 6px;
    background: var(--us-warn-bg);
    padding: 8px 10px;
    color: var(--us-warn);
  }

  .conn-note {
    color: var(--us-muted);
  }

  .warn-note svg,
  .conn-note svg {
    display: block;
    flex-shrink: 0;
  }

  .conn-note span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* ---------------- ".int-btn" ---------------- */
  /* The mockup's ".int-btn" sits directly in the card's column flex, so it
     stretches the full width and centres its label. This row keeps that when
     one button is shown, and splits the width when a state needs two. */
  .int-card-actions {
    display: flex;
    gap: 8px;
    align-items: stretch;
  }

  .int-card-actions > * {
    flex: 1 1 0;
    min-width: 0;
  }

  .int-btn {
    height: 32px;
    border-radius: 6px;
    display: inline-flex;
    gap: 8px;
    padding: 0 14px;
    justify-content: center;
    align-items: center;
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
    transition: background-color 120ms ease;
  }

  .int-btn--connect {
    background: var(--us-cta);
    color: #fff;
  }

  .int-btn--connect:hover {
    background: var(--us-cta-hover);
  }

  .int-btn--connecting,
  .int-btn--ghost {
    background: var(--us-field-bg);
    box-shadow: inset 0 0 0 1px var(--us-border);
    color: var(--us-body);
  }

  .int-btn--ghost:hover {
    background: var(--us-hover);
  }

  .int-btn--danger {
    background: var(--us-danger-bg);
    color: var(--us-danger);
  }

  .int-btn--danger:hover {
    background: var(--us-danger-bg);
    box-shadow: inset 0 0 0 1px var(--us-danger);
  }

  .int-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .confirm-row {
    display: inline-flex;
    gap: 8px;
    align-items: center;
  }

  .confirm-text {
    font-size: 12px;
    font-weight: 600;
    color: var(--us-body);
    white-space: nowrap;
  }

  /* ---------------- ".int-table" ---------------- */
  .int-table {
    border-radius: 12px;
    background: var(--us-surface);
    border: 1px solid var(--us-table-border);
    box-shadow: var(--us-card-shadow);
    align-self: stretch;
    overflow: hidden;
    min-width: 0;
  }

  .int-table-scroll {
    overflow-x: auto;
  }

  .int-thead {
    height: 39px;
    background: var(--us-field-bg);
    display: flex;
    gap: 16px;
    padding: 12px 20px;
    align-items: center;
    min-width: 940px;
  }

  .int-thead span {
    font-size: 12px;
    font-weight: 600;
    color: var(--us-body);
  }

  .col-int-name {
    width: 180px;
    flex-shrink: 0;
  }

  .col-int-transport,
  .col-int-tools {
    width: 100px;
    flex-shrink: 0;
  }

  .col-int-status {
    width: 120px;
    flex-shrink: 0;
  }

  .col-int-last {
    width: 140px;
    flex-shrink: 0;
  }

  .col-int-actions {
    flex-grow: 1;
    min-width: 180px;
    text-align: end;
  }

  .int-row {
    height: 55px;
    border-top: 1px solid var(--us-table-border);
    display: flex;
    gap: 16px;
    padding: 14px 20px;
    align-items: center;
    min-width: 940px;
  }

  .int-row-name {
    width: 180px;
    flex-shrink: 0;
    font-family: var(--us-mono);
    font-size: 13px;
    font-weight: 700;
    color: var(--us-title);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .int-row-transport {
    width: 100px;
    flex-shrink: 0;
    font-family: var(--us-mono);
    font-size: 12px;
    font-weight: 400;
    color: var(--us-body);
  }

  .int-row-status {
    width: 120px;
    flex-shrink: 0;
    display: flex;
    gap: 6px;
    align-items: center;
    font-size: 13px;
    font-weight: 500;
    color: var(--us-body);
  }

  .int-row-status--connected {
    color: var(--us-ok);
  }

  .int-row-status--expired {
    color: var(--us-warn);
  }

  .int-row-status--error {
    color: var(--us-danger);
  }

  .int-row-tools {
    width: 100px;
    flex-shrink: 0;
    font-family: var(--us-mono);
    font-size: 12px;
    font-weight: 400;
    color: var(--us-body);
  }

  .tools-link {
    font-family: var(--us-mono);
    font-size: 12px;
    font-weight: 400;
    color: var(--us-body);
    transition: color 120ms ease;
  }

  .tools-link:hover {
    color: var(--us-accent);
    text-decoration: underline;
  }

  .int-row-last {
    width: 140px;
    flex-shrink: 0;
    font-size: 12px;
    font-weight: 400;
    color: var(--us-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .int-row-action {
    flex-grow: 1;
    min-width: 180px;
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    align-items: center;
    flex-wrap: nowrap;
  }

  /* ---------------- ".small-btn" ---------------- */
  .small-btn {
    height: 27px;
    border-radius: 6px;
    display: inline-flex;
    gap: 6px;
    padding: 0 12px;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
    transition: background-color 120ms ease;
  }

  .small-btn--connect {
    background: var(--us-cta);
    color: #fff;
  }

  .small-btn--connect:hover {
    background: var(--us-cta-hover);
  }

  .small-btn--connecting,
  .small-btn--ghost {
    background: var(--us-field-bg);
    box-shadow: inset 0 0 0 1px var(--us-border);
    color: var(--us-body);
  }

  .small-btn--ghost:hover {
    background: var(--us-hover);
  }

  .small-btn--danger {
    background: var(--us-danger-bg);
    color: var(--us-danger);
  }

  .small-btn--danger:hover {
    background: var(--us-danger-bg);
    box-shadow: inset 0 0 0 1px var(--us-danger);
  }

  .small-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* ---------------- empty state ---------------- */
  .empty-state {
    border-radius: 12px;
    background: var(--us-field-bg);
    outline: 1.5px dashed var(--us-border);
    outline-offset: -1.5px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 40px 24px;
    justify-content: center;
    align-items: center;
    text-align: center;
    align-self: stretch;
  }

  .empty-icon {
    width: 40px;
    height: 40px;
    border-radius: 20px;
    background: var(--us-tint);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--us-accent);
  }

  .empty-icon svg {
    display: block;
  }

  .empty-title {
    font-size: 15px;
    font-weight: 700;
    color: var(--us-title);
  }

  .empty-desc {
    font-size: 13px;
    font-weight: 400;
    line-height: 1.4;
    color: var(--us-muted);
    max-width: 420px;
  }

  /* ---------------- tools dialog (app dialog styling) ---------------- */
  .tools-loading {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    color: var(--text-secondary);
    padding: var(--space-md) 0;
  }

  .tools-empty {
    color: var(--text-secondary);
    padding: var(--space-md) 0;
  }

  .tools-modal-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    max-height: 60vh;
    overflow-y: auto;
  }

  .tool-item {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
    padding: var(--space-sm) var(--space-md);
    background: rgba(var(--glass-tint), 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-md);
  }

  .tool-name {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .tool-desc {
    font-size: 0.8125rem;
    color: var(--text-secondary);
    line-height: 1.5;
  }

  .btn-spinner {
    display: inline-block;
    width: 0.875rem;
    height: 0.875rem;
    border: 2px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  @media (max-width: 640px) {
    .toolbar {
      align-items: stretch;
    }

    .search-input {
      width: 100%;
    }
  }
</style>
