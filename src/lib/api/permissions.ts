import { request } from './client.js';

export type PermissionScope = '*' | string[];

export interface PermissionsResponse {
  permissions: Record<string, PermissionScope>;
  mcp_access?: Record<string, 'allow' | 'deny'>;
  administered_departments?: string[];
}

export async function getMyPermissions(): Promise<PermissionsResponse> {
  return request<PermissionsResponse>('/me/permissions');
}
