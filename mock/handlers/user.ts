import { http, HttpResponse } from 'msw'
import type { components } from '../types/api.js'
import { API_BASE, requireAuth } from '../lib/index.js'

// Import example data
import meExample from '../examples/user/me.response.json' with { type: 'json' }
import rateLimitExample from '../examples/user/rate-limit.response.json' with { type: 'json' }
import budgetExample from '../examples/user/budget.response.json' with { type: 'json' }
import usageExample from '../examples/user/usage.response.json' with { type: 'json' }

type User = components['schemas']['User']

// Local types for endpoints not yet in OpenAPI spec
interface RateLimitStatus {
  requests_remaining: number
  requests_limit: number
  tokens_remaining: number
  tokens_limit: number
  reset_at: string
}

interface BudgetStatus {
  budget_id: string
  limit_amount: number
  current_spend: number
  percentage_used: number
  remaining: number
  period_end: string
  status: 'ok' | 'warning' | 'exceeded'
}

interface CostSummary {
  total_cost: number
  total_requests: number
  total_tokens: number
  input_tokens: number
  output_tokens: number
  period_start: string
  period_end: string
}

export const userHandlers = [
  // Get current user
  http.get(`${API_BASE}/me`, ({ request }) => {
    const authError = requireAuth(request)
    if (authError) return authError

    // Return example user data with dynamic timestamp
    return HttpResponse.json({
      ...meExample,
      updated_at: new Date().toISOString(),
    })
  }),

  // Get current user rate limit status
  http.get(`${API_BASE}/me/rate-limit`, ({ request }) => {
    const authError = requireAuth(request)
    if (authError) return authError

    // Return example rate limit data with dynamic reset time
    const status: RateLimitStatus = {
      ...rateLimitExample,
      reset_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    }

    return HttpResponse.json(status)
  }),

  // Get current user budget status
  http.get(`${API_BASE}/me/budget`, ({ request }) => {
    const authError = requireAuth(request)
    if (authError) return authError

    // Return example budget data
    return HttpResponse.json(budgetExample)
  }),

  // Get current user usage
  http.get(`${API_BASE}/me/usage`, ({ request }) => {
    const authError = requireAuth(request)
    if (authError) return authError

    const url = new URL(request.url)
    const period = url.searchParams.get('period') || 'month'

    let periodStart: Date
    const now = new Date()

    switch (period) {
      case 'day':
        periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        break
      case 'week': {
        const dayOfWeek = now.getDay()
        periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek)
        break
      }
      case 'month':
      default:
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
        break
    }

    // Return example usage data with dynamic period
    const usage: CostSummary = {
      ...usageExample,
      period_start: periodStart.toISOString(),
      period_end: now.toISOString(),
    }

    return HttpResponse.json(usage)
  }),
]
