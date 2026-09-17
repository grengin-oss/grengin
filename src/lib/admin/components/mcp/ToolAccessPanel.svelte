<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { onMount } from "svelte";
  import type { MCPServer, McpToolAccess } from "../../types.js";
  import { getServerToolsAccess } from "../../../api/admin/mcpServers.js";
  import ToolAccessModal from "./ToolAccessModal.svelte";
  import LoadingSpinner from "../LoadingSpinner.svelte";
  import { toast } from "../../../components/Toaster.svelte";
  import { ApiError } from "../../../api/client.js";
  import { getLocalizedError } from "../../../utils/errorLocalization.js";
  import { _ } from "svelte-i18n";

  interface Props {
    server: MCPServer;
  }

  let { server }: Props = $props();

  let toolsAccess = $state<McpToolAccess[]>([]);
  let isLoading = $state(false);
  let selectedToolId = $state<string | null>(null);
  let selectedToolName = $state("");
  let toolModalOpen = $state(false);

  /**
   * The design's empty panel reads "Not connected" when the server is down —
   * a synced server with no tools gets the plainer "no tools" copy instead.
   */
  const isConnected = $derived(server.status === "connected");

  onMount(() => {
    loadToolsAccess();
  });

  async function loadToolsAccess() {
    isLoading = true;
    try {
      toolsAccess = await getServerToolsAccess(server.id);
    } catch (err: any) {
      const msg =
        err instanceof ApiError
          ? getLocalizedError(err, "description", $_)
          : err.message;
      toast.error(msg || $_("admin.mcpAccess.failedToLoadTools"));
    } finally {
      isLoading = false;
    }
  }

  function openToolModal(tool: McpToolAccess) {
    selectedToolId = tool.tool_id;
    selectedToolName = tool.tool_name;
    toolModalOpen = true;
  }

  function closeToolModal() {
    toolModalOpen = false;
    selectedToolId = null;
    selectedToolName = "";
  }

  function handleToolSaved() {
    loadToolsAccess();
  }

  /**
   * The design's two badges: the amber "proxy fallback" for a tool that takes
   * the server's rules as-is, the green "active" for one that overrides them.
   */
  function getBadgeLabel(tool: McpToolAccess): string {
    if (tool.inherit_from_server) {
      return $_("admin.mcpAccess.toolStatus.proxyFallback");
    }
    if (tool.rules.length === 0) {
      return $_("admin.mcpAccess.toolStatus.noRules");
    }
    return $_("admin.mcpAccess.toolStatus.custom", {
      values: { count: tool.rules.length },
    });
  }
</script>

<!-- ".panel[data-panel=tools]" — mcp-server-detail.html -->
<div class="panel">
  {#if isLoading}
    <LoadingSpinner text={$_("admin.mcpAccess.loadingTools")} size="md" />
  {:else}
    <span class="section-label">
      {$_("admin.mcpAccess.serverTools", {
        values: { count: toolsAccess.length },
      })}
    </span>

    {#if toolsAccess.length === 0}
      <div class="tools-empty">
        <span class="rules-empty-title">
          {isConnected
            ? $_("admin.mcpAccess.noTools")
            : $_("admin.mcpAccess.notConnected")}
        </span>
        <span class="rules-empty-desc">
          {isConnected
            ? $_("admin.mcpAccess.noToolsHint")
            : $_("admin.mcpAccess.notConnectedHint")}
        </span>
      </div>
    {:else}
      <div class="tool-list">
        {#each toolsAccess as tool (tool.tool_id)}
          <div class="tool-row">
            <div class="tool-identity">
              <span class="tool-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path
                    d="M12.75 2.25 15.75 5.25 6 15H3v-3z"
                    stroke="currentColor"
                    stroke-width="1.1"
                    fill="none"
                    stroke-linejoin="round"
                  />
                </svg>
              </span>
              <span class="tool-bullet">
                <span class="tool-bullet-dot" aria-hidden="true"></span>
                <span class="tool-name" title={tool.tool_name}
                  >{tool.tool_name}</span
                >
              </span>
            </div>
            <div class="tool-controls">
              <span
                class="tool-badge"
                class:tool-badge--proxy={tool.inherit_from_server}
                class:tool-badge--active={!tool.inherit_from_server}
              >
                {getBadgeLabel(tool)}
              </span>
              <button
                class="tool-settings"
                type="button"
                onclick={() => openToolModal(tool)}
                aria-label={$_("admin.mcpAccess.configureTool")}
                title={$_("admin.mcpAccess.configureTool")}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 18 18"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle
                    cx="9"
                    cy="9"
                    r="2.6"
                    stroke="currentColor"
                    stroke-width="1.3"
                  />
                  <path
                    d="M9 3.2v1.9M9 12.9v1.9M3.2 9h1.9M12.9 9h1.9M5.3 5.3l1.3 1.3M11.4 11.4l1.3 1.3M5.3 12.7l1.3-1.3M11.4 6.6l1.3-1.3"
                    stroke="currentColor"
                    stroke-width="1.3"
                  />
                </svg>
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>

{#if selectedToolId}
  <ToolAccessModal
    toolId={selectedToolId}
    toolName={selectedToolName}
    isOpen={toolModalOpen}
    onClose={closeToolModal}
    onSaved={handleToolSaved}
  />
{/if}

<style>
  /* ===== mcp-server-detail.html, ".panel[data-panel=tools]" transcribed.
     Design values that no --gx-* token already carried live in app.css as
     --gx-mcpd-*. ===== */
  button {
    padding: 0;
    border: 0;
    border-radius: 0;
    background: none;
    box-shadow: none;
    color: inherit;
    font: inherit;
    line-height: normal;
    cursor: pointer;
    transition: none;
  }

  button:hover,
  button:active {
    transform: none;
    box-shadow: none;
    background: none;
  }

  .panel {
    border-radius: 18px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 18px;
    align-self: stretch;
    font-family: var(--gx-font);
  }

  .section-label {
    font-family: var(--gx-font-display);
    font-weight: 700;
    font-size: 18px;
    line-height: 100%;
    color: var(--gx-org-ink);
  }

  /* ---------------- ".tool-list" ---------------- */
  .tool-list {
    border-radius: 18px;
    display: flex;
    flex-direction: column;
    align-self: stretch;
  }

  /* Rows overlap by a pixel so neighbours share one hairline. */
  .tool-row {
    min-height: 72px;
    background: var(--gx-surface);
    border: 1px solid var(--gx-mcpd-tool-edge);
    margin-top: -1px;
    display: flex;
    gap: 16px;
    padding: 12px 16px;
    justify-content: space-between;
    align-items: center;
  }

  .tool-row:first-child {
    margin-top: 0;
    border-start-start-radius: 18px;
    border-start-end-radius: 18px;
  }

  .tool-row:last-child {
    border-end-start-radius: 18px;
    border-end-end-radius: 18px;
  }

  .tool-identity {
    display: flex;
    gap: 16px;
    align-items: center;
    min-width: 0;
    flex: 1 1 auto;
  }

  .tool-icon {
    width: 40px;
    height: 40px;
    border-radius: 12px;
    background: var(--gx-mcpd-tool-icon-bg);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--gx-mcpd-tool-icon-fg);
    flex-shrink: 0;
  }

  .tool-bullet {
    display: flex;
    gap: 8px;
    align-items: center;
    min-width: 0;
  }

  .tool-bullet-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--gx-nav-active-fg);
    flex-shrink: 0;
  }

  .tool-name {
    font-family: var(--gx-font-display);
    font-weight: 400;
    font-size: 13px;
    line-height: 1.3;
    color: var(--gx-mcpd-tool-ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tool-controls {
    display: flex;
    gap: 12px;
    align-items: center;
    flex-shrink: 0;
  }

  .tool-badge {
    border-radius: 4px;
    padding: 2px 6px;
    font-family: var(--gx-font-display);
    font-weight: 700;
    font-size: 10px;
    line-height: 1.4;
    letter-spacing: 0.3px;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .tool-badge--proxy {
    color: var(--gx-mcpd-warn-fg);
  }

  .tool-badge--active {
    color: var(--gx-nav-active-fg);
  }

  .tool-settings {
    width: 36px;
    height: 36px;
    border-radius: 12px;
    box-shadow: inset 0 0 0 1px var(--gx-mcpd-ctrl-ring);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--gx-an-sub);
    flex-shrink: 0;
    transition: background-color 120ms ease;
  }

  .tool-settings:hover {
    background: var(--gx-an-field-bg);
  }

  .tool-settings:focus-visible {
    outline: 2px solid var(--gx-tx-accent);
    outline-offset: 2px;
  }

  /* ---------------- ".tools-empty" ---------------- */
  .tools-empty {
    border-radius: 12px;
    background: var(--gx-an-field-bg);
    box-shadow: inset 0 0 0 1px var(--gx-ring-soft);
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 44px;
    align-items: center;
    justify-content: center;
    align-self: stretch;
    text-align: center;
  }

  .rules-empty-title {
    font-family: var(--gx-font-display);
    font-weight: 600;
    font-size: 13px;
    line-height: 100%;
    color: var(--gx-org-ink);
  }

  .rules-empty-desc {
    font-weight: 400;
    font-size: 12px;
    line-height: 1.4;
    color: var(--gx-an-sub);
  }

  @media (max-width: 640px) {
    .panel {
      padding: 16px;
    }

    .tool-row {
      flex-direction: column;
      align-items: flex-start;
      gap: 12px;
    }

    .tool-controls {
      align-self: flex-end;
    }

    .tools-empty {
      padding: 28px 20px;
    }
  }
</style>
