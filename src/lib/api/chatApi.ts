import type { StreamEvent } from '../types/chat';

import { API_BASE, request } from './client';
import { getAccessToken } from '../features/auth';

export interface SendMessageOptions {
  message: string;
  conversationId?: string;
  provider?: string;
  modelName?: string;
  files?: File[];
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
  const { message, conversationId, provider, modelName, files, onToken, onStart, onTitle, onDone, onError } = options;

  try {
    const token = getAccessToken();
    if (!token) {
      throw new Error('No authentication token available');
    }

    // Convert files to base64 if present
    const processedFiles = files ? await Promise.all(
      files.map(async (file) => {
        const base64 = await fileToBase64(file);
        return {
          name: file.name,
          size: file.size,
          type: file.type,
          data: base64
        };
      })
    ) : [];

    // Build the correct API URL
    const streamUrl = conversationId 
      ? `${API_BASE}/chat/stream/${conversationId}`
      : `${API_BASE}/chat/stream`;
    
    console.log('Using stream URL:', streamUrl);

    let response = await fetch(streamUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        provider: provider || 'openai',
        modelName: modelName || 'gpt-3.5-turbo',
        config: {},
        temperature: 0.1,
        webSearch: false,
        selectedTools: [],
        message: {
          role: 'user',
          content: message,
          files: processedFiles,
        },
      }),
    });

    // Handle token expiration for streaming requests
    if (response.status === 401) {
      console.log('Streaming request: Token expired, attempting refresh...');
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
            localStorage.setItem('grengin_access_token', data.access_token);
            localStorage.setItem('grengin_refresh_token', data.refresh_token);
            localStorage.setItem('grengin_user', JSON.stringify(data.user));
            
            console.log('Streaming request: Token refreshed, retrying...');
            // Retry the streaming request with new token
            response = await fetch(`${API_BASE}/chat/stream`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${data.access_token}`,
              },
              body: JSON.stringify({
                provider: provider || 'openai',
                modelName: modelName || 'gpt-3.5-turbo',
                config: {},
                temperature: 0.1,
                webSearch: false,
                selectedTools: [],
                message: {
                  role: 'user',
                  content: message,
                  files: processedFiles,
                },
              }),
            });
          } else {
            console.log('Streaming request: Refresh failed, redirecting...');
            // Clear auth and redirect
            localStorage.removeItem('grengin_access_token');
            localStorage.removeItem('grengin_refresh_token');
            localStorage.removeItem('grengin_user');
            window.location.href = '/';
            return;
          }
        } catch (error) {
          console.log('Streaming request: Refresh error, redirecting...');
          // Clear auth and redirect
          localStorage.removeItem('grengin_access_token');
          localStorage.removeItem('grengin_refresh_token');
          localStorage.removeItem('grengin_user');
          window.location.href = '/';
          return;
        }
      } else {
        console.log('Streaming request: No refresh token, redirecting...');
        // Clear auth and redirect
        localStorage.removeItem('grengin_access_token');
        localStorage.removeItem('grengin_refresh_token');
        localStorage.removeItem('grengin_user');
        window.location.href = '/';
        return;
      }
    }

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let isFirstChunk = true;

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
          const dataStr = dataMatch[1];
          
          // Check for stream completion signal
          if (dataStr === '[DONE]') {
            onDone?.({});
            break;
          }
          
          const data = JSON.parse(dataStr);

          switch (event) {
            case 'start':
              onStart?.(data);
              break;
            case 'chunk':
              if (data) {
                // Handle first chunk - extract conversation ID and call onStart
                if (isFirstChunk) {
                  console.log('First chunk detected:', data);
                  isFirstChunk = false;
                  
                  // Call onStart with conversation data if available
                  if (data.id && onStart) {
                    onStart({ conversation_id: data.id });
                  }
                }
                
                onToken?.(data.content);
              }
              break;
            case 'set_title':
              onTitle?.(data.title);
              break;
            case '[DONE]':
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
