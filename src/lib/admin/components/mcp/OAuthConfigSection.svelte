<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { _ } from 'svelte-i18n';
  import type { McpAuthType, McpAuthMode, McpOAuthProvider } from '../../types.js';

  interface Props {
    authType: McpAuthType;
    authMode: McpAuthMode | null;
    oauthProvider: McpOAuthProvider | null;
    clientId: string;
    clientSecret: string;
    scopes: string;
    authUrl: string;
    tokenUrl: string;
    showClientSecret: boolean;
    disabled?: boolean;
    /**
     * The mcp-servers design puts the Auth Type choice in the dialog's own
     * "Connection" section, so the page owns that control and this section
     * renders only the OAuth detail that hangs off it.
     */
    hideAuthType?: boolean;
    errors?: Record<string, string>;
    onAuthTypeChange: (value: McpAuthType) => void;
    onAuthModeChange: (value: McpAuthMode) => void;
    onProviderChange: (value: McpOAuthProvider) => void;
    onClientIdChange: (value: string) => void;
    onClientSecretChange: (value: string) => void;
    onScopesChange: (value: string) => void;
    onAuthUrlChange: (value: string) => void;
    onTokenUrlChange: (value: string) => void;
    onToggleSecret: () => void;
  }

  let {
    authType,
    authMode,
    oauthProvider,
    clientId,
    clientSecret,
    scopes,
    authUrl,
    tokenUrl,
    showClientSecret,
    disabled = false,
    hideAuthType = false,
    errors = {},
    onAuthTypeChange,
    onAuthModeChange,
    onProviderChange,
    onClientIdChange,
    onClientSecretChange,
    onScopesChange,
    onAuthUrlChange,
    onTokenUrlChange,
    onToggleSecret,
  }: Props = $props();

  const PROVIDER_PRESETS: Record<string, { authUrl: string; tokenUrl: string; defaultScopes: string }> = {
    atlassian: {
      authUrl: 'https://auth.atlassian.com/authorize',
      tokenUrl: 'https://auth.atlassian.com/oauth/token',
      defaultScopes: 'read:jira-work,write:jira-work,read:confluence-content.all',
    },
    google: {
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      defaultScopes: '',
    },
    github: {
      authUrl: 'https://github.com/login/oauth/authorize',
      tokenUrl: 'https://github.com/login/oauth/access_token',
      defaultScopes: 'repo,read:user',
    },
    slack: {
      authUrl: 'https://slack.com/oauth/v2/authorize',
      tokenUrl: 'https://slack.com/api/oauth.v2.access',
      defaultScopes: 'chat:write,channels:history,users:read',
    },
  };

  function handleProviderSelect(value: string) {
    const provider = value as McpOAuthProvider;
    onProviderChange(provider);

    const preset = PROVIDER_PRESETS[provider];
    if (preset) {
      onAuthUrlChange(preset.authUrl);
      onTokenUrlChange(preset.tokenUrl);
      if (preset.defaultScopes && !scopes) {
        onScopesChange(preset.defaultScopes);
      }
    } else {
      onAuthUrlChange('');
      onTokenUrlChange('');
    }
  }

  function handleAuthTypeSelect(e: Event) {
    const target = e.currentTarget as HTMLSelectElement;
    onAuthTypeChange(target.value as McpAuthType);
  }

  function handleProviderSelectEvent(e: Event) {
    const target = e.currentTarget as HTMLSelectElement;
    handleProviderSelect(target.value);
  }

  const isOAuth = $derived(authType === 'oauth2');
  const isCustomProvider = $derived(oauthProvider === 'custom');
  const showAdvanced = $derived(isOAuth && isCustomProvider);
</script>

<div class="oauth-config-section">
  {#if !hideAuthType}
    <div class="section-header">
      <h4 class="section-title">{$_('admin.mcpOAuth.authentication')}</h4>
    </div>

    <div class="form-group">
      <label for="auth-type">{$_('admin.mcpOAuth.authType')}</label>
      <select
        id="auth-type"
        value={authType}
        onchange={handleAuthTypeSelect}
        {disabled}
      >
        <option value="none">{$_('admin.mcpOAuth.authTypes.none')}</option>
        <option value="api_key">{$_('admin.mcpOAuth.authTypes.apiKey')}</option>
        <option value="oauth2">{$_('admin.mcpOAuth.authTypes.oauth2')}</option>
      </select>
    </div>
  {/if}

  {#if isOAuth}
    <div class="oauth-fields" class:oauth-fields--disabled={disabled}>
      <div class="form-group">
        <label for="oauth-provider">{$_('admin.mcpOAuth.provider')}</label>
        <select
          id="oauth-provider"
          value={oauthProvider || ''}
          onchange={handleProviderSelectEvent}
          {disabled}
          class:error={Boolean(errors.oauth_provider)}
        >
          <option value="">{$_('admin.mcpOAuth.selectProvider')}</option>
          <option value="atlassian">Atlassian</option>
          <option value="google">Google</option>
          <option value="github">GitHub</option>
          <option value="slack">Slack</option>
          <option value="custom">{$_('admin.mcpOAuth.custom')}</option>
        </select>
        {#if errors.oauth_provider}
          <span class="error-text">{errors.oauth_provider}</span>
        {/if}
      </div>

      <div class="form-group">
        <span class="section-label" id="auth-mode-label">{$_('admin.mcpOAuth.authMode')}</span>
        <div class="auth-mode-options" role="radiogroup" aria-labelledby="auth-mode-label">
          <label class="auth-mode-option" class:auth-mode-option--active={authMode === 'organization'}>
            <input
              type="radio"
              name="auth_mode"
              value="organization"
              checked={authMode === 'organization'}
              onchange={() => onAuthModeChange('organization')}
              {disabled}
            />
            <div class="auth-mode-radio"><div class="radio-dot"></div></div>
            <div class="auth-mode-content">
              <span class="auth-mode-label">{$_('admin.mcpOAuth.authModes.organization')}</span>
              <span class="auth-mode-desc">{$_('admin.mcpOAuth.authModes.organizationDesc')}</span>
            </div>
          </label>
          <label class="auth-mode-option" class:auth-mode-option--active={authMode === 'per_user'}>
            <input
              type="radio"
              name="auth_mode"
              value="per_user"
              checked={authMode === 'per_user'}
              onchange={() => onAuthModeChange('per_user')}
              {disabled}
            />
            <div class="auth-mode-radio"><div class="radio-dot"></div></div>
            <div class="auth-mode-content">
              <span class="auth-mode-label">{$_('admin.mcpOAuth.authModes.perUser')}</span>
              <span class="auth-mode-desc">{$_('admin.mcpOAuth.authModes.perUserDesc')}</span>
            </div>
          </label>
        </div>
      </div>

      <div class="form-group">
        <label for="oauth-client-id">{$_('admin.mcpOAuth.clientId')}</label>
        <input
          id="oauth-client-id"
          type="text"
          value={clientId}
          oninput={(e) => onClientIdChange(e.currentTarget.value)}
          class:error={Boolean(errors.client_id)}
          placeholder={$_('admin.mcpOAuth.clientIdPlaceholder')}
          {disabled}
        />
        {#if errors.client_id}
          <span class="error-text">{errors.client_id}</span>
        {/if}
      </div>

      <div class="form-group">
        <label for="oauth-client-secret">{$_('admin.mcpOAuth.clientSecret')}</label>
        <div class="client-secret-row">
          <input
            id="oauth-client-secret"
            type={showClientSecret ? 'text' : 'password'}
            value={clientSecret}
            oninput={(e) => onClientSecretChange(e.currentTarget.value)}
            class:error={Boolean(errors.client_secret)}
            placeholder={$_('admin.mcpOAuth.clientSecretPlaceholder')}
            autocomplete="off"
            spellcheck="false"
            {disabled}
          />
          <button
            type="button"
            class="secret-toggle"
            onclick={onToggleSecret}
            aria-label={showClientSecret ? $_('admin.mcpOAuth.hideSecret') : $_('admin.mcpOAuth.showSecret')}
          >
            {#if showClientSecret}
              <svg width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="M2 5.27L3.28 4 20 20.72 18.73 22l-3.08-3.08c-1.15.38-2.37.58-3.65.58-5 0-9.27-3.11-11-7.5.69-1.76 1.79-3.31 3.19-4.54zM12 9a3 3 0 0 1 3 3 3 3 0 0 1-.17 1L11 9.17A3 3 0 0 1 12 9m0-4.5c5 0 9.27 3.11 11 7.5a11.8 11.8 0 0 1-4 5.19l-1.42-1.43A9.86 9.86 0 0 0 20.82 12 9.82 9.82 0 0 0 12 6.5c-1.09 0-2.16.18-3.16.5L7.3 5.47c1.44-.62 3.03-.97 4.7-.97M3.18 12A9.82 9.82 0 0 0 12 17.5c.69 0 1.37-.07 2-.21L11.72 15A3.064 3.064 0 0 1 9 12.28L5.6 8.87c-.99.85-1.82 1.91-2.42 3.13"/></svg>
            {:else}
              <svg width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm0-4.5c5 0 9.27 3.11 11 7.5-1.73 4.39-6 7.5-11 7.5S2.73 16.39 1 12c1.73-4.39 6-7.5 11-7.5zM3.18 12a9.821 9.821 0 0 0 17.64 0 9.821 9.821 0 0 0-17.64 0"/></svg>
            {/if}
          </button>
        </div>
        {#if errors.client_secret}
          <span class="error-text">{errors.client_secret}</span>
        {/if}
      </div>

      <div class="form-group">
        <label for="oauth-scopes">{$_('admin.mcpOAuth.scopes')}</label>
        <input
          id="oauth-scopes"
          type="text"
          value={scopes}
          oninput={(e) => onScopesChange(e.currentTarget.value)}
          placeholder={$_('admin.mcpOAuth.scopesPlaceholder')}
          {disabled}
        />
        <span class="form-hint">{$_('admin.mcpOAuth.scopesHint')}</span>
      </div>

      {#if showAdvanced}
        <div class="advanced-section">
          <div class="advanced-label">{$_('admin.mcpOAuth.advanced')}</div>

          <div class="form-group">
            <label for="oauth-auth-url">{$_('admin.mcpOAuth.authUrl')}</label>
            <input
              id="oauth-auth-url"
              type="text"
              value={authUrl}
              oninput={(e) => onAuthUrlChange(e.currentTarget.value)}
              class:error={Boolean(errors.auth_url)}
              placeholder="https://provider.com/oauth/authorize"
              {disabled}
            />
            {#if errors.auth_url}
              <span class="error-text">{errors.auth_url}</span>
            {/if}
          </div>

          <div class="form-group">
            <label for="oauth-token-url">{$_('admin.mcpOAuth.tokenUrl')}</label>
            <input
              id="oauth-token-url"
              type="text"
              value={tokenUrl}
              oninput={(e) => onTokenUrlChange(e.currentTarget.value)}
              class:error={Boolean(errors.token_url)}
              placeholder="https://provider.com/oauth/token"
              {disabled}
            />
            {#if errors.token_url}
              <span class="error-text">{errors.token_url}</span>
            {/if}
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  /* ===== mcp-servers.html, transcribed =====
     This section renders inside the Add/Edit MCP Server dialog, so every
     control repeats that design's field vocabulary: a 13px/700 label over a
     9px-radius box carrying a 1.5px inset ring that turns blue on focus. */

  /* app.css paints bare <input>/<select>/<button> as a glass pill. Strip that
     once here so each rule below paints its own flat skin. */
  input,
  select {
    width: 100%;
    border: 0;
    border-radius: 0;
    outline: none;
    background: transparent;
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    font-family: var(--gx-font);
  }

  button {
    padding: 0;
    border: 0;
    border-radius: 0;
    background: none;
    box-shadow: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
    transition: none;
  }

  button:hover,
  button:active {
    transform: none;
    box-shadow: none;
    background: none;
  }

  .oauth-config-section {
    display: flex;
    flex-direction: column;
    gap: 14px;
    align-self: stretch;
    font-family: var(--gx-font);
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .section-title {
    margin: 0;
    font-weight: 700;
    font-size: 11px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    color: var(--gx-mcp-m-section);
  }

  /* ".add-field" */
  .form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  /* ".add-label" */
  .form-group label,
  .section-label {
    font-weight: 700;
    font-size: 13px;
    line-height: 100%;
    color: var(--gx-mcp-m-label);
  }

  /* ".add-input" */
  .form-group input,
  .form-group select {
    padding: 10px 13px;
    border-radius: 9px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1.5px var(--gx-mcp-m-ring);
    color: var(--gx-mcp-m-ink);
    font-weight: 400;
    font-size: 14px;
    transition: box-shadow 120ms ease;
  }

  .form-group select {
    appearance: none;
    cursor: pointer;
    /* Room for the chevron the background image paints on the trailing edge. */
    padding-inline-end: 34px;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none'%3E%3Cpath d='m3 4.5 3 3 3-3' stroke='%236B7281' stroke-width='1.2'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 13px center;
  }

  :global([dir="rtl"]) .form-group select {
    background-position: left 13px center;
  }

  .form-group input:focus,
  .form-group select:focus {
    box-shadow: inset 0 0 0 1.5px var(--gx-tx-chip-icon-fg);
  }

  .form-group input::placeholder {
    color: var(--gx-mcp-m-placeholder);
    opacity: 1;
  }

  .form-group input.error,
  .form-group select.error {
    box-shadow: inset 0 0 0 1.5px var(--gx-mcp-deny);
  }

  .error-text {
    font-weight: 500;
    font-size: 12px;
    line-height: 1.4;
    color: var(--gx-mcp-deny);
  }

  /* ".seg-help" */
  .form-hint {
    font-weight: 400;
    font-size: 12px;
    line-height: 1.4;
    color: var(--gx-mcp-m-placeholder);
  }

  /* The OAuth detail sits in a tinted well so it reads as one block hanging off
     the Auth Type choice above it. */
  .oauth-fields {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 14px;
    border-radius: 12px;
    background: var(--gx-mcp-code-bg);
    box-shadow: inset 0 0 0 1px var(--gx-mcp-m-hair);
  }

  .oauth-fields--disabled {
    opacity: 0.6;
    pointer-events: none;
  }

  .auth-mode-options {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .auth-mode-option {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 10px 12px;
    border-radius: 9px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1.5px var(--gx-mcp-m-ring);
    cursor: pointer;
    transition:
      box-shadow 120ms ease,
      background-color 120ms ease;
  }

  .auth-mode-option input[type="radio"] {
    display: none;
  }

  .auth-mode-option:hover {
    background: var(--gx-an-field-bg);
  }

  .auth-mode-option--active {
    background: var(--gx-ae-callout-bg);
    box-shadow: inset 0 0 0 1.5px var(--gx-tx-chip-icon-fg);
  }

  .auth-mode-radio {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 1.5px solid var(--gx-mcp-m-cancel-ring);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    margin-top: 2px;
    transition: border-color 120ms ease;
  }

  .auth-mode-option--active .auth-mode-radio {
    border-color: var(--gx-tx-chip-icon-fg);
  }

  .radio-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: transparent;
    transition: background 120ms ease;
  }

  .auth-mode-option--active .radio-dot {
    background: var(--gx-tx-chip-icon-fg);
  }

  .auth-mode-content {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .auth-mode-label {
    font-weight: 600;
    font-size: 13px;
    line-height: 100%;
    color: var(--gx-mcp-m-label);
  }

  .auth-mode-desc {
    font-weight: 400;
    font-size: 11px;
    line-height: 1.4;
    color: var(--gx-mcp-dim);
  }

  /* The reveal button is welded to the trailing edge of the secret field, so the
     two share one ring: the input drops its own on that side. */
  .client-secret-row {
    display: flex;
    align-items: stretch;
    border-radius: 9px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1.5px var(--gx-mcp-m-ring);
    transition: box-shadow 120ms ease;
  }

  .client-secret-row:focus-within {
    box-shadow: inset 0 0 0 1.5px var(--gx-tx-chip-icon-fg);
  }

  .client-secret-row:has(input.error) {
    box-shadow: inset 0 0 0 1.5px var(--gx-mcp-deny);
  }

  .client-secret-row input {
    flex: 1;
    min-width: 0;
    padding: 10px 13px;
    border-radius: 9px;
    background: transparent;
    box-shadow: none;
    color: var(--gx-mcp-m-ink);
    font-weight: 400;
    font-size: 14px;
  }

  .client-secret-row input:focus,
  .client-secret-row input.error {
    box-shadow: none;
  }

  .secret-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    flex-shrink: 0;
    color: var(--gx-an-sub);
    transition: color 120ms ease;
  }

  .secret-toggle:hover {
    color: var(--gx-mcp-m-ink);
  }

  .secret-toggle svg {
    display: block;
  }

  .advanced-section {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding-top: 14px;
    border-top: 1px dashed var(--gx-mcp-m-ring);
  }

  .advanced-label {
    font-weight: 700;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--gx-mcp-m-section);
  }

  @media (max-width: 600px) {
    .auth-mode-options {
      grid-template-columns: 1fr;
    }
  }
</style>
