// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

import { Router } from 'express'
import { requireAuth } from '../lib/middleware.js'
import modelsExample from '../examples/models/providers.response.json' with { type: 'json' }

const router = Router()

router.get('/models', requireAuth, (req, res) => {
  res.json(modelsExample)
})

export default router
