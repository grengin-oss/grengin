import type { components } from '../../../mock/types/api';

// Re-export API types
export type Message = components['schemas']['Message'];
export type MessageRole = components['schemas']['MessageRole'];
export type MessagePart = components['schemas']['MessagePart'];
export type Conversation = components['schemas']['Conversation'];
export type ConversationDetail = components['schemas']['ConversationDetail'];
export type ConversationList = components['schemas']['ConversationList'];
export type FileAttachment = components['schemas']['FileAttachment'];

// UI-specific types
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
}

export interface StreamEvent {
  event: 'start' | 'token' | 'set_title' | 'done' | 'error';
  data: any;
}

export interface ChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  conversationId: string | null;
  isTyping: boolean;
}
