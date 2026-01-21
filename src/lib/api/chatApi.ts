import type { StreamEvent, ConversationDetail, ConversationList } from '../types/chat';

import { API_BASE, request, ApiError, parseErrorDetail } from './client';
import { getAccessToken } from '../features/auth';

export interface SendMessageOptions {
  message: string;
  conversationId?: string;
  provider?: string;
  modelName?: string;
  uploadedFiles?: UploadedFile[];
  webSearch?: boolean;
  onConversationInitialized?: (data: {newConversationId: string, isNewConversation: boolean}) => void;
  onStreamingStart?: () => void;
  onResponseDelta?: (token: string) => void;
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

export async function uploadDocument(options: UploadDocumentOptions): Promise<UploadedFile> {
  const { file, provider = 'openai' } = options;
  
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

  const base64 = await fileToBase64(file);
  
  const response = await fetch(`${API_BASE}/files`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      attachment: {
        file: base64,
        name: file.name,
        type: file.type,
      },
      provider,
    }),
  });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const detail = parseErrorDetail(body);
      const apiError = new ApiError(response.status, detail);
      throw apiError;
    }

  const data = await response.json();
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
  const { message, conversationId, provider, modelName, uploadedFiles, webSearch, onResponseDelta, onStreamingStart, onConversationInitialized, onDone, onError } = options;

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
    
    let response = await fetch(streamUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        provider: provider || 'openai',
        model_name: modelName || 'gpt-5.2',
        config: {},
        web_search: webSearch || false,
        selected_tools: [],
        messages: [{
          role: 'user',
          content: message,
          files: uploadedFiles || [],
        }],
      }),
    });

    // Handle token expiration for streaming requests
    if (response.status === 401) {
      // Try to refresh token using the same logic as client.ts
      const refreshToken = localStorage.getItem('grengin_refresh_token');
      if (refreshToken) {
        try {
          const refreshResponse = await fetch(`${API_BASE}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken }),
          });

          if (refreshResponse.ok) {
            const data = await refreshResponse.json();
            // Update tokens in storage
            localStorage.setItem('grengin_access_token', data.accessToken);
            localStorage.setItem('grengin_refresh_token', data.refresh_token);
            localStorage.setItem('grengin_user', JSON.stringify(data.user));

            // Retry the streaming request with new token
            response = await fetch(streamUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${data.accessToken}`,
              },
              body: JSON.stringify({
                provider: provider || 'openai',
                model_name: modelName || 'gpt-5.2',
                config: {},
                web_search: webSearch || false,
                selected_tools: [],
                messages: [{
                  role: 'user',
                  content: message,
                  files: uploadedFiles || [],
                }],
              }),
            });
          } else {
            // Clear auth and redirect
            localStorage.removeItem('grengin_access_token');
            localStorage.removeItem('grengin_refresh_token');
            localStorage.removeItem('grengin_user');
            window.location.href = '/';
            // Throw error to prevent further execution
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
        } catch (error) {
          // Clear auth and redirect
          localStorage.removeItem('grengin_access_token');
          localStorage.removeItem('grengin_refresh_token');
          localStorage.removeItem('grengin_user');
          window.location.href = '/';
          // Throw error to prevent further execution
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
      } else {
        // Clear auth and redirect
        localStorage.removeItem('grengin_access_token');
        localStorage.removeItem('grengin_refresh_token');
        localStorage.removeItem('grengin_user');
        window.location.href = '/';
        // Throw error to prevent further execution
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
          const event = JSON.parse(eventMatch[1]);
          const data = JSON.parse(dataMatch[1]);
          
          switch (event) {
            case 'conversation':
              onConversationInitialized?.({newConversationId: data.id, isNewConversation: data.is_new});
              break;
            case 'message_start':
              onStreamingStart?.();
              break;
            case 'delta':
              if (data) {                
                onResponseDelta?.(data.text);
              }
              break;
            case 'message_end':
              // Handle tokens usage
              break;
            case 'done':
              onDone?.(data);
              break;
            default:
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
export async function listConversations(params?: { offset?: number; limit?: number }): Promise<ConversationList> {
  const searchParams = new URLSearchParams();
  if (params?.offset !== undefined) {
    searchParams.set('offset', String(params.offset));
  }
  if (params?.limit !== undefined) {
    searchParams.set('limit', String(params.limit));
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

    const response = await fetch(`${API_BASE}/chat/${conversationId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        archived: true,
        title: title
      }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const detail = parseErrorDetail(body);
      throw new ApiError(response.status, detail);
    }

    return await response.json();
  } catch (error) {
    // Re-throw ApiError as-is, convert others
    if (error instanceof ApiError) {
      throw error;
    }
    if (error instanceof Error) {
      throw new ApiError(500, error.message);
    } else {
      throw new ApiError(500, {
        type: 'rich',
        code: 500,
        description: 'Failed to archive conversation',
        solution: 'Unable to archive the conversation. Please try again',
        description_key: 'error.request.archive_conversation_failed.description',
        solution_key: 'error.request.archive_conversation_failed.solution',
        params: {},
        external_code: null,
      });
    }
  }
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
