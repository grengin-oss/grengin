import { http, HttpResponse } from 'msw'
import { API_BASE, requireAdmin } from '../lib/index.js'

// Import example data
import costsExample from '../examples/analytics/costs.response.json' with { type: 'json' }
import usageExample from '../examples/analytics/usage.response.json' with { type: 'json' }
import trendsExample from '../examples/analytics/trends.response.json' with { type: 'json' }

// Local types for analytics endpoints not in OpenAPI spec
interface CostSummary {
  total_cost: number
  total_requests: number
  total_tokens: number
  input_tokens: number
  output_tokens: number
  period_start: string
  period_end: string
}

interface CostDimension {
  dimension: string
  cost: number
  requests: number
  tokens: number
  percentage: number
}

interface CostBreakdown {
  summary: CostSummary
  by_user: CostDimension[]
  by_department: CostDimension[]
  by_model: CostDimension[]
  by_provider: CostDimension[]
}

interface CostTrend {
  date: string
  cost: number
  requests: number
  tokens: number
}

interface UsageStats {
  active_users: number
  total_users: number
  total_conversations: number
  total_messages: number
  avg_messages_per_conversation: number
  avg_requests_per_user: number
  most_used_models: Array<{ model: string; requests: number; percentage: number }>
}

// Helper to parse date params
const parseDateParams = (url: URL): { startDate: Date; endDate: Date } | null => {
  const startDateStr = url.searchParams.get('start_date')
  const endDateStr = url.searchParams.get('end_date')

  if (!startDateStr || !endDateStr) {
    return null
  }

  return {
    startDate: new Date(startDateStr),
    endDate: new Date(endDateStr),
  }
}

// Generate cost data for a date range using example data as a pattern
const generateCostData = (startDate: Date, endDate: Date): CostTrend[] => {
  const days: CostTrend[] = []
  const currentDate = new Date(startDate)
  const exampleDays = trendsExample as CostTrend[]
  let index = 0

  while (currentDate <= endDate) {
    // Cycle through example data patterns
    const exampleDay = exampleDays[index % exampleDays.length]
    days.push({
      date: currentDate.toISOString().split('T')[0],
      cost: exampleDay.cost,
      requests: exampleDay.requests,
      tokens: exampleDay.tokens,
    })
    currentDate.setDate(currentDate.getDate() + 1)
    index++
  }

  return days
}

export const analyticsHandlers = [
  // Get cost analytics
  http.get(`${API_BASE}/analytics/costs`, ({ request }) => {
    const adminError = requireAdmin(request)
    if (adminError) return adminError

    const url = new URL(request.url)
    const dates = parseDateParams(url)

    if (!dates) {
      return HttpResponse.json(
        { detail: 'start_date and end_date are required' },
        { status: 400 }
      )
    }

    const { startDate, endDate } = dates

    // Return example data with dynamic date range
    const breakdown: CostBreakdown = {
      ...costsExample,
      summary: {
        ...costsExample.summary,
        period_start: startDate.toISOString(),
        period_end: endDate.toISOString(),
      },
    }

    return HttpResponse.json(breakdown)
  }),

  // Export costs
  http.get(`${API_BASE}/analytics/costs/export`, ({ request }) => {
    const adminError = requireAdmin(request)
    if (adminError) return adminError

    const url = new URL(request.url)
    const dates = parseDateParams(url)

    if (!dates) {
      return HttpResponse.json(
        { detail: 'start_date and end_date are required' },
        { status: 400 }
      )
    }

    const format = url.searchParams.get('format') || 'csv'
    const { startDate, endDate } = dates
    const data = generateCostData(startDate, endDate)

    if (format === 'json') {
      const jsonData = data.map((d) => ({
        date: d.date,
        cost: d.cost,
        requests: d.requests,
        tokens: d.tokens,
        input_tokens: Math.floor((d.tokens || 0) * 0.7),
        output_tokens: Math.floor((d.tokens || 0) * 0.3),
      }))
      return HttpResponse.json(jsonData)
    }

    // CSV format
    const csvHeader = 'date,cost,requests,tokens,input_tokens,output_tokens\n'
    const csvRows = data.map((d) =>
      `${d.date},${d.cost},${d.requests},${d.tokens},${Math.floor((d.tokens || 0) * 0.7)},${Math.floor((d.tokens || 0) * 0.3)}`
    ).join('\n')

    return new HttpResponse(csvHeader + csvRows, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="costs_${startDate.toISOString().split('T')[0]}_${endDate.toISOString().split('T')[0]}.csv"`,
      },
    })
  }),

  // Get usage analytics
  http.get(`${API_BASE}/analytics/usage`, ({ request }) => {
    const adminError = requireAdmin(request)
    if (adminError) return adminError

    const url = new URL(request.url)
    const dates = parseDateParams(url)

    if (!dates) {
      return HttpResponse.json(
        { detail: 'start_date and end_date are required' },
        { status: 400 }
      )
    }

    // Return example usage data
    return HttpResponse.json(usageExample)
  }),

  // Get cost trends
  http.get(`${API_BASE}/analytics/trends`, ({ request }) => {
    const adminError = requireAdmin(request)
    if (adminError) return adminError

    const url = new URL(request.url)
    const dates = parseDateParams(url)

    if (!dates) {
      return HttpResponse.json(
        { detail: 'start_date and end_date are required' },
        { status: 400 }
      )
    }

    // Return example trends data
    return HttpResponse.json(trendsExample)
  }),
]
