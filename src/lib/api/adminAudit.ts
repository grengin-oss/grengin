import { request } from './client.js';
import type { AuditLogEntry } from '../admin/types.js';

export interface GetAuditLogsParams {
  limit?: number;
  offset?: number;
  admin_id?: string;
  action?: string;
  resource_type?: string;
  start_date?: string;
  end_date?: string;
}

export interface PaginatedAuditLogs {
  logs: AuditLogEntry[];
  total: number;
  limit: number;
  offset: number;
}

export async function getAuditLogs(params?: GetAuditLogsParams): Promise<PaginatedAuditLogs> {
  const queryParams = new URLSearchParams();

  if (params?.limit) queryParams.set('limit', params.limit.toString());
  if (params?.offset) queryParams.set('offset', params.offset.toString());
  if (params?.admin_id) queryParams.set('admin_id', params.admin_id);
  if (params?.action) queryParams.set('action', params.action);
  if (params?.resource_type) queryParams.set('resource_type', params.resource_type);
  if (params?.start_date) queryParams.set('start_date', params.start_date);
  if (params?.end_date) queryParams.set('end_date', params.end_date);

  const query = queryParams.toString();
  return request<PaginatedAuditLogs>(`/admin/audit-logs${query ? `?${query}` : ''}`);
}
