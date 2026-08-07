// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

import { Router } from 'express'
import { faker } from '@faker-js/faker'
import onboardingStartExample from '../examples/auth/onboarding-start.response.json' with { type: 'json' }
import onboardingCompleteExample from '../examples/auth/onboarding-complete.response.json' with { type: 'json' }

const router = Router()

// Simple token validation middleware for onboarding
const validateOnboardingToken = (req: any, res: any, next: any) => {
  const token = req.headers['x-onboarding-token']
  if (!token) {
    return res.status(401).json({ detail: 'Onboarding token is required' })
  }
  next()
}

router.post('/onboarding/start', (req, res) => {
  const { license_key, email } = req.body
  if (!license_key || !email) {
    return res.status(400).json({ detail: 'License key and email are required' })
  }
  res.json({
    ...onboardingStartExample,
    token: faker.string.alphanumeric(64),
  })
})

router.get('/onboarding/status', validateOnboardingToken, (req, res) => {
  res.json({
    current_step: 'organization',
    completed_steps: ['start'],
    remaining_steps: ['organization', 'admin', 'providers', 'sso', 'complete'],
  })
})

router.post('/onboarding/organization', validateOnboardingToken, (req, res) => {
  const { name, domain } = req.body
  if (!name || !domain) {
    return res.status(400).json({ detail: 'Organization name and domain are required' })
  }
  res.json({
    id: faker.string.uuid(),
    name,
    domain,
    created_at: new Date().toISOString(),
  })
})

router.post('/onboarding/admin', validateOnboardingToken, (req, res) => {
  const { email, name, password } = req.body
  if (!email || !name || !password) {
    return res.status(400).json({ detail: 'Email, name, and password are required' })
  }
  res.json({
    id: faker.string.uuid(),
    email,
    name,
    role: 'admin',
    is_super_admin: true,
    created_at: new Date().toISOString(),
  })
})

router.post('/onboarding/providers', validateOnboardingToken, (req, res) => {
  const { providers } = req.body
  if (!providers || !Array.isArray(providers)) {
    return res.status(400).json({ detail: 'Providers array is required' })
  }
  res.json({
    configured: providers.map((p: { engine: string }) => ({
      engine: p.engine,
      status: 'configured',
    })),
  })
})

router.post('/onboarding/providers/validate', validateOnboardingToken, (req, res) => {
  const { engine, api_key } = req.body
  if (!engine || !api_key) {
    return res.status(400).json({ detail: 'Engine and API key are required' })
  }
  res.json({
    valid: true,
    message: 'API key validated successfully',
    models_available: 15,
  })
})

router.post('/onboarding/sso', validateOnboardingToken, (req, res) => {
  const { provider_type, client_id, client_secret, issuer_url } = req.body
  if (!provider_type || !client_id || !client_secret || !issuer_url) {
    return res.status(400).json({ detail: 'SSO configuration is incomplete' })
  }
  res.json({
    id: faker.string.uuid(),
    provider_type,
    issuer_url,
    status: 'configured',
    created_at: new Date().toISOString(),
  })
})

router.post('/onboarding/sso/test', validateOnboardingToken, (req, res) => {
  res.json({
    success: true,
    message: 'SSO test successful',
    endpoints_found: {
      authorization: true,
      token: true,
      userinfo: true,
      jwks: true,
    },
  })
})

router.post('/onboarding/complete', validateOnboardingToken, (req, res) => {
  res.json(onboardingCompleteExample)
})

export default router
