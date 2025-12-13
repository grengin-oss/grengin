import { Router } from 'express'
import { faker } from '@faker-js/faker'
import loginExample from '../examples/auth/login.response.json' with { type: 'json' }
import { requireAuth } from '../lib/middleware.js'

const router = Router()

const SUPPORTED_PROVIDERS = ['google', 'azure', 'keycloak']

router.post('/auth/login', (req, res) => {
  const { email, password } = req.body

  if (!email || !password) {
    return res.status(400).json({ detail: 'Email and password are required' })
  }

  // Accept demo credentials
  if (email === 'admin@grengin.com' && password === 'Demo123456!@') {
    return res.json({
      requires_mfa: loginExample.requires_mfa,
      accessToken: loginExample.access_token,
      refresh_token: loginExample.refresh_token,
      user: loginExample.user,
    })
  }

  return res.status(401).json({ detail: 'Invalid email or password' })
})

router.post('/auth/refresh', (req, res) => {
  const { refresh_token } = req.body

  if (!refresh_token) {
    return res.status(401).json({ detail: 'Refresh token is required' })
  }

  return res.json({
    requires_mfa: false,
    accessToken: loginExample.access_token,
    refresh_token: loginExample.refresh_token,
    user: loginExample.user,
  })
})

router.post('/auth/logout', requireAuth, (req, res) => {
  res.status(204).send()
})

router.get('/auth/:provider', (req, res) => {
  const { provider } = req.params

  console.log(`[OAuth Init] Provider: ${provider}, Redirect URI: ${req.query.redirect_uri}`)

  if (!SUPPORTED_PROVIDERS.includes(provider)) {
    return res.status(400).json({
      detail: 'Invalid provider or configuration'
    })
  }

  const state = faker.string.alphanumeric(32)
  const code = faker.string.alphanumeric(32)
  const redirectUri = req.query.redirect_uri as string || 'http://localhost:5173/auth/callback'

  const callbackUrl = new URL(redirectUri)
  callbackUrl.searchParams.set('code', code)
  callbackUrl.searchParams.set('state', state)

  console.log(`[OAuth Init] Redirecting to: ${callbackUrl.toString()}`)

  res.redirect(303, callbackUrl.toString())
})

router.get('/auth/:provider/callback', (req, res) => {
  const { provider } = req.params

  if (!SUPPORTED_PROVIDERS.includes(provider)) {
    return res.status(400).json({
      detail: 'Invalid provider or configuration'
    })
  }

  const code = req.query.code as string
  const state = req.query.state as string
  const error = req.query.error as string

  if (error) {
    return res.status(400).json({ detail: error })
  }

  if (!code || !state) {
    return res.status(400).json({
      detail: 'Missing code or state parameter'
    })
  }

  const user = {
    id: faker.string.uuid(),
    sub: `${provider}|${faker.string.alphanumeric(20)}`,
    email: `${provider}-demo@grengin.com`,
    name: `${provider.charAt(0).toUpperCase() + provider.slice(1)} Demo User`,
    picture: `https://api.dicebear.com/7.x/avataaars/svg?seed=${provider}Demo`,
    hd: 'grengin.com',
    is_super_admin: false,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: new Date().toISOString(),
  }

  res.json({
    requires_mfa: false,
    accessToken: loginExample.access_token,
    refresh_token: loginExample.refresh_token,
    user,
  })
})

router.post('/auth/:provider/callback', (req, res) => {
  const { provider } = req.params

  if (!SUPPORTED_PROVIDERS.includes(provider)) {
    return res.status(400).json({
      detail: 'Invalid provider or configuration'
    })
  }

  const { code, state, error } = req.body

  if (error) {
    return res.status(400).json({ detail: error })
  }

  if (!code || !state) {
    return res.status(400).json({
      detail: 'Missing code or state parameter'
    })
  }

  const user = {
    id: faker.string.uuid(),
    sub: `${provider}|${faker.string.alphanumeric(20)}`,
    email: `${provider}-demo@grengin.com`,
    name: `${provider.charAt(0).toUpperCase() + provider.slice(1)} Demo User`,
    picture: `https://api.dicebear.com/7.x/avataaars/svg?seed=${provider}Demo`,
    hd: 'grengin.com',
    is_super_admin: false,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: new Date().toISOString(),
  }

  res.json({
    requires_mfa: false,
    accessToken: loginExample.access_token,
    refresh_token: loginExample.refresh_token,
    user,
  })
})

export default router
