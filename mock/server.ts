import express from 'express'
import cors from 'cors'
import type { components } from './types/api.js'
import { faker } from '@faker-js/faker'
import chatListExample from './examples/chat/list.response.json' with { type: 'json' }
import chatDetailExample from './examples/chat/detail.response.json' with { type: 'json' }
import loginExample from './examples/auth/login.response.json' with { type: 'json' }

// Types
type Conversation = components['schemas']['Conversation']
type Message = components['schemas']['Message']
type User = components['schemas']['User']
type HealthResponse = components['schemas']['HealthResponse']
type UserFile = components['schemas']['UserFile']
type PaginatedFiles = components['schemas']['PaginatedFiles']
type UserSettings = components['schemas']['UserSettings']
type ProviderInfo = components['schemas']['ProviderInfo']

// In-memory stores
const conversations = new Map<string, Conversation>()
const messages = new Map<string, Message[]>()
const files = new Map<string, UserFile>()
let userSettings: UserSettings = {
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
}

// Seed data
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

const app = express()

// Enable CORS
app.use(cors())
app.use(express.json())

// Auth middleware
const requireAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ detail: 'Unauthorized' })
  }
  next()
}

// Auth endpoints
app.post('/auth/login', (req, res) => {
  const { email, password } = req.body

  if (!email || !password) {
    return res.status(400).json({ detail: 'Email and password are required' })
  }

  // Accept demo credentials
  if (email === 'admin@grengin.com' && password === 'Demo123456!@') {
    return res.json({
      requires_mfa: loginExample.requires_mfa,
      access_token: loginExample.access_token,
      refresh_token: loginExample.refresh_token,
      expires_in: loginExample.expires_in,
      user: loginExample.user,
    })
  }

  return res.status(401).json({ detail: 'Invalid email or password' })
})

app.post('/auth/refresh', (req, res) => {
  const { refresh_token } = req.body

  if (!refresh_token) {
    return res.status(401).json({ detail: 'Refresh token is required' })
  }

  return res.json({
    access_token: loginExample.access_token,
    refresh_token: loginExample.refresh_token,
    expires_in: loginExample.expires_in,
    user: loginExample.user,
  })
})

app.post('/auth/logout', requireAuth, (req, res) => {
  res.status(204).send()
})

// SSO endpoints - Mock OAuth flow
// Instead of redirecting to real OAuth providers, we redirect to our own mock callback
// that immediately returns tokens, simulating a successful OAuth flow

app.get('/auth/google', (req, res) => {
  const state = faker.string.alphanumeric(32)
  const redirectUri = req.query.redirect_uri as string || 'http://localhost:5173/auth/callback'

  // Build mock callback URL that will return tokens directly
  const mockUser = {
    id: '550e8400-e29b-41d4-a716-446655440001',
    sub: 'google|112233445566778899',
    email: 'demo@grengin.com',
    name: 'Demo User',
    picture: 'https://api.dicebear.com/7.x/avataaars/svg?seed=GoogleDemo',
    hd: 'grengin.com',
    role: 'admin',
    status: 'active',
    hasPassword: false,
    mfaEnabled: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: new Date().toISOString(),
  }

  // Return URL that points to our mock OAuth callback endpoint
  const callbackUrl = new URL('http://localhost:3000/auth/google/callback')
  callbackUrl.searchParams.set('state', state)
  callbackUrl.searchParams.set('redirect_uri', redirectUri)
  callbackUrl.searchParams.set('user', JSON.stringify(mockUser))

  res.json({
    auth_url: callbackUrl.toString(),
    state,
  })
})

// Mock OAuth callback - simulates what happens after user authenticates with provider
app.get('/auth/google/callback', (req, res) => {
  const redirectUri = req.query.redirect_uri as string || 'http://localhost:5173/auth/callback'
  const userJson = req.query.user as string

  let user
  try {
    user = userJson ? JSON.parse(userJson) : {
      id: '550e8400-e29b-41d4-a716-446655440001',
      sub: 'google|112233445566778899',
      email: 'demo@grengin.com',
      name: 'Demo User',
      picture: 'https://api.dicebear.com/7.x/avataaars/svg?seed=GoogleDemo',
      hd: 'grengin.com',
      role: 'admin',
      status: 'active',
      hasPassword: false,
      mfaEnabled: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: new Date().toISOString(),
    }
  } catch {
    user = {
      id: '550e8400-e29b-41d4-a716-446655440001',
      sub: 'google|112233445566778899',
      email: 'demo@grengin.com',
      name: 'Demo User',
      picture: 'https://api.dicebear.com/7.x/avataaars/svg?seed=GoogleDemo',
      hd: 'grengin.com',
      role: 'admin',
      status: 'active',
      hasPassword: false,
      mfaEnabled: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: new Date().toISOString(),
    }
  }

  // Generate tokens
  const accessToken = `mock_access_token_${faker.string.alphanumeric(32)}`
  const refreshToken = `mock_refresh_token_${faker.string.alphanumeric(32)}`

  // Redirect to frontend with tokens
  const frontendCallback = new URL(redirectUri)
  frontendCallback.searchParams.set('access_token', accessToken)
  frontendCallback.searchParams.set('refresh_token', refreshToken)
  frontendCallback.searchParams.set('user', encodeURIComponent(JSON.stringify(user)))

  res.redirect(frontendCallback.toString())
})

app.get('/auth/azure', (req, res) => {
  const state = faker.string.alphanumeric(32)
  const redirectUri = req.query.redirect_uri as string || 'http://localhost:5173/auth/callback'

  const mockUser = {
    id: '550e8400-e29b-41d4-a716-446655440002',
    sub: 'azure|aabbccdd-1122-3344-5566-778899aabbcc',
    email: 'azure-demo@grengin.com',
    name: 'Azure Demo User',
    picture: 'https://api.dicebear.com/7.x/avataaars/svg?seed=AzureDemo',
    hd: 'grengin.com',
    role: 'admin',
    status: 'active',
    hasPassword: false,
    mfaEnabled: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: new Date().toISOString(),
  }

  const callbackUrl = new URL('http://localhost:3000/auth/azure/callback')
  callbackUrl.searchParams.set('state', state)
  callbackUrl.searchParams.set('redirect_uri', redirectUri)
  callbackUrl.searchParams.set('user', JSON.stringify(mockUser))

  res.json({
    auth_url: callbackUrl.toString(),
    state,
  })
})

app.get('/auth/azure/callback', (req, res) => {
  const redirectUri = req.query.redirect_uri as string || 'http://localhost:5173/auth/callback'
  const userJson = req.query.user as string

  let user
  try {
    user = userJson ? JSON.parse(userJson) : {
      id: '550e8400-e29b-41d4-a716-446655440002',
      sub: 'azure|aabbccdd-1122-3344-5566-778899aabbcc',
      email: 'azure-demo@grengin.com',
      name: 'Azure Demo User',
      picture: 'https://api.dicebear.com/7.x/avataaars/svg?seed=AzureDemo',
      hd: 'grengin.com',
      role: 'admin',
      status: 'active',
      hasPassword: false,
      mfaEnabled: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: new Date().toISOString(),
    }
  } catch {
    user = {
      id: '550e8400-e29b-41d4-a716-446655440002',
      sub: 'azure|aabbccdd-1122-3344-5566-778899aabbcc',
      email: 'azure-demo@grengin.com',
      name: 'Azure Demo User',
      picture: 'https://api.dicebear.com/7.x/avataaars/svg?seed=AzureDemo',
      hd: 'grengin.com',
      role: 'admin',
      status: 'active',
      hasPassword: false,
      mfaEnabled: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: new Date().toISOString(),
    }
  }

  const accessToken = `mock_access_token_${faker.string.alphanumeric(32)}`
  const refreshToken = `mock_refresh_token_${faker.string.alphanumeric(32)}`

  const frontendCallback = new URL(redirectUri)
  frontendCallback.searchParams.set('access_token', accessToken)
  frontendCallback.searchParams.set('refresh_token', refreshToken)
  frontendCallback.searchParams.set('user', encodeURIComponent(JSON.stringify(user)))

  res.redirect(frontendCallback.toString())
})

// Health endpoint
app.get('/health', (req, res) => {
  const response: HealthResponse = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      database: 'up',
      redis: 'up',
      llm_providers: {
        anthropic: 'up',
        openai: 'up',
        google: 'up',
      },
    },
    version: '1.0.0',
  }
  res.json(response)
})

// User endpoints
app.get('/me', requireAuth, (req, res) => {
  const user: User = {
    id: '550e8400-e29b-41d4-a716-446655440001',
    sub: 'auth0|507f1f77bcf86cd799439011',
    email: 'demo@grengin.com',
    name: 'Demo User',
    picture: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Demo',
    hd: 'grengin.com',
    super_admin: false,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: new Date().toISOString(),
  }
  res.json(user)
})

// Chat endpoints
app.get('/chat', requireAuth, (req, res) => {
  res.json({
    conversations: Array.from(conversations.values()),
    total: conversations.size,
  })
})

app.get('/chat/:chatId', requireAuth, (req, res) => {
  const conversation = conversations.get(req.params.chatId)
  if (!conversation) {
    return res.status(404).json({ detail: 'Conversation not found' })
  }
  res.json({
    ...conversation,
    messages: messages.get(req.params.chatId) || [],
  })
})

app.put('/chat/:chatId', requireAuth, (req, res) => {
  const conversation = conversations.get(req.params.chatId)
  if (!conversation) {
    return res.status(404).json({ detail: 'Conversation not found' })
  }
  const updated: Conversation = {
    ...conversation,
    ...req.body,
    updated_at: new Date().toISOString(),
  }
  conversations.set(req.params.chatId, updated)
  res.json(updated)
})

app.delete('/chat/:chatId', requireAuth, (req, res) => {
  if (!conversations.has(req.params.chatId)) {
    return res.status(404).json({ detail: 'Conversation not found' })
  }
  conversations.delete(req.params.chatId)
  messages.delete(req.params.chatId)
  res.status(204).send()
})

app.post('/chat/stream', requireAuth, async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  const conversationId = req.body.conversation_id || faker.string.uuid()

  // Send start event
  res.write(`event: start\ndata: ${JSON.stringify({
    conversation_id: conversationId,
    files_attached: 0
  })}\n\n`)

  await new Promise(resolve => setTimeout(resolve, 100))

  // Simulate response content
  const response = `Based on your question, here's a detailed analysis of business growth strategies...

This is a simulated streaming response from the mock API. In production, this would be real-time AI-generated content.

Key points to consider:
1. Market positioning
2. Customer acquisition channels
3. Product-market fit
4. Scalability considerations

Would you like me to elaborate on any of these areas?`

  const words = response.split(' ')
  for (const word of words) {
    res.write(`event: token\ndata: ${JSON.stringify({
      content: word + ' ',
      conversation_id: conversationId
    })}\n\n`)
    await new Promise(resolve => setTimeout(resolve, 50))
  }

  // Send title generation event (simulate)
  await new Promise(resolve => setTimeout(resolve, 200))
  res.write(`event: set_title\ndata: ${JSON.stringify({
    conversation_id: conversationId,
    title: 'Business Growth Strategies'
  })}\n\n`)

  // Send completion event
  res.write(`event: done\ndata: ${JSON.stringify({
    conversation_id: conversationId,
    user_message_id: faker.string.uuid(),
    assistant_message_id: faker.string.uuid()
  })}\n\n`)

  res.end()
})

// File endpoints
app.get('/files', requireAuth, (req, res) => {
  const limit = parseInt(req.query.limit as string || '20')
  const offset = parseInt(req.query.offset as string || '0')
  const sort = req.query.sort as string || 'created_at'
  const order = req.query.order as string || 'desc'

  const allFiles = Array.from(files.values())
  const sortedFiles = allFiles.sort((a: any, b: any) => {
    const aVal = a[sort]
    const bVal = b[sort]
    if (order === 'asc') {
      return aVal > bVal ? 1 : -1
    }
    return aVal < bVal ? 1 : -1
  })

  const paginatedFiles = sortedFiles.slice(offset, offset + limit)
  const response: PaginatedFiles = {
    files: paginatedFiles,
    total: allFiles.length,
    limit,
    offset,
    sort,
    order: order as 'asc' | 'desc',
  }
  res.json(response)
})

app.post('/files', requireAuth, (req, res) => {
  const fileId = faker.string.uuid()
  const newFile: UserFile = {
    id: fileId,
    name: req.body.name || 'untitled.txt',
    size: req.body.size || 0,
    type: req.body.type || 'text/plain',
    description: req.body.description || null,
    url: `/files/${fileId}`,
    download_url: `/files/${fileId}/download`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    user_id: 'auth0|507f1f77bcf86cd799439011',
    status: 'uploaded',
  }
  files.set(fileId, newFile)
  res.json(newFile)
})

app.get('/files/:fileId', requireAuth, (req, res) => {
  const file = files.get(req.params.fileId)
  if (!file) {
    return res.status(404).json({ detail: 'File not found' })
  }
  res.json(file)
})

app.delete('/files/:fileId', requireAuth, (req, res) => {
  if (!files.has(req.params.fileId)) {
    return res.status(404).json({ detail: 'File not found' })
  }
  files.delete(req.params.fileId)
  res.status(204).send()
})

// Settings endpoints
app.get('/settings', requireAuth, (req, res) => {
  res.json(userSettings)
})

app.put('/settings', requireAuth, (req, res) => {
  userSettings = {
    ...userSettings,
    ...req.body,
    models: {
      ...userSettings.models,
      ...(req.body.models || {}),
      tool_models: {
        ...userSettings.models?.tool_models,
        ...(req.body.models?.tool_models || {}),
      },
    },
  }
  res.json(userSettings)
})

// Models endpoints
app.get('/models', (req, res) => {
  res.json({
    providers: [
      {
        key: 'anthropic',
        name: 'Anthropic',
        icon: 'https://assets.anthropic.com/icon.svg',
        models: [
          {
            key: 'claude-sonnet-4-20250514',
            name: 'Claude Sonnet 4',
            context_window: 200000,
            max_output_tokens: 16384,
            supports_streaming: true,
            supports_tools: true,
            supports_vision: true,
            pricing: { input: 0.003, output: 0.015 },
          },
          {
            key: 'claude-sonnet-4-5',
            name: 'Claude 3.5 Sonnet',
            context_window: 200000,
            max_output_tokens: 8192,
            supports_streaming: true,
            supports_tools: true,
            supports_vision: true,
            pricing: { input: 0.003, output: 0.015 },
          },
          {
            key: 'claude-3-opus-20240229',
            name: 'Claude 3 Opus',
            context_window: 200000,
            max_output_tokens: 4096,
            supports_streaming: true,
            supports_tools: true,
            supports_vision: true,
            pricing: { input: 0.015, output: 0.075 },
          },
          {
            key: 'claude-3-haiku-20240307',
            name: 'Claude 3 Haiku',
            context_window: 200000,
            max_output_tokens: 4096,
            supports_streaming: true,
            supports_tools: true,
            supports_vision: true,
            pricing: { input: 0.00025, output: 0.00125 },
          },
        ],
      },
      {
        key: 'openai',
        name: 'OpenAI',
        icon: 'https://openai.com/icon.svg',
        models: [
          {
            key: 'gpt-4o',
            name: 'GPT-4o',
            context_window: 128000,
            max_output_tokens: 16384,
            supports_streaming: true,
            supports_tools: true,
            supports_vision: true,
            pricing: { input: 0.0025, output: 0.01 },
          },
          {
            key: 'gpt-5.1',
            name: 'GPT-4 Turbo',
            context_window: 128000,
            max_output_tokens: 4096,
            supports_streaming: true,
            supports_tools: true,
            supports_vision: true,
            pricing: { input: 0.01, output: 0.03 },
          },
          {
            key: 'gpt-4',
            name: 'GPT-4',
            context_window: 8192,
            max_output_tokens: 4096,
            supports_streaming: true,
            supports_tools: true,
            supports_vision: false,
            pricing: { input: 0.03, output: 0.06 },
          },
          {
            key: 'gpt-3.5-turbo',
            name: 'GPT-3.5 Turbo',
            context_window: 16385,
            max_output_tokens: 4096,
            supports_streaming: true,
            supports_tools: true,
            supports_vision: false,
            pricing: { input: 0.0005, output: 0.0015 },
          },
        ],
      },
      {
        key: 'google',
        name: 'Google',
        icon: 'https://google.com/icon.svg',
        models: [
          {
            key: 'gemini-2.0-flash',
            name: 'Gemini 2.0 Flash',
            context_window: 1000000,
            max_output_tokens: 8192,
            supports_streaming: true,
            supports_tools: true,
            supports_vision: true,
            pricing: { input: 0.00010, output: 0.00040 },
          },
          {
            key: 'gemini-1.5-pro',
            name: 'Gemini 1.5 Pro',
            context_window: 2000000,
            max_output_tokens: 8192,
            supports_streaming: true,
            supports_tools: true,
            supports_vision: true,
            pricing: { input: 0.00125, output: 0.005 },
          },
        ],
      },
    ],
  })
})

const PORT = process.env.PORT || 3000
const HOST = process.env.HOST || 'localhost'

app.listen(PORT, () => {
  console.log(`🚀 Grengin Mock API Server v1.0.0`)
  console.log(`   Running at http://${HOST}:${PORT}`)
  console.log('')
  console.log('Auth endpoints:')
  console.log(`  POST /auth/login            - Password login`)
  console.log(`  POST /auth/refresh          - Refresh token`)
  console.log(`  POST /auth/logout           - Logout (auth required)`)
  console.log(`  GET  /auth/google           - Google SSO init (mock)`)
  console.log(`  GET  /auth/google/callback  - Google SSO callback (mock)`)
  console.log(`  GET  /auth/azure            - Azure SSO init (mock)`)
  console.log(`  GET  /auth/azure/callback   - Azure SSO callback (mock)`)
  console.log('')
  console.log('Core endpoints:')
  console.log(`  GET  /health       - Health check`)
  console.log(`  GET  /models       - List AI models`)
  console.log(`  GET  /me           - Current user (auth required)`)
  console.log(`  *    /chat/*       - Chat endpoints (auth required)`)
  console.log(`  *    /files/*      - File endpoints (auth required)`)
  console.log(`  *    /settings     - Settings (auth required)`)
  console.log('')
  console.log('🔑 Demo credentials: admin@grengin.com / Demo123456!@')
  console.log('💡 Use "Bearer <token>" for authentication')
  console.log('📚 See mock/README.md for full endpoint documentation')
})
