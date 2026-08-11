// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

import { request, API_BASE, apiFetch } from '../client.js';
import type { SystemMetrics } from '../../admin/types.js';

export interface HealthStatus {
  status: string;
  version: string;
}

export async function getSystemMetrics(): Promise<SystemMetrics> {
  return request<SystemMetrics>('/admin/system-metrics');
}

export async function getHealthStatus(): Promise<HealthStatus> {
  const response = await apiFetch(API_BASE, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) {
    throw new Error('Failed to fetch health status');
  }
  return response.json();
}
