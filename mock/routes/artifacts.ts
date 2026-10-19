// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

import { Router } from 'express'
import { requireAuth } from '../lib/middleware.js'
import { artifacts } from '../lib/store.js'

const router = Router()

// Full persisted artifact content, fetched by the preview panel by id (ENGG-387).
router.get('/artifacts/:id', requireAuth, (req, res) => {
  const artifact = artifacts.get(req.params.id)
  if (!artifact) {
    return res.status(404).json({ detail: 'Artifact not found' })
  }
  res.json(artifact)
})

export default router
