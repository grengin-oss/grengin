// GET /mcp-servers
export interface McpServerTool {
  description: string;
  name: string;
}

export interface McpServer {
  connected: boolean;
  description: string;
  icon: string;
  id: string;
  name: string;
  tools: McpServerTool[];
  transport_type: string;
}

export interface McpServerListResponse {
  servers: McpServer[];
}

// GET /mcp/connections
export interface McpConnection {
  connected: boolean;
  connected_at: string;
  description: string;
  expires_at: string;
  scopes: string[];
  server_id: string;
  server_name: string;
}

export interface McpConnectionListResponse {
  connections: McpConnection[];
}

// POST /mcp/connections/{id}/authorize
export interface McpAuthorizeResponse {
  authorization_url: string;
  message: string;
  success: boolean;
}

// POST /mcp/connections/{id}/disconnect
export interface McpDisconnectResponse {
  message: string;
  success: boolean;
}

// GET /mcp/oauth/callback
export interface McpOAuthCallbackResponse {
  server_id: string;
  status: string;
  success: boolean;
}

// GET /mcp/tools
export interface McpToolDetail {
  description: string;
  enabled: boolean;
  id: string;
  inherit_access_from_server: boolean;
  input_schema: Record<string, unknown>;
  is_read_only: boolean;
  last_synced_at: string;
  name: string;
  original_name: string;
  parameters: Record<string, unknown>;
  server_id: string;
  server_name: string;
}

export interface McpToolListResponse {
  tools: McpToolDetail[];
  total: number;
}
