import { request } from '../client.js';
import type { 
  Department, 
  DepartmentListResponse, 
  CreateDepartmentRequest, 
  UpdateDepartmentRequest,
  SetBudgetRequest,
  DepartmentMembersResponse,
  BudgetOverview,
  DepartmentTreeResponse,
  AdministeredDepartmentsResponse
} from '../../admin/types.js';

export async function getDepartments(): Promise<DepartmentListResponse> {
  return request<DepartmentListResponse>('/admin/departments');
}

export async function getDepartmentsTree(): Promise<DepartmentTreeResponse> {
  return request<DepartmentTreeResponse>('/admin/departments/tree');
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
    body: JSON.stringify({ new_parent_id: newParentId }),
  });
}

export async function setBudget(
  departmentId: string,
  data: SetBudgetRequest
): Promise<Department> {
  return request<Department>(`/admin/departments/${departmentId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function getBudgetOverview(departmentId: string): Promise<BudgetOverview> {
  return request<BudgetOverview>(`/admin/departments/${departmentId}/budget`);
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

export async function getAdministeredDepartments(): Promise<AdministeredDepartmentsResponse> {
  return request<AdministeredDepartmentsResponse>('/me/administered-departments');
}
