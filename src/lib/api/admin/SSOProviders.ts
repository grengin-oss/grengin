import { request } from '../client.js';
import type { SSOProvider } from '../../admin/types.js';

export async function getSSOProviders(): Promise<SSOProvider[]> {
  return request<SSOProvider[]>('/admin/sso-providers');
}

export async function getSSOProvider(providerId: string): Promise<SSOProvider> {
  return request<SSOProvider>(`/admin/sso-providers/${providerId}`);
}

export interface UpdateSSOProviderPayload {
  allowed_domains: string[];
  client_id: string;
  client_secret?: string;
  is_enabled: boolean;
  tenant_id?: string;
}

export async function updateSSOProvider(
  providerId: string,
  body: UpdateSSOProviderPayload,
): Promise<void> {
  return request<void>(`/admin/sso-providers/${providerId}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function toggleSSOProviderStatus(
  providerId: string,
  is_enabled: boolean,
): Promise<void> {
  return request<void>(`/admin/sso-providers/${providerId}`, {
    method: 'PUT',
    body: JSON.stringify({ is_enabled }),
  });
}

export async function deleteSSOProvider(providerId: string): Promise<void> {
  return request<void>(`/admin/sso-providers/${providerId}`, {
    method: 'DELETE',
  });
}
