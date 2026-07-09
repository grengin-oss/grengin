import type { components } from '../types/api.js';
import { cachedLoad, makeScopedCacheKey, writeCache } from '../utils/cache.js';
import { request } from './client.js';

export type UserSettings = components['schemas']['UserSettings'];

const SETTINGS_CACHE_TTL_MS = 5 * 60_000;

function settingsCacheKey(): string {
  return makeScopedCacheKey('settings', ['user-settings']);
}

export async function getSettings(): Promise<UserSettings> {
  return cachedLoad(settingsCacheKey(), () => request<UserSettings>('/settings'), {
    ttlMs: SETTINGS_CACHE_TTL_MS,
  });
}

export async function updateSettings(payload: UserSettings): Promise<UserSettings> {
  const settings = await request<UserSettings>('/settings', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });

  writeCache(settingsCacheKey(), settings, SETTINGS_CACHE_TTL_MS);
  return settings;
}
