import { http, HttpResponse } from 'msw'
import type { components } from '../types/api.js'
import { API_BASE, requireAuth } from '../lib/index.js'

type UserSettings = components['schemas']['UserSettings']

// In-memory settings store
let userSettings: UserSettings = {
  models: {
    tool_models: {
      default: {
        model_name: 'claude-sonnet-4-5',
        provider: 'anthropic',
      },
      web_search: {
        model_name: 'gpt-4o-mini-search-preview',
        provider: 'openai',
      },
    },
  },
}

export const settingsHandlers = [
  // Get settings
  http.get(`${API_BASE}/settings`, ({ request }) => {
    const authError = requireAuth(request)
    if (authError) return authError

    return HttpResponse.json(userSettings)
  }),

  // Update settings
  http.put(`${API_BASE}/settings`, async ({ request }) => {
    const authError = requireAuth(request)
    if (authError) return authError

    const body = await request.json() as Partial<UserSettings>

    // Deep merge settings
    userSettings = {
      ...userSettings,
      ...body,
      models: {
        ...userSettings.models,
        ...(body.models || {}),
        tool_models: {
          ...userSettings.models?.tool_models,
          ...(body.models?.tool_models || {}),
        },
      },
    }

    return HttpResponse.json(userSettings)
  }),
]
