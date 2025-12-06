<script lang="ts">
  import PageHeader from '../components/PageHeader.svelte';

  let currentTab = $state<string>('overview');

  function handleTabClick(tab: string) {
    currentTab = tab;
  }
</script>

<PageHeader
  title="Settings"
  subtitle="Configure system settings and integrations"
/>

<!-- Tab navigation for settings sub-pages -->
<div class="settings-tabs">
  <button class="settings-tab" class:active={currentTab === 'sso'} onclick={() => handleTabClick('sso')}>
    SSO Providers
  </button>
  <button class="settings-tab" class:active={currentTab === 'api-keys'} onclick={() => handleTabClick('api-keys')}>
    API Keys
  </button>
  <button class="settings-tab" class:active={currentTab === 'rate-limits'} onclick={() => handleTabClick('rate-limits')}>
    Rate Limits
  </button>
  <button class="settings-tab" class:active={currentTab === 'budgets'} onclick={() => handleTabClick('budgets')}>
    Budgets
  </button>
</div>

<div class="settings-content">
  {#if currentTab === 'sso'}
    <h2>SSO Providers</h2>
    <p>Configure single sign-on integrations for your organization.</p>
    <p class="settings-note">SSO provider configuration coming soon...</p>
  {:else if currentTab === 'api-keys'}
    <h2>API Keys</h2>
    <p>Manage LLM provider API keys for OpenAI, Anthropic, and other services.</p>
    <p class="settings-note">API key management coming soon...</p>
  {:else if currentTab === 'rate-limits'}
    <h2>Rate Limits</h2>
    <p>Set usage rate limits per user or department to control API consumption.</p>
    <p class="settings-note">Rate limit configuration coming soon...</p>
  {:else if currentTab === 'budgets'}
    <h2>Budgets</h2>
    <p>Configure spending budgets and alerts to monitor costs.</p>
    <p class="settings-note">Budget configuration coming soon...</p>
  {:else}
    <p class="settings-note">
      Please select a settings category from the tabs above:
    </p>
    <ul class="settings-list">
      <li>SSO Providers - Configure single sign-on integrations</li>
      <li>API Keys - Manage LLM provider API keys</li>
      <li>Rate Limits - Set usage rate limits per user or department</li>
      <li>Budgets - Configure spending budgets and alerts</li>
    </ul>
  {/if}
</div>

<style>
  .settings-tabs {
    display: flex;
    gap: var(--space-sm);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    margin-bottom: var(--space-2xl);
    flex-wrap: wrap;
  }
  
  .settings-tab {
    padding: var(--space-md) var(--space-lg);
    color: var(--text-secondary);
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    transition: all 0.2s ease;
    font-weight: 500;
    font-size: 0.9375rem;
    cursor: pointer;
  }
  
  .settings-tab:hover {
    color: var(--text-primary);
    background: rgba(var(--glass-tint), 0.03);
  }
  
  .settings-tab.active {
    color: var(--brand);
    border-bottom-color: var(--brand);
  }

  .settings-content {
    padding: var(--space-xl);
    background: rgba(var(--glass-tint), 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-lg);
  }

  .settings-content h2 {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0 0 var(--space-md) 0;
  }

  .settings-content p {
    font-size: 1rem;
    color: var(--text-secondary);
    margin-bottom: var(--space-lg);
  }

  .settings-note {
    font-size: 0.9375rem;
    color: var(--text-secondary);
    font-style: italic;
  }

  .settings-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .settings-list li {
    padding: var(--space-lg);
    background: rgba(var(--glass-tint), 0.03);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: var(--radius-md);
    color: var(--text-primary);
  }

  @media (max-width: 768px) {
    .settings-tabs {
      overflow-x: auto;
    }
    
    .settings-tab {
      white-space: nowrap;
    }
  }
</style>

