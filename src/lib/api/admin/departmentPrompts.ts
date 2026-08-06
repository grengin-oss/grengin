// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

import { request } from '../client.js';

export interface DepartmentPrompt {
  id: string;
  department_id: string;
  prompt_id: string;
  priority: number;
  assigned_by: string;
  created_at: string;
  updated_at: string;
}

export interface AssignDepartmentPromptPayload {
  department_id: string;
  prompt_id: string;
  priority: number;
}

export interface UpdateDepartmentPromptPayload {
  priority: number;
}

export async function getDepartmentPrompts(departmentId: string): Promise<DepartmentPrompt[]> {
  return request<DepartmentPrompt[]>(`/admin/department-prompts?department_id=${departmentId}`);
}

export async function assignDepartmentPrompt(payload: AssignDepartmentPromptPayload): Promise<DepartmentPrompt> {
  return request<DepartmentPrompt>('/admin/department-prompts', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateDepartmentPrompt(
  id: string,
  payload: UpdateDepartmentPromptPayload,
): Promise<DepartmentPrompt> {
  return request<DepartmentPrompt>(`/admin/department-prompts/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function unassignDepartmentPrompt(id: string): Promise<void> {
  return request<void>(`/admin/department-prompts/${id}`, {
    method: 'DELETE',
  });
}
