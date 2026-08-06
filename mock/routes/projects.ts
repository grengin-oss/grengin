// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

import { Router } from 'express'
import { requireAuth } from '../lib/middleware.js'
import { projects, type Project } from '../lib/store.js'
import { faker } from '@faker-js/faker'

const router = Router()

// In-memory stores for details
const projectInstructions = new Map<string, string>([
  ['proj_a1b2c3d4e5f6', 'Focus on user feedback, competitive analysis of top 3 players, and clear product requirements. Output should prioritize scalability.'],
  ['proj_m3n4o5p6q7r8', 'Always write modern TypeScript using standard style guides. Use Svelte 5 runes ($state, $derived, $effect) exclusively. Avoid legacy Svelte 4 code.']
])

const projectSources = new Map<string, any[]>([
  ['proj_a1b2c3d4e5f6', [
    {
      id: 'src_1',
      projectId: 'proj_a1b2c3d4e5f6',
      fileName: 'Q2_Competitor_Matrix.xlsx',
      fileType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      fileSize: 458900,
      origin: 'uploaded' as const,
      uploadedAt: '2026-06-01T12:00:00Z'
    },
    {
      id: 'src_2',
      projectId: 'proj_a1b2c3d4e5f6',
      fileName: 'roadmap_ideas.txt',
      fileType: 'text/plain',
      fileSize: 1200,
      origin: 'uploaded' as const,
      uploadedAt: '2026-06-05T15:30:00Z'
    },
    {
      id: 'src_3',
      projectId: 'proj_a1b2c3d4e5f6',
      fileName: 'customer_feedback_summary.pdf',
      fileType: 'application/pdf',
      fileSize: 2450000,
      origin: 'uploaded' as const,
      uploadedAt: '2026-06-10T09:15:00Z'
    }
  ]],
  ['proj_m3n4o5p6q7r8', [
    {
      id: 'src_4',
      projectId: 'proj_m3n4o5p6q7r8',
      fileName: 'svelte5_styleguide.pdf',
      fileType: 'application/pdf',
      fileSize: 1048576,
      origin: 'uploaded' as const,
      uploadedAt: '2026-06-12T10:00:00Z'
    }
  ]]
])

const projectChats = new Map<string, any[]>([
  ['proj_a1b2c3d4e5f6', [
    {
      id: 'chat_1',
      title: 'Competitor Analysis Q2 Review',
      lastMessage: "Let's summarize the key differentiators for the research document.",
      messageCount: 8,
      createdAt: '2026-06-18T10:00:00Z',
      updatedAt: '2026-06-18T14:30:00Z'
    },
    {
      id: 'chat_2',
      title: 'Roadmap Milestones Brainstorm',
      lastMessage: 'Understood. I will outline the phases based on development resources.',
      messageCount: 15,
      createdAt: '2026-06-15T09:00:00Z',
      updatedAt: '2026-06-15T11:20:00Z'
    }
  ]],
  ['proj_m3n4o5p6q7r8', [
    {
      id: 'chat_3',
      title: 'Svelte 5 Runes migration',
      lastMessage: 'All state variables successfully migrated to $state runes.',
      messageCount: 5,
      createdAt: '2026-06-17T15:00:00Z',
      updatedAt: '2026-06-17T16:20:00Z'
    }
  ]]
])

router.get('/projects', requireAuth, (req, res) => {
  const sorted = Array.from(projects.values()).sort((a, b) => {
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })
  res.json({ projects: sorted, total: sorted.length })
})

// Detailed project view
router.get('/projects/:id/detail', requireAuth, (req, res) => {
  const project = projects.get(req.params.id)
  if (!project) {
    return res.status(404).json({ detail: 'Project not found' })
  }
  const id = req.params.id
  res.json({
    ...project,
    instructions: projectInstructions.get(id) || '',
    sources: projectSources.get(id) || [],
    chats: projectChats.get(id) || []
  })
})

router.get('/projects/:id', requireAuth, (req, res) => {
  const project = projects.get(req.params.id)
  if (!project) {
    return res.status(404).json({ detail: 'Project not found' })
  }
  res.json(project)
})

router.post('/projects', requireAuth, (req, res) => {
  const { name, description, category, visibility } = req.body
  const now = new Date().toISOString()
  const project: Project = {
    id: `proj_${faker.string.alphanumeric(12)}`,
    name,
    description: description || '',
    category: category || 'research',
    visibility: visibility || 'private',
    createdAt: now,
    updatedAt: now,
    chatCount: 0,
  }
  projects.set(project.id, project)
  res.status(201).json(project)
})

router.patch('/projects/:id', requireAuth, (req, res) => {
  const project = projects.get(req.params.id)
  if (!project) {
    return res.status(404).json({ detail: 'Project not found' })
  }
  const updated = {
    ...project,
    ...req.body,
    updatedAt: new Date().toISOString(),
  }
  projects.set(req.params.id, updated)
  res.json(updated)
})

router.delete('/projects/:id', requireAuth, (req, res) => {
  if (!projects.has(req.params.id)) {
    return res.status(404).json({ detail: 'Project not found' })
  }
  projects.delete(req.params.id)
  projectInstructions.delete(req.params.id)
  projectSources.delete(req.params.id)
  projectChats.delete(req.params.id)
  res.status(204).send()
})

router.post('/projects/:id/share', requireAuth, (req, res) => {
  const project = projects.get(req.params.id)
  if (!project) {
    return res.status(404).json({ detail: 'Project not found' })
  }
  res.json({ shareUrl: `http://localhost:5173/projects/${req.params.id}/shared` })
})

// Instructions endpoints
router.put('/projects/:id/instructions', requireAuth, (req, res) => {
  const project = projects.get(req.params.id)
  if (!project) {
    return res.status(404).json({ detail: 'Project not found' })
  }
  const { instructions } = req.body
  projectInstructions.set(req.params.id, instructions || '')
  project.updatedAt = new Date().toISOString()
  res.status(200).json({ detail: 'Instructions updated' })
})

// Sources endpoints
router.post('/projects/:id/sources', requireAuth, (req, res) => {
  const project = projects.get(req.params.id)
  if (!project) {
    return res.status(404).json({ detail: 'Project not found' })
  }
  
  const fileNames = [
    'analytics_summary.pdf',
    'system_requirements.docx',
    'financial_projections.xlsx',
    'architecture_diagram.png',
    'api_spec.json',
    'readme_instructions.md'
  ]
  const randomName = fileNames[Math.floor(Math.random() * fileNames.length)]
  const uniqueName = `${randomName.split('.')[0]}_${faker.string.alphanumeric(4)}.${randomName.split('.')[1]}`
  
  const extensions: Record<string, string> = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    png: 'image/png',
    json: 'application/json',
    md: 'text/markdown'
  }
  const ext = uniqueName.split('.').pop() || 'pdf'
  const fileType = extensions[ext] || 'application/pdf'
  const fileSize = Math.floor(Math.random() * 2000000) + 50000

  const newSource = {
    id: `src_${faker.string.alphanumeric(12)}`,
    projectId: req.params.id,
    fileName: uniqueName,
    fileType: fileType,
    fileSize: fileSize,
    origin: 'uploaded' as const,
    uploadedAt: new Date().toISOString()
  }

  const currentSources = projectSources.get(req.params.id) || []
  projectSources.set(req.params.id, [...currentSources, newSource])
  
  project.updatedAt = new Date().toISOString()
  res.status(201).json(newSource)
})

router.delete('/projects/:projectId/sources/:sourceId', requireAuth, (req, res) => {
  const { projectId, sourceId } = req.params
  const project = projects.get(projectId)
  if (!project) {
    return res.status(404).json({ detail: 'Project not found' })
  }

  const currentSources = projectSources.get(projectId) || []
  const filtered = currentSources.filter(s => s.id !== sourceId)
  
  if (currentSources.length === filtered.length) {
    return res.status(404).json({ detail: 'Source not found' })
  }

  projectSources.set(projectId, filtered)
  project.updatedAt = new Date().toISOString()
  res.status(204).send()
})

// Artifact contribution — save chat-generated content (HTML/Markdown) into a project
router.post('/projects/:id/artifacts', requireAuth, (req, res) => {
  const project = projects.get(req.params.id)
  if (!project) {
    return res.status(404).json({ detail: 'Project not found' })
  }

  const { title, content, contentType } = req.body
  if (!title || !content || !contentType) {
    return res.status(400).json({ detail: 'title, content, and contentType are required' })
  }
  if (contentType !== 'text/html' && contentType !== 'text/markdown') {
    return res.status(400).json({ detail: 'contentType must be text/html or text/markdown' })
  }

  const ext = contentType === 'text/html' ? 'html' : 'md'
  const fileName = `${title.replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '_')}.${ext}`

  const artifact = {
    id: `src_${faker.string.alphanumeric(12)}`,
    projectId: req.params.id,
    fileName,
    fileType: contentType,
    fileSize: new Blob([content]).size,
    origin: 'artifact' as const,
    contributedBy: 'current-user',
    uploadedAt: new Date().toISOString()
  }

  const currentSources = projectSources.get(req.params.id) || []
  projectSources.set(req.params.id, [...currentSources, artifact])

  project.updatedAt = new Date().toISOString()
  res.status(201).json(artifact)
})

// Membership — cross-department sharing (owner-only on the real backend)
const projectMembers = new Map<string, Set<string>>()

router.post('/projects/:id/members', requireAuth, (req, res) => {
  const project = projects.get(req.params.id)
  if (!project) {
    return res.status(404).json({ detail: 'Project not found' })
  }
  const { userId, role } = req.body ?? {}
  if (!userId) {
    return res.status(400).json({ detail: 'userId is required' })
  }
  if (role && role !== 'member' && role !== 'owner') {
    return res.status(400).json({ detail: 'Invalid role' })
  }
  const members = projectMembers.get(req.params.id) ?? new Set<string>()
  if (members.has(userId)) {
    return res.status(409).json({ detail: 'User is already a member' })
  }
  members.add(userId)
  projectMembers.set(req.params.id, members)
  res.status(201).json({ detail: 'Member added' })
})

router.delete('/projects/:id/members/:userId', requireAuth, (req, res) => {
  const project = projects.get(req.params.id)
  if (!project) {
    return res.status(404).json({ detail: 'Project not found' })
  }
  const members = projectMembers.get(req.params.id)
  if (!members || !members.delete(req.params.userId)) {
    return res.status(404).json({ detail: 'Project or member not found' })
  }
  res.status(204).send()
})

// Conversation ↔ project linking (a chat can reference many projects)
const conversationProjects = new Map<string, Set<string>>()

router.post('/conversations/:conversationId/projects', requireAuth, (req, res) => {
  const { projectId } = req.body ?? {}
  if (!projectId) {
    return res.status(400).json({ detail: 'projectId is required' })
  }
  if (!projects.has(projectId)) {
    return res.status(404).json({ detail: 'Conversation or project not found' })
  }
  const links = conversationProjects.get(req.params.conversationId) ?? new Set<string>()
  if (links.has(projectId)) {
    return res.status(409).json({ detail: 'Already linked' })
  }
  links.add(projectId)
  conversationProjects.set(req.params.conversationId, links)
  res.status(201).json({ detail: 'Project linked to conversation' })
})

router.delete('/conversations/:conversationId/projects/:projectId', requireAuth, (req, res) => {
  const links = conversationProjects.get(req.params.conversationId)
  if (!links || !links.delete(req.params.projectId)) {
    return res.status(404).json({ detail: 'Conversation or link not found' })
  }
  res.status(204).send()
})

export default router
