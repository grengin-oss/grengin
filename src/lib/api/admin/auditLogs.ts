// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

import { request, API_BASE } from '../client.js';
import type { PaginatedAuditLogs } from '../../admin/types.js';

export interface GetAuditLogsParams {
  userId?: string;
  action?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

function buildQueryString(params?: Record<string, string | number | boolean | undefined>): string {
  if (!params) return '';
  const queryParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      queryParams.set(key, String(value));
    }
  }
  const query = queryParams.toString();
  return query ? `?${query}` : '';
}

export async function getAuditLogs(params?: GetAuditLogsParams): Promise<PaginatedAuditLogs> {
  return request<PaginatedAuditLogs>(
    `/admin/audit-logs${buildQueryString(params as Record<string, string | number | boolean | undefined>)}`,
  );
}

export async function getAuditActions(): Promise<string[]> {
  return request<string[]>('/audit/actions');
}

export async function exportAuditLogs(
  params: GetAuditLogsParams,
  format: 'csv' | 'json',
): Promise<Blob> {
  const queryParams = { ...params, format } as Record<string, string | number | boolean | undefined>;
  const queryString = buildQueryString(queryParams);

  const token = localStorage.getItem('grengin_access_token');
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}/admin/audit-logs/export${queryString}`, {
    headers,
  });

  if (!response.ok) {
    throw new Error(`Export failed with status ${response.status}`);
  }

  return response.blob();
}
