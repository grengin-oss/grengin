import { request } from '../client.js';

export interface ProviderCredentialSlot {
  slotId: string;
  configured: boolean;
  status: 'valid' | 'invalid' | 'not_validated' | 'not_configured';
  validatedAt: string | null;
}

export interface ProviderPlugin {
  id: string;
  providerKey: string;
  version: string;
  name: string;
  digest: string;
  source: string;
  status: 'enabled' | 'disabled' | 'invalid';
  validationError: string | null;
  destination: string;
  capabilities: {
    chat?: { streaming: boolean; tools: boolean; vision: boolean; reasoning: boolean } | null;
    embeddings?: boolean;
    imageGeneration?: boolean;
    modelListing?: boolean;
  };
  credentialSlots: ProviderCredentialSlot[];
  allowInsecureHttp: boolean;
  allowPrivateNetwork: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderPluginValidation {
  valid: boolean;
  providerKey: string | null;
  version: string | null;
  name: string | null;
  digest: string | null;
  destination: string | null;
  credentialSlots: ProviderCredentialDefinition[];
  capabilities: ProviderPlugin['capabilities'] | null;
  error: string | null;
}

export interface ProviderCredentialDefinition {
  slotId: string;
  label: string | null;
  credentialType: 'secret' | 'text';
  required: boolean;
}

export interface ProviderPluginConnectionTest {
  valid: boolean;
  mode: 'configuration' | 'model_list';
  modelsAvailable: number | null;
  errorClass: string | null;
}

export interface ProviderPluginConfiguration {
  manifest: unknown;
  credentials?: Record<string, string>;
  configuration?: Record<string, unknown>;
  baseUrlOverride?: string | null;
  allowInsecureHttp?: boolean;
  allowPrivateNetwork?: boolean;
  enabled?: boolean;
}

export function getProviderPlugins(): Promise<ProviderPlugin[]> {
  return request<ProviderPlugin[]>('/admin/provider-plugins');
}

export function validateProviderPlugin(
  configuration: Omit<ProviderPluginConfiguration, 'credentials' | 'enabled'>,
): Promise<ProviderPluginValidation> {
  return request<ProviderPluginValidation>('/admin/provider-plugins/validate', {
    method: 'POST',
    body: JSON.stringify(configuration),
  });
}

export function installProviderPlugin(
  configuration: ProviderPluginConfiguration,
): Promise<ProviderPlugin> {
  return request<ProviderPlugin>('/admin/provider-plugins', {
    method: 'POST',
    body: JSON.stringify(configuration),
  });
}

export function enableProviderPlugin(providerKey: string): Promise<ProviderPlugin> {
  return request<ProviderPlugin>(
    `/admin/provider-plugins/${encodeURIComponent(providerKey)}/enable`,
    { method: 'POST' },
  );
}

export function disableProviderPlugin(providerKey: string): Promise<ProviderPlugin> {
  return request<ProviderPlugin>(
    `/admin/provider-plugins/${encodeURIComponent(providerKey)}/disable`,
    { method: 'POST' },
  );
}

export function testProviderPlugin(providerKey: string): Promise<ProviderPluginConnectionTest> {
  return request<ProviderPluginConnectionTest>(
    `/admin/provider-plugins/${encodeURIComponent(providerKey)}/test`,
    { method: 'POST' },
  );
}

export function deleteProviderPlugin(providerKey: string): Promise<void> {
  return request<void>(`/admin/provider-plugins/${encodeURIComponent(providerKey)}`, {
    method: 'DELETE',
  });
}
