// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

import { ApiError } from './client.js';
import { authorizeMcpConnection, disconnectMcpConnection } from './integrations.js';
import { rememberConnectorTransaction } from './admin/connectors.js';
import type { McpAuthorizeResponse } from '../types/integrations.js';

export type McpAuthorization =
  | { connected: true }
  | { connected: false; authorizationUrl: string };

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
 * Returns null when the server gave no way to continue.
 */
export async function startMcpAuthorization(serverId: string): Promise<McpAuthorization | null> {
  let reply = await authorizeOrRestart(serverId);
  if (!reply) {
    await disconnectMcpConnection(serverId);
    reply = await authorizeMcpConnection(serverId);
  }
  if (reply.status === 'connected') return { connected: true };
  const url = reply.authorization_url;
  if (!url) return null;
  if (reply.broker_connection_id) rememberConnectorTransaction(reply.broker_connection_id, url);
  return { connected: false, authorizationUrl: url };
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
