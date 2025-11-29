/**
 * Grengin API Mock Handlers
 *
 * Usage in your Svelte app:
 *
 * ```typescript
 * import { setupWorker } from 'msw/browser'
 * import { handlers } from 'grengin-api-mocks/frontend'
 *
 * if (import.meta.env.DEV) {
 *   const worker = setupWorker(...handlers)
 *   worker.start()
 * }
 * ```
 */

export { handlers } from './handlers.js'

// Individual handler exports for selective use
export { chatHandlers } from './handlers/chat.js'
export { fileHandlers } from './handlers/files.js'
export { userHandlers } from './handlers/user.js'
export { settingsHandlers } from './handlers/settings.js'
export { modelsHandlers } from './handlers/models.js'
export { healthHandlers } from './handlers/health.js'
export { authHandlers } from './handlers/auth.js'
export { adminHandlers } from './handlers/admin.js'
export { analyticsHandlers } from './handlers/analytics.js'
export { auditHandlers } from './handlers/audit.js'
