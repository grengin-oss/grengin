// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

import { Router } from 'express'
import { requireAuth } from '../lib/middleware.js'

const router = Router()

interface MockMcpServer {
  id: string
  name: string
  description: string | null
  transport_type: string
  connection_config: Record<string, unknown>
  client_id: string | null
  client_secret_configured: boolean
  client_secret_preview: string
  url: string | null
  enabled: boolean
  status: string
  status_message: string | null
  tool_count: number
  default_access: string | null
  last_connected_at: string | null
  last_synced_at: string | null
  created_at: string
  updated_at: string
  auth_type: 'none' | 'api_key' | 'oauth2'
  auth_mode: 'organization' | 'per_user' | null
  oauth_provider: string | null
  scopes: string[] | null
  auth_url: string | null
  token_url: string | null
  org_connection: unknown | null
  connected_users_count: number | null
}

const now = new Date().toISOString()
const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString()

const servers: MockMcpServer[] = [
  {
    id: 'srv-001',
    name: 'slack-mcp-oauth',
    description: 'Slack MCP server via Http using OAuth user token.',
    transport_type: 'http',
    connection_config: { oauth: { redirect_url: 'http://localhost:5174/mcp/oauth/callback' } },
    client_id: 'slack-client-id',
    client_secret_configured: true,
    client_secret_preview: '••••••••',
    url: 'https://slack.example.com/mcp',
    enabled: true,
    status: 'connected',
    status_message: null,
    tool_count: 14,
    default_access: 'allow',
    last_connected_at: minutesAgo(0),
    last_synced_at: minutesAgo(35),
    created_at: now,
    updated_at: now,
    auth_type: 'oauth2',
    auth_mode: 'per_user',
    oauth_provider: 'slack',
    scopes: ['chat:write', 'channels:history', 'users:read'],
    auth_url: 'https://slack.com/oauth/v2/authorize',
    token_url: 'https://slack.com/api/oauth.v2.access',
    org_connection: null,
    connected_users_count: 12,
  },
  {
    id: 'srv-002',
    name: 'Postgres-mcp',
    description: 'SQLx PostgreSQL MCP server for schema discovery and ad-hoc SELECT queries.',
    transport_type: 'stdio',
    connection_config: { timeout: 8000, retries: 3, pool_size: 5, ssl: true },
    client_id: null,
    client_secret_configured: false,
    client_secret_preview: '',
    url: null,
    enabled: true,
    status: 'connected',
    status_message: null,
    tool_count: 7,
    default_access: 'allow',
    last_connected_at: minutesAgo(4),
    last_synced_at: minutesAgo(120),
    created_at: now,
    updated_at: now,
    auth_type: 'none',
    auth_mode: null,
    oauth_provider: null,
    scopes: null,
    auth_url: null,
    token_url: null,
    org_connection: null,
    connected_users_count: null,
  },
  {
    id: 'srv-003',
    name: 'supabase-mcp-oauth',
    description: 'Supabase remote MCP (OAuth) — project scoped and read-only access.',
    transport_type: 'http',
    connection_config: { oauth: { redirect_url: 'http://localhost:5174/mcp/oauth/callback' } },
    client_id: 'supabase-client-id',
    client_secret_configured: true,
    client_secret_preview: '••••••••',
    url: 'https://supabase.example.com/mcp',
    enabled: false,
    status: 'disconnected',
    status_message: 'Not connected',
    tool_count: 0,
    default_access: null,
    last_connected_at: null,
    last_synced_at: null,
    created_at: now,
    updated_at: now,
    auth_type: 'oauth2',
    auth_mode: 'organization',
    oauth_provider: 'custom',
    scopes: null,
    auth_url: 'https://supabase.example.com/oauth/authorize',
    token_url: 'https://supabase.example.com/oauth/token',
    org_connection: null,
    connected_users_count: null,
  },
]

const accessRules: Record<string, unknown[]> = {
  'srv-001': [
    {
      id: 'rule-001',
      access_type: 'department',
      permission: 'full',
      role_id: null,
      role_name: null,
      department_id: 'dept-001',
      department_name: 'Engineering',
      user_id: null,
      user_email: null,
      inherit_departments: true,
      priority: 10,
    },
  ],
}

const toolAccess: Record<string, unknown[]> = {
  'srv-001': [
    {
      tool_id: 'tool-001',
      server_id: 'srv-001',
      tool_name: 'post_message',
      inherit_from_server: true,
      rules: [],
    },
    {
      tool_id: 'tool-002',
      server_id: 'srv-001',
      tool_name: 'list_channels',
      inherit_from_server: false,
      rules: [
        {
          id: 'rule-101',
          access_type: 'department',
          permission: 'read_only',
          role_id: null,
          role_name: null,
          department_id: 'dept-001',
          department_name: 'Engineering',
          user_id: null,
          user_email: null,
          inherit_departments: false,
          priority: 10,
        },
      ],
    },
  ],
}

function findServer(id: string) {
  return servers.find((server) => server.id === id)
}

router.get('/admin/mcp-servers', requireAuth, (_req, res) => {
  res.json({ servers, total: servers.length })
})

router.get('/admin/mcp-servers/:id', requireAuth, (req, res) => {
  const server = findServer(req.params.id)
  if (!server) return res.status(404).json({ detail: 'Not Found' })
  res.json(server)
})

router.post('/admin/mcp-servers', requireAuth, (req, res) => {
  const body = req.body ?? {}
  const created: MockMcpServer = {
    id: `srv-${String(servers.length + 1).padStart(3, '0')}`,
    name: body.name ?? 'untitled',
    description: body.description ?? null,
    transport_type: body.transport_type ?? 'http',
    connection_config: body.connection_config ?? {},
    client_id: body.client_id || null,
    client_secret_configured: Boolean(body.client_secret),
    client_secret_preview: body.client_secret ? '••••••••' : '',
    url: body.url || null,
    enabled: body.enabled ?? true,
    status: 'disconnected',
    status_message: null,
    tool_count: 0,
    default_access: body.default_access ?? null,
    last_connected_at: null,
    last_synced_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    auth_type: body.auth_type ?? 'none',
    auth_mode: body.auth_mode ?? null,
    oauth_provider: body.oauth_provider ?? null,
    scopes: body.scopes ?? null,
    auth_url: body.auth_url ?? null,
    token_url: body.token_url ?? null,
    org_connection: null,
    connected_users_count: null,
  }
  servers.push(created)
  res.status(201).json(created)
})

router.put('/admin/mcp-servers/:id', requireAuth, (req, res) => {
  const server = findServer(req.params.id)
  if (!server) return res.status(404).json({ detail: 'Not Found' })
  Object.assign(server, req.body ?? {}, { updated_at: new Date().toISOString() })
  res.json(server)
})

router.delete('/admin/mcp-servers/:id', requireAuth, (req, res) => {
  const index = servers.findIndex((server) => server.id === req.params.id)
  if (index === -1) return res.status(404).json({ detail: 'Not Found' })
  servers.splice(index, 1)
  res.status(204).end()
})

// Postgres always fails its test so the error-state card is reachable in the
// mock, mirroring the design's own error example.
router.post('/admin/mcp-servers/:id/test', requireAuth, (req, res) => {
  const server = findServer(req.params.id)
  if (!server) return res.status(404).json({ detail: 'Not Found' })
  if (server.id === 'srv-002') {
    return res.json({
      success: false,
      message:
        'Timed out after 8s — the database may be unreachable or credentials may have expired.',
    })
  }
  server.last_connected_at = new Date().toISOString()
  server.status = 'connected'
  res.json({ success: true, latency_ms: 128 })
})

router.post('/admin/mcp-servers/:id/sync-tools', requireAuth, (req, res) => {
  const server = findServer(req.params.id)
  if (!server) return res.status(404).json({ detail: 'Not Found' })
  server.last_synced_at = new Date().toISOString()
  server.tool_count = server.tool_count || 3
  res.status(204).end()
})

router.get('/admin/mcp-servers/:id/access', requireAuth, (req, res) => {
  const server = findServer(req.params.id)
  if (!server) return res.status(404).json({ detail: 'Not Found' })
  res.json({
    server_id: server.id,
    default_access: 'all_users',
    rules: accessRules[server.id] ?? [],
  })
})

router.get('/admin/mcp-servers/:id/tools/access', requireAuth, (req, res) => {
  res.json(toolAccess[req.params.id] ?? [])
})

router.get('/admin/mcp-servers/:id/connection', requireAuth, (req, res) => {
  const server = findServer(req.params.id)
  if (!server) return res.status(404).json({ detail: 'Not Found' })
  res.json(server.org_connection ?? { connected: false })
})

router.get('/admin/mcp-servers/:id/connections/count', requireAuth, (req, res) => {
  const server = findServer(req.params.id)
  res.json({ count: server?.connected_users_count ?? 0 })
})

export default router
