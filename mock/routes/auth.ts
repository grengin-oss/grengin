// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

import { Router } from 'express'
import { faker } from '@faker-js/faker'
import loginExample from '../examples/auth/login.response.json' with { type: 'json' }
import { requireAuth } from '../lib/middleware.js'
import { setVisitorIdentity } from '../lib/demoSeed.js'

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
      accessToken: loginExample.accessToken,
      refreshToken: loginExample.refreshToken,
      user: loginExample.user,
    })
  }

  return res.status(401).json({ detail: 'Invalid email or password' })
})

// Interactive Demo login (spec §2 / §3.6). No password and no bot gate: the
// visitor optionally tells us who they are on the entry screen and we drop them
// into the seeded org. Returns the SAME LoginResponse shape as /auth/login so
// the app's normal setAuth() flow applies.
router.post('/auth/demo-login', (req, res) => {
  const rawName = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
  const rawEmail = typeof req.body?.email === 'string' ? req.body.email.trim() : ''

  const name = rawName || 'Unknown'
  const email = rawEmail || 'unknown@demo.grengin.com'

  // Pin the visitor's identity into the seed so the User Management table shows
  // them at the top (spec §3.6), consistent with the /me user below.
  setVisitorIdentity(rawName, rawEmail)

  return res.json({
    requires_mfa: false,
    accessToken: loginExample.accessToken,
    refreshToken: loginExample.refreshToken,
    user: {
      ...loginExample.user,
      // Pin the visitor's own identity (spec §3.6). Everything else stays seeded.
      name,
      email,
      picture: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}`,
    },
  })
})

router.post('/auth/refresh', (req, res) => {
  const { refresh_token } = req.body

  if (!refresh_token) {
    return res.status(401).json({ detail: 'Refresh token is required' })
  }

  return res.json({
    requires_mfa: false,
    accessToken: loginExample.accessToken,
    refreshToken: loginExample.refreshToken,
    user: loginExample.user,
  })
})

router.post('/auth/logout', requireAuth, (req, res) => {
  res.status(204).send()
})

// MFA endpoints
router.post('/auth/mfa/setup', requireAuth, (req, res) => {
  res.json({
    secret: 'MOCK_MFA_SECRET_BASE32',
    qr_code: 'data:image/png;base64,MOCK_QR_CODE',
    recovery_codes: [
      'ABCD-EFGH-IJKL',
      'MNOP-QRST-UVWX',
      'YZAB-CDEF-GHIJ',
      'KLMN-OPQR-STUV',
      'WXYZ-1234-5678',
    ],
  })
})

router.post('/auth/mfa/verify', requireAuth, (req, res) => {
  const { code } = req.body
  if (!code) {
    return res.status(400).json({ detail: 'MFA code is required' })
  }
  res.json({
    requires_mfa: false,
    accessToken: loginExample.accessToken,
    refreshToken: loginExample.refreshToken,
    user: loginExample.user,
  })
})

router.post('/auth/mfa/recovery', requireAuth, (req, res) => {
  const { recovery_code } = req.body
  if (!recovery_code) {
    return res.status(400).json({ detail: 'Recovery code is required' })
  }
  res.json({
    requires_mfa: false,
    accessToken: loginExample.accessToken,
    refreshToken: loginExample.refreshToken,
    user: loginExample.user,
  })
})

router.post('/auth/mfa/regenerate-codes', requireAuth, (req, res) => {
  res.json({
    recovery_codes: [
      'NEW1-CODE-AAAA',
      'NEW2-CODE-BBBB',
      'NEW3-CODE-CCCC',
      'NEW4-CODE-DDDD',
      'NEW5-CODE-EEEE',
    ],
  })
})

// Password endpoints
router.post('/auth/password/forgot', (req, res) => {
  const { email } = req.body
  if (!email) {
    return res.status(400).json({ detail: 'Email is required' })
  }
  res.json({ message: 'Password reset email sent' })
})

router.post('/auth/password/reset', (req, res) => {
  const { token, new_password } = req.body
  if (!token || !new_password) {
    return res.status(400).json({ detail: 'Token and new password are required' })
  }
  res.json({ message: 'Password reset successful' })
})

router.post('/auth/password/change', requireAuth, (req, res) => {
  const { current_password, new_password } = req.body
  if (!current_password || !new_password) {
    return res.status(400).json({ detail: 'Current and new password are required' })
  }
  res.json({ message: 'Password changed successfully' })
})

router.get('/auth/:provider', (req, res) => {
  const { provider } = req.params

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
    accessToken: loginExample.accessToken,
    refreshToken: loginExample.refreshToken,
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
    accessToken: loginExample.accessToken,
    refreshToken: loginExample.refreshToken,
    user,
  })
})

export default router
