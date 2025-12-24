import { request } from '../client.js';
import type { AIEngine, AIEngineModels } from '../../admin/types.js';

export async function getAIEngines(): Promise<AIEngine[]> {
  const response = await request<AIEngine[]>('/admin/ai-engines', {
    method: 'GET',
  });
  return response;
}

export async function getAIEngine(engineKey: string): Promise<AIEngine> {
  const response = await request<AIEngine>(`/admin/ai-engines/${engineKey}`, {
    method: 'GET',
  });
  return response;
}

export async function updateAIEngine(
  engineKey: string,
  data: {
    is_enabled?: boolean;
    api_key?: string;
    whitelisted_models?: string[];
    default_model?: string | null;
    is_default?: boolean;
  }
): Promise<AIEngine> {
  const response = await request<AIEngine>(`/admin/ai-engines/${engineKey}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  return response;
}

export async function validateAIEngineKey(
  engineKey: string
): Promise<{ valid: boolean; message: string; models_available?: number }> {
  const response = await request<{ valid: boolean; message: string; models_available?: number }>(
    `/admin/ai-engines/${engineKey}/validate`,
    {
      method: 'POST',
    }
  );
  return response;
}

export async function getAIEngineModels(engineKey: string): Promise<AIEngineModels> {
  const response = await request<AIEngineModels>(`/admin/ai-engines/${engineKey}/models`, {
    method: 'GET',
  });
  return response;
}

export async function addAIEngineKey(engineKey: string, apiKey: string): Promise<AIEngine> {
  const response = await request<AIEngine>(`/admin/ai-engines/${engineKey}/api-key`, {
    method: 'POST',
    body: JSON.stringify({ api_key: apiKey }),
  });
  return response;
}

export async function deleteAIEngineKey(engineKey: string): Promise<AIEngine> {
  const response = await request<AIEngine>(`/admin/ai-engines/${engineKey}/api-key`, {
    method: 'DELETE',
  });
  return response;
}

