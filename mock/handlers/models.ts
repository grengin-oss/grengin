import { http, HttpResponse } from 'msw'
import { API_BASE } from '../lib/index.js'
import modelsExample from '../examples/models/providers.response.json' with { type: 'json' }

export const modelsHandlers = [
  http.get(`${API_BASE}/models`, () => {
    return HttpResponse.json(modelsExample)
  }),
]
