import { Router } from 'express'
import { requireAuth } from '../lib/middleware.js'
import { aiEngines, type AIEngineDetail, type AIEngineModelsResponse } from '../lib/store.js'
import dashboardExample from '../examples/admin/dashboard.response.json' with { type: 'json' }
import usersListExample from '../examples/admin/users-list.response.json' with { type: 'json' }
import organizationExample from '../examples/admin/organization.response.json' with { type: 'json' }

const router = Router()

// Dashboard
router.get('/admin/dashboard', requireAuth, (req, res) => {
  res.json(dashboardExample)
})

// Users
router.get('/admin/users', requireAuth, (req, res) => {
  res.json(usersListExample)
})

router.post('/admin/users', requireAuth, (req, res) => {
  res.status(201).json({
    id: crypto.randomUUID(),
    ...req.body,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })
})

router.get('/admin/users/:userId', requireAuth, (req, res) => {
  const user = usersListExample.users.find(u => u.id === req.params.userId)
  if (!user) {
    return res.status(404).json({ detail: 'User not found' })
  }
  res.json(user)
})

router.put('/admin/users/:userId', requireAuth, (req, res) => {
  const user = usersListExample.users.find(u => u.id === req.params.userId)
  if (!user) {
    return res.status(404).json({ detail: 'User not found' })
  }
  res.json({ ...user, ...req.body, updated_at: new Date().toISOString() })
})

router.delete('/admin/users/:userId', requireAuth, (req, res) => {
  res.status(204).send()
})

router.get('/admin/users/:userId/usage', requireAuth, (req, res) => {
  res.json(dashboardExample.costs)
})

// Organization
router.get('/admin/organization', requireAuth, (req, res) => {
  res.json(organizationExample)
})

router.put('/admin/organization', requireAuth, (req, res) => {
  res.json({ ...organizationExample, ...req.body, updated_at: new Date().toISOString() })
})

// AI Engines
router.get('/admin/ai-engines', requireAuth, (req, res) => {
  res.json(Array.from(aiEngines.values()))
})

router.get('/admin/ai-engines/:engineKey', requireAuth, (req, res) => {
  const engine = aiEngines.get(req.params.engineKey)
  if (!engine) {
    return res.status(404).json({ detail: 'AI engine not found' })
  }
  res.json(engine)
})

router.put('/admin/ai-engines/:engineKey', requireAuth, (req, res) => {
  const engine = aiEngines.get(req.params.engineKey)
  if (!engine) {
    return res.status(404).json({ detail: 'AI engine not found' })
  }

  // Prevent disabling a default engine
  if (engine.is_default && req.body.is_enabled === false) {
    return res.status(400).json({ 
      detail: 'Cannot disable the default engine. Please set another engine as default first.' 
    })
  }

  // Validate that default_model is in whitelisted_models
  const defaultModel = req.body.default_model !== undefined ? req.body.default_model : engine.default_model
  const whitelistedModels = req.body.whitelisted_models !== undefined ? req.body.whitelisted_models : engine.whitelisted_models
  
  if (defaultModel && whitelistedModels && !whitelistedModels.includes(defaultModel)) {
    return res.status(400).json({
      detail: 'The default model must be included in the whitelisted models.'
    })
  }

  // If setting this engine as the default engine (is_default: true),
  // unset all other engines as default
  if (req.body.is_default === true) {
    aiEngines.forEach((otherEngine, key) => {
      if (key !== req.params.engineKey && otherEngine.is_default) {
        aiEngines.set(key, {
          ...otherEngine,
          is_default: false,
          updated_at: new Date().toISOString(),
        })
      }
    })
  }

  const updated: AIEngineDetail = {
    ...engine,
    ...(req.body.is_enabled !== undefined && { is_enabled: req.body.is_enabled }),
    ...(req.body.whitelisted_models !== undefined && { whitelisted_models: req.body.whitelisted_models }),
    // Allow setting default_model to a value or explicitly clearing it with null
    ...(req.body.default_model !== undefined && { default_model: req.body.default_model }),
    // Allow setting is_default flag
    ...(req.body.is_default !== undefined && { is_default: req.body.is_default }),
    updated_at: new Date().toISOString(),
  }

  if (req.body.api_key) {
    updated.api_key_configured = true
    updated.api_key_status = 'untested'
    updated.api_key_preview = '...' + req.body.api_key.slice(-4)
  }

  aiEngines.set(req.params.engineKey, updated)
  res.json(updated)
})

router.post('/admin/ai-engines/:engineKey/validate', requireAuth, (req, res) => {
  const engine = aiEngines.get(req.params.engineKey)
  if (!engine) {
    return res.status(404).json({ detail: 'AI engine not found' })
  }

  if (!engine.api_key_configured) {
    return res.status(400).json({ detail: 'No API key configured for this engine' })
  }

  const updated: AIEngineDetail = {
    ...engine,
    api_key_status: 'valid',
    api_key_last_validated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  aiEngines.set(req.params.engineKey, updated)

  res.json({
    valid: true,
    message: 'API key validated successfully',
    models_available: 15,
  })
})

router.get('/admin/ai-engines/:engineKey/models', requireAuth, (req, res) => {
  const engine = aiEngines.get(req.params.engineKey)
  if (!engine) {
    return res.status(404).json({ detail: 'AI engine not found' })
  }

  if (!engine.api_key_configured) {
    return res.status(400).json({ detail: 'No API key configured for this engine' })
  }

  const modelsByEngine: Record<string, AIEngineModelsResponse['models']> = {
    openai: [
      { model_id: 'gpt-4o', display_name: 'GPT-4o', is_whitelisted: true, capabilities: { vision: true, function_calling: true, streaming: true } },
      { model_id: 'gpt-4.1', display_name: 'GPT-4.1', is_whitelisted: true, capabilities: { vision: true, function_calling: true, streaming: true } },
      { model_id: 'gpt-4.1-mini', display_name: 'GPT-4.1 Mini', is_whitelisted: true, capabilities: { vision: true, function_calling: true, streaming: true } },
      { model_id: 'o3', display_name: 'O3', is_whitelisted: false, capabilities: { vision: false, function_calling: true, streaming: true } },
    ],
    anthropic: [
      { model_id: 'claude-sonnet-4-20250514', display_name: 'Claude Sonnet 4', is_whitelisted: true, capabilities: { vision: true, function_calling: true, streaming: true } },
      { model_id: 'claude-opus-4-20250514', display_name: 'Claude Opus 4', is_whitelisted: false, capabilities: { vision: true, function_calling: true, streaming: true } },
      { model_id: 'claude-3-haiku-20240307', display_name: 'Claude 3 Haiku', is_whitelisted: true, capabilities: { vision: true, function_calling: true, streaming: true } },
    ],
    google: [
      { model_id: 'gemini-2.0-flash', display_name: 'Gemini 2.0 Flash', is_whitelisted: true, capabilities: { vision: true, function_calling: true, streaming: true } },
      { model_id: 'gemini-1.5-pro', display_name: 'Gemini 1.5 Pro', is_whitelisted: true, capabilities: { vision: true, function_calling: true, streaming: true } },
    ],
    groq: [
      { model_id: 'llama-3.3-70b-versatile', display_name: 'Llama 3.3 70B', is_whitelisted: false, capabilities: { vision: false, function_calling: true, streaming: true } },
      { model_id: 'mixtral-8x7b-32768', display_name: 'Mixtral 8x7B', is_whitelisted: false, capabilities: { vision: false, function_calling: true, streaming: true } },
    ],
  }

  res.json({
    models: modelsByEngine[req.params.engineKey] || [],
  })
})

router.delete('/admin/ai-engines/:engineKey/api-key', requireAuth, (req, res) => {
  const engine = aiEngines.get(req.params.engineKey)
  if (!engine) {
    return res.status(404).json({ detail: 'AI engine not found' })
  }

  const updated: AIEngineDetail = {
    ...engine,
    is_enabled: false,
    api_key_configured: false,
    api_key_status: 'untested',
    api_key_preview: null,
    api_key_last_validated_at: null,
    updated_at: new Date().toISOString(),
  }
  aiEngines.set(req.params.engineKey, updated)
  res.json(updated)
})

// SSO Providers
import ssoProvidersExample from '../examples/admin/sso-providers-list.response.json' with { type: 'json' }

router.get('/admin/sso-providers', requireAuth, (req, res) => {
  res.json(ssoProvidersExample)
})

router.post('/admin/sso-providers', requireAuth, (req, res) => {
  res.status(201).json({
    id: crypto.randomUUID(),
    ...req.body,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })
})

router.get('/admin/sso-providers/:providerId', requireAuth, (req, res) => {
  const provider = ssoProvidersExample.find((p: { id: string }) => p.id === req.params.providerId)
  if (!provider) {
    return res.status(404).json({ detail: 'SSO provider not found' })
  }
  res.json(provider)
})

router.put('/admin/sso-providers/:providerId', requireAuth, (req, res) => {
  const provider = ssoProvidersExample.find((p: { id: string }) => p.id === req.params.providerId)
  if (!provider) {
    return res.status(404).json({ detail: 'SSO provider not found' })
  }
  res.json({ ...provider, ...req.body, updated_at: new Date().toISOString() })
})

router.delete('/admin/sso-providers/:providerId', requireAuth, (req, res) => {
  res.status(204).send()
})

router.post('/admin/sso-providers/:providerId/test', requireAuth, (req, res) => {
  res.json({
    success: true,
    message: 'SSO provider test successful',
    discovery_url: 'https://example.com/.well-known/openid-configuration',
    endpoints_found: {
      authorization: true,
      token: true,
      userinfo: true,
      jwks: true,
    },
  })
})

// Rate Limits
import rateLimitsExample from '../examples/admin/rate-limits-list.response.json' with { type: 'json' }

router.get('/admin/rate-limits', requireAuth, (req, res) => {
  res.json(rateLimitsExample)
})

router.post('/admin/rate-limits', requireAuth, (req, res) => {
  res.status(201).json({
    id: crypto.randomUUID(),
    ...req.body,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })
})

router.put('/admin/rate-limits/:limitId', requireAuth, (req, res) => {
  res.json({
    id: req.params.limitId,
    ...req.body,
    updated_at: new Date().toISOString(),
  })
})

router.delete('/admin/rate-limits/:limitId', requireAuth, (req, res) => {
  res.status(204).send()
})

// Budgets
import budgetsExample from '../examples/admin/budgets-list.response.json' with { type: 'json' }

router.get('/admin/budgets', requireAuth, (req, res) => {
  res.json(budgetsExample)
})

router.post('/admin/budgets', requireAuth, (req, res) => {
  res.status(201).json({
    id: crypto.randomUUID(),
    ...req.body,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })
})

router.put('/admin/budgets/:budgetId', requireAuth, (req, res) => {
  res.json({
    id: req.params.budgetId,
    ...req.body,
    updated_at: new Date().toISOString(),
  })
})

router.delete('/admin/budgets/:budgetId', requireAuth, (req, res) => {
  res.status(204).send()
})

// Bulk user import
router.post('/admin/users/bulk', requireAuth, (req, res) => {
  res.json({
    total: 5,
    successful: 4,
    failed: 1,
    errors: [
      { row: 3, email: 'invalid@', error: 'Invalid email format' },
    ],
  })
})

// Audit Logs
import auditLogsExample from '../examples/admin/audit-logs.response.json' with { type: 'json' }

router.get('/admin/audit-logs', requireAuth, (req, res) => {
  const limit = parseInt(req.query.limit as string || '50')
  const offset = parseInt(req.query.offset as string || '0')
  const adminId = req.query.admin_id as string
  const action = req.query.action as string
  const resourceType = req.query.resource_type as string

  let logs = [...auditLogsExample]

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
    offset,
  })
})

export default router
