// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

import { Router } from 'express'
import { requireAuth } from '../lib/middleware.js'

const router = Router()

/** Mirrors `AuditLog` in src/lib/admin/types.ts (the admin endpoint is camelCase). */
interface MockAuditLog {
  id: string
  userId: string
  action: string
  resourceType: string
  resourceId: string | null
  details: Record<string, unknown>
  ipAddress: string
  userAgent: string
  createdAt: string
}

/** The action vocabulary the admin page localises (admin.auditLogs.actions.*). */
const ACTIONS = [
  'login',
  'message_sent',
  'conversation_created',
  'conversation_updated',
  'conversation_deleted',
  'file_uploaded',
  'user_system_prompt_set',
  'mcp_connection_authorized',
  'admin_user_created',
  'admin_user_updated',
  'admin_user_deleted',
  'admin_role_created',
  'admin_role_assigned_to_user',
  'admin_department_created',
  'admin_department_members_added',
  'admin_mcp_server_created',
  'admin_mcp_server_tools_synced',
  'admin_ai_engine_updated',
  'admin_branding_updated',
  'admin_role_prompt_updated',
] as const

const RESOURCE_TYPES: Record<string, string> = {
  login: 'auth',
  message_sent: 'conversation',
  conversation_created: 'conversation',
  conversation_updated: 'conversation',
  conversation_deleted: 'conversation',
  file_uploaded: 'file',
  user_system_prompt_set: 'user',
  mcp_connection_authorized: 'mcp_connection',
  admin_user_created: 'user',
  admin_user_updated: 'user',
  admin_user_deleted: 'user',
  admin_role_created: 'role',
  admin_role_assigned_to_user: 'role',
  admin_department_created: 'department',
  admin_department_members_added: 'department',
  admin_mcp_server_created: 'mcp_server',
  admin_mcp_server_tools_synced: 'mcp_server',
  admin_ai_engine_updated: 'ai_engine',
  admin_branding_updated: 'branding',
  admin_role_prompt_updated: 'role_prompt',
}

const USERS = [
  { id: '6bc782b8-932f-4889-bc42-aa81cc0016fa', email: 'agrani@grengin.com' },
  { id: '8a12bc90-1f4a-4d0c-9a71-1b70c9a1f2d3', email: 'admin@grengin.com' },
  { id: '3df8a211-6c2e-4d51-8b0a-2f9a5c7e1104', email: 'devi@grengin.com' },
  { id: '91e0fa3b-7d55-4a92-98c1-6e2d47b0aa19', email: 'kiran@grengin.com' },
  { id: '2fa88390-4c17-4f3e-b6d2-8ad0c1e93b77', email: 'rhea@grengin.com' },
]

const IPS = ['192.168.1.142', '192.168.1.155', '184.22.109.5', '72.140.28.91', '198.51.100.12']

const AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Firefox/133.0',
]

/** Deterministic pseudo-random so a reload keeps the same log book. */
function seeded(index: number, span: number): number {
  const x = Math.sin(index * 12.9898) * 43758.5453
  return Math.floor((x - Math.floor(x)) * span)
}

function uuid(index: number, salt: number): string {
  const hex = (n: number, len: number) =>
    Math.abs(seeded(index * 7 + salt + n, 0xfffffff)).toString(16).padStart(len, '0').slice(0, len)
  return `${hex(1, 8)}-${hex(2, 4)}-4${hex(3, 3)}-a${hex(4, 3)}-${hex(5, 12)}`
}

/** 320 events spread back over three weeks, newest first. */
const logs: MockAuditLog[] = Array.from({ length: 320 }, (_, i) => {
  const action = ACTIONS[seeded(i, ACTIONS.length)]
  const user = USERS[seeded(i + 101, USERS.length)]
  const resourceType = RESOURCE_TYPES[action] ?? 'system'
  // Start ~14 minutes back and walk backwards in uneven steps.
  const minutesAgo = 14 + i * 71 + seeded(i + 7, 60)
  return {
    id: `audit-${String(i + 1).padStart(4, '0')}`,
    userId: user.id,
    action,
    resourceType,
    resourceId: resourceType === 'auth' ? null : uuid(i, 3),
    details: {
      after: action.endsWith('_deleted') ? null : { name: `${resourceType}-${i + 1}` },
      before: action.endsWith('_created') ? null : { name: `${resourceType}-${i}` },
      changed_fields: action.includes('updated') ? ['name', 'is_active'] : [],
      method: action.includes('deleted') ? 'DELETE' : action.includes('created') ? 'POST' : 'GET',
      path: `/api/v1/${resourceType.replace(/_/g, '-')}s`,
      query: {},
      route: `/api/v1/${resourceType.replace(/_/g, '-')}s`,
      status_code: 200,
      success: true,
      email: user.email,
    },
    ipAddress: IPS[seeded(i + 43, IPS.length)],
    userAgent: AGENTS[seeded(i + 77, AGENTS.length)],
    createdAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
  }
})

function filtered(query: Record<string, unknown>): MockAuditLog[] {
  const userId = String(query.userId ?? '').trim().toLowerCase()
  const action = String(query.action ?? '').trim()
  const startDate = String(query.startDate ?? '').trim()
  const endDate = String(query.endDate ?? '').trim()

  return logs.filter((log) => {
    if (userId && !log.userId.toLowerCase().includes(userId)) return false
    if (action && log.action !== action) return false
    if (startDate && log.createdAt < new Date(`${startDate}T00:00:00.000Z`).toISOString()) {
      return false
    }
    if (endDate && log.createdAt > new Date(`${endDate}T23:59:59.999Z`).toISOString()) {
      return false
    }
    return true
  })
}

router.get('/admin/audit-logs/export', requireAuth, (req, res) => {
  const rows = filtered(req.query as Record<string, unknown>)
  const format = req.query.format === 'json' ? 'json' : 'csv'

  if (format === 'json') {
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Content-Disposition', 'attachment; filename="audit_logs.json"')
    return res.send(JSON.stringify(rows, null, 2))
  }

  const header = 'id,created_at,user_id,action,resource_type,resource_id,ip_address'
  const body = rows
    .map((r) =>
      [r.id, r.createdAt, r.userId, r.action, r.resourceType, r.resourceId ?? '', r.ipAddress].join(
        ',',
      ),
    )
    .join('\n')
  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', 'attachment; filename="audit_logs.csv"')
  res.send(`${header}\n${body}`)
})

router.get('/admin/audit-logs', requireAuth, (req, res) => {
  const rows = filtered(req.query as Record<string, unknown>)
  const page = Math.max(1, Number(req.query.page) || 1)
  const limit = Math.max(1, Number(req.query.limit) || 20)
  const start = (page - 1) * limit

  res.json({
    items: rows.slice(start, start + limit),
    total: rows.length,
    page,
    limit,
  })
})

router.get('/audit/actions', requireAuth, (_req, res) => {
  res.json([...ACTIONS].sort())
})

export default router
