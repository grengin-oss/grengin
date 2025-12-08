import { request } from './client.js';
import type { SsoProvider } from '../admin/types.js';

export interface CreateSsoProviderData {
  provider: string;
  name: string;
  client_id: string;
  client_secret: string;
  issuer_url: string;
  scopes?: string[];
  allowed_domains?: string[];
  is_enabled?: boolean;
  is_default?: boolean;
}

export interface TestSsoProviderResult {
  success: boolean;
  message: string;
  discovery_url?: string;
  endpoints_found?: Record<string, boolean>;
}

export async function getSsoProviders(): Promise<SsoProvider[]> {
  return request<SsoProvider[]>('/admin/sso-providers');
}

export async function getSsoProvider(providerId: string): Promise<SsoProvider> {
  return request<SsoProvider>(`/admin/sso-providers/${providerId}`);
}

export async function createSsoProvider(data: CreateSsoProviderData): Promise<SsoProvider> {
  return request<SsoProvider>('/admin/sso-providers', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateSsoProvider(providerId: string, updates: Partial<SsoProvider>): Promise<SsoProvider> {
  return request<SsoProvider>(`/admin/sso-providers/${providerId}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

export async function deleteSsoProvider(providerId: string): Promise<void> {
  return request<void>(`/admin/sso-providers/${providerId}`, { method: 'DELETE' });
}

export async function testSsoProvider(providerId: string): Promise<TestSsoProviderResult> {
  return request<TestSsoProviderResult>(`/admin/sso-providers/${providerId}/test`, { method: 'POST' });
}
