import { request } from './client.js';
import type { AdminDashboard } from '../admin/types.js';

export async function getDashboard(): Promise<AdminDashboard> {
  return request<AdminDashboard>('/admin/dashboard');
}
