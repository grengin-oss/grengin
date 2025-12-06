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

// Generic SSO callback handler
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
    super_admin: false,
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

// Models endpoints
app.get('/models', (req, res) => {
  res.json({
    providers: [
      {
        key: 'anthropic',
        name: 'Anthropic',
        icon: '<svg width="20" height="20" viewBox="0 0 41 41" fill="none"><path d="M32.73 0H25.7846L38.4499 32H45.3953L32.73 0Z" fill="currentColor"></path><path d="M12.6653 0L0 32H7.08167L9.67193 25.28H22.9219L25.5122 32H32.5939L19.9286 0H12.6653ZM11.9626 19.3371L16.2969 8.09143L20.6313 19.3371H11.9626Z" fill="currentColor"></path></svg>',
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
        icon: '<svg width="20" height="20" viewBox="0 0 41 41" fill="none" xmlns="http://www.w3.org/2000/svg" stroke-width="1.5" class="text-text-primary shrink-0 icon-md"><path d="M37.5324 16.8707C37.9808 15.5241 38.1363 14.0974 37.9886 12.6859C37.8409 11.2744 37.3934 9.91076 36.676 8.68622C35.6126 6.83404 33.9882 5.3676 32.0373 4.4985C30.0864 3.62941 27.9098 3.40259 25.8215 3.85078C24.8796 2.7893 23.7219 1.94125 22.4257 1.36341C21.1295 0.785575 19.7249 0.491269 18.3058 0.500197C16.1708 0.495044 14.0893 1.16803 12.3614 2.42214C10.6335 3.67624 9.34853 5.44666 8.6917 7.47815C7.30085 7.76286 5.98686 8.3414 4.8377 9.17505C3.68854 10.0087 2.73073 11.0782 2.02839 12.312C0.956464 14.1591 0.498905 16.2988 0.721698 18.4228C0.944492 20.5467 1.83612 22.5449 3.268 24.1293C2.81966 25.4759 2.66413 26.9026 2.81182 28.3141C2.95951 29.7256 3.40701 31.0892 4.12437 32.3138C5.18791 34.1659 6.8123 35.6322 8.76321 36.5013C10.7141 37.3704 12.8907 37.5973 14.9789 37.1492C15.9208 38.2107 17.0786 39.0587 18.3747 39.6366C19.6709 40.2144 21.0755 40.5087 22.4946 40.4998C24.6307 40.5054 26.7133 39.8321 28.4418 38.5772C30.1704 37.3223 31.4556 35.5506 32.1119 33.5179C33.5027 33.2332 34.8167 32.6547 35.9659 31.821C37.115 30.9874 38.0728 29.9178 38.7752 28.684C39.8458 26.8371 40.3023 24.6979 40.0789 22.5748C39.8556 20.4517 38.9639 18.4544 37.5324 16.8707ZM22.4978 37.8849C20.7443 37.8874 19.0459 37.2733 17.6994 36.1501C17.7601 36.117 17.8666 36.0586 17.936 36.0161L25.9004 31.4156C26.1003 31.3019 26.2663 31.137 26.3813 30.9378C26.4964 30.7386 26.5563 30.5124 26.5549 30.2825V19.0542L29.9213 20.998C29.9389 21.0068 29.9541 21.0198 29.9656 21.0359C29.977 21.052 29.9842 21.0707 29.9867 21.0902V30.3889C29.9842 32.375 29.1946 34.2791 27.7909 35.6841C26.3872 37.0892 24.4838 37.8806 22.4978 37.8849ZM6.39227 31.0064C5.51397 29.4888 5.19742 27.7107 5.49804 25.9832C5.55718 26.0187 5.66048 26.0818 5.73461 26.1244L13.699 30.7248C13.8975 30.8408 14.1233 30.902 14.3532 30.902C14.583 30.902 14.8088 30.8408 15.0073 30.7248L24.731 25.1103V28.9979C24.7321 29.0177 24.7283 29.0376 24.7199 29.0556C24.7115 29.0736 24.6988 29.0893 24.6829 29.1012L16.6317 33.7497C14.9096 34.7416 12.8643 35.0097 10.9447 34.4954C9.02506 33.9811 7.38785 32.7263 6.39227 31.0064ZM4.29707 13.6194C5.17156 12.0998 6.55279 10.9364 8.19885 10.3327C8.19885 10.4013 8.19491 10.5228 8.19491 10.6071V19.808C8.19351 20.0378 8.25334 20.2638 8.36823 20.4629C8.48312 20.6619 8.64893 20.8267 8.84863 20.9404L18.5723 26.5542L15.206 28.4979C15.1894 28.5089 15.1703 28.5155 15.1505 28.5173C15.1307 28.5191 15.1107 28.516 15.0924 28.5082L7.04046 23.8557C5.32135 22.8601 4.06716 21.2235 3.55289 19.3046C3.03862 17.3858 3.30624 15.3413 4.29707 13.6194ZM31.955 20.0556L22.2312 14.4411L25.5976 12.4981C25.6142 12.4872 25.6333 12.4805 25.6531 12.4787C25.6729 12.4769 25.6928 12.4801 25.7111 12.4879L33.7631 17.1364C34.9967 17.849 36.0017 18.8982 36.6606 20.1613C37.3194 21.4244 37.6047 22.849 37.4832 24.2684C37.3617 25.6878 36.8382 27.0432 35.9743 28.1759C35.1103 29.3086 33.9415 30.1717 32.6047 30.6641C32.6047 30.5947 32.6047 30.4733 32.6047 30.3889V21.188C32.6066 20.9586 32.5474 20.7328 32.4332 20.5338C32.319 20.3348 32.154 20.1698 31.955 20.0556ZM35.3055 15.0128C35.2464 14.9765 35.1431 14.9142 35.069 14.8717L27.1045 10.2712C26.906 10.1554 26.6803 10.0943 26.4504 10.0943C26.2206 10.0943 25.9948 10.1554 25.7963 10.2712L16.0726 15.8858V11.9982C16.0715 11.9783 16.0753 11.9585 16.0837 11.9405C16.0921 11.9225 16.1048 11.9068 16.1207 11.8949L24.1719 7.25025C25.4053 6.53903 26.8158 6.19376 28.2383 6.25482C29.6608 6.31589 31.0364 6.78077 32.2044 7.59508C33.3723 8.40939 34.2842 9.53945 34.8334 10.8531C35.3826 12.1667 35.5464 13.6095 35.3055 15.0128ZM14.2424 21.9419L10.8752 19.9981C10.8576 19.9893 10.8423 19.9763 10.8309 19.9602C10.8195 19.9441 10.8122 19.9254 10.8098 19.9058V10.6071C10.8107 9.18295 11.2173 7.78848 11.9819 6.58696C12.7466 5.38544 13.8377 4.42659 15.1275 3.82264C16.4173 3.21869 17.8524 2.99464 19.2649 3.1767C20.6775 3.35876 22.0089 3.93941 23.1034 4.85067C23.0427 4.88379 22.937 4.94215 22.8668 4.98473L14.9024 9.58517C14.7025 9.69878 14.5366 9.86356 14.4215 10.0626C14.3065 10.2616 14.2466 10.4877 14.2479 10.7175L14.2424 21.9419ZM16.071 17.9991L20.4018 15.4978L24.7325 17.9975V22.9985L20.4018 25.4983L16.071 22.9985V17.9991Z" fill="currentColor"></path></svg>',
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
        icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>',
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

// Fallback 404 handler - always returns JSON
app.use((req, res) => {
  res.status(404).json({ detail: 'Not Found' })
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
  console.log(`  GET  /auth/:provider          - SSO init (google, azure, keycloak)`)
  console.log(`  GET  /auth/:provider/callback - SSO callback`)
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
