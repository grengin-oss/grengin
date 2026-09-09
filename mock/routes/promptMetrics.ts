// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

import { Router } from 'express'
import { requireAuth } from '../lib/middleware.js'

const router = Router()

interface MockPromptMetric {
  prompt_id: string
  role_id: string
  name: string
  usage_count: number
  feedback_count: number
  average_rating: number
}

/** Keyed to the role-prompts seed so both pages agree on ids and names. */
const metrics: MockPromptMetric[] = [
  {
    prompt_id: 'rp-001',
    role_id: 'r-viewer',
    name: 'Support',
    usage_count: 946,
    feedback_count: 184,
    average_rating: 0.87,
  },
  {
    prompt_id: 'rp-005',
    role_id: 'r-hr-admin',
    name: 'Sales',
    usage_count: 16,
    feedback_count: 9,
    average_rating: 0.67,
  },
  {
    prompt_id: 'rp-004',
    role_id: 'r-viewer',
    name: 'Marketer',
    usage_count: 4,
    feedback_count: 3,
    average_rating: 0.33,
  },
  {
    prompt_id: 'rp-003',
    role_id: 'r-vibe-coder',
    name: 'Developer',
    usage_count: 4,
    feedback_count: 0,
    average_rating: 0,
  },
  {
    prompt_id: 'rp-002',
    role_id: 'r-analyst',
    name: 'Analyst',
    usage_count: 3,
    feedback_count: 2,
    average_rating: 0.5,
  },
]

router.get('/admin/prompt-metrics', requireAuth, (req, res) => {
  let result = metrics
  const { prompt_id, role_id } = req.query
  if (typeof prompt_id === 'string' && prompt_id) {
    result = result.filter((m) => m.prompt_id === prompt_id)
  }
  if (typeof role_id === 'string' && role_id) {
    result = result.filter((m) => m.role_id === role_id)
  }
  res.json(result)
})

export default router
