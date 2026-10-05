// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

import { Router } from 'express'
import { faker } from '@faker-js/faker'
import loginExample from '../examples/auth/login.response.json' with { type: 'json' }
import { requireAuth } from '../lib/middleware.js'
import { emptyStores, resetStores, ssoSession, workspace } from '../lib/store.js'

/** Microsoft sign-in opens a brand-new empty workspace; any other sign-in the sample one. */
function enterWorkspace(provider: string | null) {
  if (provider === 'azure') {
    workspace.empty = true
    workspace.users = []
    workspace.roleIds = []
    emptyStores()
  } else if (workspace.empty) {
    workspace.empty = false
    workspace.users = []
    workspace.roleIds = []
    resetStores()
  }
}

/** Fixed ids for the returning SSO admins (one per provider). */
const RETURNING_SSO_IDS: Record<string, string> = {
  google: '550e8400-e29b-41d4-a716-446655440101',
  keycloak: '550e8400-e29b-41d4-a716-446655440102',
}

/**
 * Microsoft (azure): a brand-new workspace creator on every sign-in — new id,
 * the earliest Super Admin, an empty workspace — so the first-launch tour
 * (ENGG-447) runs each time.
 * Google / Keycloak: the same existing Super Admin every time, added after the
 * workspace was created. They land in the sample workspace with all its data,
 * and — not being the first Super Admin — never see the tour or Setup guide.
 */
function ssoUser(provider: string) {
  const newWorkspace = provider === 'azure'
  const label = provider.charAt(0).toUpperCase() + provider.slice(1)
  return {
    id: newWorkspace ? faker.string.uuid() : RETURNING_SSO_IDS[provider] ?? faker.string.uuid(),
    sub: newWorkspace ? `${provider}|${faker.string.alphanumeric(20)}` : `${provider}|demo-user`,
    email: `${provider}-demo@grengin.com`,
    name: `${label} Demo User`,
    picture: `https://api.dicebear.com/7.x/avataaars/svg?seed=${provider}Demo`,
    hd: 'grengin.com',
    is_super_admin: true,
    status: 'active',
    roles: ['Super Admin'],
    provider,
    // Microsoft: earlier than every fixture user, so this sign-in owns the
    // workspace. Others: after the demo admin who created it (2024-01-01).
    created_at: newWorkspace ? '2023-12-31T00:00:00Z' : '2024-02-01T00:00:00Z',
    updated_at: new Date().toISOString(),
  }
}

const router = Router()

const SUPPORTED_PROVIDERS = ['google', 'azure', 'keycloak']

router.post('/auth/login', (req, res) => {
  const { email, password } = req.body

  if (!email || !password) {
    return res.status(400).json({ detail: 'Email and password are required' })
  }

  // Accept demo credentials
  if (email === 'admin@grengin.com' && password === 'Demo123456!@') {
    ssoSession.creator = null
    enterWorkspace(null)
    return res.json({
      requires_mfa: loginExample.requires_mfa,
      accessToken: loginExample.accessToken,
      refreshToken: loginExample.refreshToken,
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

  const user = ssoUser(provider)
  ssoSession.creator = provider === 'azure' ? user : null
  enterWorkspace(provider)

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

  const user = ssoUser(provider)
  ssoSession.creator = provider === 'azure' ? user : null
  enterWorkspace(provider)

  res.json({
    requires_mfa: false,
    accessToken: loginExample.accessToken,
    refreshToken: loginExample.refreshToken,
    user,
  })
})

export default router
