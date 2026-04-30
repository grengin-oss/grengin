import { request } from '../client.js';
import type { SystemMetrics } from '../../admin/types.js';

export async function getSystemMetrics(): Promise<SystemMetrics> {
  return request<SystemMetrics>('/admin/system-metrics');
}
