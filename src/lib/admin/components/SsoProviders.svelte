<script lang="ts">
  import { onMount } from "svelte";
  import AdminEmptyState from "./AdminEmptyState.svelte";
  import AdminPanelCard from "./AdminPanelCard.svelte";
  import AdminSectionHeader from "./AdminSectionHeader.svelte";
  import AdminTableCard from "./AdminTableCard.svelte";
  import ErrorMessage from "./ErrorMessage.svelte";
  import LoadingSpinner from "./LoadingSpinner.svelte";
  import Modal from "./Modal.svelte";
  import type { SsoProvider } from "../types.js";
  import {
    getSsoProviders,
    createSsoProvider,
    updateSsoProvider,
    deleteSsoProvider,
  } from "../../api/adminSsoProviders.js";
  import { getModels, type ModelInfo } from "../../api/models.js";

  // Provider options for the dropdown
  const providerOptions = [
    { value: "google", label: "Google" },
    { value: "microsoft", label: "Microsoft" },
    { value: "github", label: "GitHub" },
    { value: "anthropic", label: "Anthropic" },
    { value: "openai", label: "OpenAI" },
  ];

  let providers = $state<SsoProvider[]>([]);
  let availableModels = $state<Map<string, ModelInfo[]>>(new Map());
  let loading = $state(true);
  let error = $state<string | null>(null);
  let showModal = $state(false);
  let editingProvider = $state<SsoProvider | null>(null);

  // Form state
  let formData = $state({
    provider: "google",
    name: "",
    client_id: "",
    client_secret: "",
    callback_url: "https://localhost:3000/auth/callback",
    is_enabled: true,
    selected_models: [] as string[],
  });

  let currentProviderModels = $derived.by(() => {
    const providerKey = formData.provider;
    if (providerKey === "anthropic" || providerKey === "openai") {
      return availableModels.get(providerKey) || [];
    }
    return [];
  });

  async function loadProviders() {
    try {
      loading = true;
      error = null;

      // Load SSO providers
      providers = await getSsoProviders();
      console.log(providers);

      // Load available models for Anthropic and OpenAI
      const modelsResponse = await getModels();
      modelsResponse.providers.forEach((p) => {
        if (p.key === "anthropic" || p.key === "openai") {
          availableModels.set(p.key, p.models);
        }
      });
    } catch (err: any) {
      error = err.message || "Failed to load SSO providers";
      console.error("Error loading SSO providers:", err);
    } finally {
      loading = false;
    }
  }

  function openAddModal() {
    editingProvider = null;
    formData = {
      provider: "google",
      name: "",
      client_id: "",
      client_secret: "",
      callback_url: "https://localhost:3000/auth/callback",
      is_enabled: true,
      selected_models: [],
    };
    showModal = true;
  }

  function openEditModal(provider: SsoProvider) {
    editingProvider = provider;
    formData = {
      provider: provider.provider,
      name: provider.name,
      client_id: provider.client_id,
      client_secret: "",
      callback_url: provider.issuer_url,
      is_enabled: provider.is_enabled,
      selected_models: [],
    };
    showModal = true;
  }

  function closeModal() {
    showModal = false;
    editingProvider = null;
  }

  async function handleSubmit() {
    try {
      const data = {
        provider: formData.provider,
        name: formData.name || formData.provider,
        client_id: formData.client_id,
        client_secret: formData.client_secret,
        issuer_url: formData.callback_url,
        scopes: ["openid", "email", "profile"],
        allowed_domains: [],
        is_enabled: formData.is_enabled,
        is_default: false,
      };

      if (editingProvider) {
        await updateSsoProvider(editingProvider.id, data);
      } else {
        await createSsoProvider(data);
      }

      await loadProviders();
      closeModal();
    } catch (err: any) {
      error = err.message || "Failed to save SSO provider";
      console.error("Error saving SSO provider:", err);
    }
  }

  async function handleDelete(providerId: string) {
    if (!confirm("Are you sure you want to delete this SSO provider?")) {
      return;
    }

    try {
      await deleteSsoProvider(providerId);
      await loadProviders();
    } catch (err: any) {
      error = err.message || "Failed to delete SSO provider";
      console.error("Error deleting SSO provider:", err);
    }
  }

  async function toggleProviderStatus(provider: SsoProvider) {
    try {
      await updateSsoProvider(provider.id, {
        is_enabled: !provider.is_enabled,
      });
      await loadProviders();
    } catch (err: any) {
      error = err.message || "Failed to update provider status";
      console.error("Error updating provider status:", err);
    }
  }

  function handleProviderChange() {
    // Reset models selection when provider changes
    formData.selected_models = [];
    // Update callback URL based on provider if needed
    if (formData.provider === "google") {
      formData.callback_url = "https://localhost:3000/auth/google/callback";
    } else if (formData.provider === "microsoft") {
      formData.callback_url = "https://localhost:3000/auth/microsoft/callback";
    } else if (formData.provider === "github") {
      formData.callback_url = "https://localhost:3000/auth/github/callback";
    } else {
      formData.callback_url = "https://localhost:3000/auth/callback";
    }
  }

  function toggleModel(modelId: string) {
    const index = formData.selected_models.indexOf(modelId);
    if (index > -1) {
      formData.selected_models = formData.selected_models.filter(
        (id) => id !== modelId
      );
    } else {
      formData.selected_models = [...formData.selected_models, modelId];
    }
  }

  onMount(() => {
    loadProviders();
  });
</script>

<div class="sso-providers-container">
  <AdminSectionHeader
    title="SSO Providers"
    subtitle="Configure single sign-on integrations for your organization"
  >
    {#snippet actions()}
      <button class="btn-primary" onclick={openAddModal}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Add Provider
      </button>
    {/snippet}
  </AdminSectionHeader>

  {#if loading}
    <AdminPanelCard>
      <LoadingSpinner text="Loading providers..." />
    </AdminPanelCard>
  {:else if error}
    <AdminPanelCard>
      <ErrorMessage message={error} onretry={loadProviders} />
    </AdminPanelCard>
  {:else if providers.length === 0}
    <AdminPanelCard>
      <AdminEmptyState
        title="No SSO providers configured"
        message="Add a provider to enable single sign-on."
      >
        {#snippet icon()}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="9" y1="9" x2="15" y2="15" />
            <line x1="15" y1="9" x2="9" y2="15" />
          </svg>
        {/snippet}
        {#snippet actions()}
          <button class="btn-primary" onclick={openAddModal}>
            Add Your First Provider
          </button>
        {/snippet}
      </AdminEmptyState>
    </AdminPanelCard>
  {:else}
    <AdminTableCard minWidth="760px">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Provider Name</th>
            <th>Client ID</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each providers as provider (provider.id)}
            <tr>
              <td class="provider-name">
                <span class="provider-label">{provider.name}</span>
              </td>
              <td class="client-id">
                <span class="client-id-text">{provider.client_id}</span>
              </td>
              <td>
                <button
                  class="status-toggle"
                  class:active={provider.is_enabled}
                  onclick={() => toggleProviderStatus(provider)}
                  aria-label={provider.is_enabled ? "Active" : "Inactive"}
                >
                  <span class="toggle-label"
                    >{provider.is_enabled ? "ON" : "OFF"}</span
                  >
                  <span class="toggle-slider"></span>
                </button>
              </td>
              <td>
                <div class="actions">
                  <button
                    class="action-btn edit-btn"
                    onclick={() => openEditModal(provider)}
                    aria-label="Edit provider"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <path
                        d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
                      />
                      <path
                        d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
                      />
                    </svg>
                  </button>
                  <button
                    class="action-btn delete-btn"
                    onclick={() => handleDelete(provider.id)}
                    aria-label="Delete provider"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <polyline points="3 6 5 6 21 6" />
                      <path
                        d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                      />
                    </svg>
                  </button>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </AdminTableCard>
  {/if}
</div>

<Modal
  bind:isOpen={showModal}
  title={editingProvider ? "Edit SSO Provider" : "Add SSO Provider"}
  onclose={closeModal}
>
  {#snippet children()}
    <form
      class="provider-form"
      onsubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
    >
      <div class="form-group">
        <label for="provider">Provider Name</label>
        <select
          id="provider"
          bind:value={formData.provider}
          onchange={handleProviderChange}
          disabled={!!editingProvider}
          required
        >
          {#each providerOptions as option}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
      </div>

      <div class="form-group">
        <label for="client_id">Client ID</label>
        <input
          type="text"
          id="client_id"
          bind:value={formData.client_id}
          placeholder="Client ID"
          required
        />
      </div>

      <div class="form-group">
        <label for="client_secret">Client Secret</label>
        <input
          type="password"
          id="client_secret"
          bind:value={formData.client_secret}
          placeholder="••••••••••"
          required={!editingProvider}
        />
      </div>

      <div class="form-group">
        <label for="callback_url">Callback URL</label>
        <input
          type="url"
          id="callback_url"
          bind:value={formData.callback_url}
          placeholder="https://localhost:3000/auth/callback"
          required
        />
      </div>

      {#if currentProviderModels.length > 0}
        <div class="form-group models-section">
          <span class="models-label">Models</span>
          <div class="models-list">
            {#each currentProviderModels as model}
              <label class="model-checkbox">
                <input
                  type="checkbox"
                  checked={formData.selected_models.includes(model.key)}
                  onchange={() => toggleModel(model.key)}
                />
                <span class="model-name">{model.name} ({model.key})</span>
              </label>
            {/each}
          </div>
        </div>
      {/if}

      <div class="form-group">
        <label for="status">Status</label>
        <div class="status-toggle-wrapper">
          <button
            type="button"
            class="status-toggle"
            class:active={formData.is_enabled}
            onclick={() => (formData.is_enabled = !formData.is_enabled)}
            aria-label={formData.is_enabled ? "Active" : "Inactive"}
          >
            <span class="toggle-slider"></span>
          </button>
          <span class="status-label"
            >{formData.is_enabled ? "Active" : "Inactive"}</span
          >
        </div>
      </div>

      <div class="form-actions">
        <button type="button" class="btn-secondary" onclick={closeModal}>
          Cancel
        </button>
        <button type="submit" class="btn-primary">
          {editingProvider ? "Save Changes" : "Add Provider"}
        </button>
      </div>
    </form>
  {/snippet}
</Modal>

<style>
  .sso-providers-container {
    display: flex;
    flex-direction: column;
    gap: var(--space-xl);
  }

  .provider-name {
    font-weight: 500;
  }

  .provider-label {
    font-size: 0.9375rem;
    color: var(--text-primary);
  }

  .client-id {
    font-family: "Courier New", monospace;
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .client-id-text {
    display: inline-block;
    max-width: 20rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .status-toggle {
    position: relative;
    display: inline-flex;
    align-items: center;
    width: 3.5rem;
    height: 1.5rem;
    background: rgba(255, 255, 255, 0.1);
    border: none;
    border-radius: 0.75rem;
    cursor: pointer;
    transition: background 0.2s ease;
    margin-right: var(--space-sm);
    padding-left: 0.25rem;
  }

  .status-toggle.active {
    background: var(--brand-green);
  }

  .toggle-label {
    font-size: 0.625rem;
    font-weight: 700;
    color: white;
    z-index: 1;
    margin-left: 0.125rem;
  }

  .toggle-slider {
    position: absolute;
    top: 0.125rem;
    left: 0.125rem;
    width: 1.25rem;
    height: 1.25rem;
    background: white;
    border-radius: 50%;
    transition: transform 0.2s ease;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .status-toggle.active .toggle-slider {
    transform: translateX(2rem);
  }

  .status-toggle.active .toggle-label {
    margin-left: 0.125rem;
  }

  .actions {
    display: flex;
    gap: var(--space-sm);
  }

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    padding: 0;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .action-btn svg {
    width: 1rem;
    height: 1rem;
  }

  .edit-btn {
    background: rgba(var(--brand-rgb), 0.1);
    color: var(--brand);
  }

  .edit-btn:hover {
    background: rgba(var(--brand-rgb), 0.2);
  }

  .delete-btn {
    background: rgba(var(--brand-red-rgb), 0.1);
    color: var(--brand-red);
  }

  .delete-btn:hover {
    background: rgba(var(--brand-red-rgb), 0.2);
  }

  /* Form styles */
  .provider-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .form-group label {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .form-group input,
  .form-group select {
    padding: var(--space-md);
    background: rgba(var(--glass-tint), 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: 0.9375rem;
    transition: all 0.2s ease;
  }

  .form-group input:focus,
  .form-group select:focus {
    outline: none;
    border-color: var(--brand);
    background: rgba(var(--glass-tint), 0.05);
  }

  .form-group input::placeholder {
    color: var(--text-secondary);
    opacity: 0.5;
  }

  .form-group select:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .models-section {
    padding: var(--space-lg);
    background: rgba(var(--glass-tint), 0.02);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: var(--radius-md);
  }

  .models-label {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary);
    display: block;
    margin-bottom: var(--space-sm);
  }

  .models-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    max-height: 15rem;
    overflow-y: auto;
  }

  .model-checkbox {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-sm);
    cursor: pointer;
    transition: background 0.2s ease;
    border-radius: var(--radius-sm);
  }

  .model-checkbox:hover {
    background: rgba(var(--glass-tint), 0.03);
  }

  .model-checkbox input[type="checkbox"] {
    width: 1.125rem;
    height: 1.125rem;
    cursor: pointer;
    accent-color: var(--brand);
  }

  .model-checkbox span {
    font-size: 0.875rem;
    color: var(--text-primary);
  }

  .model-name {
    font-size: 0.875rem;
    color: var(--text-primary);
  }

  .status-toggle-wrapper {
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }

  .status-label {
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-md);
    margin-top: var(--space-lg);
    padding-top: var(--space-lg);
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  @media (max-width: 768px) {
    .form-actions {
      flex-direction: column-reverse;
    }

    .form-actions button {
      width: 100%;
    }
  }
</style>
