// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

import { request } from './client.js';
import { cachedLoad, clearCacheNamespace, makeScopedCacheKey } from '../utils/cache.js';
import type {
  McpServerListResponse,
  McpConnectionListResponse,
  McpAuthorizeResponse,
  McpDisconnectResponse,
  McpOAuthCallbackResponse,
  McpToolListResponse,
} from '../types/integrations.js';

const SETTINGS_CACHE_TTL_MS = 5 * 60_000;

function invalidateSettingsCache(): void {
  clearCacheNamespace('settings');
}

export async function getMcpServers(params?: {
  connected?: boolean;
  transport_type?: string;
}): Promise<McpServerListResponse> {
  const query = new URLSearchParams();
  if (params?.connected !== undefined) query.set('connected', String(params.connected));
  if (params?.transport_type) query.set('transport_type', params.transport_type);
  const qs = query.toString();
  const cacheKey = makeScopedCacheKey('settings', ['mcp-servers', qs]);
  return cachedLoad(
    cacheKey,
    () => request<McpServerListResponse>(`/mcp-servers${qs ? `?${qs}` : ''}`, {}),
    { ttlMs: SETTINGS_CACHE_TTL_MS },
  );
}

export async function getMcpConnections(): Promise<McpConnectionListResponse> {
  const cacheKey = makeScopedCacheKey('settings', ['mcp-connections']);
  return cachedLoad(cacheKey, () => request<McpConnectionListResponse>('/mcp/connections', {}), {
    ttlMs: SETTINGS_CACHE_TTL_MS,
  });
}

export async function authorizeMcpConnection(serverId: string): Promise<McpAuthorizeResponse> {
  return request<McpAuthorizeResponse>(`/mcp/connections/${serverId}/authorize`, {
    method: 'POST',
  });
}

export async function disconnectMcpConnection(serverId: string): Promise<McpDisconnectResponse> {
  const response = await request<McpDisconnectResponse>(`/mcp/connections/${serverId}/disconnect`, {
    method: 'POST',
  });
  invalidateSettingsCache();
  return response;
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
  const response = await request<McpOAuthCallbackResponse>(`/mcp/oauth/callback?${query.toString()}`, {});
  invalidateSettingsCache();
  return response;
}

export async function getMcpTools(params?: {
  server_id?: string;
  search?: string;
}): Promise<McpToolListResponse> {
  const query = new URLSearchParams();
  if (params?.server_id) query.set('server_id', params.server_id);
  if (params?.search) query.set('search', params.search);
  const qs = query.toString();
  const cacheKey = makeScopedCacheKey('settings', ['mcp-tools', qs]);
  return cachedLoad(
    cacheKey,
    () => request<McpToolListResponse>(`/mcp/tools${qs ? `?${qs}` : ''}`, {}),
    { ttlMs: SETTINGS_CACHE_TTL_MS },
  );
}
