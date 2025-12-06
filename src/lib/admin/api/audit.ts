// Audit Log API Service
import { apiClient } from './client';
import type { AuditLogEntry } from '../types';

/**
 * Get audit log entries with pagination and filters
 * TODO: Wire this up when backend audit endpoint is ready
 */
export async function getAuditLogs(params?: {
  limit?: number;
  offset?: number;
  admin_id?: string;
  action?: string;
  resource_type?: string;
  start_date?: string;
  end_date?: string;
}): Promise<{
  logs: AuditLogEntry[];
  total: number;
  limit: number;
  offset: number;
}> {
  const queryParams = new URLSearchParams();
  
  if (params?.limit) queryParams.set('limit', params.limit.toString());
  if (params?.offset) queryParams.set('offset', params.offset.toString());
  if (params?.admin_id) queryParams.set('admin_id', params.admin_id);
  if (params?.action) queryParams.set('action', params.action);
  if (params?.resource_type) queryParams.set('resource_type', params.resource_type);
  if (params?.start_date) queryParams.set('start_date', params.start_date);
  if (params?.end_date) queryParams.set('end_date', params.end_date);

  const query = queryParams.toString();
  
  // TODO: Replace with actual API endpoint when available
  // For now, return mock data
  return {
    logs: [],
    total: 0,
    limit: params?.limit || 50,
    offset: params?.offset || 0,
  };
}

/**
 * Log an admin action
 * This should be called after successful admin operations
 * TODO: Ensure this is called consistently for all admin actions
 */
export async function logAdminAction(action: {
  action: string;
  resource_type: string;
  resource_id?: string;
  details?: Record<string, any>;
}): Promise<void> {
  // TODO: Implement when backend endpoint is available
  // await apiClient.post('/admin/audit-logs', action);
  console.log('Admin action logged:', action);
}

