import type { StreamEvent, ConversationDetail, ConversationList, BudgetWarningMessage, McpAuthRequest } from '../types/chat';

import { API_BASE, request, ApiError, parseErrorDetail, handleUnauthorized } from './client';
import { getAccessToken } from '../features/auth';

export interface SendMessageOptions {
  message: string;
  conversationId?: string;
  provider?: string;
  modelName?: string;
  uploadedFiles?: UploadedFile[];
  webSearch?: boolean;
  selectedMcpServers?: string[];
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

export async function getChatMcpServers(): Promise<{servers: any[]}> {
  return request<{servers: any[]}>('/mcp-servers', {});
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
  const { message, conversationId, provider, modelName, uploadedFiles, webSearch, selectedMcpServers, onResponseDelta, onBudgetWarning, onStreamingStart, onConversationInitialized, onToolCall, onToolResult, onArtifact, onMcpAuthRequired, onDone, onError } = options;

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

    let response = await fetch(streamUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: requestBody,
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
      response = await fetch(streamUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${newToken}`,
        },
        body: requestBody,
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
  } catch (error) {
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
  return request<ConversationDetail>(`/chat/${conversationId}`);
}

/**
 * List all conversations
 */
export async function listConversations(params?: { offset?: number; limit?: number, search?: string }): Promise<ConversationList> {
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
  const query = searchParams.toString();
  return request<ConversationList>(`/chat${query ? `?${query}` : ''}`);
}

/**
 * Delete a conversation
 */
export async function deleteConversation(conversationId: string): Promise<void> {
  return request<void>(`/chat/${conversationId}`, { method: 'DELETE' });
}

/**
 * Search conversations
 */
export async function searchConversations(query: string): Promise<ConversationList> {
  return request<ConversationList>(`/chat/search?search=${encodeURIComponent(query)}`);
}

/**
 * Archive a conversation
 */
export async function archiveConversation(conversationId: string, title: string): Promise<ConversationDetail> {
  return request<ConversationDetail>(`/chat/${conversationId}`, {
    method: 'PUT',
    body: JSON.stringify({
      archived: true,
      title: title
    }),
  });
}

/**
 * Rename a conversation title
 */
export async function renameConversation(
  conversationId: string,
  payload: { title: string; archived: boolean }
): Promise<ConversationDetail> {
  return request<ConversationDetail>(`/chat/${conversationId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
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
