<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { _ } from "svelte-i18n";
  import PageHeader from "../components/PageHeader.svelte";
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
  import { setPageTitle } from "../../utils/pageTitle";

  $effect(() => {
    setPageTitle($_("sidebar.connectors"));
  });

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
  let viewMode = $state<"grid" | "list">("list");
  let selectedServer = $state<MCPServer | null>(null);
  let detailTab = $state<"access" | "tools" | "connection">("access");

  /** ".search-row" — filters both views by name and description. */
  let query = $state("");
  /**
   * A server whose last test failed swaps its row (or card) for the design's
   * error card, keyed by server id and carrying the message the API returned.
   * Cleared by a passing test, by Retry succeeding, or when the server goes.
   */
  let testErrors = $state<Record<string, string>>({});
  /** ".add-error-banner" — the failure from the last create/save attempt. */
  let submitError = $state<string | null>(null);
  /** "Advanced — Connection Config" disclosure in the dialog. */
  let advancedOpen = $state(false);
  /** Which ".dd" menu in the dialog is open, if any. */
  let openDropdown = $state<"transport" | "auth" | null>(null);

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

  const TRANSPORT_OPTIONS = ["http", "stdio"] as const;
  const AUTH_TYPE_OPTIONS: McpAuthType[] = ["none", "api_key", "oauth2"];
  /** The design's Allow/Deny segmented control writes these into default_access. */
  const DEFAULT_ACCESS_OPTIONS = ["allow", "deny"] as const;

  const filteredServers = $derived.by(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return servers;
    return servers.filter(
      (server) =>
        server.name.toLowerCase().includes(needle) ||
        (server.description ?? "").toLowerCase().includes(needle),
    );
  });

  const connectedCount = $derived(
    servers.filter((server) => server.status === "connected").length,
  );

  /**
   * The Connect pill shows on connectable rows only, but its slot is reserved
   * on every row of a table that has one — otherwise the wider action cell
   * would eat into the name column and knock that row's columns out of line.
   */
  const hasConnectableServer = $derived(
    filteredServers.some(
      (server) =>
        server.status === "disconnected" && hasOauthConnectionConfig(server),
    ),
  );

  /** ".server-count" — "3 servers · 2 connected". */
  const countLabel = $derived(
    $_(
      servers.length === 1
        ? "admin.mcpServers.countOne"
        : "admin.mcpServers.countOther",
      { values: { total: servers.length, connected: connectedCount } },
    ),
  );

  async function loadServers() {
    if (isLoading) return;
    isLoading = true;
    try {
      const response = await getMcpServers();
      servers = response.servers;
      // Drop stale error cards for servers that no longer exist.
      const liveIds = new Set(servers.map((server) => server.id));
      testErrors = Object.fromEntries(
        Object.entries(testErrors).filter(([id]) => liveIds.has(id)),
      );
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

  function getAuthTypeLabel(authType: McpAuthType): string {
    if (authType === "oauth2") return $_("admin.mcpOAuth.authTypes.oauth2");
    if (authType === "api_key") return $_("admin.mcpOAuth.authTypes.apiKey");
    return $_("admin.mcpOAuth.authTypes.none");
  }

  function getTransportLabel(transport: string): string {
    return transport === "stdio"
      ? $_("admin.mcpServers.transportStdio")
      : $_("admin.mcpServers.transportHttp");
  }

  /** OAuth is only offered over a URL-addressable transport, same as the API. */
  function hasOauthConnectionConfig(server: MCPServer): boolean {
    const oauth = (server.connection_config as { oauth?: Record<string, unknown> })
      ?.oauth;
    return Boolean(oauth && Object.keys(oauth).length);
  }

  function relativeTime(iso: string | null): string {
    if (!iso) return "";
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return "";
    const minutes = Math.floor((Date.now() - then) / 60_000);
    if (minutes < 1) return $_("admin.mcpServers.relative.justNow");
    if (minutes < 60)
      return $_("admin.mcpServers.relative.minutes", {
        values: { count: minutes },
      });
    const hours = Math.floor(minutes / 60);
    if (hours < 24)
      return $_("admin.mcpServers.relative.hours", { values: { count: hours } });
    return $_("admin.mcpServers.relative.days", {
      values: { count: Math.floor(hours / 24) },
    });
  }

  /** ".tested" — the small note beside a card's connection status. */
  function testedLabel(server: MCPServer): string {
    if (testingServerId === server.id) {
      return $_("admin.mcpServers.testingNow");
    }
    const when = relativeTime(server.last_connected_at);
    return when
      ? $_("admin.mcpServers.testedAgo", { values: { time: when } })
      : "";
  }

  /**
   * ".scope-block" — what the org has actually scoped on this server. The list
   * endpoint carries no per-department rollup, so this reads the fields it does
   * return rather than firing an access request per card.
   */
  function scopeText(server: MCPServer): string {
    const parts: string[] = [];
    if (
      server.auth_type === "oauth2" &&
      server.auth_mode === "per_user" &&
      server.connected_users_count != null
    ) {
      parts.push(
        $_("admin.mcpServers.scope.usersConnected", {
          values: { count: server.connected_users_count },
        }),
      );
    }
    if (server.default_access) {
      parts.push(
        $_("admin.mcpServers.scope.defaultAccess", {
          values: { value: server.default_access },
        }),
      );
    }
    const synced = relativeTime(server.last_synced_at);
    if (synced) {
      parts.push(
        $_("admin.mcpServers.scope.syncedAgo", { values: { time: synced } }),
      );
    }
    return parts.length
      ? parts.join(" · ")
      : $_("admin.mcpServers.scope.unscoped");
  }

  function clearTestError(serverId: string) {
    const { [serverId]: _removed, ...rest } = testErrors;
    testErrors = rest;
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
        clearTestError(server.id);
      } else {
        const message = result.message || $_("admin.mcpServers.testFailed");
        toast.error(message);
        testErrors = { ...testErrors, [server.id]: message };
      }
      await loadServers();
    } catch (err: any) {
      const errorMessage =
        err instanceof ApiError
          ? getLocalizedError(err, "description", $_)
          : err.message;
      const message = errorMessage || $_("admin.mcpServers.testFailed");
      toast.error(message);
      testErrors = { ...testErrors, [server.id]: message };
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
      // The design lands on Allow for a new server.
      default_access: "allow",
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
    submitError = null;
    advancedOpen = false;
    openDropdown = null;
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
    submitError = null;
    // Open the disclosure when there is a config worth seeing.
    advancedOpen = Object.keys(server.connection_config ?? {}).length > 0;
    openDropdown = null;
    serverToEdit = server;
    showClientSecret = false;
    isModalOpen = true;
  }

  function closeModal() {
    isModalOpen = false;
    serverToEdit = null;
    submitError = null;
    openDropdown = null;
  }

  function toggleDropdown(which: "transport" | "auth", event: MouseEvent) {
    event.stopPropagation();
    openDropdown = openDropdown === which ? null : which;
  }

  function selectTransport(value: string) {
    formData.transport_type = value;
    openDropdown = null;
  }

  function selectAuthType(value: McpAuthType) {
    oauthForm.auth_type = value;
    openDropdown = null;
  }

  /** "Format JSON" under the connection-config box. */
  function formatConnectionConfig() {
    try {
      formData.connection_config = JSON.stringify(
        JSON.parse(formData.connection_config || "{}"),
        null,
        2,
      );
      clearFieldError("connection_config");
    } catch {
      formErrors = {
        ...formErrors,
        connection_config: $_("admin.mcpServers.connectionConfigInvalid"),
      };
    }
  }

  /** Drop one field's error as soon as the admin edits that field. */
  function clearFieldError(field: string) {
    if (!formErrors[field]) return;
    const { [field]: _removed, ...rest } = formErrors;
    formErrors = rest;
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
    // A JSON or OAuth error can sit inside the collapsed disclosure — open it so
    // the admin can see what the dialog is complaining about.
    if (errors.connection_config) {
      advancedOpen = true;
    }
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit() {
    submitError = null;
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
      const message =
        errorMessage ||
        (serverToEdit
          ? $_("admin.mcpServers.failedToUpdate")
          : $_("admin.mcpServers.failedToCreate"));
      // The dialog stays open on failure, so the banner carries the reason and
      // the toast covers the case where the body is scrolled away from it.
      submitError = message;
      toast.error(message);
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

      // Store current URL for OAuth callback redirect
      sessionStorage.setItem('mcp_oauth_origin', 'admin');
      sessionStorage.setItem('mcp_oauth_redirect_url', window.location.pathname + window.location.search);

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
    const deletedId = serverToDelete.id;
    try {
      await deleteMcpServer(deletedId);
      toast.success($_("admin.mcpServers.deleted"));
      clearTestError(deletedId);
      // Deleting from the detail view has nothing left to show behind it.
      if (selectedServer?.id === deletedId) {
        selectedServer = null;
        startPolling();
      }
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
</script>

<!-- Any click outside a ".dd" closes its menu, matching the design's dropdowns. -->
<svelte:window onclick={() => (openDropdown = null)} />

<!-- ===== icons, transcribed from mcp-servers.html ===== -->
{#snippet testIcon()}
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
    <path d="M7 1 2 7.5h3.5L5.5 12 11 5.5H7.5z" stroke="currentColor" stroke-width="1.1" fill="none" stroke-linejoin="round" />
  </svg>
{/snippet}

{#snippet syncIcon()}
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
    <path d="M11 6.5a4.5 4.5 0 0 1-7.8 3.05M2 6.5a4.5 4.5 0 0 1 7.8-3.05" stroke="currentColor" stroke-width="1.1" fill="none" stroke-linecap="round" />
    <path d="M9.4 1.4v2.2H7.2M3.6 11.6V9.4h2.2" stroke="currentColor" stroke-width="1.1" fill="none" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
{/snippet}

{#snippet editIcon()}
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
    <path d="M8.5 1.5 11 4 4 11H1.5V8.5z" stroke="currentColor" stroke-width="1.1" fill="none" stroke-linejoin="round" />
  </svg>
{/snippet}

{#snippet scopeIcon()}
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
    <circle cx="4.5" cy="4.5" r="2" stroke="currentColor" stroke-width="1.1" />
    <circle cx="9" cy="7.5" r="2" stroke="currentColor" stroke-width="1.1" />
  </svg>
{/snippet}

{#snippet deleteIcon()}
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
    <path d="M2.5 3.5h8M5 3.5V2h3v1.5M3.5 3.5 4 11h5l.5-7.5" stroke="currentColor" stroke-width="1.1" fill="none" />
  </svg>
{/snippet}

{#snippet connectIcon()}
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path d="M4.5 7.5 7.5 4.5M5 3l1-1a2 2 0 0 1 3 3l-1 1M7 9l-1 1a2 2 0 0 1-3-3l1-1" stroke="currentColor" stroke-width="1" fill="none" />
  </svg>
{/snippet}

<!-- ".toggle-switch" — the enabled flag, live on both views. -->
{#snippet enabledToggle(server: MCPServer)}
  <button
    type="button"
    class="toggle-switch"
    class:toggle-switch--on={server.enabled}
    class:toggle-switch--off={!server.enabled}
    onclick={() => toggleServerEnabled(server)}
    disabled={togglingServerId === server.id}
    role="switch"
    aria-checked={server.enabled}
    aria-label={server.enabled
      ? $_("admin.mcpServers.enabled")
      : $_("admin.mcpServers.disabled")}
    title={server.enabled
      ? $_("admin.mcpServers.enabled")
      : $_("admin.mcpServers.disabled")}
  >
    <span class="toggle-handle"></span>
  </button>
{/snippet}

<!-- ".col-actions" / ".mcp-card-footer" — one action set, both views. -->
{#snippet serverActions(server: MCPServer)}
  {#if server.status === "disconnected" && hasOauthConnectionConfig(server)}
    <button
      class="connect-pill"
      type="button"
      onclick={() => handleConnect(server)}
      disabled={connectingServerId === server.id}
    >
      {#if connectingServerId === server.id}
        <span class="btn-spinner" aria-hidden="true"></span>
      {:else}
        {@render connectIcon()}
      {/if}
      <span>{$_("admin.mcpServers.connect")}</span>
    </button>
  {/if}
  <button
    class="icon-btn"
    type="button"
    onclick={() => handleTestConnection(server)}
    disabled={testingServerId === server.id}
    aria-label={$_("admin.mcpServers.testConnection")}
    title={$_("admin.mcpServers.testConnection")}
  >
    {#if testingServerId === server.id}
      <span class="btn-spinner" aria-hidden="true"></span>
    {:else}
      {@render testIcon()}
    {/if}
  </button>
  <button
    class="icon-btn"
    type="button"
    onclick={() => handleSyncTools(server)}
    disabled={syncingServerId === server.id}
    aria-label={$_("admin.mcpServers.actions.syncTools")}
    title={$_("admin.mcpServers.actions.syncTools")}
  >
    {#if syncingServerId === server.id}
      <span class="btn-spinner" aria-hidden="true"></span>
    {:else}
      {@render syncIcon()}
    {/if}
  </button>
  <button
    class="icon-btn"
    type="button"
    onclick={() => openEditModal(server)}
    aria-label={$_("admin.mcpServers.actions.edit")}
    title={$_("admin.mcpServers.actions.edit")}
  >
    {@render editIcon()}
  </button>
  <button
    class="icon-btn"
    type="button"
    onclick={() => openServerDetail(server)}
    aria-label={$_("admin.mcpAccess.accessControl")}
    title={$_("admin.mcpAccess.accessControl")}
  >
    {@render scopeIcon()}
  </button>
  <button
    class="icon-btn icon-btn--danger"
    type="button"
    onclick={() => promptDelete(server)}
    aria-label={$_("admin.mcpServers.actions.delete")}
    title={$_("admin.mcpServers.actions.delete")}
  >
    {@render deleteIcon()}
  </button>
{/snippet}

<!-- ".error-card" — stands in for the row/card whose last test failed. -->
{#snippet errorCard(server: MCPServer)}
  <div class="error-card">
    <div class="error-row-header">
      <div class="error-left">
        <span class="error-db-icon" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <ellipse cx="8" cy="3.3" rx="5" ry="1.8" stroke="currentColor" stroke-width="1.1" />
            <path d="M3 3.3v9.4c0 1 2.2 1.8 5 1.8s5-.8 5-1.8V3.3" stroke="currentColor" stroke-width="1.1" fill="none" />
            <path d="M3 8c0 1 2.2 1.8 5 1.8s5-.8 5-1.8" stroke="currentColor" stroke-width="1.1" fill="none" />
          </svg>
        </span>
        <div>
          <div class="error-name">{server.name}</div>
          <div class="error-failed">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <circle cx="6" cy="6" r="5" stroke="currentColor" stroke-width="1" />
              <path d="M6 3.5v3M6 8v.1" stroke="currentColor" stroke-width="1" />
            </svg>
            <span>{$_("admin.mcpServers.connectFailed")}</span>
          </div>
        </div>
      </div>
      <div class="error-actions">
        <button
          class="btn-retry"
          type="button"
          onclick={() => handleTestConnection(server)}
          disabled={testingServerId === server.id}
        >
          {testingServerId === server.id
            ? $_("admin.mcpServers.testing")
            : $_("admin.mcpServers.retry")}
        </button>
        <button
          class="icon-btn"
          type="button"
          onclick={() => openEditModal(server)}
          aria-label={$_("admin.mcpServers.actions.edit")}
          title={$_("admin.mcpServers.actions.edit")}
        >
          {@render editIcon()}
        </button>
        <button
          class="icon-btn icon-btn--danger"
          type="button"
          onclick={() => promptDelete(server)}
          aria-label={$_("admin.mcpServers.actions.delete")}
          title={$_("admin.mcpServers.actions.delete")}
        >
          {@render deleteIcon()}
        </button>
      </div>
    </div>
    <div class="error-banner-row">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <circle cx="7" cy="7" r="5.8" stroke="currentColor" stroke-width="1" />
        <path d="M7 4.5v3M7 9.4v.1" stroke="currentColor" stroke-width="1" />
      </svg>
      <span>{testErrors[server.id]}</span>
    </div>
  </div>
{/snippet}

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
    <!-- ===== Server list view ===== -->
    <PageHeader
      title={$_("admin.mcpServers.title")}
      subtitle={$_("admin.mcpServers.subtitle")}
    >
      {#snippet children()}
        <button class="cta-btn" type="button" onclick={openCreateModal}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M7 2v10M2 7h10" stroke="currentColor" stroke-width="1.6" />
          </svg>
          <span>{$_("admin.mcpServers.addServer")}</span>
        </button>
      {/snippet}
    </PageHeader>

    <!-- ".toolbar-row": search and the row count on the left, the list/grid
         choice on the right. -->
    <div class="toolbar-row">
      <div class="toolbar-left">
        <div class="search-row">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <circle cx="6" cy="6" r="4.2" stroke="currentColor" stroke-width="1.3" />
            <path d="m11.3 11.3-2-2" stroke="currentColor" stroke-width="1.3" />
          </svg>
          <input
            type="text"
            bind:value={query}
            placeholder={$_("admin.mcpServers.searchPlaceholder")}
            aria-label={$_("admin.mcpServers.searchPlaceholder")}
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
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <rect x="1.75" y="1.75" width="4.5" height="4.5" rx="1" stroke="currentColor" stroke-width="1.4" />
            <rect x="7.75" y="1.75" width="4.5" height="4.5" rx="1" stroke="currentColor" stroke-width="1.4" />
            <rect x="1.75" y="7.75" width="4.5" height="4.5" rx="1" stroke="currentColor" stroke-width="1.4" />
            <rect x="7.75" y="7.75" width="4.5" height="4.5" rx="1" stroke="currentColor" stroke-width="1.4" />
          </svg>
          <span>{$_("admin.mcpServers.viewGrid")}</span>
        </button>
        <button
          class="grid-toggle"
          type="button"
          aria-pressed={viewMode === "list"}
          onclick={() => (viewMode = "list")}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M1.75 3.5h10.5M1.75 7h10.5M1.75 10.5h10.5" stroke="currentColor" stroke-width="1.4" />
          </svg>
          <span>{$_("admin.mcpServers.viewList")}</span>
        </button>
      </div>
    </div>

    {#if isLoading && servers.length === 0}
      <!-- ".loading-state" -->
      <div class="loading-state">
        <div class="skel-card" aria-busy="true" aria-label={$_("admin.mcpServers.loading")}>
          {#each [[40, 65], [35, 55], [45, 60]] as [top, bottom] (top)}
            <div class="skel-row">
              <span class="skel-box skel-icon"></span>
              <div class="skel-lines">
                <span class="skel-box skel-line" style="width:{top}%"></span>
                <span class="skel-box skel-line" style="width:{bottom}%"></span>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {:else if servers.length === 0}
      <!-- ".empty-state" — nothing connected yet. -->
      <div class="empty-state">
        <div class="empty-card">
          <span class="empty-icon-bg" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="2.3" stroke="currentColor" stroke-width="1.4" />
              <path d="M10 5v-2M10 17v-2M5 10H3M17 10h-2M6.5 6.5 5 5M15 15l-1.5-1.5M6.5 13.5 5 15M15 5l-1.5 1.5" stroke="currentColor" stroke-width="1.4" />
            </svg>
          </span>
          <div>
            <div class="empty-title">{$_("admin.mcpServers.emptyTitle")}</div>
            <div class="empty-desc">{$_("admin.mcpServers.emptyMessage")}</div>
          </div>
          <button class="empty-add-btn" type="button" onclick={openCreateModal}>
            + {$_("admin.mcpServers.addServer")}
          </button>
        </div>
      </div>
    {:else if filteredServers.length === 0}
      <!-- Same card, but the search is what emptied it. -->
      <div class="empty-state">
        <div class="empty-card">
          <span class="empty-icon-bg" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" stroke-width="1.4" />
              <path d="m16.5 16.5-3.6-3.6" stroke="currentColor" stroke-width="1.4" />
            </svg>
          </span>
          <div>
            <div class="empty-title">{$_("admin.mcpServers.noResultsTitle")}</div>
            <div class="empty-desc">{$_("admin.mcpServers.noResultsMessage")}</div>
          </div>
          <button class="empty-add-btn" type="button" onclick={() => (query = "")}>
            {$_("admin.mcpServers.clearSearch")}
          </button>
        </div>
      </div>
    {:else if viewMode === "list"}
      <!-- ===== ".list-card" ===== -->
      <div class="list-card" class:list-card--connectable={hasConnectableServer}>
        <div class="list-head">
          <span class="col-name">{$_("admin.mcpServers.columns.name")}</span>
          <span class="col-transport">{$_("admin.mcpServers.columns.transport")}</span>
          <span class="col-auth">{$_("admin.mcpServers.columns.auth")}</span>
          <span class="col-status">{$_("admin.mcpServers.columns.enabled")}</span>
          <span class="col-conn">{$_("admin.mcpServers.columns.status")}</span>
          <span class="col-tools">{$_("admin.mcpServers.columns.tools")}</span>
          <span class="col-actions">{$_("admin.mcpServers.columns.actions")}</span>
        </div>

        {#each filteredServers as server (server.id)}
          {#if testErrors[server.id]}
            <div class="list-row list-row--error">
              {@render errorCard(server)}
            </div>
          {:else}
            <div class="list-row">
              <div class="col-name">
                <span class="row-name">{server.name}</span>
                {#if server.description}
                  <span class="row-desc" title={server.description}>{server.description}</span>
                {/if}
              </div>
              <div class="col-transport">
                <span class="chip">{server.transport_type}</span>
              </div>
              <div class="col-auth">
                <span class="chip">{getAuthBadgeLabel(server)}</span>
              </div>
              <div class="col-status">
                {@render enabledToggle(server)}
              </div>
              <div class="col-conn">
                <span
                  class="status-dot"
                  class:status-dot--on={server.status === "connected"}
                  class:status-dot--off={server.status !== "connected"}
                ></span>
                <span
                  class="conn-label"
                  class:conn-label--on={server.status === "connected"}
                  class:conn-label--off={server.status !== "connected"}
                >
                  {getLocalizedStatus(server.status)}
                </span>
              </div>
              <div class="col-tools" class:col-tools--dim={server.tool_count === 0}>
                {server.tool_count}
              </div>
              <div class="col-actions">
                {@render serverActions(server)}
              </div>
            </div>
          {/if}
        {/each}
      </div>
    {:else}
      <!-- ===== ".card-grid" ===== -->
      <div class="card-grid">
        {#each filteredServers as server (server.id)}
          {#if testErrors[server.id]}
            {@render errorCard(server)}
          {:else}
            <div
              class="mcp-card"
              data-status={server.status === "connected" ? "connected" : "disconnected"}
            >
              <div class="mcp-card-body">
                <div class="mcp-card-head">
                  <span class="mcp-card-name" title={server.name}>{server.name}</span>
                  {@render enabledToggle(server)}
                </div>
                <div class="mcp-status-line">
                  <span
                    class="status-dot"
                    class:status-dot--on={server.status === "connected"}
                    class:status-dot--off={server.status !== "connected"}
                  ></span>
                  <span
                    class="conn-label"
                    class:conn-label--on={server.status === "connected"}
                    class:conn-label--off={server.status !== "connected"}
                  >
                    {getLocalizedStatus(server.status)}
                  </span>
                  {#if testedLabel(server)}
                    <span class="tested">{testedLabel(server)}</span>
                  {/if}
                </div>
                {#if server.description}
                  <p class="mcp-card-desc">{server.description}</p>
                {/if}
                <div class="scope-block">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <circle cx="5" cy="5" r="2" stroke="currentColor" stroke-width="1.1" />
                    <circle cx="10" cy="8.5" r="2" stroke="currentColor" stroke-width="1.1" />
                  </svg>
                  <span title={scopeText(server)}>{scopeText(server)}</span>
                </div>
                <div class="chip-row">
                  <span class="chip">{server.transport_type}</span>
                  <span class="chip">{getAuthBadgeLabel(server)}</span>
                  <span class="chip">
                    {server.tool_count}
                    {server.tool_count === 1
                      ? $_("admin.viewMode.tool")
                      : $_("admin.viewMode.tools")}
                  </span>
                </div>
              </div>
              <div class="mcp-card-footer">
                {@render serverActions(server)}
              </div>
            </div>
          {/if}
        {/each}
      </div>
    {/if}
  {/if}

  <!-- ===== "Add MCP Server" / "Edit MCP Server" ===== -->
  <Modal
    variant="mcp-servers"
    title={serverToEdit
      ? $_("admin.mcpServers.editModalTitle")
      : $_("admin.mcpServers.addModalTitle")}
    subtitle={serverToEdit
      ? $_("admin.mcpServers.editModalSubtitle")
      : $_("admin.mcpServers.addModalSubtitle")}
    isOpen={isModalOpen}
    onclose={closeModal}
  >
    {#snippet headerIcon()}
      <span class="add-header-icon" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M6 6 3 9l3 3M12 6l3 3-3 3M10.5 4 7.5 14" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </span>
    {/snippet}

    {#snippet children()}
      <form
        id="mcp-server-form"
        class="mcp-form"
        onsubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
      >
        <!-- ".add-section" — Basic Info -->
        <div class="add-section">
          <div class="add-section-header">
            <span class="add-section-icon" aria-hidden="true">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <circle cx="6" cy="6" r="5" stroke="currentColor" stroke-width="1" />
                <path d="M6 5.3v3.4M6 3.6v.1" stroke="currentColor" stroke-width="1" />
              </svg>
            </span>
            <span class="add-section-title">{$_("admin.mcpServers.sectionBasic")}</span>
          </div>
          <div class="add-field">
            <label class="add-label" for="mcp-name">{$_("admin.mcpServers.name")}</label>
            <input
              id="mcp-name"
              class="add-input"
              class:add-input--error={Boolean(formErrors.name)}
              type="text"
              bind:value={formData.name}
              oninput={() => clearFieldError("name")}
              placeholder={$_("admin.mcpServers.namePlaceholder")}
            />
            {#if formErrors.name}
              <span class="error-text">{formErrors.name}</span>
            {/if}
          </div>
          <div class="add-field">
            <label class="add-label" for="mcp-description">
              {$_("admin.mcpServers.description")}
              <span class="optional">{$_("admin.mcpServers.optional")}</span>
            </label>
            <textarea
              id="mcp-description"
              class="add-textarea"
              bind:value={formData.description}
              placeholder={$_("admin.mcpServers.descriptionPlaceholder")}
            ></textarea>
          </div>
        </div>

        <!-- ".add-section" — Connection -->
        <div class="add-section">
          <div class="add-section-header">
            <span class="add-section-icon" aria-hidden="true">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <circle cx="2" cy="2" r="1.3" stroke="currentColor" stroke-width="0.9" />
                <circle cx="10" cy="2" r="1.3" stroke="currentColor" stroke-width="0.9" />
                <circle cx="6" cy="10" r="1.3" stroke="currentColor" stroke-width="0.9" />
                <path d="M3.2 2.6 5 9M8.8 2.6 7 9" stroke="currentColor" stroke-width="0.9" />
              </svg>
            </span>
            <span class="add-section-title">{$_("admin.mcpServers.sectionConnection")}</span>
          </div>
          <div class="add-field-row">
            <!-- ".dd" — Transport -->
            <div class="add-field dd" data-open={openDropdown === "transport"}>
              <span class="add-label" id="mcp-transport-label">{$_("admin.mcpServers.transport")}</span>
              <button
                class="dd-trigger"
                type="button"
                onclick={(e) => toggleDropdown("transport", e)}
                aria-haspopup="listbox"
                aria-expanded={openDropdown === "transport"}
                aria-labelledby="mcp-transport-label"
              >
                <span>{getTransportLabel(formData.transport_type)}</span>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path d="m3 4.5 3 3 3-3" stroke="currentColor" stroke-width="1.2" fill="none" />
                </svg>
              </button>
              <div class="dd-menu" role="listbox" aria-labelledby="mcp-transport-label">
                {#each TRANSPORT_OPTIONS as option (option)}
                  <button
                    class="dd-item"
                    type="button"
                    role="option"
                    aria-selected={formData.transport_type === option}
                    data-active={formData.transport_type === option}
                    onclick={() => selectTransport(option)}
                  >
                    <span>{getTransportLabel(option)}</span>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                      <path d="m2 6 3 3 5-6" stroke="currentColor" stroke-width="1.3" fill="none" />
                    </svg>
                  </button>
                {/each}
              </div>
              {#if formErrors.transport_type}
                <span class="error-text">{formErrors.transport_type}</span>
              {/if}
            </div>

            <!-- ".dd" — Auth Type -->
            <div class="add-field dd" data-open={openDropdown === "auth"}>
              <span class="add-label" id="mcp-auth-label">{$_("admin.mcpOAuth.authType")}</span>
              <button
                class="dd-trigger"
                type="button"
                onclick={(e) => toggleDropdown("auth", e)}
                aria-haspopup="listbox"
                aria-expanded={openDropdown === "auth"}
                aria-labelledby="mcp-auth-label"
              >
                <span>{getAuthTypeLabel(oauthForm.auth_type)}</span>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path d="m3 4.5 3 3 3-3" stroke="currentColor" stroke-width="1.2" fill="none" />
                </svg>
              </button>
              <div class="dd-menu" role="listbox" aria-labelledby="mcp-auth-label">
                {#each AUTH_TYPE_OPTIONS as option (option)}
                  <button
                    class="dd-item"
                    type="button"
                    role="option"
                    aria-selected={oauthForm.auth_type === option}
                    data-active={oauthForm.auth_type === option}
                    onclick={() => selectAuthType(option)}
                  >
                    <span>{getAuthTypeLabel(option)}</span>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                      <path d="m2 6 3 3 5-6" stroke="currentColor" stroke-width="1.3" fill="none" />
                    </svg>
                  </button>
                {/each}
              </div>
            </div>
          </div>

          <div class="add-field">
            <label class="add-label" for="mcp-url">{$_("admin.mcpServers.url")}</label>
            <input
              id="mcp-url"
              class="add-input add-input--mono"
              class:add-input--error={Boolean(formErrors.url)}
              type="text"
              bind:value={formData.url}
              oninput={() => clearFieldError("url")}
              placeholder={$_("admin.mcpServers.urlPlaceholder")}
            />
            {#if formErrors.url}
              <span class="error-text">{formErrors.url}</span>
            {/if}
          </div>

          <!-- OAuth detail hangs off the Auth Type choice above. -->
          {#if oauthForm.auth_type === "oauth2"}
            <OAuthConfigSection
              hideAuthType
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
              onProviderChange={(v) => {
                oauthForm.oauth_provider = v;
                clearFieldError("oauth_provider");
              }}
              onClientIdChange={(v) => {
                formData.client_id = v;
                clearFieldError("client_id");
              }}
              onClientSecretChange={(v) => {
                formData.client_secret = v;
                clearFieldError("client_secret");
              }}
              onScopesChange={(v) => oauthForm.scopes = v}
              onAuthUrlChange={(v) => {
                oauthForm.auth_url = v;
                clearFieldError("auth_url");
              }}
              onTokenUrlChange={(v) => {
                oauthForm.token_url = v;
                clearFieldError("token_url");
              }}
              onToggleSecret={() => showClientSecret = !showClientSecret}
            />
          {/if}
        </div>

        <!-- ".add-section" — Access -->
        <div class="add-section">
          <div class="add-section-header">
            <span class="add-section-icon" aria-hidden="true">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 1 2 3v3.3c0 3.4 2 5.4 4 6.7 2-1.3 4-3.3 4-6.7V3z" stroke="currentColor" stroke-width="1" fill="none" stroke-linejoin="round" />
              </svg>
            </span>
            <span class="add-section-title">{$_("admin.mcpServers.sectionAccess")}</span>
          </div>
          <div class="add-field">
            <span class="add-label" id="mcp-access-label">{$_("admin.mcpServers.defaultAccess")}</span>
            <div class="seg-control" role="group" aria-labelledby="mcp-access-label">
              {#each DEFAULT_ACCESS_OPTIONS as option (option)}
                <button
                  class="seg-opt"
                  type="button"
                  data-kind={option}
                  data-active={formData.default_access === option}
                  aria-pressed={formData.default_access === option}
                  onclick={() => (formData.default_access = option)}
                >
                  {#if option === "allow"}
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                      <path d="m1.5 7 4 4 7-8" stroke="currentColor" stroke-width="1.3" fill="none" />
                    </svg>
                  {:else}
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                      <circle cx="7" cy="7" r="5.8" stroke="currentColor" stroke-width="1" />
                      <path d="m4.5 4.5 5 5" stroke="currentColor" stroke-width="1" />
                    </svg>
                  {/if}
                  <span>{$_("admin.mcpServers.access." + option)}</span>
                </button>
              {/each}
            </div>
            <span class="seg-help">{$_("admin.mcpServers.defaultAccessHelp")}</span>
          </div>
        </div>

        <!-- ".add-section" — Advanced disclosure -->
        <div class="add-section" data-open={advancedOpen}>
          <button
            class="adv-toggle"
            type="button"
            onclick={() => (advancedOpen = !advancedOpen)}
            aria-expanded={advancedOpen}
            aria-controls="mcp-connection-config"
          >
            <span class="adv-toggle-left">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M2 4h9M2 8h6M2 12h9" stroke="currentColor" stroke-width="1.2" />
                <path d="m13 7 1.5 1-1.5 1" stroke="currentColor" stroke-width="1.2" fill="none" />
              </svg>
              <span>{$_("admin.mcpServers.advancedConnectionConfig")}</span>
            </span>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="m5.5 3 4 4-4 4" stroke="currentColor" stroke-width="1.2" fill="none" />
            </svg>
          </button>
          <div class="adv-body">
            <textarea
              id="mcp-connection-config"
              class="json-box"
              class:json-box--error={Boolean(formErrors.connection_config)}
              rows="6"
              spellcheck="false"
              bind:value={formData.connection_config}
              oninput={() => clearFieldError("connection_config")}
              placeholder={$_("admin.mcpServers.connectionConfigPlaceholder")}
              aria-label={$_("admin.mcpServers.connectionConfig")}
            ></textarea>
            {#if formErrors.connection_config}
              <span class="error-text">{formErrors.connection_config}</span>
            {/if}
            <button class="format-link" type="button" onclick={formatConnectionConfig}>
              {$_("admin.mcpServers.formatJson")}
            </button>
          </div>
        </div>
      </form>
    {/snippet}

    {#snippet footer()}
      {#if submitError}
        <div class="add-error-banner" role="alert">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <circle cx="10" cy="10" r="8.3" stroke="currentColor" stroke-width="1.3" />
            <path d="M10 6v4.5M10 14v.1" stroke="currentColor" stroke-width="1.3" />
          </svg>
          <span>{submitError}</span>
        </div>
      {/if}
      <div class="add-footer">
        <div class="add-footer-actions">
          <button
            class="btn-add-cancel"
            type="button"
            onclick={closeModal}
            disabled={isSubmitting}
          >
            {$_("common.cancel")}
          </button>
          <button
            class="btn-add-create"
            type="submit"
            form="mcp-server-form"
            disabled={isSubmitting}
          >
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
      </div>
    {/snippet}
  </Modal>

  <!-- ===== Delete confirmation ===== -->
  <Modal
    variant="mcp-servers"
    title={$_("admin.mcpServers.deleteTitle")}
    subtitle={$_("admin.mcpServers.deleteSubtitle")}
    isOpen={isConfirmOpen}
    onclose={closeDeleteModal}
  >
    {#snippet headerIcon()}
      <span class="add-header-icon add-header-icon--danger" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M3.5 5h11M6.5 5V2.8h5V5M4.8 5l.7 10.2h7l.7-10.2" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linejoin="round" />
        </svg>
      </span>
    {/snippet}

    {#snippet children()}
      <div class="confirm-body">
        <p>
          {$_("admin.mcpServers.deleteConfirm", {
            values: { name: serverToDelete?.name ?? "" },
          })}
        </p>
      </div>
    {/snippet}

    {#snippet footer()}
      <div class="add-footer">
        <div class="add-footer-actions">
          <button
            class="btn-add-cancel"
            type="button"
            onclick={closeDeleteModal}
            disabled={isDeleting}
          >
            {$_("common.cancel")}
          </button>
          <button
            class="btn-add-create btn-add-create--danger"
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
  /* ===== mcp-servers.html, transcribed. Design values that no --gx-* token
     already carried live in app.css as --gx-mcp-*. ===== */

  /* app.css paints every bare <button>/<input>/<textarea> as a glass pill —
     padding, a fill, a radius, an inset shadow, a lift on hover. Every control
     below is flat, so strip that once here and let each rule paint its own
     skin. */
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
  }

  button:hover {
    transform: none;
    box-shadow: none;
    background: none;
  }

  button:active {
    transform: none;
    box-shadow: none;
  }

  button:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  input,
  textarea {
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
    line-height: 100%;
  }

  input:focus,
  textarea:focus {
    background: transparent;
    box-shadow: none;
  }

  /* ".main" */
  .mcp-servers-container {
    display: flex;
    flex-direction: column;
    gap: 28px;
    height: 100%;
    width: 100%;
    background: var(--gx-page);
    padding: 32px;
    overflow-y: auto;
    font-family: var(--gx-font);
  }

  /* The design spaces the header from the toolbar with the column gap alone. */
  .mcp-servers-container :global(.page-header) {
    padding-bottom: 0;
  }

  /* ".cta-btn" — the design's 37px primary action in the page header. */
  .cta-btn {
    height: 37px;
    border-radius: 8px;
    background: var(--gx-org-primary-500);
    display: flex;
    gap: 8px;
    padding: 10px 16px;
    align-items: center;
    flex-shrink: 0;
    font-weight: 600;
    font-size: 14px;
    line-height: 100%;
    color: #fff;
    white-space: nowrap;
    transition: background-color 120ms ease;
  }

  .cta-btn:hover {
    background: var(--gx-ac-cta-hover);
  }

  .cta-btn:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
  }

  .cta-btn svg {
    display: block;
    flex-shrink: 0;
  }

  /* ---------------- ".toolbar-row" ---------------- */
  .toolbar-row {
    min-height: 36px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    align-self: stretch;
    flex-shrink: 0;
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

  .grid-toggle svg {
    display: block;
    flex-shrink: 0;
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

  /* ---------------- ".list-card" ---------------- */
  .list-card {
    border-radius: 12px;
    background: var(--gx-card);
    box-shadow:
      inset 0 0 0 1px var(--gx-ring-soft),
      var(--gx-mcp-card-shadow);
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
    min-height: 94px;
    padding: 20px;
    display: flex;
    align-items: center;
    gap: 12px;
    border-top: 1px solid var(--gx-ring-soft);
  }

  /* The failed-test card takes the whole row and brings its own padding. */
  .list-row--error {
    align-items: stretch;
    padding: 12px;
  }

  /* Column widths, shared by the header and every row. */
  .col-name {
    flex: 1 1 280px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .col-transport,
  .col-auth,
  .col-status {
    width: 100px;
    flex-shrink: 0;
  }

  .col-conn {
    width: 130px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .list-head .col-conn {
    display: block;
  }

  .col-tools {
    width: 80px;
    flex-shrink: 0;
    font-weight: 700;
    font-size: 14px;
    color: var(--gx-mcp-title);
  }

  .col-tools--dim {
    font-weight: 500;
    color: var(--gx-an-sub);
  }

  /* Five 28px icon buttons and their four 6px gaps. Fixed, not growing: a
     growing cell would be as wide as its own row's content, so the header and
     any row carrying a Connect pill would sit on different column edges. */
  .col-actions {
    flex: 0 0 164px;
    display: flex;
    gap: 6px;
    justify-content: flex-end;
    align-items: center;
  }

  /* Room for the pill on every row of a table where some server can connect. */
  .list-card--connectable .col-actions {
    flex-basis: 280px;
  }

  /* A longer translation of "Connect" narrows the pill rather than the row. */
  .col-actions .connect-pill {
    min-width: 0;
    flex-shrink: 1;
  }

  .col-actions .connect-pill span {
    overflow: hidden;
    text-overflow: ellipsis;
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

  .row-desc {
    font-weight: 400;
    font-size: 13px;
    color: var(--gx-an-sub);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ".chip" — transport, auth and the tool count. */
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

  /* ".toggle-switch" */
  .toggle-switch {
    width: 36px;
    height: 20px;
    border-radius: 10px;
    display: flex;
    padding: 2px;
    align-items: center;
    flex-shrink: 0;
    transition: background-color 160ms ease;
  }

  .toggle-switch--on {
    background: var(--gx-org-brand-alt);
    justify-content: flex-end;
  }

  .toggle-switch--off {
    background: var(--gx-org-hair-soft);
    justify-content: flex-start;
  }

  .toggle-switch:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
  }

  .toggle-handle {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.0627);
    flex-shrink: 0;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .status-dot--on {
    background: var(--gx-org-brand-alt);
  }

  .status-dot--off {
    background: var(--gx-mcp-red);
  }

  .conn-label {
    font-weight: 500;
    font-size: 13px;
    white-space: nowrap;
  }

  .conn-label--on {
    color: var(--gx-org-brand-alt);
  }

  .conn-label--off {
    color: var(--gx-mcp-red);
  }

  /* ".icon-btn" / ".connect-pill" */
  .icon-btn {
    width: 28px;
    height: 28px;
    border-radius: 6px;
    background: var(--gx-ring-soft);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--gx-an-sub);
    flex-shrink: 0;
    transition:
      background-color 120ms ease,
      color 120ms ease;
  }

  .icon-btn:hover:not(:disabled) {
    background: var(--gx-mcp-icon-hover);
    color: var(--gx-org-primary-500);
  }

  .icon-btn--danger:hover:not(:disabled) {
    background: var(--gx-mcp-err-bg);
    color: var(--gx-mcp-red);
  }

  .icon-btn:focus-visible,
  .connect-pill:focus-visible,
  .btn-retry:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
  }

  .icon-btn svg {
    display: block;
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
    transition: background-color 120ms ease;
  }

  .connect-pill:hover:not(:disabled) {
    background: var(--gx-mcp-icon-hover);
  }

  .connect-pill svg {
    display: block;
    flex-shrink: 0;
  }

  /* One spinner for every in-flight action button. */
  .btn-spinner {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 1.5px solid currentColor;
    border-top-color: transparent;
    flex-shrink: 0;
    animation: mcpSpin 0.7s linear infinite;
  }

  @keyframes mcpSpin {
    to {
      transform: rotate(360deg);
    }
  }

  /* ---------------- ".card-grid" ---------------- */
  /* The design lays three cards across one row; as a real list grows, the same
     card metrics wrap instead of shrinking past legibility. */
  .card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 16px;
    align-self: stretch;
  }

  .mcp-card {
    min-width: 0;
    border-radius: 12px;
    background: var(--gx-card);
    box-shadow: var(--gx-mcp-card-shadow);
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    border: 1px solid var(--gx-mcp-edge);
  }

  /* A connected server carries a green rail down its leading edge. */
  .mcp-card[data-status="connected"] {
    border-color: var(--gx-mcp-edge-ok);
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

  .mcp-card-name {
    font-weight: 700;
    font-size: 15px;
    color: var(--gx-mcp-title);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .mcp-status-line {
    display: flex;
    gap: 6px;
    align-items: center;
    min-width: 0;
  }

  .tested {
    font-weight: 400;
    font-size: 10px;
    color: var(--gx-mcp-dim);
    margin-inline-start: 4px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
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

  /* ".scope-block" */
  .scope-block {
    border-radius: 8px;
    background: var(--gx-an-field-bg);
    display: flex;
    gap: 8px;
    padding: 8px 10px;
    align-items: center;
    color: var(--gx-mcp-dim);
    min-width: 0;
  }

  .scope-block svg {
    display: block;
    flex-shrink: 0;
  }

  .scope-block span {
    font-weight: 500;
    font-size: 11px;
    color: var(--gx-mcp-scope-fg);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .chip-row {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .mcp-card-footer {
    border-top: 1px solid var(--gx-mcp-edge);
    padding: 12px 16px;
    display: flex;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;
  }

  /* ---------------- ".empty-state" / ".loading-state" ---------------- */
  .empty-state,
  .loading-state {
    align-self: stretch;
  }

  .empty-card {
    border-radius: 16px;
    background: var(--gx-card);
    outline: 1.5px dashed var(--gx-mcp-m-cancel-ring);
    outline-offset: -1.5px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 44px 20px;
    align-items: center;
  }

  .empty-icon-bg {
    width: 44px;
    height: 44px;
    border-radius: 22px;
    background: var(--gx-ae-callout-bg);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--gx-tx-chip-icon-fg);
  }

  .empty-title {
    font-weight: 700;
    font-size: 15px;
    text-align: center;
    color: var(--gx-mcp-ink);
  }

  .empty-desc {
    max-width: 260px;
    margin-top: 6px;
    font-weight: 400;
    font-size: 13px;
    line-height: 1.4;
    text-align: center;
    color: var(--gx-mcp-dim);
  }

  .empty-add-btn {
    height: 32px;
    border-radius: 9px;
    background: var(--gx-tx-chip-icon-fg);
    padding: 8px 16px;
    font-weight: 600;
    font-size: 13px;
    line-height: 100%;
    color: #fff;
    transition: background-color 120ms ease;
  }

  .empty-add-btn:hover {
    background: var(--gx-ac-cta-hover);
  }

  .empty-add-btn:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
  }

  /* ".skel-card" — the first-load placeholder. */
  .skel-card {
    border-radius: 16px;
    background: var(--gx-card);
    box-shadow:
      inset 0 0 0 1px var(--gx-mcp-m-ring),
      var(--gx-mcp-panel-shadow);
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 20px;
  }

  .skel-row {
    display: flex;
    gap: 12px;
    align-items: center;
  }

  .skel-box {
    border-radius: 8px;
    background: linear-gradient(
      90deg,
      var(--gx-mcp-skel-a),
      var(--gx-mcp-skel-b),
      var(--gx-mcp-skel-a)
    );
    background-size: 200% 100%;
    animation: skelShimmer 1.3s ease-in-out infinite;
    flex-shrink: 0;
  }

  @keyframes skelShimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .skel-box {
      animation: none;
    }

    .btn-spinner {
      animation-duration: 2s;
    }
  }

  .skel-icon {
    width: 34px;
    height: 34px;
    border-radius: 9px;
  }

  .skel-lines {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex-grow: 1;
  }

  .skel-line {
    height: 10px;
    border-radius: 4px;
  }

  /* ---------------- ".error-card" ---------------- */
  .error-card {
    flex-grow: 1;
    min-width: 0;
    border-radius: 16px;
    background: var(--gx-card);
    box-shadow:
      inset 0 0 0 1px var(--gx-mcp-m-ring),
      var(--gx-mcp-panel-shadow);
    overflow: hidden;
  }

  .error-row-header {
    padding: 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .error-left {
    display: flex;
    gap: 12px;
    align-items: center;
    min-width: 0;
  }

  .error-actions {
    display: flex;
    gap: 6px;
    align-items: center;
    flex-shrink: 0;
  }

  .error-db-icon {
    width: 34px;
    height: 34px;
    border-radius: 9px;
    background: var(--gx-mcp-code-bg);
    box-shadow: inset 0 0 0 1px var(--gx-mcp-m-ring);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--gx-mcp-dim);
    flex-shrink: 0;
  }

  .error-name {
    font-weight: 600;
    font-size: 14px;
    color: var(--gx-mcp-ink);
  }

  .error-failed {
    display: flex;
    gap: 4px;
    align-items: center;
    margin-top: 4px;
    color: var(--gx-mcp-red);
  }

  .error-failed span {
    font-weight: 600;
    font-size: 13px;
    color: var(--gx-mcp-red);
  }

  .btn-retry {
    height: 27px;
    border-radius: 6px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-mcp-m-ring);
    padding: 6px 12px;
    font-weight: 600;
    font-size: 12px;
    line-height: 100%;
    color: var(--gx-mcp-ink);
    transition: background-color 120ms ease;
    flex-shrink: 0;
  }

  .btn-retry:hover:not(:disabled) {
    background: var(--gx-an-field-bg);
  }

  .error-banner-row {
    background: var(--gx-mcp-err-bg);
    border-top: 1px solid var(--gx-mcp-err-ring);
    border-bottom: 1px solid var(--gx-mcp-err-ring);
    display: flex;
    gap: 8px;
    padding: 12px;
    align-items: flex-start;
    color: var(--gx-mcp-err-fg);
  }

  .error-banner-row svg {
    display: block;
    flex-shrink: 0;
    margin-top: 2px;
  }

  .error-banner-row span {
    font-weight: 400;
    font-size: 13px;
    line-height: 1.4;
    color: var(--gx-mcp-err-fg);
  }

  /* ---------------- Add / Edit dialog (".add-modal") ---------------- */
  /* Rendered through Modal's "mcp-servers" variant; these rules dress the parts
     the page itself hands over — the header mark, the body sections and the
     footer bar. */
  .add-header-icon {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    background: var(--gx-ae-callout-bg);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--gx-tx-chip-icon-fg);
    flex-shrink: 0;
  }

  .add-header-icon--danger {
    background: var(--gx-mcp-err-bg);
    color: var(--gx-mcp-red);
  }

  .mcp-form {
    display: flex;
    flex-direction: column;
    align-self: stretch;
  }

  .add-section {
    border-top: 1px solid var(--gx-mcp-m-hair);
    padding: 18px 0;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .add-section-header {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .add-section-icon {
    width: 22px;
    height: 22px;
    border-radius: 4px;
    background: var(--gx-mcp-m-hair);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--gx-mcp-m-section);
    flex-shrink: 0;
  }

  .add-section-title {
    font-weight: 700;
    font-size: 11px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    color: var(--gx-mcp-m-section);
  }

  .add-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .add-field-row {
    display: flex;
    gap: 14px;
  }

  .add-field-row > .add-field {
    flex: 1 1 0;
    min-width: 0;
  }

  .add-label {
    display: flex;
    gap: 4px;
    align-items: center;
    font-weight: 700;
    font-size: 13px;
    line-height: 100%;
    color: var(--gx-mcp-m-label);
  }

  .optional {
    font-weight: 400;
    font-style: italic;
    font-size: 12px;
    color: var(--gx-mcp-dim);
  }

  .add-input,
  .add-textarea {
    border-radius: 9px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1.5px var(--gx-mcp-m-ring);
    padding: 10px 13px;
    font-weight: 400;
    font-size: 14px;
    color: var(--gx-mcp-m-ink);
    transition: box-shadow 120ms ease;
  }

  .add-input:focus,
  .add-textarea:focus {
    box-shadow: inset 0 0 0 1.5px var(--gx-tx-chip-icon-fg);
  }

  .add-input--error,
  .add-input--error:focus {
    box-shadow: inset 0 0 0 1.5px var(--gx-mcp-deny);
  }

  .add-input::placeholder,
  .add-textarea::placeholder {
    color: var(--gx-mcp-m-placeholder);
    opacity: 1;
  }

  .add-textarea {
    resize: none;
    min-height: 64px;
    line-height: 1.45;
  }

  .add-input--mono {
    font-family: var(--gx-mono, ui-monospace, "SF Mono", Menlo, monospace);
  }

  .error-text {
    font-weight: 500;
    font-size: 12px;
    line-height: 1.4;
    color: var(--gx-mcp-deny);
  }

  /* ".dd" — the design's own select. */
  .dd {
    position: relative;
  }

  .dd-trigger {
    border-radius: 9px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1.5px var(--gx-mcp-m-ring);
    padding: 10px 13px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    width: 100%;
    font-weight: 400;
    font-size: 14px;
    line-height: 100%;
    color: var(--gx-mcp-m-ink);
    box-sizing: border-box;
  }

  .dd-trigger:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 1.5px var(--gx-tx-chip-icon-fg);
  }

  .dd-trigger svg {
    display: block;
    color: var(--gx-an-sub);
    flex-shrink: 0;
    transition: transform 120ms ease;
  }

  .dd[data-open="true"] .dd-trigger svg {
    transform: rotate(180deg);
  }

  .dd-menu {
    position: absolute;
    inset-inline-start: 0;
    top: calc(100% + 6px);
    width: 100%;
    border-radius: 8px;
    background: var(--gx-card);
    box-shadow:
      inset 0 0 0 1.5px var(--gx-mcp-m-ring),
      0 8px 16px 0 rgba(19, 22, 30, 0.102);
    padding: 4px;
    display: none;
    flex-direction: column;
    z-index: 5;
  }

  .dd[data-open="true"] .dd-menu {
    display: flex;
  }

  .dd-item {
    height: 32px;
    border-radius: 6px;
    padding: 8px 10px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    width: 100%;
    font-weight: 400;
    font-size: 13px;
    line-height: 100%;
    color: var(--gx-mcp-m-label);
    box-sizing: border-box;
  }

  .dd-item:hover {
    background: var(--gx-an-field-bg);
  }

  .dd-item[data-active="true"] {
    background: var(--gx-ae-callout-bg);
    color: var(--gx-tx-chip-icon-fg);
    font-weight: 600;
  }

  .dd-item svg {
    display: none;
    color: var(--gx-tx-chip-icon-fg);
    flex-shrink: 0;
  }

  .dd-item[data-active="true"] svg {
    display: block;
  }

  /* ".seg-control" — Default Access. */
  .seg-control {
    border-radius: 9px;
    background: var(--gx-mcp-m-hair);
    display: flex;
    padding: 3px;
  }

  .seg-opt {
    flex: 1 1 0;
    border-radius: 6px;
    display: flex;
    gap: 6px;
    justify-content: center;
    align-items: center;
    height: 34px;
    font-weight: 600;
    font-size: 13px;
    line-height: 100%;
    color: var(--gx-an-sub);
    transition:
      background-color 120ms ease,
      color 120ms ease;
  }

  .seg-opt svg {
    display: block;
    flex-shrink: 0;
  }

  .seg-opt[data-active="true"] {
    background: var(--gx-card);
    box-shadow: 0 1px 2px 0 rgba(19, 22, 30, 0.05);
  }

  .seg-opt[data-active="true"][data-kind="allow"] {
    color: var(--gx-mcp-allow);
  }

  .seg-opt[data-active="true"][data-kind="deny"] {
    color: var(--gx-mcp-deny);
  }

  .seg-opt:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
  }

  .seg-help {
    font-weight: 400;
    font-size: 12px;
    line-height: 1.4;
    color: var(--gx-mcp-m-placeholder);
  }

  /* "Advanced — Connection Config" disclosure. */
  .adv-toggle {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    width: 100%;
  }

  .adv-toggle-left {
    display: flex;
    gap: 10px;
    align-items: center;
    color: var(--gx-an-sub);
  }

  .adv-toggle-left span {
    font-weight: 700;
    font-size: 13px;
    color: var(--gx-mcp-m-label);
  }

  .adv-toggle svg {
    display: block;
    flex-shrink: 0;
  }

  .adv-toggle > svg {
    color: var(--gx-mcp-m-placeholder);
    transition: transform 120ms ease;
  }

  .add-section[data-open="true"] .adv-toggle > svg {
    transform: rotate(90deg);
  }

  :global([dir="rtl"]) .adv-toggle > svg {
    transform: scaleX(-1);
  }

  :global([dir="rtl"]) .add-section[data-open="true"] .adv-toggle > svg {
    transform: scaleX(-1) rotate(-90deg);
  }

  .adv-body {
    display: none;
    flex-direction: column;
    gap: 8px;
    padding-top: 14px;
  }

  .add-section[data-open="true"] .adv-body {
    display: flex;
  }

  .json-box {
    border-radius: 8px;
    background: var(--gx-mcp-code-bg);
    box-shadow: inset 0 0 0 1px var(--gx-mcp-m-ring);
    padding: 12px;
    font-family: var(--gx-mono, ui-monospace, "SF Mono", Menlo, monospace);
    font-weight: 400;
    font-size: 13px;
    line-height: 1.5;
    color: var(--gx-mcp-m-label);
    resize: vertical;
    white-space: pre;
    transition: box-shadow 120ms ease;
  }

  .json-box:focus {
    box-shadow: inset 0 0 0 1.5px var(--gx-tx-chip-icon-fg);
  }

  .json-box--error,
  .json-box--error:focus {
    box-shadow: inset 0 0 0 1.5px var(--gx-mcp-deny);
  }

  .format-link {
    font-weight: 600;
    font-size: 13px;
    line-height: 100%;
    color: var(--gx-tx-chip-icon-fg);
    text-decoration: underline;
    align-self: flex-start;
  }

  /* ".add-error-banner" — the last submit failure, pinned above the footer. */
  .add-error-banner {
    background: var(--gx-mcp-err-bg);
    display: flex;
    gap: 10px;
    padding: 12px 16px;
    align-items: center;
    color: var(--gx-mcp-err-strong);
  }

  .add-error-banner svg {
    display: block;
    flex-shrink: 0;
  }

  .add-error-banner span {
    font-weight: 500;
    font-size: 13px;
    line-height: 1.4;
    color: var(--gx-mcp-err-strong);
  }

  /* ".add-footer" */
  .add-footer {
    min-height: 69px;
    background: var(--gx-card);
    border-top: 1px solid var(--gx-mcp-m-hair);
    box-shadow: 0 -4px 12px 0 rgba(19, 22, 30, 0.04);
    display: flex;
    padding: 16px 24px;
    justify-content: flex-end;
    align-items: center;
    box-sizing: border-box;
  }

  .add-footer-actions {
    display: flex;
    gap: 8px;
  }

  .btn-add-cancel {
    height: 37px;
    border-radius: 9px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-mcp-m-cancel-ring);
    padding: 10px 18px;
    font-weight: 600;
    font-size: 14px;
    line-height: 100%;
    color: var(--gx-mcp-m-cancel-fg);
    transition: background-color 120ms ease;
  }

  .btn-add-cancel:hover:not(:disabled) {
    background: var(--gx-an-field-bg);
  }

  .btn-add-create {
    height: 37px;
    border-radius: 9px;
    background: var(--gx-tx-chip-icon-fg);
    padding: 10px 18px;
    font-weight: 600;
    font-size: 14px;
    line-height: 100%;
    color: #fff;
    transition: background-color 120ms ease;
  }

  .btn-add-create:hover:not(:disabled) {
    background: var(--gx-ac-cta-hover);
  }

  .btn-add-create--danger {
    background: var(--gx-mcp-deny);
  }

  .btn-add-create--danger:hover:not(:disabled) {
    background: var(--gx-mcp-red);
  }

  .btn-add-cancel:focus-visible,
  .btn-add-create:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
  }

  .confirm-body {
    font-size: 14px;
    line-height: 1.5;
    color: var(--gx-mcp-m-label);
  }

  .confirm-body p {
    margin: 0;
  }

  /* ---------------- narrow viewports ---------------- */
  @media (max-width: 1280px) {
    /* The seven-column row cannot hold its widths below this — the name column
       is the only elastic one and it collapses — so each row becomes a stack:
       name and description, then the metadata, then actions. */
    .list-head {
      display: none;
    }

    .list-row {
      flex-wrap: wrap;
      row-gap: 12px;
    }

    .col-name {
      flex: 1 1 100%;
    }

    .col-transport,
    .col-auth,
    .col-status,
    .col-conn,
    .col-tools {
      width: auto;
    }

    .col-actions,
    .list-card--connectable .col-actions {
      flex-basis: 100%;
      justify-content: flex-start;
    }
  }

  @media (max-width: 768px) {
    .mcp-servers-container {
      padding: 20px 16px;
      gap: 20px;
    }

    .toolbar-left {
      flex: 1 1 100%;
      flex-wrap: wrap;
    }

    .search-row {
      width: 100%;
    }

    .add-field-row {
      flex-direction: column;
    }
  }

  /* ---------------- Detail view (access / tools / connection) ----------------
     Not part of mcp-servers.html — it keeps the app's own panel styling. */
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
    border-bottom: 1px solid var(--gx-hair);
  }

  .detail-back-btn {
    display: inline-flex;
    align-items: center;
    align-self: flex-start;
    gap: var(--space-xs);
    padding: var(--space-xs) var(--space-sm);
    margin-inline-start: calc(-1 * var(--space-sm));
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--gx-slate-500);
    font-size: 0.8125rem;
    font-weight: 500;
    transition: all 0.2s ease;
  }

  .detail-back-btn:hover {
    color: var(--gx-slate-900);
    background: var(--gx-hover-soft);
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
    color: var(--gx-slate-900);
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
    color: var(--gx-org-brand-alt);
    background: var(--gx-ae-ok-bg);
  }

  .detail-status--disconnected {
    color: var(--gx-mcp-red);
    background: var(--gx-mcp-err-bg);
  }

  .detail-status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
  }

  .detail-description {
    font-size: 0.8125rem;
    color: var(--gx-slate-500);
    margin: 0;
    line-height: 1.5;
  }

  .detail-tabs {
    display: flex;
    gap: var(--space-md);
    border-bottom: 1px solid var(--gx-hair);
    margin-top: var(--space-lg);
  }

  .detail-tab {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-md) var(--space-lg);
    border-radius: var(--radius-md) var(--radius-md) 0 0;
    border-bottom: 2px solid transparent;
    background: transparent;
    color: var(--gx-slate-500);
    font-size: 0.875rem;
    font-weight: 500;
    transition: all 0.2s ease;
    margin-bottom: -1px;
  }

  .detail-tab:hover:not(.detail-tab--active) {
    color: var(--gx-slate-900);
    background: var(--gx-hover-soft);
  }

  .detail-tab--active {
    color: var(--gx-org-primary-500);
    border-bottom-color: var(--gx-org-primary-500);
    font-weight: 600;
  }

  .detail-content {
    padding-top: var(--space-xl);
    flex: 1;
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

  /* Server descriptions are a one-line ellipsis so the cards line up on a
     wide grid. Stacked full-width on a phone there is room for two lines,
     and the description is the only place the server's purpose is stated. */
  @media (max-width: 640px) {
    .row-desc {
      white-space: normal;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      line-clamp: 2;
      -webkit-box-orient: vertical;
    }
  }
</style>
