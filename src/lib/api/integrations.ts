import { request } from './client.js';
import type {
  McpServerListResponse,
  McpConnectionListResponse,
  McpAuthorizeResponse,
  McpDisconnectResponse,
  McpOAuthCallbackResponse,
  McpToolListResponse,
} from '../types/integrations.js';

export async function getMcpServers(params?: {
  connected?: boolean;
  transport_type?: string;
}): Promise<McpServerListResponse> {
  const query = new URLSearchParams();
  if (params?.connected !== undefined) query.set('connected', String(params.connected));
  if (params?.transport_type) query.set('transport_type', params.transport_type);
  const qs = query.toString();
  return request<McpServerListResponse>(`/mcp-servers${qs ? `?${qs}` : ''}`, {});
}

export async function getMcpConnections(): Promise<McpConnectionListResponse> {
  return request<McpConnectionListResponse>('/mcp/connections', {});
}

export async function authorizeMcpConnection(serverId: string): Promise<McpAuthorizeResponse> {
  return request<McpAuthorizeResponse>(`/mcp/connections/${serverId}/authorize`, {
    method: 'POST',
  });
}

export async function disconnectMcpConnection(serverId: string): Promise<McpDisconnectResponse> {
  return request<McpDisconnectResponse>(`/mcp/connections/${serverId}/disconnect`, {
    method: 'POST',
  });
}

export async function mcpOAuthCallback(params: {
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
}): Promise<McpOAuthCallbackResponse> {
  const query = new URLSearchParams();
  if (params.code) query.set('code', params.code);
  if (params.state) query.set('state', params.state);
  if (params.error) query.set('error', params.error);
  if (params.error_description) query.set('error_description', params.error_description);
  return request<McpOAuthCallbackResponse>(`/mcp/oauth/callback?${query.toString()}`, {});
}

export async function getMcpTools(params?: {
  server_id?: string;
  search?: string;
}): Promise<McpToolListResponse> {
  const query = new URLSearchParams();
  if (params?.server_id) query.set('server_id', params.server_id);
  if (params?.search) query.set('search', params.search);
  const qs = query.toString();
  return request<McpToolListResponse>(`/mcp/tools${qs ? `?${qs}` : ''}`, {});
}
