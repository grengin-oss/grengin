export const NATIVE_OAUTH_SCHEME = 'com.grengin.community';
export const NATIVE_OAUTH_HOST = 'auth';
export const NATIVE_OAUTH_CALLBACK_EVENT = 'native-oauth-callback';
export const NATIVE_MCP_OAUTH_CALLBACK_EVENT = 'native-mcp-oauth-callback';

export const MICROSOFT_NATIVE_REDIRECT_URI =
  import.meta.env?.VITE_MICROSOFT_NATIVE_REDIRECT_URI ||
  import.meta.env?.VITE_AZURE_NATIVE_REDIRECT_URI ||
  'msauth://com.grengin.community/4lbQGs7PEMRuhdjcxdQhBokVsqE%3D';

const nativeCallbackPath = /^\/([^/?#]+)\/callback\/?$/;
const nativePathCallbackPath = /^\/auth\/([^/?#]+)\/callback\/?$/;

/**
 * The backend exposes exactly one mobile (public-client) callback route,
 * `/auth/azure/mobile/callback`. Entra tenants are configured under either
 * `azure` or `microsoft` depending on the deployment, so collapse both onto the
 * route that actually exists — otherwise the exchange POSTs into a 404.
 */
export function normalizeMobileCallbackProvider(provider: string): string {
  return provider.toLowerCase() === 'microsoft' ? 'azure' : provider.toLowerCase();
}

export interface NativeOAuthCallback {
  /** In-app route to hand to the router, query/hash included. */
  path: string;
  provider: string;
  state: string | null;
  mobile: boolean;
}

export function isTauriRuntime(): boolean {
  if (typeof window === 'undefined') return false;

  return (
    Object.prototype.hasOwnProperty.call(window, '__TAURI_INTERNALS__') ||
    window.location.protocol === 'tauri:' ||
    window.location.hostname === 'tauri.localhost'
  );
}

export function getNativeOAuthRedirectUri(provider: string): string {
  const normalizedProvider = provider.toLowerCase();

  if (normalizedProvider === 'microsoft' || normalizedProvider === 'azure') {
    return MICROSOFT_NATIVE_REDIRECT_URI;
  }

  return `${NATIVE_OAUTH_SCHEME}://${NATIVE_OAUTH_HOST}/${encodeURIComponent(provider)}/callback`;
}

export function getOAuthRedirectUri(
  provider: string,
  explicitRedirectUri?: string,
  webRedirectOrigin?: string
): string {
  if (explicitRedirectUri) return explicitRedirectUri;

  if (isTauriRuntime()) {
    return getNativeOAuthRedirectUri(provider);
  }

  const origin = webRedirectOrigin || window.location.origin;
  return `${origin}/auth/${encodeURIComponent(provider)}/callback`;
}

export function shouldUseNativeExternalOAuth(provider: string): boolean {
  const normalizedProvider = provider.toLowerCase();
  return normalizedProvider === 'microsoft' || normalizedProvider === 'azure';
}

/**
 * Params an OAuth callback can carry, across query string and hash fragment.
 * A deep link without any of these is not a callback (e.g. the launcher intent,
 * or a stale URL the plugin still reports from `getCurrent()`), and acting on it
 * would push the user into a callback screen that can never complete.
 */
const OAUTH_RESULT_PARAMS = ['code', 'error', 'assertion', 'access_token', 'token', 'id_token'];

function readOAuthParams(parsed: URL): URLSearchParams[] {
  return [
    new URLSearchParams(parsed.search),
    new URLSearchParams(parsed.hash.replace(/^#/, '')),
  ];
}

function hasOAuthResult(parsed: URL): boolean {
  return readOAuthParams(parsed).some((params) =>
    OAUTH_RESULT_PARAMS.some((name) => params.get(name))
  );
}

function readOAuthState(parsed: URL): string | null {
  for (const params of readOAuthParams(parsed)) {
    const state = params.get('state');
    if (state) return state;
  }

  return null;
}

/**
 * Map a native deep link onto the in-app callback route.
 *
 * Pure by design: the caller supplies `fallbackProvider` (from the durable
 * pending-OAuth record) because `msauth://` URLs carry no provider of their own,
 * and reading storage here used to silently hardcode `azure`.
 */
export function resolveOAuthCallbackFromDeepLink(
  rawUrl: string,
  fallbackProvider: string | null
): NativeOAuthCallback | null {
  let parsed: URL;

  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }

  const isMicrosoftScheme = parsed.protocol === 'msauth:' || parsed.protocol === 'msauthv2:';
  const isAppScheme = parsed.protocol === `${NATIVE_OAUTH_SCHEME}:`;

  if (!isMicrosoftScheme && !isAppScheme) {
    return null;
  }

  if (!hasOAuthResult(parsed)) {
    return null;
  }

  const state = readOAuthState(parsed);

  // Microsoft / Entra callback: msauth://com.grengin.community/<signature-hash>?code=...
  // The path is the app's signing-certificate hash, not a provider, so the
  // provider has to come from the handshake we started.
  if (isMicrosoftScheme) {
    const provider = normalizeMobileCallbackProvider(fallbackProvider || 'azure');

    return {
      path: `/auth/${encodeURIComponent(provider)}/mobile/callback${parsed.search}${parsed.hash}`,
      provider,
      state,
      mobile: true,
    };
  }

  // App-scheme callback: com.grengin.community://auth/google/callback?code=...
  const hostPathMatch =
    parsed.hostname === NATIVE_OAUTH_HOST ? parsed.pathname.match(nativeCallbackPath) : null;

  const pathMatch = parsed.hostname === '' ? parsed.pathname.match(nativePathCallbackPath) : null;

  const rawProvider = hostPathMatch?.[1] || pathMatch?.[1];
  const provider = rawProvider ? decodeURIComponent(rawProvider) : fallbackProvider;

  if (!provider) return null;

  return {
    path: `/auth/${encodeURIComponent(provider)}/callback${parsed.search}${parsed.hash}`,
    provider,
    state,
    mobile: false,
  };
}

/**
 * Latest deep link the native plugin has seen.
 *
 * On Android the plugin records every `ACTION_VIEW` intent in `onNewIntent` and
 * *also* fires a one-shot `deep-link://new-url` event. The event is dropped if
 * the WebView is not listening at that instant (cold start, reload, or a JS
 * context torn down while backgrounded), but this value survives — which makes
 * polling it the recovery path for a lost event.
 */
export async function readNativeDeepLinkCurrent(): Promise<string[]> {
  if (!isTauriRuntime()) return [];

  try {
    const { getCurrent } = await import('@tauri-apps/plugin-deep-link');
    const urls = await getCurrent();
    return urls?.filter((url): url is string => typeof url === 'string' && url.length > 0) ?? [];
  } catch (err) {
    console.debug('Failed to read current native deep link:', err);
    return [];
  }
}

export async function openNativeOAuthPopup(url: string): Promise<boolean> {
  if (!isTauriRuntime()) return false;

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('open_oauth_popup', { url });
    return true;
  } catch (err) {
    console.error('Failed to open OAuth popup in Grengin:', err);
    return false;
  }
}

export async function openNativeExternalUrl(url: string): Promise<boolean> {
  if (!isTauriRuntime()) return false;

  try {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
    return true;
  } catch (err) {
    console.error('Failed to open OAuth URL externally:', err);
    return false;
  }
}
