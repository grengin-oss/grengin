import { Router } from 'express'
import { requireAuth } from '../lib/middleware.js'
import { userSettings, setUserSettings } from '../lib/store.js'

const router = Router()

router.get('/settings', requireAuth, (req, res) => {
  res.json(userSettings)
})

router.put('/settings', requireAuth, (req, res) => {
  const updated = {
    ...userSettings,
    ...req.body,
    models: {
      ...userSettings.models,
      ...(req.body.models || {}),
      tool_models: {
        ...userSettings.models?.tool_models,
        ...(req.body.models?.tool_models || {}),
      },
    },
  }
  setUserSettings(updated)
  res.json(updated)
})

export default router
