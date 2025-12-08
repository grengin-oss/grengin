import { http, HttpResponse, delay } from 'msw'
import type { components } from '../types/api.js'
import { API_BASE, requireAuth } from '../lib/index.js'
import chatListExample from '../examples/chat/list.response.json' with { type: 'json' }
import chatDetailExample from '../examples/chat/detail.response.json' with { type: 'json' }

// Type aliases from generated OpenAPI types
type Conversation = components['schemas']['Conversation']
type Message = components['schemas']['Message']

// In-memory conversation store
const conversations = new Map<string, Conversation>()
const messages = new Map<string, Message[]>()

// Seed with initial data from examples
const seedData = () => {
  // Load conversations from list example
  chatListExample.conversations.forEach((conv) => {
    conversations.set(conv.id, conv as Conversation)
  })

  // Load messages from detail example
  messages.set(chatDetailExample.id, chatDetailExample.messages as Message[])

  // Initialize empty message arrays for other conversations
  chatListExample.conversations.forEach((conv) => {
    if (!messages.has(conv.id)) {
      messages.set(conv.id, [])
    }
  })
}

seedData()

export const chatHandlers = [
  // List conversations
  http.get(`${API_BASE}/chat`, ({ request }) => {
    const authError = requireAuth(request)
    if (authError) return authError

    const url = new URL(request.url)
    const limit = Number(url.searchParams.get('limit') ?? 20)
    const offset = Number(url.searchParams.get('offset') ?? 0)
    const archived = url.searchParams.get('archived')
    const search = url.searchParams.get('search')

    let allConversations = Array.from(conversations.values())

    if (archived !== null) {
      const isArchived = archived === 'true'
      allConversations = allConversations.filter(chat => chat.archived === isArchived)
    }

    if (search) {
      allConversations = allConversations.filter(chat =>
        chat.title.toLowerCase().includes(search.toLowerCase()),
      )
    }

    const paginatedConversations = allConversations.slice(offset, offset + limit)

    return HttpResponse.json(paginatedConversations)
  }),

  // Get conversation detail
  http.get(`${API_BASE}/chat/:chatId`, ({ request, params }) => {
    const authError = requireAuth(request)
    if (authError) return authError

    const { chatId } = params
    const conversation = conversations.get(chatId as string)

    if (!conversation) {
      return HttpResponse.json(
        { detail: 'Conversation not found' },
        { status: 404 }
      )
    }

    return HttpResponse.json({
      ...conversation,
      messages: messages.get(chatId as string) || [],
    })
  }),

  // Update conversation
  http.put(`${API_BASE}/chat/:chatId`, async ({ request, params }) => {
    const authError = requireAuth(request)
    if (authError) return authError

    const { chatId } = params
    const conversation = conversations.get(chatId as string)

    if (!conversation) {
      return HttpResponse.json(
        { detail: 'Conversation not found' },
        { status: 404 }
      )
    }

    const body = await request.json() as Partial<Conversation>
    const updated: Conversation = {
      ...conversation,
      ...body,
      updated_at: new Date().toISOString(),
    }

    conversations.set(chatId as string, updated)

    return HttpResponse.json(updated)
  }),

  // Delete conversation
  http.delete(`${API_BASE}/chat/:chatId`, ({ request, params }) => {
    const authError = requireAuth(request)
    if (authError) return authError

    const { chatId } = params

    if (!conversations.has(chatId as string)) {
      return HttpResponse.json(
        { detail: 'Conversation not found' },
        { status: 404 }
      )
    }

    conversations.delete(chatId as string)
    messages.delete(chatId as string)

    return new HttpResponse(null, { status: 204 })
  }),

  // Stream chat response
  http.post(`${API_BASE}/chat/stream`, async ({ request }) => {
    const authError = requireAuth(request)
    if (authError) return authError

    const body = await request.json() as { conversation_id?: string }
    const conversationId = body.conversation_id || crypto.randomUUID()

    // Create a streaming response
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        // Send start event
        controller.enqueue(encoder.encode(`event: start\ndata: ${JSON.stringify({
          conversation_id: conversationId,
          files_attached: 0
        })}\n\n`))

        await delay(100)

        const response = `Based on your question, here's a detailed analysis of business growth strategies...

This is a simulated streaming response from the mock API. In production, this would be real-time AI-generated content.

Key points to consider:
1. Market positioning
2. Customer acquisition channels
3. Product-market fit
4. Scalability considerations

Would you like me to elaborate on any of these areas?`

        // Simulate streaming by sending token events
        const words = response.split(' ')
        for (const word of words) {
          await delay(50) // Simulate network delay
          controller.enqueue(encoder.encode(`event: token\ndata: ${JSON.stringify({
            content: word + ' ',
            conversation_id: conversationId
          })}\n\n`))
        }

        // Send title generation event
        await delay(200)
        controller.enqueue(encoder.encode(`event: set_title\ndata: ${JSON.stringify({
          conversation_id: conversationId,
          title: 'Business Growth Strategies'
        })}\n\n`))

        // Send completion event
        controller.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify({
          conversation_id: conversationId,
          user_message_id: crypto.randomUUID(),
          assistant_message_id: crypto.randomUUID()
        })}\n\n`))

        controller.close()
      },
    })

    return new HttpResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  }),

  // Search conversations
  http.get(`${API_BASE}/chat/search`, ({ request }) => {
    const authError = requireAuth(request)
    if (authError) return authError

    const url = new URL(request.url)
    const search = url.searchParams.get('search')

    let allConversations = Array.from(conversations.values())

    if (search) {
      allConversations = allConversations.filter(chat =>
        chat.title.toLowerCase().includes(search.toLowerCase()),
      )
    }

    return HttpResponse.json(allConversations)
  }),
]
