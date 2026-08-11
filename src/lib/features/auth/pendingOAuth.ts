/**
 * Durable bookkeeping for an in-flight OAuth handshake.
 *
 * The native (Android/iOS) flow hands control to the system browser, which puts
 * this app in the background. Android is free to tear down the WebView — or the
 * whole process — while the user types their password, so `sessionStorage` is
 * routinely empty by the time the `msauth://` deep link brings us back. Anything
 * the callback needs to complete the exchange has to survive that, so it lives
 * in `localStorage` instead.
 *
 * A second job: the deep-link plugin only remembers the *last* intent URL and
 * hands back the same one on every `getCurrent()` call. Since we poll it to
 * recover dropped events (see `nativeDeepLink.ts`), we need a record of which
 * authorization codes were already redeemed that outlives a WebView reload —
 * Azure codes are single-use, so replaying one turns a successful login into an
 * error toast.
 */

export interface PendingOAuth {
  provider: string;
  /** Whether the exchange must go through the mobile (public-client) callback. */
  mobile: boolean;
  returnUrl: string;
  startedAt: number;
}

const PENDING_KEY = 'grengin_pending_oauth';
const CONSUMED_KEY = 'grengin_consumed_oauth_callbacks';

/** How long a browser round-trip may take before we stop expecting a callback. */
const PENDING_TTL_MS = 15 * 60 * 1000;
const CONSUMED_TTL_MS = 60 * 60 * 1000;
const CONSUMED_MAX_ENTRIES = 25;

interface ConsumedEntry {
  key: string;
  at: number;
}

function getStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    // Storage can be disabled or throw in a partitioned/native WebView context.
    return null;
  }
}

function readJson<T>(key: string): T | null {
  const raw = getStorage()?.getItem(key);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    getStorage()?.setItem(key, JSON.stringify(value));
  } catch {
    // Best effort — the in-memory guards still cover the common case.
  }
}

function removeKey(key: string): void {
  try {
    getStorage()?.removeItem(key);
  } catch {
    // Ignore.
  }
}

export function savePendingOAuth(record: Omit<PendingOAuth, 'startedAt'>): void {
  writeJson(PENDING_KEY, { ...record, startedAt: Date.now() } satisfies PendingOAuth);
}

export function readPendingOAuth(): PendingOAuth | null {
  const record = readJson<Partial<PendingOAuth>>(PENDING_KEY);

  if (!record?.provider || typeof record.startedAt !== 'number') {
    return null;
  }

  if (Date.now() - record.startedAt > PENDING_TTL_MS) {
    clearPendingOAuth();
    return null;
  }

  return {
    provider: record.provider,
    mobile: record.mobile === true,
    returnUrl: typeof record.returnUrl === 'string' ? record.returnUrl : '/',
    startedAt: record.startedAt,
  };
}

export function hasPendingOAuth(): boolean {
  return readPendingOAuth() != null;
}

export function clearPendingOAuth(): void {
  removeKey(PENDING_KEY);
}

/**
 * Identity of a single callback delivery. `state` is unique per handshake and is
 * what the backend validates, so it is the natural replay key.
 */
export function oauthCallbackKey(provider: string, state: string): string {
  return `${provider.toLowerCase()}:${state}`;
}

function readConsumed(): ConsumedEntry[] {
  const entries = readJson<ConsumedEntry[]>(CONSUMED_KEY);
  if (!Array.isArray(entries)) return [];

  const cutoff = Date.now() - CONSUMED_TTL_MS;
  return entries.filter(
    (entry): entry is ConsumedEntry =>
      typeof entry?.key === 'string' && typeof entry?.at === 'number' && entry.at > cutoff
  );
}

export function markOAuthCallbackConsumed(key: string): void {
  const entries = readConsumed().filter((entry) => entry.key !== key);
  entries.push({ key, at: Date.now() });
  writeJson(CONSUMED_KEY, entries.slice(-CONSUMED_MAX_ENTRIES));
}

export function isOAuthCallbackConsumed(key: string): boolean {
  return readConsumed().some((entry) => entry.key === key);
}
