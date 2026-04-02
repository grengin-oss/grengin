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
  status: 'pending' | 'connecting' | 'connected' | 'error';
  error?: string;
  connected_as?: string;
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
}

export interface StreamEvent {
  event: 'conversation' | 'delta' | 'done' | 'event' | 'message_end' | 'message_start' | 'tool_call' | 'tool_result' | 'mcp_oauth_required' | 'error';
  data: any;
}

export interface ChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  conversationId: string | null;
  isTyping: boolean;
}
