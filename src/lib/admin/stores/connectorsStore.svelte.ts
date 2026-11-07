// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

/**
 * Shared state for the Connectors redesign (ENGG-511). Holds the published
 * catalog, the MCP servers an admin has added for connectors, and the signed-in
 * user's own connections, so the home page and the detail page do not each
 * re-fetch them. Rune-based, mirroring the `aiEnginesStore` convention.
 */

import {
  fetchCatalog,
  findConnectorServer,
  listConnections,
  type ConnectorCatalog,
  type ConnectorCatalogEntry,
  type ConnectorConnection,
} from '$lib/api/admin/connectors.js';
import { getMcpServers } from '$lib/api/admin/mcpServers.js';
import type { MCPServer } from '$lib/admin/types.js';

class ConnectorsStore {
  catalog = $state<ConnectorCatalog | null>(null);
  /** Admin-added MCP servers (connection_config.grengin_connector_key set). */
  servers = $state<MCPServer[]>([]);
  /** The signed-in user's own broker connections (GET /connectors). */
  connections = $state<ConnectorConnection[]>([]);
  isLoading = $state(false);
  error = $state<string | null>(null);

  /** connector key -> the MCP server an admin added for it. */
  serverByKey = $derived.by(() => {
    const map = new Map<string, MCPServer>();
    for (const e of this.catalog?.catalog ?? []) {
      const server = findConnectorServer(this.servers, e.key);
      if (server) map.set(e.key, server);
    }
    return map;
  });

  /** Keys of connectors an admin has added. */
  addedKeys = $derived(new Set(this.serverByKey.keys()));

  /** Keys the signed-in user has connected. */
  connectedKeys = $derived(
    new Set(this.connections.filter((c) => c.status === 'connected').map((c) => c.connector_key)),
  );

  /** connector key -> catalog entry. */
  entryByKey = $derived.by(() => {
    const map = new Map<string, ConnectorCatalogEntry>();
    for (const e of this.catalog?.catalog ?? []) map.set(e.key, e);
    return map;
  });

  /** Load catalog, added servers and connections. Safe to call repeatedly; `force` refetches. */
  async load(force = false): Promise<void> {
    if (this.isLoading) return;
    if (this.catalog && !force) return;
    this.isLoading = true;
    this.error = null;
    try {
      const [catalog] = await Promise.all([fetchCatalog(), this.refresh()]);
      this.catalog = catalog;
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to load connectors';
    } finally {
      this.isLoading = false;
    }
  }

  /** Refresh added servers and connections (after add/connect/disconnect/enable). */
  async refresh(): Promise<void> {
    const [servers, connections] = await Promise.all([
      getMcpServers().then((r) => r.servers).catch(() => this.servers),
      listConnections().catch(() => this.connections),
    ]);
    this.servers = servers;
    this.connections = connections;
  }
}

export const connectorsStore = new ConnectorsStore();
