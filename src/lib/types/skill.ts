// Skills system types — mirrors the /me/skills, /skills and /conversations/{id}/skills API.
// A "skill" attaches configurable behaviours to a conversation:
//   - instructions              → Markdown instructions injected into the system prompt
//   - tools_config.web_search   → web-search toggle
//   - tools_config.mcp_server_ids → tool grants (MCP servers)
//   - knowledge_attachment      → optional imported file (.md single / .zip bundle)
// Built-in skills (is_builtin) are shipped by the platform and are read-only. The
// first-class built-in "Artifacts" skill gates Anthropic-style artifact generation.

/** Identifier of the platform built-in that gates artifact generation. */
export const ARTIFACTS_SKILL_IDENTIFIER = 'artifacts';

/** Skill names are kebab-case slugs, e.g. "research-assistant". */
export const KEBAB_CASE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const isKebabCase = (value: string): boolean => KEBAB_CASE_RE.test(value.trim());

/** Coerce arbitrary text into a kebab-case slug (used to pre-fill names on import). */
export const toKebabCase = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

/* ------------------------------------------------------------------ *
 * File import (Import File flow)                                      *
 * ------------------------------------------------------------------ */

/** Max size of an imported skill file, in bytes (10 MB). */
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

export const IMPORT_CONTENT_TYPES = {
  md: 'text/markdown',
  zip: 'application/zip',
} as const;

export type ImportContentType = (typeof IMPORT_CONTENT_TYPES)[keyof typeof IMPORT_CONTENT_TYPES];

/**
 * A file attachment uploaded with a skill create/update request.
 * `content_type` must be `text/markdown` (single .md) or `application/zip`
 * (a bundle of .md files). `data` is the base64-encoded file bytes.
 */
export interface KnowledgeAttachment {
  file_name: string;
  content_type: string;
  /** base64-encoded file bytes (no data: URI prefix). */
  data: string;
}

/** A knowledge file stored against a skill, as returned by the API. */
export interface SkillKnowledgeInfo {
  id: string;
  file_name: string;
  char_count: number;
  storage_mode: string;
  created_at: string;
}

export interface SkillToolsConfig {
  /** IDs of MCP servers granted to the skill (tool grants). */
  mcp_server_ids: string[];
  /** Whether the skill enables web search. */
  web_search: boolean;
}

/** A skill as returned by the API (GET /me/skills, /skills, /skills/{id}). */
export interface SkillResponse {
  id: string;
  /** Stable slug, e.g. "artifacts". Unique per owner/department. */
  identifier: string;
  name: string;
  description: string | null;
  /** Emoji or short avatar string shown on the skill card. */
  avatar: string | null;
  /** Markdown instructions injected when the skill is active. */
  instructions: string | null;
  tools_config: SkillToolsConfig;
  /** Files imported with the skill (.md / .zip bundle contents). */
  knowledge_files?: SkillKnowledgeInfo[];
  is_active: boolean;
  /** Platform-shipped skill — cannot be edited or deleted by users. */
  is_builtin: boolean;
  user_id: string | null;
  department_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SkillListResponse {
  skills: SkillResponse[];
  total: number;
  limit: number;
  offset: number;
}

export interface UserSkillListQuery {
  is_active?: boolean | null;
  limit?: number | null;
  offset?: number | null;
}

export interface SkillListQuery extends UserSkillListQuery {
  department_id?: string | null;
}

/** POST /me/skills */
export interface UserSkillCreateRequest {
  name: string;
  description?: string | null;
  avatar?: string | null;
  instructions?: string | null;
  tools_config?: SkillToolsConfig | null;
  knowledge_attachment?: KnowledgeAttachment | null;
}

/** PUT /me/skills/{id} — all fields optional (partial update). */
export interface UserSkillUpdateRequest {
  name?: string | null;
  description?: string | null;
  avatar?: string | null;
  instructions?: string | null;
  is_active?: boolean | null;
  tools_config?: SkillToolsConfig | null;
  knowledge_attachment?: KnowledgeAttachment | null;
}

/** POST /admin/skills — org/department skill (admin only). */
export interface SkillCreateRequest {
  identifier: string;
  name: string;
  description?: string | null;
  avatar?: string | null;
  department_id?: string | null;
  instructions?: string | null;
  tools_config?: SkillToolsConfig | null;
  knowledge_attachment?: KnowledgeAttachment | null;
}

/** PUT /admin/skills/{id} */
export interface SkillUpdateRequest {
  name?: string | null;
  description?: string | null;
  avatar?: string | null;
  department_id?: string | null;
  instructions?: string | null;
  is_active?: boolean | null;
  tools_config?: SkillToolsConfig | null;
  knowledge_attachment?: KnowledgeAttachment | null;
}

/** POST /conversations/{id}/skills */
export interface LinkSkillRequest {
  skill_id: string;
}

/** GET /conversations/{id}/skills */
export interface ConversationSkillResponse {
  id: string;
  conversation_id: string;
  skill: SkillResponse;
  created_at: string;
}

export const emptyToolsConfig = (): SkillToolsConfig => ({
  mcp_server_ids: [],
  web_search: false,
});

export const isArtifactsSkill = (skill: Pick<SkillResponse, 'identifier'>): boolean =>
  skill.identifier === ARTIFACTS_SKILL_IDENTIFIER;
