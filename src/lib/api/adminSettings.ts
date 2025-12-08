import { request } from './client.js';
import type { Organization, ApiKey, RateLimit, Budget } from '../admin/types.js';

// Organization

export async function getOrganization(): Promise<Organization> {
  return request<Organization>('/admin/organization');
}

export async function updateOrganization(updates: Partial<Organization>): Promise<Organization> {
  return request<Organization>('/admin/organization', {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

// API Keys

export interface CreateApiKeyData {
  provider: 'openai' | 'anthropic' | 'groq';
  name: string;
  api_key: string;
}

export async function getApiKeys(): Promise<ApiKey[]> {
  return request<ApiKey[]>('/admin/api-keys');
}

export async function getApiKey(keyId: string): Promise<ApiKey> {
  return request<ApiKey>(`/admin/api-keys/${keyId}`);
}

export async function createApiKey(data: CreateApiKeyData): Promise<ApiKey> {
  return request<ApiKey>('/admin/api-keys', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteApiKey(keyId: string): Promise<void> {
  return request<void>(`/admin/api-keys/${keyId}`, { method: 'DELETE' });
}

export async function validateApiKey(keyId: string): Promise<{ valid: boolean; message: string }> {
  return request<{ valid: boolean; message: string }>(
    `/admin/api-keys/${keyId}/validate`,
    { method: 'POST' }
  );
}

// Rate Limits

export interface CreateRateLimitData {
  scope: string;
  scope_id?: string;
  requests_per_minute: number;
  requests_per_hour?: number;
  requests_per_day?: number;
  tokens_per_day?: number;
}

export async function getRateLimits(scope?: string): Promise<RateLimit[]> {
  const query = scope ? `?scope=${scope}` : '';
  return request<RateLimit[]>(`/admin/rate-limits${query}`);
}

export async function getRateLimit(limitId: string): Promise<RateLimit> {
  return request<RateLimit>(`/admin/rate-limits/${limitId}`);
}

export async function createRateLimit(data: CreateRateLimitData): Promise<RateLimit> {
  return request<RateLimit>('/admin/rate-limits', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateRateLimit(limitId: string, updates: Partial<RateLimit>): Promise<RateLimit> {
  return request<RateLimit>(`/admin/rate-limits/${limitId}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

export async function deleteRateLimit(limitId: string): Promise<void> {
  return request<void>(`/admin/rate-limits/${limitId}`, { method: 'DELETE' });
}

// Budgets

export interface CreateBudgetData {
  scope: string;
  scope_id?: string;
  limit_amount: number;
  period: string;
  alert_thresholds?: number[];
  action_on_exceed?: string;
}

export async function getBudgets(scope?: string): Promise<Budget[]> {
  const query = scope ? `?scope=${scope}` : '';
  return request<Budget[]>(`/admin/budgets${query}`);
}

export async function getBudget(budgetId: string): Promise<Budget> {
  return request<Budget>(`/admin/budgets/${budgetId}`);
}

export async function createBudget(data: CreateBudgetData): Promise<Budget> {
  return request<Budget>('/admin/budgets', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateBudget(budgetId: string, updates: Partial<Budget>): Promise<Budget> {
  return request<Budget>(`/admin/budgets/${budgetId}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

export async function deleteBudget(budgetId: string): Promise<void> {
  return request<void>(`/admin/budgets/${budgetId}`, { method: 'DELETE' });
}
