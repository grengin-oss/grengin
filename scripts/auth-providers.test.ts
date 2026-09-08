// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import {
  enabledAuthProviders,
  frontendOAuthRedirectUri,
  normalizeAuthProviders,
  parseOAuthTokenHandoff,
  providerFromCallbackPath,
  providerIconSources,
} from '../src/lib/authProviders.js';

const providers = normalizeAuthProviders([
  { provider: 'auth0', name: 'Auth0', login_path: '/auth/auth0', is_enabled: true, auto_redirect: false },
  { provider: 'keycloak', name: 'Keycloak', login_path: '/auth/keycloak', is_enabled: false, auto_redirect: false },
  // Compatibility with the original endpoint, which returned enabled providers without is_enabled.
  { provider: 'google', name: 'Google', login_path: '/auth/google', auto_redirect: false },
  { provider: '../unsafe', name: 'Unsafe', login_path: '/auth/../unsafe', auto_redirect: false },
]);

assert.deepEqual(providers.map(({ provider }) => provider), ['auth0', 'keycloak', 'google']);
assert.deepEqual(enabledAuthProviders(providers).map(({ provider }) => provider), ['auth0', 'google']);
assert.equal(providerFromCallbackPath('/auth/auth0/callback'), 'auth0');
assert.equal(providerFromCallbackPath('/auth/keycloak-eu/callback'), 'keycloak-eu');
assert.equal(providerFromCallbackPath('/auth/../callback'), null);
assert.equal(providerFromCallbackPath('/auth/%E0%A4%A/callback'), null);
assert.equal(providerFromCallbackPath('/auth/auth0/callback/extra'), null);
assert.equal(frontendOAuthRedirectUri('apple', 'https://chat.example.com'), undefined);
assert.equal(
  frontendOAuthRedirectUri('keycloak', 'https://chat.example.com/'),
  'https://chat.example.com/auth/keycloak/callback',
);
assert.deepEqual(
  parseOAuthTokenHandoff(
    'https://chat.example.com/auth/apple/callback?keep=yes#access_token=access%20value&refresh_token=refresh%20value',
  ),
  {
    accessToken: 'access value',
    refreshToken: 'refresh value',
    cleanPath: '/auth/apple/callback?keep=yes',
  },
);
assert.equal(parseOAuthTokenHandoff('not-a-url'), null);
assert.equal(parseOAuthTokenHandoff('https://chat.example.com/auth/apple/callback'), null);
assert.equal(providerIconSources('github').light, '/github.svg');
assert.equal(
  providerIconSources('auth0').dark,
  'https://meta.grengin.com/auth-providers/auth0/icon-dark.svg',
);

console.log('Auth provider UI contract tests passed.');
