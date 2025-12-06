// Settings API Service
import { apiClient } from './client';
import type {
  Organization,
  ApiKey,
  SsoProvider,
  RateLimit,
  Budget,
} from '../types';

// ==================== Organization ====================

export async function getOrganization(): Promise<Organization> {
  return apiClient.get<Organization>('/admin/organization');
}

export async function updateOrganization(updates: Partial<Organization>): Promise<Organization> {
  // TODO: Add audit logging
  return apiClient.put<Organization>('/admin/organization', updates);
}

// ==================== API Keys ====================

export async function getApiKeys(): Promise<ApiKey[]> {
  return apiClient.get<ApiKey[]>('/admin/api-keys');
}

export async function getApiKey(keyId: string): Promise<ApiKey> {
  return apiClient.get<ApiKey>(`/admin/api-keys/${keyId}`);
}

export async function createApiKey(data: {
  provider: 'openai' | 'anthropic' | 'groq';
  name: string;
  api_key: string;
}): Promise<ApiKey> {
  // TODO: Add audit logging
  return apiClient.post<ApiKey>('/admin/api-keys', data);
}

export async function deleteApiKey(keyId: string): Promise<void> {
  // TODO: Add audit logging
  return apiClient.delete<void>(`/admin/api-keys/${keyId}`);
}

export async function validateApiKey(keyId: string): Promise<{
  valid: boolean;
  message: string;
}> {
  return apiClient.post<{ valid: boolean; message: string }>(
    `/admin/api-keys/${keyId}/validate`
  );
}

// ==================== SSO Providers ====================

export async function getSsoProviders(): Promise<SsoProvider[]> {
  return apiClient.get<SsoProvider[]>('/admin/sso-providers');
}

export async function getSsoProvider(providerId: string): Promise<SsoProvider> {
  return apiClient.get<SsoProvider>(`/admin/sso-providers/${providerId}`);
}

export async function createSsoProvider(data: {
  provider: string;
  name: string;
  client_id: string;
  client_secret: string;
  issuer_url: string;
  scopes?: string[];
  allowed_domains?: string[];
  is_enabled?: boolean;
  is_default?: boolean;
}): Promise<SsoProvider> {
  // TODO: Add audit logging
  return apiClient.post<SsoProvider>('/admin/sso-providers', data);
}

export async function updateSsoProvider(
  providerId: string,
  updates: Partial<SsoProvider>
): Promise<SsoProvider> {
  // TODO: Add audit logging
  return apiClient.put<SsoProvider>(`/admin/sso-providers/${providerId}`, updates);
}

export async function deleteSsoProvider(providerId: string): Promise<void> {
  // TODO: Add audit logging
  return apiClient.delete<void>(`/admin/sso-providers/${providerId}`);
}

export async function testSsoProvider(providerId: string): Promise<{
  success: boolean;
  message: string;
  discovery_url?: string;
  endpoints_found?: Record<string, boolean>;
}> {
  return apiClient.post<any>(`/admin/sso-providers/${providerId}/test`);
}

// ==================== Rate Limits ====================

export async function getRateLimits(scope?: string): Promise<RateLimit[]> {
  const query = scope ? `?scope=${scope}` : '';
  return apiClient.get<RateLimit[]>(`/admin/rate-limits${query}`);
}

export async function getRateLimit(limitId: string): Promise<RateLimit> {
  return apiClient.get<RateLimit>(`/admin/rate-limits/${limitId}`);
}

export async function createRateLimit(data: {
  scope: string;
  scope_id?: string;
  requests_per_minute: number;
  requests_per_hour?: number;
  requests_per_day?: number;
  tokens_per_day?: number;
}): Promise<RateLimit> {
  // TODO: Add audit logging
  return apiClient.post<RateLimit>('/admin/rate-limits', data);
}

export async function updateRateLimit(
  limitId: string,
  updates: Partial<RateLimit>
): Promise<RateLimit> {
  // TODO: Add audit logging
  return apiClient.put<RateLimit>(`/admin/rate-limits/${limitId}`, updates);
}

export async function deleteRateLimit(limitId: string): Promise<void> {
  // TODO: Add audit logging
  return apiClient.delete<void>(`/admin/rate-limits/${limitId}`);
}

// ==================== Budgets ====================

export async function getBudgets(scope?: string): Promise<Budget[]> {
  const query = scope ? `?scope=${scope}` : '';
  return apiClient.get<Budget[]>(`/admin/budgets${query}`);
}

export async function getBudget(budgetId: string): Promise<Budget> {
  return apiClient.get<Budget>(`/admin/budgets/${budgetId}`);
}

export async function createBudget(data: {
  scope: string;
  scope_id?: string;
  limit_amount: number;
  period: string;
  alert_thresholds?: number[];
  action_on_exceed?: string;
}): Promise<Budget> {
  // TODO: Add audit logging
  return apiClient.post<Budget>('/admin/budgets', data);
}

export async function updateBudget(
  budgetId: string,
  updates: Partial<Budget>
): Promise<Budget> {
  // TODO: Add audit logging
  return apiClient.put<Budget>(`/admin/budgets/${budgetId}`, updates);
}

export async function deleteBudget(budgetId: string): Promise<void> {
  // TODO: Add audit logging
  return apiClient.delete<void>(`/admin/budgets/${budgetId}`);
}

