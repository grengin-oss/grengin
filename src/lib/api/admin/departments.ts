import { request } from '../client.js';
import type { 
  Department, 
  DepartmentListResponse, 
  CreateDepartmentRequest, 
  UpdateDepartmentRequest,
  SetBudgetRequest,
  DepartmentMembersResponse
} from '../../admin/types.js';

export async function getDepartments(): Promise<DepartmentListResponse> {
  return request<DepartmentListResponse>('/admin/departments');
}

export async function getDepartment(departmentId: string): Promise<Department> {
  return request<Department>(`/admin/department/${departmentId}`);
}

export async function createDepartment(data: CreateDepartmentRequest): Promise<Department> {
  return request<Department>('/admin/departments', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateDepartment(
  departmentId: string, 
  data: UpdateDepartmentRequest
): Promise<Department> {
  return request<Department>(`/admin/departments/${departmentId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteDepartment(departmentId: string): Promise<void> {
  return request<void>(`/admin/departments/${departmentId}`, {
    method: 'DELETE',
  });
}

export async function moveDepartment(
  departmentId: string,
  newParentId: string | null
): Promise<Department> {
  return request<Department>(`/admin/departments/${departmentId}/move`, {
    method: 'POST',
    body: JSON.stringify({ parent_id: newParentId }),
  });
}

export async function setBudget(
  departmentId: string,
  data: SetBudgetRequest
): Promise<Department> {
  return request<Department>(`/admin/departments/${departmentId}/budget`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getDepartmentMembers(
  departmentId: string,
  includeSubDepartments: boolean = false
): Promise<DepartmentMembersResponse> {
  const params = new URLSearchParams();
  if (includeSubDepartments) {
    params.set('include_sub_department', 'true');
  }
  const query = params.toString();
  return request<DepartmentMembersResponse>(
    `/admin/departments/${departmentId}/members${query ? `?${query}` : ''}`
  );
}

export async function addDepartmentMembers(
  departmentId: string,
  userIds: string[]
): Promise<void> {
  return request<void>(`/admin/departments/${departmentId}/members`, {
    method: 'POST',
    body: JSON.stringify(userIds),
  });
}

export async function removeDepartmentMembers(
  departmentId: string,
  userIds: string[]
): Promise<void> {
  return request<void>(`/admin/departments/${departmentId}/members`, {
    method: 'DELETE',
    body: JSON.stringify(userIds),
  });
}
