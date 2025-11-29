import { http, HttpResponse } from 'msw'
import type { components } from '../types/api.js'
import { API_BASE } from '../lib/index.js'

type HealthResponse = components['schemas']['HealthResponse']

export const healthHandlers = [
  http.get(`${API_BASE}/health`, () => {
    const response: HealthResponse = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'up',
        redis: 'up',
        llm_providers: {
          anthropic: 'up',
          openai: 'up',
          google: 'up',
        },
      },
      version: '1.0.0',
    }
    return HttpResponse.json(response)
  }),
]
