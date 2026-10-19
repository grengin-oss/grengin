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
/** Persisted artifact content, served by GET /artifacts/:id (ENGG-387). */
export const artifacts = new Map<string, {
  id: string; title: string; content_type: string; content: string;
  conversation_id: string; message_id: string; file_id: string;
  created_at: string; updated_at: string;
}>()
export const aiEngines = new Map<string, AIEngineDetail>()
export const departments = new Map<string, Department>()
export const projects = new Map<string, Project>()

/**
 * The last user who signed in through an SSO provider (Google, Microsoft,
 * Keycloak). Each SSO sign-in is a brand-new workspace creator: a Super Admin
 * created before every fixture user, so the app's first-launch tour (ENGG-447)
 * treats them as the first Super Admin on a first login. Email/password login
 * clears it and signs in as the demo admin, as before.
 */
export const ssoSession: {
  creator: (User & { is_super_admin: boolean; status: string; roles: string[]; provider: string }) | null
} = {
  creator: null,
}

/**
 * Empty-workspace mode. A Microsoft (azure) SSO sign-in starts a brand-new,
 * empty workspace: no chats, projects, files, departments, keys, teammates,
 * analytics or audit history (see lib/emptyWorkspace.ts). Anything added during
 * that session — a key, a user, a chat — sticks until the next sign-in.
 * Any other sign-in brings the sample data back.
 */
export const workspace: { empty: boolean; users: Record<string, unknown>[]; roleIds: string[] } = {
  empty: false,
  users: [],
  /** Custom roles created in the empty workspace. */
  roleIds: [],
}

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
/**
 * A showcase conversation whose assistant turn produces one artifact of each
 * render kind, for exercising the artifact panel locally (code in several
 * languages, a titleless code artifact that must auto-detect, a live HTML page,
 * and a Mermaid diagram). Open it at `/?chatId=<SHOWCASE_CHAT_ID>`.
 */
export const SHOWCASE_CHAT_ID = 'a1b2c3d4-0000-4000-8000-000000000abc'

function seedArtifactShowcase() {
  const convId = SHOWCASE_CHAT_ID
  const userMsgId = 'a1b2c3d4-0000-4000-8000-0000000000u1'
  const asstMsgId = 'a1b2c3d4-0000-4000-8000-0000000000a1'
  const now = new Date().toISOString()

  const defs: Array<{ title: string; content_type: string; content: string }> = [
    {
      title: 'ProductRepository.java',
      content_type: 'application/javascript',
      content:
        'import java.util.Map;\nimport java.util.Optional;\nimport java.util.concurrent.ConcurrentHashMap;\n\npublic class ProductRepository {\n    private final Map<Long, Product> store = new ConcurrentHashMap<>();\n\n    public Product save(Product product) {\n        if (product == null) throw new IllegalArgumentException("null");\n        store.put(product.getId(), product);\n        return product;\n    }\n\n    public Optional<Product> findById(Long id) {\n        return Optional.ofNullable(store.get(id));\n    }\n}\n',
    },
    {
      // No file extension in the title -> must auto-detect (Python).
      title: 'CSV Column Row Counter',
      content_type: 'application/javascript',
      content:
        '#!/usr/bin/env python3\nimport csv, sys\n\ndef count_rows(path):\n    with open(path, newline="") as f:\n        return sum(1 for _ in csv.reader(f))\n\nif __name__ == "__main__":\n    print(f"rows: {count_rows(sys.argv[1])}")\n',
    },
    {
      title: 'result.ts',
      content_type: 'application/javascript',
      content:
        'export type Result<T, E> =\n  | { ok: true; value: T }\n  | { ok: false; error: E };\n\nexport const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });\nexport const err = <E>(error: E): Result<never, E> => ({ ok: false, error });\n',
    },
    {
      title: 'card-grid.css',
      content_type: 'application/javascript',
      content:
        ':root { --gap: 16px; }\n.grid {\n  display: grid;\n  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));\n  gap: var(--gap);\n}\n@media (prefers-color-scheme: dark) {\n  .card { background: #161b22; color: #e6edf3; }\n}\n',
    },
    {
      title: 'landing.html',
      content_type: 'text/html',
      content:
        '<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:system-ui;margin:0;display:grid;place-items:center;height:100vh;background:#4079c5;color:#fff}h1{font-size:40px}</style></head><body><div><h1>Grengin</h1><p>Rendered HTML artifact (live page).</p></div></body></html>',
    },
    {
      title: 'Login Flow Diagram',
      content_type: 'text/markdown',
      content:
        '# User Login Flow\n\n```mermaid\nflowchart TD\n    A([Start]) --> B[Enter credentials]\n    B --> C{Valid?}\n    C -->|Yes| D[Dashboard]\n    C -->|No| E[Error]\n    E --> B\n```\n',
    },
  ]

  const metas = defs.map((d, i) => {
    const id = `a1b2c3d4-0000-4000-8000-00000000art${i}`
    const fileId = `a1b2c3d4-0000-4000-8000-0000000fil${i}`
    artifacts.set(id, {
      id, title: d.title, content_type: d.content_type, content: d.content,
      conversation_id: convId, message_id: asstMsgId, file_id: fileId,
      created_at: now, updated_at: now,
    })
    return { id, file_id: fileId, title: d.title, content_type: d.content_type }
  })

  conversations.set(convId, {
    id: convId, title: 'Artifact Showcase', archived: false,
    created_at: now, updated_at: now,
  } as Conversation)

  messages.set(convId, [
    {
      id: userMsgId, conversation_id: convId, role: 'user', model: 'claude-opus-4-8',
      parts: { text: 'Show me one artifact of each kind.', files: [] },
      created_at: now, updated_at: now,
      usage: { input_tokens: 0, output_tokens: 0 },
    } as Message,
    {
      id: asstMsgId, conversation_id: convId, role: 'assistant', model: 'claude-opus-4-8',
      parts: { text: 'Here is one artifact of each supported kind — code (Java, Python, TypeScript, CSS), a live HTML page, and a Mermaid diagram.', files: [], artifacts: metas } as any,
      created_at: now, updated_at: now,
      usage: { input_tokens: 40, output_tokens: 120 },
    } as Message,
  ])
}

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

  seedArtifactShowcase()

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

/** Drop every in-memory record and seed the sample data again. */
export const resetStores = () => {
  conversations.clear()
  messages.clear()
  files.clear()
  aiEngines.clear()
  departments.clear()
  projects.clear()
  seedData()
}

/**
 * A fresh workspace: nothing but the engine registry, and no engine holds a
 * key yet.
 */
export const emptyStores = () => {
  resetStores()
  conversations.clear()
  messages.clear()
  files.clear()
  departments.clear()
  projects.clear()
  for (const [key, engine] of aiEngines) {
    aiEngines.set(key, {
      ...engine,
      is_enabled: false,
      is_default: false,
      api_key_configured: false,
      api_key_status: 'not_configured',
      api_key_preview: null,
      api_key_last_validated_at: null,
      whitelisted_models: [],
      default_model: null,
    } as AIEngineDetail)
  }
}
