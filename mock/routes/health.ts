// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

import { Router } from 'express'
import type { HealthResponse } from '../lib/store.js'

const router = Router()

// Distribution version the frontend builds the meta URLs from (e.g. the Browse
// dialog's categories.json). Matches the published grengin-api distribution.
const GRENGIN_API_VERSION = '0.9.5'

function healthResponse(): HealthResponse {
  return {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      database: 'up',
      redis: 'up',
    },
    version: GRENGIN_API_VERSION,
  }
}

// The frontend's getHealthStatus() reads the API root, not /health.
router.get('/', (req, res) => {
  res.json(healthResponse())
})

router.get('/health', (req, res) => {
  res.json(healthResponse())
})

export default router
