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
import { getMcpServers, syncMcpServerTools } from './mcpServers.js';
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
// once by an admin before anyone connects: its versioned manifest becomes an
// MCP server (POST /admin/mcp-servers), and the backend returns that server's
// id. Connecting then sends that id as server_id. Never created implicitly on
// connect — that would override the admin's access choice.
// ---------------------------------------------------------------------------

/** The versioned manifest, meta.grengin.com/connectors/<key>/versions/<v>.json. */
export interface ConnectorManifest {
  key: string;
  version: string;
  connection: {
    transport_type: string;
    url: string;
    auth: { type: string; auth_url: string; token_url: string; scopes: string[] };
  };
}

export type ConnectorServerAccess = 'admin_only' | 'all_users';

export async function fetchConnectorManifest(
  key: string,
  version: string,
): Promise<ConnectorManifest> {
  return getJson<ConnectorManifest>(`${META_BASE}/connectors/${key}/versions/${version}.json`);
}

function brokerServerName(entry: ConnectorCatalogEntry): string {
  return `${entry.display_name} (Grengin broker)`;
}

/** The MCP server an admin added for this connector, if any. */
export function findConnectorServer(servers: MCPServer[], key: string): MCPServer | undefined {
  return servers.find((s) => s.connection_config?.grengin_connector_key === key);
}

/** Admin: add a connector as an MCP server. Returns the existing one if already added. */
export async function addConnector(
  key: string,
  access: ConnectorServerAccess = 'admin_only',
): Promise<MCPServer> {
  const [catalog, list] = await Promise.all([fetchCatalog(), getMcpServers()]);
  const existing = findConnectorServer(list.servers, key);
  if (existing) return existing;
  const entry = catalog.catalog.find((c) => c.key === key);
  if (!entry?.latestVersion) throw new Error(t('errors.noVersion'));
  const manifest = await fetchConnectorManifest(key, entry.latestVersion);
  if (manifest.key !== key || manifest.version !== entry.latestVersion || !manifest.connection?.url) {
    throw new Error(t('errors.manifestMismatch'));
  }
  const { auth } = manifest.connection;
  return request<MCPServer>('/admin/mcp-servers', {
    method: 'POST',
    body: JSON.stringify({
      name: brokerServerName(entry),
      description: entry.description,
      transport_type: manifest.connection.transport_type,
      url: manifest.connection.url,
      enabled: true,
      default_access: access,
      client_id: 'broker-managed',
      connection_config: {
        grengin_connector_key: manifest.key,
        oauth: { auth_url: auth.auth_url, token_url: auth.token_url, scopes: auth.scopes },
      },
    }),
  });
}

/**
 * The added server's id for this connector. Admins see connection_config on
 * /admin/mcp-servers; other users only get their accessible servers from
 * /mcp-servers, matched by the name the admin step gave it.
 */
async function connectorServerId(entry: ConnectorCatalogEntry): Promise<string | undefined> {
  try {
    return findConnectorServer((await getMcpServers()).servers, entry.key)?.id;
  } catch (err) {
    if (!(err instanceof ApiError && err.status === 403)) throw err;
    const { servers } = await getUserMcpServers();
    return servers.find((s) => s.name === brokerServerName(entry))?.id;
  }
}

/**
 * Connect the signed-in user's own account (real /connectors OAuth flow) to the
 * connector's added MCP server. Call from the click handler: the consent popup
 * is opened before the first await.
 */
export async function connectConnector(key: string): Promise<ConnectorConnection> {
  const popup = openBlankConsentPopup();
  try {
    const catalog = await fetchCatalog();
    const entry = catalog.catalog.find((c) => c.key === key);
    if (!entry) throw new Error(t('errors.unknown'));
    const serverId = await connectorServerId(entry);
    if (!serverId) throw new Error(t('errors.notAdded'));
    // A stale attempt (pending, expired, failed…) must be cleared first: the
    // backend refuses a new start for a different server or version.
    const mine = findUserConnection(await listConnections(), key);
    if (mine && mine.status !== 'connected') {
      const result = await disconnectConnection(mine.id);
      if (result.revocation_pending) {
        throw new Error(t('errors.revocationPending'));
      }
    } else if (mine?.status === 'connected') {
      popup?.close();
      return mine;
    }
    return await connectAndWait(key, entry.latestVersion ?? '1.0.0', { serverId, popup });
  } catch (err) {
    popup?.close();
    throw err;
  }
}

/** Disconnect the signed-in user's own connection for this connector. */
export async function disconnectConnector(key: string): Promise<ConnectorConnection> {
  const connections = await listConnections();
  const mine = findUserConnection(connections, key);
  if (!mine) throw new Error(t('errors.noConnection'));
  return disconnectConnection(mine.id);
}
