export const NATIVE_OAUTH_SCHEME = 'com.grengin.community';
export const NATIVE_OAUTH_HOST = 'auth';
export const NATIVE_OAUTH_CALLBACK_EVENT = 'native-oauth-callback';

export const MICROSOFT_NATIVE_REDIRECT_URI =
  import.meta.env?.VITE_MICROSOFT_NATIVE_REDIRECT_URI ||
  import.meta.env?.VITE_AZURE_NATIVE_REDIRECT_URI ||
  'msauth://com.grengin.community/4lbQGs7PEMRuhdjcxdQhBokVsqE%3D';

const nativeCallbackPath = /^\/([^/?#]+)\/callback\/?$/;
const nativePathCallbackPath = /^\/auth\/([^/?#]+)\/callback\/?$/;

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

export function getInternalOAuthCallbackFromDeepLink(rawUrl: string): string | null {
  let parsed: URL;

  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }

  // Microsoft / Azure callback:
  // msauth://com.grengin.community/<hash>?code=...
  if (parsed.protocol === 'msauth:') {
    const provider = sessionStorage.getItem('oauth_provider') || 'azure';
    sessionStorage.setItem('oauth_provider', provider);
    sessionStorage.setItem('oauth_mobile_callback', 'true');
    return `/auth/${encodeURIComponent(provider)}/mobile/callback${parsed.search}${parsed.hash}`;
  }

  // Normal app callback:
  // com.grengin.community://auth/google/callback
  if (parsed.protocol !== `${NATIVE_OAUTH_SCHEME}:`) {
    return null;
  }

  const hostPathMatch =
    parsed.hostname === NATIVE_OAUTH_HOST ? parsed.pathname.match(nativeCallbackPath) : null;

  const pathMatch =
    parsed.hostname === '' ? parsed.pathname.match(nativePathCallbackPath) : null;

  const provider = hostPathMatch?.[1] || pathMatch?.[1];

  if (!provider) return null;

  const decodedProvider = decodeURIComponent(provider);
  sessionStorage.setItem('oauth_provider', decodedProvider);

  return `/auth/${encodeURIComponent(decodedProvider)}/callback${parsed.search}${parsed.hash}`;
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
