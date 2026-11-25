// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

/**
 * Connectors redesign (ENGG-511) API.
 *
 * Two sources, both through the backend:
 *  - The catalog is the native connector plugin distribution pinned for this
 *    backend version (GET /discovery/connector-plugins), including suites that
 *    combine several apps of one provider behind one sign-in. Icons are served
 *    from the meta host (VITE_META_BASE can proxy icons in development).
 *  - The signed-in user's own connections come from /connectors.
 */

import { get } from 'svelte/store';
import { _ } from 'svelte-i18n';
import { request } from '../client.js';
import { getMcpServers, syncMcpServerTools, updateMcpServer } from './mcpServers.js';
import { startMcpAuthorization } from '../mcpAuthorize.js';
import { ApiError } from '../client.js';
import { getMcpServers as getUserMcpServers } from '../integrations.js';
import type { MCPServer } from '../../admin/types.js';
// Optional development proxy for icon assets only; catalog data comes from the API.
const ICON_BASE = (import.meta.env?.VITE_META_BASE?.trim() || 'https://meta.grengin.com').replace(/\/$/, '');
import { getUser } from '../../features/auth/state.svelte.js';

/** Translate a connector message (common.json `connectors.*`). */
function t(key: string, values?: Record<string, string | number>): string {
  return get(_)(`connectors.${key}`, values ? { values } : undefined);
}

// ---------------------------------------------------------------------------
// Catalog (native connector plugins, via backend discovery)
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
  /** Suites only: the single-app plugins this connector combines behind one sign-in. */
  members?: string[];
}

export interface ConnectorCatalog {
  schemaVersion: string;
  catalogVersion: string;
  categories: ConnectorCategory[];
  catalog: ConnectorCatalogEntry[];
}

/**
 * Rewrite a published icon URL so that, in development, it is fetched through
 * the mock server's icon proxy (which adds a browser UA) rather than directly
 * from the meta host. In production ICON_BASE is the meta host, so this is a
 * no-op.
 */
export function iconUrl(icon: string): string {
  if (!icon) return icon;
  return icon.replace(/^https?:\/\/meta\.grengin\.com/, ICON_BASE);
}

/** One plugin from GET /discovery/connector-plugins (the catalog pinned for this backend version). */
interface NativePluginSummary {
  id: string;
  name: string;
  description?: string | null;
  status: string;
  icon?: string | null;
  icon_dark?: string | null;
  category?: string | null;
  members?: string[];
  latest_version: string;
}

/** Category order in Browse; ids the catalog adds later follow in first-seen order. */
const CATEGORY_ORDER = ['email-calendar', 'files', 'chat', 'productivity', 'customers', 'support', 'money',
  'marketing', 'website', 'developer'];

/**
 * The connector catalog for Browse, from this backend's pinned native plugin
 * distribution. Suites (entries with `members`) are listed alongside the single
 * apps they combine.
 */
export async function fetchCatalog(): Promise<ConnectorCatalog> {
  const listing = await request<{ catalog_version: string; providers: NativePluginSummary[] }>(
    '/discovery/connector-plugins',
    { method: 'GET' },
  );
  const catalog = listing.providers.map((p): ConnectorCatalogEntry => ({
    key: p.id,
    display_name: p.name,
    icon: p.icon ?? '',
    description: p.description ?? '',
    job: p.description ?? '',
    category: p.category ?? 'other',
    suite: 'none',
    keywords: [],
    sign_in: 'oauth',
    status: p.status,
    latestVersion: p.latest_version,
    members: p.members ?? [],
  }));
  const seen = [...new Set(catalog.map((entry) => entry.category))];
  const ids = [...CATEGORY_ORDER.filter((id) => seen.includes(id)), ...seen.filter((id) => !CATEGORY_ORDER.includes(id))];
  return {
    schemaVersion: '1.0',
    catalogVersion: listing.catalog_version,
    categories: ids.map((id) => ({ id, label: id })),
    catalog,
  };
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

/** GET /connectors — the caller's stored connections. */
export async function listConnections(): Promise<ConnectorConnection[]> {
  return request<ConnectorConnection[]>('/connectors', { method: 'GET' });
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
    return { name, example, pattern: field.pattern ?? (name === 'cloud_id' ? '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' : undefined), maxLength: field.maxLength };
  });
}

/** The connection_config for a native install; the manifest is stored verbatim because the broker hashes it. */
function nativeServerFields(
  plugin: NativeConnectorPlugin,
  configuration: Record<string, string>,
): { name: string; url: string; transport_type: string; connection_config: Record<string, unknown> } {
  const missing = requiredSettings(plugin).filter((setting) => {
    const value = configuration[setting.name]?.trim();
    return !value || (setting.pattern && !new RegExp(setting.pattern, 'u').test(value))
      || (setting.maxLength !== undefined && value.length > setting.maxLength);
  });
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
    return servers.find((s) => s.integration?.plugin_id === entry.key)?.id
      ?? servers.find((s) => !s.integration?.plugin_id && connectorDisplayName(s.name) === entry.display_name)?.id;
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
    const authorization = await startMcpAuthorization(serverId, { connectorKey: key });
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

/** Disconnect only the current user's connection on this exact installation. */
export async function disconnectConnectorInstallation(serverId: string): Promise<ConnectorConnection | null> {
  const mine = (await listConnections()).find((connection) => connection.server_id === serverId);
  return mine ? disconnectConnection(mine.id) : null;
}
