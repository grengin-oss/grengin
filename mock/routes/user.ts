import { Router } from 'express'
import { requireAuth } from '../lib/middleware.js'
import type { User } from '../lib/store.js'

const router = Router()

router.get('/me', requireAuth, (req, res) => {
  const user: User = {
    id: '550e8400-e29b-41d4-a716-446655440001',
    sub: 'auth0|507f1f77bcf86cd799439011',
    email: 'demo@grengin.com',
    name: 'Demo User',
    picture: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Demo',
    hd: 'grengin.com',
    is_super_admin: false,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: new Date().toISOString(),
  }
  res.json(user)
})

export default router
