// Dashboard API Service
import { request } from './client.js';
import type { AdminDashboard } from '../admin/types.js';

/**
 * Get admin dashboard overview data
 * Includes user stats, usage metrics, costs, and system health
 */
export async function getDashboard(): Promise<AdminDashboard> {
  return request<AdminDashboard>('/admin/dashboard', {}, true);
}

/**
 * Refresh dashboard data
 * Can be called periodically for near real-time updates
 */
export async function refreshDashboard(): Promise<AdminDashboard> {
  return getDashboard();
}

