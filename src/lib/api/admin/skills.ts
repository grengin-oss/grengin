import { request } from '../client.js';
import type {
  SkillResponse,
  SkillListResponse,
  SkillListQuery,
  SkillCreateRequest,
  SkillUpdateRequest,
} from '../../types/skill.js';

function buildQuery(params?: Record<string, unknown> | object): string {
  if (!params) return '';
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) query.set(key, String(value));
  }
  const qs = query.toString();
  return qs ? `?${qs}` : '';
}

/** Admins list the full skill catalog (built-in + org + department) via /skills. */
export async function listAdminSkills(query?: SkillListQuery): Promise<SkillListResponse> {
  return request<SkillListResponse>(`/skills${buildQuery(query)}`);
}

export async function createAdminSkill(payload: SkillCreateRequest): Promise<SkillResponse> {
  return request<SkillResponse>('/admin/skills', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateAdminSkill(
  id: string,
  payload: SkillUpdateRequest,
): Promise<SkillResponse> {
  return request<SkillResponse>(`/admin/skills/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteAdminSkill(id: string): Promise<void> {
  return request<void>(`/admin/skills/${id}`, { method: 'DELETE' });
}
