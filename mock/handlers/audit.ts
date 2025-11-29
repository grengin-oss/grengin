import { http, HttpResponse } from 'msw'
import { API_BASE, requireAdmin } from '../lib/index.js'

// Import example data
import auditLogsExample from '../examples/audit/logs.response.json' with { type: 'json' }

// Local types for audit endpoints not in OpenAPI spec
type AuditAction =
  | 'user.login'
  | 'user.logout'
  | 'user.created'
  | 'user.updated'
  | 'chat.created'
  | 'chat.message_sent'
  | 'chat.deleted'
  | 'file.uploaded'
  | 'file.deleted'
  | 'settings.updated'
  | 'admin.user_created'
  | 'admin.user_updated'
  | 'admin.settings_updated'
  | 'admin.api_key_created'
  | 'admin.budget_updated'

interface AuditLog {
  id: string
  action: AuditAction
  user_id: string | null
  user_email: string | null
  resource_type: string | null
  resource_id: string | null
  details: object | null
  ip_address: string
  user_agent: string
  timestamp: string
}

interface PaginatedAuditLogs {
  logs: AuditLog[]
  total: number
  limit: number
  offset: number
}

// In-memory audit logs store - seeded from example
const auditLogs: AuditLog[] = auditLogsExample.logs as AuditLog[]

export const auditHandlers = [
  // Get audit logs
  http.get(`${API_BASE}/audit/logs`, ({ request }) => {
    const adminError = requireAdmin(request)
    if (adminError) return adminError

    const url = new URL(request.url)
    const limit = parseInt(url.searchParams.get('limit') || '50')
    const offset = parseInt(url.searchParams.get('offset') || '0')
    const userId = url.searchParams.get('user_id')
    const action = url.searchParams.get('action') as AuditAction | null
    const resourceType = url.searchParams.get('resource_type')
    const startDate = url.searchParams.get('start_date')
    const endDate = url.searchParams.get('end_date')
    const search = url.searchParams.get('search')

    let filteredLogs = [...auditLogs]

    // Apply filters
    if (userId) {
      filteredLogs = filteredLogs.filter(log => log.user_id === userId)
    }

    if (action) {
      filteredLogs = filteredLogs.filter(log => log.action === action)
    }

    if (resourceType) {
      filteredLogs = filteredLogs.filter(log => log.resource_type === resourceType)
    }

    if (startDate) {
      const start = new Date(startDate)
      filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) >= start)
    }

    if (endDate) {
      const end = new Date(endDate)
      filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) <= end)
    }

    if (search) {
      const searchLower = search.toLowerCase()
      filteredLogs = filteredLogs.filter(log =>
        log.user_email?.toLowerCase().includes(searchLower) ||
        log.action.toLowerCase().includes(searchLower) ||
        JSON.stringify(log.details).toLowerCase().includes(searchLower)
      )
    }

    const paginatedLogs = filteredLogs.slice(offset, offset + limit)

    const response: PaginatedAuditLogs = {
      logs: paginatedLogs,
      total: filteredLogs.length,
      limit,
      offset,
    }

    return HttpResponse.json(response)
  }),

  // Export audit logs
  http.get(`${API_BASE}/audit/logs/export`, ({ request }) => {
    const adminError = requireAdmin(request)
    if (adminError) return adminError

    const url = new URL(request.url)
    const startDateStr = url.searchParams.get('start_date')
    const endDateStr = url.searchParams.get('end_date')
    const format = url.searchParams.get('format') || 'csv'
    const action = url.searchParams.get('action') as AuditAction | null

    if (!startDateStr || !endDateStr) {
      return HttpResponse.json(
        { detail: 'start_date and end_date are required' },
        { status: 400 }
      )
    }

    const startDate = new Date(startDateStr)
    const endDate = new Date(endDateStr)

    let filteredLogs = auditLogs.filter(log => {
      const logDate = new Date(log.timestamp)
      return logDate >= startDate && logDate <= endDate
    })

    if (action) {
      filteredLogs = filteredLogs.filter(log => log.action === action)
    }

    if (format === 'json') {
      return HttpResponse.json(filteredLogs)
    }

    // CSV format
    const csvHeader = 'id,timestamp,action,user_id,user_email,resource_type,resource_id,ip_address,user_agent,details\n'
    const csvRows = filteredLogs.map(log =>
      `"${log.id}","${log.timestamp}","${log.action}","${log.user_id || ''}","${log.user_email || ''}","${log.resource_type || ''}","${log.resource_id || ''}","${log.ip_address || ''}","${log.user_agent || ''}","${JSON.stringify(log.details || {}).replace(/"/g, '""')}"`
    ).join('\n')

    return new HttpResponse(csvHeader + csvRows, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="audit_logs_${startDateStr}_${endDateStr}.csv"`,
      },
    })
  }),
]
