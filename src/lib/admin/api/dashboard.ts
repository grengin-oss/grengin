// Dashboard API Service
import { apiClient } from './client';
import type { AdminDashboard } from '../types';

/**
 * Get admin dashboard overview data
 * Includes user stats, usage metrics, costs, and system health
 */
export async function getDashboard(): Promise<AdminDashboard> {
  return apiClient.get<AdminDashboard>('/admin/dashboard');
}

/**
 * Refresh dashboard data
 * Can be called periodically for near real-time updates
 */
export async function refreshDashboard(): Promise<AdminDashboard> {
  return getDashboard();
}

