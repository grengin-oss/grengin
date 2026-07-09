import { API_BASE, request, ApiError, parseErrorDetail, apiFetch } from './client';
import { getAccessToken } from '../features/auth';

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  kind: string;
  payload: Record<string, unknown>;
  department_id: string | null;
  created_at: string;
  period_start: string | null;
  read_at: string | null;
}

export interface NotificationsListResponse {
  notifications: NotificationItem[];
  total: number;
}

export interface ListNotificationsParams {
  limit?: number;
  offset?: number;
  unread_only?: boolean;
  created_from?: string;
  created_to?: string;
}

function buildQuery(params: ListNotificationsParams): string {
  const q = new URLSearchParams();
  if (params.limit != null) q.set('limit', String(params.limit));
  if (params.offset != null) q.set('offset', String(params.offset));
  if (params.unread_only === true) q.set('unread_only', 'true');
  if (params.created_from) q.set('created_from', params.created_from);
  if (params.created_to) q.set('created_to', params.created_to);
  const s = q.toString();
  return s ? `?${s}` : '';
}

export async function listNotifications(
  params: ListNotificationsParams = {}
): Promise<NotificationsListResponse> {
  return request<NotificationsListResponse>(`/me/notifications${buildQuery(params)}`);
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  await request(`/me/notifications/${notificationId}/read`, { method: 'POST' });
}

async function tryRefreshTokenForStream(): Promise<string | null> {
  const refreshToken = localStorage.getItem('grengin_refresh_token');
  if (!refreshToken) return null;

  try {
    const refreshResponse = await apiFetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!refreshResponse.ok) return null;

    const data = await refreshResponse.json();
    if (!data.accessToken || !data.user) return null;

    localStorage.setItem('grengin_access_token', data.accessToken);
    const nextRefreshToken = data.refreshToken || data.refresh_token;
    if (nextRefreshToken) {
      localStorage.setItem('grengin_refresh_token', nextRefreshToken);
    }
    localStorage.setItem('grengin_user', JSON.stringify(data.user));
    return data.accessToken as string;
  } catch {
    return null;
  }
}

function clearAuthAndRedirect(): never {
  localStorage.removeItem('grengin_access_token');
  localStorage.removeItem('grengin_refresh_token');
  localStorage.removeItem('grengin_user');
  window.location.href = '/';
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

/**
 * Opens GET /me/notifications/stream with Bearer auth. Retries once after refresh on 401.
 * Caller reads the body as SSE (text/event-stream).
 */
export async function openNotificationsStream(
  signal: AbortSignal
): Promise<Response> {
  let token = getAccessToken();
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

  const url = `${API_BASE}/me/notifications/stream`;
  let response = await apiFetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });

  if (response.status === 401) {
    const newToken = await tryRefreshTokenForStream();
    if (!newToken) {
      clearAuthAndRedirect();
    }
    response = await apiFetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${newToken}` },
      signal,
    });
  }

  if (response.status === 401) {
    clearAuthAndRedirect();
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail = parseErrorDetail(body);
    throw new ApiError(response.status, detail);
  }

  return response;
}

function extractSseDataLines(block: string): string[] {
  const lines: string[] = [];
  for (const line of block.split('\n')) {
    if (line.startsWith('data:')) {
      lines.push(line.slice(5).trimStart());
    }
  }
  return lines;
}

export interface NotificationsStreamOptions {
  signal: AbortSignal;
  onNotification: (n: NotificationItem) => void;
  onError?: (err: unknown) => void;
}

/**
 * Reads SSE chunks from the notifications stream until aborted or connection ends.
 */
export async function consumeNotificationsStream(
  options: NotificationsStreamOptions
): Promise<void> {
  const { signal, onNotification, onError } = options;

  try {
    const response = await openNotificationsStream(signal);
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

    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() ?? '';

      for (const block of parts) {
        if (!block.trim() || block.trim().startsWith(':')) continue;
        const dataLines = extractSseDataLines(block);
        if (dataLines.length === 0) continue;
        const payload = dataLines.join('\n');
        try {
          const parsed = JSON.parse(payload) as NotificationItem;
          if (parsed?.id) {
            onNotification(parsed);
          }
        } catch {
          // ignore malformed event
        }
      }
    }
  } catch (e) {
    if (signal.aborted) return;
    onError?.(e);
  }
}
