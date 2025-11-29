import { http, HttpResponse } from 'msw'
import type { components } from '../types/api.js'
import { API_BASE } from '../lib/index.js'

type ProviderInfo = components['schemas']['ProviderInfo']

const modelsData: { providers: ProviderInfo[] } = {
  providers: [
    {
      key: 'anthropic',
      name: 'Anthropic',
      icon: 'https://assets.anthropic.com/icon.svg',
      models: [
        {
          key: 'claude-sonnet-4-20250514',
          name: 'Claude Sonnet 4',
          context_window: 200000,
          max_output_tokens: 16384,
          supports_streaming: true,
          supports_tools: true,
          supports_vision: true,
          pricing: {
            input: 0.003,
            output: 0.015,
          },
        },
        {
          key: 'claude-sonnet-4-5',
          name: 'Claude 3.5 Sonnet',
          context_window: 200000,
          max_output_tokens: 8192,
          supports_streaming: true,
          supports_tools: true,
          supports_vision: true,
          pricing: {
            input: 0.003,
            output: 0.015,
          },
        },
        {
          key: 'claude-3-opus-20240229',
          name: 'Claude 3 Opus',
          context_window: 200000,
          max_output_tokens: 4096,
          supports_streaming: true,
          supports_tools: true,
          supports_vision: true,
          pricing: {
            input: 0.015,
            output: 0.075,
          },
        },
        {
          key: 'claude-3-haiku-20240307',
          name: 'Claude 3 Haiku',
          context_window: 200000,
          max_output_tokens: 4096,
          supports_streaming: true,
          supports_tools: true,
          supports_vision: true,
          pricing: {
            input: 0.00025,
            output: 0.00125,
          },
        },
      ],
    },
    {
      key: 'openai',
      name: 'OpenAI',
      icon: 'https://openai.com/icon.svg',
      models: [
        {
          key: 'gpt-4o',
          name: 'GPT-4o',
          context_window: 128000,
          max_output_tokens: 16384,
          supports_streaming: true,
          supports_tools: true,
          supports_vision: true,
          pricing: {
            input: 0.0025,
            output: 0.01,
          },
        },
        {
          key: 'gpt-5.1',
          name: 'GPT-4 Turbo',
          context_window: 128000,
          max_output_tokens: 4096,
          supports_streaming: true,
          supports_tools: true,
          supports_vision: true,
          pricing: {
            input: 0.01,
            output: 0.03,
          },
        },
        {
          key: 'gpt-4',
          name: 'GPT-4',
          context_window: 8192,
          max_output_tokens: 4096,
          supports_streaming: true,
          supports_tools: true,
          supports_vision: false,
          pricing: {
            input: 0.03,
            output: 0.06,
          },
        },
        {
          key: 'gpt-3.5-turbo',
          name: 'GPT-3.5 Turbo',
          context_window: 16385,
          max_output_tokens: 4096,
          supports_streaming: true,
          supports_tools: true,
          supports_vision: false,
          pricing: {
            input: 0.0005,
            output: 0.0015,
          },
        },
      ],
    },
    {
      key: 'google',
      name: 'Google',
      icon: 'https://google.com/icon.svg',
      models: [
        {
          key: 'gemini-2.0-flash',
          name: 'Gemini 2.0 Flash',
          context_window: 1000000,
          max_output_tokens: 8192,
          supports_streaming: true,
          supports_tools: true,
          supports_vision: true,
          pricing: {
            input: 0.00010,
            output: 0.00040,
          },
        },
        {
          key: 'gemini-1.5-pro',
          name: 'Gemini 1.5 Pro',
          context_window: 2000000,
          max_output_tokens: 8192,
          supports_streaming: true,
          supports_tools: true,
          supports_vision: true,
          pricing: {
            input: 0.00125,
            output: 0.005,
          },
        },
        {
          key: 'gemini-pro',
          name: 'Gemini Pro',
          context_window: 32760,
          max_output_tokens: 8192,
          supports_streaming: true,
          supports_tools: true,
          supports_vision: false,
          pricing: {
            input: 0.000125,
            output: 0.000375,
          },
        },
        {
          key: 'gemini-pro-vision',
          name: 'Gemini Pro Vision',
          context_window: 16384,
          max_output_tokens: 2048,
          supports_streaming: true,
          supports_tools: false,
          supports_vision: true,
          pricing: {
            input: 0.00025,
            output: 0.000375,
          },
        },
      ],
    },
  ],
}

export const modelsHandlers = [
  http.get(`${API_BASE}/models`, () => {
    return HttpResponse.json(modelsData)
  }),
]
