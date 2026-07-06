export type ProjectCategory = 'research' | 'planning' | 'code' | 'meetings' | 'onboarding' | 'brainstorms' | 'writing' | 'design';

export interface Project {
  id: string;
  name: string;
  description: string;
  category: ProjectCategory;
  visibility: 'private' | 'team';
  createdAt: string;
  updatedAt: string;
  chatCount: number;
  // Present on the real backend (ProjectResponse); optional for mock compatibility.
  ownerId?: string;
  sourceCount?: number;
  memberCount?: number;
  lastActivityAt?: string | null;
}

export type ProjectRole = 'owner' | 'member';

export interface AddMemberPayload {
  userId: string;
  role?: ProjectRole;
}

export interface ProjectListResponse {
  projects: Project[];
  total: number;
}

export interface CreateProjectPayload {
  name: string;
  description: string;
  category: ProjectCategory;
  visibility: 'private' | 'team';
}

export interface UpdateProjectPayload {
  name?: string;
  description?: string;
  category?: ProjectCategory;
  visibility?: 'private' | 'team';
}

export type SourceOrigin = 'uploaded' | 'artifact';

export interface ProjectSource {
  id: string;
  projectId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  origin: SourceOrigin;
  uploadedAt: string;
  contributedBy?: string;
}

export interface ContributeArtifactPayload {
  title: string;
  content: string;
  contentType: 'text/html' | 'text/markdown';
}

export interface ProjectInstruction {
  id: string;
  projectId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectDetail extends Project {
  instructions: string;
  sources: ProjectSource[];
  chats: ProjectChat[];
}

export interface ProjectChat {
  id: string;
  title: string;
  lastMessage: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  picture: string;
  role: string;
  joinedAt: string;
}

export interface ProjectMemberSearchResult {
  id: string;
  name: string;
  email: string;
  picture: string;
}

export interface ProjectMemberSearchResponse {
  users: ProjectMemberSearchResult[];
}

export interface ProjectArtifact {
  id: string;
  projectId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  origin: string;
  uploadedAt: string;
}
