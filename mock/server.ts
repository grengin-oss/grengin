import express from 'express'
import cors from 'cors'
import type { components } from './types/api.js'
import { faker } from '@faker-js/faker'
import chatListExample from './examples/chat/list.response.json' with { type: 'json' }
import chatDetailExample from './examples/chat/detail.response.json' with { type: 'json' }
import loginExample from './examples/auth/login.response.json' with { type: 'json' }
import modelsExample from './examples/models/providers.response.json' with { type: 'json' }
import aiEnginesExample from './examples/admin/ai-engines-list.response.json' with { type: 'json' }

// Types
type Conversation = components['schemas']['Conversation']
type Message = components['schemas']['Message']
type User = components['schemas']['User']
type HealthResponse = components['schemas']['HealthResponse']
type UserFile = components['schemas']['UserFile']
type PaginatedFiles = components['schemas']['PaginatedFiles']
type UserSettings = components['schemas']['UserSettings']
type AIEngineDetail = components['schemas']['AIEngineDetail']
type AIEngineModelsResponse = components['schemas']['AIEngineModelsResponse']

// In-memory stores
const conversations = new Map<string, Conversation>()
const messages = new Map<string, Message[]>()
const files = new Map<string, UserFile>()
const aiEngines = new Map<string, AIEngineDetail>()
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
  language: 'en',
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

// Seed AI engine data from examples
aiEnginesExample.forEach((engine) => {
  aiEngines.set(engine.engine_key, engine as AIEngineDetail)
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
      accessToken: loginExample.access_token,
      refresh_token: loginExample.refresh_token,
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
    requires_mfa: false,
    accessToken: loginExample.access_token,
    refresh_token: loginExample.refresh_token,
    user: loginExample.user,
  })
})

app.post('/auth/logout', requireAuth, (req, res) => {
  res.status(204).send()
})

// SSO endpoints - Generic handler for all providers
const SUPPORTED_PROVIDERS = ['google', 'azure', 'keycloak']

app.get('/auth/:provider', (req, res) => {
  const { provider } = req.params
  
  console.log(`[OAuth Init] Provider: ${provider}, Redirect URI: ${req.query.redirect_uri}`)
  
  if (!SUPPORTED_PROVIDERS.includes(provider)) {
    return res.status(400).json({
      detail: 'Invalid provider or configuration'
    })
  }
  
  // Mock OAuth flow - generate state and code
  const state = faker.string.alphanumeric(32)
  const code = faker.string.alphanumeric(32)
  const redirectUri = req.query.redirect_uri as string || 'http://localhost:5173/auth/callback'
  
  // Build callback URL that points to the frontend callback page
  // This simulates what an OAuth provider would do
  const callbackUrl = new URL(redirectUri)
  callbackUrl.searchParams.set('code', code)
  callbackUrl.searchParams.set('state', state)

  console.log(`[OAuth Init] Redirecting to: ${callbackUrl.toString()}`)
  
  // Return 303 redirect to simulate OAuth provider redirecting back to app
  res.redirect(303, callbackUrl.toString())
})

// Generic SSO callback handler (GET)
app.get('/auth/:provider/callback', (req, res) => {
  const { provider } = req.params

  if (!SUPPORTED_PROVIDERS.includes(provider)) {
    return res.status(400).json({
      detail: 'Invalid provider or configuration'
    })
  }

  const code = req.query.code as string
  const state = req.query.state as string
  const error = req.query.error as string

  // Handle error from provider
  if (error) {
    return res.status(400).json({
      detail: error
    })
  }

  // Validate required parameters
  if (!code || !state) {
    return res.status(400).json({
      detail: 'Missing code or state parameter'
    })
  }

  // Generate mock user for this provider
  const user = {
    id: faker.string.uuid(),
    sub: `${provider}|${faker.string.alphanumeric(20)}`,
    email: `${provider}-demo@grengin.com`,
    name: `${provider.charAt(0).toUpperCase() + provider.slice(1)} Demo User`,
    picture: `https://api.dicebear.com/7.x/avataaars/svg?seed=${provider}Demo`,
    hd: 'grengin.com',
    is_super_admin: false,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: new Date().toISOString(),
  }

  // Return LoginResponse format
  res.json({
    requires_mfa: false,
    accessToken: loginExample.access_token,
    refresh_token: loginExample.refresh_token,
    user,
  })
})

// Generic SSO callback handler (POST) - for providers with long auth codes
app.post('/auth/:provider/callback', (req, res) => {
  const { provider } = req.params

  if (!SUPPORTED_PROVIDERS.includes(provider)) {
    return res.status(400).json({
      detail: 'Invalid provider or configuration'
    })
  }

  const { code, state, error } = req.body

  // Handle error from provider
  if (error) {
    return res.status(400).json({
      detail: error
    })
  }

  // Validate required parameters
  if (!code || !state) {
    return res.status(400).json({
      detail: 'Missing code or state parameter'
    })
  }

  // Generate mock user for this provider
  const user = {
    id: faker.string.uuid(),
    sub: `${provider}|${faker.string.alphanumeric(20)}`,
    email: `${provider}-demo@grengin.com`,
    name: `${provider.charAt(0).toUpperCase() + provider.slice(1)} Demo User`,
    picture: `https://api.dicebear.com/7.x/avataaars/svg?seed=${provider}Demo`,
    hd: 'grengin.com',
    is_super_admin: false,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: new Date().toISOString(),
  }

  // Return LoginResponse format
  res.json({
    requires_mfa: false,
    accessToken: loginExample.access_token,
    refresh_token: loginExample.refresh_token,
    user,
  })
})

// Health endpoint
app.get('/health', (req, res) => {
  const response: HealthResponse = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      database: 'up',
      redis: 'up',
    },
    version: '1.1.0',
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
    is_super_admin: false,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: new Date().toISOString(),
  }
  res.json(user)
})

// Chat endpoints
app.get('/chat', requireAuth, (req, res) => {
  res.json(Array.from(conversations.values()))
})

// Search conversations (must come before /:chatId route)
app.get('/chat/search', requireAuth, (req, res) => {
  const search = req.query.search as string
  
  let allConversations = Array.from(conversations.values())
  
  if (search) {
    allConversations = allConversations.filter(chat =>
      chat.title.toLowerCase().includes(search.toLowerCase()),
    )
  }
  
  res.json(allConversations)
})

app.get('/chat/:chatId', requireAuth, (req, res) => {
  const conversation = conversations.get(req.params.chatId)
  if (!conversation) {
    return res.status(404).json({ detail: 'Conversation not found' })
  }
  
  const conversationMessages = messages.get(req.params.chatId) || []
  
  // Transform to match the required response format
  const response = {
    archived: conversation.archived || false,
    archivedAt: conversation.archived_at || null,
    createdAt: conversation.created_at,
    id: conversation.id,
    lastMessageAt: conversation.updated_at || conversation.created_at,
    messages: conversationMessages.map(msg => ({
      cost: msg.usage?.input_tokens ? 0.001 : 0.1, // Mock cost calculation
      createdAt: msg.created_at,
      id: msg.id,
      model: msg.model || "claude-sonnet-4-5",
      modelParams: msg.model_params || null,
      parts: {
        files: msg.parts?.files || [],
        text: msg.parts?.text || ''
      },
      requestId: msg.request_id || null,
      role: msg.role,
      toolCalls: msg.tool_calls || [],
      toolsResults: msg.tool_results || [],
      updatedAt: msg.updated_at,
      usage: msg.usage || {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150
      }
    })),
    model: "claude-sonnet-4-5", // Default model since it doesn't exist on conversation type
    title: conversation.title,
    totalCost: conversationMessages.reduce((sum, msg) => sum + (msg.usage?.input_tokens ? 0.001 : 0.1), 0),
    totalTokens: conversationMessages.reduce((sum, msg) => sum + ((msg.usage?.input_tokens || 0) + (msg.usage?.output_tokens || 0)), 0),
    updatedAt: conversation.updated_at
  }
  
  res.json(response)
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

// Admin AI Engine endpoints
app.get('/admin/ai-engines', requireAuth, (req, res) => {
  res.json(Array.from(aiEngines.values()))
})

app.get('/admin/ai-engines/:engineKey', requireAuth, (req, res) => {
  const engine = aiEngines.get(req.params.engineKey)
  if (!engine) {
    return res.status(404).json({ detail: 'AI engine not found' })
  }
  res.json(engine)
})

app.put('/admin/ai-engines/:engineKey', requireAuth, (req, res) => {
  const engine = aiEngines.get(req.params.engineKey)
  if (!engine) {
    return res.status(404).json({ detail: 'AI engine not found' })
  }

  const updated: AIEngineDetail = {
    ...engine,
    ...(req.body.is_enabled !== undefined && { is_enabled: req.body.is_enabled }),
    ...(req.body.whitelisted_models && { whitelisted_models: req.body.whitelisted_models }),
    ...(req.body.default_model && { default_model: req.body.default_model }),
    updated_at: new Date().toISOString(),
  }

  // Handle API key update
  if (req.body.api_key) {
    updated.api_key_configured = true
    updated.api_key_status = 'untested'
    updated.api_key_preview = '...' + req.body.api_key.slice(-4)
  }

  aiEngines.set(req.params.engineKey, updated)
  res.json(updated)
})

app.post('/admin/ai-engines/:engineKey/validate', requireAuth, (req, res) => {
  const engine = aiEngines.get(req.params.engineKey)
  if (!engine) {
    return res.status(404).json({ detail: 'AI engine not found' })
  }

  if (!engine.api_key_configured) {
    return res.status(400).json({ detail: 'No API key configured for this engine' })
  }

  // Mock validation - always succeeds
  const updated: AIEngineDetail = {
    ...engine,
    api_key_status: 'valid',
    api_key_last_validated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  aiEngines.set(req.params.engineKey, updated)

  res.json({
    valid: true,
    message: 'API key validated successfully',
    models_available: 15,
  })
})

app.get('/admin/ai-engines/:engineKey/models', requireAuth, (req, res) => {
  const engine = aiEngines.get(req.params.engineKey)
  if (!engine) {
    return res.status(404).json({ detail: 'AI engine not found' })
  }

  if (!engine.api_key_configured) {
    return res.status(400).json({ detail: 'No API key configured for this engine' })
  }

  // Return mock models based on engine
  const modelsByEngine: Record<string, AIEngineModelsResponse['models']> = {
    openai: [
      { model_id: 'gpt-4o', display_name: 'GPT-4o', is_whitelisted: true, capabilities: { vision: true, function_calling: true, streaming: true } },
      { model_id: 'gpt-4.1', display_name: 'GPT-4.1', is_whitelisted: true, capabilities: { vision: true, function_calling: true, streaming: true } },
      { model_id: 'gpt-4.1-mini', display_name: 'GPT-4.1 Mini', is_whitelisted: true, capabilities: { vision: true, function_calling: true, streaming: true } },
      { model_id: 'o3', display_name: 'O3', is_whitelisted: false, capabilities: { vision: false, function_calling: true, streaming: true } },
    ],
    anthropic: [
      { model_id: 'claude-sonnet-4-20250514', display_name: 'Claude Sonnet 4', is_whitelisted: true, capabilities: { vision: true, function_calling: true, streaming: true } },
      { model_id: 'claude-opus-4-20250514', display_name: 'Claude Opus 4', is_whitelisted: false, capabilities: { vision: true, function_calling: true, streaming: true } },
      { model_id: 'claude-3-haiku-20240307', display_name: 'Claude 3 Haiku', is_whitelisted: true, capabilities: { vision: true, function_calling: true, streaming: true } },
    ],
    google: [
      { model_id: 'gemini-2.0-flash', display_name: 'Gemini 2.0 Flash', is_whitelisted: true, capabilities: { vision: true, function_calling: true, streaming: true } },
      { model_id: 'gemini-1.5-pro', display_name: 'Gemini 1.5 Pro', is_whitelisted: true, capabilities: { vision: true, function_calling: true, streaming: true } },
    ],
    groq: [
      { model_id: 'llama-3.3-70b-versatile', display_name: 'Llama 3.3 70B', is_whitelisted: false, capabilities: { vision: false, function_calling: true, streaming: true } },
      { model_id: 'mixtral-8x7b-32768', display_name: 'Mixtral 8x7B', is_whitelisted: false, capabilities: { vision: false, function_calling: true, streaming: true } },
    ],
  }

  res.json({
    models: modelsByEngine[req.params.engineKey] || [],
  })
})

app.delete('/admin/ai-engines/:engineKey/api-key', requireAuth, (req, res) => {
  const engine = aiEngines.get(req.params.engineKey)
  if (!engine) {
    return res.status(404).json({ detail: 'AI engine not found' })
  }

  const updated: AIEngineDetail = {
    ...engine,
    is_enabled: false,
    api_key_configured: false,
    api_key_status: 'untested',
    api_key_preview: null,
    api_key_last_validated_at: null,
    updated_at: new Date().toISOString(),
  }
  aiEngines.set(req.params.engineKey, updated)
  res.json(updated)
})

// Models endpoints
app.get('/models', (req, res) => {
  res.json(modelsExample)
})

// Fallback 404 handler - always returns JSON
app.use((req, res) => {
  res.status(404).json({ detail: 'Not Found' })
})

const PORT = process.env.PORT || 3000
const HOST = process.env.HOST || 'localhost'

app.listen(PORT, () => {
  console.log(`🚀 Grengin Mock API Server v1.1.0`)
  console.log(`   Running at http://${HOST}:${PORT}`)
  console.log('')
  console.log('Auth endpoints:')
  console.log(`  POST /auth/login              - Password login`)
  console.log(`  POST /auth/refresh            - Refresh token`)
  console.log(`  POST /auth/logout             - Logout (auth required)`)
  console.log(`  GET  /auth/:provider          - SSO init (google, azure, keycloak)`)
  console.log(`  *    /auth/:provider/callback - SSO callback (GET/POST)`)
  console.log('')
  console.log('Core endpoints:')
  console.log(`  GET  /health       - Health check`)
  console.log(`  GET  /models       - List AI models`)
  console.log(`  GET  /me           - Current user (auth required)`)
  console.log(`  *    /chat/*       - Chat endpoints (auth required)`)
  console.log(`  *    /files/*      - File endpoints (auth required)`)
  console.log(`  *    /settings     - Settings (auth required)`)
  console.log('')
  console.log('Admin endpoints:')
  console.log(`  GET    /admin/ai-engines                    - List AI engines`)
  console.log(`  GET    /admin/ai-engines/:key               - Get engine details`)
  console.log(`  PUT    /admin/ai-engines/:key               - Update engine config`)
  console.log(`  POST   /admin/ai-engines/:key/validate      - Validate API key`)
  console.log(`  GET    /admin/ai-engines/:key/models        - List available models`)
  console.log(`  DELETE /admin/ai-engines/:key/api-key       - Remove API key`)
  console.log('')
  console.log('🔑 Demo credentials: admin@grengin.com / Demo123456!@')
  console.log('💡 Use "Bearer <token>" for authentication')
})
