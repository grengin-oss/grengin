// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { mergeProviderSuggestions } from '../src/lib/admin/providerSuggestions.js';
import { getAIProviderSuggestions, saveAIEngineKey } from '../src/lib/api/admin/AiEngines.js';
import { ApiError } from '../src/lib/api/client.js';
import type { AIEngine } from '../src/lib/admin/types.js';

const originalFetch = globalThis.fetch;
const calls: Array<{ url: string; options?: RequestInit }> = [];
const installed: AIEngine = {
  engine_key: 'groq', display_name: 'My Groq', is_enabled: false,
  api_key_configured: true, whitelisted_models: [],
};
try {
  globalThis.fetch = async (input, options) => {
    calls.push({ url: String(input), options });
    return Response.json({ providers: [
      { id: 'groq', name: 'Groq', icon: null },
      { id: 'openai', name: 'OpenAI', icon_dark: 'https://example.invalid/icon.svg' },
    ] });
  };
  const suggestions = await getAIProviderSuggestions();
  assert.equal(calls[0]?.url, '/api/discovery/ai-providers');
  assert.equal(calls[0]?.options?.method, 'GET');
  assert.equal(calls.length, 1, 'loading suggestions must not create engines');
  assert.equal(mergeProviderSuggestions([], suggestions).length, 2);
  const merged = mergeProviderSuggestions([installed], suggestions);
  assert.equal(merged.length, 2);
  assert.deepEqual(merged.find((engine) => engine.engine_key === 'groq'), installed);
  assert.deepEqual(mergeProviderSuggestions([installed], []), [installed]);
  assert.equal(suggestions.every((engine) => !engine.api_key_configured && !engine.is_enabled), true);

  globalThis.fetch = async (input, options) => {
    calls.push({ url: String(input), options });
    return Response.json(installed, { status: 201 });
  };
  await saveAIEngineKey('groq', 'fixture-key', false);
  assert.equal(calls.at(-1)?.url, '/api/admin/ai-engines');
  assert.equal(calls.at(-1)?.options?.method, 'POST');
  assert.deepEqual(JSON.parse(String(calls.at(-1)?.options?.body)), {
    engine_key: 'groq', api_key: 'fixture-key',
  });
  await saveAIEngineKey('groq', 'rotated-key', true);
  assert.equal(calls.at(-1)?.url, '/api/admin/ai-engines/groq');
  assert.equal(calls.at(-1)?.options?.method, 'PUT');
  assert.deepEqual(JSON.parse(String(calls.at(-1)?.options?.body)), { api_key: 'rotated-key' });

  globalThis.fetch = async () => Response.json({ detail: 'Already installed' }, { status: 409 });
  await assert.rejects(saveAIEngineKey('groq', 'fixture-key', false), (err: unknown) => err instanceof ApiError && err.status === 409);
  globalThis.fetch = async () => Response.json({ detail: 'Catalog unavailable' }, { status: 503 });
  await assert.rejects(getAIProviderSuggestions(), (err: unknown) => err instanceof ApiError && err.status === 503);
  console.log('AI-engine discovery: fresh install, policy preservation, POST/PUT and error cases passed');
} finally {
  globalThis.fetch = originalFetch;
}
