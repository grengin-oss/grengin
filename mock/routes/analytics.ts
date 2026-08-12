// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

import { Router } from 'express'
import { requireAuth } from '../lib/middleware.js'
import costsExample from '../examples/analytics/costs.response.json' with { type: 'json' }
import usageExample from '../examples/analytics/usage.response.json' with { type: 'json' }
import trendsExample from '../examples/analytics/trends.response.json' with { type: 'json' }
import auditLogsExample from '../examples/audit/logs.response.json' with { type: 'json' }
import {
  overviewFor,
  userAnalyticsFor,
  departmentAnalyticsFor,
  buildTimeseries,
  REF_MS,
  type UserAnalytics,
  type DepartmentAnalytics,
} from '../lib/demoSeed.js'
import { users as liveUsers } from '../lib/demoState.js'

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

// Control Hub → Overview quick stats (spec §3.1): all non-zero, >=3 top models
// each with real usage. Derived from the canonical seed so totals reconcile with
// the by-user / by-department tables.
router.get('/admin/analytics/overview', requireAuth, (req, res) => {
  res.json(overviewFor(liveUsers))
})

// Control Hub → Usage Analytics timeseries (spec §3.2: 90 days daily granularity).
router.get('/admin/analytics/timeseries', requireAuth, (req, res) => {
  const granularity = String(req.query.granularity ?? 'day')
  const stepMs =
    granularity === 'hour' ? 3_600_000 :
    granularity === 'week' ? 7 * 86_400_000 :
    granularity === 'month' ? 30 * 86_400_000 : 86_400_000
  const startMs = Date.parse(String(req.query.start_date ?? '')) || (REF_MS - 90 * 86_400_000)
  const endMs = Date.parse(String(req.query.end_date ?? '')) || REF_MS

  res.json({ data: buildTimeseries(startMs, endMs, stepMs), granularity })
})

// Control Hub → Usage Analytics "By user" (spec §3.2 ≥10 users). Sourced from the
// canonical 50-user set so names/departments match User Management exactly.
const USER_SORT_FIELDS: Record<string, keyof UserAnalytics> = {
  totalRequests: 'total_requests',
  totalTokens: 'total_tokens',
  totalCost: 'total_cost',
  errorCount: 'error_count',
  averageLatency: 'average_latency',
  lastActivity: 'last_activity',
  name: 'user_name',
  email: 'user_email',
}

router.get('/me/analytics/administered-departments/users', requireAuth, (req, res) => {
  const page = Math.max(0, parseInt(String(req.query.page ?? '0'), 10) || 0)
  const limit = Math.max(1, parseInt(String(req.query.limit ?? '20'), 10) || 20)
  const sortField = USER_SORT_FIELDS[String(req.query.sort_by ?? 'totalRequests')] ?? 'total_requests'
  const order = String(req.query.order ?? 'desc') === 'asc' ? 1 : -1
  const search = typeof req.query.search === 'string' ? req.query.search.toLowerCase().trim() : ''

  // Only users with real usage (spec §3.2 non-empty analytics). Computed from
  // the LIVE users so new/edited/deleted users are reflected immediately.
  let rows = userAnalyticsFor(liveUsers).filter((u) => u.total_requests > 0)
  if (search) rows = rows.filter((u) => u.user_name.toLowerCase().includes(search) || u.user_email.toLowerCase().includes(search))

  const sorted = rows.sort((a, b) => {
    const av = a[sortField]
    const bv = b[sortField]
    if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv) * order
    return ((av as number) - (bv as number)) * order
  })

  const start = page * limit
  res.json({
    users: sorted.slice(start, start + limit),
    total: sorted.length,
    page,
    limit,
    total_pages: Math.ceil(sorted.length / limit),
  })
})

// Control Hub → Usage Analytics "By department" (spec §3.2 ≥5, §3.5 ≥8 depts).
// Sourced from the canonical seed; totals aggregate the same users as by-user.
const DEPT_SORT_FIELDS: Record<string, keyof DepartmentAnalytics> = {
  total_requests: 'total_requests',
  total_tokens: 'total_tokens',
  total_cost: 'total_cost',
  total_users: 'total_users',
  error_count: 'error_count',
  average_latency: 'average_latency',
  updated_at: 'total_requests',
  department: 'department',
  name: 'department',
}

router.get('/me/analytics/administered-departments', requireAuth, (req, res) => {
  const offset = Math.max(0, parseInt(String(req.query.offset ?? '0'), 10) || 0)
  const limit = Math.max(1, parseInt(String(req.query.limit ?? '20'), 10) || 20)
  const sortField = DEPT_SORT_FIELDS[String(req.query.sort ?? 'total_requests')] ?? 'total_requests'
  const order = String(req.query.ascending ?? 'false') === 'true' ? 1 : -1
  const search = typeof req.query.search === 'string' ? req.query.search.toLowerCase().trim() : ''

  let rows = departmentAnalyticsFor(liveUsers)
  if (search) rows = rows.filter((d) => d.department.toLowerCase().includes(search))

  const sorted = rows.sort((a, b) => {
    const av = a[sortField]
    const bv = b[sortField]
    if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv) * order
    return ((av as number) - (bv as number)) * order
  })

  res.json({
    departments: sorted.slice(offset, offset + limit),
    total: sorted.length,
    limit,
    offset,
    total_pages: Math.ceil(sorted.length / limit),
  })
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
