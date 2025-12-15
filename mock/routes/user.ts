import { Router } from 'express'
import { requireAuth } from '../lib/middleware.js'
import type { User } from '../lib/store.js'
import meExample from '../examples/user/me.response.json' with { type: 'json' }
import rateLimitExample from '../examples/user/rate-limit.response.json' with { type: 'json' }
import budgetExample from '../examples/user/budget.response.json' with { type: 'json' }
import usageExample from '../examples/user/usage.response.json' with { type: 'json' }

const router = Router()

router.get('/me', requireAuth, (req, res) => {
  res.json(meExample)
})

router.get('/me/rate-limit', requireAuth, (req, res) => {
  res.json(rateLimitExample)
})

router.get('/me/budget', requireAuth, (req, res) => {
  res.json(budgetExample)
})

router.get('/me/usage', requireAuth, (req, res) => {
  res.json(usageExample)
})

export default router
