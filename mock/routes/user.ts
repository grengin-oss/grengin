// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

import { Router } from 'express'
import { requireAuth } from '../lib/middleware.js'
import type { User } from '../lib/store.js'
import meExample from '../examples/user/me.response.json' with { type: 'json' }
import rateLimitExample from '../examples/user/rate-limit.response.json' with { type: 'json' }
import budgetExample from '../examples/user/budget.response.json' with { type: 'json' }
import usageExample from '../examples/user/usage.response.json' with { type: 'json' }

const router = Router()

router.get('/me', requireAuth, (req, res) => {
  res.json(meExample)
})

router.get('/me/rate-limit', requireAuth, (req, res) => {
  res.json(rateLimitExample)
})

router.get('/me/budget', requireAuth, (req, res) => {
  res.json(budgetExample)
})

router.get('/me/usage', requireAuth, (req, res) => {
  res.json(usageExample)
})

// Effective permissions for the signed-in user. The mock user is the built-in
// super admin, who implicitly holds every scope — so grant all known
// permissions globally ('*'). This includes `system:maintain`, which gates the
// System → Maintenance tab (ENGG-345/346/347); without it that tab renders the
// "access denied" (Forbidden) state locally.
router.get('/me/permissions', requireAuth, (req, res) => {
  const ALL_PERMISSIONS = [
    'analytics:view',
    'departments:view',
    'departments:manage',
    'ai_platform:view',
    'ai_platform:manage',
    'sso_providers:view',
    'sso_providers:manage',
    'users:view',
    'users:manage',
    'roles:view',
    'roles:manage',
    'roles:assign',
    'budget:view',
    'budget:allocate',
    'mcp_servers:view',
    'mcp_servers:manage',
    'audit_logs:view',
    'system:maintain',
  ]
  const permissions: Record<string, '*'> = {}
  for (const p of ALL_PERMISSIONS) permissions[p] = '*'
  res.json({ permissions, mcp_access: {}, administered_departments: [] })
})

// Notifications feed (shape = NotificationsListResponse). A couple unread so the
// sidebar bell shows a count.
const DEMO_NOTIFICATIONS = [
  { id: 'n-1', title: 'Budget threshold reached', body: 'Marketing has used 82% of its monthly budget.', kind: 'budget_alert', payload: { department: 'Marketing', percent: 82 }, department_id: 'd0010000-0000-0000-0000-000000000003', created_at: '2026-08-05T08:30:00Z', period_start: null, read_at: null },
  { id: 'n-2', title: 'Weekly usage summary', body: '128,443 requests across 8 departments this week.', kind: 'usage_summary', payload: {}, department_id: null, created_at: '2026-08-04T09:00:00Z', period_start: '2026-07-29T00:00:00Z', read_at: null },
  { id: 'n-3', title: 'New user joined', body: 'Priya Patel was added to Sales.', kind: 'system', payload: {}, department_id: null, created_at: '2026-08-03T14:20:00Z', period_start: null, read_at: '2026-08-03T15:00:00Z' },
  { id: 'n-4', title: 'Model whitelisted', body: 'claude-sonnet-5 enabled for Engineering.', kind: 'system', payload: {}, department_id: null, created_at: '2026-08-02T11:10:00Z', period_start: null, read_at: '2026-08-02T12:00:00Z' },
]

router.get('/me/notifications', requireAuth, (req, res) => {
  const limit = Math.max(0, parseInt(String(req.query.limit ?? '20'), 10) || 20)
  const offset = Math.max(0, parseInt(String(req.query.offset ?? '0'), 10) || 0)
  const unreadOnly = String(req.query.unread_only) === 'true'
  const list = unreadOnly ? DEMO_NOTIFICATIONS.filter((n) => n.read_at === null) : DEMO_NOTIFICATIONS
  res.json({ notifications: list.slice(offset, offset + limit), total: list.length })
})

router.post('/me/notifications/:id/read', requireAuth, (_req, res) => res.status(204).send())

// User system prompt (shape = UserSystemPrompt). PUT/DELETE echo (demo read-only).
const DEMO_SYSTEM_PROMPT = {
  prompt_id: 'sysprompt-default',
  prompt_text: 'You are Grengin, a helpful AI assistant for the organization. Be concise, accurate, and cite sources when relevant.',
  source: 'system_default',
  variables: [] as string[],
}
router.get('/me/system-prompt', requireAuth, (_req, res) => res.json(DEMO_SYSTEM_PROMPT))
router.put('/me/system-prompt', requireAuth, (req, res) =>
  res.json({
    ...DEMO_SYSTEM_PROMPT,
    prompt_id: req.body?.prompt_id ?? DEMO_SYSTEM_PROMPT.prompt_id,
    prompt_text: req.body?.custom_prompt_text ?? DEMO_SYSTEM_PROMPT.prompt_text,
    source: 'user_custom',
  })
)
router.delete('/me/system-prompt', requireAuth, (_req, res) => res.status(204).send())
router.post('/me/system-prompt/feedback', requireAuth, (_req, res) => res.status(204).send())

// SSE stream — stays open, no live events pushed in the demo (just keep-alive).
router.get('/me/notifications/stream', requireAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  if (typeof (res as unknown as { flushHeaders?: () => void }).flushHeaders === 'function') {
    ;(res as unknown as { flushHeaders: () => void }).flushHeaders()
  }
  res.write(': connected\n\n')
  const keepAlive = setInterval(() => res.write(': ping\n\n'), 30000)
  req.on('close', () => clearInterval(keepAlive))
})

export default router
