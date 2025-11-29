/**
 * Shared authentication helpers for mock API handlers
 */
import { HttpResponse } from 'msw'

/**
 * Check if request has valid Bearer token authorization
 * Returns an error response if unauthorized, null if authorized
 */
export const requireAuth = (request: Request) => {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return HttpResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  }
  return null
}

/**
 * Check if request has valid Bearer token and admin role
 * For mock purposes, we assume all authenticated requests have admin access
 * Returns an error response if unauthorized, null if authorized
 */
export const requireAdmin = (request: Request) => {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return HttpResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  }
  // For mock, we assume all authenticated requests have admin access
  return null
}
