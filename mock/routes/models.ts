// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

import { Router } from 'express'
import { requireAuth } from '../lib/middleware.js'
import modelsExample from '../examples/models/providers.response.json' with { type: 'json' }

const router = Router()

// Specialty / price-tier catalogs (grengin-api 0.9.14). Codes + English labels;
// the webapp translates known codes itself and falls back to these labels.
const SPECIALTIES = [
  { id: 'general', label: 'All-rounder', description: 'Reliable everyday help with writing, questions and analysis.' },
  { id: 'frontier', label: 'Most capable', description: 'Top quality for hard, multi-step work.' },
  { id: 'reasoning', label: 'Reasoning', description: 'Step-by-step problem solving.' },
  { id: 'coding', label: 'Coding', description: 'Writing and explaining code.' },
  { id: 'fast-cheap', label: 'Fast & cheap', description: 'Quick, low-cost responses.' },
  { id: 'image-generation', label: 'Image generation', description: 'Create and edit images.' },
]
const PRICE_TIERS = [
  { id: 'free', label: 'Free' },
  { id: 'cheap', label: 'Cheap' },
  { id: 'moderate', label: 'Moderate' },
  { id: 'expensive', label: 'Expensive' },
  { id: 'premium', label: 'Premium' },
]

// Mock summaries, in English and Japanese, keyed by specialty — enough to prove
// the `?locale=` param reaches the backend and summaries come back localized.
const SUMMARY: Record<string, { en: string; ja: string }> = {
  frontier: { en: 'Top quality for hard, multi-step work.', ja: '難しい多段階の作業に最適な最高品質。' },
  'fast-cheap': { en: 'Quick answers at a low price.', ja: '低価格で素早い回答。' },
  reasoning: { en: 'Thinks step by step before answering.', ja: '回答の前に段階的に考えます。' },
  coding: { en: 'Strong at writing and explaining code.', ja: 'コードの記述と説明が得意。' },
  'image-generation': { en: 'Generates and edits images.', ja: '画像を生成・編集します。' },
  general: { en: 'A dependable all-rounder.', ja: '頼れるオールラウンダー。' },
}

function specialtyFor(model: any): string {
  const name = `${model.key} ${model.name}`.toLowerCase()
  if (model.model_type === 'image_generator' || /image/.test(name)) return 'image-generation'
  if (/(mini|flash|haiku|lite|8b|9b|instant)/.test(name)) return 'fast-cheap'
  if (/(opus|gpt-5|gpt5|pro|ultra|sonnet-4)/.test(name)) return 'frontier'
  if (/(o1|o3|reason|think)/.test(name)) return 'reasoning'
  if (/(coder|code)/.test(name)) return 'coding'
  return 'general'
}

const PRICE_FOR_SPECIALTY: Record<string, string> = {
  frontier: 'expensive',
  reasoning: 'moderate',
  coding: 'moderate',
  'fast-cheap': 'cheap',
  'image-generation': 'moderate',
  general: 'moderate',
}

router.get('/models', requireAuth, (req, res) => {
  const locale = String(req.query.locale ?? '').toLowerCase()
  const lang: 'en' | 'ja' = locale.startsWith('ja') ? 'ja' : 'en'

  const providers = (modelsExample as any).providers.map((provider: any) => {
    // The catalog's default + a recommendation for a couple of providers, to
    // exercise the "Recommended" section and default pre-selection.
    const defaultKey = provider.key === 'openai' ? 'gpt-5' : undefined
    const recommendedKeys = new Set(
      provider.key === 'openai'
        ? ['gpt-5']
        : provider.key === 'anthropic'
          ? [provider.models[0]?.key]
          : [],
    )
    return {
      ...provider,
      models: provider.models.map((model: any) => {
        const specialty = specialtyFor(model)
        return {
          ...model,
          specialty,
          summary: SUMMARY[specialty]?.[lang] ?? SUMMARY.general[lang],
          price_tier: PRICE_FOR_SPECIALTY[specialty] ?? 'moderate',
          recommended: recommendedKeys.has(model.key),
          default: model.key === defaultKey,
        }
      }),
    }
  })

  res.json({
    providers,
    specialties: SPECIALTIES,
    price_tiers: PRICE_TIERS,
    // Enforced attachment limits (0.9.14). A restricted type list + a modest
    // per-message count so the composer's accept/validation is exercisable.
    global_attachments: {
      accepted_types: ['image/*', 'application/pdf', 'text/*', '.docx', '.xlsx', '.csv'],
      max_file_size_bytes: 26214400,
      max_files_per_message: 10,
    },
  })
})

export default router
