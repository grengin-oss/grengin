import { Router } from 'express'
import type { HealthResponse } from '../lib/store.js'

const router = Router()

router.get('/health', (req, res) => {
  const response: HealthResponse = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      database: 'up',
      redis: 'up',
    },
    version: '1.1.0',
  }
  res.json(response)
})

export default router
