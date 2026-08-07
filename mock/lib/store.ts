// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

import type { components } from '../types/api.js'
import { faker } from '@faker-js/faker'
import chatListExample from '../examples/chat/list.response.json' with { type: 'json' }
import chatDetailExample from '../examples/chat/detail.response.json' with { type: 'json' }
import aiEnginesExample from '../examples/admin/ai-engines-list.response.json' with { type: 'json' }

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
export const departments = new Map<string, Department>()
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
  // Seed conversations
  chatListExample.conversations.forEach((conv) => {
    conversations.set(conv.id, conv as Conversation)
  })
  messages.set(chatDetailExample.id, chatDetailExample.messages as Message[])
  chatListExample.conversations.forEach((conv) => {
    if (!messages.has(conv.id)) {
      messages.set(conv.id, [])
    }
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

  // Seed AI engine data from examples
  if (aiEnginesExample && Array.isArray(aiEnginesExample)) {
    aiEnginesExample.forEach((engine) => {
      aiEngines.set(engine.engine_key, engine as AIEngineDetail)
    })
  }

  // Seed department data (v1.2 hierarchical departments)
  const now = new Date().toISOString()
  const engineeringDept: Department = {
    id: 'd0010000-0000-0000-0000-000000000001',
    name: 'Engineering',
    description: 'Product engineering and development team',
    parent_id: null,
    path: '/engineering',
    depth: 0,
    admin_ids: ['550e8400-e29b-41d4-a716-446655440001'],
    member_count: 1,
    total_member_count: 3,
    child_count: 2,
    budget_allocated: 50000,
    budget_distributed: 20000,
    budget_available: 30000,
    budget_used: 15000,
    budget_period: 'monthly',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: now,
  }

  const marketingDept: Department = {
    id: 'd0020000-0000-0000-0000-000000000002',
    name: 'Marketing',
    description: 'Marketing and communications team',
    parent_id: null,
    path: '/marketing',
    depth: 0,
    admin_ids: [],
    member_count: 1,
    total_member_count: 1,
    child_count: 0,
    budget_allocated: 25000,
    budget_distributed: 0,
    budget_available: 25000,
    budget_used: 8000,
    budget_period: 'monthly',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: now,
  }

  const frontendDept: Department = {
    id: 'd0030000-0000-0000-0000-000000000003',
    name: 'Frontend',
    description: 'Frontend development team',
    parent_id: 'd0010000-0000-0000-0000-000000000001',
    path: '/engineering/frontend',
    depth: 1,
    admin_ids: [],
    member_count: 1,
    total_member_count: 1,
    child_count: 0,
    budget_allocated: 10000,
    budget_distributed: 0,
    budget_available: 10000,
    budget_used: 5000,
    budget_period: 'monthly',
    created_at: '2024-01-05T00:00:00Z',
    updated_at: now,
  }

  const backendDept: Department = {
    id: 'd0040000-0000-0000-0000-000000000004',
    name: 'Backend',
    description: 'Backend and infrastructure team',
    parent_id: 'd0010000-0000-0000-0000-000000000001',
    path: '/engineering/backend',
    depth: 1,
    admin_ids: [],
    member_count: 1,
    total_member_count: 1,
    child_count: 0,
    budget_allocated: 10000,
    budget_distributed: 0,
    budget_available: 10000,
    budget_used: 7000,
    budget_period: 'monthly',
    created_at: '2024-01-05T00:00:00Z',
    updated_at: now,
  }

  departments.set(engineeringDept.id, engineeringDept)
  departments.set(marketingDept.id, marketingDept)
  departments.set(frontendDept.id, frontendDept)
  departments.set(backendDept.id, backendDept)

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
