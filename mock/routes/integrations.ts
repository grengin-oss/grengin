// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

import { Router } from 'express'
import { requireAuth } from '../lib/middleware.js'
import integrationsExample from '../examples/user/integrations.response.json' with { type: 'json' }

const router = Router()

// In-memory store for user integration states
let integrations = structuredClone(integrationsExample)

// GET /me/integrations - list all integrations visible to the user
router.get('/me/integrations', requireAuth, (req, res) => {
  res.json(integrations)
})

// POST /me/integrations/:type/connect - connect user to an integration
router.post('/me/integrations/:type/connect', requireAuth, (req, res) => {
  const { type } = req.params
  const integration = integrations.find((i: any) => i.type === type)

  if (!integration) {
    return res.status(404).json({ detail: 'Integration not found' })
  }

  if (!integration.is_enabled_by_org) {
    return res.status(403).json({ detail: 'Integration is not enabled by your organization' })
  }

  if (integration.user_status === 'connected') {
    return res.status(409).json({ detail: 'Integration is already connected' })
  }

  // Simulate successful connection
  integration.user_status = 'connected'
  integration.connected_at = new Date().toISOString()
  integration.external_user_id = `usr_${type}_${Date.now()}`
  integration.external_display_name = `admin@${type}-workspace`

  res.json(integration)
})

// DELETE /me/integrations/:type/disconnect - disconnect user from an integration
router.delete('/me/integrations/:type/disconnect', requireAuth, (req, res) => {
  const { type } = req.params
  const integration = integrations.find((i: any) => i.type === type)

  if (!integration) {
    return res.status(404).json({ detail: 'Integration not found' })
  }

  if (integration.user_status !== 'connected') {
    return res.status(409).json({ detail: 'Integration is not connected' })
  }

  integration.user_status = 'disconnected'
  integration.connected_at = null
  integration.external_user_id = null
  integration.external_display_name = null

  res.json(integration)
})

export default router
