import {
  isTauriRuntime,
  NATIVE_OAUTH_CALLBACK_EVENT,
  readNativeDeepLinkCurrent,
  resolveOAuthCallbackFromDeepLink,
} from '$lib/platform/tauri';
import {
  clearPendingOAuth,
  hasPendingOAuth,
  isOAuthCallbackConsumed,
  oauthCallbackKey,
  readPendingOAuth,
} from './pendingOAuth';

type CallbackListener = (path: string) => void;
type Cleanup = () => void;

/**
 * Native OAuth callbacks arrive as a single fire-and-forget
 * `deep-link://new-url` event. Nothing redelivers it, so any moment where the
 * WebView is not listening loses the login: Android routinely destroys or
 * reloads the WebView while the system browser is in the foreground, and the
 * intent lands during that window.
 *
 * This module makes delivery recoverable instead of best-effort:
 *
 *  - Listening starts before the Svelte app mounts (`main.ts`), so a cold start
 *    from an `msauth://` intent is not racing i18n loading, and subscribers that
 *    attach later still get the callback replayed.
 *  - `getCurrent()` — which the plugin keeps up to date from `onNewIntent` even
 *    when the event is dropped — is re-read on every resume, and polled on a
 *    bounded schedule while a handshake is outstanding.
 *  - Replays are suppressed per authorization code, in memory and in storage,
 *    because Azure codes are single-use.
 */

/** Bursts after a resume: Android may deliver the intent just after we wake. */
const RESUME_POLL_DELAYS_MS = [0, 250, 750, 1500, 3000];
/** Steady-state safety net while a handshake is outstanding. */
const PENDING_POLL_INTERVAL_MS = 2000;
const PENDING_POLL_MAX_ATTEMPTS = 60;

const listeners = new Set<CallbackListener>();
const handledDeepLinkUrls = new Set<string>();

let started = false;
let retainedCallbackPath: string | null = null;
let cleanups: Cleanup[] = [];
let pendingPollTimer: ReturnType<typeof setTimeout> | null = null;
let pendingPollAttempts = 0;
let resumeBurstTimers: ReturnType<typeof setTimeout>[] = [];

function emitCallbackPath(path: string): void {
  retainedCallbackPath = path;

  // Put the route in the address bar before notifying, so any listener that
  // reads `window.location` sees the callback URL.
  window.history.replaceState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));

  for (const listener of listeners) {
    try {
      listener(path);
    } catch (err) {
      console.error('Native OAuth callback listener failed:', err);
    }
  }
}

/**
 * How a URL reached us. An event is always a URL that just arrived. A polled
 * value is whatever intent the plugin saw last — which after a completed login
 * is the *previous* callback, replayed indefinitely. So polled URLs are only
 * trusted while a handshake we started is still outstanding.
 */
type DeepLinkSource = 'event' | 'poll';

function handleDeepLinkUrl(url: string, source: DeepLinkSource): boolean {
  if (!url || handledDeepLinkUrls.has(url)) {
    return false;
  }

  const pending = readPendingOAuth();

  if (source === 'poll' && !pending) {
    return false;
  }

  const resolved = resolveOAuthCallbackFromDeepLink(url, pending?.provider ?? null);

  if (!resolved) {
    // Not an OAuth callback (launcher intent, unrelated deep link, …). Remember
    // it so we stop re-parsing it on every poll.
    handledDeepLinkUrls.add(url);
    return false;
  }

  handledDeepLinkUrls.add(url);

  // A WebView reload clears the in-memory set above, so the durable ledger is
  // what stops us re-POSTing an authorization code the provider already burned —
  // which would report a completed login as a failure.
  if (
    resolved.state &&
    isOAuthCallbackConsumed(oauthCallbackKey(resolved.provider, resolved.state))
  ) {
    stopPendingPoll();
    clearPendingOAuth();
    return false;
  }

  stopPendingPoll();
  emitCallbackPath(resolved.path);
  return true;
}

function handleDeepLinkUrls(
  urls: string[] | null | undefined,
  source: DeepLinkSource
): boolean {
  if (!urls?.length) return false;

  for (const url of urls) {
    if (handleDeepLinkUrl(url, source)) {
      return true;
    }
  }

  return false;
}

async function pollNativeDeepLink(): Promise<boolean> {
  return handleDeepLinkUrls(await readNativeDeepLinkCurrent(), 'poll');
}

function stopPendingPoll(): void {
  if (pendingPollTimer != null) {
    clearTimeout(pendingPollTimer);
    pendingPollTimer = null;
  }

  pendingPollAttempts = 0;
}

/**
 * Keep checking for a callback that never produced an event. Self-limiting: it
 * stops as soon as a callback is handled, the pending record expires or is
 * cleared, or the attempt budget runs out.
 */
function schedulePendingPoll(): void {
  if (pendingPollTimer != null || !hasPendingOAuth()) {
    return;
  }

  pendingPollTimer = setTimeout(() => {
    pendingPollTimer = null;
    pendingPollAttempts += 1;

    if (!hasPendingOAuth() || pendingPollAttempts >= PENDING_POLL_MAX_ATTEMPTS) {
      pendingPollAttempts = 0;
      return;
    }

    void pollNativeDeepLink().then((handled) => {
      if (!handled) schedulePendingPoll();
    });
  }, PENDING_POLL_INTERVAL_MS);
}

function clearResumeBurst(): void {
  for (const timer of resumeBurstTimers) {
    clearTimeout(timer);
  }

  resumeBurstTimers = [];
}

/**
 * Re-read the native intent when the app comes back to the foreground. This is
 * the path that actually rescues the common failure: the browser redirected, the
 * app resumed, but the `deep-link://new-url` event had nowhere to land.
 */
function handleResume(): void {
  clearResumeBurst();

  // A handshake we started ourselves is the case worth retrying hard: the intent
  // can land a moment after the WebView wakes. Otherwise one check is enough.
  const delays = hasPendingOAuth() ? RESUME_POLL_DELAYS_MS : [0];

  resumeBurstTimers = delays.map((delay) =>
    setTimeout(() => {
      void pollNativeDeepLink().then((handled) => {
        if (handled) {
          clearResumeBurst();
          return;
        }

        schedulePendingPoll();
      });
    }, delay)
  );
}

function handleVisibilityChange(): void {
  if (document.visibilityState === 'visible') {
    handleResume();
  }
}

/**
 * Begin watching for native OAuth deep links. Idempotent — call as early as
 * possible during startup.
 */
export function startNativeOAuthDeepLinks(): void {
  if (started || !isTauriRuntime()) {
    return;
  }

  started = true;

  window.addEventListener('focus', handleResume);
  window.addEventListener('pageshow', handleResume);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  cleanups.push(() => {
    window.removeEventListener('focus', handleResume);
    window.removeEventListener('pageshow', handleResume);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  });

  // Cold start: the launch intent is already recorded, and the event that
  // announced it fired before any JS existed.
  handleResume();

  void (async () => {
    try {
      const { onOpenUrl } = await import('@tauri-apps/plugin-deep-link');
      cleanups.push(await onOpenUrl((urls) => handleDeepLinkUrls(urls, 'event')));
    } catch (err) {
      console.error('Failed to subscribe to native OAuth deep links:', err);
    }

    try {
      const { listen } = await import('@tauri-apps/api/event');
      cleanups.push(
        await listen<string>(NATIVE_OAUTH_CALLBACK_EVENT, (event) =>
          handleDeepLinkUrls([event.payload], 'event')
        )
      );
    } catch (err) {
      console.error('Failed to subscribe to native OAuth popup callbacks:', err);
    }

    // The listeners above may have missed an intent that arrived while their
    // dynamic imports were in flight.
    await pollNativeDeepLink();
  })();
}

/**
 * Observe resolved OAuth callback routes. A callback resolved before the
 * subscriber attached is replayed immediately, so mount order cannot drop it.
 */
export function onNativeOAuthCallbackPath(listener: CallbackListener): Cleanup {
  listeners.add(listener);

  if (retainedCallbackPath) {
    try {
      listener(retainedCallbackPath);
    } catch (err) {
      console.error('Native OAuth callback listener failed:', err);
    }
  }

  return () => {
    listeners.delete(listener);
  };
}

/**
 * Called once a handshake reaches a terminal state so the recovery poll and the
 * resume burst stop running.
 */
export function notifyOAuthCallbackSettled(): void {
  stopPendingPoll();
  clearResumeBurst();
  retainedCallbackPath = null;
}

/** Start polling for a callback that the caller has just gone off to fetch. */
export function watchForPendingOAuthCallback(): void {
  if (!isTauriRuntime()) return;

  startNativeOAuthDeepLinks();
  schedulePendingPoll();
}

export function stopNativeOAuthDeepLinks(): void {
  stopPendingPoll();
  clearResumeBurst();

  for (const cleanup of cleanups) {
    try {
      cleanup();
    } catch {
      // Ignore teardown failures.
    }
  }

  cleanups = [];
  listeners.clear();
  started = false;
}
