import { request } from './client.js';
import type { User, PaginatedUsers, UserBulkImportResult, CostSummary } from '../admin/types.js';

export interface GetUsersParams {
  limit?: number;
  offset?: number;
  search?: string;
  role?: string;
  status?: string;
  department?: string;
}

export interface CreateUserData {
  email: string;
  name?: string;
  role?: string;
  department?: string;
}

function buildQueryString(params?: Record<string, string | number | undefined>): string {
  if (!params) return '';
  const queryParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      queryParams.set(key, String(value));
    }
  }
  const query = queryParams.toString();
  return query ? `?${query}` : '';
}

export async function getUsers(params?: GetUsersParams): Promise<PaginatedUsers> {
  return request<PaginatedUsers>(`/admin/users${buildQueryString(params)}`);
}

export async function getUser(userId: string): Promise<User> {
  return request<User>(`/admin/users/${userId}`);
}

export async function createUser(data: CreateUserData): Promise<User> {
  return request<User>('/admin/users', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateUser(userId: string, updates: Partial<User>): Promise<User> {
  return request<User>(`/admin/users/${userId}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

export async function deactivateUser(userId: string): Promise<void> {
  return request<void>(`/admin/users/${userId}`, { method: 'DELETE' });
}

export async function bulkImportUsers(users: CreateUserData[]): Promise<UserBulkImportResult> {
  return request<UserBulkImportResult>('/admin/users/bulk', {
    method: 'POST',
    body: JSON.stringify({ users }),
  });
}

export async function getUserUsage(userId: string): Promise<CostSummary> {
  return request<CostSummary>(`/admin/users/${userId}/usage`);
}
