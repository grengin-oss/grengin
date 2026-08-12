// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

import type { components } from '../types/api.js'
import { faker } from '@faker-js/faker'
import aiEnginesExample from '../examples/admin/ai-engines-list.response.json' with { type: 'json' }
import { DEMO_DEPARTMENTS, DEMO_CONVERSATIONS, DEMO_MESSAGES, DEMO_CHAT_FILES, type DemoDepartment } from './demoSeed.js'

// Types
export type Conversation = components['schemas']['Conversation']
export type Message = components['schemas']['Message']
export type User = components['schemas']['User']
export type HealthResponse = components['schemas']['HealthResponse']
export type UserFile = components['schemas']['UserFile']
export type PaginatedFiles = components['schemas']['PaginatedFiles']
export type UserSettings = components['schemas']['UserSettings']
export type AIEngineDetail = components['schemas']['AIEngineDetail']
export type AIEngineModelsResponse = components['schemas']['AIEngineModelsResponse']
export type Department = components['schemas']['Department']
export type DepartmentCreate = components['schemas']['DepartmentCreate']
export type DepartmentUpdate = components['schemas']['DepartmentUpdate']
export type DepartmentTree = components['schemas']['DepartmentTree']
export type DepartmentBudgetStatus = components['schemas']['DepartmentBudgetStatus']
export type BudgetPeriod = components['schemas']['BudgetPeriod']

export interface Project {
  id: string
  name: string
  description: string
  category: string
  visibility: 'private' | 'team'
  createdAt: string
  updatedAt: string
  chatCount: number
}

// In-memory stores
export const conversations = new Map<string, Conversation>()
export const messages = new Map<string, Message[]>()
export const files = new Map<string, UserFile>()
export const aiEngines = new Map<string, AIEngineDetail>()
export const departments = new Map<string, DemoDepartment>()
export const projects = new Map<string, Project>()

export let userSettings: UserSettings = {
  models: {
    tool_models: {
      default: {
        model_name: 'claude-sonnet-4-5',
        provider: 'anthropic',
      },
      web_search: {
        model_name: 'gpt-4o-mini-search-preview',
        provider: 'openai',
      },
    },
  },
  language: 'en',
}

export const setUserSettings = (settings: UserSettings) => {
  userSettings = settings
}

// Seed data
export const seedData = () => {
  // Seed conversations (spec §2) — EXACTLY 2 pre-existing conversations: one that
  // used web search, one that used image generation. Sourced from the seed module.
  DEMO_CONVERSATIONS.forEach((conv) => {
    conversations.set(conv.id, conv as unknown as Conversation)
    messages.set(conv.id, (DEMO_MESSAGES[conv.id] ?? []) as unknown as Message[])
  })

  // Seed file data
  const file1Id = faker.string.uuid()
  const file2Id = faker.string.uuid()

  files.set(file1Id, {
    id: file1Id,
    name: 'business-plan.pdf',
    size: 524288,
    type: 'application/pdf',
    description: 'Q1 2024 Business Plan',
    url: `/files/${file1Id}`,
    download_url: `/files/${file1Id}/download`,
    created_at: '2024-01-15T10:30:00Z',
    updated_at: '2024-01-15T10:30:00Z',
    user_id: 'auth0|507f1f77bcf86cd799439011',
    status: 'uploaded',
  })

  files.set(file2Id, {
    id: file2Id,
    name: 'logo.png',
    size: 102400,
    type: 'image/png',
    description: null,
    url: `/files/${file2Id}`,
    download_url: `/files/${file2Id}/download`,
    created_at: '2024-01-14T15:20:00Z',
    updated_at: '2024-01-14T15:20:00Z',
    user_id: 'auth0|507f1f77bcf86cd799439011',
    status: 'uploaded',
  })

  // Seed the demo chat's generated image (spec §2) so it renders on reload.
  DEMO_CHAT_FILES.forEach((f) => files.set(f.id, f as unknown as UserFile))

  // Seed AI engine data from examples
  if (aiEnginesExample && Array.isArray(aiEnginesExample)) {
    aiEnginesExample.forEach((engine) => {
      aiEngines.set(engine.engine_key, engine as AIEngineDetail)
    })
  }

  // Seed department data — the 8 canonical demo departments (spec §3.5), sourced
  // from the single seed module so members/budgets/admins match users everywhere.
  DEMO_DEPARTMENTS.forEach((dept) => departments.set(dept.id, dept))

  // Seed projects
  const seedProjects: Project[] = [
    {
      id: 'proj_a1b2c3d4e5f6',
      name: 'Q3 Product Research',
      description: 'Research and analysis for Q3 product roadmap',
      category: 'research',
      visibility: 'team',
      createdAt: '2024-06-01T09:00:00Z',
      updatedAt: '2024-06-18T14:30:00Z',
      chatCount: 12,
    },
    {
      id: 'proj_g7h8i9j0k1l2',
      name: 'API Migration Plan',
      description: 'Planning the migration from v1 to v2 API',
      category: 'planning',
      visibility: 'team',
      createdAt: '2024-05-15T10:00:00Z',
      updatedAt: '2024-06-15T11:45:00Z',
      chatCount: 8,
    },
    {
      id: 'proj_m3n4o5p6q7r8',
      name: 'Frontend Refactor',
      description: 'Svelte 5 migration and component library updates',
      category: 'code',
      visibility: 'private',
      createdAt: '2024-06-10T08:00:00Z',
      updatedAt: '2024-06-17T16:20:00Z',
      chatCount: 5,
    },
    {
      id: 'proj_s9t0u1v2w3x4',
      name: 'Onboarding Flow Design',
      description: 'Designing the new user onboarding experience',
      category: 'design',
      visibility: 'team',
      createdAt: '2024-06-05T13:00:00Z',
      updatedAt: '2024-06-14T09:15:00Z',
      chatCount: 3,
    },
    {
      id: 'proj_y5z6a7b8c9d0',
      name: 'Meeting Notes - Sprint Reviews',
      description: 'Collection of sprint review meeting summaries',
      category: 'meetings',
      visibility: 'private',
      createdAt: '2024-04-01T10:00:00Z',
      updatedAt: '2024-06-12T17:00:00Z',
      chatCount: 20,
    },
  ]

  seedProjects.forEach((p) => projects.set(p.id, p))
}
