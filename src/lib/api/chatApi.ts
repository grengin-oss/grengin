import type { ConversationDetail, ConversationList, BudgetWarningMessage, McpAuthRequest } from '../types/chat';

import { API_BASE, request, ApiError, parseErrorDetail, apiFetch, handleUnauthorized } from './client';
import { getAccessToken } from '../features/auth';
import {
  cachedLoad,
  clearCacheNamespace,
  makeScopedCacheKey,
  prefetchCachedLoad,
} from '../utils/cache';

export interface ChatSemanticResult {
  message_id: string;
  snippet?: string;
  matched_text?: string;
  distance: number;
}

export type ChatConversationList = ConversationList & {
  limit?: number;
  offset?: number;
  semantic_results?: Record<string, ChatSemanticResult> | null;
};

export interface SendMessageOptions {
  message: string;
  conversationId?: string;
  provider?: string;
  modelName?: string;
  uploadedFiles?: UploadedFile[];
  webSearch?: boolean;
  selectedMcpServers?: string[];
  signal?: AbortSignal;
  onConversationInitialized?: (data: {newConversationId: string}) => void;
  onStreamingStart?: (messageId: string) => void;
  onResponseDelta?: (token: string) => void;
  onBudgetWarning?: (data: BudgetWarningMessage) => void;
  onToolCall?: (toolCall: any) => void;
  onToolResult?: (toolResult: any) => void;
  onArtifact?: (artifact: { id: string; title: string; contentType: string; content: string }) => void;
  onMcpAuthRequired?: (authRequest: McpAuthRequest) => void;
  onDone?: (data: any) => void;
  onError?: (error: ApiError | Error) => void;
}

export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
}

export interface UploadDocumentOptions {
  file: File;
  provider?: string;
}

const CHAT_LIST_CACHE_TTL_MS = 60_000;
const CHAT_DETAIL_CACHE_TTL_MS = 5 * 60_000;
const SETTINGS_CACHE_TTL_MS = 5 * 60_000;

function chatListQuery(params?: {
  offset?: number;
  limit?: number;
  search?: string;
  semantic?: boolean;
  archived?: boolean;
}): string {
  const searchParams = new URLSearchParams();
  if (params?.offset !== undefined) {
    searchParams.set('offset', String(params.offset));
  }
  if (params?.limit !== undefined) {
    searchParams.set('limit', String(params.limit));
  }
  if (params?.search !== undefined && params.search.trim()) {
    searchParams.set('search', params.search);
  }
  if (params?.semantic !== undefined) {
    searchParams.set('semantic', String(params.semantic));
  }
  if (params?.archived !== undefined) {
    searchParams.set('archived', String(params.archived));
  }
  return searchParams.toString();
}

function invalidateChatCache(): void {
  clearCacheNamespace('chat');
}

export async function getChatMcpServers(): Promise<{servers: any[]}> {
  const cacheKey = makeScopedCacheKey('settings', ['chat-mcp-servers']);
  return cachedLoad(cacheKey, () => request<{servers: any[]}>('/mcp-servers', {}), {
    ttlMs: SETTINGS_CACHE_TTL_MS,
  });
}

export async function uploadDocument(options: UploadDocumentOptions): Promise<UploadedFile> {
  const { file, provider = 'openai' } = options;
  
  const base64 = await fileToBase64(file);
  
  const data = await request<any>('/files', {
    method: 'POST',
    body: JSON.stringify({
      attachment: {
        file: base64,
        name: file.name,
        type: file.type,
      },
      provider,
    }),
  });

  return {
    id: data.id || data.file_id,
    name: data.name,
    size: data.size || 0,
    type: data.type,
  };
}

/**
 * Send a message and handle streaming response
 */
export async function sendMessage(options: SendMessageOptions): Promise<void> {
  const { message, conversationId, provider, modelName, uploadedFiles, webSearch, selectedMcpServers, signal, onResponseDelta, onBudgetWarning, onStreamingStart, onConversationInitialized, onToolCall, onToolResult, onArtifact, onMcpAuthRequired, onDone, onError } = options;

  try {
    const token = getAccessToken();
    if (!token) {
      throw new ApiError(401, {
        type: 'rich',
        code: 401,
        description: 'No authentication token available',
        solution: 'Please log in to continue',
        description_key: 'error.auth.no_token.description',
        solution_key: 'error.auth.no_token.solution',
        params: {},
        external_code: null,
      });
    }

    // Build the correct API URL
    const streamUrl = conversationId 
      ? `${API_BASE}/chat/stream/${conversationId}`
      : `${API_BASE}/chat/stream`;
    
    const requestBody = JSON.stringify({
      provider: provider || 'openai',
      model_name: modelName || 'gpt-5.2',
      config: {},
      web_search: webSearch || false,
      selected_tools: [],
      selected_mcp_servers: selectedMcpServers || [],
      messages: [{
        role: 'user',
        content: message,
        files: uploadedFiles || [],
      }],
    });

    let response = await apiFetch(streamUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: requestBody,
      signal,
    });

    // Handle token expiration for streaming requests
    if (response.status === 401) {
      const newToken = await handleUnauthorized();
      if (!newToken) {
        // handleUnauthorized already cleared auth and redirected
        throw new ApiError(401, {
          type: 'rich',
          code: 401,
          description: 'Session expired. Please log in again.',
          solution: 'Please log in again to continue using the application',
          description_key: 'error.auth.invalid_token.description',
          solution_key: 'error.auth.invalid_token.solution',
          params: {},
          external_code: null,
        });
      }

      // Retry the streaming request with new token
      response = await apiFetch(streamUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${newToken}`,
        },
        body: requestBody,
        signal,
      });
    }

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const detail = parseErrorDetail(body);
      throw new ApiError(response.status, detail);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new ApiError(500, {
        type: 'rich',
        code: 500,
        description: 'No response body received',
        solution: 'The server did not return any data. Please try again',
        description_key: 'error.request.no_response_body.description',
        solution_key: 'error.request.no_response_body.solution',
        params: {},
        external_code: null,
      });
    }

    const decoder = new TextDecoder();
    let buffer = '';

    // Accumulate tool call input_text chunks by tool_id
    const toolCallAccumulator = new Map<string, { tool_name: string; tool_id: string; kind: string; input_text: string; input?: { type: string; value: Record<string, unknown> }; status: string }>();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;

        const eventMatch = line.match(/^event: (.+)$/m);
        const dataMatch = line.match(/^data: (.+)$/m);

        if (eventMatch && dataMatch) {
          const raw = eventMatch[1];
          const event = raw.startsWith('"') ? JSON.parse(raw) : raw;
          const data = JSON.parse(dataMatch[1]);
          
          switch (event) {
            case 'conversation':
              invalidateChatCache();
              onConversationInitialized?.({newConversationId: data.id});
              break;
            case 'message_start':
              onStreamingStart?.(data.message_id);
              break;
            case 'budget_warning':
              onBudgetWarning?.(data);
              break;
            case 'delta':
              if (data) {                
                onResponseDelta?.(data.text);
              }
              break;
            case 'tool_call':
              if (data?.tool_call) {
                const tc = data.tool_call;
                const existing = toolCallAccumulator.get(tc.tool_id);

                if (existing) {
                  if (tc.input_text) {
                    existing.input_text += tc.input_text;
                  }
                  if (tc.input) {
                    existing.input = tc.input;
                    existing.status = 'running';
                  }
                  onToolCall?.({ ...existing });
                } else {
                  const newToolCall = {
                    tool_name: tc.tool_name,
                    tool_id: tc.tool_id,
                    kind: tc.kind,
                    input_text: tc.input_text || '',
                    input: tc.input,
                    status: tc.input ? 'running' : 'pending',
                  };
                  toolCallAccumulator.set(tc.tool_id, newToolCall);
                  onToolCall?.(newToolCall);
                }
              }
              break;
            case 'tool_result':
              if (data?.tool_result) {
                onToolResult?.(data.tool_result);
              }
              break;
            case 'artifact':
              if (data) {
                onArtifact?.(data);
              }
              break;
            case 'mcp_oauth_required':
              if (data) {
                onMcpAuthRequired?.({
                  server_id: data.server_id,
                  server_name: data.server_name,
                  tool_name: data.tool_name,
                  authorization_url: data.authorization_url,
                  scopes: data.scopes,
                  status: 'pending',
                });
              }
              break;
            case 'message_end':
              // Handle tokens usage
              break;
            case 'done':
              onDone?.(data);
              break;
            case 'error':
              // Parse the error detail and create an ApiError
              const errorDetail = parseErrorDetail(data);
              const streamError = new ApiError(response.status || 500, errorDetail);
              onError?.(streamError);
              break;
          }
        }
      }
    }

    invalidateChatCache();
  } catch (error) {
    if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
      return;
    }

    // Convert all errors to ApiError for consistent handling
    if (error instanceof ApiError) {
      onError?.(error);
    } else if (error instanceof Error) {
      // Convert generic errors to ApiError
      const apiError = new ApiError(500, error.message);
      onError?.(apiError);
    } else {
      // Fallback for unknown error types
      const apiError = new ApiError(500, {
        type: 'rich',
        code: 500,
        description: 'Failed to send message',
        solution: 'Unable to send your message. Please check your connection and try again',
        description_key: 'error.request.send_message_failed.description',
        solution_key: 'error.request.send_message_failed.solution',
        params: {},
        external_code: null,
      });
      onError?.(apiError);
    }
  }
}

/**
 * Fetch conversation history
 */
export async function getConversation(conversationId: string): Promise<ConversationDetail> {
  const cacheKey = makeScopedCacheKey('chat', ['detail', conversationId]);
  return cachedLoad(cacheKey, () => request<ConversationDetail>(`/chat/${conversationId}`), {
    ttlMs: CHAT_DETAIL_CACHE_TTL_MS,
  });
}

export function prefetchConversation(conversationId: string): void {
  const cacheKey = makeScopedCacheKey('chat', ['detail', conversationId]);
  prefetchCachedLoad(cacheKey, () => request<ConversationDetail>(`/chat/${conversationId}`), {
    ttlMs: CHAT_DETAIL_CACHE_TTL_MS,
  });
}

/**
 * List all conversations
 */
export async function listConversations(params?: {
  offset?: number;
  limit?: number,
  search?: string;
  semantic?: boolean;
  archived?: boolean;
  signal?: AbortSignal;
}): Promise<ChatConversationList> {
  const { signal, ...queryParams } = params ?? {};
  const query = chatListQuery(queryParams);
  const endpoint = `/chat${query ? `?${query}` : ''}`;
  const hasSearch = Boolean(queryParams.search?.trim());

  if (signal || hasSearch) {
    return request<ChatConversationList>(endpoint, { signal });
  }

  const cacheKey = makeScopedCacheKey('chat', ['list', query]);
  return cachedLoad(cacheKey, () => request<ChatConversationList>(endpoint), {
    ttlMs: CHAT_LIST_CACHE_TTL_MS,
  });
}

/**
 * Delete a conversation
 */
export async function deleteConversation(conversationId: string): Promise<void> {
  const response = await request<void>(`/chat/${conversationId}`, { method: 'DELETE' });
  invalidateChatCache();
  return response;
}

/**
 * Search conversations
 */
export async function searchConversations(query: string): Promise<ChatConversationList> {
  return listConversations({
    offset: 0,
    limit: 50,
    search: query,
    semantic: true,
  });
}

export async function cancelChatStream(messageId: string): Promise<void> {
  await request<unknown>(`/chat/stream/${encodeURIComponent(messageId)}/cancel`, {
    method: 'POST',
  });
}

/**
 * Archive a conversation
 */
export async function archiveConversation(conversationId: string, title: string): Promise<ConversationDetail> {
  const conversation = await request<ConversationDetail>(`/chat/${conversationId}`, {
    method: 'PUT',
    body: JSON.stringify({
      archived: true,
      title: title
    }),
  });
  invalidateChatCache();
  return conversation;
}

/**
 * Rename a conversation title
 */
export async function renameConversation(
  conversationId: string,
  payload: { title: string; archived: boolean }
): Promise<ConversationDetail> {
  const response = await request<ConversationDetail>(`/chat/${conversationId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  invalidateChatCache();
  return response;
}

/**
 * Convert a file to base64 string
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      // Remove the data URL prefix (e.g., "data:image/png;base64,")
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
}
