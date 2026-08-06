<script lang="ts">
  import type { McpAuthRequest } from '../../../types/chat';
  import { authorizeMcpConnection, getMcpConnections } from '../../../api/integrations.js';
  import { _ } from 'svelte-i18n';
  import { openNativeMcpOAuth } from '$lib/platform/nativeMcpOAuth';

  interface Props {
    authRequest: McpAuthRequest;
    onConnected: (serverId: string) => void;
    onError: (serverId: string, error: string) => void;
    onStatusChange: (serverId: string, status: McpAuthRequest['status']) => void;
    onDismiss?: (serverId: string) => void;
  }

  let { authRequest, onConnected, onError, onStatusChange, onDismiss }: Props = $props();

  let dismissed = $state(false);

  function handleDismiss() {
    dismissed = true;
    onDismiss?.(authRequest.server_id);
  }

  let popupWindow: Window | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  async function handleConnect() {
    onStatusChange(authRequest.server_id, 'connecting');

    try {
      let authUrl = authRequest.authorization_url;

      if (!authUrl) {
        const response = await authorizeMcpConnection(authRequest.server_id);
        if (!response?.authorization_url) {
          throw new Error($_('chat.mcpAuth.failedToGetAuthUrl'));
        }
        authUrl = response.authorization_url;
      }

      const nativeResult = await openNativeMcpOAuth(authUrl);
      if (nativeResult) {
        if (nativeResult.success) {
          await verifyConnectionStatus();
        } else {
          onError(authRequest.server_id, nativeResult.error || $_('chat.mcpAuth.connectionFailed'));
        }
        return;
      }

      const width = 600;
      const height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;

      popupWindow = window.open(
        authUrl,
        `mcp_oauth_${authRequest.server_id}`,
        `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes,resizable=yes`
      );

      if (!popupWindow) {
        throw new Error($_('chat.mcpAuth.popupBlocked'));
      }

      startPolling();
    } catch (err: any) {
      const message = err?.message || $_('chat.mcpAuth.connectionFailed');
      onError(authRequest.server_id, message);
    }
  }

  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);

    pollTimer = setInterval(() => {
      if (!popupWindow || popupWindow.closed) {
        cleanup();
        // Don't blindly trust that closing the popup means success. The popup
        // can close after an OAuth failure (e.g. provider error, callback
        // backend 5xx, or user cancellation). Verify by querying the backend
        // for the current connection status before declaring success.
        verifyConnectionStatus();
      }
    }, 500);
  }

  async function verifyConnectionStatus() {
    onStatusChange(authRequest.server_id, 'connecting');
    try {
      const { connections } = await getMcpConnections();
      const conn = connections?.find((c) => c.server_id === authRequest.server_id);
      if (conn && conn.connected && conn.status === 'connected') {
        onConnected(authRequest.server_id);
      } else {
        onError(authRequest.server_id, $_('chat.mcpAuth.connectionFailed'));
      }
    } catch (err: any) {
      onError(
        authRequest.server_id,
        err?.message || $_('chat.mcpAuth.connectionFailed')
      );
    }
  }

  function cleanup() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (popupWindow && !popupWindow.closed) {
      popupWindow.close();
    }
    popupWindow = null;
  }

  function handleMessageEvent(event: MessageEvent) {
    if (event.data?.type === 'mcp_oauth_callback' && event.data?.server_id === authRequest.server_id) {
      cleanup();
      if (event.data.success) {
        onConnected(authRequest.server_id);
      } else {
        onError(authRequest.server_id, event.data.error || $_('chat.mcpAuth.connectionFailed'));
      }
    }
  }

  $effect(() => {
    window.addEventListener('message', handleMessageEvent);
    return () => {
      window.removeEventListener('message', handleMessageEvent);
      cleanup();
    };
  });
</script>

{#if dismissed}
  <!-- Dismissed by user -->
{:else if authRequest.status === 'connected'}
  <div class="mcp-auth-prompt mcp-auth-prompt--connected" role="status" aria-label={$_('chat.mcpAuth.connectedTo', { values: { name: authRequest.server_name } })}>
    <div class="mcp-auth-icon mcp-auth-icon--success">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <circle cx="12" cy="12" r="10" fill="var(--brand-green)" stroke="var(--brand-green)"></circle>
        <polyline points="8 12 11 15 16 9" stroke="white"></polyline>
      </svg>
    </div>
    <div class="mcp-auth-body">
      <span class="mcp-auth-connected-text">
        {$_('chat.mcpAuth.connectedTo', { values: { name: authRequest.server_name } })}
      </span>
    </div>
  </div>
{:else if authRequest.status === 'error'}
  <div class="mcp-auth-prompt mcp-auth-prompt--error" role="alert">
    <div class="mcp-auth-icon mcp-auth-icon--error">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
    </div>
    <div class="mcp-auth-body">
      <span class="mcp-auth-title">{$_('chat.mcpAuth.connectionFailed')}</span>
      {#if authRequest.error}
        <span class="mcp-auth-error-detail">{authRequest.error}</span>
      {/if}
      <button class="mcp-auth-retry-btn" onclick={handleConnect} aria-label={$_('chat.mcpAuth.retry')}>
        {$_('chat.mcpAuth.retry')}
      </button>
    </div>
  </div>
{:else}
  <div class="mcp-auth-prompt" role="region" aria-label={$_('chat.mcpAuth.connectTo', { values: { name: authRequest.server_name } })}>
    <div class="mcp-auth-header">
      <div class="mcp-auth-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M13.828 10.172a4 4 0 0 0-5.656 0l-4 4a4 4 0 1 0 5.656 5.656l1.102-1.101"/>
          <path d="M10.172 13.828a4 4 0 0 0 5.656 0l4-4a4 4 0 0 0-5.656-5.656l-1.1 1.1"/>
        </svg>
      </div>
      <span class="mcp-auth-title">
        {$_('chat.mcpAuth.connectTo', { values: { name: authRequest.server_name } })}
      </span>
    </div>
    <div class="mcp-auth-body">
      <p class="mcp-auth-description">
        {$_('chat.mcpAuth.description', { values: { tool: authRequest.tool_name, name: authRequest.server_name } })}
      </p>
      {#if authRequest.scopes && authRequest.scopes.length > 0}
        <div class="mcp-auth-scopes">
          <span class="mcp-auth-scopes-label">{$_('chat.mcpAuth.requestedPermissions')}</span>
          <ul class="mcp-auth-scopes-list">
            {#each authRequest.scopes as scope}
              <li>{scope}</li>
            {/each}
          </ul>
        </div>
      {/if}
      <button
        class="mcp-auth-connect-btn"
        onclick={handleConnect}
        disabled={authRequest.status === 'connecting'}
        aria-label={$_('chat.mcpAuth.connectAccount', { values: { name: authRequest.server_name } })}
      >
        {#if authRequest.status === 'connecting'}
          <span class="mcp-auth-spinner"></span>
          <span>{$_('chat.mcpAuth.connecting')}</span>
        {:else}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M13.828 10.172a4 4 0 0 0-5.656 0l-4 4a4 4 0 1 0 5.656 5.656l1.102-1.101"/>
            <path d="M10.172 13.828a4 4 0 0 0 5.656 0l4-4a4 4 0 0 0-5.656-5.656l-1.1 1.1"/>
          </svg>
          <span>{$_('chat.mcpAuth.connectAccount', { values: { name: authRequest.server_name } })}</span>
        {/if}
      </button>
      <div class="mcp-auth-actions">
        <p class="mcp-auth-footer">
          {$_('chat.mcpAuth.manageInSettings')}
        </p>
        <button
          class="mcp-auth-dismiss-btn"
          onclick={handleDismiss}
          aria-label={$_('chat.mcpAuth.notNow')}
        >
          {$_('chat.mcpAuth.notNow')}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .mcp-auth-prompt {
    border: 1px solid var(--glass-stroke-light);
    border-radius: 0.75rem;
    background: var(--surface-elevated);
    overflow: hidden;
    animation: fadeInUp 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .mcp-auth-prompt--connected {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.75rem 1rem;
    border-color: color-mix(in oklab, var(--brand-green) 30%, transparent);
    background: color-mix(in oklab, var(--brand-green) 5%, var(--surface-elevated));
  }

  .mcp-auth-prompt--error {
    border-color: color-mix(in oklab, var(--brand-red) 30%, transparent);
    background: color-mix(in oklab, var(--brand-red) 3%, var(--surface-elevated));
    padding: 0.75rem 1rem;
    display: flex;
    align-items: flex-start;
    gap: 0.625rem;
  }

  .mcp-auth-header {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--glass-stroke-light);
  }

  .mcp-auth-icon {
    flex-shrink: 0;
    color: var(--text-secondary);
    display: flex;
    align-items: center;
  }

  .mcp-auth-icon--success {
    color: var(--brand-green);
  }

  .mcp-auth-icon--error {
    color: var(--brand-red);
  }

  .mcp-auth-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .mcp-auth-body {
    padding: 0.75rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
  }

  .mcp-auth-prompt--connected .mcp-auth-body,
  .mcp-auth-prompt--error .mcp-auth-body {
    padding: 0;
    flex: 1;
  }

  .mcp-auth-description {
    font-size: 0.8125rem;
    color: var(--text-secondary);
    line-height: 1.5;
    margin: 0;
  }

  .mcp-auth-connect-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 0.5rem;
    background: var(--brand);
    color: white;
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
    align-self: flex-start;
  }

  .mcp-auth-connect-btn:hover:not(:disabled) {
    background: var(--brand-hover);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(var(--brand-rgb), 0.3);
  }

  .mcp-auth-connect-btn:active:not(:disabled) {
    transform: translateY(0);
  }

  .mcp-auth-connect-btn:disabled {
    opacity: 0.7;
    cursor: wait;
  }

  .mcp-auth-retry-btn {
    display: inline-flex;
    align-items: center;
    padding: 0.375rem 0.75rem;
    border: 1px solid var(--glass-stroke-light);
    border-radius: 0.375rem;
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    align-self: flex-start;
  }

  .mcp-auth-retry-btn:hover {
    background: var(--surface-subtle);
    color: var(--text-primary);
  }

  .mcp-auth-connected-text {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--brand-green);
  }

  .mcp-auth-error-detail {
    font-size: 0.75rem;
    color: var(--brand-red);
    opacity: 0.8;
  }

  .mcp-auth-scopes {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .mcp-auth-scopes-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-secondary);
  }

  .mcp-auth-scopes-list {
    margin: 0;
    padding: 0 0 0 1.25rem;
    font-size: 0.75rem;
    color: var(--text-secondary);
    line-height: 1.6;
  }

  .mcp-auth-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .mcp-auth-footer {
    font-size: 0.6875rem;
    color: var(--text-tertiary);
    margin: 0;
  }

  .mcp-auth-dismiss-btn {
    display: inline-flex;
    align-items: center;
    padding: 0.25rem 0.625rem;
    border: 1px solid var(--glass-stroke-light);
    border-radius: 0.375rem;
    background: transparent;
    color: var(--text-tertiary);
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .mcp-auth-dismiss-btn:hover {
    background: var(--surface-subtle);
    color: var(--text-secondary);
    border-color: var(--glass-stroke);
  }

  .mcp-auth-dismiss-btn:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }

  .mcp-auth-spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
    flex-shrink: 0;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 768px) {
    .mcp-auth-header {
      padding: 0.625rem 0.875rem;
    }

    .mcp-auth-body {
      padding: 0.625rem 0.875rem;
    }

    .mcp-auth-connect-btn {
      width: 100%;
      justify-content: center;
    }
  }
</style>
