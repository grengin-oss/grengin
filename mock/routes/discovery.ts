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
router.get('/distributions/grengin-api/:version/index.json', (_req, res) => {
  res.json(indexJson)
})

router.get('/distributions/grengin-api/:version/categories.json', (_req, res) => {
  res.json(categoriesJson)
})

export default router
