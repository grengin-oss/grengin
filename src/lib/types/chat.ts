// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

import type { components } from '../../../mock/types/api';
import type { MergedToolResult, ToolCall, ToolResult } from './toolCall';

// Re-export API types
export type Message = components['schemas']['Message'];
export type MessageRole = components['schemas']['MessageRole'];
export type MessagePart = components['schemas']['MessagePart'];
export type Conversation = components['schemas']['Conversation'];
export type ConversationDetail = components['schemas']['ConversationDetail'];
export type ConversationList = components['schemas']['ConversationList'];
export type FileAttachment = components['schemas']['FileAttachment'];

// UI-specific types
export interface BudgetWarningMessage {
  department_id: string;
  budget_available: string;
  action: 'warn' | 'block';
  message: string;
}

export interface McpAuthRequest {
  server_id: string;
  server_name: string;
  tool_name: string;
  authorization_url?: string;
  scopes?: string[];
  status: 'pending' | 'connecting' | 'connected' | 'error';
  error?: string;
  connected_as?: string;
}

/**
 * Server-declared artifact reference, as returned in `parts.artifacts`. This is
 * metadata only — the actual content is fetched from the backend by `id`
 * (GET /artifacts/{id}). The client never derives artifacts by parsing text.
 */
export interface MessageArtifact {
  id: string;
  file_id?: string;
  title?: string;
  content_type?: string;
}

/**
 * Version metadata for a message that has sibling versions (ENGG-459). The
 * backend attaches it to any message that editing or regenerating has branched:
 * `current` is the 0-based index of the shown version, `total` the count, and
 * `message_ids` the ordered ids of every version. To switch, send one of
 * `message_ids` to `PUT /chat/{chatId}/branch` (see `switchBranch`).
 */
export interface MessageVersions {
  current: number;
  total: number;
  message_ids: string[];
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  files?: FileAttachment[];
  timestamp: string;
  isStreaming?: boolean;
  error?: string;
  isEditing?: boolean;
  model?: string | null;
  toolCalls?: ToolCall[];
  toolsResults?: ToolResult[];
  mergedWebSearch?: MergedToolResult | null;
  mcpAuthRequests?: McpAuthRequest[];
  /** Server-declared artifacts attached to this message (from parts.artifacts). */
  artifacts?: MessageArtifact[];
  /**
   * Sibling versions of this message, present once an edit or regenerate has
   * branched it (ENGG-459). Drives the `< 1 / 2 >` switcher; absent or
   * `total <= 1` means a single version, so no switcher is shown.
   */
  versions?: MessageVersions;
  /**
   * Extended-thinking text accumulated from `thinking_delta` stream events.
   * Present only while/after a model that exposes its reasoning has streamed;
   * it is never persisted by the client, so a reloaded conversation has none.
   */
  thinking?: string;
  /** The user stopped this response before it finished. */
  cancelled?: boolean;
  /**
   * Why the turn ended early, as the backend reports it (`stop_reason` on a
   * MessageResponse, or the `response_stopped` stream event): `user_cancelled`,
   * `user_edited`, `provider_error`, `network_error`, `server_error`. Drives the
   * "response was interrupted" banner, and unlike `cancelled` it survives a
   * reload because it comes back from GET /chat/{id}.
   */
  stopReason?: string;
}

export interface StreamEvent {
  event: 'conversation' | 'delta' | 'done' | 'event' | 'message_end' | 'message_start' | 'tool_call' | 'tool_result' | 'artifact' | 'image_generated' | 'mcp_oauth_required' | 'cancelled' | 'error';
  data: any;
}

export interface ChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  conversationId: string | null;
  isTyping: boolean;
}
