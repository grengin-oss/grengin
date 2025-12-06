// Users API Service
import { apiClient } from './client';
import type { User, PaginatedUsers, UserBulkImportResult, CostSummary } from '../types';

/**
 * List all users with pagination and filters
 */
export async function getUsers(params?: {
  limit?: number;
  offset?: number;
  search?: string;
  role?: string;
  status?: string;
  department?: string;
}): Promise<PaginatedUsers> {
  const queryParams = new URLSearchParams();
  
  if (params?.limit) queryParams.set('limit', params.limit.toString());
  if (params?.offset) queryParams.set('offset', params.offset.toString());
  if (params?.search) queryParams.set('search', params.search);
  if (params?.role) queryParams.set('role', params.role);
  if (params?.status) queryParams.set('status', params.status);
  if (params?.department) queryParams.set('department', params.department);

  const query = queryParams.toString();
  return apiClient.get<PaginatedUsers>(`/admin/users${query ? `?${query}` : ''}`);
}

/**
 * Get a single user by ID
 */
export async function getUser(userId: string): Promise<User> {
  return apiClient.get<User>(`/admin/users/${userId}`);
}

/**
 * Create a new user
 */
export async function createUser(userData: {
  email: string;
  name?: string;
  role?: string;
  department?: string;
}): Promise<User> {
  // TODO: Add audit logging on successful creation
  return apiClient.post<User>('/admin/users', userData);
}

/**
 * Update an existing user
 */
export async function updateUser(userId: string, updates: Partial<User>): Promise<User> {
  // TODO: Add audit logging on successful update
  return apiClient.put<User>(`/admin/users/${userId}`, updates);
}

/**
 * Deactivate/suspend a user
 */
export async function deactivateUser(userId: string): Promise<void> {
  // TODO: Add audit logging on successful deactivation
  return apiClient.delete<void>(`/admin/users/${userId}`);
}

/**
 * Bulk import users from CSV or JSON
 */
export async function bulkImportUsers(users: Array<{
  email: string;
  name?: string;
  role?: string;
  department?: string;
}>): Promise<UserBulkImportResult> {
  // TODO: Add audit logging for bulk imports
  return apiClient.post<UserBulkImportResult>('/admin/users/bulk', { users });
}

/**
 * Get user usage statistics
 */
export async function getUserUsage(userId: string): Promise<CostSummary> {
  return apiClient.get<CostSummary>(`/admin/users/${userId}/usage`);
}

