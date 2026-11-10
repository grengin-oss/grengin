// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

/**
 * Connectors redesign (ENGG-511) API.
 *
 * Two sources, mirroring production:
 *  - The published catalog metadata (`connectors.json` and the per-connector
 *    config files) is static, public and CORS-served from the meta host. It is
 *    fetched with a plain `fetch()` against META_BASE — the same pattern the
 *    provider-categories loader uses — not the authenticated `request()` helper.
 *    In development META_BASE points at the mock server (see .env.mock).
 *  - The signed-in user's own connections come from /connectors through the
 *    authenticated API, so they use `request()`.
 */

import { get } from 'svelte/store';
import { _ } from 'svelte-i18n';
import { request } from '../client.js';
import { deleteMcpServer, getMcpServers, syncMcpServerTools, updateMcpServer } from './mcpServers.js';
import { startMcpAuthorization } from '../mcpAuthorize.js';
import { ApiError } from '../client.js';
import { getMcpServers as getUserMcpServers } from '../integrations.js';
import type { MCPServer } from '../../admin/types.js';
import { META_BASE } from '../../admin/providerCategories.js';
import { getUser } from '../../features/auth/state.svelte.js';

/** Translate a connector message (common.json `connectors.*`). */
function t(key: string, values?: Record<string, string | number>): string {
  return get(_)(`connectors.${key}`, values ? { values } : undefined);
}

// ---------------------------------------------------------------------------
// Published catalog metadata (public, CORS, via META_BASE)
// ---------------------------------------------------------------------------

export interface ConnectorCategory {
  id: string;
  label: string;
}

export interface ConnectorCatalogEntry {
  key: string;
  configuration?: string;
  display_name: string;
  icon: string;
  description: string;
  category: string;
  /** One-line "what it does" shown on the card and detail header. */
  job: string;
  /** 'google' | 'microsoft' | 'none' — drives the recommended row. */
  suite: string;
  keywords: string[];
  sign_in: string;
  status: string;
  latestVersion?: string;
}

export interface ConnectorCatalog {
  schemaVersion: string;
  catalogVersion: string;
  categories: ConnectorCategory[];
  catalog: ConnectorCatalogEntry[];
}

/** One capability group: a plain-language label plus the tools it covers. */
export interface CapabilityGroup {
  label: string;
  tools: string[];
}

export interface ConnectorTool {
  name: string;
  description: string;
}

/** The full per-connector config document (connectors/<key>.json). */
export interface ConnectorConfig extends ConnectorCatalogEntry {
  version: string;
  capabilities?: {
    read?: CapabilityGroup[];
    write?: CapabilityGroup[];
  };
  example_prompts?: string[];
  tools?: ConnectorTool[];
  protocols?: { name: string; transport: string }[];
  connection?: Record<string, unknown>;
}

/**
 * Rewrite a published icon URL so that, in development, it is fetched through
 * the mock server's icon proxy (which adds a browser UA) rather than directly
 * from the meta host. In production META_BASE is the meta host, so this is a
 * no-op.
 */
export function iconUrl(icon: string): string {
  if (!icon) return icon;
  return icon.replace(/^https?:\/\/meta\.grengin\.com/, META_BASE);
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(t('errors.loadFailed', { url, status: res.status }));
  }
  return (await res.json()) as T;
}

export async function fetchCatalog(): Promise<ConnectorCatalog> {
  return getJson<ConnectorCatalog>(`${META_BASE}/connectors.json`);
}

export async function fetchConnectorConfig(key: string): Promise<ConnectorConfig> {
  return getJson<ConnectorConfig>(`${META_BASE}/connectors/${key}.json`);
}

// ---------------------------------------------------------------------------
// Real connection lifecycle (test-devel.grengin.com /connectors, per-user)
//
// The signed-in user's OWN connections: start/resume OAuth, check status,
// confirm ownership, disconnect. This is the real source of "connected or not".
// ---------------------------------------------------------------------------

export type ConnectionStatus =
  | 'pending'
  | 'awaiting_confirmation'
  | 'connected'
  | 'expired'
  | 'revoked'
  | 'failed';

/** How the provider handled credential revocation on disconnect. */
export type ProviderRevocation = 'revoked' | 'pending' | 'unsupported' | 'not_applicable';

/** One stored connection, as returned by every /connectors endpoint. */
export interface ConnectorConnection {
  id: string;
  connector_key: string;
  catalog_version: string;
  status: ConnectionStatus;
  revocation_pending: boolean;
  scopes: string[];
  authorization_url?: string | null;
  connected_at?: string | null;
  expires_at?: string | null;
  server_id?: string | null;
  provider_revocation?: ProviderRevocation | null;
}

export interface ConnectConnectorRequest {
  version: string;
  server_id?: string | null;
}

/** GET /connectors — the caller's stored connections. */
export async function listConnections(): Promise<ConnectorConnection[]> {
  return request<ConnectorConnection[]>('/connectors', { method: 'GET' });
}

/** POST /connectors/{connector_key}/connect — start or resume OAuth. */
export async function startConnect(
  connectorKey: string,
  body: ConnectConnectorRequest,
): Promise<ConnectorConnection> {
  return request<ConnectorConnection>(`/connectors/${connectorKey}/connect`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** GET /connectors/{connection_id} — verify status with the broker. */
export async function getConnection(connectionId: string): Promise<ConnectorConnection> {
  return request<ConnectorConnection>(`/connectors/${connectionId}`, { method: 'GET' });
}

/** POST /connectors/{connection_id}/complete — confirm ownership and activate. */
export async function completeConnection(
  connectionId: string,
  confirmationCode: string,
): Promise<ConnectorConnection> {
  return request<ConnectorConnection>(`/connectors/${connectionId}/complete`, {
    method: 'POST',
    body: JSON.stringify({ confirmation_code: confirmationCode }),
  });
}

/** POST /connectors/{connection_id}/disconnect — disable access and clean up. */
export async function disconnectConnection(
  connectionId: string,
): Promise<ConnectorConnection> {
  return request<ConnectorConnection>(`/connectors/${connectionId}/disconnect`, {
    method: 'POST',
  });
}

/** The caller's live connection for a connector, if any (prefers an active one). */
export function findUserConnection(
  connections: ConnectorConnection[],
  connectorKey: string,
): ConnectorConnection | undefined {
  const mine = connections.filter((c) => c.connector_key === connectorKey);
  return (
    mine.find((c) => c.status === 'connected') ??
    mine.find((c) => c.status === 'pending' || c.status === 'awaiting_confirmation') ??
    mine[0]
  );
}

const TERMINAL: ConnectionStatus[] = ['connected', 'expired', 'revoked', 'failed'];

// ---------------------------------------------------------------------------
// Browser transaction for the OAuth return (grengin-api
// docs/connector-oauth-broker-frontend.md). The broker sends the popup back to
// /mcp/oauth/callback with #connector_approval, connection_id and state; the
// callback page only completes the connection when they match the attempt
// recorded here, in this browser session, for the signed-in user.
// ---------------------------------------------------------------------------

export interface ConnectorTransaction {
  connection_id: string;
  state: string;
  user_id: string;
  expires_at: number;
}

const TXN_KEY = 'connector_oauth_txn';
const TXN_TTL_MS = 10 * 60_000;

export function readConnectorTransaction(): ConnectorTransaction | null {
  try {
    const raw = sessionStorage.getItem(TXN_KEY);
    return raw ? (JSON.parse(raw) as ConnectorTransaction) : null;
  } catch {
    return null;
  }
}

export function clearConnectorTransaction(): void {
  try {
    sessionStorage.removeItem(TXN_KEY);
  } catch {
    /* storage unavailable — nothing to clear */
  }
}

/**
 * Open a blank (same-origin) popup for the consent page. Call it synchronously
 * from the click, before any await, or browsers block it.
 */
export function openBlankConsentPopup(): Window | null {
  const popup = window.open('', 'grengin-connector-oauth', 'width=520,height=680');
  if (popup) popup.opener = null;
  return popup;
}

/**
 * Record the attempt that /mcp/oauth/callback will accept for this broker
 * connection. Must run in the tab (or before opening the popup) that will land
 * on the return page, since sessionStorage is per browsing context.
 */
export function rememberConnectorTransaction(connectionId: string, authorizationUrl: string): string {
  const txn: ConnectorTransaction = {
    connection_id: connectionId,
    state: new URL(authorizationUrl).searchParams.get('state') ?? '',
    user_id: getUser()?.id ?? '',
    expires_at: Date.now() + TXN_TTL_MS,
  };
  const raw = JSON.stringify(txn);
  sessionStorage.setItem(TXN_KEY, raw);
  return raw;
}

/**
 * Send the popup to the vendor consent page. The transaction is copied into the
 * popup's own sessionStorage first; the return page loads in that popup and
 * reads it from there.
 */
function openConsentPopup(
  conn: ConnectorConnection,
  authorizationUrl: string,
  popup: Window | null,
): void {
  const raw = rememberConnectorTransaction(conn.id, authorizationUrl);
  if (!popup || popup.closed) {
    throw new Error(t('errors.popupBlocked'));
  }
  popup.sessionStorage.setItem(TXN_KEY, raw);
  popup.location.replace(authorizationUrl);
}

/**
 * Run the full connect flow: start OAuth, open the vendor consent popup when an
 * authorization URL is returned, then refresh status with backoff until it
 * settles. The popup's return page confirms the connection (POST /complete);
 * once connected, the connector's MCP server tools are synced.
 */
export async function connectAndWait(
  connectorKey: string,
  version: string,
  opts: { serverId?: string | null; popup?: Window | null; signal?: AbortSignal } = {},
): Promise<ConnectorConnection> {
  let conn = await startConnect(connectorKey, {
    version,
    server_id: opts.serverId ?? null,
  });
  if (conn.authorization_url) openConsentPopup(conn, conn.authorization_url, opts.popup ?? null);
  else opts.popup?.close();
  const started = Date.now();
  let delay = 1500;
  while (!TERMINAL.includes(conn.status) && Date.now() - started < TXN_TTL_MS) {
    if (opts.signal?.aborted) break;
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 1.5, 5000);
    conn = await getConnection(conn.id);
  }
  const serverId = conn.server_id ?? opts.serverId;
  if (conn.status === 'connected' && serverId) {
    try {
      await syncMcpServerTools(serverId);
    } catch (err) {
      // Only an admin with their own connected session can sync; for anyone
      // else a 403 is expected. Connected regardless.
      if (!(err instanceof ApiError && err.status === 403)) console.warn('sync-tools failed', err);
    }
  }
  return conn;
}

// ---------------------------------------------------------------------------
// Adding a connector (admin). Like an AI engine provider, a connector is added
// once by an admin before anyone connects. Every connector is installed as its
// pinned native runtime plugin (GET /discovery/connector-plugins/{key}) through
// POST /admin/mcp-servers; OAuth plugins sign in through the Grengin broker
// (`oauth_broker: {}`), so instances register no OAuth client of their own.
// Never created implicitly on connect — that would override the admin's access
// choice.
// ---------------------------------------------------------------------------

export type ConnectorServerAccess = 'admin_only' | 'all_users';

/** GET /discovery/connector-plugins/{id}: the plugin pinned for this instance. */
export interface NativeConnectorPlugin {
  id: string;
  version: string;
  plugin: { id: string; name: string; base_url: string; auth: string; [key: string]: unknown };
  installation?: {
    configuration_schema?: {
      properties?: Record<string, { description?: string; examples?: unknown[]; pattern?: string; maxLength?: number }>;
      required?: string[];
    };
  } | null;
}

/** One instance setting a plugin needs before it can be installed (e.g. Jira cloud_id). */
export interface ConnectorSetting {
  name: string;
  example?: string;
  pattern?: string;
  maxLength?: number;
}

/** Thrown when a plugin needs settings the caller did not provide. */
export class ConnectorSettingsRequired extends Error {
  constructor(
    public pluginName: string,
    public settings: ConnectorSetting[],
  ) {
    super(t('errors.needsSettings', { name: pluginName }));
    this.name = 'ConnectorSettingsRequired';
  }
}

const NAME_SUFFIX = / \((?:native plugin|Grengin broker)\)$/;

/** The plain display name, without the suffixes older installs used. */
export function connectorDisplayName(name: string): string {
  return name.replace(NAME_SUFFIX, '');
}

function configOf(server: MCPServer): Record<string, any> {
  return (server.connection_config ?? {}) as Record<string, any>;
}

/** The catalog key a server was installed for (native plugin id or older broker key). */
export function connectorKeyOf(server: MCPServer): string | undefined {
  const config = configOf(server);
  const id = config.connector_plugin?.manifest?.id ?? config.grengin_connector_key;
  return typeof id === 'string' ? id : undefined;
}

/** An older install that points at a vendor-hosted MCP server instead of the native runtime. */
export function isLegacyConnectorServer(server: MCPServer): boolean {
  const config = configOf(server);
  return typeof config.grengin_connector_key === 'string' && !config.connector_plugin;
}

/** The MCP server an admin added for this connector, if any (native preferred). */
export function findConnectorServer(servers: MCPServer[], key: string): MCPServer | undefined {
  const matches = servers.filter((s) => connectorKeyOf(s) === key);
  return matches.find((s) => !isLegacyConnectorServer(s)) ?? matches[0];
}

export async function fetchNativePlugin(key: string): Promise<NativeConnectorPlugin> {
  const plugin = await request<NativeConnectorPlugin>(
    `/discovery/connector-plugins/${encodeURIComponent(key)}`,
    { method: 'GET' },
  );
  if (plugin.id !== key || plugin.plugin?.id !== key || !plugin.plugin.base_url) {
    throw new Error(t('errors.manifestMismatch'));
  }
  return plugin;
}

/** Settings the plugin requires, in schema order. */
export function requiredSettings(plugin: NativeConnectorPlugin): ConnectorSetting[] {
  const schema = plugin.installation?.configuration_schema;
  return (schema?.required ?? []).map((name) => {
    const field = schema?.properties?.[name] ?? {};
    const example = field.examples?.find((v) => typeof v === 'string') as string | undefined;
    return { name, example, pattern: field.pattern, maxLength: field.maxLength };
  });
}

/** The connection_config for a native install; the manifest is stored verbatim because the broker hashes it. */
function nativeServerFields(
  plugin: NativeConnectorPlugin,
  configuration: Record<string, string>,
): { name: string; url: string; transport_type: string; connection_config: Record<string, unknown> } {
  const missing = requiredSettings(plugin).filter((s) => !configuration[s.name]?.trim());
  if (missing.length) throw new ConnectorSettingsRequired(plugin.plugin.name, missing);
  return {
    name: plugin.plugin.name,
    url: plugin.plugin.base_url,
    transport_type: 'http',
    connection_config: {
      connector_plugin: { manifest: plugin.plugin, configuration },
      ...(plugin.plugin.auth === 'oauth2' ? { oauth_broker: {} } : {}),
    },
  };
}

/**
 * Admin: add a connector as its native plugin. Returns the existing server if
 * already added. Throws ConnectorSettingsRequired when instance settings are
 * needed; call again with them.
 */
export async function addConnector(
  key: string,
  access: ConnectorServerAccess = 'admin_only',
  configuration: Record<string, string> = {},
): Promise<MCPServer> {
  const [catalog, list, plugin] = await Promise.all([fetchCatalog(), getMcpServers(), fetchNativePlugin(key)]);
  const existing = findConnectorServer(list.servers, key);
  if (existing && !isLegacyConnectorServer(existing)) return existing;
  if (existing) return upgradeLegacyConnector(existing, configuration, plugin);
  const entry = catalog.catalog.find((c) => c.key === key);
  return request<MCPServer>('/admin/mcp-servers', {
    method: 'POST',
    body: JSON.stringify({
      ...nativeServerFields(plugin, configuration),
      description: entry?.description ?? null,
      icon: entry?.icon || null,
      enabled: true,
      default_access: access,
    }),
  });
}

/**
 * Admin: switch an older vendor-hosted broker server to its native plugin in
 * place, keeping its id, access rules and project links. Users reconnect once.
 */
export async function upgradeLegacyConnector(
  server: MCPServer,
  configuration: Record<string, string> = {},
  plugin?: NativeConnectorPlugin,
): Promise<MCPServer> {
  const key = connectorKeyOf(server);
  if (!key) throw new Error(t('errors.unknown'));
  const native = plugin ?? (await fetchNativePlugin(key));
  return updateMcpServer(server.id, nativeServerFields(native, configuration));
}

export interface ConnectorCleanup {
  upgraded: string[];
  removed: string[];
  renamed: string[];
  needsSettings: { server: MCPServer; error: ConnectorSettingsRequired }[];
  failed: string[];
}

/**
 * Admin: bring older connector installs onto one model. A broker server with a
 * native duplicate is deleted, the rest are upgraded in place, and the
 * "(native plugin)" / "(Grengin broker)" suffixes are dropped.
 */
export async function unifyConnectorServers(servers: MCPServer[]): Promise<ConnectorCleanup> {
  const result: ConnectorCleanup = { upgraded: [], removed: [], renamed: [], needsSettings: [], failed: [] };
  const legacy = servers.filter(isLegacyConnectorServer);
  const removedIds = new Set<string>();
  for (const server of legacy) {
    const key = connectorKeyOf(server)!;
    const native = servers.find((s) => s.id !== server.id && connectorKeyOf(s) === key && !isLegacyConnectorServer(s));
    try {
      if (native) {
        await deleteMcpServer(server.id);
        removedIds.add(server.id);
        result.removed.push(connectorDisplayName(server.name));
      } else {
        await upgradeLegacyConnector(server);
        result.upgraded.push(connectorDisplayName(server.name));
      }
    } catch (error) {
      if (error instanceof ConnectorSettingsRequired) result.needsSettings.push({ server, error });
      else result.failed.push(connectorDisplayName(server.name));
    }
  }
  for (const server of servers) {
    if (removedIds.has(server.id) || isLegacyConnectorServer(server) || !NAME_SUFFIX.test(server.name)) continue;
    try {
      await updateMcpServer(server.id, { name: connectorDisplayName(server.name) });
      result.renamed.push(connectorDisplayName(server.name));
    } catch {
      result.failed.push(server.name);
    }
  }
  return result;
}

/**
 * The added server's id for this connector. Admins see connection_config on
 * /admin/mcp-servers; other users only get their accessible servers from
 * /mcp-servers, matched by display name.
 */
async function connectorServerId(entry: ConnectorCatalogEntry): Promise<string | undefined> {
  try {
    return findConnectorServer((await getMcpServers()).servers, entry.key)?.id;
  } catch (err) {
    if (!(err instanceof ApiError && err.status === 403)) throw err;
    const { servers } = await getUserMcpServers();
    return servers.find((s) => connectorDisplayName(s.name) === entry.display_name)?.id;
  }
}

/**
 * Connect the signed-in user's own account to the connector's added server and
 * wait until the broker settles. Call from the click handler: the sign-in
 * popup is opened before the first await.
 */
export async function connectConnector(key: string): Promise<ConnectorConnection> {
  const popup = openBlankConsentPopup();
  try {
    const catalog = await fetchCatalog();
    const entry = catalog.catalog.find((c) => c.key === key);
    if (!entry) throw new Error(t('errors.unknown'));
    const serverId = await connectorServerId(entry);
    if (!serverId) throw new Error(t('errors.notAdded'));
    const authorization = await startMcpAuthorization(serverId);
    if (!authorization) throw new Error(t('errors.connectFailed'));
    if (authorization.connected) {
      popup?.close();
      const mine = findUserConnection(await listConnections(), key);
      if (mine) return mine;
      throw new Error(t('errors.connectFailed'));
    }
    if (!popup || popup.closed) throw new Error(t('errors.popupBlocked'));
    const txn = sessionStorage.getItem(TXN_KEY);
    if (txn) popup.sessionStorage.setItem(TXN_KEY, txn);
    popup.sessionStorage.setItem('mcp_oauth_origin', 'admin');
    popup.location.replace(authorization.authorizationUrl);
    if (!authorization.brokerConnectionId) {
      throw new Error(t('errors.connectFailed'));
    }
    return await waitForConnection(authorization.brokerConnectionId, serverId);
  } catch (err) {
    popup?.close();
    throw err;
  }
}

async function waitForConnection(id: string, serverId: string): Promise<ConnectorConnection> {
  const started = Date.now();
  let delay = 1500;
  let conn = await getConnection(id);
  while (!TERMINAL.includes(conn.status) && Date.now() - started < TXN_TTL_MS) {
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 1.5, 5000);
    conn = await getConnection(id);
  }
  if (conn.status === 'connected') {
    try {
      await syncMcpServerTools(conn.server_id ?? serverId);
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 403)) console.warn('sync-tools failed', err);
    }
  }
  return conn;
}

/** Disconnect the signed-in user's own connection for this connector. */
export async function disconnectConnector(key: string): Promise<ConnectorConnection> {
  const connections = await listConnections();
  const mine = findUserConnection(connections, key);
  if (!mine) throw new Error(t('errors.noConnection'));
  return disconnectConnection(mine.id);
}
