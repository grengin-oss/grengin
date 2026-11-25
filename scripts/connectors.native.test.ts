// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { addMessages, init } from 'svelte-i18n';
import en from '../src/lib/i18n/locales/en/common.json';
// API contract tests do not mount components; the auth state only holds values here.
(globalThis as any).$state = <T>(value: T): T => value;
const { addConnector, fetchCatalog, ConnectorSettingsRequired, findConnectorServer, requiredSettings, fetchNativePlugin, disconnectConnectorInstallation } = await import('../src/lib/api/admin/connectors.js');
const { startMcpAuthorization, ConnectedElsewhere } = await import('../src/lib/api/mcpAuthorize.js');
addMessages('en', en);
await init({ fallbackLocale: 'en', initialLocale: 'en' });
const storage = new Map<string, string>();
(globalThis as any).sessionStorage = { setItem: (key: string, value: string) => storage.set(key, value), getItem: (key: string) => storage.get(key) ?? null };
const plugin = { id: 'atlassian', name: 'Atlassian', auth: 'oauth2', base_url: 'https://example.invalid', custom_field: { preserve: true } };
const cloudId = '12345678-1234-4234-8234-123456789abc';
const payload = { id: 'atlassian', version: '1.0.0', plugin, installation: { configuration_schema: { required: ['cloud_id'], properties: { cloud_id: { pattern: '^[0-9a-f-]{36}$' } } } } };
let servers: any[] = [];
let connections: any[] = [];
let authorizeStatus = 200;
let authorization: any = { success: true, status: 'pending', broker_connection_id: 'connection', authorization_url: 'https://example.invalid/authorize?state=attempt' };
const calls: { url: string; method: string; body?: any }[] = [];
const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async (input, options) => {
    const url = String(input); const method = options?.method ?? 'GET';
    const body = options?.body ? JSON.parse(String(options.body)) : undefined;
    calls.push({ url, method, body });
    if (url === '/api/discovery/connector-plugins') return Response.json({ catalog_version: '1', providers: [ { id: 'atlassian', name: 'Atlassian', status: 'active', latest_version: '1', members: ['jira', 'confluence'] } ] });
    if (url === '/api/discovery/connector-plugins/atlassian') return Response.json(payload);
    if (url === '/api/admin/mcp-servers' && method === 'GET') return Response.json({ servers });
    if (url === '/api/admin/mcp-servers' && method === 'POST') return Response.json({ id: 'new-server', ...body });
    if (url === '/api/connectors') return Response.json(connections);
    if (url === '/api/connectors/mine/disconnect') return Response.json({ id: 'mine', server_id: 'existing', status: 'revoked', revocation_pending: true });
    if (url.endsWith('/authorize')) return Response.json(authorization, { status: authorizeStatus });
    throw new Error(`Unexpected request ${method} ${url}`);
  };
  assert.deepEqual((await fetchCatalog()).catalog[0].members, ['jira', 'confluence']);
  assert.equal(requiredSettings(await fetchNativePlugin('atlassian'))[0].name, 'cloud_id');
  await assert.rejects(addConnector('atlassian'), ConnectorSettingsRequired);
  await assert.rejects(addConnector('atlassian', 'admin_only', { cloud_id: 'https://site.atlassian.net' }), ConnectorSettingsRequired);
  assert.equal(calls.filter((c) => c.method === 'POST').length, 0, 'missing settings must not install a server');
  await addConnector('atlassian', 'admin_only', { cloud_id: cloudId });
  const installation = calls.at(-1)!.body;
  assert.deepEqual(installation.connection_config.connector_plugin.manifest, plugin);
  assert.deepEqual(installation.connection_config.connector_plugin.configuration, { cloud_id: cloudId });
  assert.deepEqual(installation.connection_config.oauth_broker, {});
  assert.equal('oauth' in installation.connection_config, false);
  servers = [{ id: 'existing', connection_config: installation.connection_config }];
  const before = calls.filter((c) => c.method === 'POST').length;
  assert.equal((await addConnector('atlassian')).id, 'existing');
  assert.equal(calls.filter((c) => c.method === 'POST').length, before, 'reuse installed plugin');
  assert.equal(findConnectorServer(servers, 'atlassian')?.id, 'existing');

  connections = [{ connector_key: 'atlassian', server_id: 'another-installation', status: 'connected' }];
  await assert.rejects(startMcpAuthorization('existing', { connectorKey: 'atlassian' }), ConnectedElsewhere);
  assert.equal(calls.at(-1)?.url, '/api/connectors', 'refuse before starting another authorization');
  connections = [];
  await startMcpAuthorization('existing', { connectorKey: 'atlassian' });
  await startMcpAuthorization('existing', { connectorKey: 'atlassian', reconnect: true });
  assert.equal(JSON.parse(storage.get('connector_oauth_txn')!).connection_id, 'connection');
  assert.equal(storage.get('connector_oauth_txn')!.includes('confirmation_code'), false);
  authorizeStatus = 409; authorization = { detail: 'Connection conflict' };
  await assert.rejects(startMcpAuthorization('existing', { connectorKey: 'atlassian' }));
  assert.equal(calls.some((c) => c.url.endsWith('/disconnect') || c.url.endsWith('/connect')), false, 'retry must never disconnect or create a broker connection');
  connections = [
    { id: 'other', connector_key: 'atlassian', server_id: 'another-installation' },
    { id: 'mine', connector_key: 'atlassian', server_id: 'existing' },
  ];
  assert.equal((await disconnectConnectorInstallation('existing'))?.revocation_pending, true);
  assert.equal(calls.at(-1)?.url, '/api/connectors/mine/disconnect');
  assert.equal(await disconnectConnectorInstallation('not-installed'), null);
  console.log('Native connectors: suites, required settings, unchanged manifest, install reuse, conflict and retry contracts passed');
} finally {
  globalThis.fetch = originalFetch;
  delete (globalThis as any).$state;
  delete (globalThis as any).sessionStorage;
}
