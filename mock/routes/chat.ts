import { Router } from 'express'
import { faker } from '@faker-js/faker'
import { requireAuth } from '../lib/middleware.js'
import { conversations, messages, type Conversation, type Message } from '../lib/store.js'

const router = Router()

// Track message count per conversation for mock numbering
const messageCounters = new Map<string, number>()

function getMessageNumber(conversationId: string): number {
  const count = (messageCounters.get(conversationId) || 0) + 1
  messageCounters.set(conversationId, count)
  return count
}

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

  const response = {
    archived: conversation.archived || false,
    archivedAt: conversation.archived_at || null,
    createdAt: conversation.created_at,
    id: conversation.id,
    lastMessageAt: conversation.updated_at || conversation.created_at,
    messages: conversationMessages.map(msg => ({
      cost: msg.usage?.input_tokens ? 0.001 : 0.1,
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
    model: "claude-sonnet-4-5",
    title: conversation.title,
    totalCost: conversationMessages.reduce((sum, msg) => sum + (msg.usage?.input_tokens ? 0.001 : 0.1), 0),
    totalTokens: conversationMessages.reduce((sum, msg) => sum + ((msg.usage?.input_tokens || 0) + (msg.usage?.output_tokens || 0)), 0),
    updatedAt: conversation.updated_at
  }

  res.json(response)
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

router.post('/chat/stream', requireAuth, async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  const { messages: reqMessages, conversation_id, model_name, provider } = req.body

  if (!reqMessages || !Array.isArray(reqMessages) || reqMessages.length === 0) {
    return res.status(400).json({ detail: 'messages array is required' })
  }

  const lastMessage = reqMessages[reqMessages.length - 1]
  const userMessageContent = lastMessage.content
  const conversationId = conversation_id || faker.string.uuid()
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

  // Send first chunk with conversation ID
  const chunks = responseText.split(' ')
  let isFirst = true

  for (const chunk of chunks) {
    res.write(`event: chunk\ndata: ${JSON.stringify({
      id: isFirst ? conversationId : undefined,
      content: chunk + ' ',
      conversation_id: conversationId
    })}\n\n`)
    isFirst = false
    await new Promise(resolve => setTimeout(resolve, 30))
  }

  // Send title event for new conversations
  if (isNewConversation) {
    const title = generateTitle(userMessageContent)
    res.write(`event: set_title\ndata: ${JSON.stringify({
      conversation_id: conversationId,
      title: title
    })}\n\n`)
  }

  // Send done event (frontend expects '[DONE]' event name)
  res.write(`event: [DONE]\ndata: ${JSON.stringify({
    conversation_id: conversationId,
    user_message_id: userMsgId,
    assistant_message_id: assistantMsgId
  })}\n\n`)

  res.end()
})

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
