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
}

export interface StreamEvent {
  event: 'conversation' | 'delta' | 'done' | 'event' | 'message_end' | 'message_start' | 'tool_call' | 'tool_result' | 'artifact' | 'image_generated' | 'mcp_oauth_required' | 'error';
  data: any;
}

export interface ChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  conversationId: string | null;
  isTyping: boolean;
}
