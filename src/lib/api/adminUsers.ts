import { request } from './client.js';
import type { User, PaginatedUsers } from '../admin/types.js';

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

export async function updateUserStatus(userId: string, status: 'active' | 'deactivated'): Promise<void> {
  return request<void>(`/admin/users/${userId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

