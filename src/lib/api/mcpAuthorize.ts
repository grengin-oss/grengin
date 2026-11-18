// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

import { get } from 'svelte/store';
import { _ } from 'svelte-i18n';
import { ApiError } from './client.js';
import { authorizeMcpConnection, disconnectMcpConnection } from './integrations.js';
import { listConnections, rememberConnectorTransaction } from './admin/connectors.js';
import type { McpAuthorizeResponse } from '../types/integrations.js';

/** The user's account is already connected to this connector through another installed server. */
export class ConnectedElsewhere extends Error {
  constructor(readonly otherServerId: string) {
    super(get(_)('connectors.errors.connectedElsewhere'));
  }
}

export type McpAuthorization =
  | { connected: true }
  | { connected: false; authorizationUrl: string; brokerConnectionId?: string };

/**
 * Start (or resume) an MCP server sign-in for the current user.
 *
 * Native plugin servers delegate OAuth to the Grengin broker: the reply carries
 * broker_connection_id, and /mcp/oauth/callback only completes the connection
 * when this tab recorded the matching transaction first. An earlier broker
 * attempt that can no longer finish (its browser return was lost, or it
 * expired / failed / was revoked) is disconnected once and started again.
 *
 * Call before navigating or opening the popup: window.open copies this tab's
 * sessionStorage into the new window.
 *
 * `reconnect` is the user asking to sign in again: a live broker connection is
 * replaced by a fresh one, because the broker only shows its approval page and
 * the provider login for a new connection. Without it, a live connection
 * simply reports `connected`.
 *
 * Returns null when the server gave no way to continue.
 */
export async function startMcpAuthorization(
  serverId: string,
  options: { reconnect?: boolean; connectorKey?: string } = {},
): Promise<McpAuthorization | null> {
  // A user holds one connection per connector. Another installation's connection must be
  // disconnected there on purpose, never replaced or disconnected as a side effect of this one.
  if (options.connectorKey) {
    const other = (await listConnections()).find(
      (c) => c.connector_key === options.connectorKey && !!c.server_id && c.server_id !== serverId,
    );
    if (other?.server_id) throw new ConnectedElsewhere(other.server_id);
  }
  let reply = await authorizeOrRestart(serverId);
  if (reply?.status === 'connected' && reply.broker_connection_id && options.reconnect) reply = null;
  if (!reply) {
    await disconnectMcpConnection(serverId);
    reply = await authorizeMcpConnection(serverId);
  }
  if (reply.status === 'connected') return { connected: true };
  const url = reply.authorization_url;
  if (!url) return null;
  if (!reply.broker_connection_id) return { connected: false, authorizationUrl: url };
  rememberConnectorTransaction(reply.broker_connection_id, url);
  return { connected: false, authorizationUrl: url, brokerConnectionId: reply.broker_connection_id };
}

async function authorizeOrRestart(serverId: string): Promise<McpAuthorizeResponse | null> {
  try {
    const reply = await authorizeMcpConnection(serverId);
    const stranded = reply.broker_connection_id && !reply.authorization_url && reply.status !== 'connected';
    return stranded ? null : reply;
  } catch (error) {
    // 409: the previous broker connection expired, failed or was revoked.
    if (error instanceof ApiError && error.status === 409) return null;
    throw error;
  }
}
