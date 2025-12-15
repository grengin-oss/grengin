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

// In-memory stores
export const conversations = new Map<string, Conversation>()
export const messages = new Map<string, Message[]>()
export const files = new Map<string, UserFile>()
export const aiEngines = new Map<string, AIEngineDetail>()

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
  aiEnginesExample.forEach((engine) => {
    aiEngines.set(engine.engine_key, engine as AIEngineDetail)
  })
}
