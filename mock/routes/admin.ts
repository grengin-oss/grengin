import { Router } from 'express'
import { requireAuth } from '../lib/middleware.js'
import { aiEngines, type AIEngineDetail, type AIEngineModelsResponse } from '../lib/store.js'

const router = Router()

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

  const updated: AIEngineDetail = {
    ...engine,
    ...(req.body.is_enabled !== undefined && { is_enabled: req.body.is_enabled }),
    ...(req.body.whitelisted_models && { whitelisted_models: req.body.whitelisted_models }),
    ...(req.body.default_model && { default_model: req.body.default_model }),
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

export default router
