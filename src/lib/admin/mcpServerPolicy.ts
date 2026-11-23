// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0
import type { MCPServer } from './types.js';
export function isRetiredSqlxServer(server: Pick<MCPServer, 'transport_type' | 'connection_config'>): boolean {
  if (server.transport_type !== 'stdio') return false;
  const config = server.connection_config ?? {};
  const stdio = config.stdio as { command?: unknown } | undefined;
  const command = stdio?.command ?? config.command;
  return typeof command === 'string' && /(?:^|[\\/])sqlx-mcp(?:\.exe)?$/i.test(command.trim());
}
