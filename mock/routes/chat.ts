import { Router } from 'express'
import { faker } from '@faker-js/faker'
import { requireAuth } from '../lib/middleware.js'
import { conversations, messages, type Conversation, type Message } from '../lib/store.js'

const router = Router()
const cancelledStreams = new Set<string>()

function getConversationSortTime(conversation: Conversation): number {
  return new Date(conversation.updated_at || conversation.created_at).getTime()
}

function findSemanticResult(conversationId: string, query: string) {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return null

  const conversationMessages = messages.get(conversationId) || []
  const match = conversationMessages.find((message) =>
    (message.parts?.text || '').toLowerCase().includes(normalizedQuery),
  )

  if (!match) return null

  const text = match.parts?.text || ''
  const index = text.toLowerCase().indexOf(normalizedQuery)
  const start = Math.max(0, index - 48)
  const end = Math.min(text.length, index + normalizedQuery.length + 96)

  return {
    message_id: match.id,
    snippet: `${start > 0 ? '...' : ''}${text.slice(start, end)}${end < text.length ? '...' : ''}`,
    distance: 0.18,
  }
}

// Track message count per conversation for mock numbering
const messageCounters = new Map<string, number>()

function getMessageNumber(conversationId: string): number {
  const count = (messageCounters.get(conversationId) || 0) + 1
  messageCounters.set(conversationId, count)
  return count
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
  const limit = Math.min(Number(req.query.limit || 20), 100)
  const offset = Number(req.query.offset || 0)
  const search = String(req.query.search || '').trim()
  const semantic = req.query.semantic === 'true'

  let allConversations = Array.from(conversations.values())

  if (search && semantic) {
    const ranked = allConversations
      .map((chat) => ({ chat, semanticResult: findSemanticResult(chat.id, search) }))
      .filter(
        (entry): entry is { chat: Conversation; semanticResult: NonNullable<ReturnType<typeof findSemanticResult>> } =>
          Boolean(entry.semanticResult),
      )
      .sort((a, b) => a.semanticResult.distance - b.semanticResult.distance)

    const paged = ranked.slice(offset, offset + limit)
    const semanticResults: Record<string, NonNullable<ReturnType<typeof findSemanticResult>>> = {}
    for (const entry of paged) {
      semanticResults[entry.chat.id] = entry.semanticResult
    }

    res.json({
      conversations: paged.map((entry) => entry.chat),
      total: ranked.length,
      limit,
      offset,
      semantic_results: semanticResults,
    })
    return
  }

  if (search) {
    allConversations = allConversations.filter((chat) =>
      chat.title.toLowerCase().includes(search.toLowerCase()),
    )
  }

  // Sort by updated_at descending (most recent first)
  const sorted = allConversations.sort((a, b) => getConversationSortTime(b) - getConversationSortTime(a))
  const paged = sorted.slice(offset, offset + limit)

  res.json({
    conversations: paged,
    total: sorted.length,
    limit,
    offset,
    semantic_results: null,
  })
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

router.post('/chat/stream/:messageId/cancel', requireAuth, (req, res) => {
  cancelledStreams.add(req.params.messageId)
  res.status(202).send()
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

  // Send conversation event if it's a new conversation
  if (isNewConversation) {
    res.write(`event: conversation\ndata: ${JSON.stringify({ id: conversationId })}\n\n`)
  }

  // Send message_start event
  res.write(`event: message_start\ndata: ${JSON.stringify({ message_id: assistantMsgId })}\n\n`)

  // Send delta events — stream code blocks line-by-line for a live-coding effect
  const shouldStop = () => cancelledStreams.has(assistantMsgId) || res.destroyed
  const hasCodeBlock = responseText.includes('```html') || responseText.includes('```markdown') || responseText.includes('```md')
  if (hasCodeBlock) {
    const parts = responseText.split(/(```(?:html|markdown|md)\s*\n[\s\S]*?```)/);
    for (const part of parts) {
      if (part.match(/^```(?:html|markdown|md)\s*\n/)) {
        const lines = part.split('\n')
        for (const line of lines) {
          if (shouldStop()) break
          res.write(`event: delta\ndata: ${JSON.stringify({ text: line + '\n' })}\n\n`)
          await new Promise(resolve => setTimeout(resolve, 18))
        }
      } else {
        const words = part.split(' ')
        for (const word of words) {
          if (shouldStop()) break
          res.write(`event: delta\ndata: ${JSON.stringify({ text: word + ' ' })}\n\n`)
          await new Promise(resolve => setTimeout(resolve, 25))
        }
      }
      if (shouldStop()) break
    }
  } else {
    const chunks = responseText.split(' ')
    for (const chunk of chunks) {
      if (shouldStop()) break
      res.write(`event: delta\ndata: ${JSON.stringify({ text: chunk + ' ' })}\n\n`)
      await new Promise(resolve => setTimeout(resolve, 30))
    }
  }

  if (cancelledStreams.has(assistantMsgId)) {
    cancelledStreams.delete(assistantMsgId)
    res.end()
    return
  }

  // Send done event
  res.write(`event: done\ndata: ${JSON.stringify({
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
