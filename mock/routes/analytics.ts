// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

import { Router } from 'express'
import { requireAuth } from '../lib/middleware.js'
import costsExample from '../examples/analytics/costs.response.json' with { type: 'json' }
import usageExample from '../examples/analytics/usage.response.json' with { type: 'json' }
import trendsExample from '../examples/analytics/trends.response.json' with { type: 'json' }
import auditLogsExample from '../examples/audit/logs.response.json' with { type: 'json' }

const router = Router()

/**
 * Dev fixtures for the endpoints the Usage Analytics page calls
 * (/admin/analytics/overview + /admin/analytics/timeseries). Values are
 * generated from the requested range so the charts have a real shape.
 */
function dayKeys(startDate: string, endDate: string, granularity: string): string[] {
  const start = new Date(`${startDate}T00:00:00Z`)
  const end = new Date(`${endDate}T00:00:00Z`)
  const keys: string[] = []
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return keys

  const stepDays = granularity === 'week' ? 7 : granularity === 'month' ? 30 : 1
  if (granularity === 'hour') {
    for (let hour = 0; hour < 24; hour += 1) {
      const point = new Date(end)
      point.setUTCHours(hour, 0, 0, 0)
      keys.push(point.toISOString())
    }
    return keys
  }

  for (let cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + stepDays)) {
    keys.push(new Date(cursor).toISOString())
  }
  return keys
}

/** Deterministic pseudo-random so a reload shows the same chart. */
function seeded(index: number, salt: number): number {
  return Math.abs(Math.sin((index + 1) * 12.9898 + salt * 78.233)) % 1
}

router.get('/admin/analytics/overview', requireAuth, (req, res) => {
  const keys = dayKeys(String(req.query.start_date ?? ''), String(req.query.end_date ?? ''), 'day')
  const totalRequests = keys.reduce((sum, _key, index) => sum + Math.round(6 + seeded(index, 1) * 26), 0)
  const totalTokens = totalRequests * 4200
  const totalCost = Number((totalRequests * 0.0185).toFixed(2))

  res.json({
    total_users: 9,
    active_users: 6,
    total_requests: totalRequests,
    total_tokens: totalTokens,
    total_cost: totalCost,
    average_requests_per_user: Number((totalRequests / 9).toFixed(1)),
    request_growth_rate: 0.184,
    token_growth_rate: 0.226,
    cost_growth_rate: -0.072,
    top_models: [
      { model_name: 'gpt-5.5', model_provider: 'openai', total_requests: Math.round(totalRequests * 0.34), total_tokens: Math.round(totalTokens * 0.31), total_cost: Number((totalCost * 0.38).toFixed(2)) },
      { model_name: 'claude-sonnet-4-6', model_provider: 'anthropic', total_requests: Math.round(totalRequests * 0.27), total_tokens: Math.round(totalTokens * 0.3), total_cost: Number((totalCost * 0.29).toFixed(2)) },
      { model_name: 'claude-opus-5', model_provider: 'anthropic', total_requests: Math.round(totalRequests * 0.15), total_tokens: Math.round(totalTokens * 0.19), total_cost: Number((totalCost * 0.21).toFixed(2)) },
      { model_name: 'gpt-5-mini', model_provider: 'openai', total_requests: Math.round(totalRequests * 0.16), total_tokens: Math.round(totalTokens * 0.14), total_cost: Number((totalCost * 0.08).toFixed(2)) },
      { model_name: 'gemini-3-pro', model_provider: 'google', total_requests: Math.round(totalRequests * 0.08), total_tokens: Math.round(totalTokens * 0.06), total_cost: Number((totalCost * 0.04).toFixed(2)) },
    ],
  })
})

router.get('/admin/analytics/timeseries', requireAuth, (req, res) => {
  const granularity = String(req.query.granularity ?? 'day')
  const keys = dayKeys(String(req.query.start_date ?? ''), String(req.query.end_date ?? ''), granularity)

  res.json({
    granularity,
    data: keys.map((timestamp, index) => {
      const requests = Math.round(6 + seeded(index, 1) * 26)
      const errors = Math.round(seeded(index, 5) * 3)
      return {
        timestamp,
        total_requests: requests,
        total_tokens: requests * Math.round(3600 + seeded(index, 2) * 1800),
        total_cost: Number((requests * 0.0185).toFixed(3)),
        average_latency: Number((620 + seeded(index, 3) * 900).toFixed(2)),
        success_count: Math.max(0, requests - errors),
        error_count: errors,
      }
    }),
  })
})

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
