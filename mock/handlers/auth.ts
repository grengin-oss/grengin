import { http, HttpResponse } from 'msw'
import type { components } from '../types/api.js'
import { API_BASE, requireAuth } from '../lib/index.js'

// Import example data for consistent responses
import onboardingStartExample from '../examples/auth/onboarding-start.response.json' with { type: 'json' }
import onboardingCompleteExample from '../examples/auth/onboarding-complete.response.json' with { type: 'json' }
import loginExample from '../examples/auth/login.response.json' with { type: 'json' }
import loginMfaExample from '../examples/auth/login-mfa-required.response.json' with { type: 'json' }
import mfaSetupExample from '../examples/auth/mfa-setup.response.json' with { type: 'json' }
import ssoInitExample from '../examples/auth/sso-init.response.json' with { type: 'json' }

type BaseUser = components['schemas']['User']

// Extended user type with auth-specific fields not in base OpenAPI spec
interface User extends BaseUser {
  mfa_enabled?: boolean
}

// Local types for auth endpoints not in OpenAPI spec
interface OnboardingStatus {
  session_id: string
  current_step: string
  completed_steps: string[]
  organization_configured: boolean
  admin_created: boolean
  providers_configured: boolean
  sso_configured: boolean
  expires_at: string
}

interface OnboardingStartResponse {
  session_id: string
  session_token: string
  expires_at: string
}

interface AuthTokenResponse {
  accessToken: string
  token_type: string
  expires_in: number
  refresh_token: string
  user: User
}

interface AuthInitResponse {
  auth_url: string
  state: string
}

interface MfaSetupResponse {
  secret: string
  qr_code_url: string
  otpauth_url: string
  recovery_codes: string[]
}

// In-memory stores
let onboardingSession: {
  sessionId: string
  sessionToken: string
  currentStep: string
  completedSteps: string[]
  organizationConfigured: boolean
  adminCreated: boolean
  providersConfigured: boolean
  ssoConfigured: boolean
  expiresAt: string
} | null = null

// Helper to check onboarding token
const validateOnboardingToken = (request: Request): boolean => {
  const token = request.headers.get('X-Onboarding-Token')
  return onboardingSession !== null && token === onboardingSession.sessionToken
}

export const authHandlers = [
  // Start onboarding
  http.post(`${API_BASE}/onboarding/start`, async ({ request }) => {
    const body = await request.json() as any

    if (!body.accept_terms || !body.accept_privacy) {
      return HttpResponse.json(
        { detail: 'You must accept Terms of Service and Privacy Policy' },
        { status: 400 }
      )
    }

    if (onboardingSession) {
      return HttpResponse.json(
        { detail: 'Organization already exists' },
        { status: 409 }
      )
    }

    // Use example data for consistent session values
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    onboardingSession = {
      sessionId: onboardingStartExample.session_id,
      sessionToken: onboardingStartExample.session_token,
      currentStep: 'organization',
      completedSteps: ['welcome'],
      organizationConfigured: false,
      adminCreated: false,
      providersConfigured: false,
      ssoConfigured: false,
      expiresAt,
    }

    const response: OnboardingStartResponse = {
      session_id: onboardingStartExample.session_id,
      session_token: onboardingStartExample.session_token,
      expires_at: expiresAt,
    }

    return HttpResponse.json(response, { status: 201 })
  }),

  // Get onboarding status
  http.get(`${API_BASE}/onboarding/status`, ({ request }) => {
    if (!validateOnboardingToken(request)) {
      return HttpResponse.json(
        { detail: 'Invalid or expired onboarding token' },
        { status: 401 }
      )
    }

    const status: OnboardingStatus = {
      session_id: onboardingSession!.sessionId,
      current_step: onboardingSession!.currentStep as any,
      completed_steps: onboardingSession!.completedSteps as any,
      organization_configured: onboardingSession!.organizationConfigured,
      admin_created: onboardingSession!.adminCreated,
      providers_configured: onboardingSession!.providersConfigured,
      sso_configured: onboardingSession!.ssoConfigured,
      expires_at: onboardingSession!.expiresAt,
    }

    return HttpResponse.json(status)
  }),

  // Set organization details
  http.post(`${API_BASE}/onboarding/organization`, async ({ request }) => {
    if (!validateOnboardingToken(request)) {
      return HttpResponse.json(
        { detail: 'Invalid or expired onboarding token' },
        { status: 401 }
      )
    }

    const body = await request.json() as any

    if (!body.name || !body.domain || !body.company_size || !body.country) {
      return HttpResponse.json(
        { detail: [{ loc: ['body'], msg: 'Missing required fields', type: 'value_error' }] },
        { status: 400 }
      )
    }

    onboardingSession!.organizationConfigured = true
    onboardingSession!.completedSteps.push('organization')
    onboardingSession!.currentStep = 'admin'

    const status: OnboardingStatus = {
      session_id: onboardingSession!.sessionId,
      current_step: onboardingSession!.currentStep as any,
      completed_steps: onboardingSession!.completedSteps as any,
      organization_configured: true,
      admin_created: onboardingSession!.adminCreated,
      providers_configured: onboardingSession!.providersConfigured,
      sso_configured: onboardingSession!.ssoConfigured,
      expires_at: onboardingSession!.expiresAt,
    }

    return HttpResponse.json(status)
  }),

  // Create super admin
  http.post(`${API_BASE}/onboarding/admin`, async ({ request }) => {
    if (!validateOnboardingToken(request)) {
      return HttpResponse.json(
        { detail: 'Invalid or expired onboarding token' },
        { status: 401 }
      )
    }

    const body = await request.json() as any

    if (!body.email || !body.name || !body.password || !body.password_confirmation) {
      return HttpResponse.json(
        { detail: [{ loc: ['body'], msg: 'Missing required fields', type: 'value_error' }] },
        { status: 400 }
      )
    }

    if (body.password !== body.password_confirmation) {
      return HttpResponse.json(
        { detail: [{ loc: ['body', 'password_confirmation'], msg: 'Passwords do not match', type: 'value_error' }] },
        { status: 400 }
      )
    }

    if (body.password.length < 12) {
      return HttpResponse.json(
        { detail: [{ loc: ['body', 'password'], msg: 'Password must be at least 12 characters', type: 'value_error' }] },
        { status: 400 }
      )
    }

    onboardingSession!.adminCreated = true
    onboardingSession!.completedSteps.push('admin')
    onboardingSession!.currentStep = 'providers'

    const status: OnboardingStatus = {
      session_id: onboardingSession!.sessionId,
      current_step: onboardingSession!.currentStep as any,
      completed_steps: onboardingSession!.completedSteps as any,
      organization_configured: onboardingSession!.organizationConfigured,
      admin_created: true,
      providers_configured: onboardingSession!.providersConfigured,
      sso_configured: onboardingSession!.ssoConfigured,
      expires_at: onboardingSession!.expiresAt,
    }

    return HttpResponse.json(status, { status: 201 })
  }),

  // Configure LLM providers
  http.post(`${API_BASE}/onboarding/providers`, async ({ request }) => {
    if (!validateOnboardingToken(request)) {
      return HttpResponse.json(
        { detail: 'Invalid or expired onboarding token' },
        { status: 401 }
      )
    }

    const body = await request.json() as any

    if (!body.providers || body.providers.length === 0) {
      return HttpResponse.json(
        { detail: 'At least one provider is required' },
        { status: 400 }
      )
    }

    onboardingSession!.providersConfigured = true
    onboardingSession!.completedSteps.push('providers')
    onboardingSession!.currentStep = 'sso'

    const status: OnboardingStatus = {
      session_id: onboardingSession!.sessionId,
      current_step: onboardingSession!.currentStep as any,
      completed_steps: onboardingSession!.completedSteps as any,
      organization_configured: onboardingSession!.organizationConfigured,
      admin_created: onboardingSession!.adminCreated,
      providers_configured: true,
      sso_configured: onboardingSession!.ssoConfigured,
      expires_at: onboardingSession!.expiresAt,
    }

    return HttpResponse.json(status)
  }),

  // Validate API key
  http.post(`${API_BASE}/onboarding/providers/validate`, async ({ request }) => {
    if (!validateOnboardingToken(request)) {
      return HttpResponse.json(
        { detail: 'Invalid or expired onboarding token' },
        { status: 401 }
      )
    }

    const body = await request.json() as any

    // Simulate validation - accept any key that starts with sk-
    const valid = body.api_key?.startsWith('sk-') || body.api_key?.length > 10

    return HttpResponse.json({
      valid,
      provider: body.provider,
      available_models: valid ? ['claude-sonnet-4-5', 'claude-3-opus-20240229'] : [],
      error: valid ? null : 'Invalid API key format',
    })
  }),

  // Configure SSO
  http.post(`${API_BASE}/onboarding/sso`, async ({ request }) => {
    if (!validateOnboardingToken(request)) {
      return HttpResponse.json(
        { detail: 'Invalid or expired onboarding token' },
        { status: 401 }
      )
    }

    const body = await request.json() as any

    onboardingSession!.ssoConfigured = body.skip !== true
    onboardingSession!.completedSteps.push('sso')
    onboardingSession!.currentStep = 'complete'

    const status: OnboardingStatus = {
      session_id: onboardingSession!.sessionId,
      current_step: onboardingSession!.currentStep as any,
      completed_steps: onboardingSession!.completedSteps as any,
      organization_configured: onboardingSession!.organizationConfigured,
      admin_created: onboardingSession!.adminCreated,
      providers_configured: onboardingSession!.providersConfigured,
      sso_configured: onboardingSession!.ssoConfigured,
      expires_at: onboardingSession!.expiresAt,
    }

    return HttpResponse.json(status)
  }),

  // Test SSO configuration
  http.post(`${API_BASE}/onboarding/sso/test`, async ({ request }) => {
    if (!validateOnboardingToken(request)) {
      return HttpResponse.json(
        { detail: 'Invalid or expired onboarding token' },
        { status: 401 }
      )
    }

    const body = await request.json() as any

    // Simulate successful SSO test
    return HttpResponse.json({
      success: true,
      message: 'SSO configuration validated successfully',
      discovered_endpoints: {
        authorization_endpoint: `${body.issuer_url}/authorize`,
        token_endpoint: `${body.issuer_url}/token`,
        userinfo_endpoint: `${body.issuer_url}/userinfo`,
        jwks_uri: `${body.issuer_url}/.well-known/jwks.json`,
      },
    })
  }),

  // Complete onboarding
  http.post(`${API_BASE}/onboarding/complete`, async ({ request }) => {
    if (!validateOnboardingToken(request)) {
      return HttpResponse.json(
        { detail: 'Invalid or expired onboarding token' },
        { status: 401 }
      )
    }

    const body = await request.json() as any

    if (!body.confirm_recovery_codes) {
      return HttpResponse.json(
        { detail: 'You must confirm that you have saved the recovery codes' },
        { status: 400 }
      )
    }

    if (!onboardingSession!.organizationConfigured || !onboardingSession!.adminCreated || !onboardingSession!.providersConfigured) {
      return HttpResponse.json(
        { detail: 'Not all onboarding steps have been completed' },
        { status: 400 }
      )
    }

    // Use example data for consistent recovery codes
    const response = {
      success: onboardingCompleteExample.success,
      recovery_codes: onboardingCompleteExample.recovery_codes,
      organization: onboardingCompleteExample.organization,
      super_admin: onboardingCompleteExample.super_admin,
      login_url: onboardingCompleteExample.login_url,
    }

    // Clear onboarding session
    onboardingSession = null

    return HttpResponse.json(response)
  }),

  // Password login
  http.post(`${API_BASE}/auth/login`, async ({ request }) => {
    const body = await request.json() as any

    if (!body.email || !body.password) {
      return HttpResponse.json(
        { detail: 'Email and password are required' },
        { status: 400 }
      )
    }

    // Simulate login - accept demo credentials
    if (body.email === 'admin@grengin.com' && body.password === 'Demo123456!@') {
      return HttpResponse.json({
        requires_mfa: loginExample.requires_mfa,
        accessToken: loginExample.access_token,
        refresh_token: loginExample.refresh_token,
        user: loginExample.user,
      })
    }

    // Simulate MFA required
    if (body.email === 'mfa@grengin.com') {
      return HttpResponse.json({
        requires_mfa: loginMfaExample.requires_mfa,
        mfa_token: loginMfaExample.mfa_token,
      })
    }

    return HttpResponse.json(
      { detail: 'Invalid email or password' },
      { status: 401 }
    )
  }),

  // Initiate SSO login - redirect to OAuth provider
  http.get(`${API_BASE}/auth/:provider`, ({ params, request }) => {
    const { provider } = params
    const url = new URL(request.url)
    const redirectUri = url.searchParams.get('redirect_uri') || 'http://localhost:5173/auth/callback'

    const validProviders = ['google', 'azure', 'keycloak']
    if (!validProviders.includes(provider as string)) {
      return HttpResponse.json(
        { detail: 'Invalid provider or configuration' },
        { status: 400 }
      )
    }

    // Generate mock OAuth code and state
    const code = Math.random().toString(36).substring(2, 15)
    const state = ssoInitExample.state

    // Build callback URL that points to the frontend callback page
    // This simulates what an OAuth provider would do
    const callbackUrl = new URL(redirectUri)
    callbackUrl.searchParams.set('code', code)
    callbackUrl.searchParams.set('state', state)

    // Return 303 redirect to simulate OAuth provider redirecting back to app
    return new HttpResponse(null, {
      status: 303,
      headers: {
        'Location': callbackUrl.toString(),
      },
    })
  }),

  // OAuth callback - exchange code for tokens
  http.get(`${API_BASE}/auth/:provider/callback`, ({ request }) => {
    const url = new URL(request.url)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    const error = url.searchParams.get('error')

    if (error) {
      return HttpResponse.json(
        { detail: error },
        { status: 400 }
      )
    }

    if (!code || !state) {
      return HttpResponse.json(
        { detail: 'Missing code or state parameter' },
        { status: 400 }
      )
    }

    // Return LoginResponse format matching the API client
    const response = {
      requires_mfa: false,
      accessToken: loginExample.access_token,
      refresh_token: loginExample.refresh_token,
      user: loginExample.user as User,
    }

    return HttpResponse.json(response)
  }),

  // Setup MFA
  http.post(`${API_BASE}/auth/mfa/setup`, ({ request }) => {
    const authError = requireAuth(request)
    if (authError) return authError

    const response: MfaSetupResponse = {
      secret: mfaSetupExample.secret,
      qr_code_url: mfaSetupExample.qr_code_url,
      otpauth_url: mfaSetupExample.otpauth_url,
      recovery_codes: mfaSetupExample.recovery_codes,
    }

    return HttpResponse.json(response)
  }),

  // Verify MFA
  http.post(`${API_BASE}/auth/mfa/verify`, async ({ request }) => {
    const body = await request.json() as any

    if (!body.code || body.code.length !== 6) {
      return HttpResponse.json(
        { detail: 'Invalid MFA code' },
        { status: 401 }
      )
    }

    // Accept any 6-digit code for mock
    const response: AuthTokenResponse = {
      accessToken: loginExample.access_token,
      token_type: 'Bearer',
      expires_in: loginExample.expires_in,
      refresh_token: loginExample.refresh_token,
      user: { ...loginExample.user, mfa_enabled: true } as User,
    }

    return HttpResponse.json(response)
  }),

  // MFA recovery
  http.post(`${API_BASE}/auth/mfa/recovery`, async ({ request }) => {
    const body = await request.json() as any

    if (!body.recovery_code || !body.mfa_token) {
      return HttpResponse.json(
        { detail: 'Recovery code and MFA token are required' },
        { status: 401 }
      )
    }

    return HttpResponse.json({
      access_token: loginExample.access_token,
      refresh_token: loginExample.refresh_token,
      remaining_codes: 9,
      user: loginExample.user,
    })
  }),

  // Regenerate recovery codes
  http.post(`${API_BASE}/auth/mfa/regenerate-codes`, async ({ request }) => {
    const authError = requireAuth(request)
    if (authError) return authError

    const body = await request.json() as any

    if (!body.current_password) {
      return HttpResponse.json(
        { detail: 'Current password is required' },
        { status: 401 }
      )
    }

    return HttpResponse.json({
      recovery_codes: mfaSetupExample.recovery_codes,
    })
  }),

  // Forgot password
  http.post(`${API_BASE}/auth/password/forgot`, async () => {
    // Always return success for security
    return HttpResponse.json({
      message: 'If an account exists with this email, a reset link has been sent.',
    })
  }),

  // Reset password
  http.post(`${API_BASE}/auth/password/reset`, async ({ request }) => {
    const body = await request.json() as any

    if (!body.token || !body.password || !body.password_confirmation) {
      return HttpResponse.json(
        { detail: 'Token, password, and confirmation are required' },
        { status: 400 }
      )
    }

    if (body.password !== body.password_confirmation) {
      return HttpResponse.json(
        { detail: 'Passwords do not match' },
        { status: 400 }
      )
    }

    if (body.password.length < 12) {
      return HttpResponse.json(
        { detail: 'Password must be at least 12 characters' },
        { status: 400 }
      )
    }

    return HttpResponse.json({
      message: 'Password has been reset successfully',
    })
  }),

  // Change password
  http.post(`${API_BASE}/auth/password/change`, async ({ request }) => {
    const authError = requireAuth(request)
    if (authError) return authError

    const body = await request.json() as any

    if (!body.current_password || !body.new_password || !body.new_password_confirmation) {
      return HttpResponse.json(
        { detail: 'Current password, new password, and confirmation are required' },
        { status: 400 }
      )
    }

    if (body.new_password !== body.new_password_confirmation) {
      return HttpResponse.json(
        { detail: 'Passwords do not match' },
        { status: 400 }
      )
    }

    if (body.new_password.length < 12) {
      return HttpResponse.json(
        { detail: 'Password must be at least 12 characters' },
        { status: 400 }
      )
    }

    return HttpResponse.json({
      message: 'Password changed successfully',
    })
  }),

  // Refresh token
  http.post(`${API_BASE}/auth/refresh`, async ({ request }) => {
    const body = await request.json() as any

    if (!body.refresh_token) {
      return HttpResponse.json(
        { detail: 'Refresh token is required' },
        { status: 401 }
      )
    }

    const response: AuthTokenResponse = {
      accessToken: loginExample.access_token,
      token_type: 'Bearer',
      expires_in: loginExample.expires_in,
      refresh_token: loginExample.refresh_token,
      user: loginExample.user as User,
    }

    return HttpResponse.json(response)
  }),

  // Logout
  http.post(`${API_BASE}/auth/logout`, ({ request }) => {
    const authError = requireAuth(request)
    if (authError) return authError

    return new HttpResponse(null, { status: 204 })
  }),
]
