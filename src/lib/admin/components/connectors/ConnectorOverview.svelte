<!--
  SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
  SPDX-License-Identifier: Apache-2.0

  Connector detail / overview screen (the connector-detail design).

  Replaces the old Access/Tools/Connection tabs as the first screen behind a
  connector's shield icon. The tabs view is still reachable from the "Advanced"
  row (onAdvanced). Driven entirely by the native connector-plugin contract:
    GET  /admin/mcp-servers/{id}/overview
    GET  /admin/mcp-servers/{id}/people
    PUT  /admin/mcp-servers/{id}/tools/{tool_id}   (capability toggle)
    PUT  /admin/mcp-servers/{id}/access/default     (who-can-use)

  Numbers that the design mock labels "Questions answered / Blocked by PII" are
  deliberately rendered with the real usage fields (tool calls / successful /
  failed), per the connector contract doc — those labels are not backed by any
  measured event.
-->
<script lang="ts">
  import { _ } from "svelte-i18n";
  import { navigate } from "svelte-routing";
  import ConnectorIcon from "./ConnectorIcon.svelte";
  import LoadingSpinner from "../LoadingSpinner.svelte";
  import { toast } from "../../../components/Toaster.svelte";
  import {
    getMcpServerOverview,
    getMcpServerPeople,
    updateMcpServerTool,
    updateServerDefaultAccess,
  } from "../../../api/admin/mcpServers.js";
  import type { MCPServer } from "../../types.js";
  import type {
    McpServerOverview,
    McpServerPerson,
    McpOverviewTool,
    McpDefaultAccess,
    McpConnectionState,
    McpAuthenticationMethod,
  } from "../../types.js";

  type Props = {
    server: MCPServer;
    displayName?: string;
    iconSrc?: string;
    onBack: () => void;
    onAdvanced: () => void;
    onConnect: () => void;
    onToggleEnabled: () => void | Promise<unknown>;
  };

  let {
    server,
    displayName,
    iconSrc = "",
    onBack,
    onAdvanced,
    onConnect,
    onToggleEnabled,
  }: Props = $props();

  let overview = $state<McpServerOverview | null>(null);
  let people = $state<McpServerPerson[]>([]);
  let peopleTotal = $state(0);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let savingCapId = $state<string | null>(null);
  let savingAccess = $state(false);
  let savingEnabled = $state(false);

  async function load() {
    const id = server.id;
    loading = true;
    error = null;
    try {
      const [ov, pp] = await Promise.all([
        getMcpServerOverview(id),
        getMcpServerPeople(id, { limit: 5, offset: 0 }),
      ]);
      overview = ov;
      people = pp.people;
      peopleTotal = pp.total;
    } catch {
      error = $_("admin.connectorOverview.loadError");
    } finally {
      loading = false;
    }
  }

  // Reload whenever the open server changes.
  $effect(() => {
    void server.id;
    load();
  });

  const name = $derived(displayName ?? overview?.name ?? server.name);
  // Prefer the overview's description, but fall back to the server's own
  // description when it is missing or blank, so it always shows below the name.
  const description = $derived(
    (overview?.description ?? "").trim() || (server.description ?? "").trim(),
  );
  const connected = $derived(overview?.connected_user_count ?? 0);
  const totalMembers = $derived(overview?.active_user_count ?? 0);
  const notConnectedCount = $derived(Math.max(0, totalMembers - connected));
  const toolCount = $derived(overview?.tools.length ?? server.tool_count ?? 0);

  // Suggested prompts: prefer the overview endpoint, else read them straight
  // from the connector plugin manifest
  // (connection_config.connector_plugin.manifest.presentation.suggested_prompts).
  function manifestPrompts(s: MCPServer): string[] {
    const cfg = s.connection_config as Record<string, unknown> | undefined;
    const plugin = cfg?.connector_plugin as Record<string, unknown> | undefined;
    const manifest = plugin?.manifest as Record<string, unknown> | undefined;
    const presentation = manifest?.presentation as Record<string, unknown> | undefined;
    const list = presentation?.suggested_prompts;
    return Array.isArray(list)
      ? list.filter((p): p is string => typeof p === "string" && p.trim().length > 0)
      : [];
  }

  const prompts = $derived(
    overview?.integration.suggested_prompts?.length
      ? overview.integration.suggested_prompts
      : manifestPrompts(server),
  );

  // Reference-style metadata (real contract fields only).
  const toolList = $derived(overview?.tools ?? []);
  const connectorUrl = $derived(server.url ?? "");
  const version = $derived(overview?.integration.plugin_version ?? "");
  const authMethod = $derived<McpAuthenticationMethod | null>(
    overview?.integration.authentication ?? null,
  );
  const perUserCreds = $derived(overview?.integration.per_user_credentials ?? false);
  const isVerified = $derived(Boolean(server.icon));
  const addedLabel = $derived(fmtMonth(server.created_at));
  const syncedLabel = $derived(fmtDate(server.last_synced_at));

  function fmtMonth(iso: string | null | undefined): string {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat(undefined, {
      month: "long",
      year: "numeric",
    }).format(d);
  }
  function fmtDate(iso: string | null | undefined): string {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(d);
  }
  function authLabel(m: McpAuthenticationMethod | null): string {
    switch (m) {
      case "oauth2":
        return $_("admin.connectorOverview.authOauth2");
      case "api_token":
        return $_("admin.connectorOverview.authApiToken");
      case "grengin_broker":
        return $_("admin.connectorOverview.authBroker");
      case "server_managed":
        return $_("admin.connectorOverview.authServer");
      default:
        return $_("admin.connectorOverview.authUnavailable");
    }
  }

  const toolById = $derived(
    new Map((overview?.tools ?? []).map((t) => [t.id, t] as const)),
  );

  type CapRow = {
    id: string;
    name: string;
    description: string;
    readOnly: boolean;
    enabled: boolean;
    toolIds: string[];
  };

  const capabilities = $derived.by<CapRow[]>(() => {
    if (!overview) return [];
    return (overview.topic_groups ?? []).map((g) => {
      const tools = g.tool_ids
        .map((id) => toolById.get(id))
        .filter((t): t is McpOverviewTool => Boolean(t));
      return {
        id: g.id,
        name: g.name,
        description: g.description,
        readOnly: tools.length > 0 && tools.every((t) => t.is_read_only),
        enabled: tools.length > 0 && tools.every((t) => t.enabled),
        toolIds: tools.map((t) => t.id),
      };
    });
  });

  type AccessChoice = "everyone" | "teams" | "admins";
  const accessChoice = $derived<AccessChoice>(
    overview?.default_access === "all_users"
      ? "everyone"
      : overview?.default_access === "admin_only"
        ? "admins"
        : "teams",
  );

  async function toggleCapability(row: CapRow) {
    if (row.readOnly || savingCapId) return;
    savingCapId = row.id;
    const next = !row.enabled;
    try {
      await Promise.all(
        row.toolIds.map((id) => updateMcpServerTool(server.id, id, { enabled: next })),
      );
      await load();
    } catch {
      toast.error($_("admin.connectorOverview.saveFailed"));
    } finally {
      savingCapId = null;
    }
  }

  async function setAccess(choice: AccessChoice) {
    if (savingAccess || choice === accessChoice) return;
    const value: McpDefaultAccess =
      choice === "everyone"
        ? "all_users"
        : choice === "admins"
          ? "admin_only"
          : "explicit_only";
    savingAccess = true;
    try {
      await updateServerDefaultAccess(server.id, value);
      await load();
    } catch {
      toast.error($_("admin.connectorOverview.saveFailed"));
    } finally {
      savingAccess = false;
    }
  }

  async function handleToggleEnabled() {
    if (savingEnabled) return;
    savingEnabled = true;
    try {
      await onToggleEnabled();
      await load();
    } finally {
      savingEnabled = false;
    }
  }

  // Clicking a suggested prompt leaves admin, opens a new chat and sends it
  // (Chat.svelte reads the "message" query param and sends it on load).
  function openPromptInChat(prompt: string) {
    navigate(`/?message=${encodeURIComponent(prompt)}`);
  }

  function stateLabel(stateValue: McpConnectionState): string {
    if (stateValue === "connected") return $_("admin.connectorOverview.stateConnected");
    if (stateValue === "needs_reconnect")
      return $_("admin.connectorOverview.stateNeedsReconnect");
    if (stateValue === "unavailable")
      return $_("admin.connectorOverview.stateUnavailable");
    return $_("admin.connectorOverview.stateNotConnected");
  }

  function personName(p: McpServerPerson): string {
    return p.name ?? p.user_email;
  }

  function initials(value: string): string {
    return value
      .split(/\s+/)
      .map((w) => w[0] ?? "")
      .slice(0, 2)
      .join("")
      .toUpperCase();
  }
</script>

<div class="co">
  <button class="co-back" type="button" onclick={onBack}>
    <span class="co-back__arrow" aria-hidden="true">&#8592;</span>
    <span>{$_("admin.connectorOverview.allConnectors")}</span>
  </button>

  {#if loading}
    <div class="co-state" role="status" aria-label={$_("admin.connectorOverview.loading")}>
      <LoadingSpinner />
    </div>
  {:else if error}
    <div class="co-state co-state--error">
      <span>{error}</span>
      <button class="co-btn co-btn--ghost" type="button" onclick={load}>
        {$_("admin.connectorOverview.retry")}
      </button>
    </div>
  {:else if overview}
    <!-- Header -->
    <header class="co-header">
      <div class="co-head-main">
        <ConnectorIcon src={iconSrc} {name} size={44} />
        <div class="co-identity">
          <div class="co-title-row">
            <h2 class="co-name">{name}</h2>
            {#if isVerified}
              <span
                class="co-verified"
                title={$_("admin.connectorOverview.verified")}
                aria-label={$_("admin.connectorOverview.verified")}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path
                    d="M8 1.6 9.7 3l2.2-.25.6 2.15 1.9 1.1-1 2 1 2-1.9 1.1-.6 2.15L9.7 13 8 14.4 6.3 13l-2.2.25-.6-2.15L1.6 10l1-2-1-2 1.9-1.1.6-2.15L6.3 3 8 1.6Z"
                    fill="var(--gx-tx-accent, #427ac6)"
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
            <span class="co-pill">
              {$_("admin.connectorOverview.connectedBy", {
                values: { connected, total: totalMembers },
              })}
            </span>
          </div>
          {#if description}
            <p class="co-desc">{description}</p>
          {/if}
        </div>
      </div>
      <div class="co-head-actions">
        <!-- Hidden: the turn-on/off-for-everyone toggle. -->
        {#if false}
        <button
          class="co-btn co-btn--ghost"
          type="button"
          disabled={savingEnabled}
          onclick={handleToggleEnabled}
        >
          {#if savingEnabled}
            {$_("admin.connectorOverview.saving")}
          {:else if overview.enabled}
            {$_("admin.connectorOverview.turnOffForEveryone")}
          {:else}
            {$_("admin.connectorOverview.turnOnForEveryone")}
          {/if}
        </button>
        {/if}
        <button class="co-btn co-btn--primary" type="button" onclick={onConnect}>
          {$_("admin.connectorOverview.connectMyAccount")}
        </button>
      </div>
    </header>

    <div class="co-grid">
      <!-- Left column -->
      <div class="co-col co-col--main">
        {#if prompts.length}
          <section class="co-card">
            <h3 class="co-card__title">{$_("admin.connectorOverview.tryAsking")}</h3>
            <div class="co-prompts">
              {#each prompts as prompt (prompt)}
                <button
                  class="co-prompt"
                  type="button"
                  onclick={() => openPromptInChat(prompt)}
                  title={$_("admin.connectorOverview.openPrompt")}
                >
                  {prompt}
                </button>
              {/each}
            </div>
          </section>
        {/if}

        <!-- Hidden for now: capabilities ("What Grengin can do with it"). -->
        {#if false}
        <section class="co-card">
          <h3 class="co-card__title">{$_("admin.connectorOverview.capabilitiesTitle")}</h3>
          <p class="co-card__intro">{$_("admin.connectorOverview.capabilitiesIntro")}</p>
          <ul class="co-caps">
            {#each capabilities as cap (cap.id)}
              <li class="co-cap">
                <div class="co-cap__text">
                  <div class="co-cap__name">{cap.name}</div>
                  {#if cap.description}
                    <div class="co-cap__desc">{cap.description}</div>
                  {/if}
                </div>
                {#if cap.readOnly}
                  <span class="co-badge">{$_("admin.connectorOverview.alwaysOn")}</span>
                {:else}
                  <div class="co-cap__toggle">
                    <span class="co-cap__state">
                      {cap.enabled
                        ? $_("admin.connectorOverview.allowed")
                        : $_("admin.connectorOverview.off")}
                    </span>
                    <button
                      class="co-switch"
                      class:co-switch--on={cap.enabled}
                      type="button"
                      role="switch"
                      aria-checked={cap.enabled}
                      aria-label={cap.name}
                      disabled={savingCapId === cap.id}
                      onclick={() => toggleCapability(cap)}
                    >
                      <span class="co-switch__knob"></span>
                    </button>
                  </div>
                {/if}
              </li>
            {/each}
            {#if !capabilities.length}
              <li class="co-cap">
                <div class="co-cap__text">
                  <div class="co-cap__name">{$_("admin.connectorOverview.readingName")}</div>
                  <div class="co-cap__desc">{$_("admin.connectorOverview.readingDesc")}</div>
                </div>
                <span class="co-badge">{$_("admin.connectorOverview.alwaysOn")}</span>
              </li>
            {/if}
          </ul>
        </section>
        {/if}

        <!-- Hidden: who-can-use ("Who can use it") access section. -->
        {#if false}
        <section class="co-card">
          <h3 class="co-card__title">{$_("admin.connectorOverview.whoCanUse")}</h3>
          <p class="co-card__intro">{$_("admin.connectorOverview.whoCanUseIntro")}</p>
          {#if !overview.enabled}
            <p class="co-card__note">{$_("admin.connectorOverview.whoCanUseOffNote")}</p>
          {/if}
          <div
            class="co-choices"
            class:co-choices--off={!overview.enabled}
            role="radiogroup"
            aria-label={$_("admin.connectorOverview.whoCanUse")}
          >
            <button
              class="co-choice"
              class:co-choice--on={accessChoice === "everyone"}
              type="button"
              role="radio"
              aria-checked={accessChoice === "everyone"}
              disabled={savingAccess || !overview.enabled}
              onclick={() => setAccess("everyone")}
            >
              <span class="co-radio" aria-hidden="true"></span>
              <span class="co-choice__text">
                <span class="co-choice__title">{$_("admin.connectorOverview.everyone")}</span>
                <span class="co-choice__desc"
                  >{$_("admin.connectorOverview.everyoneDesc", {
                    values: { count: totalMembers },
                  })}</span
                >
              </span>
            </button>
            <button
              class="co-choice"
              class:co-choice--on={accessChoice === "teams"}
              type="button"
              role="radio"
              aria-checked={accessChoice === "teams"}
              disabled={savingAccess || !overview.enabled}
              onclick={() => setAccess("teams")}
            >
              <span class="co-radio" aria-hidden="true"></span>
              <span class="co-choice__text">
                <span class="co-choice__title">{$_("admin.connectorOverview.someTeams")}</span>
                <span class="co-choice__desc">{$_("admin.connectorOverview.someTeamsDesc")}</span>
              </span>
            </button>
            <button
              class="co-choice"
              class:co-choice--on={accessChoice === "admins"}
              type="button"
              role="radio"
              aria-checked={accessChoice === "admins"}
              disabled={savingAccess || !overview.enabled}
              onclick={() => setAccess("admins")}
            >
              <span class="co-radio" aria-hidden="true"></span>
              <span class="co-choice__text">
                <span class="co-choice__title">{$_("admin.connectorOverview.adminsOnly")}</span>
                <span class="co-choice__desc">{$_("admin.connectorOverview.adminsOnlyDesc")}</span>
              </span>
            </button>
          </div>
        </section>
        {/if}

        {#if toolList.length}
          <section class="co-card">
            <div class="co-tools-head">
              <h3 class="co-card__title">{$_("admin.connectorOverview.toolsTitle")}</h3>
              <span class="co-tools-count">{toolList.length}</span>
            </div>
            <p class="co-card__intro">{$_("admin.connectorOverview.toolsIntro")}</p>
            <div class="co-tools">
              {#each toolList as tool (tool.id)}
                <span class="co-tool" title={tool.description || tool.name}>
                  {tool.name}
                </span>
              {/each}
            </div>
          </section>
        {/if}

        <button class="co-advanced" type="button" onclick={onAdvanced}>
          <span class="co-advanced__text">
            <span class="co-advanced__title">{$_("admin.connectorOverview.advanced")}</span>
            <span class="co-advanced__desc"
              >{$_("admin.connectorOverview.advancedDesc", {
                values: { count: toolCount },
              })}</span
            >
          </span>
          <span class="co-advanced__chevron" aria-hidden="true">&#8250;</span>
        </button>
      </div>

      <!-- Right column -->
      <div class="co-col co-col--side">
        <section class="co-card">
          <div class="co-side-head">
            <h3 class="co-card__title">{$_("admin.connectorOverview.people")}</h3>
            {#if notConnectedCount > 0}
              <span class="co-side-link"
                >{$_("admin.connectorOverview.remindOthers", {
                  values: { count: notConnectedCount },
                })}</span
              >
            {/if}
          </div>
          <ul class="co-people">
            {#each people as person (person.user_id)}
              <li class="co-person">
                <span class="co-avatar" aria-hidden="true">{initials(personName(person))}</span>
                <span class="co-person__name">{personName(person)}</span>
                <span
                  class="co-person__state"
                  class:co-person__state--ok={person.connection_state === "connected"}
                  class:co-person__state--warn={person.connection_state === "needs_reconnect"}
                >
                  {stateLabel(person.connection_state)}
                </span>
              </li>
            {/each}
          </ul>
          <p class="co-people__foot">
            {$_("admin.connectorOverview.peopleFoot", {
              values: {
                connected,
                shown: people.length,
                notConnected: notConnectedCount,
              },
            })}
          </p>
        </section>

        <!-- Information -->
        <section class="co-card co-info">
          <h3 class="co-card__title">{$_("admin.connectorOverview.informationTitle")}</h3>
          <dl class="co-info__grid">
            {#if connectorUrl}
              <div class="co-info__row">
                <dt>{$_("admin.connectorOverview.infoConnectorUrl")}</dt>
                <dd class="co-info__mono">{connectorUrl}</dd>
              </div>
            {/if}
            {#if authMethod}
              <div class="co-info__row">
                <dt>{$_("admin.connectorOverview.infoSignIn")}</dt>
                <dd>
                  {authLabel(authMethod)}{#if perUserCreds}
                    <span class="co-info__sub"
                      >{$_("admin.connectorOverview.infoPerUser")}</span
                    >{/if}
                </dd>
              </div>
            {/if}
            <div class="co-info__row">
              <dt>{$_("admin.connectorOverview.infoTools")}</dt>
              <dd>{toolCount}</dd>
            </div>
            {#if version}
              <div class="co-info__row">
                <dt>{$_("admin.connectorOverview.infoVersion")}</dt>
                <dd class="co-info__mono">{version}</dd>
              </div>
            {/if}
            {#if addedLabel}
              <div class="co-info__row">
                <dt>{$_("admin.connectorOverview.infoAdded")}</dt>
                <dd>{addedLabel}</dd>
              </div>
            {/if}
            {#if syncedLabel}
              <div class="co-info__row">
                <dt>{$_("admin.connectorOverview.infoLastSynced")}</dt>
                <dd>{syncedLabel}</dd>
              </div>
            {/if}
          </dl>
        </section>
      </div>
    </div>
  {/if}
</div>

<style>
  .co {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }
  .co-back {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    align-self: flex-start;
    padding: 0;
    border: 0;
    background: none;
    cursor: pointer;
    font: 600 14px/20px inherit;
    color: var(--gx-ac-link, #427ac6);
  }
  .co-back:hover {
    text-decoration: underline;
  }
  .co-back__arrow {
    font-size: 16px;
  }

  .co-state {
    padding: 40px;
    text-align: center;
    color: var(--gx-an-sub, #868c99);
    display: flex;
    flex-direction: column;
    gap: 12px;
    align-items: center;
  }
  .co-state--error {
    color: var(--gx-mcp-err-fg, #c83c3c);
  }

  /* Header */
  .co-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 24px;
    flex-wrap: wrap;
  }
  .co-head-main {
    display: flex;
    gap: 14px;
    align-items: flex-start;
    min-width: 0;
  }
  .co-identity {
    min-width: 0;
  }
  .co-title-row {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .co-name {
    margin: 0;
    font-weight: 700;
    font-size: 22px;
    line-height: 28px;
    color: var(--gx-org-ink, #0e1828);
  }
  .co-pill {
    display: inline-flex;
    align-items: center;
    height: 25px;
    padding: 4px 11px;
    border-radius: 20px;
    background: var(--gx-org-primary-tint, #eef7f1);
    color: var(--gx-org-brand-alt, #3d8c64);
    font-weight: 600;
    font-size: 12px;
    line-height: 16px;
    white-space: nowrap;
  }
  .co-desc {
    margin: 6px 0 0;
    max-width: 560px;
    font-size: 14px;
    line-height: 20px;
    color: var(--gx-an-sub, #4e5561);
  }
  .co-head-actions {
    display: flex;
    gap: 10px;
    flex-shrink: 0;
  }

  .co-btn {
    height: 38px;
    padding: 0 16px;
    border-radius: 9px;
    font: 600 14px/1 inherit;
    cursor: pointer;
    white-space: nowrap;
    border: 1px solid transparent;
    transition:
      background-color 120ms ease,
      border-color 120ms ease;
  }
  .co-btn--ghost {
    background: var(--gx-surface, #fff);
    border-color: var(--gx-hair, #dee1e6);
    color: var(--gx-org-ink, #363b45);
  }
  .co-btn--ghost:hover {
    background: var(--gx-org-row-hover, #f7f8fa);
  }
  .co-btn--primary {
    background: var(--gx-tx-accent, #427ac6);
    color: #fff;
  }
  .co-btn--primary:hover {
    background: var(--gx-ac-cta-hover, #386ab0);
  }
  .co-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }

  /* Layout */
  .co-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 340px;
    gap: 24px;
    align-items: start;
  }
  @media (max-width: 960px) {
    .co-grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .co-col {
    display: flex;
    flex-direction: column;
    gap: 24px;
    min-width: 0;
  }

  .co-card {
    border-radius: 14px;
    background: var(--gx-surface, #fff);
    border: 1px solid var(--gx-hair, #dee1e6);
    padding: 22px;
  }
  .co-card__title {
    margin: 0;
    font-weight: 700;
    font-size: 15px;
    line-height: 22px;
    color: var(--gx-org-ink, #1b1e24);
  }
  .co-card__intro {
    margin: 4px 0 16px;
    font-size: 13px;
    line-height: 19px;
    color: var(--gx-an-sub, #868c99);
  }
  .co-card__note {
    margin: -8px 0 16px;
    font-size: 13px;
    line-height: 19px;
    font-weight: 500;
    color: var(--gx-mcp-dim, #b7791f);
  }
  .co-choices--off {
    opacity: 0.55;
  }

  /* Verified badge */
  .co-verified {
    display: inline-flex;
    align-items: center;
    line-height: 0;
  }

  /* Try asking — suggested prompts as inline, wrapping pills. */
  .co-prompts {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 14px;
  }
  .co-prompt {
    display: inline-flex;
    align-items: center;
    max-width: 100%;
    padding: 9px 14px;
    border-radius: 10px;
    border: 1px solid var(--gx-hair, #dee1e6);
    background: var(--gx-surface, #fff);
    font: 500 13.5px/1.35 inherit;
    color: var(--gx-org-ink, #1b1e24);
    text-align: left;
    cursor: pointer;
    transition:
      background-color 120ms ease,
      border-color 120ms ease;
  }
  .co-prompt:hover {
    background: var(--gx-org-row-hover, #f2f4f7);
    border-color: var(--gx-hair-strong, #cfd4dc);
  }
  .co-prompt:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
  }

  /* Tools chips */
  .co-tools-head {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .co-tools-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 22px;
    height: 20px;
    padding: 0 7px;
    border-radius: 10px;
    background: var(--gx-org-row-hover, #f2f4f7);
    color: var(--gx-an-sub, #868c99);
    font-weight: 600;
    font-size: 12px;
  }
  .co-tools {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 4px;
  }
  .co-tool {
    display: inline-flex;
    align-items: center;
    height: 28px;
    padding: 0 12px;
    border-radius: 8px;
    border: 1px solid var(--gx-hair, #dee1e6);
    background: var(--gx-surface, #fff);
    font: 500 12.5px/1 inherit;
    color: var(--gx-an-sub, #4e5561);
    white-space: nowrap;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Information metadata grid */
  .co-info__grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 18px;
    margin: 18px 0 0;
  }
  .co-info__row {
    min-width: 0;
  }
  .co-info__row dt {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--gx-an-sub, #868c99);
  }
  .co-info__row dd {
    margin: 6px 0 0;
    font-size: 14px;
    line-height: 20px;
    color: var(--gx-org-ink, #1b1e24);
    word-break: break-word;
  }
  .co-info__mono {
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    font-size: 13px;
  }
  .co-info__sub {
    display: block;
    margin-top: 2px;
    font-size: 13px;
    color: var(--gx-an-sub, #868c99);
  }

  /* Capabilities */
  .co-caps {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .co-cap {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 16px 0;
    border-top: 1px solid var(--gx-hair-soft, #eef0f3);
  }
  .co-cap:first-child {
    border-top: 0;
  }
  .co-cap__name {
    font-weight: 600;
    font-size: 14px;
    color: var(--gx-org-ink, #1b1e24);
  }
  .co-cap__desc {
    margin-top: 2px;
    font-size: 13px;
    color: var(--gx-an-sub, #868c99);
  }
  .co-badge {
    flex-shrink: 0;
    padding: 4px 11px;
    border-radius: 20px;
    background: var(--gx-org-primary-tint, #eef7f1);
    color: var(--gx-org-brand-alt, #3d8c64);
    font-weight: 600;
    font-size: 12px;
    white-space: nowrap;
  }
  .co-cap__toggle {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }
  .co-cap__state {
    font-size: 13px;
    color: var(--gx-an-sub, #4e5561);
  }
  .co-switch {
    position: relative;
    width: 40px;
    height: 24px;
    border-radius: 12px;
    border: 0;
    padding: 0;
    background: var(--gx-hair, #dee1e6);
    cursor: pointer;
    transition: background-color 140ms ease;
  }
  .co-switch--on {
    background: var(--gx-org-brand-alt, #4ca97a);
  }
  .co-switch:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .co-switch__knob {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 20px;
    height: 20px;
    border-radius: 10px;
    background: #fff;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
    transition: transform 140ms ease;
  }
  .co-switch--on .co-switch__knob {
    transform: translateX(16px);
  }

  /* Who can use it */
  .co-choices {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }
  @media (max-width: 640px) {
    .co-choices {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .co-choice {
    display: flex;
    gap: 10px;
    padding: 14px;
    border-radius: 10px;
    border: 1px solid var(--gx-hair, #dee1e6);
    background: var(--gx-surface, #fff);
    cursor: pointer;
    text-align: left;
    transition:
      border-color 120ms ease,
      background-color 120ms ease;
  }
  .co-choice:hover {
    background: var(--gx-org-row-hover, #fafbfc);
  }
  .co-choice--on {
    border-color: var(--gx-tx-accent, #3f5cb8);
    background: var(--gx-nav-active-bg, #eef2fc);
  }
  .co-choice:disabled {
    cursor: default;
  }
  .co-radio {
    flex-shrink: 0;
    width: 16px;
    height: 16px;
    margin-top: 2px;
    border-radius: 8px;
    box-shadow: inset 0 0 0 1.5px var(--gx-org-slate-350, #c7cbd3);
    background: #fff;
  }
  .co-choice--on .co-radio {
    box-shadow: inset 0 0 0 5px var(--gx-tx-accent, #3f5cb8);
  }
  .co-choice__text {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }
  .co-choice__title {
    font-weight: 600;
    font-size: 14px;
    color: var(--gx-org-ink, #1b1e24);
  }
  .co-choice__desc {
    font-size: 12px;
    color: var(--gx-an-sub, #868c99);
  }

  /* Advanced */
  .co-advanced {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    width: 100%;
    padding: 18px 22px;
    border-radius: 14px;
    border: 1px solid var(--gx-hair, #dee1e6);
    background: var(--gx-surface, #fff);
    cursor: pointer;
    text-align: left;
    transition: background-color 120ms ease;
  }
  .co-advanced:hover {
    background: var(--gx-org-row-hover, #f7f8fa);
  }
  .co-advanced__title {
    font-weight: 700;
    font-size: 14px;
    color: var(--gx-org-ink, #1b1e24);
  }
  .co-advanced__desc {
    display: block;
    margin-top: 2px;
    font-size: 13px;
    color: var(--gx-an-sub, #868c99);
  }
  .co-advanced__chevron {
    font-size: 22px;
    color: var(--gx-an-sub, #868c99);
    line-height: 1;
  }

  /* People */
  .co-side-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }
  .co-side-link {
    font-weight: 600;
    font-size: 13px;
    color: var(--gx-ac-link, #427ac6);
    cursor: pointer;
  }
  .co-people {
    list-style: none;
    margin: 16px 0 0;
    padding: 0;
  }
  .co-person {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 0;
  }
  .co-avatar {
    flex-shrink: 0;
    width: 30px;
    height: 30px;
    border-radius: 15px;
    background: var(--gx-avatar, #6b7280);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
  }
  .co-person__name {
    flex-grow: 1;
    min-width: 0;
    font-size: 14px;
    color: var(--gx-org-ink, #1b1e24);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .co-person__state {
    flex-shrink: 0;
    font-size: 13px;
    font-weight: 500;
    color: var(--gx-an-sub, #868c99);
  }
  .co-person__state--ok {
    color: var(--gx-org-brand-alt, #3d8c64);
  }
  .co-person__state--warn {
    color: var(--gx-mcp-dim, #b7791f);
  }
  .co-people__foot {
    margin: 12px 0 0;
    font-size: 12px;
    color: var(--gx-an-sub, #868c99);
  }
</style>
