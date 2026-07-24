import { request } from './client.js';
import type {
  SkillResponse,
  SkillListResponse,
  UserSkillCreateRequest,
  UserSkillUpdateRequest,
  UserSkillListQuery,
  SkillListQuery,
  LinkSkillRequest,
  ConversationSkillResponse,
  KnowledgeAttachment,
} from '../types/skill.js';
import { IMPORT_CONTENT_TYPES } from '../types/skill.js';

function buildQuery(params?: Record<string, unknown> | object): string {
  if (!params) return '';
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      query.set(key, String(value));
    }
  }
  const qs = query.toString();
  return qs ? `?${qs}` : '';
}

/* ------------------------------------------------------------------ *
 * My skills — CRUD over the signed-in user's own skills (/me/skills)  *
 * ------------------------------------------------------------------ */

export async function listMySkills(query?: UserSkillListQuery): Promise<SkillListResponse> {
  return request<SkillListResponse>(`/me/skills${buildQuery(query)}`);
}

export async function getMySkill(id: string): Promise<SkillResponse> {
  return request<SkillResponse>(`/me/skills/${id}`);
}

export async function createMySkill(payload: UserSkillCreateRequest): Promise<SkillResponse> {
  return request<SkillResponse>('/me/skills', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateMySkill(
  id: string,
  payload: UserSkillUpdateRequest,
): Promise<SkillResponse> {
  return request<SkillResponse>(`/me/skills/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteMySkill(id: string): Promise<void> {
  return request<void>(`/me/skills/${id}`, { method: 'DELETE' });
}

/* ------------------------------------------------------------------ *
 * Catalog — browse all skills incl. built-ins (/skills)              *
 * ------------------------------------------------------------------ */

export async function listSkills(query?: SkillListQuery): Promise<SkillListResponse> {
  return request<SkillListResponse>(`/skills${buildQuery(query)}`);
}

export async function getSkill(id: string): Promise<SkillResponse> {
  return request<SkillResponse>(`/skills/${id}`);
}

/* ------------------------------------------------------------------ *
 * Conversation links — attach skills to a conversation              *
 * ------------------------------------------------------------------ */

export async function listConversationSkills(
  conversationId: string,
): Promise<ConversationSkillResponse[]> {
  return request<ConversationSkillResponse[]>(`/conversations/${conversationId}/skills`);
}

export async function linkSkill(
  conversationId: string,
  skillId: string,
): Promise<ConversationSkillResponse> {
  const body: LinkSkillRequest = { skill_id: skillId };
  return request<ConversationSkillResponse>(`/conversations/${conversationId}/skills`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function unlinkSkill(conversationId: string, skillId: string): Promise<void> {
  return request<void>(`/conversations/${conversationId}/skills/${skillId}`, {
    method: 'DELETE',
  });
}

/* ------------------------------------------------------------------ *
 * File import helpers                                                 *
 * ------------------------------------------------------------------ */

/** Read a File's bytes and encode them as base64 (no data: URI prefix). */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.onload = () => {
      const result = String(reader.result);
      // Strip the "data:<mime>;base64," prefix produced by readAsDataURL.
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Build a KnowledgeAttachment from an uploaded `.md` / `.zip` file.
 * Content type is derived from the extension (browsers report inconsistent
 * MIME types for markdown and zip).
 */
export async function fileToKnowledgeAttachment(file: File): Promise<KnowledgeAttachment> {
  const isZip = /\.zip$/i.test(file.name);
  return {
    file_name: file.name,
    content_type: isZip ? IMPORT_CONTENT_TYPES.zip : IMPORT_CONTENT_TYPES.md,
    data: await fileToBase64(file),
  };
}
