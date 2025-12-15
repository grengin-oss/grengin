import { Router } from 'express'
import modelsExample from '../examples/models/providers.response.json' with { type: 'json' }

const router = Router()

router.get('/models', (req, res) => {
  res.json(modelsExample)
})

export default router
