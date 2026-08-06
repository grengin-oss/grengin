// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

import { request } from '../client.js';
import type { RoleUserAssignment } from '../../admin/types.js';

export interface Role {
  id: string;
  name: string;
  is_system: boolean;
  permissions: string[];
  user_count?: number;
}

export interface RolesResponse {
  roles: Role[];
}

export interface CreateRolePayload {
  name: string;
  permissions: string[];
}

export interface AddRoleToUserPayload {
  role_id: string;
  scope_department_id?: string;
}

export async function getRoles(): Promise<RolesResponse> {
  return request<RolesResponse>('/admin/roles');
}

export async function getRole(roleId: string): Promise<Role> {
  return request<Role>(`/admin/role/${roleId}`);
}

export async function createRole(payload: CreateRolePayload): Promise<Role> {
  return request<Role>('/admin/roles', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateRole(roleId: string, payload: CreateRolePayload): Promise<Role> {
  return request<Role>(`/admin/roles/${roleId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteRole(roleId: string): Promise<void> {
  return request<void>(`/admin/roles/${roleId}`, {
    method: 'DELETE',
  });
}

export async function addRoleToUser(userId: string, payload: AddRoleToUserPayload): Promise<void> {
  return request<void>(`/admin/users/${userId}/roles`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function removeRoleFromUser(userId: string, assignmentId: string): Promise<void> {
  return request<void>(`/admin/users/${userId}/roles/${assignmentId}`, {
    method: 'DELETE',
  });
}

/** Get a user's role assignments (for finding assignmentId to remove). */
export async function getUserRoleAssignments(userId: string): Promise<{ assignments: RoleUserAssignment[] }> {
  return request<{ assignments: RoleUserAssignment[] }>(`/admin/users/${userId}/roles`);
}

export type { RoleUserAssignment };
