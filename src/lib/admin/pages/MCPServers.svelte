<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { _ } from "svelte-i18n";
  import PageHeader from "../components/PageHeader.svelte";
  import AdminTableCard from "../components/AdminTableCard.svelte";
  import AdminEmptyState from "../components/AdminEmptyState.svelte";
  import LoadingSpinner from "../components/LoadingSpinner.svelte";
  import Modal from "../components/Modal.svelte";
  import ServerAccessPanel from "../components/mcp/ServerAccessPanel.svelte";
  import ToolAccessPanel from "../components/mcp/ToolAccessPanel.svelte";
  import OAuthConfigSection from "../components/mcp/OAuthConfigSection.svelte";
  import OrgConnectionPanel from "../components/mcp/OrgConnectionPanel.svelte";
  import PerUserConnectionPanel from "../components/mcp/PerUserConnectionPanel.svelte";
  import { toast } from "../../components/Toaster.svelte";
  import { ApiError } from "../../api/client.js";
  import { getLocalizedError } from "../../utils/errorLocalization.js";
  import type { MCPServer, McpAuthType, McpAuthMode, McpOAuthProvider } from "../types.js";
  import {
    authorizeMcpConnection,
    createMcpServer,
    deleteMcpServer,
    getMcpServers,
    syncMcpServerTools,
    testMcpConnection,
    updateMcpServer,
  } from "../../api/admin/mcpServers.js";

  let servers = $state<MCPServer[]>([]);
  let isLoading = $state(false);

  let isModalOpen = $state(false);
  let isConfirmOpen = $state(false);
  let serverToDelete = $state<MCPServer | null>(null);
  let serverToEdit = $state<MCPServer | null>(null);
  let isSubmitting = $state(false);
  let isDeleting = $state(false);
  let syncingServerId = $state<string | null>(null);
  let togglingServerId = $state<string | null>(null);
  let connectingServerId = $state<string | null>(null);
  let testingServerId = $state<string | null>(null);
  let showClientSecret = $state(false);
  let pollInterval: ReturnType<typeof setInterval> | null = null;
  const POLL_INTERVAL_MS = 30_000;
  let viewMode = $state<"grid" | "table">("table");
  let selectedServer = $state<MCPServer | null>(null);
  let detailTab = $state<"access" | "tools" | "connection">("access");

  let formData = $state({
    name: "",
    description: "",
    transport_type: "http",
    url: "",
    client_id: "",
    client_secret: "",
    default_access: "",
    enabled: true,
    connection_config: "{}",
  });
  let oauthForm = $state({
    auth_type: 'none' as McpAuthType,
    auth_mode: 'per_user' as McpAuthMode,
    oauth_provider: null as McpOAuthProvider | null,
    scopes: '',
    auth_url: '',
    token_url: '',
  });
  let formErrors = $state<Record<string, string>>({});

  async function loadServers() {
    if (isLoading) return;
    isLoading = true;
    try {
      const response = await getMcpServers();
      servers = response.servers;
    } catch (err: any) {
      const errorMessage =
        err instanceof ApiError
          ? getLocalizedError(err, "description", $_)
          : err.message;
      toast.error(errorMessage || $_("admin.mcpServers.failedToLoad"));
    } finally {
      isLoading = false;
    }
  }

  function getLocalizedStatus(status: string | null) {
    if (status === "connected") {
      return $_("admin.mcpServers.status.connected");
    }
    if (status === "disconnected") {
      return $_("admin.mcpServers.status.disconnected");
    }

    return status ?? "";
  }

  function getAuthBadgeLabel(server: MCPServer): string {
    if (server.auth_type === "oauth2") {
      return server.auth_mode === "organization"
        ? $_("admin.mcpServers.authBadge.oauthOrg")
        : $_("admin.mcpServers.authBadge.oauthUser");
    }
    if (server.auth_type === "api_key") {
      return $_("admin.mcpServers.authBadge.apiKey");
    }
    return $_("admin.mcpServers.authBadge.none");
  }

  async function handleTestConnection(server: MCPServer) {
    if (testingServerId) return;
    testingServerId = server.id;
    try {
      const result = await testMcpConnection(server.id);
      if (result.success) {
        const msg = result.latency_ms != null
          ? $_("admin.mcpServers.testSuccessWithLatency", { values: { latency: result.latency_ms } })
          : $_("admin.mcpServers.testSuccess");
        toast.success(msg);
      } else {
        toast.error(result.message || $_("admin.mcpServers.testFailed"));
      }
      await loadServers();
    } catch (err: any) {
      const errorMessage =
        err instanceof ApiError
          ? getLocalizedError(err, "description", $_)
          : err.message;
      toast.error(errorMessage || $_("admin.mcpServers.testFailed"));
    } finally {
      testingServerId = null;
    }
  }

  function startPolling() {
    stopPolling();
    pollInterval = setInterval(() => {
      if (!isLoading && !selectedServer) {
        loadServers();
      }
    }, POLL_INTERVAL_MS);
  }

  function stopPolling() {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  }

  function openServerDetail(server: MCPServer) {
    selectedServer = server;
    detailTab = "access";
    stopPolling();
  }

  function closeServerDetail() {
    selectedServer = null;
    loadServers();
    startPolling();
  }

  function openCreateModal() {
    formData = {
      name: "",
      description: "",
      transport_type: "http",
      url: "",
      client_id: "",
      client_secret: "",
      default_access: "",
      enabled: true,
      connection_config: "{}",
    };
    oauthForm = {
      auth_type: 'none',
      auth_mode: 'per_user',
      oauth_provider: null,
      scopes: '',
      auth_url: '',
      token_url: '',
    };
    formErrors = {};
    serverToEdit = null;
    showClientSecret = false;
    isModalOpen = true;
  }

  function openEditModal(server: MCPServer) {
    formData = {
      name: server.name ?? "",
      description: server.description ?? "",
      transport_type: server.transport_type ?? "http",
      url: server.url ?? "",
      client_id: server.client_id ?? "",
      client_secret: server.client_secret_preview ?? "",
      default_access: server.default_access ?? "",
      enabled: server.enabled,
      connection_config: JSON.stringify(
        server.connection_config ?? {},
        null,
        2,
      ),
    };
    oauthForm = {
      auth_type: server.auth_type ?? 'none',
      auth_mode: server.auth_mode ?? 'per_user',
      oauth_provider: server.oauth_provider ?? null,
      scopes: (server.scopes ?? []).join(', '),
      auth_url: server.auth_url ?? '',
      token_url: server.token_url ?? '',
    };
    formErrors = {};
    serverToEdit = server;
    showClientSecret = false;
    isModalOpen = true;
  }

  function closeModal() {
    isModalOpen = false;
    serverToEdit = null;
  }

  function validateForm(): boolean {
    const errors: Record<string, string> = {};
    if (!formData.name.trim()) {
      errors.name = $_("admin.mcpServers.nameRequired");
    }
    if (!formData.transport_type.trim()) {
      errors.transport_type = $_("admin.mcpServers.transportRequired");
    }
    if (formData.url.trim()) {
      try {
        new URL(formData.url.trim());
      } catch {
        errors.url = $_("admin.mcpServers.urlInvalid");
      }
    }
    if (!formData.connection_config.trim()) {
      errors.connection_config = $_(
        "admin.mcpServers.connectionConfigRequired",
      );
    } else {
      try {
        JSON.parse(formData.connection_config);
      } catch {
        errors.connection_config = $_(
          "admin.mcpServers.connectionConfigInvalid",
        );
      }
    }
    if (oauthForm.auth_type === 'oauth2') {
      if (!oauthForm.oauth_provider) {
        errors.oauth_provider = $_("admin.mcpOAuth.validation.providerRequired");
      }
      if (!formData.client_id.trim()) {
        errors.client_id = $_("admin.mcpOAuth.validation.clientIdRequired");
      }
      if (!formData.client_secret.trim() && !serverToEdit?.client_secret_configured) {
        errors.client_secret = $_("admin.mcpOAuth.validation.clientSecretRequired");
      }
      if (oauthForm.oauth_provider === 'custom') {
        if (!oauthForm.auth_url.trim()) {
          errors.auth_url = $_("admin.mcpOAuth.validation.authUrlRequired");
        }
        if (!oauthForm.token_url.trim()) {
          errors.token_url = $_("admin.mcpOAuth.validation.tokenUrlRequired");
        }
      }
    }
    formErrors = errors;
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit() {
    if (!validateForm() || isSubmitting) return;
    isSubmitting = true;
    try {
      const scopesArray = oauthForm.scopes.trim()
        ? oauthForm.scopes.split(',').map(s => s.trim()).filter(Boolean)
        : null;
      const oauthPayload = oauthForm.auth_type === 'oauth2' ? {
        auth_type: oauthForm.auth_type,
        auth_mode: oauthForm.auth_mode,
        oauth_provider: oauthForm.oauth_provider,
        scopes: scopesArray,
        auth_url: oauthForm.auth_url.trim() || null,
        token_url: oauthForm.token_url.trim() || null,
      } : {
        auth_type: oauthForm.auth_type,
        auth_mode: null,
        oauth_provider: null,
        scopes: null,
        auth_url: null,
        token_url: null,
      };

      if (serverToEdit) {
        await updateMcpServer(serverToEdit.id, {
          name: formData.name.trim(),
          description: formData.description.trim(),
          transport_type: formData.transport_type.trim(),
          url: formData.url.trim(),
          client_id: formData.client_id.trim(),
          client_secret: formData.client_secret.trim(),
          default_access: formData.default_access.trim() || null,
          enabled: formData.enabled,
          connection_config: JSON.parse(formData.connection_config),
          ...oauthPayload,
        });
        toast.success($_("admin.mcpServers.updated"));
      } else {
        await createMcpServer({
          name: formData.name.trim(),
          description: formData.description.trim(),
          transport_type: formData.transport_type.trim(),
          url: formData.url.trim(),
          client_id: formData.client_id.trim(),
          client_secret: formData.client_secret.trim(),
          default_access: formData.default_access.trim() || null,
          enabled: true,
          connection_config: JSON.parse(formData.connection_config),
          ...oauthPayload,
        });
        toast.success($_("admin.mcpServers.created"));
      }
      closeModal();
      await loadServers();
    } catch (err: any) {
      const errorMessage =
        err instanceof ApiError
          ? getLocalizedError(err, "description", $_)
          : err.message;
      toast.error(
        errorMessage ||
          (serverToEdit
            ? $_("admin.mcpServers.failedToUpdate")
            : $_("admin.mcpServers.failedToCreate")),
      );
    } finally {
      isSubmitting = false;
    }
  }

  async function handleSyncTools(server: MCPServer) {
    if (syncingServerId) return;
    syncingServerId = server.id;
    try {
      await syncMcpServerTools(server.id);
      toast.success($_("admin.mcpServers.syncedTools"));
      await loadServers();
    } catch (err: any) {
      const errorMessage =
        err instanceof ApiError
          ? getLocalizedError(err, "description", $_)
          : err.message;
      toast.error(errorMessage || $_("admin.mcpServers.failedToSyncTools"));
    } finally {
      syncingServerId = null;
    }
  }

  async function toggleServerEnabled(server: MCPServer) {
    if (togglingServerId) return;
    const previousState = server.enabled;
    const nextState = !server.enabled;
    togglingServerId = server.id;
    servers = servers.map((item) =>
      item.id === server.id ? { ...item, enabled: nextState } : item,
    );
    try {
      await updateMcpServer(server.id, { enabled: nextState });
      await loadServers();
    } catch (err: any) {
      servers = servers.map((item) =>
        item.id === server.id ? { ...item, enabled: previousState } : item,
      );
      const errorMessage =
        err instanceof ApiError
          ? getLocalizedError(err, "description", $_)
          : err.message;
      toast.error(errorMessage || $_("admin.mcpServers.failedToUpdate"));
    } finally {
      togglingServerId = null;
    }
  }

  let oauthPopup: Window | null = null;
  let oauthPollTimer: ReturnType<typeof setInterval> | null = null;

  function cleanupOAuthPopup() {
    if (oauthPollTimer) {
      clearInterval(oauthPollTimer);
      oauthPollTimer = null;
    }
    oauthPopup = null;
  }

  async function handleConnect(server: MCPServer) {
    if (connectingServerId) return;
    const redirectUrl = `${window.location.origin}/mcp/oauth/callback`;
    const existingConfig = server.connection_config ?? {};
    const oauthConfig =
      (existingConfig as { oauth?: Record<string, unknown> }).oauth ?? {};
    const updatedConfig = {
      ...existingConfig,
      oauth: {
        ...oauthConfig,
        redirect_url: redirectUrl,
      },
    };

    connectingServerId = server.id;
    try {
      await updateMcpServer(server.id, { connection_config: updatedConfig });
      const response = await authorizeMcpConnection(server.id);
      if (!response?.authorization_url) {
        throw new Error($_("admin.mcpServers.connectFailed"));
      }

      const width = 600;
      const height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;

      oauthPopup = window.open(
        response.authorization_url,
        `mcp_oauth_${server.id}`,
        `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes,resizable=yes`,
      );

      if (!oauthPopup) {
        window.location.href = response.authorization_url;
        return;
      }

      oauthPollTimer = setInterval(() => {
        if (!oauthPopup || oauthPopup.closed) {
          cleanupOAuthPopup();
          connectingServerId = null;
          loadServers();
        }
      }, 500);
    } catch (err: any) {
      const errorMessage =
        err instanceof ApiError
          ? getLocalizedError(err, "description", $_)
          : err.message;
      toast.error(errorMessage || $_("admin.mcpServers.connectFailed"));
      connectingServerId = null;
    }
  }

  function promptDelete(server: MCPServer) {
    if (isDeleting) return;
    serverToDelete = server;
    isConfirmOpen = true;
  }

  function closeDeleteModal() {
    isConfirmOpen = false;
    serverToDelete = null;
  }

  async function handleDelete() {
    if (!serverToDelete || isDeleting) return;
    isDeleting = true;
    try {
      await deleteMcpServer(serverToDelete.id);
      toast.success($_("admin.mcpServers.deleted"));
      closeDeleteModal();
      await loadServers();
    } catch (err: any) {
      const errorMessage =
        err instanceof ApiError
          ? getLocalizedError(err, "description", $_)
          : err.message;
      toast.error(errorMessage || $_("admin.mcpServers.failedToDelete"));
    } finally {
      isDeleting = false;
    }
  }

  onMount(() => {
    loadServers();
    startPolling();
  });

  onDestroy(() => {
    stopPolling();
    cleanupOAuthPopup();
  });

  async function handleDeleteFromDetail() {
    if (!selectedServer || isDeleting) return;
    serverToDelete = selectedServer;
    isConfirmOpen = true;
  }
</script>

<div class="mcp-servers-container">
  {#if selectedServer}
    <!-- Server Detail View -->
    <div class="detail-view">
      <div class="detail-header">
        <button class="detail-back-btn" onclick={closeServerDetail}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          <span>{$_("admin.mcpAccess.backToServers")}</span>
        </button>
        <div class="detail-title-row">
          <div class="detail-title-group">
            <h2 class="detail-server-name">{selectedServer.name}</h2>
            <span
              class="detail-status"
              class:detail-status--connected={selectedServer.status === "connected"}
              class:detail-status--disconnected={selectedServer.status === "disconnected"}
            >
              <span class="detail-status-dot"></span>
              {getLocalizedStatus(selectedServer.status)}
            </span>
          </div>
          {#if selectedServer.description}
            <p class="detail-description">{selectedServer.description}</p>
          {/if}
        </div>
      </div>

      <div class="detail-tabs" role="tablist">
        <button
          class="detail-tab"
          class:detail-tab--active={detailTab === "access"}
          onclick={() => detailTab = "access"}
          role="tab"
          aria-selected={detailTab === "access"}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          <span>{$_("admin.mcpAccess.tabAccess")}</span>
        </button>
        <button
          class="detail-tab"
          class:detail-tab--active={detailTab === "tools"}
          onclick={() => detailTab = "tools"}
          role="tab"
          aria-selected={detailTab === "tools"}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
          </svg>
          <span>{$_("admin.mcpAccess.tabTools")}</span>
        </button>
        {#if selectedServer.auth_type === "oauth2"}
          <button
            class="detail-tab"
            class:detail-tab--active={detailTab === "connection"}
            onclick={() => detailTab = "connection"}
            role="tab"
            aria-selected={detailTab === "connection"}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M13.828 10.172a4 4 0 0 0-5.656 0l-4 4a4 4 0 1 0 5.656 5.656l1.102-1.101"/>
              <path d="M10.172 13.828a4 4 0 0 0 5.656 0l4-4a4 4 0 0 0-5.656-5.656l-1.1 1.1"/>
            </svg>
            <span>{$_("admin.mcpOAuth.tabConnection")}</span>
          </button>
        {/if}
      </div>

      <div class="detail-content">
        {#if detailTab === "access"}
          <ServerAccessPanel server={selectedServer} />
        {:else if detailTab === "tools"}
          <ToolAccessPanel server={selectedServer} />
        {:else if detailTab === "connection" && selectedServer.auth_type === "oauth2"}
          {#if selectedServer.auth_mode === "organization"}
            <OrgConnectionPanel server={selectedServer} />
          {:else}
            <PerUserConnectionPanel server={selectedServer} />
          {/if}
        {/if}
      </div>
    </div>
  {:else}
    <!-- Server List View -->
    <PageHeader
      title={$_("admin.mcpServers.title")}
      subtitle={$_("admin.mcpServers.subtitle")}
    >
      {#snippet children()}
        <button class="btn-primary" onclick={openCreateModal}>
          + {$_("admin.mcpServers.addServer")}
        </button>
      {/snippet}
    </PageHeader>

    {#if !isLoading && servers.length > 0}
      <div class="view-toggle-bar">
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
    </div>
  {/if}

  {#if isLoading}
    <LoadingSpinner text={$_("admin.mcpServers.loading")} size="lg" />
  {:else if servers.length === 0}
    <AdminTableCard>
      <AdminEmptyState
        title={$_("admin.mcpServers.emptyTitle")}
        message={$_("admin.mcpServers.emptyMessage")}
      >
        {#snippet icon()}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <rect x="3" y="4" width="18" height="16" rx="2"></rect>
            <line x1="7" y1="8" x2="17" y2="8"></line>
            <line x1="7" y1="12" x2="17" y2="12"></line>
            <line x1="7" y1="16" x2="13" y2="16"></line>
          </svg>
        {/snippet}
      </AdminEmptyState>
    </AdminTableCard>
  {:else if viewMode === "table"}
    <AdminTableCard minWidth="960px">
      <table class="admin-table mcp-servers-table">
        <thead>
          <tr>
            <th>{$_("admin.mcpServers.columns.name")}</th>
            <th>{$_("admin.mcpServers.columns.transport")}</th>
            <th class="hide-mobile">{$_("admin.mcpServers.columns.auth")}</th>
            <th>{$_("admin.mcpServers.columns.enabled")}</th>
            <th>{$_("admin.mcpServers.columns.status")}</th>
            <th class="hide-mobile">{$_("admin.mcpServers.columns.tools")}</th>
            <th>{$_("admin.mcpServers.columns.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {#each servers as server (server.id)}
            {@const oauthConfig = (
              server.connection_config as { oauth?: Record<string, unknown> }
            )?.oauth}
            {@const hasOauthConfig = Boolean(
              oauthConfig && Object.keys(oauthConfig).length,
            )}
            <tr>
              <td>
                <div class="name-cell">
                  <span class="server-name">{server.name}</span>
                  {#if server.description}
                    <span class="server-description">{server.description}</span>
                  {/if}
                </div>
              </td>
              <td>{server.transport_type}</td>
              <td class="hide-mobile">
                <span class="auth-badge">{getAuthBadgeLabel(server)}</span>
              </td>
              <td>
                <div class="toggle-switch">
                  <button
                    type="button"
                    class="status-toggle"
                    class:active={server.enabled}
                    onclick={() => toggleServerEnabled(server)}
                    aria-label={server.enabled
                      ? $_("admin.mcpServers.enabled")
                      : $_("admin.mcpServers.disabled")}
                    disabled={togglingServerId === server.id}
                  >
                    <span class="toggle-slider"></span>
                  </button>
                  <span class="toggle-label">
                    {server.enabled
                      ? $_("admin.mcpServers.enabled")
                      : $_("admin.mcpServers.disabled")}
                  </span>
                </div>
              </td>
              <td>
                <div class="status-cell">
                  <span
                    class="status-text"
                    class:connected={server.status === "connected"}
                    class:disconnected={server.status === "disconnected"}
                  >
                    {getLocalizedStatus(server.status)}
                  </span>
                </div>
              </td>
              <td class="hide-mobile">{server.tool_count}</td>
              <td>
                <div class="action-buttons">
                  {#if server.status === "disconnected" && hasOauthConfig}
                    <button
                      type="button"
                      class="mcp-oauth-button"
                      class:is-loading={connectingServerId === server.id}
                      aria-label={$_("admin.mcpServers.connect")}
                      onclick={() => handleConnect(server)}
                      disabled={connectingServerId === server.id}
                    >
                      {#if connectingServerId === server.id}
                        <span class="mcp-oauth-spinner" aria-hidden="true"
                        ></span>
                      {:else}
                        <svg
                          class="mcp-oauth-icon"
                          xmlns="http://www.w3.org/2000/svg"
                          width="24"
                          height="24"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <path
                            fill="currentColor"
                            d="M3.9 12a5 5 0 0 1 5-5h3v2h-3a3 3 0 1 0 0 6h3v2h-3a5 5 0 0 1-5-5Zm7-1h2v2h-2v-2Zm4.2-4h3a5 5 0 0 1 0 10h-3v-2h3a3 3 0 1 0 0-6h-3V7Z"
                          />
                        </svg>
                        <span>{$_("admin.mcpServers.connect")}</span>
                      {/if}
                    </button>
                  {/if}
                  <button
                    class="icon-btn icon-btn--test"
                    onclick={() => handleTestConnection(server)}
                    aria-label={$_("admin.mcpServers.testConnection")}
                    title={$_("admin.mcpServers.testConnection")}
                    disabled={testingServerId === server.id}
                  >
                    {#if testingServerId === server.id}
                      <span class="icon-spinner" aria-hidden="true"></span>
                    {:else}
                      <span class="icon-symbol icon-symbol--test" aria-hidden="true">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                          <polyline points="22 4 12 14.01 9 11.01"/>
                        </svg>
                      </span>
                    {/if}
                  </button>
                  <button
                    class="icon-btn icon-btn--access"
                    onclick={() => openServerDetail(server)}
                    aria-label={$_("admin.mcpAccess.accessControl")}
                    title={$_("admin.mcpAccess.accessControl")}
                  >
                    <span class="icon-symbol icon-symbol--access" aria-hidden="true">
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                      </svg>
                    </span>
                  </button>
                  <button
                    class="icon-btn"
                    onclick={() => handleSyncTools(server)}
                    aria-label={$_("admin.mcpServers.actions.syncTools")}
                    title={$_("admin.mcpServers.actions.syncTools")}
                    disabled={syncingServerId === server.id}
                  >
                    {#if syncingServerId === server.id}
                      <span class="icon-spinner" aria-hidden="true"></span>
                    {:else}
                      <span
                        class="icon-symbol icon-symbol--sync"
                        aria-hidden="true"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="24"
                          height="24"
                          viewBox="0 0 24 24"
                        >
                          <path
                            fill="currentColor"
                            d="M12 6V3L8 7l4 4V8c2.76 0 5 2.24 5 5a5 5 0 1 1-9.9-1h-2.02A7 7 0 1 0 19 13c0-3.87-3.13-7-7-7z"
                          />
                        </svg>
                      </span>
                    {/if}
                  </button>
                  <button
                    class="icon-btn"
                    onclick={() => openEditModal(server)}
                    aria-label={$_("admin.mcpServers.actions.edit")}
                    title={$_("admin.mcpServers.actions.edit")}
                  >
                    <span
                      class="icon-symbol icon-symbol--edit"
                      aria-hidden="true"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                      >
                        <path
                          fill="currentColor"
                          d="M20.71 7.04c.39-.39.39-1.04 0-1.41l-2.34-2.34c-.37-.39-1.02-.39-1.41 0l-1.84 1.83l3.75 3.75M3 17.25V21h3.75L17.81 9.93l-3.75-3.75z"
                        />
                      </svg>
                    </span>
                  </button>
                  <button
                    class="icon-btn icon-btn--danger"
                    onclick={() => promptDelete(server)}
                    aria-label={$_("admin.mcpServers.actions.delete")}
                    title={$_("admin.mcpServers.actions.delete")}
                  >
                    <span
                      class="icon-symbol icon-symbol--delete"
                      aria-hidden="true"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                      >
                        <path
                          fill="currentColor"
                          d="M19 4h-3.5l-1-1h-5l-1 1H5v2h14M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6z"
                        />
                      </svg>
                    </span>
                  </button>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </AdminTableCard>
  {:else}
    <!-- Grid View -->
    <div class="mcp-grid">
      {#each servers as server (server.id)}
        {@const oauthConfig = (server.connection_config as { oauth?: Record<string, unknown> })?.oauth}
        {@const hasOauthConfig = Boolean(oauthConfig && Object.keys(oauthConfig).length)}
        <div class="mcp-card" class:mcp-card--connected={server.status === "connected"}>
          <div class="mcp-card-header">
            <div class="mcp-card-title-group">
              <h3 class="mcp-card-name">{server.name}</h3>
              <span
                class="mcp-card-status"
                class:mcp-card-status--connected={server.status === "connected"}
                class:mcp-card-status--disconnected={server.status === "disconnected"}
              >
                <span class="mcp-status-dot"></span>
                {getLocalizedStatus(server.status)}
              </span>
            </div>
            <div class="toggle-switch">
              <button
                type="button"
                class="status-toggle"
                class:active={server.enabled}
                onclick={() => toggleServerEnabled(server)}
                aria-label={server.enabled ? $_("admin.mcpServers.enabled") : $_("admin.mcpServers.disabled")}
                disabled={togglingServerId === server.id}
              >
                <span class="toggle-slider"></span>
              </button>
            </div>
          </div>

          {#if server.description}
            <p class="mcp-card-desc">{server.description}</p>
          {/if}

          <div class="mcp-card-meta">
            <span class="mcp-card-badge">{server.transport_type}</span>
            <span class="mcp-card-badge">{getAuthBadgeLabel(server)}</span>
            <span class="mcp-card-badge">{server.tool_count} {server.tool_count === 1 ? $_("admin.viewMode.tool") : $_("admin.viewMode.tools")}</span>
          </div>

          <div class="mcp-card-actions">
            <button
              class="icon-btn icon-btn--test"
              onclick={() => handleTestConnection(server)}
              aria-label={$_("admin.mcpServers.testConnection")}
              title={$_("admin.mcpServers.testConnection")}
              disabled={testingServerId === server.id}
            >
              {#if testingServerId === server.id}
                <span class="icon-spinner" aria-hidden="true"></span>
              {:else}
                <span class="icon-symbol icon-symbol--test" aria-hidden="true">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                    <polyline points="22 4 12 14.01 9 11.01"/>
                  </svg>
                </span>
              {/if}
            </button>
            {#if server.status === "disconnected" && hasOauthConfig}
              <button
                type="button"
                class="mcp-oauth-button"
                class:is-loading={connectingServerId === server.id}
                onclick={() => handleConnect(server)}
                disabled={connectingServerId === server.id}
              >
                {#if connectingServerId === server.id}
                  <span class="mcp-oauth-spinner" aria-hidden="true"></span>
                {:else}
                  <svg class="mcp-oauth-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="currentColor" d="M3.9 12a5 5 0 0 1 5-5h3v2h-3a3 3 0 1 0 0 6h3v2h-3a5 5 0 0 1-5-5Zm7-1h2v2h-2v-2Zm4.2-4h3a5 5 0 0 1 0 10h-3v-2h3a3 3 0 1 0 0-6h-3V7Z" />
                  </svg>
                  <span>{$_("admin.mcpServers.connect")}</span>
                {/if}
              </button>
            {/if}
            <button
              class="icon-btn icon-btn--access"
              onclick={() => openServerDetail(server)}
              aria-label={$_("admin.mcpAccess.accessControl")}
              title={$_("admin.mcpAccess.accessControl")}
            >
              <span class="icon-symbol icon-symbol--access" aria-hidden="true">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
              </span>
            </button>
            <button
              class="icon-btn"
              onclick={() => handleSyncTools(server)}
              aria-label={$_("admin.mcpServers.actions.syncTools")}
              title={$_("admin.mcpServers.actions.syncTools")}
              disabled={syncingServerId === server.id}
            >
              {#if syncingServerId === server.id}
                <span class="icon-spinner" aria-hidden="true"></span>
              {:else}
                <span class="icon-symbol icon-symbol--sync" aria-hidden="true">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M12 6V3L8 7l4 4V8c2.76 0 5 2.24 5 5a5 5 0 1 1-9.9-1h-2.02A7 7 0 1 0 19 13c0-3.87-3.13-7-7-7z" />
                  </svg>
                </span>
              {/if}
            </button>
            <button
              class="icon-btn"
              onclick={() => openEditModal(server)}
              aria-label={$_("admin.mcpServers.actions.edit")}
              title={$_("admin.mcpServers.actions.edit")}
            >
              <span class="icon-symbol icon-symbol--edit" aria-hidden="true">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M20.71 7.04c.39-.39.39-1.04 0-1.41l-2.34-2.34c-.37-.39-1.02-.39-1.41 0l-1.84 1.83l3.75 3.75M3 17.25V21h3.75L17.81 9.93l-3.75-3.75z" />
                </svg>
              </span>
            </button>
            <button
              class="icon-btn icon-btn--danger"
              onclick={() => promptDelete(server)}
              aria-label={$_("admin.mcpServers.actions.delete")}
              title={$_("admin.mcpServers.actions.delete")}
            >
              <span class="icon-symbol icon-symbol--delete" aria-hidden="true">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M19 4h-3.5l-1-1h-5l-1 1H5v2h14M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6z" />
                </svg>
              </span>
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
  {/if}

  <Modal
    title={serverToEdit
      ? $_("admin.mcpServers.editModalTitle")
      : $_("admin.mcpServers.addModalTitle")}
    isOpen={isModalOpen}
    onclose={closeModal}
  >
    {#snippet children()}
      <form
        class="mcp-form"
        onsubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
      >
        <div class="form-group">
          <label for="mcp-name">{$_("admin.mcpServers.name")}</label>
          <input
            id="mcp-name"
            type="text"
            bind:value={formData.name}
            class:error={Boolean(formErrors.name)}
            placeholder={$_("admin.mcpServers.namePlaceholder")}
          />
          {#if formErrors.name}
            <span class="error-text">{formErrors.name}</span>
          {/if}
        </div>

        <div class="form-group">
          <label for="mcp-description"
            >{$_("admin.mcpServers.description")}</label
          >
          <textarea
            id="mcp-description"
            rows="3"
            bind:value={formData.description}
            placeholder={$_("admin.mcpServers.descriptionPlaceholder")}
          ></textarea>
        </div>

        <div class="form-group">
          <label for="mcp-transport">{$_("admin.mcpServers.transport")}</label>
          <select
            id="mcp-transport"
            bind:value={formData.transport_type}
            class:error={Boolean(formErrors.transport_type)}
          >
            <option value="http">{$_("admin.mcpServers.transportHttp")}</option>
            <option value="stdio"
              >{$_("admin.mcpServers.transportStdio")}</option
            >
          </select>
          {#if formErrors.transport_type}
            <span class="error-text">{formErrors.transport_type}</span>
          {/if}
        </div>

        <div class="form-group">
          <label for="mcp-url">{$_("admin.mcpServers.url")}</label>
          <input
            id="mcp-url"
            type="text"
            bind:value={formData.url}
            class:error={Boolean(formErrors.url)}
            placeholder={$_("admin.mcpServers.urlPlaceholder")}
          />
          {#if formErrors.url}
            <span class="error-text">{formErrors.url}</span>
          {/if}
        </div>

        <OAuthConfigSection
          authType={oauthForm.auth_type}
          authMode={oauthForm.auth_mode}
          oauthProvider={oauthForm.oauth_provider}
          clientId={formData.client_id}
          clientSecret={formData.client_secret}
          scopes={oauthForm.scopes}
          authUrl={oauthForm.auth_url}
          tokenUrl={oauthForm.token_url}
          {showClientSecret}
          errors={formErrors}
          onAuthTypeChange={(v) => oauthForm.auth_type = v}
          onAuthModeChange={(v) => oauthForm.auth_mode = v}
          onProviderChange={(v) => oauthForm.oauth_provider = v}
          onClientIdChange={(v) => formData.client_id = v}
          onClientSecretChange={(v) => formData.client_secret = v}
          onScopesChange={(v) => oauthForm.scopes = v}
          onAuthUrlChange={(v) => oauthForm.auth_url = v}
          onTokenUrlChange={(v) => oauthForm.token_url = v}
          onToggleSecret={() => showClientSecret = !showClientSecret}
        />

        <div class="form-group">
          <label for="mcp-default-access"
            >{$_("admin.mcpServers.defaultAccess")}</label
          >
          <input
            id="mcp-default-access"
            type="text"
            bind:value={formData.default_access}
            placeholder={$_("admin.mcpServers.defaultAccessPlaceholder")}
          />
        </div>

        {#if serverToEdit}
          <div class="form-group">
            <label for="mcp-enabled"
              >{$_("admin.mcpServers.enabledLabel")}</label
            >
            <div class="toggle-switch">
              <button
                id="mcp-enabled"
                type="button"
                class="status-toggle"
                class:active={formData.enabled}
                onclick={() => (formData.enabled = !formData.enabled)}
                aria-label={formData.enabled
                  ? $_("admin.mcpServers.enabled")
                  : $_("admin.mcpServers.disabled")}
              >
                <span class="toggle-slider"></span>
              </button>
              <span class="toggle-label">
                {formData.enabled
                  ? $_("admin.mcpServers.enabled")
                  : $_("admin.mcpServers.disabled")}
              </span>
            </div>
          </div>
        {/if}

        <div class="form-group">
          <label for="mcp-connection-config"
            >{$_("admin.mcpServers.connectionConfig")}</label
          >
          <textarea
            id="mcp-connection-config"
            rows="6"
            bind:value={formData.connection_config}
            class:error={Boolean(formErrors.connection_config)}
            placeholder={$_("admin.mcpServers.connectionConfigPlaceholder")}
          ></textarea>
          {#if formErrors.connection_config}
            <span class="error-text">{formErrors.connection_config}</span>
          {/if}
        </div>

        <div class="form-actions">
          <button
            type="button"
            class="btn-secondary"
            onclick={closeModal}
            disabled={isSubmitting}
          >
            {$_("common.cancel")}
          </button>
          <button type="submit" class="btn-accent" disabled={isSubmitting}>
            {#if isSubmitting}
              {serverToEdit
                ? $_("admin.mcpServers.saving")
                : $_("admin.mcpServers.creating")}
            {:else}
              {serverToEdit
                ? $_("admin.mcpServers.save")
                : $_("admin.mcpServers.create")}
            {/if}
          </button>
        </div>
      </form>
    {/snippet}
  </Modal>

  <Modal
    title={$_("admin.mcpServers.deleteTitle")}
    isOpen={isConfirmOpen}
    onclose={closeDeleteModal}
  >
    {#snippet children()}
      <div class="confirm-body">
        <p>
          {$_("admin.mcpServers.deleteConfirm", {
            values: { name: serverToDelete?.name ?? "" },
          })}
        </p>
        <div class="confirm-actions">
          <button
            class="btn-secondary"
            type="button"
            onclick={closeDeleteModal}
            disabled={isDeleting}
          >
            {$_("common.cancel")}
          </button>
          <button
            class="btn-danger"
            type="button"
            onclick={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting
              ? $_("admin.mcpServers.deleting")
              : $_("admin.mcpServers.actions.delete")}
          </button>
        </div>
      </div>
    {/snippet}
  </Modal>
</div>

<style>
  .mcp-servers-container {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
    height: 100%;
    width: 100%;
    background: var(--bg-primary);
    padding: var(--space-3xl);
    overflow-y: auto;
  }

  .name-cell {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    max-width: 200px;
  }

  .server-name {
    font-weight: 600;
    color: var(--text-primary);
  }

  .server-description {
    font-size: 0.8125rem;
    color: var(--text-secondary);
  }

  textarea {
    resize: vertical;
    max-height: 180px;
  }

  .status-cell {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    flex-wrap: wrap;
  }

  .status-text {
    font-size: 0.875rem;
    color: var(--text-secondary);
    text-transform: capitalize;
  }

  .status-text.connected {
    color: var(--brand-green);
    font-weight: 600;
  }

  .status-text.disconnected {
    color: var(--brand-red);
    font-weight: 600;
  }

  .mcp-oauth-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-sm);
    height: 36px;
    padding: 0 var(--space-md);
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    color: var(--text-primary);
    backdrop-filter: blur(var(--glass-blur));
    -webkit-backdrop-filter: blur(var(--glass-blur));
    box-shadow:
      var(--glass-highlight),
      var(--glass-edge-glow),
      0 2px 8px rgba(0, 0, 0, 0.1);
    background: rgba(var(--glass-tint), 0.06);
    white-space: nowrap;
    font-weight: 600;
    font-size: 0.875rem;
  }

  .mcp-oauth-button.is-loading {
    width: 36px;
    padding: 0;
    gap: 0;
  }

  .mcp-oauth-button:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow:
      var(--glass-highlight),
      var(--glass-edge-glow),
      0 4px 16px rgba(0, 0, 0, 0.15);
  }

  .mcp-oauth-button:active:not(:disabled) {
    transform: translateY(0);
  }

  .mcp-oauth-button:disabled {
    cursor: wait;
    opacity: 0.7;
  }

  .mcp-oauth-button:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }

  .mcp-oauth-icon {
    display: block;
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    color: var(--brand);
  }

  .mcp-oauth-spinner {
    display: inline-block;
    width: 1rem;
    height: 1rem;
    border: 3px solid rgba(224, 224, 224, 0.6);
    border-top-color: var(--brand);
    border-right-color: var(--brand);
    border-radius: 50%;
    animation: mcpOauthSpin 0.6s linear infinite;
    flex-shrink: 0;
  }

  @keyframes mcpOauthSpin {
    to {
      transform: rotate(360deg);
    }
  }

  .client-secret-input-row {
    position: relative;
  }

  .client-secret-input-row input {
    width: 100%;
    padding-right: var(--space-2xl);
  }

  .client-secret-visibility {
    background: none;
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    right: 0.4rem;
    display: inline-flex;
    height: 32px;
    width: 40px;
    padding: 0;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: var(--text-secondary);
    border-radius: var(--radius-sm);
    transition: color 0.2s ease;
  }

  .client-secret-visibility:hover {
    color: var(--text-primary);
  }

  .mcp-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-xl);
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .form-group label {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .error-text {
    font-size: 0.75rem;
    color: var(--brand-red);
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-md);
    padding-top: var(--space-lg);
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  .action-buttons {
    display: flex;
    gap: var(--space-sm);
  }

  .icon-btn {
    width: 36px;
    height: 36px;
    border-radius: var(--radius-md);
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: transparent;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
    transition: all 0.2s ease;
    padding: 0.25rem;
  }

  .icon-btn:hover {
    border-color: rgba(255, 255, 255, 0.2);
    color: var(--text-primary);
    background: rgba(var(--glass-tint), 0.05);
  }

  .icon-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .icon-spinner {
    display: inline-block;
    width: 18px;
    height: 18px;
    border: 3px solid rgba(224, 224, 224, 0.6);
    border-top-color: var(--brand);
    border-right-color: var(--brand);
    border-radius: 50%;
    animation: mcpOauthSpin 0.6s linear infinite;
  }

  .icon-symbol {
    font-size: 1.15rem;
    line-height: 0;
  }

  .icon-symbol--edit {
    color: #f37a2c;
  }

  .icon-symbol--sync {
    color: var(--brand);
  }

  .icon-symbol--delete {
    color: var(--brand-red);
  }

  .icon-symbol--test {
    color: var(--brand-green, #22c55e);
  }

  .icon-symbol--test svg {
    width: 20px;
    height: 20px;
  }

  .icon-btn--test {
    border-color: rgba(34, 197, 94, 0.2);
  }

  .icon-btn--test:hover {
    background: rgba(34, 197, 94, 0.08);
    border-color: rgba(34, 197, 94, 0.4);
  }

  .auth-badge {
    display: inline-block;
    padding: var(--space-2xs) var(--space-sm);
    font-size: 0.6875rem;
    font-weight: 500;
    color: var(--text-secondary);
    background: rgba(var(--glass-tint), 0.06);
    border-radius: var(--radius-sm);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    white-space: nowrap;
  }

  .icon-btn--danger {
    border-color: rgba(239, 68, 68, 0.3);
  }

  .icon-btn--danger:hover {
    background: rgba(239, 68, 68, 0.08);
  }

  .btn-danger {
    padding: 8px 16px;
    background: var(--brand-red);
    border: none;
    border-radius: var(--radius-sm);
    font-size: 14px;
    font-weight: 500;
    color: white;
    cursor: pointer;
    transition: background 0.2s;
  }
  
  .btn-danger:hover {
    background: color-mix(in oklab, var(--brand-red) 90%, black);
  }

  .toggle-switch {
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }

  .toggle-label {
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .status-toggle {
    position: relative;
    width: 3rem;
    height: 1.75rem;
    background: rgba(255, 255, 255, 0.1);
    border: none;
    border-radius: 1rem;
    cursor: pointer;
    transition: background 0.2s ease;
  }

  .status-toggle:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .status-toggle.active {
    background: var(--brand-green);
  }

  .toggle-slider {
    position: absolute;
    top: 0.25rem;
    left: 0.25rem;
    width: 1.25rem;
    height: 1.25rem;
    background: white;
    border-radius: 50%;
    transition: transform 0.2s ease;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .status-toggle.active .toggle-slider {
    transform: translateX(1.25rem);
  }

  .confirm-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .confirm-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-md);
  }

  /* View toggle */
  .view-toggle-bar {
    display: flex;
    justify-content: flex-end;
  }

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

  /* Grid View */
  .mcp-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    gap: var(--space-xl);
  }

  .mcp-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    padding: var(--space-xl);
    background: rgba(var(--glass-tint), 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: var(--radius-lg);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .mcp-card:hover {
    border-color: rgba(255, 255, 255, 0.12);
    background: rgba(var(--glass-tint), 0.05);
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  }

  .mcp-card--connected {
    border-color: color-mix(in oklab, var(--brand-green) 20%, transparent);
  }

  .mcp-card--connected:hover {
    border-color: color-mix(in oklab, var(--brand-green) 35%, transparent);
  }

  .mcp-card-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-md);
  }

  .mcp-card-title-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
    min-width: 0;
  }

  .mcp-card-name {
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
    letter-spacing: -0.01em;
  }

  .mcp-card-status {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    font-size: 0.75rem;
    font-weight: 500;
  }

  .mcp-card-status--connected {
    color: var(--brand-green);
  }

  .mcp-card-status--disconnected {
    color: var(--text-secondary);
  }

  .mcp-status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .mcp-card-status--connected .mcp-status-dot {
    background: var(--brand-green);
    box-shadow: 0 0 6px rgba(var(--brand-green-rgb), 0.4);
  }

  .mcp-card-status--disconnected .mcp-status-dot {
    background: var(--text-secondary);
    opacity: 0.5;
  }

  .mcp-card-desc {
    font-size: 0.8125rem;
    line-height: 1.6;
    color: var(--text-secondary);
    margin: 0;
    flex: 1;
  }

  .mcp-card-meta {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    flex-wrap: wrap;
  }

  .mcp-card-badge {
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

  .mcp-card-actions {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding-top: var(--space-sm);
    border-top: 1px solid rgba(255, 255, 255, 0.05);
    margin-top: auto;
  }

  @media (max-width: 768px) {
    .mcp-servers-container {
      padding: var(--space-lg);
    }

    .hide-mobile {
      display: none;
    }

    .action-buttons {
      flex-wrap: wrap;
    }

    .mcp-grid {
      grid-template-columns: 1fr;
      gap: var(--space-md);
    }

    .mcp-card {
      padding: var(--space-lg);
    }

    .mcp-card-actions {
      flex-wrap: wrap;
    }

    .mcp-form {
      gap: var(--space-md);
    }
  }

  @media (min-width: 1400px) {
    .mcp-grid {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  @media (prefers-color-scheme: light) {
    .mcp-card {
      background: rgba(0, 0, 0, 0.02);
      border-color: rgba(0, 0, 0, 0.08);
    }

    .mcp-card:hover {
      background: rgba(0, 0, 0, 0.03);
      border-color: rgba(0, 0, 0, 0.12);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.06);
    }

    .mcp-card--connected {
      border-color: color-mix(in oklab, var(--brand-green) 25%, transparent);
    }

    .view-toggle {
      background: rgba(0, 0, 0, 0.03);
      border-color: rgba(0, 0, 0, 0.06);
    }

    .view-toggle-btn--active {
      background: white;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
    }

    .mcp-card-actions {
      border-top-color: rgba(0, 0, 0, 0.06);
    }

    .detail-view {
      background: rgba(0, 0, 0, 0.01);
    }

    .detail-header {
      border-bottom-color: rgba(0, 0, 0, 0.08);
    }

    .detail-tabs {
      border-bottom-color: rgba(0, 0, 0, 0.08);
    }

    .detail-tab:hover:not(.detail-tab--active) {
      color: var(--text-primary);
      background: rgba(0, 0, 0, 0.03);
    }

    .detail-tab--active {
      border-bottom-color: var(--brand);
    }
  }

  /* Detail View */
  .detail-view {
    display: flex;
    flex-direction: column;
    gap: 0;
    height: 100%;
    animation: fadeSlideIn 0.25s ease;
  }

  @keyframes fadeSlideIn {
    from { opacity: 0; transform: translateX(-8px); }
    to { opacity: 1; transform: translateX(0); }
  }

  .detail-header {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    padding-bottom: var(--space-lg);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  .detail-back-btn {
    display: inline-flex;
    align-items: center;
    align-self: flex-start;
    gap: var(--space-xs);
    padding: var(--space-xs) var(--space-sm);
    margin-left: calc(-1 * var(--space-sm));
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .detail-back-btn:hover {
    color: var(--text-primary);
    background: rgba(var(--glass-tint), 0.05);
  }

  .detail-title-row {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .detail-title-group {
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }

  .detail-server-name {
    font-size: 1.375rem;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0;
    letter-spacing: -0.02em;
  }

  .detail-status {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    font-size: 0.75rem;
    font-weight: 600;
    padding: var(--space-2xs) var(--space-sm);
    border-radius: var(--radius-full, 9999px);
  }

  .detail-status--connected {
    color: var(--brand-green);
    background: rgba(var(--brand-green-rgb), 0.1);
  }

  .detail-status--disconnected {
    color: var(--text-secondary);
    background: rgba(var(--glass-tint), 0.06);
  }

  .detail-status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }

  .detail-status--connected .detail-status-dot {
    background: var(--brand-green);
    box-shadow: 0 0 6px rgba(var(--brand-green-rgb), 0.4);
  }

  .detail-status--disconnected .detail-status-dot {
    background: var(--text-secondary);
    opacity: 0.5;
  }

  .detail-description {
    font-size: 0.8125rem;
    color: var(--text-secondary);
    margin: 0;
    line-height: 1.5;
  }

  .detail-tabs {
    display: flex;
    gap: var(--space-md);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    margin-top: var(--space-lg);
  }

  .detail-tab {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-md) var(--space-lg);
    border: none;
    border-radius: var(--radius-md) var(--radius-md) 0 0;
    border-bottom: 2px solid transparent;
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    margin-bottom: -1px;
  }

  .detail-tab:hover:not(.detail-tab--active) {
    color: var(--text-primary);
    background: rgba(var(--glass-tint), 0.04);
  }

  .detail-tab--active {
    color: var(--brand);
    border-bottom-color: var(--brand);
    font-weight: 600;
  }

  .detail-content {
    padding-top: var(--space-xl);
    flex: 1;
  }

  .icon-btn--access {
    border-color: rgba(139, 92, 246, 0.2);
  }

  .icon-btn--access:hover {
    background: rgba(139, 92, 246, 0.08);
    border-color: rgba(139, 92, 246, 0.4);
  }

  .icon-symbol--access {
    color: #a78bfa;
  }

  .icon-symbol--access svg {
    width: 20px;
    height: 20px;
  }

  @media (max-width: 768px) {
    .detail-title-group {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-xs);
    }

    .detail-server-name {
      font-size: 1.125rem;
    }

    .detail-tabs {
      overflow-x: auto;
    }

    .detail-tab {
      padding: var(--space-sm) var(--space-md);
      font-size: 0.8125rem;
      white-space: nowrap;
    }
  }
</style>
