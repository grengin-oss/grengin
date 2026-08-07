// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

import { request } from '../client.js';
import type { SSOProvider, SSOProviderDetails } from '../../admin/types.js';

export async function getSSOProviders(): Promise<SSOProvider[]> {
  return request<SSOProvider[]>('/admin/sso-providers');
}

export async function getSSOProvider(providerId: string): Promise<SSOProviderDetails> {
  return request<SSOProviderDetails>(`/admin/sso-providers/${providerId}`);
}

export interface ValidateSSOProviderPayload {
  client_id?: string;
  client_secret?: string;
  tenant_id?: string;
  provider?: string;
  issuer_url?: string;
  redirect_url?: string;
  frontend_hosted_url?: string;
}

export interface ValidateSSOProviderResponse {
  valid: boolean;
  message: string;
  redirect_url: string;
  validation_token?: string;
  validation_token_expires_at?: string;
}

export interface UpdateSSOProviderPayload {
  allowed_domains: string[];
  client_id: string;
  client_secret?: string;
  is_enabled: boolean;
  jit_provisioning: boolean;
  tenant_id?: string;
  validation_token?: string;
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

export async function validateSSOProvider(
  providerId: string,
  body: ValidateSSOProviderPayload,
): Promise<ValidateSSOProviderResponse> {
  return request<ValidateSSOProviderResponse>(`/admin/sso-providers/${providerId}/validate`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function deleteSSOProvider(providerId: string): Promise<void> {
  return request<void>(`/admin/sso-providers/${providerId}`, {
    method: 'DELETE',
  });
}
