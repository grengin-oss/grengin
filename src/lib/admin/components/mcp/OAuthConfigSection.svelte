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
  .oauth-config-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .section-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .form-group label,
  .section-label {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-secondary);
  }

  .form-group input,
  .form-group select {
    padding: var(--space-sm) var(--space-md);
    background: rgba(var(--glass-tint), 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: 0.875rem;
    transition: border-color 0.2s ease;
  }

  .form-group input:focus,
  .form-group select:focus {
    outline: none;
    border-color: var(--brand);
  }

  .form-group input.error,
  .form-group select.error {
    border-color: var(--brand-red);
  }

  .error-text {
    font-size: 0.75rem;
    color: var(--brand-red);
  }

  .form-hint {
    font-size: 0.75rem;
    color: var(--text-tertiary);
  }

  .oauth-fields {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    padding: var(--space-lg);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: var(--radius-lg);
    background: rgba(var(--glass-tint), 0.02);
  }

  .oauth-fields--disabled {
    opacity: 0.6;
    pointer-events: none;
  }

  .auth-mode-options {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-md);
  }

  .auth-mode-option {
    display: flex;
    align-items: flex-start;
    gap: var(--space-sm);
    padding: var(--space-md);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all 0.2s ease;
    background: transparent;
  }

  .auth-mode-option input[type="radio"] {
    display: none;
  }

  .auth-mode-option:hover {
    border-color: rgba(255, 255, 255, 0.16);
    background: rgba(var(--glass-tint), 0.04);
  }

  .auth-mode-option--active {
    border-color: var(--brand);
    background: rgba(var(--brand-rgb), 0.06);
  }

  .auth-mode-radio {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, 0.2);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    margin-top: 2px;
    transition: border-color 0.2s ease;
  }

  .auth-mode-option--active .auth-mode-radio {
    border-color: var(--brand);
  }

  .radio-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: transparent;
    transition: background 0.2s ease;
  }

  .auth-mode-option--active .radio-dot {
    background: var(--brand);
  }

  .auth-mode-content {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .auth-mode-label {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .auth-mode-desc {
    font-size: 0.75rem;
    color: var(--text-tertiary);
    line-height: 1.4;
  }

  .client-secret-row {
    display: flex;
    gap: 0;
    align-items: stretch;
  }

  .client-secret-row input {
    flex: 1;
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
    padding: var(--space-sm) var(--space-md);
    background: rgba(var(--glass-tint), 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-right: none;
    color: var(--text-primary);
    font-size: 0.875rem;
  }

  .client-secret-row input:focus {
    outline: none;
    border-color: var(--brand);
  }

  .client-secret-row input.error {
    border-color: var(--brand-red);
  }

  .secret-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 var(--space-sm);
    background: rgba(var(--glass-tint), 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-left: none;
    border-top-right-radius: var(--radius-md);
    border-bottom-right-radius: var(--radius-md);
    color: var(--text-secondary);
    cursor: pointer;
    transition: color 0.2s ease;
  }

  .secret-toggle:hover {
    color: var(--text-primary);
  }

  .advanced-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    padding-top: var(--space-md);
    border-top: 1px dashed rgba(255, 255, 255, 0.06);
  }

  .advanced-label {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-tertiary);
  }

  @media (max-width: 600px) {
    .auth-mode-options {
      grid-template-columns: 1fr;
    }
  }
</style>
