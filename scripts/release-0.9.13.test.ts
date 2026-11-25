// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { pollConversation } from '../src/lib/features/chat/conversationPolling.js';
import { categoryForEngine, categoryOrder } from '../src/lib/admin/providerCategories.js';
import { getAIProviderSuggestions } from '../src/lib/api/admin/AiEngines.js';
import { updateServerToolsAccess, ToolListChangedError } from '../src/lib/api/admin/mcpServers.js';
import { ApiError } from '../src/lib/api/client.js';
import { isRetiredSqlxServer } from '../src/lib/admin/mcpServerPolicy.js';
import { resolveDefaultModel } from '../src/lib/features/chat/modelPreferences.js';

// Fake clock: requests run sequentially and no real timeout is needed.
let next: (() => void) | undefined;
const delays: number[] = [];
let attempts = 0;
const applied: string[] = [];
const dispose = pollConversation({
  fetch: async () => {
    attempts++;
    if (attempts === 1 || attempts === 2) throw new Error('offline');
    return { generating: attempts < 4, text: attempts < 4 ? 'partial' : 'final' };
  },
  apply: (message) => { applied.push(message.text); return message.generating; },
  schedule: (fn, delay) => { next = fn; delays.push(delay); return 1 as any; },
  unschedule: () => { next = undefined; },
});
for (let i = 0; i < 4; i++) {
  const callback = next!; next = undefined;
  await callback();
}
assert.deepEqual(delays, [1000, 2000, 5000, 1000]);
assert.deepEqual(applied, ['partial', 'final']);
assert.equal(next, undefined, 'final text must be applied without an extra fetch');
dispose();
let finish!: (value: string) => void;
let pendingSignal: AbortSignal | undefined;
const stop = pollConversation({
  fetch: (signal) => { pendingSignal = signal; return new Promise<string>((resolve) => { finish = resolve; }); },
  apply: () => { assert.fail('a request from a departed chat must never update the view'); },
  schedule: (fn) => { next = fn; return 1 as any; },
  unschedule: () => { next = undefined; },
});
const pending = next!();
stop();
assert.equal(pendingSignal?.aborted, true);
finish('late');
await pending;

const originalFetch = globalThis.fetch;
const requests: { url: string; body?: any }[] = [];
try {
  globalThis.fetch = async (url) => {
    requests.push({ url: String(url) });
    return Response.json({ providers: [
      { id: 'z-provider', name: 'First', category: 'frontier' },
      { id: 'a-provider', name: 'Second', category: 'unknown' },
    ], categories: [{ id: 'frontier', label: 'Frontier' }] });
  };
  const discovery = await getAIProviderSuggestions();
  assert.deepEqual(discovery.providers.map((p) => p.engine_key), ['z-provider', 'a-provider']);
  const categories = { categories: discovery.categories, providers: Object.fromEntries(discovery.providers.map((p) => [p.engine_key, p.category!])) };
  assert.equal(categoryForEngine(categories, 'Z-PROVIDER'), 'frontier');
  assert.equal(categoryForEngine(categories, 'a-provider'), 'other');
  assert.equal(categoryForEngine({ ...categories, categories: [] }, 'z-provider'), 'other');
  assert.deepEqual(categoryOrder(categories), ['frontier', 'other']);
  assert.equal(requests.length, 1, 'categories must not cause a second-origin request');
  globalThis.fetch = async () => Response.json({ providers: [] });
  assert.deepEqual((await getAIProviderSuggestions()).categories, []);

  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), body: JSON.parse(String(options?.body)) });
    return Response.json({ tools: [], updated_count: 1 });
  };
  const tool = { tool_id: 'one', inherit_from_server: true, rules: [] };
  await updateServerToolsAccess('server', { tools: [tool, { ...tool, inherit_from_server: false }] });
  assert.deepEqual(requests.at(-1)?.body.tools, [{ ...tool, inherit_from_server: false }]);
  globalThis.fetch = async () => Response.json({ detail: 'removed tool' }, { status: 404 });
  await assert.rejects(updateServerToolsAccess('server', { tools: [tool] }), ToolListChangedError);
  globalThis.fetch = async () => Response.json({ detail: 'Permission lost' }, { status: 403 });
  await assert.rejects(updateServerToolsAccess('server', { tools: [tool] }), (err: unknown) => err instanceof ApiError && err.status === 403 && err.message === 'Permission lost');
} finally { globalThis.fetch = originalFetch; }
assert.equal(isRetiredSqlxServer({ transport_type: 'stdio', connection_config: { command: '/usr/bin/sqlx-mcp' } }), true);
assert.equal(isRetiredSqlxServer({ transport_type: 'stdio', connection_config: { command: 'other-mcp' } }), false);
assert.equal(isRetiredSqlxServer({ transport_type: 'http', connection_config: { command: 'sqlx-mcp' } }), false);
assert.equal(resolveDefaultModel([{ key: 'anthropic', name: 'Anthropic', icon: '', models: [{ key: 'current', name: 'Current' }] }])?.provider.key, 'anthropic');
console.log('Release regressions: polling, backoff, navigation, categories, atomic tool access, retired server/default provider passed');
