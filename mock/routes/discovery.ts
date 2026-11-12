// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

import { Router } from 'express'
import indexJson from '../examples/discovery/index.json' with { type: 'json' }
import categoriesJson from '../examples/discovery/categories.json' with { type: 'json' }

const router = Router()

/**
 * Provider discovery — what the admin "Browse Providers" dialog lists as
 * available to connect. Mirrors the real backend's `/discovery/ai-providers`,
 * derived here from the published catalog (index.json) so the ids line up with
 * the category map below.
 */
router.get('/discovery/ai-providers', (_req, res) => {
  const providers = indexJson.aiProviders.providers.map((p) => ({
    id: p.id,
    name: p.name,
    icon: p.icon ?? null,
    icon_dark: p.iconDark ?? null,
  }))
  res.json({ providers })
})

/**
 * Distribution metadata, a local mirror of meta.grengin.com. The real host
 * serves these static files without CORS headers, so the Browse dialog cannot
 * fetch them cross-origin; pointing VITE_META_BASE at this mock server (see
 * .env.mock) lets the category grouping work end-to-end in development.
 */
const icon = (key: string) => `https://meta.grengin.com/connectors/icons/${key}.svg`
const plugin = (id: string, name: string, category: string, members?: string[]) => ({
  id, name, description: `${name} (mock).`, status: 'preview', icon: icon(id), icon_dark: icon(id), category,
  ...(members ? { members } : {}),
  selected_version: '1.0.0', latest_version: '1.0.0',
  available_versions: [{ version: '1.0.0', schema_version: '1.0', contract_version: '1.0', sha256: '0'.repeat(64) }],
})

// Native connector plugins for Browse: two single apps and a suite combining them behind one sign-in.
router.get('/discovery/connector-plugins', (_req, res) => {
  res.json({
    distribution_version: '0.9.9', catalog_type: 'connector', catalog_version: '1.0.0',
    providers: [
      plugin('gmail', 'Gmail', 'email-calendar'),
      plugin('google-calendar', 'Google Calendar', 'email-calendar'),
      plugin('google-basic', 'Google Basic Apps', 'email-calendar', ['gmail', 'google-calendar']),
      plugin('slack', 'Slack', 'chat'),
    ],
  })
})

router.get('/distributions/grengin-api/:version/index.json', (_req, res) => {
  res.json(indexJson)
})

router.get('/distributions/grengin-api/:version/categories.json', (_req, res) => {
  res.json(categoriesJson)
})

export default router
