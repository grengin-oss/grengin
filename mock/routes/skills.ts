// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

import { Router } from 'express'
import { requireAuth } from '../lib/middleware.js'

const router = Router()

interface SkillToolsConfig {
  mcp_server_ids: string[]
  web_search: boolean
}

interface KnowledgeAttachment {
  file_name: string
  content_type: string
  data: string
}

interface SkillKnowledgeInfo {
  id: string
  file_name: string
  char_count: number
  storage_mode: string
  created_at: string
}

interface Skill {
  id: string
  identifier: string
  name: string
  description: string | null
  avatar: string | null
  instructions: string | null
  tools_config: SkillToolsConfig
  knowledge_files: SkillKnowledgeInfo[]
  is_active: boolean
  is_builtin: boolean
  user_id: string | null
  department_id: string | null
  created_at: string
  updated_at: string
}

const now = new Date().toISOString()

let knowledgeCounter = 500

/** Approximate decoded byte length of a base64 string. */
function base64Len(data: string): number {
  const clean = (data || '').replace(/=+$/, '')
  return Math.floor((clean.length * 3) / 4)
}

/** Turn an uploaded attachment into stored knowledge-file records. */
function buildKnowledgeFiles(att: KnowledgeAttachment | null | undefined, ts: string): SkillKnowledgeInfo[] {
  if (!att || !att.data) return []
  return [
    {
      id: `kf-${knowledgeCounter++}`,
      file_name: att.file_name,
      char_count: base64Len(att.data),
      storage_mode: att.content_type === 'application/zip' ? 'bundle' : 'inline',
      created_at: ts,
    },
  ]
}

// In-memory seed: one built-in "Artifacts" skill + a couple user skills.
let skills: Skill[] = [
  {
    id: 'skl-builtin-artifacts',
    identifier: 'artifacts',
    name: 'Artifacts',
    description:
      'Generate rich, standalone artifacts — documents, code, diagrams, and interactive components — Anthropic-style.',
    avatar: null,
    instructions:
      'You can create and iteratively update substantial, self-contained content called artifacts.',
    tools_config: { mcp_server_ids: [], web_search: false },
    knowledge_files: [],
    is_active: true,
    is_builtin: true,
    user_id: null,
    department_id: null,
    created_at: now,
    updated_at: now,
  },
  {
    id: 'skl-research',
    identifier: 'research-assistant',
    name: 'Research Assistant',
    description: 'Searches the web and cites sources for well-grounded, up-to-date answers.',
    avatar: '🔍',
    instructions:
      'You are a meticulous research assistant. Always cite your sources and prefer primary references.',
    tools_config: { mcp_server_ids: ['srv-001'], web_search: true },
    knowledge_files: [],
    is_active: true,
    is_builtin: false,
    user_id: 'usr-001',
    department_id: null,
    created_at: now,
    updated_at: now,
  },
  {
    id: 'skl-data',
    identifier: 'data-analyst',
    name: 'Data Analyst',
    description: 'Runs Python, analyses data and produces charts.',
    avatar: '📊',
    instructions: 'You are a precise data analyst. Show your working and validate assumptions.',
    tools_config: { mcp_server_ids: ['srv-002'], web_search: false },
    knowledge_files: [],
    is_active: false,
    is_builtin: false,
    user_id: 'usr-001',
    department_id: null,
    created_at: now,
    updated_at: now,
  },
]

let idCounter = 100

function paginate(list: Skill[], req: any) {
  const limit = req.query.limit ? Number(req.query.limit) : list.length
  const offset = req.query.offset ? Number(req.query.offset) : 0
  const active = req.query.is_active
  let filtered = list
  if (active === 'true') filtered = filtered.filter((s) => s.is_active)
  if (active === 'false') filtered = filtered.filter((s) => !s.is_active)
  return {
    skills: filtered.slice(offset, offset + limit),
    total: filtered.length,
    limit,
    offset,
  }
}

/* ---- Catalog (all skills incl. built-in) ---- */
router.get('/skills', requireAuth, (req, res) => {
  res.json(paginate(skills, req))
})

router.get('/skills/:id', requireAuth, (req, res) => {
  const skill = skills.find((s) => s.id === req.params.id)
  if (!skill) return res.status(404).json({ detail: 'Skill not found' })
  res.json(skill)
})

/* ---- My skills (user-owned CRUD) ---- */
router.get('/me/skills', requireAuth, (req, res) => {
  res.json(paginate(skills.filter((s) => !s.is_builtin), req))
})

router.get('/me/skills/:id', requireAuth, (req, res) => {
  const skill = skills.find((s) => s.id === req.params.id && !s.is_builtin)
  if (!skill) return res.status(404).json({ detail: 'Skill not found' })
  res.json(skill)
})

router.post('/me/skills', requireAuth, (req, res) => {
  const body = req.body ?? {}
  if (!body.name || !String(body.name).trim()) {
    return res.status(422).json({ detail: 'name is required' })
  }
  const ts = new Date().toISOString()
  const skill: Skill = {
    id: `skl-${idCounter++}`,
    identifier: String(body.name).trim().toLowerCase().replace(/\s+/g, '-').slice(0, 40),
    name: String(body.name).trim(),
    description: body.description ?? null,
    avatar: body.avatar ?? null,
    instructions: body.instructions ?? body.system_role ?? null,
    tools_config: body.tools_config ?? { mcp_server_ids: [], web_search: false },
    knowledge_files: buildKnowledgeFiles(body.knowledge_attachment, ts),
    is_active: true,
    is_builtin: false,
    user_id: 'usr-001',
    department_id: null,
    created_at: ts,
    updated_at: ts,
  }
  skills = [skill, ...skills]
  res.status(201).json(skill)
})

router.put('/me/skills/:id', requireAuth, (req, res) => {
  const skill = skills.find((s) => s.id === req.params.id && !s.is_builtin)
  if (!skill) return res.status(404).json({ detail: 'Skill not found' })
  const body = req.body ?? {}
  if (body.name != null) skill.name = String(body.name).trim()
  if (body.description !== undefined) skill.description = body.description
  if (body.avatar !== undefined) skill.avatar = body.avatar
  if (body.instructions !== undefined) skill.instructions = body.instructions
  else if (body.system_role !== undefined) skill.instructions = body.system_role
  if (body.is_active != null) skill.is_active = !!body.is_active
  if (body.tools_config != null) skill.tools_config = body.tools_config
  if (body.knowledge_attachment) {
    // A replace-on-import swaps the attached knowledge files.
    skill.knowledge_files = buildKnowledgeFiles(body.knowledge_attachment, new Date().toISOString())
  }
  skill.updated_at = new Date().toISOString()
  res.json(skill)
})

router.delete('/me/skills/:id', requireAuth, (req, res) => {
  const idx = skills.findIndex((s) => s.id === req.params.id && !s.is_builtin)
  if (idx < 0) return res.status(404).json({ detail: 'Skill not found' })
  skills.splice(idx, 1)
  res.status(204).send()
})

/* ---- Admin (org/department skills) ---- */
router.post('/admin/skills', requireAuth, (req, res) => {
  const body = req.body ?? {}
  if (!body.name || !body.identifier) {
    return res.status(422).json({ detail: 'name and identifier are required' })
  }
  if (skills.some((s) => s.identifier === body.identifier)) {
    return res.status(409).json({ detail: 'identifier already exists' })
  }
  const ts = new Date().toISOString()
  const skill: Skill = {
    id: `skl-${idCounter++}`,
    identifier: String(body.identifier),
    name: String(body.name),
    description: body.description ?? null,
    avatar: body.avatar ?? null,
    instructions: body.instructions ?? body.system_role ?? null,
    tools_config: body.tools_config ?? { mcp_server_ids: [], web_search: false },
    knowledge_files: buildKnowledgeFiles(body.knowledge_attachment, ts),
    is_active: true,
    is_builtin: false,
    user_id: null,
    department_id: body.department_id ?? null,
    created_at: ts,
    updated_at: ts,
  }
  skills = [skill, ...skills]
  res.status(201).json(skill)
})

router.put('/admin/skills/:id', requireAuth, (req, res) => {
  const skill = skills.find((s) => s.id === req.params.id)
  if (!skill) return res.status(404).json({ detail: 'Skill not found' })
  if (skill.is_builtin) return res.status(403).json({ detail: 'Built-in skills cannot be modified' })
  const body = req.body ?? {}
  if (body.name != null) skill.name = String(body.name)
  if (body.description !== undefined) skill.description = body.description
  if (body.avatar !== undefined) skill.avatar = body.avatar
  if (body.department_id !== undefined) skill.department_id = body.department_id
  if (body.instructions !== undefined) skill.instructions = body.instructions
  else if (body.system_role !== undefined) skill.instructions = body.system_role
  if (body.is_active != null) skill.is_active = !!body.is_active
  if (body.tools_config != null) skill.tools_config = body.tools_config
  if (body.knowledge_attachment) {
    skill.knowledge_files = buildKnowledgeFiles(body.knowledge_attachment, new Date().toISOString())
  }
  skill.updated_at = new Date().toISOString()
  res.json(skill)
})

router.delete('/admin/skills/:id', requireAuth, (req, res) => {
  const idx = skills.findIndex((s) => s.id === req.params.id)
  if (idx < 0) return res.status(404).json({ detail: 'Skill not found' })
  if (skills[idx].is_builtin) return res.status(403).json({ detail: 'Built-in skills cannot be deleted' })
  skills.splice(idx, 1)
  res.status(204).send()
})

/* ---- Conversation skill links ---- */
interface Link {
  id: string
  conversation_id: string
  skill_id: string
  created_at: string
}
let links: Link[] = []

router.get('/conversations/:conversationId/skills', requireAuth, (req, res) => {
  const { conversationId } = req.params
  const result = links
    .filter((l) => l.conversation_id === conversationId)
    .map((l) => ({
      id: l.id,
      conversation_id: l.conversation_id,
      skill: skills.find((s) => s.id === l.skill_id),
      created_at: l.created_at,
    }))
    .filter((l) => l.skill)
  res.json(result)
})

router.post('/conversations/:conversationId/skills', requireAuth, (req, res) => {
  const { conversationId } = req.params
  const skillId = req.body?.skill_id
  const skill = skills.find((s) => s.id === skillId)
  if (!skill) return res.status(404).json({ detail: 'Skill not found' })
  const existing = links.find(
    (l) => l.conversation_id === conversationId && l.skill_id === skillId,
  )
  if (existing) return res.status(409).json({ detail: 'Skill already linked' })
  const link: Link = {
    id: `lnk-${idCounter++}`,
    conversation_id: conversationId,
    skill_id: skillId,
    created_at: new Date().toISOString(),
  }
  links = [...links, link]
  res.status(201).json({
    id: link.id,
    conversation_id: link.conversation_id,
    skill,
    created_at: link.created_at,
  })
})

router.delete('/conversations/:conversationId/skills/:skillId', requireAuth, (req, res) => {
  const { conversationId, skillId } = req.params
  const idx = links.findIndex(
    (l) => l.conversation_id === conversationId && l.skill_id === skillId,
  )
  if (idx < 0) return res.status(404).json({ detail: 'Link not found' })
  links.splice(idx, 1)
  res.status(204).send()
})

export default router
