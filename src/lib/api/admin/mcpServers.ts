import { request } from '../client.js';
import type { MCPServer, MCPServerListResponse } from '../../admin/types.js';

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
