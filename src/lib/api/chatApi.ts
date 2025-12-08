import type { StreamEvent } from '../types/chat';

import { API_BASE } from './client';
import { getAccessToken } from '../features/auth';

export interface SendMessageOptions {
  message: string;
  conversationId?: string;
  onToken?: (token: string) => void;
  onStart?: (data: any) => void;
  onTitle?: (title: string) => void;
  onDone?: (data: any) => void;
  onError?: (error: string) => void;
}

/**
 * Send a message and handle streaming response
 */
export async function sendMessage(options: SendMessageOptions): Promise<void> {
  const { message, conversationId, onToken, onStart, onTitle, onDone, onError } = options;

  try {
    const token = getAccessToken();
    if (!token) {
      throw new Error('No authentication token available');
    }

    const response = await fetch(`${API_BASE}/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'user',
            content: message,
          },
        ],
        conversation_id: conversationId,
        web_search: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
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
          const event = eventMatch[1];
          const data = JSON.parse(dataMatch[1]);

          switch (event) {
            case 'start':
              onStart?.(data);
              break;
            case 'token':
              onToken?.(data.content);
              break;
            case 'set_title':
              onTitle?.(data.title);
              break;
            case 'done':
              onDone?.(data);
              break;
            case 'error':
              onError?.(data.message || 'An error occurred');
              break;
          }
        }
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to send message';
    onError?.(errorMessage);
  }
}

/**
 * Fetch conversation history
 */
export async function getConversation(conversationId: string) {
  try {
    const token = getAccessToken();
    if (!token) {
      throw new Error('No authentication token available');
    }

    const response = await fetch(`${API_BASE}/chat/${conversationId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to fetch conversation:', error);
    throw error;
  }
}

/**
 * List all conversations
 */
export async function listConversations() {
  try {
    const token = getAccessToken();
    if (!token) {
      throw new Error('No authentication token available');
    }

    const response = await fetch(`${API_BASE}/chat`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to fetch conversations:', error);
    throw error;
  }
}

/**
 * Delete a conversation
 */
export async function deleteConversation(conversationId: string) {
  try {
    const token = getAccessToken();
    if (!token) {
      throw new Error('No authentication token available');
    }

    const response = await fetch(`${API_BASE}/chat/${conversationId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
  } catch (error) {
    console.error('Failed to delete conversation:', error);
    throw error;
  }
}

/**
 * Search conversations
 */
export async function searchConversations(query: string) {
  try {
    const token = getAccessToken();
    if (!token) {
      throw new Error('No authentication token available');
    }

    const response = await fetch(`${API_BASE}/chat/search?search=${encodeURIComponent(query)}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to search conversations:', error);
    throw error;
  }
}
