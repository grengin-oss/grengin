// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

import { Router } from 'express'
import { requireAuth } from '../lib/middleware.js'

const router = Router()

interface MockMcpServer {
  id: string
  name: string
  description: string | null
  icon: string | null
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
    icon: 'https://meta.grengin.com/connectors/icons/slack.svg',
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
    icon: null,
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
    icon: null,
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
    icon: body.icon ?? null,
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

router.put('/admin/mcp-servers/:id/access/default', requireAuth, (req, res) => {
  const server = findServer(req.params.id)
  if (!server) return res.status(404).json({ detail: 'Not Found' })
  if (typeof req.body?.default_access === 'string' || req.body?.default_access === null) {
    server.default_access = req.body.default_access
  }
  res.json({
    server_id: server.id,
    default_access: server.default_access,
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

// ---------------------------------------------------------------------------
// Connector detail / overview (native connector-plugin contract).
//   GET /admin/mcp-servers/:id/overview
//   GET /admin/mcp-servers/:id/people
//   GET /admin/mcp-servers/:id/executions
//   PUT /admin/mcp-servers/:id/tools/:toolId   (enable/disable one tool)
// Swagger-shaped stubs derived from the in-memory servers above. Workspace
// numbers (people, usage) have no real source, so they are deterministic
// per-server fixtures.
// ---------------------------------------------------------------------------

type OverviewTool = {
  id: string
  server_id: string
  server_name: string
  name: string
  original_name: string
  description: string
  enabled: boolean
  is_read_only: boolean
  inherit_access_from_server: boolean
  input_schema: Record<string, unknown>
  parameters: Record<string, unknown>
  last_synced_at: string
}

/** Tool fixtures per server, created lazily and mutated by the PUT endpoint. */
const overviewTools: Record<string, OverviewTool[]> = {}

function toolsFor(server: MockMcpServer): OverviewTool[] {
  if (overviewTools[server.id]) return overviewTools[server.id]
  const names = [
    ['list_conversations', 'Read the channels and DMs the account can see.'],
    ['get_conversation_history', 'Read recent messages in a channel or thread.'],
    ['list_users', 'List members of the workspace.'],
    ['search_messages', 'Search messages the account can access.'],
  ]
  const count = Math.max(1, Math.min(server.tool_count || names.length, names.length))
  overviewTools[server.id] = names.slice(0, count).map(([name, description], i) => ({
    id: `${server.id}-tool-${String(i + 1).padStart(2, '0')}`,
    server_id: server.id,
    server_name: server.name,
    name,
    original_name: name,
    description,
    enabled: true,
    is_read_only: true,
    inherit_access_from_server: true,
    input_schema: {},
    parameters: {},
    last_synced_at: server.last_synced_at ?? new Date().toISOString(),
  }))
  return overviewTools[server.id]
}

router.get('/admin/mcp-servers/:id/overview', requireAuth, (req, res) => {
  const server = findServer(req.params.id)
  if (!server) return res.status(404).json({ detail: 'Not Found' })
  const tools = toolsFor(server)
  // Treat the stored count as the workspace size; connected is a subset of it
  // so "Connected by X of Y" always reads X <= Y.
  const total = server.connected_users_count ?? 0
  const connected = Math.round(total * 0.7)
  const nowIso = new Date().toISOString()
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString()
  res.json({
    server_id: server.id,
    name: server.name,
    description: server.description ?? '',
    icon: server.icon ?? '',
    enabled: server.enabled,
    default_access: server.default_access ?? 'explicit_only',
    my_connection_state: server.status === 'connected' ? 'connected' : 'not_connected',
    active_user_count: total,
    connected_user_count: connected,
    reminders_supported: false,
    write_confirmation_supported: false,
    integration: {
      authentication: server.auth_type === 'api_key' ? 'api_token' : server.auth_type === 'oauth2' ? 'oauth2' : 'server_managed',
      per_user_credentials: server.auth_mode === 'per_user',
      plugin_id: server.oauth_provider ?? server.name.toLowerCase().replace(/\s+/g, '-'),
      plugin_version: '1.1.0',
      suggested_prompts:
        server.oauth_provider === 'slack'
          ? ['Catch me up on #general from this week.', 'What did the team decide about the launch?']
          : [],
      supported_authentication: [
        server.auth_type === 'api_key' ? 'api_token' : server.auth_type === 'oauth2' ? 'oauth2' : 'server_managed',
      ],
    },
    access: {
      server_id: server.id,
      server_name: server.name,
      default_access: server.default_access ?? 'explicit_only',
      rules: accessRules[server.id] ?? [],
    },
    tools,
    topic_groups: [
      {
        id: `${server.id}-grp-read`,
        name: 'Read',
        description: 'Read-only access to messages and members.',
        state: 'enabled',
        tool_ids: tools.map((t) => t.id),
      },
    ],
    usage: {
      tool_calls: connected * 14,
      successful_tool_calls: connected * 13,
      failed_tool_calls: connected,
      period_start: weekAgo,
      period_end: nowIso,
    },
  })
})

router.get('/admin/mcp-servers/:id/people', requireAuth, (req, res) => {
  const server = findServer(req.params.id)
  if (!server) return res.status(404).json({ detail: 'Not Found' })
  const limit = Math.max(1, Math.min(Number(req.query.limit) || 20, 100))
  const offset = Math.max(0, Number(req.query.offset) || 0)
  const total = server.connected_users_count ?? 0
  const states = ['connected', 'connected', 'needs_reconnect', 'not_connected'] as const
  const all = Array.from({ length: total }, (_, i) => ({
    user_id: `${server.id}-user-${String(i + 1).padStart(3, '0')}`,
    user_email: `member${i + 1}@example.com`,
    name: `Member ${i + 1}`,
    avatar_url: null,
    connection_state: states[i % states.length],
    connected_at: i % states.length === 3 ? null : new Date(Date.now() - i * 3_600_000).toISOString(),
    last_active_at: new Date(Date.now() - i * 1_800_000).toISOString(),
  }))
  res.json({ people: all.slice(offset, offset + limit), limit, offset, total })
})

router.get('/admin/mcp-servers/:id/executions', requireAuth, (req, res) => {
  const server = findServer(req.params.id)
  if (!server) return res.status(404).json({ detail: 'Not Found' })
  const limit = Math.max(1, Math.min(Number(req.query.limit) || 20, 100))
  const offset = Math.max(0, Number(req.query.offset) || 0)
  const tools = toolsFor(server)
  const total = 24
  const all = Array.from({ length: total }, (_, i) => {
    const tool = tools[i % tools.length]
    const isError = i % 7 === 0
    return {
      id: `${server.id}-exec-${String(i + 1).padStart(3, '0')}`,
      server_id: server.id,
      server_name: server.name,
      tool_name: tool.name,
      user_id: `${server.id}-user-${String((i % 5) + 1).padStart(3, '0')}`,
      user_email: `member${(i % 5) + 1}@example.com`,
      conversation_id: `conv-${String(i + 1).padStart(4, '0')}`,
      arguments: {},
      result: {},
      is_error: isError,
      duration_ms: 90 + ((i * 37) % 400),
      executed_at: new Date(Date.now() - i * 1_200_000).toISOString(),
    }
  })
  res.json({ executions: all.slice(offset, offset + limit), limit, offset, total })
})

router.put('/admin/mcp-servers/:id/tools/:toolId', requireAuth, (req, res) => {
  // Preserve the existing bulk access route: PUT /tools/access is handled
  // elsewhere, not as a per-tool toggle.
  if (req.params.toolId === 'access') return res.status(404).json({ detail: 'Not Found' })
  const server = findServer(req.params.id)
  if (!server) return res.status(404).json({ detail: 'Not Found' })
  const tool = toolsFor(server).find((t) => t.id === req.params.toolId)
  if (!tool) return res.status(404).json({ detail: 'Not Found' })
  if (typeof req.body?.enabled === 'boolean') tool.enabled = req.body.enabled
  res.json(tool)
})

export default router
