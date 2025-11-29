/**
 * Combined MSW handlers for all API endpoints
 */
import { chatHandlers } from './handlers/chat.js'
import { fileHandlers } from './handlers/files.js'
import { userHandlers } from './handlers/user.js'
import { settingsHandlers } from './handlers/settings.js'
import { modelsHandlers } from './handlers/models.js'
import { healthHandlers } from './handlers/health.js'
import { authHandlers } from './handlers/auth.js'
import { adminHandlers } from './handlers/admin.js'
import { analyticsHandlers } from './handlers/analytics.js'
import { auditHandlers } from './handlers/audit.js'

export const handlers = [
  ...healthHandlers,
  ...authHandlers,
  ...userHandlers,
  ...chatHandlers,
  ...fileHandlers,
  ...settingsHandlers,
  ...modelsHandlers,
  ...adminHandlers,
  ...analyticsHandlers,
  ...auditHandlers,
]
