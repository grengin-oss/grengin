// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

export const MANAGED_CLOUD = import.meta.env?.VITE_MANAGED_CLOUD === 'true';
export type ManagedProvider = 'google' | 'azure';
export interface TenantState { managed: true; status: 'setup' | 'ready'; provider: ManagedProvider }

/** Server binding is the only source of setup state; URL, storage and tokens cannot enable entry. */
export async function loadTenantState(fetcher: typeof fetch = fetch): Promise<TenantState> {
  const response = await fetcher('/.well-known/grengin-tenant', {
    method: 'GET', cache: 'no-store', credentials: 'omit', redirect: 'error',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('tenant_unavailable');
  const data = await response.json();
  if (!data || data.managed !== true || !['setup', 'ready'].includes(data.status) || !['google', 'azure'].includes(data.provider)) throw new Error('tenant_unavailable');
  return { managed: true, status: data.status, provider: data.provider };
}

/** Managed callbacks never accept raw URL tokens, provider codes, implicit flows or duplicate parameters. */
export function managedCallbackInput(url: URL, creator?: ManagedProvider) {
  const provider = /^\/auth\/(google|azure)\/callback$/.exec(url.pathname)?.[1] as ManagedProvider | undefined;
  const keys = [...url.searchParams.keys()];
  const state = url.searchParams.get('state');
  const assertion = url.searchParams.get('assertion');
  if (!provider || (creator && provider !== creator) || url.hash || keys.length !== 2 ||
      keys.filter(key => key === 'state').length !== 1 || keys.filter(key => key === 'assertion').length !== 1 ||
      !state?.trim() || !assertion?.trim()) throw new Error('setup_sign_in_failed');
  return { provider, state, assertion };
}
