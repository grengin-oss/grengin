import { request } from '../client.js';

export interface RolePrompt {
  id: string;
  name: string;
  prompt_text: string;
  role_id: string;
  is_system: boolean;
  variables: string[];
  usage_count: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CreateRolePromptPayload {
  name: string;
  prompt_text: string;
  role_id: string;
  is_system: boolean;
  variables: string[];
}

export interface UpdateRolePromptPayload {
  name: string;
  prompt_text: string;
  role_id: string;
  is_system: boolean;
  variables: string[];
}

export async function getRolePrompts(params?: {
  role_id?: string;
  is_system?: boolean;
}): Promise<RolePrompt[]> {
  const searchParams = new URLSearchParams();
  if (params?.role_id) searchParams.set('role_id', params.role_id);
  if (params?.is_system !== undefined) searchParams.set('is_system', String(params.is_system));
  const query = searchParams.toString();
  return request<RolePrompt[]>(`/admin/role-prompts${query ? `?${query}` : ''}`);
}

export async function getRolePrompt(promptId: string): Promise<RolePrompt> {
  return request<RolePrompt>(`/admin/role-prompts/${promptId}`);
}

export async function createRolePrompt(payload: CreateRolePromptPayload): Promise<RolePrompt> {
  return request<RolePrompt>('/admin/role-prompts', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateRolePrompt(
  promptId: string,
  payload: UpdateRolePromptPayload,
): Promise<RolePrompt> {
  return request<RolePrompt>(`/admin/role-prompts/${promptId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteRolePrompt(promptId: string): Promise<void> {
  return request<void>(`/admin/role-prompts/${promptId}`, {
    method: 'DELETE',
  });
}
