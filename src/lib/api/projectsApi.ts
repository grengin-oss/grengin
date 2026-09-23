// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

import { request } from './client';
import { camelizeKeys } from '../utils/camelize';
import type {
  Project,
  ProjectListResponse,
  CreateProjectPayload,
  UpdateProjectPayload,
  ProjectDetail,
  ProjectSource,
  ContributeArtifactPayload,
  AddMemberPayload,
  ProjectMember,
  ProjectMemberSearchResponse,
  ProjectArtifact,
} from '../types/project';

/*
 * The project endpoints answer in snake_case on the real backend
 * (`updated_at`, `chat_count`, `last_activity_at`) while the mock server
 * answers in camelCase — and the UI types are camelCase throughout. Every
 * response used to be cast straight to those types, so against the real API
 * each multi-word field arrived `undefined`: the card's date rendered
 * "Invalid Date" and its chat-count badge silently never appeared.
 *
 * `camelizeKeys` handles both shapes, so the mock keeps working unchanged.
 */

export async function listProjects(): Promise<ProjectListResponse> {
  return camelizeKeys<ProjectListResponse>(await request('/projects'));
}

export async function getProject(id: string): Promise<Project> {
  return camelizeKeys<Project>(await request(`/projects/${id}`));
}

export async function createProject(payload: CreateProjectPayload): Promise<Project> {
  return camelizeKeys<Project>(
    await request('/projects', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  );
}

export async function updateProject(id: string, payload: UpdateProjectPayload): Promise<Project> {
  return camelizeKeys<Project>(
    await request(`/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  );
}

export async function deleteProject(id: string): Promise<void> {
  return request<void>(`/projects/${id}`, {
    method: 'DELETE',
  });
}

export async function shareProject(id: string): Promise<{ shareUrl: string }> {
  return camelizeKeys<{ shareUrl: string }>(
    await request(`/projects/${id}/share`, { method: 'POST' }),
  );
}

export async function getProjectDetail(id: string): Promise<ProjectDetail> {
  return camelizeKeys<ProjectDetail>(await request(`/projects/${id}/detail`));
}

export async function updateProjectInstructions(id: string, instructions: string): Promise<void> {
  return request<void>(`/projects/${id}/instructions`, {
    method: 'PUT',
    body: JSON.stringify({ instructions }),
  });
}

export async function uploadProjectSource(id: string, file: File): Promise<ProjectSource> {
  const formData = new FormData();
  formData.append('file', file);
  return camelizeKeys<ProjectSource>(
    await request(`/projects/${id}/sources`, {
      method: 'POST',
      body: formData,
      headers: {},
    }),
  );
}

export async function deleteProjectSource(projectId: string, sourceId: string): Promise<void> {
  return request<void>(`/projects/${projectId}/sources/${sourceId}`, {
    method: 'DELETE',
  });
}

export async function contributeArtifact(projectId: string, payload: ContributeArtifactPayload): Promise<ProjectSource> {
  return camelizeKeys<ProjectSource>(
    await request(`/projects/${projectId}/artifacts`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  );
}

// --- Membership (cross-department sharing) — owner-only on the backend ---

export async function getProjectMembers(projectId: string): Promise<ProjectMember[]> {
  return camelizeKeys<ProjectMember[]>(await request(`/projects/${projectId}/members`));
}

export async function searchProjectMembers(projectId: string, query: string, limit = 20): Promise<ProjectMemberSearchResponse> {
  const q = encodeURIComponent(query);
  return camelizeKeys<ProjectMemberSearchResponse>(
    await request(`/projects/${projectId}/members/search?q=${q}&limit=${limit}`),
  );
}

export async function addProjectMember(projectId: string, payload: AddMemberPayload): Promise<void> {
  await request<void>(`/projects/${projectId}/members`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function removeProjectMember(projectId: string, userId: string): Promise<void> {
  await request<void>(`/projects/${projectId}/members/${userId}`, {
    method: 'DELETE',
  });
}

// --- Artifacts ---

export async function getProjectArtifacts(projectId: string): Promise<ProjectArtifact[]> {
  return camelizeKeys<ProjectArtifact[]>(await request(`/projects/${projectId}/artifacts`));
}

// --- Conversation ↔ project linking (a chat can reference many projects) ---

export async function linkProjectToConversation(conversationId: string, projectId: string): Promise<void> {
  await request<void>(`/conversations/${conversationId}/projects`, {
    method: 'POST',
    body: JSON.stringify({ projectId }),
  });
}

export async function unlinkProjectFromConversation(conversationId: string, projectId: string): Promise<void> {
  await request<void>(`/conversations/${conversationId}/projects/${projectId}`, {
    method: 'DELETE',
  });
}

// --- Project MCP Servers ---

export interface ProjectMcpServerEntry {
  addedAt: string;
  description: string;
  id: string;
  name: string;
  serverId: string;
}

export async function getProjectMcpServers(projectId: string): Promise<ProjectMcpServerEntry[]> {
  return camelizeKeys<ProjectMcpServerEntry[]>(
    await request(`/projects/${projectId}/mcp-servers`),
  );
}

export async function enableProjectMcpServer(projectId: string, serverId: string): Promise<void> {
  await request<void>(`/projects/${projectId}/mcp-servers`, {
    method: 'POST',
    body: JSON.stringify({ serverId }),
  });
}

export async function disableProjectMcpServer(projectId: string, serverId: string): Promise<void> {
  await request<void>(`/projects/${projectId}/mcp-servers/${serverId}`, {
    method: 'DELETE',
  });
}
