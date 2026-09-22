// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

import { mount } from 'svelte'
import './app.css'
import { i18nReady, loadNamespacesForRoute } from './lib/i18n'
import { MANAGED_CLOUD, loadTenantState } from './lib/managed-setup'

// Wait for core i18n namespaces (common + error) then load route-specific
// namespaces before mounting — prevents flash of untranslated keys.
async function start() {
  // Resolve the live server binding on every reload before restoring auth or mounting effects.
  const tenant = MANAGED_CLOUD ? await loadTenantState() : null;
  await Promise.all([
  i18nReady,
  loadNamespacesForRoute(window.location.pathname),
]);
  const target = document.getElementById('app')!;
  if (tenant?.status === 'setup') {
    const { default: ManagedSetupApp } = await import('./lib/ManagedSetupApp.svelte');
    mount(ManagedSetupApp, { target, props: { provider: tenant.provider } });
    return;
  }
  const { default: App } = await import('./App.svelte');
  mount(App, { target });
}

void start().catch(() => {
  // No normal app, token validation, refresh, or authenticated effects on unavailable hosts.
  const target = document.getElementById('app')!;
  const message = document.createElement('p');
  message.setAttribute('role', 'alert');
  message.textContent = 'This workspace is temporarily unavailable. Reload to try again.';
  const retry = document.createElement('button');
  retry.textContent = 'Retry';
  retry.onclick = () => window.location.reload();
  target.replaceChildren(message, retry);
});
