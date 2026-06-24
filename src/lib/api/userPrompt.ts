import { request } from './client.js';

export interface UserSystemPrompt {
  prompt_id: string;
  prompt_text: string;
  source: 'user_custom' | 'department_default' | 'system_default';
  variables: string[];
}

export interface UpdateUserPromptPayload {
  custom_prompt_text: string;
  is_active: boolean;
  prompt_id: string;
}

export interface PromptFeedbackPayload {
  comment: string;
  prompt_id: string;
  rating: number;
}

export async function getUserSystemPrompt(): Promise<UserSystemPrompt> {
  return request<UserSystemPrompt>('/me/system-prompt');
}

export async function updateUserSystemPrompt(
  payload: UpdateUserPromptPayload,
): Promise<UserSystemPrompt> {
  return request<UserSystemPrompt>('/me/system-prompt', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteUserSystemPrompt(): Promise<void> {
  return request<void>('/me/system-prompt', {
    method: 'DELETE',
  });
}

export async function submitPromptFeedback(
  payload: PromptFeedbackPayload,
): Promise<void> {
  return request<void>('/me/system-prompt/feedback', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
