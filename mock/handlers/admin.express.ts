import express from 'express'
import { faker } from '@faker-js/faker'
import type { components } from '../types/api.js'

// Import example data for seeding
import dashboardExample from '../examples/admin/dashboard.response.json' with { type: 'json' }
import usersListExample from '../examples/admin/users-list.response.json' with { type: 'json' }
import organizationExample from '../examples/admin/organization.response.json' with { type: 'json' }
import apiKeysExample from '../examples/admin/api-keys-list.response.json' with { type: 'json' }
import ssoProvidersExample from '../examples/admin/sso-providers-list.response.json' with { type: 'json' }
import rateLimitsExample from '../examples/admin/rate-limits-list.response.json' with { type: 'json' }
import budgetsExample from '../examples/admin/budgets-list.response.json' with { type: 'json' }
import auditLogsExample from '../examples/admin/audit-logs.response.json' with { type: 'json' }

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
  // Seed users from example
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
    rateLimits.set(limit.id, limit as unknown as RateLimitConfig)
  })

  // Seed budgets from example
  budgetsExample.forEach((budget) => {
    budgets.set(budget.id, budget as Budget)
  })
}

seedData()

// Create Express router
const router = express.Router()

// Admin middleware - attach to router
const requireAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ detail: 'Unauthorized' })
  }
  next()
}

// Apply admin middleware to all routes
router.use(requireAdmin)

// Dashboard
router.get('/dashboard', (req, res) => {
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
  res.json(dashboard)
})

// Users - List
router.get('/users', (req, res) => {
  const limit = parseInt(req.query.limit as string || '20')
  const offset = parseInt(req.query.offset as string || '0')
  const search = req.query.search as string
  const role = req.query.role as string
  const status = req.query.status as string
  const department = req.query.department as string

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

  res.json(response)
})

// Users - Create
router.post('/users', (req, res) => {
  const body = req.body

  if (!body.email) {
    return res.status(400).json({ detail: 'Email is required' })
  }

  // Check for existing email
  const existingUser = Array.from(users.values()).find(u => u.email === body.email)
  if (existingUser) {
    return res.status(409).json({ detail: 'User with this email already exists' })
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
  res.status(201).json(newUser)
})

// Users - Bulk import
router.post('/users/bulk', (req, res) => {
  const body = req.body
  const usersToImport = body.users || []

  let created = 0
  let updated = 0
  let failed = 0
  const errors: Array<{ email: string; error: string }> = []

  for (const userData of usersToImport) {
    const existingUser = Array.from(users.values()).find(u => u.email === userData.email)

    if (existingUser) {
      existingUser.name = userData.name || existingUser.name
      existingUser.role = userData.role || existingUser.role
      existingUser.department = userData.department || existingUser.department
      existingUser.updated_at = new Date().toISOString()
      updated++
    } else if (userData.email) {
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

  res.json(result)
})

// Users - Get single
router.get('/users/:userId', (req, res) => {
  const userId = req.params.userId
  const user = users.get(userId)

  if (!user) {
    return res.status(404).json({ detail: 'User not found' })
  }

  res.json(user)
})

// Users - Update
router.put('/users/:userId', (req, res) => {
  const userId = req.params.userId
  const user = users.get(userId)

  if (!user) {
    return res.status(404).json({ detail: 'User not found' })
  }

  const body = req.body

  user.name = body.name ?? user.name
  user.role = body.role ?? user.role
  user.status = body.status ?? user.status
  user.department = body.department ?? user.department
  user.updated_at = new Date().toISOString()

  res.json(user)
})

// Users - Delete
router.delete('/users/:userId', (req, res) => {
  const userId = req.params.userId
  const user = users.get(userId)

  if (!user) {
    return res.status(404).json({ detail: 'User not found' })
  }

  if (user.is_super_admin) {
    return res.status(403).json({ detail: 'Cannot deactivate super admin' })
  }

  user.status = 'deactivated'
  user.updated_at = new Date().toISOString()

  res.status(204).send()
})

// Users - Get usage
router.get('/users/:userId/usage', (req, res) => {
  const userId = req.params.userId
  const user = users.get(userId)

  if (!user) {
    return res.status(404).json({ detail: 'User not found' })
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

  res.json(usage)
})

// Organization - Get
router.get('/organization', (req, res) => {
  res.json(organization)
})

// Organization - Update
router.put('/organization', (req, res) => {
  const body = req.body

  organization = {
    ...organization,
    ...body,
    settings: {
      ...organization.settings,
      ...(body.settings || {}),
    },
    updated_at: new Date().toISOString(),
  }

  res.json(organization)
})

// API Keys - List
router.get('/api-keys', (req, res) => {
  res.json(Array.from(apiKeys.values()))
})

// API Keys - Create
router.post('/api-keys', (req, res) => {
  const body = req.body

  if (!body.provider || !body.api_key) {
    return res.status(400).json({ detail: 'Provider and API key are required' })
  }

  const keyId = faker.string.uuid()
  const newKey: ApiKey = {
    id: keyId,
    provider: body.provider,
    name: body.name || `${body.provider} Key`,
    key_preview: '****' + body.api_key.slice(-4),
    is_valid: true,
    created_at: new Date().toISOString(),
    created_by: '550e8400-e29b-41d4-a716-446655440001',
  }

  apiKeys.set(keyId, newKey)
  res.status(201).json(newKey)
})

// API Keys - Get single
router.get('/api-keys/:keyId', (req, res) => {
  const keyId = req.params.keyId
  const key = apiKeys.get(keyId)

  if (!key) {
    return res.status(404).json({ detail: 'API key not found' })
  }

  res.json(key)
})

// API Keys - Delete
router.delete('/api-keys/:keyId', (req, res) => {
  const keyId = req.params.keyId

  if (!apiKeys.has(keyId)) {
    return res.status(404).json({ detail: 'API key not found' })
  }

  apiKeys.delete(keyId)
  res.status(204).send()
})

// API Keys - Validate
router.post('/api-keys/:keyId/validate', (req, res) => {
  const keyId = req.params.keyId
  const key = apiKeys.get(keyId)

  if (!key) {
    return res.status(404).json({ detail: 'API key not found' })
  }

  res.json({
    valid: true,
    message: 'API key is valid and working',
  })
})

// SSO Providers - List
router.get('/sso-providers', (req, res) => {
  res.json(Array.from(ssoProviders.values()))
})

// SSO Providers - Create
router.post('/sso-providers', (req, res) => {
  const body = req.body

  if (!body.provider || !body.client_id || !body.client_secret || !body.issuer_url) {
    return res.status(400).json({
      detail: 'Provider, client_id, client_secret, and issuer_url are required'
    })
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
  res.status(201).json(newProvider)
})

// SSO Providers - Get single
router.get('/sso-providers/:providerId', (req, res) => {
  const providerId = req.params.providerId
  const provider = ssoProviders.get(providerId)

  if (!provider) {
    return res.status(404).json({ detail: 'SSO provider not found' })
  }

  res.json(provider)
})

// SSO Providers - Update
router.put('/sso-providers/:providerId', (req, res) => {
  const providerId = req.params.providerId
  const provider = ssoProviders.get(providerId)

  if (!provider) {
    return res.status(404).json({ detail: 'SSO provider not found' })
  }

  const body = req.body
  const updated: OidcProviderConfig = {
    ...provider,
    ...body,
    id: provider.id,
    created_at: provider.created_at,
    updated_at: new Date().toISOString(),
  }

  ssoProviders.set(providerId, updated)
  res.json(updated)
})

// SSO Providers - Delete
router.delete('/sso-providers/:providerId', (req, res) => {
  const providerId = req.params.providerId

  if (!ssoProviders.has(providerId)) {
    return res.status(404).json({ detail: 'SSO provider not found' })
  }

  ssoProviders.delete(providerId)
  res.status(204).send()
})

// SSO Providers - Test
router.post('/sso-providers/:providerId/test', (req, res) => {
  const providerId = req.params.providerId
  const provider = ssoProviders.get(providerId)

  if (!provider) {
    return res.status(404).json({ detail: 'SSO provider not found' })
  }

  res.json({
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
})

// Rate Limits - List
router.get('/rate-limits', (req, res) => {
  const scope = req.query.scope as string

  let limits = Array.from(rateLimits.values())

  if (scope) {
    limits = limits.filter(l => l.scope === scope)
  }

  res.json(limits)
})

// Rate Limits - Get single
router.get('/rate-limits/:limitId', (req, res) => {
  const limitId = req.params.limitId
  const limit = rateLimits.get(limitId)

  if (!limit) {
    return res.status(404).json({ detail: 'Rate limit not found' })
  }

  res.json(limit)
})

// Rate Limits - Create
router.post('/rate-limits', (req, res) => {
  const body = req.body

  if (!body.scope || !body.requests_per_minute) {
    return res.status(400).json({ detail: 'Scope and requests_per_minute are required' })
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
  res.status(201).json(newLimit)
})

// Rate Limits - Update
router.put('/rate-limits/:limitId', (req, res) => {
  const limitId = req.params.limitId
  const limit = rateLimits.get(limitId)

  if (!limit) {
    return res.status(404).json({ detail: 'Rate limit not found' })
  }

  const body = req.body

  const updated: RateLimitConfig = {
    ...limit,
    ...body,
    id: limit.id,
    created_at: limit.created_at,
    updated_at: new Date().toISOString(),
  }

  rateLimits.set(limitId, updated)
  res.json(updated)
})

// Rate Limits - Delete
router.delete('/rate-limits/:limitId', (req, res) => {
  const limitId = req.params.limitId

  if (!rateLimits.has(limitId)) {
    return res.status(404).json({ detail: 'Rate limit not found' })
  }

  rateLimits.delete(limitId)
  res.status(204).send()
})

// Budgets - List
router.get('/budgets', (req, res) => {
  const scope = req.query.scope as string

  let budgetList = Array.from(budgets.values())

  if (scope) {
    budgetList = budgetList.filter(b => b.scope === scope)
  }

  res.json(budgetList)
})

// Budgets - Get single
router.get('/budgets/:budgetId', (req, res) => {
  const budgetId = req.params.budgetId
  const budget = budgets.get(budgetId)

  if (!budget) {
    return res.status(404).json({ detail: 'Budget not found' })
  }

  res.json(budget)
})

// Budgets - Create
router.post('/budgets', (req, res) => {
  const body = req.body

  if (!body.scope || !body.limit_amount || !body.period) {
    return res.status(400).json({ detail: 'Scope, limit_amount, and period are required' })
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
  res.status(201).json(newBudget)
})

// Budgets - Update
router.put('/budgets/:budgetId', (req, res) => {
  const budgetId = req.params.budgetId
  const budget = budgets.get(budgetId)

  if (!budget) {
    return res.status(404).json({ detail: 'Budget not found' })
  }

  const body = req.body

  const updated: Budget = {
    ...budget,
    ...body,
    id: budget.id,
    current_spend: budget.current_spend,
    created_at: budget.created_at,
    updated_at: new Date().toISOString(),
  }

  budgets.set(budgetId, updated)
  res.json(updated)
})

// Budgets - Delete
router.delete('/budgets/:budgetId', (req, res) => {
  const budgetId = req.params.budgetId

  if (!budgets.has(budgetId)) {
    return res.status(404).json({ detail: 'Budget not found' })
  }

  budgets.delete(budgetId)
  res.status(204).send()
})

// Audit Logs - List
router.get('/audit-logs', (req, res) => {
  const limit = parseInt(req.query.limit as string || '50')
  const offset = parseInt(req.query.offset as string || '0')
  const adminId = req.query.admin_id as string
  const action = req.query.action as string
  const resourceType = req.query.resource_type as string
  
  // Transform the example data to match expected format
  let logs = auditLogsExample.map(log => ({
    id: log.id,
    timestamp: log.timestamp,
    admin_id: log.admin_id,
    admin_email: log.admin_email,
    action: log.action,
    resource_type: log.resource_type,
    resource_id: log.resource_id || null,
    details: log.details || null,
    ip_address: log.ip_address || '192.168.1.1'
  }))
  
  // Apply filters
  if (adminId) {
    logs = logs.filter(log => log.admin_id === adminId)
  }
  if (action) {
    logs = logs.filter(log => log.action === action)
  }
  if (resourceType) {
    logs = logs.filter(log => log.resource_type === resourceType)
  }
  
  const paginatedLogs = logs.slice(offset, offset + limit)
  
  res.json({
    logs: paginatedLogs,
    total: logs.length,
    limit,
    offset
  })
})

export default router

