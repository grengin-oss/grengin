<script lang="ts">
  import { onMount } from "svelte";
  import { _ } from "svelte-i18n";
  import PageHeader from "../components/PageHeader.svelte";
  import AdminTableCard from "../components/AdminTableCard.svelte";
  import AdminEmptyState from "../components/AdminEmptyState.svelte";
  import LoadingSpinner from "../components/LoadingSpinner.svelte";
  import Modal from "../components/Modal.svelte";
  import { toast } from "../../components/Toaster.svelte";
  import { ApiError } from "../../api/client.js";
  import { getLocalizedError } from "../../utils/errorLocalization.js";
  import type { MCPServer } from "../types.js";
  import {
    authorizeMcpConnection,
    createMcpServer,
    deleteMcpServer,
    getMcpServers,
    syncMcpServerTools,
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
  let showClientSecret = $state(false);
  let viewMode = $state<"grid" | "table">("table");

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
    formErrors = errors;
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit() {
    if (!validateForm() || isSubmitting) return;
    isSubmitting = true;
    try {
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
      window.location.href = response.authorization_url;
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
  });
</script>

<div class="mcp-servers-container">
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
            <th>{$_("admin.mcpServers.columns.enabled")}</th>
            <th>{$_("admin.mcpServers.columns.status")}</th>
            <th>{$_("admin.mcpServers.columns.tools")}</th>
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
              <td>{server.tool_count}</td>
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
                    class="icon-btn"
                    onclick={() => handleSyncTools(server)}
                    aria-label={$_("admin.mcpServers.syncTools")}
                    title={$_("admin.mcpServers.syncTools")}
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
                    aria-label={$_("admin.mcpServers.edit")}
                    title={$_("admin.mcpServers.edit")}
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
                    aria-label={$_("admin.mcpServers.delete")}
                    title={$_("admin.mcpServers.delete")}
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
            <span class="mcp-card-badge">{server.tool_count} {server.tool_count === 1 ? $_("admin.viewMode.tool") : $_("admin.viewMode.tools")}</span>
            <span class="mcp-card-badge">{server.enabled ? $_("admin.mcpServers.enabled") : $_("admin.mcpServers.disabled")}</span>
          </div>

          <div class="mcp-card-actions">
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
              class="icon-btn"
              onclick={() => handleSyncTools(server)}
              aria-label={$_("admin.mcpServers.syncTools")}
              title={$_("admin.mcpServers.syncTools")}
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
              aria-label={$_("admin.mcpServers.edit")}
              title={$_("admin.mcpServers.edit")}
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
              aria-label={$_("admin.mcpServers.delete")}
              title={$_("admin.mcpServers.delete")}
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

        <div class="form-group">
          <label for="mcp-client-id">{$_("admin.mcpServers.clientId")}</label>
          <input
            id="mcp-client-id"
            type="text"
            bind:value={formData.client_id}
            class:error={Boolean(formErrors.client_id)}
            placeholder={$_("admin.mcpServers.clientIdPlaceholder")}
          />
          {#if formErrors.client_id}
            <span class="error-text">{formErrors.client_id}</span>
          {/if}
        </div>

        <div class="form-group">
          <label for="mcp-client-secret"
            >{$_("admin.mcpServers.clientSecret")}</label
          >
          <div class="client-secret-input-row">
            <input
              id="mcp-client-secret"
              type={showClientSecret ? "text" : "password"}
              bind:value={formData.client_secret}
              class:error={Boolean(formErrors.client_secret)}
              placeholder={$_("admin.mcpServers.clientSecretPlaceholder")}
              autocomplete="off"
              spellcheck="false"
            />
            <button
              type="button"
              class="client-secret-visibility"
              onclick={() => (showClientSecret = !showClientSecret)}
              aria-label={showClientSecret
                ? $_("admin.mcpServers.hideSecret")
                : $_("admin.mcpServers.showSecret")}
            >
              {#if showClientSecret}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                >
                  <path
                    fill="currentColor"
                    d="M2 5.27L3.28 4 20 20.72 18.73 22l-3.08-3.08c-1.15.38-2.37.58-3.65.58-5 0-9.27-3.11-11-7.5.69-1.76 1.79-3.31 3.19-4.54zM12 9a3 3 0 0 1 3 3 3 3 0 0 1-.17 1L11 9.17A3 3 0 0 1 12 9m0-4.5c5 0 9.27 3.11 11 7.5a11.8 11.8 0 0 1-4 5.19l-1.42-1.43A9.86 9.86 0 0 0 20.82 12A9.82 9.82 0 0 0 12 6.5c-1.09 0-2.16.18-3.16.5L7.3 5.47c1.44-.62 3.03-.97 4.7-.97M3.18 12A9.82 9.82 0 0 0 12 17.5c.69 0 1.37-.07 2-.21L11.72 15A3.064 3.064 0 0 1 9 12.28L5.6 8.87c-.99.85-1.82 1.91-2.42 3.13"
                  />
                </svg>
              {:else}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                >
                  <path
                    fill="currentColor"
                    d="M12 9a3 3 0 1 1 0 6a3 3 0 0 1 0-6zm0-4.5c5 0 9.27 3.11 11 7.5-1.73 4.39-6 7.5-11 7.5S2.73 16.39 1 12c1.73-4.39 6-7.5 11-7.5zM3.18 12a9.821 9.821 0 0 0 17.64 0a9.821 9.821 0 0 0-17.64 0"
                  />
                </svg>
              {/if}
            </button>
          </div>
          {#if formErrors.client_secret}
            <span class="error-text">{formErrors.client_secret}</span>
          {/if}
        </div>

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
              : $_("admin.mcpServers.delete")}
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
    .mcp-grid {
      grid-template-columns: 1fr;
      gap: var(--space-md);
    }

    .mcp-card {
      padding: var(--space-lg);
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
  }
</style>
