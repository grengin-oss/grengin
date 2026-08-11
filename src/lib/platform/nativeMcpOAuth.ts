import { mcpOAuthCallback } from '$lib/api/integrations';
import {
  isTauriRuntime,
  NATIVE_MCP_OAUTH_CALLBACK_EVENT,
  openNativeOAuthPopup,
} from '$lib/platform/tauri';

const MCP_OAUTH_TIMEOUT_MS = 5 * 60_000;
const defaultNativeMcpOAuthRedirectOrigin =
  import.meta.env?.VITE_MCP_OAUTH_REDIRECT_ORIGIN?.replace(/\/$/, '') ||
  'https://demo.devel.grengin.com';

export type NativeMcpOAuthResult = {
  success: boolean;
  serverId?: string;
  error?: string;
};

export function getMcpOAuthRedirectUrl(): string {
  const origin = isTauriRuntime()
    ? defaultNativeMcpOAuthRedirectOrigin
    : window.location.origin;

  return `${origin}/mcp/oauth/callback`;
}

function parseCallbackParams(rawUrl: string): {
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
} {
  const parsed = new URL(rawUrl);

  return {
    code: parsed.searchParams.get('code') ?? undefined,
    state: parsed.searchParams.get('state') ?? undefined,
    error: parsed.searchParams.get('error') ?? undefined,
    error_description: parsed.searchParams.get('error_description') ?? undefined,
  };
}

function callbackErrorMessage(params: ReturnType<typeof parseCallbackParams>): string | null {
  return params.error_description || params.error || null;
}

export async function openNativeMcpOAuth(authUrl: string): Promise<NativeMcpOAuthResult | null> {
  if (!isTauriRuntime()) {
    return null;
  }

  const { listen } = await import('@tauri-apps/api/event');

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let unlistenCallback: (() => void) | null = null;
  let settled = false;
  let settleResult: (value: NativeMcpOAuthResult) => void = () => {};

  const cleanup = () => {
    if (timeoutId != null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    unlistenCallback?.();
    unlistenCallback = null;
  };

  const result = new Promise<NativeMcpOAuthResult>((resolve) => {
    settleResult = (value: NativeMcpOAuthResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    timeoutId = setTimeout(() => {
      settleResult({ success: false, error: 'OAuth timed out. Please try again.' });
    }, MCP_OAUTH_TIMEOUT_MS);
  });

  unlistenCallback = await listen<string>(NATIVE_MCP_OAUTH_CALLBACK_EVENT, async (event) => {
    try {
      const params = parseCallbackParams(event.payload);
      const providerError = callbackErrorMessage(params);

      if (!params.state) {
        settleResult({ success: false, error: providerError || 'OAuth callback is missing state.' });
        return;
      }

      if (providerError) {
        try {
          await mcpOAuthCallback(params);
        } catch {
          // Preserve the provider-facing error; it is usually more useful here.
        }
        settleResult({ success: false, serverId: params.state, error: providerError });
        return;
      }

      const response = await mcpOAuthCallback(params);
      settleResult({
        success: Boolean(response.success),
        serverId: response.server_id || params.state,
        error: response.success ? undefined : response.status,
      });
    } catch (err) {
      settleResult({
        success: false,
        error: err instanceof Error ? err.message : 'OAuth callback failed.',
      });
    }
  });

  const opened = await openNativeOAuthPopup(authUrl);
  if (!opened) {
    cleanup();
    return { success: false, error: 'Failed to open OAuth window.' };
  }

  return result;
}
