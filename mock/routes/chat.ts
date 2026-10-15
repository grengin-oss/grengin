// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

import { Router } from 'express'
import { faker } from '@faker-js/faker'
import { requireAuth } from '../lib/middleware.js'
import { conversations, messages, files, type Conversation, type Message, type UserFile } from '../lib/store.js'

const router = Router()

// Track message count per conversation for mock numbering
const messageCounters = new Map<string, number>()

function getMessageNumber(conversationId: string): number {
  const count = (messageCounters.get(conversationId) || 0) + 1
  messageCounters.set(conversationId, count)
  return count
}

// ── Message versions (ENGG-459) ──────────────────────────────────────────────
// A compact mock of the backend's edit/regenerate versioning. A "version group"
// holds the (user, assistant) pairs that editing or regenerating a turn created,
// which one is currently shown, and where the pair sits in the shown list. The
// branch endpoint finds a group from any of its user-message ids.
interface VersionGroup {
  ids: string[] // user message id per version, in creation order
  current: number // index currently shown
  pairs: Map<string, { user: Message; assistant: Message }>
  baseIndex: number // position of the pair within the shown message list
}
// conversationId -> (user message id -> its group)
const userIdToGroup = new Map<string, Map<string, VersionGroup>>()

function groupForUser(convId: string, userId: string): VersionGroup | undefined {
  return userIdToGroup.get(convId)?.get(userId)
}

function registerVersion(convId: string, userId: string, group: VersionGroup) {
  let m = userIdToGroup.get(convId)
  if (!m) {
    m = new Map()
    userIdToGroup.set(convId, m)
  }
  m.set(userId, group)
}

// The `versions` block the API attaches to a user message that has siblings.
function versionsFor(convId: string, userId: string) {
  const g = groupForUser(convId, userId)
  if (!g || g.ids.length <= 1) return undefined
  // `current` is 1-based, matching the real backend (ENGG-459).
  return { current: g.current + 1, total: g.ids.length, message_ids: [...g.ids] }
}

// Build the GET/branch conversation payload. Shared so a version switch returns
// exactly the shape a fresh load would, now including per-message `versions`.
function buildConversationResponse(conversation: Conversation, conversationMessages: Message[]) {
  return {
    archived: conversation.archived || false,
    archivedAt: conversation.archived_at || null,
    createdAt: conversation.created_at,
    id: conversation.id,
    lastMessageAt: conversation.updated_at || conversation.created_at,
    messages: conversationMessages.map(msg => ({
      cost: msg.usage?.input_tokens ? 0.001 : 0.1,
      created_at: msg.created_at,
      id: msg.id,
      model: msg.model || 'claude-sonnet-4-5',
      model_params: msg.model_params || null,
      parts: {
        files: msg.parts?.files || [],
        text: msg.parts?.text || '',
      },
      request_id: msg.request_id || null,
      role: msg.role,
      tool_calls: msg.tool_calls || [],
      tools_results: msg.tool_results || [],
      updated_at: msg.updated_at,
      usage: msg.usage || { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      // Version metadata drives the `< 1 / 2 >` switcher (ENGG-459).
      versions: versionsFor(conversation.id, msg.id) || null,
      // Why the turn stopped early; drives the "response was interrupted" banner.
      stop_reason: (msg as any).stop_reason || null,
    })),
    model: 'claude-sonnet-4-5',
    title: conversation.title,
    totalCost: conversationMessages.reduce((sum, msg) => sum + (msg.usage?.input_tokens ? 0.001 : 0.1), 0),
    totalTokens: conversationMessages.reduce((sum, msg) => sum + ((msg.usage?.input_tokens || 0) + (msg.usage?.output_tokens || 0)), 0),
    updatedAt: conversation.updated_at,
  }
}

// Stream an assistant answer over SSE, honouring a mid-flight cancel. Returns the
// text actually sent (the full text, or the prefix streamed before a cancel).
async function streamAssistantAnswer(res: any, assistantMsgId: string, responseText: string): Promise<{ cancelled: boolean; sent: string }> {
  let sent = ''
  const isCancelled = () => cancelledStreams.has(assistantMsgId)
  for (const chunk of responseText.split(' ')) {
    if (isCancelled()) break
    sent += chunk + ' '
    res.write(`event: delta\ndata: ${JSON.stringify({ text: chunk + ' ' })}\n\n`)
    await new Promise(resolve => setTimeout(resolve, 22))
  }
  const cancelled = isCancelled()
  if (cancelled) cancelledStreams.delete(assistantMsgId)
  return { cancelled, sent }
}

// MCP Servers
router.get('/mcp-servers', requireAuth, (_req, res) => {
  res.json({
    servers: [
      {
        id: 'srv-001',
        name: 'Web Search',
        description: 'Search the web for real-time information, news, and references.',
        icon: '',
        connected: true,
        transport_type: 'stdio',
        tools: [
          { name: 'web_search', description: 'Search the internet for up-to-date information' },
          { name: 'fetch_url', description: 'Fetch and extract content from a specific URL' },
        ],
      },
      {
        id: 'srv-002',
        name: 'Code Interpreter',
        description: 'Execute Python code, analyze data, and generate visualizations.',
        icon: '',
        connected: true,
        transport_type: 'stdio',
        tools: [
          { name: 'execute_python', description: 'Run Python code in a sandboxed environment' },
          { name: 'install_package', description: 'Install a Python package from PyPI' },
          { name: 'plot_chart', description: 'Generate charts and data visualizations' },
        ],
      },
      {
        id: 'srv-003',
        name: 'File Manager',
        description: 'Read, parse, and analyze uploaded documents including PDFs, spreadsheets, and images.',
        icon: '',
        connected: true,
        transport_type: 'sse',
        tools: [
          { name: 'read_document', description: 'Extract text content from PDF, DOCX, or TXT files' },
          { name: 'parse_spreadsheet', description: 'Parse Excel or CSV files into structured data' },
          { name: 'analyze_image', description: 'Describe and analyze image content using vision' },
        ],
      },
      {
        id: 'srv-004',
        name: 'Database Connector',
        description: 'Query and interact with connected databases.',
        icon: '',
        connected: false,
        transport_type: 'stdio',
        tools: [
          { name: 'run_query', description: 'Execute a read-only SQL query' },
          { name: 'describe_table', description: 'Get schema information for a database table' },
        ],
      },
      {
        id: 'srv-005',
        name: 'Slack Integration',
        description: 'Send messages, read channels, and interact with Slack workspaces.',
        icon: '',
        connected: true,
        transport_type: 'sse',
        tools: [
          { name: 'send_message', description: 'Send a message to a Slack channel or user' },
          { name: 'list_channels', description: 'List available Slack channels' },
          { name: 'read_channel', description: 'Read recent messages from a channel' },
          { name: 'search_messages', description: 'Search Slack messages by keyword' },
        ],
      },
      {
        id: 'srv-006',
        name: 'GitHub',
        description: 'Interact with GitHub repositories, issues, and pull requests.',
        icon: '',
        connected: false,
        transport_type: 'stdio',
        tools: [
          { name: 'search_repos', description: 'Search for GitHub repositories' },
          { name: 'list_issues', description: 'List issues in a repository' },
          { name: 'create_issue', description: 'Create a new issue in a repository' },
          { name: 'read_file', description: 'Read a file from a GitHub repository' },
        ],
      },
    ],
  })
})

router.get('/chat', requireAuth, (req, res) => {
  // Sort by updated_at descending (most recent first)
  const sorted = Array.from(conversations.values()).sort((a, b) => {
    const aTime = new Date(a.updated_at || a.created_at).getTime()
    const bTime = new Date(b.updated_at || b.created_at).getTime()
    return bTime - aTime
  })
  res.json(sorted)
})

// Search conversations (must come before /:chatId route)
router.get('/chat/search', requireAuth, (req, res) => {
  const search = req.query.search as string

  let allConversations = Array.from(conversations.values())

  if (search) {
    allConversations = allConversations.filter(chat =>
      chat.title.toLowerCase().includes(search.toLowerCase()),
    )
  }

  // Sort by updated_at descending (most recent first)
  allConversations.sort((a, b) => {
    const aTime = new Date(a.updated_at || a.created_at).getTime()
    const bTime = new Date(b.updated_at || b.created_at).getTime()
    return bTime - aTime
  })

  res.json(allConversations)
})

router.get('/chat/:chatId', requireAuth, (req, res) => {
  const conversation = conversations.get(req.params.chatId)
  if (!conversation) {
    return res.status(404).json({ detail: 'Conversation not found' })
  }

  const conversationMessages = messages.get(req.params.chatId) || []
  res.json(buildConversationResponse(conversation, conversationMessages))
})

router.put('/chat/:chatId', requireAuth, (req, res) => {
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

router.delete('/chat/:chatId', requireAuth, (req, res) => {
  if (!conversations.has(req.params.chatId)) {
    return res.status(404).json({ detail: 'Conversation not found' })
  }
  conversations.delete(req.params.chatId)
  messages.delete(req.params.chatId)
  res.status(204).send()
})

// Assistant message ids a client asked to stop. The streaming handler polls
// this between chunks, then emits `cancelled` + `done` like the real backend.
const cancelledStreams = new Set<string>()

router.post('/chat/stream/:messageId/cancel', requireAuth, (req, res) => {
  cancelledStreams.add(req.params.messageId)
  res.status(202).send()
})

// The frontend posts to /chat/stream for a brand-new conversation and to
// /chat/stream/:conversationId to continue an existing one (see sendMessage in
// src/lib/api/chatApi.ts). Both land on the same handler; the path id wins over
// the body's conversation_id when present.
router.post(['/chat/stream', '/chat/stream/:conversationId'], requireAuth, async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  const { messages: reqMessages, conversation_id, model_name, provider } = req.body
  const pathConversationId = req.params.conversationId

  if (!reqMessages || !Array.isArray(reqMessages) || reqMessages.length === 0) {
    return res.status(400).json({ detail: 'messages array is required' })
  }

  const lastMessage = reqMessages[reqMessages.length - 1]
  const userMessageContent = lastMessage.content
  const conversationId = pathConversationId || conversation_id || faker.string.uuid()
  const isNewConversation = !conversations.has(conversationId)

  // Create conversation if it doesn't exist
  if (isNewConversation) {
    const title = generateTitle(userMessageContent)
    const newConversation: Conversation = {
      id: conversationId,
      title: title,
      archived: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    conversations.set(conversationId, newConversation)
    messages.set(conversationId, [])
    messageCounters.set(conversationId, 0)
  }

  // Get message number for this conversation
  const userMsgNum = getMessageNumber(conversationId)
  const assistantMsgNum = getMessageNumber(conversationId)

  // Store user message
  const userMsgId = faker.string.uuid()
  const userMsg: Message = {
    id: userMsgId,
    conversation_id: conversationId,
    role: 'user',
    parts: { text: userMessageContent },
    created_at: new Date().toISOString(),
  }
  const conversationMessages = messages.get(conversationId) || []
  conversationMessages.push(userMsg)

  // ── Image generation flow ─────────────────────────────────────────────
  // Detect image models by key convention (mock heuristic; the real backend
  // types them as `image_generator` in the registry).
  const isImageModel = /image/i.test(model_name || '')
  if (isImageModel) {
    await handleImageGeneration({
      res,
      conversationId,
      isNewConversation,
      prompt: userMessageContent,
      modelName: model_name || 'gpt-image-2',
      conversationMessages,
    })
    return
  }

  // Generate a contextual mock response based on user input
  const responseText = getMockResponse(userMessageContent.toLowerCase(), assistantMsgNum)

  // Store assistant message
  const assistantMsgId = faker.string.uuid()
  const assistantMsg: Message = {
    id: assistantMsgId,
    conversation_id: conversationId,
    role: 'assistant',
    model: model_name || 'gpt-5.1',
    parts: { text: responseText },
    created_at: new Date().toISOString(),
    usage: {
      input_tokens: Math.floor(userMessageContent.length / 4),
      output_tokens: Math.floor(responseText.length / 4),
    }
  }
  conversationMessages.push(assistantMsg)
  messages.set(conversationId, conversationMessages)

  // Update conversation timestamp
  const conversation = conversations.get(conversationId)
  if (conversation) {
    conversation.updated_at = new Date().toISOString()
    conversations.set(conversationId, conversation)
  }

  // Send conversation event if it's a new conversation
  if (isNewConversation) {
    res.write(`event: conversation\ndata: ${JSON.stringify({ id: conversationId })}\n\n`)
  }

  // Send message_start event. `user_message_id` lets the client swap the
  // temporary id it assigned the sent message for the server's, so it can be
  // edited straight away (ENGG-459).
  res.write(`event: message_start\ndata: ${JSON.stringify({ message_id: assistantMsgId, user_message_id: userMsgId })}\n\n`)

  let sentText = ''
  const isCancelled = () => cancelledStreams.has(assistantMsgId)
  const writeDelta = (text: string) => {
    sentText += text
    res.write(`event: delta\ndata: ${JSON.stringify({ text })}\n\n`)
  }

  // Send delta events — stream code blocks line-by-line for a live-coding effect
  const hasCodeBlock = responseText.includes('```html') || responseText.includes('```markdown') || responseText.includes('```md')
  if (hasCodeBlock) {
    const parts = responseText.split(/(```(?:html|markdown|md)\s*\n[\s\S]*?```)/);
    stream: for (const part of parts) {
      if (part.match(/^```(?:html|markdown|md)\s*\n/)) {
        const lines = part.split('\n')
        for (const line of lines) {
          if (isCancelled()) break stream
          writeDelta(line + '\n')
          await new Promise(resolve => setTimeout(resolve, 18))
        }
      } else {
        const words = part.split(' ')
        for (const word of words) {
          if (isCancelled()) break stream
          writeDelta(word + ' ')
          await new Promise(resolve => setTimeout(resolve, 25))
        }
      }
    }
  } else {
    const chunks = responseText.split(' ')
    for (const chunk of chunks) {
      if (isCancelled()) break
      writeDelta(chunk + ' ')
      await new Promise(resolve => setTimeout(resolve, 30))
    }
  }

  if (isCancelled()) {
    cancelledStreams.delete(assistantMsgId)
    assistantMsg.parts = { text: sentText }
    ;(assistantMsg as any).stop_reason = 'user_cancelled'
    res.write(`event: cancelled\ndata: ${JSON.stringify({ message_id: assistantMsgId })}\n\n`)
    res.write(`event: response_stopped\ndata: ${JSON.stringify({ message_id: assistantMsgId, stop_reason: 'user_cancelled' })}\n\n`)
  }

  // Send done event
  res.write(`event: done\ndata: ${JSON.stringify({
    conversation_id: conversationId,
    user_message_id: userMsgId,
    assistant_message_id: assistantMsgId
  })}\n\n`)

  res.end()
})

// Edit a user message (or regenerate an answer) and stream a fresh reply,
// branching a new version of the turn (ENGG-459). The client PATCHes the user
// message id; regenerate re-sends the same text, edit sends new text. Both land
// here and create a new (user, assistant) version pair.
router.patch('/chat/:chatId/message/:messageId/stream', requireAuth, async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  const { chatId, messageId } = req.params
  const conversation = conversations.get(chatId)
  const list = messages.get(chatId)
  if (!conversation || !list) {
    return res.status(404).json({ detail: 'Conversation not found' })
  }

  const idx = list.findIndex(m => m.id === messageId && m.role === 'user')
  if (idx < 0) {
    // The real API 404s when the id is not an editable user message.
    return res.status(404).json({ detail: 'Message not found or not editable' })
  }

  const reqMessages = req.body?.messages
  const newText: string = reqMessages?.[reqMessages.length - 1]?.content ?? list[idx].parts?.text ?? ''
  const modelName: string = req.body?.model_name || list[idx + 1]?.model || 'gpt-5.1'

  // Find or open the version group anchored at this user turn.
  let group = groupForUser(chatId, messageId)
  if (!group) {
    const oldUser = list[idx]
    const oldAssistant = list[idx + 1]
    group = { ids: [oldUser.id], current: 0, pairs: new Map(), baseIndex: idx }
    group.pairs.set(oldUser.id, { user: oldUser, assistant: oldAssistant })
    registerVersion(chatId, oldUser.id, group)
  }

  // Build the new version: a fresh user message plus a fresh answer.
  const newUser: Message = {
    id: faker.string.uuid(),
    conversation_id: chatId,
    role: 'user',
    parts: { text: newText, files: list[idx].parts?.files || [] },
    created_at: new Date().toISOString(),
  }
  const responseText = getMockResponse(newText.toLowerCase(), group.ids.length + 1)
  const newAssistant: Message = {
    id: faker.string.uuid(),
    conversation_id: chatId,
    role: 'assistant',
    model: modelName,
    parts: { text: responseText },
    created_at: new Date().toISOString(),
    usage: { input_tokens: Math.floor(newText.length / 4), output_tokens: Math.floor(responseText.length / 4) },
  }

  group.ids.push(newUser.id)
  group.current = group.ids.length - 1
  group.pairs.set(newUser.id, { user: newUser, assistant: newAssistant })
  registerVersion(chatId, newUser.id, group)

  // Show the new version: editing truncates the turns after it.
  const shown = [...list.slice(0, group.baseIndex), newUser, newAssistant]
  messages.set(chatId, shown)
  conversation.updated_at = new Date().toISOString()

  res.write(`event: conversation\ndata: ${JSON.stringify({ id: chatId, is_new: false, title: conversation.title })}\n\n`)
  res.write(`event: message_start\ndata: ${JSON.stringify({ message_id: newAssistant.id, user_message_id: newUser.id })}\n\n`)

  const { cancelled, sent } = await streamAssistantAnswer(res, newAssistant.id, responseText)
  if (cancelled) {
    newAssistant.parts = { text: sent }
    ;(newAssistant as any).stop_reason = 'user_cancelled'
    res.write(`event: cancelled\ndata: ${JSON.stringify({ message_id: newAssistant.id })}\n\n`)
    res.write(`event: response_stopped\ndata: ${JSON.stringify({ message_id: newAssistant.id, stop_reason: 'user_cancelled' })}\n\n`)
  }

  res.write(`event: done\ndata: ${JSON.stringify({
    conversation_id: chatId,
    user_message_id: newUser.id,
    assistant_message_id: newAssistant.id,
  })}\n\n`)
  res.end()
})

// Switch a conversation to another version of a message (ENGG-459). The body's
// message_id is one of a group's version ids; we mark it current, rebuild the
// shown list, and return the conversation as a fresh load would.
router.put('/chat/:chatId/branch', requireAuth, (req, res) => {
  const { chatId } = req.params
  const conversation = conversations.get(chatId)
  const list = messages.get(chatId)
  if (!conversation || !list) {
    return res.status(404).json({ detail: 'Conversation not found' })
  }

  const targetId: string = req.body?.message_id
  const group = targetId ? groupForUser(chatId, targetId) : undefined
  const pair = group?.pairs.get(targetId)
  if (!group || !pair) {
    return res.status(404).json({ detail: 'Message version not found' })
  }

  group.current = group.ids.indexOf(targetId)
  const shown = [...list.slice(0, group.baseIndex), pair.user, pair.assistant]
  messages.set(chatId, shown)
  conversation.updated_at = new Date().toISOString()

  res.json(buildConversationResponse(conversation, shown))
})

// Simulate the image-generation path of the chat stream. Emits the same events
// the real backend does: message_start → (optional caption deltas) → one
// image_generated event per image → done. Error keywords let the FE inline
// error states be exercised.
async function handleImageGeneration(opts: {
  res: any
  conversationId: string
  isNewConversation: boolean
  prompt: string
  modelName: string
  conversationMessages: Message[]
}) {
  const { res, conversationId, isNewConversation, prompt, modelName, conversationMessages } = opts
  const assistantMsgId = faker.string.uuid()

  if (isNewConversation) {
    res.write(`event: conversation\ndata: ${JSON.stringify({ id: conversationId })}\n\n`)
  }
  res.write(`event: message_start\ndata: ${JSON.stringify({ message_id: assistantMsgId })}\n\n`)

  // Simulate the provider working on the image.
  await new Promise((r) => setTimeout(r, 900))

  // Error-simulation keywords → inline error states (provider/timeout/safety/budget).
  const lower = prompt.toLowerCase()
  const emitError = (description: string, solution: string, externalCode: string | null) => {
    res.write(`event: error\ndata: ${JSON.stringify({
      detail: { type: 'rich', code: 400, description, solution, description_key: '', solution_key: '', params: {}, external_code: externalCode },
    })}\n\n`)
    res.end()
  }
  if (lower.includes('blocked') || lower.includes('unsafe')) {
    return emitError('This request was blocked by the safety system.', 'Try a different prompt that follows the content policy.', 'safety_blocked')
  }
  if (lower.includes('timeout')) {
    return emitError('The image generation request timed out.', 'Please try again in a moment.', 'timeout')
  }
  if (lower.includes('overbudget') || lower.includes('over budget')) {
    return emitError('Department budget is exhausted; image generation is blocked.', 'Contact your administrator to request additional budget.', 'budget_exhausted')
  }
  if (lower.includes('providerfail') || lower.includes('provider error')) {
    return emitError('The image provider returned an error.', 'Please try again shortly.', 'provider_error')
  }

  // Number of images: "flash" models return 2, otherwise 1 (a model property).
  const count = /flash/i.test(modelName) ? 2 : 1
  const generatedFiles: Array<{ id: string; name: string; type: string; size: number }> = []

  for (let i = 0; i < count; i++) {
    const fileId = faker.string.uuid()
    const contentType = 'image/png'
    const fileName = `${prompt.trim().slice(0, 40) || 'generated-image'}${count > 1 ? ` (${i + 1})` : ''}.png`

    // Register the file so GET /files/:id/download can serve a placeholder image.
    const record: UserFile = {
      id: fileId,
      name: fileName,
      size: 0,
      type: contentType,
      description: prompt.trim() || 'Generated image',
      url: `/files/${fileId}`,
      download_url: `/files/${fileId}/download`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user_id: 'auth0|507f1f77bcf86cd799439011',
      status: 'uploaded',
    }
    files.set(fileId, record)
    generatedFiles.push({ id: fileId, name: fileName, type: contentType, size: 0 })

    // Emit the image_generated event (matches the backend contract).
    res.write(`event: image_generated\ndata: ${JSON.stringify({
      content_type: contentType,
      cost: 0.00015999999595806003,
      file_id: fileId,
      message_id: assistantMsgId,
    })}\n\n`)
    await new Promise((r) => setTimeout(r, 500))
  }

  // Persist the assistant message with the generated images so reloads render them.
  const assistantMsg: Message = {
    id: assistantMsgId,
    conversation_id: conversationId,
    role: 'assistant',
    model: modelName,
    parts: { text: '', files: generatedFiles } as any,
    created_at: new Date().toISOString(),
    usage: { input_tokens: Math.floor(prompt.length / 4), output_tokens: 0 },
  } as Message
  conversationMessages.push(assistantMsg)
  messages.set(conversationId, conversationMessages)

  const conversation = conversations.get(conversationId)
  if (conversation) {
    conversation.updated_at = new Date().toISOString()
    conversations.set(conversationId, conversation)
  }

  res.write(`event: done\ndata: ${JSON.stringify({
    conversation_id: conversationId,
    assistant_message_id: assistantMsgId,
  })}\n\n`)
  res.end()
}

// Generate contextual mock responses
function getMockResponse(input: string, messageNum: number): string {
  const msgLabel = `[Mock Response #${messageNum}]`

  if (input.includes('hello') || input.includes('hi') || input.includes('hey')) {
    return `${msgLabel}\n\nHello! I'm your AI assistant powered by Grengin. How can I help you today? I can assist with business strategy, marketing ideas, data analysis, and much more.`
  }

  if (input.includes('help')) {
    return `${msgLabel}\n\nI'd be happy to help! Here are some things I can assist you with:\n\n• **Business Strategy** - Market analysis, competitive positioning, growth planning\n• **Marketing** - Campaign ideas, content strategy, audience targeting\n• **Data Analysis** - Insights from your data, trend identification\n• **Writing** - Reports, proposals, emails, and documentation\n\nWhat would you like to explore?`
  }

  if (input.includes('marketing') || input.includes('campaign')) {
    return `${msgLabel}\n\nGreat question about marketing! Here are some key strategies to consider:\n\n1. **Content Marketing** - Create valuable content that attracts your target audience\n2. **Social Media** - Build engagement on platforms where your customers spend time\n3. **Email Campaigns** - Nurture leads with personalized messaging\n4. **SEO** - Optimize for search to drive organic traffic\n\nWould you like me to dive deeper into any of these areas?`
  }

  if (input.includes('business') || input.includes('strategy') || input.includes('growth')) {
    return `${msgLabel}\n\nLet me share some insights on business growth:\n\n**Key Growth Levers:**\n• Customer acquisition cost optimization\n• Lifetime value maximization\n• Market expansion opportunities\n• Product-market fit refinement\n\n**Recommended Actions:**\n1. Analyze your current metrics\n2. Identify high-impact opportunities\n3. Test and iterate quickly\n\nWhat specific aspect of your business would you like to focus on?`
  }

  if (input.includes('markdown') || input.includes('document') || input.includes('report') || input.includes('article')) {
    return `${msgLabel}\n\nHere's a document draft for you:\n\n\`\`\`markdown\n# Quarterly Business Review — Q2 2026\n\n## Executive Summary\n\nThis quarter saw **strong growth** across all key metrics. Revenue increased by 23% YoY, driven by enterprise adoption of the Grengin platform.\n\n## Key Highlights\n\n- **Revenue**: $4.2M (+23% YoY)\n- **Active Users**: 12,500 (+18% QoQ)\n- **Enterprise Clients**: 47 (up from 38)\n- **NPS Score**: 72 (industry avg: 45)\n\n## Department Performance\n\n### Engineering\n\n| Metric | Target | Actual | Status |\n|--------|--------|--------|--------|\n| Sprint velocity | 85 pts | 92 pts | Exceeded |\n| Bug resolution | < 48h | 36h avg | On track |\n| Uptime | 99.9% | 99.97% | Exceeded |\n\n### Sales\n\n1. Closed 12 new enterprise deals\n2. Pipeline grew to $8.5M\n3. Average deal size increased to **$89K** (from $72K)\n\n### Marketing\n\n> "Our content strategy pivot to thought leadership has driven a 3x increase in inbound qualified leads." — VP Marketing\n\n- Published 24 blog posts\n- Hosted 3 webinars (avg 450 attendees)\n- Social media engagement up **156%**\n\n## Risks & Mitigations\n\n- **Talent retention**: Implemented new equity refresh program\n- **Infrastructure costs**: Migrating to reserved instances (est. 30% savings)\n- **Competition**: Accelerating roadmap for AI governance features\n\n## Next Quarter Goals\n\n1. Launch **Projects v2** with artifact contributions\n2. Expand to 3 new geographic markets\n3. Achieve SOC 2 Type II certification\n4. Hire 15 engineers across platform and AI teams\n\n---\n\n*Prepared by the Strategy Team — Grengin Inc.*\n\`\`\`\n\nYou can click the **artifact card** to preview the formatted document, or save it to a project.`
  }

  if (input.includes('html') || input.includes('page') || input.includes('landing') || input.includes('website')) {
    return `${msgLabel}\n\nHere's a landing page draft for you:\n\n\`\`\`html\n<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>Grengin - AI for Teams</title>\n  <style>\n    * { margin: 0; padding: 0; box-sizing: border-box; }\n    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a2e; }\n    .hero { background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%); color: white; padding: 80px 40px; text-align: center; }\n    .hero h1 { font-size: 3rem; font-weight: 800; margin-bottom: 16px; }\n    .hero p { font-size: 1.25rem; opacity: 0.9; max-width: 600px; margin: 0 auto 32px; }\n    .btn { display: inline-block; padding: 14px 32px; background: white; color: #6366f1; font-weight: 700; border-radius: 12px; text-decoration: none; font-size: 1rem; transition: transform 0.2s; }\n    .btn:hover { transform: translateY(-2px); }\n    .features { display: grid; grid-template-columns: repeat(3, 1fr); gap: 32px; padding: 64px 40px; max-width: 1000px; margin: 0 auto; }\n    .card { padding: 32px; border-radius: 16px; background: #f8f9ff; border: 1px solid #e8e8f0; }\n    .card h3 { color: #6366f1; margin-bottom: 8px; }\n    .card p { color: #555; line-height: 1.6; }\n    .footer { text-align: center; padding: 32px; color: #888; font-size: 0.9rem; }\n  </style>\n</head>\n<body>\n  <div class="hero">\n    <h1>AI That Works With Your Team</h1>\n    <p>Grengin brings powerful AI into every department — with the governance and insights leadership needs.</p>\n    <a href="#" class="btn">Get Started Free</a>\n  </div>\n  <div class="features">\n    <div class="card">\n      <h3>Projects</h3>\n      <p>Shared context stores with instructions, knowledge, and tools — reusable across conversations.</p>\n    </div>\n    <div class="card">\n      <h3>Governance</h3>\n      <p>Department-level controls, tool ceilings, and audit trails — without blocking productivity.</p>\n    </div>\n    <div class="card">\n      <h3>Insights</h3>\n      <p>Per-project cost reporting and adoption analytics for executives and finance teams.</p>\n    </div>\n  </div>\n  <div class="footer">© 2026 Grengin. All rights reserved.</div>\n</body>\n</html>\n\`\`\`\n\nYou can click the **eye icon** above to preview this page, or save it to a project using the **save icon**.`
  }

  if (input.includes('thank')) {
    return `${msgLabel}\n\nYou're welcome! Feel free to ask if you have any other questions. I'm here to help you succeed!`
  }

  // Default response
  return `${msgLabel}\n\nThat's an interesting question! Let me think about this...\n\nBased on my analysis, here are some thoughts:\n\n1. **Context matters** - Understanding the full picture is essential\n2. **Data-driven decisions** - Let's look at the evidence\n3. **Iterative approach** - Start small, learn, and scale\n\nWould you like me to elaborate on any specific aspect? I'm here to help you find the best path forward.`
}

// Generate a title from user input
function generateTitle(input: string): string {
  const words = input.trim().split(' ').slice(0, 6)
  if (words.length === 0) return 'New Conversation'

  // Capitalize first letter and add ellipsis if truncated
  let title = words.join(' ')
  title = title.charAt(0).toUpperCase() + title.slice(1)
  if (input.trim().split(' ').length > 6) {
    title += '...'
  }
  return title
}

export default router
