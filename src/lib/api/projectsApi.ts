import { request } from './client';
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

export async function listProjects(): Promise<ProjectListResponse> {
  return request<ProjectListResponse>('/projects');
}

export async function getProject(id: string): Promise<Project> {
  return request<Project>(`/projects/${id}`);
}

export async function createProject(payload: CreateProjectPayload): Promise<Project> {
  return request<Project>('/projects', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateProject(id: string, payload: UpdateProjectPayload): Promise<Project> {
  return request<Project>(`/projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteProject(id: string): Promise<void> {
  return request<void>(`/projects/${id}`, {
    method: 'DELETE',
  });
}

export async function shareProject(id: string): Promise<{ shareUrl: string }> {
  return request<{ shareUrl: string }>(`/projects/${id}/share`, {
    method: 'POST',
  });
}

export async function getProjectDetail(id: string): Promise<ProjectDetail> {
  return request<ProjectDetail>(`/projects/${id}/detail`);
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
  return request<ProjectSource>(`/projects/${id}/sources`, {
    method: 'POST',
    body: formData,
    headers: {},
  });
}

export async function deleteProjectSource(projectId: string, sourceId: string): Promise<void> {
  return request<void>(`/projects/${projectId}/sources/${sourceId}`, {
    method: 'DELETE',
  });
}

export async function contributeArtifact(projectId: string, payload: ContributeArtifactPayload): Promise<ProjectSource> {
  return request<ProjectSource>(`/projects/${projectId}/artifacts`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// --- Membership (cross-department sharing) — owner-only on the backend ---

export async function getProjectMembers(projectId: string): Promise<ProjectMember[]> {
  return request<ProjectMember[]>(`/projects/${projectId}/members`);
}

export async function searchProjectMembers(projectId: string, query: string, limit = 20): Promise<ProjectMemberSearchResponse> {
  const q = encodeURIComponent(query);
  return request<ProjectMemberSearchResponse>(`/projects/${projectId}/members/search?q=${q}&limit=${limit}`);
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
  return request<ProjectArtifact[]>(`/projects/${projectId}/artifacts`);
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
