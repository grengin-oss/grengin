import { http, HttpResponse } from 'msw'
import { faker } from '@faker-js/faker'
import type { components } from '../types/api.js'
import { API_BASE, requireAdmin } from '../lib/index.js'

// Import example data for seeding
import dashboardExample from '../examples/admin/dashboard.response.json' with { type: 'json' }
import usersListExample from '../examples/admin/users-list.response.json' with { type: 'json' }
import organizationExample from '../examples/admin/organization.response.json' with { type: 'json' }
import apiKeysExample from '../examples/admin/api-keys-list.response.json' with { type: 'json' }
import ssoProvidersExample from '../examples/admin/sso-providers-list.response.json' with { type: 'json' }
import rateLimitsExample from '../examples/admin/rate-limits-list.response.json' with { type: 'json' }
import budgetsExample from '../examples/admin/budgets-list.response.json' with { type: 'json' }

type BaseUser = components['schemas']['User']

// Extended types for admin endpoints not in base OpenAPI spec
interface User extends BaseUser {
  role?: string
  status?: string
  department?: string
  is_super_admin?: boolean
  has_password?: boolean
  mfa_enabled?: boolean
  last_login_at?: string
}

interface Organization {
  id: string
  name: string
  domain: string
  allowed_domains: string[]
  settings: {
    default_model: string
    default_provider: string
    require_mfa: boolean
    data_retention_days: number
  }
  created_at: string
  updated_at: string
}

interface ApiKey {
  id: string
  provider: 'openai' | 'anthropic' | 'groq'
  name: string
  key_preview: string
  is_valid: boolean
  last_used_at?: string
  created_at: string
  created_by: string
}

interface OidcProviderConfig {
  id: string
  provider: string
  name: string
  client_id: string
  issuer_url: string
  scopes: string[]
  allowed_domains: string[]
  is_enabled: boolean
  is_default: boolean
  created_at: string
  updated_at: string
}

interface RateLimitConfig {
  id: string
  scope: string
  scope_id?: string
  requests_per_minute: number
  requests_per_hour: number
  requests_per_day: number
  tokens_per_day?: number
  is_active: boolean
  created_at: string
  updated_at: string
}

interface Budget {
  id: string
  scope: string
  scope_id?: string
  limit_amount: number
  period: string
  current_spend: number
  alert_thresholds: number[]
  action_on_exceed: string
  is_active: boolean
  period_start: string
  period_end: string
  created_at: string
  updated_at: string
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

interface AdminDashboard {
  users: { total: number; active: number; new_this_month: number }
  usage: {
    active_users: number
    total_users: number
    total_conversations: number
    total_messages: number
    avg_messages_per_conversation: number
    avg_requests_per_user: number
    most_used_models: Array<{ model: string; requests: number; percentage: number }>
  }
  costs: CostSummary
  cost_trend: Array<{ date: string; cost: number; requests: number; tokens: number }>
  system_health: {
    status: string
    timestamp: string
    services: { database: string; redis: string; llm_providers: Record<string, string> }
    version: string
  }
}

interface PaginatedUsers {
  users: User[]
  total: number
  limit: number
  offset: number
}

interface UserBulkImportResult {
  created: number
  updated: number
  failed: number
  errors: Array<{ email: string; error: string }>
}

// In-memory stores
const users = new Map<string, User>()
const apiKeys = new Map<string, ApiKey>()
const ssoProviders = new Map<string, OidcProviderConfig>()
const rateLimits = new Map<string, RateLimitConfig>()
const budgets = new Map<string, Budget>()

// Initialize organization from example
let organization: Organization = organizationExample as unknown as Organization

// Seed data from examples
const seedData = () => {
  // Seed users from example (user.id is now a UUID string)
  usersListExample.users.forEach((user) => {
    users.set(user.id as string, user as User)
  })

  // Seed API keys from example
  apiKeysExample.forEach((key) => {
    apiKeys.set(key.id, key as ApiKey)
  })

  // Seed SSO providers from example
  ssoProvidersExample.forEach((provider) => {
    ssoProviders.set(provider.id, provider as OidcProviderConfig)
  })

  // Seed rate limits from example
  rateLimitsExample.forEach((limit) => {
    rateLimits.set(limit.id, limit as RateLimitConfig)
  })

  // Seed budgets from example
  budgetsExample.forEach((budget) => {
    budgets.set(budget.id, budget as Budget)
  })
}

seedData()

export const adminHandlers = [
  // Get admin dashboard
  http.get(`${API_BASE}/admin/dashboard`, ({ request }) => {
    const adminError = requireAdmin(request)
    if (adminError) return adminError

    // Return example dashboard data with dynamic user counts
    const dashboard: AdminDashboard = {
      ...dashboardExample,
      users: {
        ...dashboardExample.users,
        total: users.size,
        active: Array.from(users.values()).filter(u => u.status === 'active').length,
      },
      usage: {
        ...dashboardExample.usage,
        total_users: users.size,
      },
      system_health: {
        ...dashboardExample.system_health,
        timestamp: new Date().toISOString(),
      },
    }

    return HttpResponse.json(dashboard)
  }),

  // List users
  http.get(`${API_BASE}/admin/users`, ({ request }) => {
    const adminError = requireAdmin(request)
    if (adminError) return adminError

    const url = new URL(request.url)
    const limit = parseInt(url.searchParams.get('limit') || '20')
    const offset = parseInt(url.searchParams.get('offset') || '0')
    const search = url.searchParams.get('search')
    const role = url.searchParams.get('role')
    const status = url.searchParams.get('status')
    const department = url.searchParams.get('department')

    let filteredUsers = Array.from(users.values())

    if (search) {
      const searchLower = search.toLowerCase()
      filteredUsers = filteredUsers.filter(u =>
        u.name?.toLowerCase().includes(searchLower) ||
        u.email.toLowerCase().includes(searchLower)
      )
    }

    if (role) {
      filteredUsers = filteredUsers.filter(u => u.role === role)
    }

    if (status) {
      filteredUsers = filteredUsers.filter(u => u.status === status)
    }

    if (department) {
      filteredUsers = filteredUsers.filter(u => u.department === department)
    }

    const paginatedUsers = filteredUsers.slice(offset, offset + limit)

    const response: PaginatedUsers = {
      users: paginatedUsers,
      total: filteredUsers.length,
      limit,
      offset,
    }

    return HttpResponse.json(response)
  }),

  // Create user
  http.post(`${API_BASE}/admin/users`, async ({ request }) => {
    const adminError = requireAdmin(request)
    if (adminError) return adminError

    const body = await request.json() as any

    if (!body.email) {
      return HttpResponse.json(
        { detail: 'Email is required' },
        { status: 400 }
      )
    }

    // Check for existing email
    const existingUser = Array.from(users.values()).find(u => u.email === body.email)
    if (existingUser) {
      return HttpResponse.json(
        { detail: 'User with this email already exists' },
        { status: 409 }
      )
    }

    const newId = faker.string.uuid()
    const newUser: User = {
      id: newId,
      sub: `auth0|${faker.string.alphanumeric(24)}`,
      email: body.email,
      name: body.name || body.email.split('@')[0],
      role: body.role || 'user',
      status: 'active',
      department: body.department,
      is_super_admin: false,
      has_password: false,
      mfa_enabled: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    users.set(newId, newUser)

    return HttpResponse.json(newUser, { status: 201 })
  }),

  // Bulk import users
  http.post(`${API_BASE}/admin/users/bulk`, async ({ request }) => {
    const adminError = requireAdmin(request)
    if (adminError) return adminError

    const body = await request.json() as any
    const usersToImport = body.users || []

    let created = 0
    let updated = 0
    let failed = 0
    const errors: Array<{ email: string; error: string }> = []

    for (const userData of usersToImport) {
      const existingUser = Array.from(users.values()).find(u => u.email === userData.email)

      if (existingUser) {
        // Update existing
        existingUser.name = userData.name || existingUser.name
        existingUser.role = userData.role || existingUser.role
        existingUser.department = userData.department || existingUser.department
        existingUser.updated_at = new Date().toISOString()
        updated++
      } else if (userData.email) {
        // Create new
        const newId = faker.string.uuid()
        users.set(newId, {
          id: newId,
          sub: `auth0|${faker.string.alphanumeric(24)}`,
          email: userData.email,
          name: userData.name || userData.email.split('@')[0],
          role: userData.role || 'user',
          status: 'active',
          department: userData.department,
          is_super_admin: false,
          has_password: false,
          mfa_enabled: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        created++
      } else {
        failed++
        errors.push({ email: userData.email || 'unknown', error: 'Invalid email' })
      }
    }

    const result: UserBulkImportResult = {
      created,
      updated,
      failed,
      errors,
    }

    return HttpResponse.json(result)
  }),

  // Get user
  http.get(`${API_BASE}/admin/users/:userId`, ({ request, params }) => {
    const adminError = requireAdmin(request)
    if (adminError) return adminError

    const userId = params.userId as string
    const user = users.get(userId)

    if (!user) {
      return HttpResponse.json(
        { detail: 'User not found' },
        { status: 404 }
      )
    }

    return HttpResponse.json(user)
  }),

  // Update user
  http.put(`${API_BASE}/admin/users/:userId`, async ({ request, params }) => {
    const adminError = requireAdmin(request)
    if (adminError) return adminError

    const userId = params.userId as string
    const user = users.get(userId)

    if (!user) {
      return HttpResponse.json(
        { detail: 'User not found' },
        { status: 404 }
      )
    }

    const body = await request.json() as any

    user.name = body.name ?? user.name
    user.role = body.role ?? user.role
    user.status = body.status ?? user.status
    user.department = body.department ?? user.department
    user.updated_at = new Date().toISOString()

    return HttpResponse.json(user)
  }),

  // Deactivate user
  http.delete(`${API_BASE}/admin/users/:userId`, ({ request, params }) => {
    const adminError = requireAdmin(request)
    if (adminError) return adminError

    const userId = params.userId as string
    const user = users.get(userId)

    if (!user) {
      return HttpResponse.json(
        { detail: 'User not found' },
        { status: 404 }
      )
    }

    if (user.is_super_admin) {
      return HttpResponse.json(
        { detail: 'Cannot deactivate super admin' },
        { status: 403 }
      )
    }

    user.status = 'deactivated'
    user.updated_at = new Date().toISOString()

    return new HttpResponse(null, { status: 204 })
  }),

  // Get user usage
  http.get(`${API_BASE}/admin/users/:userId/usage`, ({ request, params }) => {
    const adminError = requireAdmin(request)
    if (adminError) return adminError

    const userId = params.userId as string
    const user = users.get(userId)

    if (!user) {
      return HttpResponse.json(
        { detail: 'User not found' },
        { status: 404 }
      )
    }

    const usage: CostSummary = {
      total_cost: faker.number.float({ min: 5, max: 50, fractionDigits: 2 }),
      total_requests: faker.number.int({ min: 50, max: 500 }),
      total_tokens: faker.number.int({ min: 50000, max: 500000 }),
      input_tokens: faker.number.int({ min: 35000, max: 350000 }),
      output_tokens: faker.number.int({ min: 15000, max: 150000 }),
      period_start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
      period_end: new Date().toISOString(),
    }

    return HttpResponse.json(usage)
  }),

  // Get organization
  http.get(`${API_BASE}/admin/organization`, ({ request }) => {
    const adminError = requireAdmin(request)
    if (adminError) return adminError

    return HttpResponse.json(organization)
  }),

  // Update organization
  http.put(`${API_BASE}/admin/organization`, async ({ request }) => {
    const adminError = requireAdmin(request)
    if (adminError) return adminError

    const body = await request.json() as any

    organization = {
      ...organization,
      ...body,
      settings: {
        ...organization.settings,
        ...(body.settings || {}),
      },
      updated_at: new Date().toISOString(),
    }

    return HttpResponse.json(organization)
  }),

  // List API keys
  http.get(`${API_BASE}/admin/api-keys`, ({ request }) => {
    const adminError = requireAdmin(request)
    if (adminError) return adminError

    return HttpResponse.json(Array.from(apiKeys.values()))
  }),

  // Create API key
  http.post(`${API_BASE}/admin/api-keys`, async ({ request }) => {
    const adminError = requireAdmin(request)
    if (adminError) return adminError

    const body = await request.json() as any

    if (!body.provider || !body.api_key) {
      return HttpResponse.json(
        { detail: 'Provider and API key are required' },
        { status: 400 }
      )
    }

    const keyId = faker.string.uuid()
    const newKey: ApiKey = {
      id: keyId,
      provider: body.provider,
      name: body.name || `${body.provider} Key`,
      key_preview: '****' + body.api_key.slice(-4),
      is_valid: true,
      created_at: new Date().toISOString(),
      created_by: '550e8400-e29b-41d4-a716-446655440001', // Mock admin user ID
    }

    apiKeys.set(keyId, newKey)

    return HttpResponse.json(newKey, { status: 201 })
  }),

  // Get API key
  http.get(`${API_BASE}/admin/api-keys/:keyId`, ({ request, params }) => {
    const adminError = requireAdmin(request)
    if (adminError) return adminError

    const keyId = params.keyId as string
    const key = apiKeys.get(keyId)

    if (!key) {
      return HttpResponse.json(
        { detail: 'API key not found' },
        { status: 404 }
      )
    }

    return HttpResponse.json(key)
  }),

  // Delete API key
  http.delete(`${API_BASE}/admin/api-keys/:keyId`, ({ request, params }) => {
    const adminError = requireAdmin(request)
    if (adminError) return adminError

    const keyId = params.keyId as string

    if (!apiKeys.has(keyId)) {
      return HttpResponse.json(
        { detail: 'API key not found' },
        { status: 404 }
      )
    }

    apiKeys.delete(keyId)

    return new HttpResponse(null, { status: 204 })
  }),

  // Validate API key
  http.post(`${API_BASE}/admin/api-keys/:keyId/validate`, ({ request, params }) => {
    const adminError = requireAdmin(request)
    if (adminError) return adminError

    const keyId = params.keyId as string
    const key = apiKeys.get(keyId)

    if (!key) {
      return HttpResponse.json(
        { detail: 'API key not found' },
        { status: 404 }
      )
    }

    return HttpResponse.json({
      valid: true,
      message: 'API key is valid and working',
    })
  }),

  // List SSO providers
  http.get(`${API_BASE}/admin/sso-providers`, ({ request }) => {
    const adminError = requireAdmin(request)
    if (adminError) return adminError

    return HttpResponse.json(Array.from(ssoProviders.values()))
  }),

  // Create SSO provider
  http.post(`${API_BASE}/admin/sso-providers`, async ({ request }) => {
    const adminError = requireAdmin(request)
    if (adminError) return adminError

    const body = await request.json() as any

    if (!body.provider || !body.client_id || !body.client_secret || !body.issuer_url) {
      return HttpResponse.json(
        { detail: 'Provider, client_id, client_secret, and issuer_url are required' },
        { status: 400 }
      )
    }

    const providerId = faker.string.uuid()
    const newProvider: OidcProviderConfig = {
      id: providerId,
      provider: body.provider,
      name: body.name || body.provider,
      client_id: body.client_id,
      issuer_url: body.issuer_url,
      scopes: body.scopes || ['openid', 'email', 'profile'],
      allowed_domains: body.allowed_domains || [],
      is_enabled: body.is_enabled ?? true,
      is_default: body.is_default ?? false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    ssoProviders.set(providerId, newProvider)

    return HttpResponse.json(newProvider, { status: 201 })
  }),

  // Get SSO provider
  http.get(`${API_BASE}/admin/sso-providers/:providerId`, ({ request, params }) => {
    const adminError = requireAdmin(request)
    if (adminError) return adminError

    const providerId = params.providerId as string
    const provider = ssoProviders.get(providerId)

    if (!provider) {
      return HttpResponse.json(
        { detail: 'SSO provider not found' },
        { status: 404 }
      )
    }

    return HttpResponse.json(provider)
  }),

  // Update SSO provider
  http.put(`${API_BASE}/admin/sso-providers/:providerId`, async ({ request, params }) => {
    const adminError = requireAdmin(request)
    if (adminError) return adminError

    const providerId = params.providerId as string
    const provider = ssoProviders.get(providerId)

    if (!provider) {
      return HttpResponse.json(
        { detail: 'SSO provider not found' },
        { status: 404 }
      )
    }

    const body = await request.json() as any

    const updated: OidcProviderConfig = {
      ...provider,
      ...body,
      id: provider.id,
      created_at: provider.created_at,
      updated_at: new Date().toISOString(),
    }

    ssoProviders.set(providerId, updated)

    return HttpResponse.json(updated)
  }),

  // Delete SSO provider
  http.delete(`${API_BASE}/admin/sso-providers/:providerId`, ({ request, params }) => {
    const adminError = requireAdmin(request)
    if (adminError) return adminError

    const providerId = params.providerId as string

    if (!ssoProviders.has(providerId)) {
      return HttpResponse.json(
        { detail: 'SSO provider not found' },
        { status: 404 }
      )
    }

    ssoProviders.delete(providerId)

    return new HttpResponse(null, { status: 204 })
  }),

  // Test SSO provider
  http.post(`${API_BASE}/admin/sso-providers/:providerId/test`, ({ request, params }) => {
    const adminError = requireAdmin(request)
    if (adminError) return adminError

    const providerId = params.providerId as string
    const provider = ssoProviders.get(providerId)

    if (!provider) {
      return HttpResponse.json(
        { detail: 'SSO provider not found' },
        { status: 404 }
      )
    }

    return HttpResponse.json({
      success: true,
      message: 'SSO configuration validated successfully',
      discovery_url: `${provider.issuer_url}/.well-known/openid-configuration`,
      endpoints_found: {
        authorization: true,
        token: true,
        userinfo: true,
        jwks: true,
      },
    })
  }),

  // List rate limits
  http.get(`${API_BASE}/admin/rate-limits`, ({ request }) => {
    const adminError = requireAdmin(request)
    if (adminError) return adminError

    const url = new URL(request.url)
    const scope = url.searchParams.get('scope')

    let limits = Array.from(rateLimits.values())

    if (scope) {
      limits = limits.filter(l => l.scope === scope)
    }

    return HttpResponse.json(limits)
  }),

  // Get rate limit
  http.get(`${API_BASE}/admin/rate-limits/:limitId`, ({ request, params }) => {
    const adminError = requireAdmin(request)
    if (adminError) return adminError

    const limitId = params.limitId as string
    const limit = rateLimits.get(limitId)

    if (!limit) {
      return HttpResponse.json(
        { detail: 'Rate limit not found' },
        { status: 404 }
      )
    }

    return HttpResponse.json(limit)
  }),

  // Create rate limit
  http.post(`${API_BASE}/admin/rate-limits`, async ({ request }) => {
    const adminError = requireAdmin(request)
    if (adminError) return adminError

    const body = await request.json() as any

    if (!body.scope || !body.requests_per_minute) {
      return HttpResponse.json(
        { detail: 'Scope and requests_per_minute are required' },
        { status: 400 }
      )
    }

    const limitId = faker.string.uuid()
    const newLimit: RateLimitConfig = {
      id: limitId,
      scope: body.scope,
      scope_id: body.scope_id,
      requests_per_minute: body.requests_per_minute,
      requests_per_hour: body.requests_per_hour || body.requests_per_minute * 60,
      requests_per_day: body.requests_per_day || body.requests_per_minute * 60 * 24,
      tokens_per_day: body.tokens_per_day,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    rateLimits.set(limitId, newLimit)

    return HttpResponse.json(newLimit, { status: 201 })
  }),

  // Update rate limit
  http.put(`${API_BASE}/admin/rate-limits/:limitId`, async ({ request, params }) => {
    const adminError = requireAdmin(request)
    if (adminError) return adminError

    const limitId = params.limitId as string
    const limit = rateLimits.get(limitId)

    if (!limit) {
      return HttpResponse.json(
        { detail: 'Rate limit not found' },
        { status: 404 }
      )
    }

    const body = await request.json() as any

    const updated: RateLimitConfig = {
      ...limit,
      ...body,
      id: limit.id,
      created_at: limit.created_at,
      updated_at: new Date().toISOString(),
    }

    rateLimits.set(limitId, updated)

    return HttpResponse.json(updated)
  }),

  // Delete rate limit
  http.delete(`${API_BASE}/admin/rate-limits/:limitId`, ({ request, params }) => {
    const adminError = requireAdmin(request)
    if (adminError) return adminError

    const limitId = params.limitId as string

    if (!rateLimits.has(limitId)) {
      return HttpResponse.json(
        { detail: 'Rate limit not found' },
        { status: 404 }
      )
    }

    rateLimits.delete(limitId)

    return new HttpResponse(null, { status: 204 })
  }),

  // List budgets
  http.get(`${API_BASE}/admin/budgets`, ({ request }) => {
    const adminError = requireAdmin(request)
    if (adminError) return adminError

    const url = new URL(request.url)
    const scope = url.searchParams.get('scope')

    let budgetList = Array.from(budgets.values())

    if (scope) {
      budgetList = budgetList.filter(b => b.scope === scope)
    }

    return HttpResponse.json(budgetList)
  }),

  // Get budget
  http.get(`${API_BASE}/admin/budgets/:budgetId`, ({ request, params }) => {
    const adminError = requireAdmin(request)
    if (adminError) return adminError

    const budgetId = params.budgetId as string
    const budget = budgets.get(budgetId)

    if (!budget) {
      return HttpResponse.json(
        { detail: 'Budget not found' },
        { status: 404 }
      )
    }

    return HttpResponse.json(budget)
  }),

  // Create budget
  http.post(`${API_BASE}/admin/budgets`, async ({ request }) => {
    const adminError = requireAdmin(request)
    if (adminError) return adminError

    const body = await request.json() as any

    if (!body.scope || !body.limit_amount || !body.period) {
      return HttpResponse.json(
        { detail: 'Scope, limit_amount, and period are required' },
        { status: 400 }
      )
    }

    const budgetId = faker.string.uuid()
    const now = new Date()
    let periodStart: Date
    let periodEnd: Date

    switch (body.period) {
      case 'daily':
        periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        periodEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
        break
      case 'weekly':
        const dayOfWeek = now.getDay()
        periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek)
        periodEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (7 - dayOfWeek))
        break
      case 'monthly':
      default:
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
        periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
        break
    }

    const newBudget: Budget = {
      id: budgetId,
      scope: body.scope,
      scope_id: body.scope_id,
      limit_amount: body.limit_amount,
      period: body.period,
      current_spend: 0,
      alert_thresholds: body.alert_thresholds || [50, 75, 90, 100],
      action_on_exceed: body.action_on_exceed || 'warn',
      is_active: true,
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    budgets.set(budgetId, newBudget)

    return HttpResponse.json(newBudget, { status: 201 })
  }),

  // Update budget
  http.put(`${API_BASE}/admin/budgets/:budgetId`, async ({ request, params }) => {
    const adminError = requireAdmin(request)
    if (adminError) return adminError

    const budgetId = params.budgetId as string
    const budget = budgets.get(budgetId)

    if (!budget) {
      return HttpResponse.json(
        { detail: 'Budget not found' },
        { status: 404 }
      )
    }

    const body = await request.json() as any

    const updated: Budget = {
      ...budget,
      ...body,
      id: budget.id,
      current_spend: budget.current_spend,
      created_at: budget.created_at,
      updated_at: new Date().toISOString(),
    }

    budgets.set(budgetId, updated)

    return HttpResponse.json(updated)
  }),

  // Delete budget
  http.delete(`${API_BASE}/admin/budgets/:budgetId`, ({ request, params }) => {
    const adminError = requireAdmin(request)
    if (adminError) return adminError

    const budgetId = params.budgetId as string

    if (!budgets.has(budgetId)) {
      return HttpResponse.json(
        { detail: 'Budget not found' },
        { status: 404 }
      )
    }

    budgets.delete(budgetId)

    return new HttpResponse(null, { status: 204 })
  }),
]
