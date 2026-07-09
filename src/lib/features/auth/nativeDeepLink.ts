import {
  getInternalOAuthCallbackFromDeepLink,
  isTauriRuntime,
  NATIVE_OAUTH_CALLBACK_EVENT,
} from '$lib/platform/tauri';

type Cleanup = () => void;

function openInternalCallback(path: string, onCallbackPath: (path: string) => void): void {
  window.history.replaceState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
  onCallbackPath(path);
}

function handleDeepLinkUrls(urls: string[] | null, onCallbackPath: (path: string) => void): void {
  if (!urls?.length) {
    return;
  }

  for (const url of urls) {
    const callbackPath = getInternalOAuthCallbackFromDeepLink(url);
    if (callbackPath) {
      openInternalCallback(callbackPath, onCallbackPath);
      return;
    }
  }
}

export async function initNativeOAuthDeepLinks(
  onCallbackPath: (path: string) => void
): Promise<Cleanup> {
  if (!isTauriRuntime()) {
    return () => {};
  }

  const cleanups: Cleanup[] = [];

  try {
    const { getCurrent, onOpenUrl } = await import('@tauri-apps/plugin-deep-link');

    handleDeepLinkUrls(await getCurrent(), onCallbackPath);

    const unlisten = await onOpenUrl((urls) => {
      handleDeepLinkUrls(urls, onCallbackPath);
    });

    cleanups.push(unlisten);
  } catch (err) {
    console.error('Failed to initialize native OAuth deep links:', err);
  }

  try {
    const { listen } = await import('@tauri-apps/api/event');

    const unlistenPopupCallback = await listen<string>(NATIVE_OAUTH_CALLBACK_EVENT, (event) => {
      handleDeepLinkUrls([event.payload], onCallbackPath);
    });

    cleanups.push(unlistenPopupCallback);
  } catch (err) {
    console.error('Failed to initialize native OAuth popup listener:', err);
  }

  return () => {
    for (const cleanup of cleanups) {
      cleanup();
    }
  };
}
