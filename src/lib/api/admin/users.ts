// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

import { request } from '../client.js';
import type { User, PaginatedUsers } from '../../admin/types.js';

export interface GetUsersParams {
  limit?: number;
  offset?: number;
  search?: string;
  role_id?: string;
  status?: string;
  department?: string;
  sort?: 'name' | 'email' | 'created_at' | 'updated_at';
  ascending?: boolean;
}

export interface CreateUserData {
  email: string;
  name?: string;
  department_id?: string | null;
}

function hasNonEmptyDepartmentId(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function buildQueryString(params?: Record<string, string | number | boolean | undefined>): string {
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
  return request<PaginatedUsers>(`/admin/users${buildQueryString(params as Record<string, string | number | boolean | undefined>)}`);
}

export async function getScopedUsers(params?: GetUsersParams): Promise<PaginatedUsers> {
  return request<PaginatedUsers>(`/me/administered-departments/users${buildQueryString(params as Record<string, string | number | boolean | undefined>)}`);
}

export async function getUser(userId: string): Promise<User> {
  return request<User>(`/admin/users/${userId}`);
}

export async function createUser(data: CreateUserData): Promise<User> {
  const payload: Record<string, unknown> = { email: data.email };
  if (data.name !== undefined) {
    payload.name = data.name;
  }
  if (hasNonEmptyDepartmentId(data.department_id)) {
    payload.department_id = data.department_id;
  }
  return request<User>('/admin/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateUser(userId: string, updates: Partial<User>): Promise<User> {
  const payload: Record<string, unknown> = { ...updates };

  if (Object.hasOwn(updates, 'department_id')) {
    delete payload.department_id;
    delete payload.unassign_department;

    if (hasNonEmptyDepartmentId(updates.department_id)) {
      payload.department_id = updates.department_id;
    } else {
      payload.unassign_department = true;
    }
  }

  return request<User>(`/admin/users/${userId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function updateUserStatus(userId: string, status: 'active' | 'deactivated'): Promise<void> {
  return request<void>(`/admin/users/${userId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

