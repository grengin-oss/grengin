const CACHE_PREFIX = 'grengin_cache:v1';

interface CacheEnvelope<T> {
  value: T;
  updatedAt: number;
  expiresAt: number | null;
}

interface ReadCacheOptions {
  allowExpired?: boolean;
}

interface CachedLoadOptions {
  ttlMs?: number;
}

const pendingLoads = new Map<string, Promise<unknown>>();

function getUserScope(): string {
  if (typeof localStorage === 'undefined') {
    return 'anonymous';
  }

  try {
    const storedUser = localStorage.getItem('grengin_user');
    if (!storedUser) {
      return 'anonymous';
    }

    const user = JSON.parse(storedUser);
    return String(user?.id || user?.email || 'anonymous');
  } catch {
    return 'anonymous';
  }
}

function encodePart(part: string | number | boolean | null | undefined): string {
  return encodeURIComponent(String(part ?? ''));
}

export function makeScopedCacheKey(
  namespace: string,
  parts: Array<string | number | boolean | null | undefined> = [],
): string {
  return [CACHE_PREFIX, getUserScope(), namespace, ...parts].map(encodePart).join(':');
}

export function readCache<T>(key: string, options: ReadCacheOptions = {}): T | null {
  if (typeof localStorage === 'undefined') {
    return null;
  }

  const raw = localStorage.getItem(key);
  if (!raw) {
    return null;
  }

  try {
    const envelope = JSON.parse(raw) as CacheEnvelope<T>;
    const expired = envelope.expiresAt !== null && envelope.expiresAt <= Date.now();

    if (expired && !options.allowExpired) {
      return null;
    }

    return envelope.value;
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}

export function writeCache<T>(key: string, value: T, ttlMs?: number): void {
  if (typeof localStorage === 'undefined') {
    return;
  }

  const envelope: CacheEnvelope<T> = {
    value,
    updatedAt: Date.now(),
    expiresAt: ttlMs ? Date.now() + ttlMs : null,
  };

  try {
    localStorage.setItem(key, JSON.stringify(envelope));
  } catch {
    // Cache writes are best effort; storage limits should not break the app.
  }
}

export function removeCache(key: string): void {
  if (typeof localStorage === 'undefined') {
    return;
  }

  localStorage.removeItem(key);
}

export function removeCacheByPrefix(prefix: string): void {
  if (typeof localStorage === 'undefined') {
    return;
  }

  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key?.startsWith(prefix)) {
      keys.push(key);
    }
  }

  for (const key of keys) {
    localStorage.removeItem(key);
  }
}

export function clearAllScopedCache(): void {
  removeCacheByPrefix(encodePart(CACHE_PREFIX));
}

export function clearCacheNamespace(namespace: string): void {
  removeCacheByPrefix([CACHE_PREFIX, getUserScope(), namespace].map(encodePart).join(':'));
}

export async function cachedLoad<T>(
  key: string,
  loader: () => Promise<T>,
  options: CachedLoadOptions = {},
): Promise<T> {
  const cached = readCache<T>(key);
  if (cached !== null) {
    return cached;
  }

  const pending = pendingLoads.get(key) as Promise<T> | undefined;
  if (pending) {
    return pending;
  }

  const loadPromise = (async () => {
    try {
      const value = await loader();
      writeCache(key, value, options.ttlMs);
      return value;
    } catch (error) {
      const stale = readCache<T>(key, { allowExpired: true });
      if (stale !== null) {
        return stale;
      }

      throw error;
    } finally {
      pendingLoads.delete(key);
    }
  })();

  pendingLoads.set(key, loadPromise);
  return loadPromise;
}

export function prefetchCachedLoad<T>(
  key: string,
  loader: () => Promise<T>,
  options: CachedLoadOptions = {},
): void {
  if (readCache<T>(key) !== null || pendingLoads.has(key)) {
    return;
  }

  void cachedLoad(key, loader, options).catch(() => {
    // Prefetch is best effort and should not surface errors to the UI.
  });
}
