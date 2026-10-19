// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

import type { StreamEvent, ConversationDetail, ConversationList, BudgetWarningMessage, McpAuthRequest } from '../types/chat';

import { API_BASE, request, ApiError, parseErrorDetail, handleUnauthorized } from './client';
import { getAccessToken } from '../features/auth';

/**
 * The callbacks and abort signal shared by every streaming chat request —
 * sending a new message, editing one, or regenerating an answer. They all speak
 * the same SSE protocol (see `streamChat`), so they share this callback set;
 * only the URL, HTTP method and request body differ.
 */
export interface ChatStreamCallbacks {
  onConversationInitialized?: (data: {newConversationId: string}) => void;
  /**
   * The assistant turn has started. `messageId` is the new assistant message id;
   * `userMessageId`, when the backend sends it on `message_start`, is the server
   * id of the user message that triggered this turn — the client swaps its
   * temporary id for this so the message can be edited immediately (ENGG-459).
   */
  onStreamingStart?: (messageId: string, userMessageId?: string) => void;
  onResponseDelta?: (token: string) => void;
  /** Extended-thinking text, streamed before (and between) the visible answer. */
  onThinkingDelta?: (token: string) => void;
  onBudgetWarning?: (data: BudgetWarningMessage) => void;
  onToolCall?: (toolCall: any) => void;
  onToolResult?: (toolResult: any) => void;
  onArtifact?: (artifact: { id: string; title: string; contentType: string; content: string; streaming?: boolean }) => void;
  onImageGenerated?: (image: ImageGeneratedEvent) => void;
  onMcpAuthRequired?: (authRequest: McpAuthRequest) => void;
  /**
   * The generation was stopped before it finished — by the server after
   * `cancelMessageStream()` (`cancelled` event), or locally when `signal`
   * aborted the request. `onDone` still follows, as it does on the wire.
   */
  onCancelled?: () => void;
  /**
   * The turn was stopped, with the reason the backend gives on the
   * `response_stopped` event (`user_cancelled`, `provider_error`, …). Fires
   * alongside `onCancelled` for a user stop; use it to persist the reason.
   */
  onResponseStopped?: (stopReason: string) => void;
  onDone?: (data: any) => void;
  onError?: (error: ApiError | Error) => void;
  /** Aborts the stream request locally; prefer `cancelMessageStream()` once a message id is known. */
  signal?: AbortSignal;
}

/** The parts of a `ChatInput` body the UI supplies for a send/edit/regenerate. */
export interface ChatStreamInput {
  message: string;
  provider?: string;
  modelName?: string;
  uploadedFiles?: UploadedFile[];
  webSearch?: boolean;
  selectedMcpServers?: string[];
}

export interface SendMessageOptions extends ChatStreamCallbacks, ChatStreamInput {
  conversationId?: string;
}

export type EditMessageOptions = ChatStreamCallbacks & ChatStreamInput;

export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
}

/**
 * Payload of the `image_generated` SSE event. Emitted by the chat stream when a
 * selected image model finishes generating (or editing) an image. The image is
 * stored as a regular file — `file_id` is downloaded and rendered inline in the
 * assistant message using the existing file rendering.
 */
export interface ImageGeneratedEvent {
  file_id: string;
  content_type: string;
  cost?: number;
  message_id?: string;
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
 * Ask the server to stop generating an assistant message. The open stream then
 * emits `cancelled` followed by `done` and closes, so the caller keeps reading
 * it rather than aborting.
 */
export async function cancelMessageStream(messageId: string): Promise<void> {
  await request<void>(`/chat/stream/${encodeURIComponent(messageId)}/cancel`, {
    method: 'POST',
  });
}

/**
 * Shape a `ChatInput` request body from the UI's send/edit options. Send,
 * edit and regenerate all post this same body — only the URL and method differ.
 */
function buildChatInput(input: ChatStreamInput) {
  return {
    provider: input.provider || 'openai',
    model_name: input.modelName || 'gpt-5.2',
    config: {},
    web_search: input.webSearch || false,
    selected_tools: [] as string[],
    selected_mcp_servers: input.selectedMcpServers || [],
    messages: [{
      role: 'user',
      content: input.message,
      files: input.uploadedFiles || [],
    }],
  };
}

/**
 * Open an SSE chat stream and dispatch its events to the given callbacks. This
 * is the one SSE parser; `sendMessage`, `editMessageStream` and
 * `regenerateMessageStream` all funnel through it, passing their own URL,
 * method and body (ticket: "pass the URL and method as parameters instead of
 * copying the SSE parser"). It keeps the raw `fetch()` + one-shot 401 retry
 * (the CLAUDE.md streaming exception), since `request()` cannot stream.
 */
async function streamChat(
  url: string,
  method: string,
  body: unknown,
  options: ChatStreamCallbacks,
): Promise<void> {
  const { onResponseDelta, onBudgetWarning, onThinkingDelta, onStreamingStart, onConversationInitialized, onToolCall, onToolResult, onArtifact, onImageGenerated, onMcpAuthRequired, onCancelled, onResponseStopped, onDone, onError, signal } = options;

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

    const requestBody = JSON.stringify(body);

    let response = await fetch(url, {
      method,
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
      response = await fetch(url, {
        method,
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

    // Accumulate streamed artifact content chunks by artifact id. The backend
    // streams artifacts as artifact_start -> artifact_delta* -> artifact_end
    // (then artifact_saved with the persisted file id).
    const artifactAccumulator = new Map<string, { id: string; title: string; contentType: string; content: string }>();

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
              onStreamingStart?.(data.message_id, data.user_message_id);
              break;
            case 'budget_warning':
              onBudgetWarning?.(data);
              break;
            case 'delta':
              if (data) {                
                onResponseDelta?.(data.text);
              }
              break;
            /*
             * Envelope form: `event: "event"` with the real payload nested under
             * `data.event`, discriminated by `event_type` —
             *   data: {"event":{"event_type":"thinking_delta","text":"."}}
             * Unwrapped here and dispatched alongside the flat events above, so
             * both wire shapes reach the same callbacks. Unknown `event_type`s
             * are ignored rather than treated as an error: the backend may add
             * more of them, and an older client should stay quiet, not break.
             */
            case 'event': {
              const inner = data?.event;
              if (!inner) break;
              switch (inner.event_type) {
                case 'thinking_delta':
                  if (typeof inner.text === 'string' && inner.text) {
                    onThinkingDelta?.(inner.text);
                  }
                  break;
                case 'delta':
                case 'text_delta':
                  if (typeof inner.text === 'string' && inner.text) {
                    onResponseDelta?.(inner.text);
                  }
                  break;
                default:
                  // Dev-only: an event_type the client drops on the floor is
                  // invisible otherwise, which makes "the UI never appeared"
                  // impossible to tell apart from "the backend never sent it".
                  if (import.meta.env?.DEV) {
                    console.warn('[chat stream] unhandled event_type:', inner.event_type, inner);
                  }
              }
              break;
            }
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
              // Legacy single-shot artifact event (full payload at once).
              if (data) {
                onArtifact?.(data);
              }
              break;
            case 'artifact_start':
              if (data?.id) {
                const started = {
                  id: data.id,
                  title: data.title || 'Artifact',
                  contentType: data.contentType || data.content_type || 'text/html',
                  content: '',
                };
                artifactAccumulator.set(data.id, started);
                onArtifact?.({ ...started, streaming: true });
              }
              break;
            case 'artifact_delta':
              if (data?.id) {
                const acc = artifactAccumulator.get(data.id) || {
                  id: data.id,
                  title: 'Artifact',
                  contentType: 'text/html',
                  content: '',
                };
                acc.content += data.chunk || '';
                artifactAccumulator.set(data.id, acc);
                onArtifact?.({ ...acc, streaming: true });
              }
              break;
            case 'artifact_end':
              if (data?.id) {
                const acc = artifactAccumulator.get(data.id);
                if (acc) onArtifact?.({ ...acc, streaming: false });
              }
              break;
            case 'artifact_saved':
              if (data?.id) {
                const acc = artifactAccumulator.get(data.id);
                if (acc) {
                  onArtifact?.({
                    ...acc,
                    title: data.title || acc.title,
                    contentType: data.content_type || acc.contentType,
                    streaming: false,
                  });
                }
              }
              break;
            case 'image_generated':
              // An image model finished generating/editing an image. The image
              // is a regular file (data.file_id) rendered inline in the message.
              if (data?.file_id) {
                onImageGenerated?.({
                  file_id: data.file_id,
                  content_type: data.content_type || 'image/png',
                  cost: data.cost,
                  message_id: data.message_id,
                });
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
            case 'cancelled':
              onCancelled?.();
              break;
            // The turn was stopped — carries the reason (`stop_reason`). For a
            // user stop it follows `cancelled`; for a mid-stream failure it
            // follows `ai_error`. `stream_finished` is the usage summary that
            // closes a stopped turn, handled like `message_end`.
            case 'response_stopped':
              if (data?.stop_reason) onResponseStopped?.(data.stop_reason);
              break;
            case 'stream_finished':
              break;
            case 'done':
              onDone?.(data);
              break;
            // A mid-stream model/provider failure arrives as `ai_error` and is
            // still followed by `done`. Both events carry the same rich
            // `{ detail }` payload, so both surface the same way. Without the
            // `ai_error` label the event fell through the switch unhandled and
            // the following `done` finalized an empty assistant turn — the
            // failure reached the user as silence.
            case 'ai_error':
            case 'error': {
              const errorDetail = parseErrorDetail(data);
              const streamError = new ApiError(response.status || 500, errorDetail);
              onError?.(streamError);
              break;
            }
            default:
              // Same reasoning as the inner switch: surface, in dev only, any
              // SSE event name this client does not know how to render.
              if (import.meta.env?.DEV) {
                console.warn('[chat stream] unhandled event:', event, data);
              }
          }
        }
      }
    }
  } catch (error) {
    // A local abort is a stop, not a failure. The server never got to send
    // `cancelled`/`done`, so both are raised here to finish the turn the same way.
    if (signal?.aborted) {
      onCancelled?.();
      onDone?.({});
      return;
    }
    // A server-sent ApiError is a real failure; surface it as-is.
    if (error instanceof ApiError) {
      onError?.(error);
    } else {
      // Anything else thrown here is the transport dropping mid-stream (the fetch
      // or the reader rejected without a server response). Tag it so the caller
      // can distinguish a recoverable interruption and auto-reconnect.
      const apiError = new ApiError(0, {
        type: 'rich',
        code: 0,
        description: 'The connection was interrupted before the response finished.',
        solution: 'Reconnecting… you can also retry.',
        description_key: 'error.request.send_message_failed.description',
        solution_key: 'error.request.send_message_failed.solution',
        params: {},
        external_code: 'stream_interrupted',
      });
      onError?.(apiError);
    }
  }
}

/**
 * Send a message and handle the streaming response. New conversations post to
 * `/chat/stream`; an existing one continues at `/chat/stream/{conversationId}`.
 */
export async function sendMessage(options: SendMessageOptions): Promise<void> {
  const url = options.conversationId
    ? `${API_BASE}/chat/stream/${options.conversationId}`
    : `${API_BASE}/chat/stream`;
  return streamChat(url, 'POST', buildChatInput(options), options);
}

/**
 * Edit a user message and stream a fresh answer (ENGG-459). The backend keeps
 * the previous text as an earlier version and shows the new one once its reply
 * finishes. `messageId` is the user message being edited; `options.message`
 * carries the new text. Streams exactly like `sendMessage`.
 */
export async function editMessageStream(
  chatId: string,
  messageId: string,
  options: EditMessageOptions,
): Promise<void> {
  const url = `${API_BASE}/chat/${encodeURIComponent(chatId)}/message/${encodeURIComponent(messageId)}/stream`;
  return streamChat(url, 'PATCH', buildChatInput(options), options);
}

/**
 * Regenerate an answer by re-sending the user message that produced it, which
 * branches a new answer version (ENGG-459). It is the same edit/stream endpoint
 * and body as `editMessageStream` — `userMessageId` is the preceding user
 * message and `options.message` is its unchanged text. Kept as its own function
 * so a dedicated regenerate endpoint can replace just this URL later.
 */
export async function regenerateMessageStream(
  chatId: string,
  userMessageId: string,
  options: EditMessageOptions,
): Promise<void> {
  return editMessageStream(chatId, userMessageId, options);
}

/**
 * Switch the conversation to another version of a message (ENGG-459). `messageId`
 * is one of a message's `versions.message_ids`; the server records the choice
 * (so it survives reload) and returns the conversation with that version shown.
 */
export async function switchBranch(chatId: string, messageId: string): Promise<ConversationDetail> {
  return request<ConversationDetail>(`/chat/${encodeURIComponent(chatId)}/branch`, {
    method: 'PUT',
    body: JSON.stringify({ message_id: messageId }),
  });
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
 * Update conversation metadata (title, archived status, pinned status)
 */
export async function updateConversation(
  conversationId: string,
  payload: { title?: string; archived?: boolean; pinned?: boolean }
): Promise<ConversationDetail> {
  return request<ConversationDetail>(`/chat/${conversationId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

/**
 * Archive a conversation
 */
export async function archiveConversation(conversationId: string, title: string): Promise<ConversationDetail> {
  return updateConversation(conversationId, {
    archived: true,
    title,
  });
}

/**
 * Rename a conversation title
 */
export async function renameConversation(
  conversationId: string,
  payload: { title: string; archived: boolean }
): Promise<ConversationDetail> {
  return updateConversation(conversationId, payload);
}

/**
 * Pin or unpin a conversation
 */
export async function pinConversation(
  conversationId: string,
  pinned: boolean,
  currentTitle?: string,
  archived?: boolean
): Promise<ConversationDetail> {
  return updateConversation(conversationId, {
    pinned,
    ...(currentTitle !== undefined ? { title: currentTitle } : {}),
    ...(archived !== undefined ? { archived } : {}),
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
