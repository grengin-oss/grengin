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
      { average_latency: 1180, model_name: 'gpt-5.5', model_provider: 'openai', total_requests: Math.round(totalRequests * 0.34), total_tokens: Math.round(totalTokens * 0.31), total_cost: Number((totalCost * 0.38).toFixed(2)) },
      { average_latency: 860, model_name: 'claude-sonnet-4-6', model_provider: 'anthropic', total_requests: Math.round(totalRequests * 0.27), total_tokens: Math.round(totalTokens * 0.3), total_cost: Number((totalCost * 0.29).toFixed(2)) },
      { average_latency: 1620, model_name: 'claude-opus-5', model_provider: 'anthropic', total_requests: Math.round(totalRequests * 0.15), total_tokens: Math.round(totalTokens * 0.19), total_cost: Number((totalCost * 0.21).toFixed(2)) },
      { average_latency: 540, model_name: 'gpt-5-mini', model_provider: 'openai', total_requests: Math.round(totalRequests * 0.16), total_tokens: Math.round(totalTokens * 0.14), total_cost: Number((totalCost * 0.08).toFixed(2)) },
      { average_latency: 920, model_name: 'gemini-3-pro', model_provider: 'google', total_requests: Math.round(totalRequests * 0.08), total_tokens: Math.round(totalTokens * 0.06), total_cost: Number((totalCost * 0.04).toFixed(2)) },
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

/**
 * Dev fixtures for the department-admin scoped analytics the By Users and
 * By Department tabs call (/me/analytics/administered-departments*). Rows are
 * derived from a fixed roster so search, sort and paging behave like the API.
 */
const MOCK_DEPARTMENTS = ['Engineering', 'Design', 'Product', 'Marketing', 'Support']

const MOCK_ANALYTICS_USERS = [
  { user_id: 'u-1', user_name: 'Agrani Anand', user_email: 'agrani@grengin.com', department: 'Engineering', hoursAgo: 2 },
  { user_id: 'u-2', user_name: 'Jules Carter', user_email: 'jules@grengin.com', department: 'Engineering', hoursAgo: 5 },
  { user_id: 'u-3', user_name: 'Maya Patel', user_email: 'maya@grengin.com', department: 'Design', hoursAgo: 26 },
  { user_id: 'u-4', user_name: 'Ravi Shah', user_email: 'ravi@grengin.com', department: 'Product', hoursAgo: 30 },
  { user_id: 'u-5', user_name: 'Elena Lopez', user_email: 'elena@grengin.com', department: 'Design', hoursAgo: 51 },
  { user_id: 'u-6', user_name: 'Tom Wu', user_email: 'tom@grengin.com', department: 'Marketing', hoursAgo: 98 },
  { user_id: 'u-7', user_name: 'Priya Nair', user_email: 'priya@grengin.com', department: 'Support', hoursAgo: 140 },
  { user_id: 'u-8', user_name: 'Daniel Okoro', user_email: 'daniel@grengin.com', department: 'Product', hoursAgo: 190 },
]

function userAnalyticsRows() {
  return MOCK_ANALYTICS_USERS.map((user, index) => {
    const requests = Math.round(12 + seeded(index, 7) * 90)
    const errors = Math.round(seeded(index, 9) * 4)
    return {
      user_id: user.user_id,
      user_name: user.user_name,
      user_email: user.user_email,
      department: user.department,
      total_requests: requests,
      success_count: Math.max(0, requests - errors),
      error_count: errors,
      total_tokens: requests * Math.round(3200 + seeded(index, 11) * 2400),
      total_cost: Number((requests * (0.014 + seeded(index, 13) * 0.01)).toFixed(2)),
      average_latency: Number((520 + seeded(index, 15) * 1100).toFixed(2)),
      last_activity: new Date(Date.now() - user.hoursAgo * 3600000).toISOString(),
    }
  })
}

router.get('/me/analytics/administered-departments/users', requireAuth, (req, res) => {
  const search = String(req.query.search ?? '').trim().toLowerCase()
  const sortBy = String(req.query.sort_by ?? 'totalRequests')
  const order = String(req.query.order ?? 'desc') === 'asc' ? 1 : -1
  const page = Math.max(0, Number(req.query.page ?? 0))
  const limit = Math.max(1, Number(req.query.limit ?? 20))

  let rows = userAnalyticsRows()
  if (search) {
    rows = rows.filter((row) =>
      [row.user_name, row.user_email, row.department].some((field) =>
        field.toLowerCase().includes(search),
      ),
    )
  }

  const sortKeys: Record<string, (row: (typeof rows)[number]) => string | number> = {
    name: (row) => row.user_name.toLowerCase(),
    email: (row) => row.user_email.toLowerCase(),
    totalRequests: (row) => row.total_requests,
    totalTokens: (row) => row.total_tokens,
    totalCost: (row) => row.total_cost,
    averageLatency: (row) => row.average_latency,
    lastActivity: (row) => row.last_activity,
  }
  const key = sortKeys[sortBy] ?? sortKeys.totalRequests
  rows.sort((a, b) => (key(a) > key(b) ? order : key(a) < key(b) ? -order : 0))

  const total = rows.length
  res.json({
    users: rows.slice(page * limit, page * limit + limit),
    total,
    page,
    limit,
    total_pages: Math.max(1, Math.ceil(total / limit)),
  })
})

router.get('/me/analytics/administered-departments', requireAuth, (req, res) => {
  const search = String(req.query.search ?? '').trim().toLowerCase()
  const sort = String(req.query.sort ?? 'updated_at')
  const ascending = String(req.query.ascending ?? 'false') === 'true'
  const offset = Math.max(0, Number(req.query.offset ?? 0))
  const limit = Math.max(1, Number(req.query.limit ?? 20))

  const users = userAnalyticsRows()
  let rows = MOCK_DEPARTMENTS.map((department) => {
    const members = users.filter((user) => user.department === department)
    const requests = members.reduce((sum, user) => sum + user.total_requests, 0)
    return {
      department,
      total_users: members.length,
      total_requests: requests,
      total_tokens: members.reduce((sum, user) => sum + user.total_tokens, 0),
      total_cost: Number(members.reduce((sum, user) => sum + user.total_cost, 0).toFixed(2)),
      average_latency: members.length
        ? Number((members.reduce((sum, user) => sum + user.average_latency, 0) / members.length).toFixed(2))
        : 0,
      success_count: members.reduce((sum, user) => sum + user.success_count, 0),
      error_count: members.reduce((sum, user) => sum + user.error_count, 0),
    }
  })

  if (search) {
    rows = rows.filter((row) => row.department.toLowerCase().includes(search))
  }

  if (sort === 'name') {
    rows.sort((a, b) => (ascending ? 1 : -1) * a.department.localeCompare(b.department))
  } else {
    rows.sort((a, b) => b.total_cost - a.total_cost)
  }

  const total = rows.length
  res.json({
    departments: rows.slice(offset, offset + limit),
    total,
    limit,
    offset,
    total_pages: Math.max(1, Math.ceil(total / limit)),
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
