import { Router } from 'express'
import { requireAuth } from '../lib/middleware.js'
import costsExample from '../examples/analytics/costs.response.json' with { type: 'json' }
import usageExample from '../examples/analytics/usage.response.json' with { type: 'json' }
import trendsExample from '../examples/analytics/trends.response.json' with { type: 'json' }
import auditLogsExample from '../examples/audit/logs.response.json' with { type: 'json' }

const router = Router()

router.get('/analytics/costs', requireAuth, (req, res) => {
  res.json(costsExample)
})

router.get('/analytics/costs/export', requireAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', 'attachment; filename="costs.csv"')
  res.send('date,cost,requests,tokens\n2024-01-01,75.50,150,75000\n2024-01-02,82.30,165,82000')
})

router.get('/analytics/usage', requireAuth, (req, res) => {
  res.json(usageExample)
})

router.get('/analytics/trends', requireAuth, (req, res) => {
  res.json(trendsExample)
})

router.get('/audit/logs', requireAuth, (req, res) => {
  res.json(auditLogsExample)
})

router.get('/audit/logs/export', requireAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', 'attachment; filename="audit_logs.csv"')
  res.send('id,action,user_email,timestamp\n1,user.login,admin@grengin.com,2024-01-15T10:00:00Z')
})

export default router
