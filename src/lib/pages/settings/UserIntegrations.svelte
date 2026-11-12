<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { onMount } from "svelte";
  import { _ } from "svelte-i18n";
  import { navigate } from "svelte-routing";
  import LoadingSpinner from "../../admin/components/LoadingSpinner.svelte";
  import ConnectorIcon from "../../admin/components/connectors/ConnectorIcon.svelte";
  import GridIcon from "../../components/icons/GridIcon.svelte";
  import ListIcon from "../../components/icons/ListIcon.svelte";
  import type { McpConnection } from "../../types/integrations.js";
  import {
    getMcpServers,
    getMcpConnections,
    authorizeMcpConnection,
    disconnectMcpConnection,
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
    suggested_prompts: string[];
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
  let viewMode = $state<"grid" | "list">("grid");
  let search = $state("");

  // Member-facing connector detail view (no admin APIs). Tracked by id so it
  // always reflects the latest list state after a connect/disconnect.
  let detailId = $state<string | null>(null);
  const detailServer = $derived(
    detailId ? (servers.find((s) => s.id === detailId) ?? null) : null,
  );

  function openDetail(server: MergedServer) {
    detailId = server.id;
    disconnectConfirmId = null;
  }
  function closeDetail() {
    detailId = null;
    disconnectConfirmId = null;
  }

  const filteredServers = $derived.by(() => {
    const q = search.trim().toLowerCase();
    if (!q) return servers;
    return servers.filter((s) => {
      const hay = `${s.name} ${s.description ?? ""} ${s.transport_type}`.toLowerCase();
      return hay.includes(q);
    });
  });

  const connectedCount = $derived(servers.filter((s) => s.connected).length);
  const hasConnectableServer = $derived(filteredServers.some((s) => !s.connected));

  /** ".server-count" — "6 servers · 2 connected" (admin wording, reused). */
  const countLabel = $derived(
    $_(
      servers.length === 1
        ? "admin.mcpServers.countOne"
        : "admin.mcpServers.countOther",
      { values: { total: servers.length, connected: connectedCount } },
    ),
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
          icon: s.icon ?? "",
          transport_type: s.transport_type,
          connected: status === "connected",
          status,
          connected_at: conn?.connected_at ?? null,
          expires_at: conn?.expires_at ?? null,
          account_email: conn?.account_email ?? null,
          scopes: conn?.scopes ?? [],
          tools: s.tools ?? [],
          suggested_prompts: Array.isArray(s.integration?.suggested_prompts)
            ? s.integration.suggested_prompts.filter(
                (p): p is string => typeof p === "string" && p.trim().length > 0,
              )
            : [],
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

  /** Open a new chat with the prompt prefilled; Chat.svelte auto-sends it. */
  function openPromptInChat(prompt: string) {
    navigate(`/?message=${encodeURIComponent(prompt)}`);
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

<!-- Member-facing connector detail: same design as the admin overview, minus
     every admin control (capabilities toggles, who-can-use, people, turn-off-for-
     everyone) and admin API call. Driven only by /mcp-servers + /mcp/connections. -->
{#snippet connectorDetail(server: MergedServer)}
  <div class="mc">
    <button class="mc-back" type="button" onclick={closeDetail}>
      <span class="mc-back__arrow" aria-hidden="true">&#8592;</span>
      <span>{$_("userIntegrations.detail.back")}</span>
    </button>

    <header class="mc-header">
      <div class="mc-head-main">
        {#if server.icon}
          <img class="mc-icon" src={server.icon} alt={server.name} width="44" height="44" />
        {:else}
          <span class="mc-icon mc-icon--fallback" aria-hidden="true"
            >{(server.name?.trim()?.[0] ?? "?").toUpperCase()}</span
          >
        {/if}
        <div class="mc-identity">
          <div class="mc-title-row">
            <h2 class="mc-name">{server.name}</h2>
            {#if server.icon}
              <span class="mc-verified" title={$_("userIntegrations.detail.verified")}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path
                    d="M8 1.6 9.7 3l2.2-.25.6 2.15 1.9 1.1-1 2 1 2-1.9 1.1-.6 2.15L9.7 13 8 14.4 6.3 13l-2.2.25-.6-2.15L1.6 10l1-2-1-2 1.9-1.1.6-2.15L6.3 3 8 1.6Z"
                    fill="var(--us-accent)"
                  />
                  <path
                    d="m5.6 8 1.6 1.6L10.4 6.4"
                    stroke="#fff"
                    stroke-width="1.4"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </span>
            {/if}
            <span class="status-tag status-tag--{server.status}">
              {$_(`userIntegrations.status.${server.status}`)}
            </span>
          </div>
          {#if server.description}
            <p class="mc-desc">{server.description}</p>
          {/if}
        </div>
      </div>

      <div class="mc-head-actions">
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
    </header>

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

    <div class="mc-grid">
      <!-- Left column: prompts + tools -->
      <div class="mc-col mc-col--main">
    {#if server.suggested_prompts.length}
      <section class="mc-card mc-card--prompts">
        <h3 class="mc-card__title">{$_("userIntegrations.detail.tryAsking")}</h3>
        <div class="mc-prompts">
          {#each server.suggested_prompts as prompt (prompt)}
            <button
              class="mc-prompt"
              type="button"
              onclick={() => openPromptInChat(prompt)}
              title={$_("userIntegrations.detail.openPrompt")}
            >
              <span class="mc-prompt__text">{prompt}</span>
              <span class="mc-prompt__arrow" aria-hidden="true">
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                  <path
                    d="M5.6 3.2 9.9 7.5 5.6 11.8"
                    stroke="currentColor"
                    stroke-width="1.6"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </span>
            </button>
          {/each}
        </div>
      </section>
    {/if}

    {#if server.tools.length}
      <section class="mc-card">
        <div class="mc-card__head">
          <h3 class="mc-card__title">{$_("userIntegrations.detail.toolsTitle")}</h3>
          <span class="mc-count">{server.tools.length}</span>
        </div>
        <p class="mc-card__intro">{$_("userIntegrations.detail.toolsIntro")}</p>
        <div class="mc-tools">
          {#each server.tools as tool (tool.name)}
            <span class="mc-tool" title={tool.description || tool.name}>{tool.name}</span>
          {/each}
        </div>
      </section>
    {/if}
      </div>

      <!-- Right column: Information -->
      <div class="mc-col mc-col--side">
    <section class="mc-card">
      <h3 class="mc-card__title">{$_("userIntegrations.detail.informationTitle")}</h3>
      <dl class="mc-info__grid">
        <div class="mc-info__row">
          <dt>{$_("userIntegrations.columns.transport")}</dt>
          <dd class="mc-mono">{server.transport_type}</dd>
        </div>
        <div class="mc-info__row">
          <dt>{$_("userIntegrations.columns.tools")}</dt>
          <dd>{server.tools.length}</dd>
        </div>
        <div class="mc-info__row">
          <dt>{$_("userIntegrations.columns.status")}</dt>
          <dd>{$_(`userIntegrations.status.${server.status}`)}</dd>
        </div>
        {#if server.account_email}
          <div class="mc-info__row">
            <dt>{$_("userIntegrations.detail.account")}</dt>
            <dd>{server.account_email}</dd>
          </div>
        {/if}
        {#if server.connected_at}
          <div class="mc-info__row">
            <dt>{$_("userIntegrations.columns.connectedAt")}</dt>
            <dd>{formatDate(server.connected_at)}</dd>
          </div>
        {/if}
        {#if server.expires_at}
          <div class="mc-info__row">
            <dt>{$_("userIntegrations.detail.expires")}</dt>
            <dd>{formatDate(server.expires_at)}</dd>
          </div>
        {/if}
      </dl>
      {#if server.scopes.length}
        <div class="mc-scopes">
          <span class="mc-scopes__label">{$_("userIntegrations.detail.scopes")}</span>
          <div class="mc-tools">
            {#each server.scopes as scope (scope)}
              <span class="mc-tool mc-tool--scope">{scope}</span>
            {/each}
          </div>
        </div>
      {/if}
    </section>
      </div>
    </div>
  </div>
{/snippet}

<div class="integrations-panel">
  {#if loading}
    <LoadingSpinner size="md" text={$_("userIntegrations.loading")} />
  {:else if detailServer}
    {@render connectorDetail(detailServer)}
  {:else}
    <!-- ".toolbar-row": search + count on the left, grid/list toggle right
         (same design as the admin connectors list). -->
    <div class="toolbar-row">
      <div class="toolbar-left">
        <div class="search-row">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="6" cy="6" r="4.2" stroke="currentColor" stroke-width="1.3" />
            <path d="m11.3 11.3-2-2" stroke="currentColor" stroke-width="1.3" />
          </svg>
          <input
            type="text"
            bind:value={search}
            placeholder={$_("userIntegrations.searchPlaceholder")}
            aria-label={$_("userIntegrations.searchPlaceholder")}
          />
        </div>
        <span class="server-count">{countLabel}</span>
      </div>
      <div
        class="layout-toggles"
        role="group"
        aria-label={$_("admin.mcpServers.viewModeLabel")}
      >
        <button
          class="grid-toggle"
          type="button"
          aria-pressed={viewMode === "grid"}
          onclick={() => (viewMode = "grid")}
        >
          <GridIcon />
          <span>{$_("admin.mcpServers.viewGrid")}</span>
        </button>
        <button
          class="grid-toggle"
          type="button"
          aria-pressed={viewMode === "list"}
          onclick={() => (viewMode = "list")}
        >
          <ListIcon />
          <span>{$_("admin.mcpServers.viewList")}</span>
        </button>
      </div>
    </div>

    {#if filteredServers.length === 0}
      <!-- empty state (search emptied the list) -->
      <div class="empty-state">
        <span class="empty-icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M13.828 10.172a4 4 0 0 0-5.656 0l-4 4a4 4 0 1 0 5.656 5.656l1.102-1.101" />
            <path d="M10.172 13.828a4 4 0 0 0 5.656 0l4-4a4 4 0 0 0-5.656-5.656l-1.1 1.1" />
          </svg>
        </span>
        <span class="empty-title">{$_("userIntegrations.empty.title")}</span>
        <span class="empty-desc">{$_("userIntegrations.empty.noConfigured")}</span>
        {#if search.trim()}
          <button class="int-btn int-btn--connect" type="button" onclick={() => (search = "")}>
            {$_("userIntegrations.empty.viewAll")}
          </button>
        {/if}
      </div>
    {:else if viewMode === "list"}
      <!-- ===== list view (admin ".list-card" design) ===== -->
      <div class="list-card" class:list-card--connectable={hasConnectableServer}>
        <div class="list-head">
          <span class="col-name">{$_("userIntegrations.columns.name")}</span>
          <span class="col-transport">{$_("userIntegrations.columns.transport")}</span>
          <span class="col-conn">{$_("userIntegrations.columns.status")}</span>
          <span class="col-tools">{$_("userIntegrations.columns.tools")}</span>
          <span class="col-actions">{$_("userIntegrations.columns.actions")}</span>
        </div>

        {#each filteredServers as server (server.id)}
          <div class="list-row">
            <div class="col-name">
              <ConnectorIcon src={server.icon} name={server.name} size={28} />
              <div class="col-name-text">
                <button
                  class="row-name row-name--link"
                  type="button"
                  title={server.name}
                  onclick={() => openDetail(server)}
                >
                  {server.name}
                </button>
                {#if server.description}
                  <span class="row-desc" title={server.description}>{server.description}</span>
                {/if}
              </div>
            </div>
            <div class="col-transport">
              <span class="chip">{server.transport_type}</span>
            </div>
            <div class="col-conn">
              <span class="status-dot status-dot--{server.status}"></span>
              <span class="conn-label conn-label--{server.status}">
                {$_(`userIntegrations.status.${server.status}`)}
              </span>
            </div>
            <div class="col-tools" class:col-tools--dim={server.tools.length === 0}>
              {server.tools.length}
            </div>
            <div class="col-actions">
              <button
                class="details-pill"
                type="button"
                onclick={() => openDetail(server)}
                aria-label={$_("admin.mcpServers.actions.details")}
                title={$_("admin.mcpServers.actions.details")}
              >
                <span>{$_("admin.mcpServers.actions.details")}</span>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path d="M4.5 2.5 8 6l-3.5 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </button>
              {#if !server.connected}
                <button
                  class="connect-pill"
                  type="button"
                  onclick={() => handleConnect(server)}
                  disabled={connectingId === server.id}
                >
                  {#if connectingId === server.id}
                    <span class="btn-spinner" aria-hidden="true"></span>
                  {:else}
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                      <path d="M4.5 7.5 7.5 4.5M5 3l1-1a2 2 0 0 1 3 3l-1 1M7 9l-1 1a2 2 0 0 1-3-3l1-1" stroke="currentColor" stroke-width="1" fill="none" />
                    </svg>
                  {/if}
                  <span>{$_("userIntegrations.actions.connect")}</span>
                </button>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <!-- ===== grid view (admin ".card-grid" design) ===== -->
      <div class="card-grid">
        {#each filteredServers as server (server.id)}
          <div
            class="mcp-card mcp-card--link"
            data-status={server.connected ? "connected" : "disconnected"}
            role="button"
            tabindex="0"
            aria-label={$_("admin.mcpServers.actions.details")}
            onclick={() => openDetail(server)}
            onkeydown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openDetail(server);
              }
            }}
          >
            <div class="mcp-card-body">
              <div class="mcp-card-head">
                <div class="mcp-card-head-main">
                  <ConnectorIcon src={server.icon} name={server.name} size={28} />
                  <span class="mcp-card-name" title={server.name}>{server.name}</span>
                </div>
                {#if !server.connected}
                  <button
                    class="card-plus"
                    type="button"
                    onclick={(e) => {
                      e.stopPropagation();
                      handleConnect(server);
                    }}
                    disabled={connectingId === server.id}
                    aria-label={$_("userIntegrations.actions.connect")}
                    title={$_("userIntegrations.actions.connect")}
                  >
                    {#if connectingId === server.id}
                      <span class="btn-spinner" aria-hidden="true"></span>
                    {:else}
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <path d="M8 3.3v9.4M3.3 8h9.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
                      </svg>
                    {/if}
                  </button>
                {/if}
              </div>
              <div class="mcp-status-line">
                <span class="status-dot status-dot--{server.status}"></span>
                <span class="conn-label conn-label--{server.status}">
                  {$_(`userIntegrations.status.${server.status}`)}
                </span>
              </div>
              {#if server.description}
                <p class="mcp-card-desc">{server.description}</p>
              {/if}
              {#if server.account_email}
                <div class="scope-block">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <circle cx="5" cy="5" r="2" stroke="currentColor" stroke-width="1.1" />
                    <circle cx="10" cy="8.5" r="2" stroke="currentColor" stroke-width="1.1" />
                  </svg>
                  <span title={server.account_email}>{server.account_email}</span>
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>

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

  /* ".status-tag" — the pill beside the name in the detail header. */
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

  /* ---------------- ".int-btn" — used by the detail header + empty state ---- */
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

  .btn-spinner {
    display: inline-block;
    width: 0.875rem;
    height: 0.875rem;
    border: 2px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }


  /* ================= member connector detail (".mc") ================= */
  .mc {
    display: flex;
    flex-direction: column;
    gap: 24px;
    min-width: 0;
  }

  .mc-back {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    align-self: flex-start;
    font-size: 14px;
    font-weight: 600;
    color: var(--us-accent);
    transition: opacity 120ms ease;
  }
  .mc-back:hover {
    text-decoration: underline;
  }
  .mc-back__arrow {
    font-size: 16px;
  }

  .mc-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 24px;
    flex-wrap: wrap;
  }
  .mc-head-main {
    display: flex;
    gap: 14px;
    align-items: flex-start;
    min-width: 0;
  }
  .mc-icon {
    flex: none;
    width: 44px;
    height: 44px;
    border-radius: 10px;
    object-fit: contain;
    display: block;
  }
  .mc-icon--fallback {
    display: grid;
    place-items: center;
    background: var(--us-tint);
    color: var(--us-accent);
    font-size: 20px;
    font-weight: 700;
  }
  .mc-identity {
    min-width: 0;
  }
  .mc-title-row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .mc-name {
    margin: 0;
    font-size: 22px;
    font-weight: 700;
    line-height: 28px;
    color: var(--us-title);
  }
  .mc-verified {
    display: inline-flex;
    align-items: center;
    line-height: 0;
  }
  .mc-desc {
    margin: 6px 0 0;
    max-width: 620px;
    font-size: 14px;
    line-height: 20px;
    color: var(--us-body);
  }
  .mc-head-actions {
    display: flex;
    gap: 10px;
    flex-shrink: 0;
    align-items: center;
  }

  /* Two-column body: main content left, Information on the right. */
  .mc-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 340px;
    gap: 24px;
    align-items: start;
  }
  .mc-col {
    display: flex;
    flex-direction: column;
    gap: 24px;
    min-width: 0;
  }
  @media (max-width: 860px) {
    .mc-grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .mc-card {
    border-radius: 12px;
    background: var(--us-surface);
    box-shadow:
      inset 0 0 0 1px var(--us-border),
      var(--us-card-shadow);
    padding: 22px;
  }
  .mc-card__head {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .mc-card__title {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
    line-height: 22px;
    color: var(--us-title);
  }
  .mc-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 22px;
    height: 20px;
    padding: 0 7px;
    border-radius: 10px;
    background: var(--us-track);
    color: var(--us-muted);
    font-size: 12px;
    font-weight: 600;
  }
  .mc-card__intro {
    margin: 4px 0 14px;
    font-size: 13px;
    line-height: 19px;
    color: var(--us-muted);
  }

  /* ---- "Try asking" prompt cards (member detail) ---- */
  .mc-card--prompts {
    background: linear-gradient(135deg, var(--us-tint) 0%, var(--us-mint) 100%);
    box-shadow: inset 0 0 0 1px var(--us-border);
  }
  .mc-prompts {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 14px;
  }
  .mc-prompt {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
    padding: 13px 15px;
    border-radius: 12px;
    background: var(--us-surface);
    box-shadow: inset 0 0 0 1px var(--us-border);
    font-size: 13.5px;
    font-weight: 500;
    line-height: 1.4;
    color: var(--us-title);
    text-align: start;
    white-space: normal;
    cursor: pointer;
    transition:
      transform 120ms ease,
      box-shadow 120ms ease;
  }
  .mc-prompt:hover {
    transform: translateY(-1px);
    box-shadow:
      inset 0 0 0 1px var(--us-border),
      var(--us-card-shadow);
  }
  .mc-prompt__text {
    min-width: 0;
  }
  .mc-prompt__arrow {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: var(--us-track);
    color: var(--us-muted);
    transition:
      background-color 120ms ease,
      color 120ms ease,
      transform 120ms ease;
  }
  .mc-prompt:hover .mc-prompt__arrow {
    background: var(--us-accent);
    color: #fff;
    transform: translateX(2px);
  }

  .mc-tools {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .mc-tool {
    display: inline-flex;
    align-items: center;
    height: 28px;
    padding: 0 12px;
    border-radius: 8px;
    background: var(--us-field-bg);
    box-shadow: inset 0 0 0 1px var(--us-border);
    font-family: var(--us-mono);
    font-size: 12.5px;
    color: var(--us-body);
    white-space: nowrap;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .mc-tool--scope {
    font-family: var(--us-mono);
  }

  .mc-info__grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 16px;
    margin: 18px 0 0;
  }
  .mc-info__row {
    min-width: 0;
  }
  .mc-info__row dt {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--us-muted);
  }
  .mc-info__row dd {
    margin: 6px 0 0;
    font-size: 14px;
    line-height: 20px;
    color: var(--us-title);
    word-break: break-word;
  }
  .mc-mono {
    font-family: var(--us-mono);
    font-size: 13px;
  }
  .mc-scopes {
    margin-top: 20px;
    padding-top: 18px;
    border-top: 1px solid var(--us-border);
  }
  .mc-scopes__label {
    display: block;
    margin-bottom: 10px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--us-muted);
  }

  /* ================= admin connectors list/grid design ================= */
  /* Uses the global --gx-* design tokens (same as the admin connectors page)
     plus the page's --us-* status colours, so it themes in light and dark. */

  .toolbar-row {
    min-height: 36px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    align-self: stretch;
    gap: 16px;
    flex-wrap: wrap;
  }
  .toolbar-left {
    display: flex;
    gap: 16px;
    align-items: center;
    min-width: 0;
  }
  .search-row {
    width: 320px;
    max-width: 100%;
    height: 36px;
    border-radius: 8px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-ring-soft);
    display: flex;
    gap: 8px;
    padding: 0 12px;
    align-items: center;
    flex-shrink: 1;
    color: var(--gx-an-sub);
    box-sizing: border-box;
  }
  .search-row:focus-within {
    box-shadow: inset 0 0 0 1px var(--gx-org-primary-500);
  }
  .search-row svg {
    display: block;
    flex-shrink: 0;
  }
  .search-row input {
    flex-grow: 1;
    min-width: 0;
    font-weight: 400;
    font-size: 13px;
    color: var(--gx-slate-900);
  }
  .search-row input::placeholder {
    color: var(--gx-an-sub);
    opacity: 1;
  }
  .server-count {
    font-weight: 500;
    font-size: 14px;
    line-height: 100%;
    color: var(--gx-slate-500);
    white-space: nowrap;
  }
  .layout-toggles {
    height: 31px;
    border-radius: 8px;
    background: var(--gx-ring-soft);
    display: flex;
    gap: 2px;
    padding: 2px;
    flex-shrink: 0;
    box-sizing: border-box;
  }
  .grid-toggle {
    height: 27px;
    border-radius: 6px;
    display: flex;
    gap: 6px;
    padding: 6px 12px;
    align-items: center;
    font-weight: 600;
    font-size: 12px;
    line-height: 100%;
    color: var(--gx-an-sub);
    white-space: nowrap;
    box-sizing: border-box;
    transition:
      background-color 120ms ease,
      color 120ms ease,
      box-shadow 120ms ease;
  }
  .grid-toggle[aria-pressed="true"] {
    background: var(--gx-card);
    box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.051);
    color: var(--gx-org-primary-500);
  }
  .grid-toggle:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
  }

  /* ---- list view ---- */
  .list-card {
    border-radius: 12px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-ring-soft);
    align-self: stretch;
    overflow: hidden;
  }
  .list-head {
    min-height: 37px;
    background: var(--gx-ring-soft);
    display: flex;
    padding: 12px 20px;
    align-items: center;
    gap: 12px;
  }
  .list-head span {
    font-weight: 700;
    font-size: 11px;
    letter-spacing: 0.4px;
    text-transform: uppercase;
    color: var(--gx-an-sub);
  }
  .list-row {
    min-height: 72px;
    padding: 16px 20px;
    display: flex;
    align-items: center;
    gap: 12px;
    border-top: 1px solid var(--gx-ring-soft);
  }
  .col-name {
    flex: 1 1 280px;
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .col-name-text {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .col-transport {
    width: 110px;
    flex-shrink: 0;
  }
  .col-conn {
    width: 140px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .list-head .col-conn {
    display: block;
  }
  .col-tools {
    width: 70px;
    flex-shrink: 0;
    font-weight: 700;
    font-size: 14px;
    color: var(--gx-mcp-title);
  }
  .col-tools--dim {
    font-weight: 500;
    color: var(--gx-an-sub);
  }
  .col-actions {
    flex: 0 0 90px;
    display: flex;
    gap: 6px;
    justify-content: flex-end;
    align-items: center;
  }
  .list-card--connectable .col-actions {
    flex-basis: 150px;
  }
  .list-head .col-actions {
    display: block;
    text-align: end;
  }
  .row-name {
    font-weight: 700;
    font-size: 15px;
    color: var(--gx-mcp-title);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .row-name--link {
    display: block;
    max-width: 100%;
    cursor: pointer;
    transition: color 120ms ease;
  }
  .row-name--link:hover {
    color: var(--gx-org-primary-500);
    text-decoration: underline;
  }
  .row-name--link:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
    border-radius: 4px;
  }
  .row-desc {
    font-weight: 400;
    font-size: 13px;
    color: var(--gx-an-sub);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .chip {
    border-radius: 6px;
    background: var(--gx-ring-soft);
    padding: 4px 8px;
    font-family: var(--gx-mono, ui-monospace, "SF Mono", Menlo, monospace);
    font-weight: 700;
    font-size: 11px;
    color: var(--gx-mcp-title);
    display: inline-flex;
    white-space: nowrap;
  }

  /* status dot + label (member states) */
  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .status-dot--connected {
    background: var(--us-ok, #18a957);
  }
  .status-dot--expired {
    background: var(--us-warn, #b7791f);
  }
  .status-dot--error {
    background: var(--us-danger, #c83c3c);
  }
  .status-dot--disconnected {
    background: var(--us-muted, #868c99);
  }
  .conn-label {
    font-weight: 500;
    font-size: 13px;
    white-space: nowrap;
  }
  .conn-label--connected {
    color: var(--us-ok, #18a957);
  }
  .conn-label--expired {
    color: var(--us-warn, #b7791f);
  }
  .conn-label--error {
    color: var(--us-danger, #c83c3c);
  }
  .conn-label--disconnected {
    color: var(--us-muted, #868c99);
  }

  /* details pill + connect pill (list actions) */
  .details-pill {
    height: 30px;
    border-radius: 8px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-ring-soft);
    padding: 0 10px 0 13px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-weight: 600;
    font-size: 13px;
    line-height: 1;
    color: var(--gx-org-primary-500);
    white-space: nowrap;
    flex-shrink: 0;
    cursor: pointer;
    transition:
      background-color 120ms ease,
      box-shadow 120ms ease;
  }
  .details-pill svg {
    display: block;
    flex-shrink: 0;
    opacity: 0.75;
    transition: transform 120ms ease;
  }
  .details-pill:hover:not(:disabled) {
    background: var(--gx-mcp-act-info-bg, var(--gx-ring-soft));
  }
  .details-pill:hover:not(:disabled) svg {
    transform: translateX(2px);
    opacity: 1;
  }
  .details-pill:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
  }
  .connect-pill {
    height: 28px;
    border-radius: 6px;
    background: var(--gx-ring-soft);
    display: flex;
    gap: 4px;
    padding: 6px 10px;
    align-items: center;
    font-weight: 600;
    font-size: 13px;
    line-height: 100%;
    color: var(--gx-org-primary-500);
    white-space: nowrap;
    flex-shrink: 0;
    min-width: 0;
    cursor: pointer;
    transition: background-color 120ms ease;
  }
  .connect-pill span {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .connect-pill:hover:not(:disabled) {
    background: var(--gx-mcp-icon-hover, var(--gx-ring-soft));
  }
  .connect-pill:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .connect-pill svg {
    display: block;
    flex-shrink: 0;
  }

  /* ---- grid view ---- */
  .card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 16px;
    align-self: stretch;
  }
  .mcp-card {
    min-width: 0;
    border-radius: 12px;
    background: var(--gx-card);
    box-shadow: var(--gx-mcp-card-shadow, 0 1px 2px rgba(16, 24, 40, 0.05));
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    border: 1px solid var(--gx-mcp-edge, var(--gx-ring-soft));
  }
  .mcp-card[data-status="connected"] {
    border-color: var(--gx-mcp-edge-ok, var(--us-ok, #18a957));
    border-inline-start-width: 4px;
  }
  .mcp-card-body {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
  }
  .mcp-card-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }
  .mcp-card-head-main {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .mcp-card-name {
    font-weight: 700;
    font-size: 15px;
    color: var(--gx-mcp-title);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }
  .card-plus {
    width: 28px;
    height: 28px;
    flex-shrink: 0;
    border-radius: 7px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--gx-ring-soft);
    color: var(--gx-org-primary-500);
    cursor: pointer;
    transition:
      background-color 120ms ease,
      color 120ms ease;
  }
  .card-plus:hover:not(:disabled) {
    background: var(--gx-mcp-icon-hover, var(--gx-org-primary-500));
    color: #fff;
  }
  .card-plus:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .card-plus:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
  }
  .card-plus svg {
    display: block;
  }
  .mcp-card--link {
    cursor: pointer;
    transition:
      box-shadow 120ms ease,
      border-color 120ms ease;
  }
  .mcp-card--link:hover {
    box-shadow: var(--gx-mcp-card-shadow-hover, 0 4px 16px rgba(16, 24, 40, 0.1));
    border-color: var(--gx-mcp-act-info-ring, var(--gx-org-primary-500));
  }
  .mcp-card--link:hover .mcp-card-name {
    color: var(--gx-org-primary-500);
  }
  .mcp-card--link:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
  }
  .mcp-status-line {
    display: flex;
    gap: 6px;
    align-items: center;
    min-width: 0;
  }
  .mcp-card-desc {
    margin: 0;
    font-weight: 400;
    font-size: 13px;
    line-height: 1.45;
    color: var(--gx-an-sub);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .scope-block {
    border-radius: 8px;
    background: var(--gx-an-field-bg, var(--gx-ring-soft));
    display: flex;
    gap: 8px;
    padding: 8px 10px;
    align-items: center;
    color: var(--gx-mcp-dim, var(--gx-an-sub));
    min-width: 0;
  }
  .scope-block svg {
    display: block;
    flex-shrink: 0;
  }
  .scope-block span {
    font-weight: 500;
    font-size: 11px;
    color: var(--gx-mcp-scope-fg, var(--gx-an-sub));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  @media (max-width: 640px) {
    .mc-info__grid {
      grid-template-columns: minmax(0, 1fr);
    }
    .list-head {
      display: none;
    }
    .list-row {
      flex-wrap: wrap;
    }
  }
</style>
