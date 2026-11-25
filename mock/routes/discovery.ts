// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

import { Router } from 'express'
import { nativeConnectorFixtures, nativeConnectorDetail } from '../lib/nativeConnectorFixtures.js'
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
    category: (categoriesJson.providers as Record<string, string>)[p.id],
  }))
  res.json({ providers, categories: categoriesJson.categories })
})

// Complete native catalog for layout testing, with all suite members present.
router.get('/discovery/connector-plugins', (_req, res) => {
  res.json({ distribution_version: '0.9.13', catalog_type: 'connector', catalog_version: '1.0.0', providers: nativeConnectorFixtures })
})
router.get('/discovery/connector-plugins/:id', (req, res) => {
  const detail = nativeConnectorDetail(req.params.id)
  return detail ? res.json(detail) : res.status(404).json({ detail: 'Unknown connector plugin' })
})

router.get('/distributions/grengin-api/:version/index.json', (_req, res) => {
  res.json(indexJson)
})

router.get('/distributions/grengin-api/:version/categories.json', (_req, res) => {
  res.json(categoriesJson)
})

export default router
