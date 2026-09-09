// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

import { Router } from 'express'
import { requireAuth } from '../lib/middleware.js'

const router = Router()

interface MockRolePrompt {
  id: string
  name: string
  prompt_text: string
  role_id: string
  is_system: boolean
  variables: string[]
  usage_count: number
  created_by: string
  created_at: string
  updated_at: string
}

const now = new Date().toISOString()

/** Seeded from prompts.html's sample library. */
const prompts: MockRolePrompt[] = [
  {
    id: 'rp-001',
    name: 'Support',
    prompt_text:
      'You are a customer support specialist at {{company_name}}. Be empathetic, concise, and solution-oriented in every reply.',
    role_id: 'r-viewer',
    is_system: true,
    variables: ['user_name', 'department', 'company_name'],
    usage_count: 22,
    created_by: 'u-admin',
    created_at: now,
    updated_at: now,
  },
  {
    id: 'rp-002',
    name: 'Analyst',
    prompt_text:
      'You are a data analyst at {{company_name}}. Provide structured, evidence-based insights with clear next steps.',
    role_id: 'r-analyst',
    is_system: true,
    variables: ['user_name', 'department', 'company_name'],
    usage_count: 273,
    created_by: 'u-admin',
    created_at: now,
    updated_at: now,
  },
  {
    id: 'rp-003',
    name: 'Developer',
    prompt_text:
      'You are a senior software developer at {{company_name}}. Provide production-ready code with clear explanations.',
    role_id: 'r-vibe-coder',
    is_system: true,
    variables: ['user_name', 'department', 'company_name'],
    usage_count: 280,
    created_by: 'u-admin',
    created_at: now,
    updated_at: now,
  },
  {
    id: 'rp-004',
    name: 'Marketer',
    prompt_text:
      'You are a performance marketer at {{company_name}}. Craft clear, conversion-focused copy for every channel.',
    role_id: 'r-viewer',
    is_system: false,
    variables: ['user_name', 'department', 'company_name'],
    usage_count: 4,
    created_by: 'u-admin',
    created_at: now,
    updated_at: now,
  },
  {
    id: 'rp-005',
    name: 'Sales',
    prompt_text:
      'You are a sales specialist at {{company_name}}. Write concise, persuasive outreach tailored to the prospect.',
    role_id: 'r-hr-admin',
    is_system: false,
    variables: ['user_name', 'department', 'company_name'],
    usage_count: 16,
    created_by: 'u-admin',
    created_at: now,
    updated_at: now,
  },
]

router.get('/admin/role-prompts', requireAuth, (req, res) => {
  let result = prompts
  const { role_id, is_system } = req.query
  if (typeof role_id === 'string' && role_id) {
    result = result.filter((p) => p.role_id === role_id)
  }
  if (typeof is_system === 'string' && is_system) {
    const wanted = is_system === 'true'
    result = result.filter((p) => p.is_system === wanted)
  }
  res.json(result)
})

router.get('/admin/role-prompts/:promptId', requireAuth, (req, res) => {
  const prompt = prompts.find((p) => p.id === req.params.promptId)
  if (!prompt) return res.status(404).json({ detail: 'Prompt not found' })
  res.json(prompt)
})

router.post('/admin/role-prompts', requireAuth, (req, res) => {
  if (!req.body?.name || !req.body?.prompt_text || !req.body?.role_id) {
    return res
      .status(422)
      .json({ detail: 'name, prompt_text and role_id are required' })
  }
  const timestamp = new Date().toISOString()
  const prompt: MockRolePrompt = {
    id: `rp-${crypto.randomUUID().slice(0, 8)}`,
    name: req.body.name,
    prompt_text: req.body.prompt_text,
    role_id: req.body.role_id,
    is_system: Boolean(req.body.is_system),
    variables: Array.isArray(req.body.variables) ? req.body.variables : [],
    usage_count: 0,
    created_by: 'u-admin',
    created_at: timestamp,
    updated_at: timestamp,
  }
  prompts.unshift(prompt)
  res.status(201).json(prompt)
})

router.put('/admin/role-prompts/:promptId', requireAuth, (req, res) => {
  const index = prompts.findIndex((p) => p.id === req.params.promptId)
  if (index === -1) return res.status(404).json({ detail: 'Prompt not found' })
  prompts[index] = {
    ...prompts[index],
    name: req.body?.name ?? prompts[index].name,
    prompt_text: req.body?.prompt_text ?? prompts[index].prompt_text,
    role_id: req.body?.role_id ?? prompts[index].role_id,
    is_system:
      req.body?.is_system !== undefined
        ? Boolean(req.body.is_system)
        : prompts[index].is_system,
    variables: Array.isArray(req.body?.variables)
      ? req.body.variables
      : prompts[index].variables,
    updated_at: new Date().toISOString(),
  }
  res.json(prompts[index])
})

router.delete('/admin/role-prompts/:promptId', requireAuth, (req, res) => {
  const index = prompts.findIndex((p) => p.id === req.params.promptId)
  if (index === -1) return res.status(404).json({ detail: 'Prompt not found' })
  prompts.splice(index, 1)
  res.status(204).send()
})

export default router
