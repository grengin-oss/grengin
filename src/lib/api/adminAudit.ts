// Audit Log API Service
import { request } from './client.js';
import type { AuditLogEntry } from '../admin/types.js';

/**
 * Get audit log entries with pagination and filters
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
  return request(`/admin/audit-logs${query ? `?${query}` : ''}`, {}, true);
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
  // await request('/admin/audit-logs', { method: 'POST', body: JSON.stringify(action) });
  console.log('Admin action logged:', action);
}

