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

export default router
