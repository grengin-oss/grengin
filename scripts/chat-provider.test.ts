// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { findModel, type ProviderInfo } from '../src/lib/api/models.js';
import { persistLastUsedModel, resolveDefaultModel } from '../src/lib/features/chat/modelPreferences.js';

// API tests do not mount Svelte; auth state only stores values here.
(globalThis as any).$state = <T>(value: T): T => value;
const storage = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
};
const { setAuth, initAuth } = await import('../src/lib/features/auth/state.svelte.js');
const { sendMessage, editMessageStream, regenerateMessageStream, uploadDocument } = await import('../src/lib/api/chatApi.js');
setAuth('fixture-token', 'fixture-refresh', { id: 'fixture-user' } as any);
initAuth();
const providers: ProviderInfo[] = [
  { key: 'openai', name: 'OpenAI', icon: '', models: [{ key: 'shared', name: 'Shared' }] },
  { key: 'custom', name: 'Custom', icon: '', models: [{ key: 'shared', name: 'Shared' }] },
  { key: 'deepseek', name: 'DeepSeek', icon: '', models: [{ key: 'deepseek-flash', name: 'Flash' }] },
];
persistLastUsedModel('shared', 'custom');
assert.equal(resolveDefaultModel(providers)?.provider.key, 'custom', 'refresh must preserve provider when model keys collide');
assert.equal(findModel(providers, 'Shared', 'custom')?.provider.key, 'custom', 'URL selection must be scoped to provider');
assert.equal(findModel(providers, 'shared', 'missing'), undefined);
persistLastUsedModel('deepseek-flash', 'deepseek');
const available = providers.filter(p=>p.key !== 'openai');
const restored = resolveDefaultModel(available)!;
assert.equal(restored.provider.key, 'deepseek');
assert.equal(resolveDefaultModel([]), undefined);
persistLastUsedModel('retired', 'openai');
assert.equal(resolveDefaultModel([providers[2]])?.provider.key, 'deepseek', 'retired selection must use an available provider');
storage.set('grengin:lastUsedModel', JSON.stringify({ model: 'deepseek-flash' }));
assert.equal(resolveDefaultModel(available)?.provider.key, 'deepseek', 'legacy model-only preferences must resolve their provider');

const originalFetch = globalThis.fetch;
const calls: {url: string; method: string; body: any}[] = [];
try {
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(String(options?.body));
    calls.push({url: String(url), method: options?.method ?? 'GET', body});
    assert.notEqual(body.provider, 'openai', 'disabled OpenAI must never be requested');
    return String(url).endsWith('/files')
      ? Response.json({ id: 'file-1', name: 'note.txt', type: 'text/plain', size: 4 })
      : new Response('event: done\ndata: {}\n\n', {headers:{'Content-Type':'text/event-stream'}});
  };
  const options = { message: 'Hello after refresh', provider: restored.provider.key, modelName: restored.model.key,
    onError: (error: Error) => { throw error; } };
  await sendMessage(options);
  await sendMessage({...options, conversationId:'existing-chat'});
  await editMessageStream('existing-chat', 'user-message', options);
  await regenerateMessageStream('existing-chat', 'user-message', options);
  assert.equal(calls.length, 4);
  for (const call of calls) {
    assert.equal(call.body.provider, 'deepseek');
    assert.equal(call.body.model_name, 'deepseek-flash');
  }
  assert.deepEqual(calls.map(c=>c.method), ['POST','POST','PATCH','PATCH']);
  const before = calls.length;
  for (const bad of [{provider:''}, {provider:undefined}, {modelName:''}, {modelName:undefined}]) {
    await assert.rejects(sendMessage({...options,...bad} as any), /Select an available/);
    await assert.rejects(editMessageStream('existing-chat','user-message',{...options,...bad} as any), /Select an available/);
    await assert.rejects(regenerateMessageStream('existing-chat','user-message',{...options,...bad} as any), /Select an available/);
  }
  await assert.rejects(uploadDocument({ file: {} as File, provider: '' }), /Select an available provider/);
  assert.equal(calls.length, before, 'invalid selection must not reach the network');
  // Simulate the browser file reader so the real upload payload is exercised.
  (globalThis as any).FileReader = class {
    result = 'data:text/plain;base64,dGVzdA==';
    onload: (()=>void) | null = null;
    readAsDataURL() { queueMicrotask(() => this.onload?.()); }
  };
  await uploadDocument({ file: {name:'note.txt',type:'text/plain'} as File, provider:'deepseek' });
  assert.equal(calls.at(-1)?.body.provider, 'deepseek');
  console.log('Chat provider: refreshed preference, shared models, retired/empty registry, send/edit/regenerate, missing selection, and upload passed');
} finally { globalThis.fetch = originalFetch; }
