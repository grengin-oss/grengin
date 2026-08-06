// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

import { request } from '../client.js';
import type {
  MCPServer,
  MCPServerListResponse,
  McpServerAccessResponse,
  McpAccessRuleCreatePayload,
  McpToolAccess,
  McpToolAccessUpdatePayload,
  McpBulkToolAccessUpdatePayload,
  McpBulkToolAccessResponse,
  McpDefaultAccess,
  McpAuthType,
  McpAuthMode,
  McpOAuthProvider,
  McpOrgConnection,
} from '../../admin/types.js';

export type McpAuthorizeConnectionResponse = {
  success: boolean;
  authorization_url: string;
  message?: string;
};

export async function getMcpServers(): Promise<MCPServerListResponse> {
  return request<MCPServerListResponse>('/admin/mcp-servers', {
    method: 'GET',
  });
}

export async function getMcpServer(serverId: string): Promise<MCPServer> {
  return request<MCPServer>(`/admin/mcp-servers/${serverId}`, {
    method: 'GET',
  });
}

export async function createMcpServer(payload: {
  client_id: string;
  client_secret: string;
  connection_config: Record<string, unknown>;
  default_access: string | null;
  description: string;
  enabled: boolean;
  name: string;
  transport_type: string;
  url: string | null;
  auth_type?: McpAuthType;
  auth_mode?: McpAuthMode | null;
  oauth_provider?: McpOAuthProvider | null;
  scopes?: string[] | null;
  auth_url?: string | null;
  token_url?: string | null;
}): Promise<MCPServer> {
  return request<MCPServer>('/admin/mcp-servers', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateMcpServer(
  serverId: string,
  payload: Partial<{
    client_id: string | null;
    client_secret: string | null;
    connection_config: Record<string, unknown>;
    default_access: string | null;
    description: string | null;
    enabled: boolean;
    name: string;
    transport_type: string;
    url: string | null;
    auth_type: McpAuthType;
    auth_mode: McpAuthMode | null;
    oauth_provider: McpOAuthProvider | null;
    scopes: string[] | null;
    auth_url: string | null;
    token_url: string | null;
  }>
): Promise<MCPServer> {
  return request<MCPServer>(`/admin/mcp-servers/${serverId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteMcpServer(serverId: string): Promise<void> {
  await request<void>(`/admin/mcp-servers/${serverId}`, {
    method: 'DELETE',
  });
}

export async function syncMcpServerTools(serverId: string): Promise<void> {
  await request<void>(`/admin/mcp-servers/${serverId}/sync-tools`, {
    method: 'POST',
  });
}

export type McpTestConnectionResponse = {
  success: boolean;
  message?: string;
  latency_ms?: number;
};

export async function testMcpConnection(
  serverId: string
): Promise<McpTestConnectionResponse> {
  return request<McpTestConnectionResponse>(
    `/admin/mcp-servers/${serverId}/test`,
    { method: 'POST' }
  );
}

export async function authorizeMcpConnection(
  serverId: string
): Promise<McpAuthorizeConnectionResponse> {
  return request<McpAuthorizeConnectionResponse>(
    `/mcp/connections/${serverId}/authorize`,
    {
      method: 'POST',
    }
  );
}

export async function completeMcpOAuth(
  code: string,
  state: string
): Promise<{ success: boolean; message?: string }> {
  const params = new URLSearchParams({ code, state });
  return request<{ success: boolean; message?: string }>(
    `/mcp/oauth/callback?${params.toString()}`,
    {
      method: 'GET',
    }
  );
}

export async function getOrgConnection(
  serverId: string
): Promise<McpOrgConnection> {
  return request<McpOrgConnection>(
    `/admin/mcp-servers/${serverId}/connection`,
    { method: 'GET' }
  );
}

export async function disconnectOrgConnection(
  serverId: string
): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(
    `/admin/mcp-servers/${serverId}/connection/disconnect`,
    { method: 'POST' }
  );
}

export async function getConnectedUsersCount(
  serverId: string
): Promise<{ count: number }> {
  return request<{ count: number }>(
    `/admin/mcp-servers/${serverId}/connections/count`,
    { method: 'GET' }
  );
}

export async function getServerAccess(serverId: string): Promise<McpServerAccessResponse> {
  return request<McpServerAccessResponse>(`/admin/mcp-servers/${serverId}/access`, {
    method: 'GET',
  });
}

export async function updateServerDefaultAccess(
  serverId: string,
  defaultAccess: McpDefaultAccess | null
): Promise<McpServerAccessResponse> {
  return request<McpServerAccessResponse>(`/admin/mcp-servers/${serverId}/access/default`, {
    method: 'PUT',
    body: JSON.stringify({ default_access: defaultAccess }),
  });
}

export async function createServerAccessRule(
  serverId: string,
  rule: McpAccessRuleCreatePayload
): Promise<McpServerAccessResponse> {
  return request<McpServerAccessResponse>(`/admin/mcp-servers/${serverId}/access/rules`, {
    method: 'POST',
    body: JSON.stringify(rule),
  });
}

export async function deleteServerAccessRule(
  serverId: string,
  ruleId: string
): Promise<void> {
  await request<void>(`/admin/mcp-servers/${serverId}/access/rules/${ruleId}`, {
    method: 'DELETE',
  });
}

export async function getServerToolsAccess(serverId: string): Promise<McpToolAccess[]> {
  return request<McpToolAccess[]>(`/admin/mcp-servers/${serverId}/tools/access`, {
    method: 'GET',
  });
}

export async function updateServerToolsAccess(
  serverId: string,
  payload: McpBulkToolAccessUpdatePayload
): Promise<McpBulkToolAccessResponse> {
  return request<McpBulkToolAccessResponse>(`/admin/mcp-servers/${serverId}/tools/access`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function getToolAccess(toolId: string): Promise<McpToolAccess> {
  return request<McpToolAccess>(`/admin/mcp-tools/${toolId}/access`, {
    method: 'GET',
  });
}

export async function updateToolAccess(
  toolId: string,
  payload: McpToolAccessUpdatePayload
): Promise<McpToolAccess> {
  return request<McpToolAccess>(`/admin/mcp-tools/${toolId}/access`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}
