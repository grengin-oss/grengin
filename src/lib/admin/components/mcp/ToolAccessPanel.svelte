<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { onMount } from 'svelte';
  import type { MCPServer, McpToolAccess } from '../../types.js';
  import { getServerToolsAccess } from '../../../api/admin/mcpServers.js';
  import ToolAccessModal from './ToolAccessModal.svelte';
  import LoadingSpinner from '../LoadingSpinner.svelte';
  import { toast } from '../../../components/Toaster.svelte';
  import { ApiError } from '../../../api/client.js';
  import { getLocalizedError } from '../../../utils/errorLocalization.js';
  import { _ } from 'svelte-i18n';

  interface Props {
    server: MCPServer;
  }

  let { server }: Props = $props();

  let toolsAccess = $state<McpToolAccess[]>([]);
  let isLoading = $state(false);
  let selectedToolId = $state<string | null>(null);
  let selectedToolName = $state('');
  let toolModalOpen = $state(false);

  onMount(() => {
    loadToolsAccess();
  });

  async function loadToolsAccess() {
    isLoading = true;
    try {
      toolsAccess = await getServerToolsAccess(server.id);
    } catch (err: any) {
      const msg = err instanceof ApiError ? getLocalizedError(err, 'description', $_) : err.message;
      toast.error(msg || $_('admin.mcpAccess.failedToLoadTools'));
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
    selectedToolName = '';
  }

  function handleToolSaved() {
    loadToolsAccess();
  }

  function getAccessStatusLabel(tool: McpToolAccess): string {
    if (tool.inherit_from_server) {
      return $_('admin.mcpAccess.toolStatus.inherit');
    }
    if (tool.rules.length === 0) {
      return $_('admin.mcpAccess.toolStatus.noRules');
    }
    return $_('admin.mcpAccess.toolStatus.custom', { values: { count: tool.rules.length } });
  }
</script>

<div class="tool-access-panel">
  {#if isLoading}
    <LoadingSpinner text={$_('admin.mcpAccess.loadingTools')} size="md" />
  {:else if toolsAccess.length === 0}
    <div class="empty-tools">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
      </svg>
      <p>{$_('admin.mcpAccess.noTools')}</p>
      <span class="empty-tools-hint">{$_('admin.mcpAccess.noToolsHint')}</span>
    </div>
  {:else}
    <div class="tools-header">
      <h3 class="tools-title">
        {$_('admin.mcpAccess.serverTools', { values: { count: toolsAccess.length } })}
      </h3>
    </div>
    <div class="tools-list">
      {#each toolsAccess as tool (tool.tool_id)}
        <div class="tool-row">
          <div class="tool-info">
            <div class="tool-name-row">
              <span class="tool-name">{tool.tool_name}</span>
              {#if !tool.inherit_from_server}
                <span class="tool-custom-badge">{$_('admin.mcpAccess.toolStatus.customBadge')}</span>
              {/if}
            </div>
          </div>
          <div class="tool-actions">
            <span
              class="tool-access-status"
              class:tool-access-status--inherit={tool.inherit_from_server}
              class:tool-access-status--custom={!tool.inherit_from_server}
            >
              {getAccessStatusLabel(tool)}
            </span>
            <button
              class="tool-config-btn"
              onclick={() => openToolModal(tool)}
              aria-label={$_('admin.mcpAccess.configureTool')}
              title={$_('admin.mcpAccess.configureTool')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </button>
          </div>
        </div>
      {/each}
    </div>
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
  .tool-access-panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .tools-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .tools-title {
    font-size: 0.9375rem;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0;
    letter-spacing: -0.01em;
  }

  .tools-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .tool-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-md);
    padding: var(--space-md) var(--space-lg);
    background: rgba(var(--glass-tint), 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: var(--radius-md);
    transition: all 0.2s ease;
  }

  .tool-row:hover {
    border-color: rgba(255, 255, 255, 0.1);
    background: rgba(var(--glass-tint), 0.05);
  }

  .tool-info {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
    min-width: 0;
    flex: 1;
  }

  .tool-name-row {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .tool-name {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary);
    font-family: 'SF Mono', 'Fira Code', 'Fira Mono', monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tool-custom-badge {
    display: inline-flex;
    padding: 1px var(--space-xs);
    font-size: 0.625rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    background: rgba(245, 158, 11, 0.12);
    color: #fbbf24;
    border-radius: var(--radius-sm);
    flex-shrink: 0;
  }

  .tool-actions {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    flex-shrink: 0;
  }

  .tool-access-status {
    font-size: 0.75rem;
    font-weight: 500;
    padding: var(--space-2xs) var(--space-sm);
    border-radius: var(--radius-sm);
    white-space: nowrap;
  }

  .tool-access-status--inherit {
    color: var(--text-tertiary);
    background: rgba(var(--glass-tint), 0.04);
  }

  .tool-access-status--custom {
    color: #fbbf24;
    background: rgba(245, 158, 11, 0.1);
  }

  .tool-config-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .tool-config-btn:hover {
    border-color: rgba(255, 255, 255, 0.16);
    color: var(--text-primary);
    background: rgba(var(--glass-tint), 0.05);
  }

  .empty-tools {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-2xl) var(--space-lg);
    text-align: center;
    color: var(--text-tertiary);
  }

  .empty-tools svg {
    opacity: 0.3;
  }

  .empty-tools p {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-secondary);
    margin: 0;
  }

  .empty-tools-hint {
    font-size: 0.75rem;
    color: var(--text-tertiary);
  }

  @media (max-width: 640px) {
    .tool-row {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-sm);
    }

    .tool-actions {
      align-self: flex-end;
    }
  }

  @media (prefers-color-scheme: light) {
    .tool-row {
      border-color: rgba(0, 0, 0, 0.08);
      background: rgba(0, 0, 0, 0.02);
    }

    .tool-row:hover {
      border-color: rgba(0, 0, 0, 0.12);
      background: rgba(0, 0, 0, 0.03);
    }
  }
</style>
