// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

import { get } from 'svelte/store';
import { _ } from 'svelte-i18n';
import { authorizeMcpConnection } from './integrations.js';
import { listConnections, rememberConnectorTransaction } from './admin/connectors.js';

/** The user's account is already connected to this connector through another installed server. */
export class ConnectedElsewhere extends Error {
  constructor(readonly otherServerId: string) {
    super(get(_)('connectors.errors.connectedElsewhere'));
  }
}

export type McpAuthorization =
  | { connected: true }
  | { connected: false; authorizationUrl: string; brokerConnectionId?: string };

/** Resume authorization on the existing installation. Retries never disconnect it. */
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
  const reply = await authorizeMcpConnection(serverId);
  if (reply.status === 'connected') return { connected: true };
  const url = reply.authorization_url;
  if (!url) return null;
  if (!reply.broker_connection_id) return { connected: false, authorizationUrl: url };
  rememberConnectorTransaction(reply.broker_connection_id, url);
  return { connected: false, authorizationUrl: url, brokerConnectionId: reply.broker_connection_id };
}
