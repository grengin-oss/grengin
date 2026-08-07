// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

import { request } from './client.js';
import {
  cachedLoad,
  clearCacheNamespace,
  makeScopedCacheKey,
  writeCache,
} from '../utils/cache.js';

export interface UserSystemPrompt {
  prompt_id: string;
  prompt_text: string;
  source: 'user_custom' | 'department_default' | 'system_default';
  variables: string[];
}

export interface UpdateUserPromptPayload {
  custom_prompt_text: string;
  is_active: boolean;
  prompt_id: string;
}

export interface PromptFeedbackPayload {
  comment: string;
  prompt_id: string;
  rating: number;
}

const SETTINGS_CACHE_TTL_MS = 5 * 60_000;

function userPromptCacheKey(): string {
  return makeScopedCacheKey('settings', ['user-system-prompt']);
}

export async function getUserSystemPrompt(): Promise<UserSystemPrompt> {
  return cachedLoad(userPromptCacheKey(), () => request<UserSystemPrompt>('/me/system-prompt'), {
    ttlMs: SETTINGS_CACHE_TTL_MS,
  });
}

export async function updateUserSystemPrompt(
  payload: UpdateUserPromptPayload,
): Promise<UserSystemPrompt> {
  const prompt = await request<UserSystemPrompt>('/me/system-prompt', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });

  writeCache(userPromptCacheKey(), prompt, SETTINGS_CACHE_TTL_MS);
  return prompt;
}

export async function deleteUserSystemPrompt(): Promise<void> {
  const response = await request<void>('/me/system-prompt', {
    method: 'DELETE',
  });
  clearCacheNamespace('settings');
  return response;
}

export async function submitPromptFeedback(
  payload: PromptFeedbackPayload,
): Promise<void> {
  return request<void>('/me/system-prompt/feedback', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
