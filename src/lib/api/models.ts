import { API_BASE } from './client';

export interface ModelInfo {
  key: string;
  name: string;
  context_window?: number;
  max_output_tokens?: number;
  supports_streaming?: boolean;
  supports_tools?: boolean;
  supports_vision?: boolean;
  pricing?: {
    input: number;
    output: number;
  };
  versions?: ModelInfo[];
}

export interface ProviderInfo {
  key: string;
  name: string;
  icon: string;
  models: ModelInfo[];
}

export interface ModelsResponse {
  providers: ProviderInfo[];
}

/**
 * Fetch available models and providers
 */
export async function getModels(): Promise<ModelsResponse> {
  try {
    const response = await fetch(`${API_BASE}/models`, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to fetch models:', error);
    throw error;
  }
}
