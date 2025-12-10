<script lang="ts">
  import { onMount } from "svelte";
  import AdminEmptyState from "./AdminEmptyState.svelte";
  import AdminPanelCard from "./AdminPanelCard.svelte";
  import AdminSectionHeader from "./AdminSectionHeader.svelte";
  import AdminTableCard from "./AdminTableCard.svelte";
  import LoadingSpinner from "./LoadingSpinner.svelte";
  import Modal from "./Modal.svelte";
  import { toast } from "../../components/Toaster.svelte";
  import type { ApiKey } from "../types.js";
  import {
    getApiKeys,
    createApiKey,
    deleteApiKey,
    validateApiKey,
  } from "../../api/adminSettings.js";

  const providerOptions = [
    { value: "openai", label: "OpenAI" },
    { value: "anthropic", label: "Anthropic" },
    { value: "groq", label: "Groq" },
  ];

  let apiKeys = $state<ApiKey[]>([]);
  let loading = $state(true);
  let showModal = $state(false);
  let validatingKeyId = $state<string | null>(null);
  let copiedKeyId = $state<string | null>(null);

  let formData = $state({
    provider: "openai" as "openai" | "anthropic" | "groq",
    name: "",
    api_key: "",
  });

  async function loadApiKeys() {
    try {
      loading = true;
      apiKeys = await getApiKeys();
    } catch (err: any) {
      toast.error(err.message || "Failed to load API keys");
    } finally {
      loading = false;
    }
  }

  function openAddModal() {
    formData = {
      provider: "openai",
      name: "",
      api_key: "",
    };
    showModal = true;
  }

  function closeModal() {
    showModal = false;
  }

  async function handleSubmit() {
    try {
      await createApiKey({
        provider: formData.provider,
        name: formData.name || `${formData.provider} Key`,
        api_key: formData.api_key,
      });
      toast.success("API key created successfully");
      await loadApiKeys();
      closeModal();
    } catch (err: any) {
      toast.error(err.message || "Failed to create API key");
    }
  }

  async function handleDelete(keyId: string) {
    if (!confirm("Are you sure you want to revoke this API key?")) {
      return;
    }
    try {
      await deleteApiKey(keyId);
      toast.success("API key revoked");
      await loadApiKeys();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete API key");
    }
  }

  async function handleValidate(keyId: string) {
    try {
      validatingKeyId = keyId;
      const result = await validateApiKey(keyId);
      if (result.valid) {
        const keyIndex = apiKeys.findIndex((k) => k.id === keyId);
        if (keyIndex !== -1) {
          apiKeys[keyIndex].is_valid = true;
        }
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to validate API key");
    } finally {
      validatingKeyId = null;
    }
  }

  async function handleCopy(keyPreview: string) {
    try {
      await navigator.clipboard.writeText(keyPreview);
      const key = apiKeys.find((k) => k.key_preview === keyPreview);
      if (key) {
        copiedKeyId = key.id;
        toast.success("Copied to clipboard");
        setTimeout(() => {
          copiedKeyId = null;
        }, 2000);
      }
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  }

  function formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "numeric",
      day: "numeric",
      year: "numeric",
    });
  }

  onMount(() => {
    loadApiKeys();
  });
</script>

<div class="api-keys-container">
  <AdminSectionHeader
    title="API Keys"
    subtitle="Manage API keys for accessing your organization's resources."
  >
    {#snippet actions()}
      <button class="btn-primary" onclick={openAddModal}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Create New API Key
      </button>
    {/snippet}
  </AdminSectionHeader>

  {#if loading}
    <AdminPanelCard>
      <LoadingSpinner text="Loading API keys..." />
    </AdminPanelCard>
  {:else if apiKeys.length === 0}
    <AdminPanelCard>
      <AdminEmptyState
        title="No API keys configured"
        message="Create a key to connect to your providers."
      >
        {#snippet icon()}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        {/snippet}
        {#snippet actions()}
          <button class="btn-primary" onclick={openAddModal}>
            Create Your First API Key
          </button>
        {/snippet}
      </AdminEmptyState>
    </AdminPanelCard>
  {:else}
    <AdminTableCard minWidth="840px">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Provider</th>
            <th>Name</th>
            <th>Key Preview</th>
            <th>Status</th>
            <th>Created At</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each apiKeys as key (key.id)}
            <tr>
              <td class="provider-cell">
                <span class="provider-label">{key.provider}</span>
              </td>
              <td class="name-cell">
                <span class="name-text">{key.name}</span>
              </td>
              <td class="key-preview">
                <span class="key-preview-text">{key.key_preview}</span>
              </td>
              <td>
                <span
                  class="status-badge"
                  class:valid={key.is_valid}
                  class:invalid={!key.is_valid}
                >
                  {key.is_valid ? "Valid" : "Invalid"}
                </span>
              </td>
              <td class="date-cell">
                <span class="date-text">{formatDate(key.created_at)}</span>
              </td>
              <td>
                <div class="actions">
                  <button
                    class="action-btn validate-btn"
                    onclick={() => handleValidate(key.id)}
                    disabled={validatingKeyId === key.id}
                    aria-label="Validate key"
                  >
                    {#if validatingKeyId === key.id}
                      <div class="btn-spinner"></div>
                    {:else}
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    {/if}
                    Validate
                  </button>
                  <button
                    class="action-btn revoke-btn"
                    onclick={() => handleDelete(key.id)}
                    aria-label="Revoke key"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="15" y1="9" x2="9" y2="15" />
                      <line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                    Revoke
                  </button>
                  <button
                    class="action-btn copy-btn"
                    onclick={() => handleCopy(key.key_preview)}
                    aria-label="Copy key"
                  >
                    {#if copiedKeyId === key.id}
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    {:else}
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    {/if}
                    Copy
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

<Modal bind:isOpen={showModal} title="Create New API Key" onclose={closeModal}>
  {#snippet children()}
    <form
      class="key-form"
      onsubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
    >
      <div class="form-group">
        <label for="provider">Provider</label>
        <select id="provider" bind:value={formData.provider} required>
          {#each providerOptions as option}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
        <p class="form-help">
          Select a provider and enter your API key. You can optionally give it a name.
        </p>
      </div>

      <div class="form-group">
        <label for="api_key">Enter the full key</label>
        <input
          type="password"
          id="api_key"
          bind:value={formData.api_key}
          placeholder="Enter API key"
          required
        />
      </div>

      <div class="form-group">
        <label for="name">Key Name (Optional)</label>
        <input
          type="text"
          id="name"
          bind:value={formData.name}
          placeholder="e.g., Development Key"
        />
      </div>

      <div class="form-actions">
        <button type="button" class="btn-secondary" onclick={closeModal}>
          Cancel
        </button>
        <button type="submit" class="btn-primary">Create</button>
      </div>
    </form>
  {/snippet}
</Modal>

<style>
  .api-keys-container {
    display: flex;
    flex-direction: column;
    gap: var(--space-xl);
  }

  .provider-cell {
    font-weight: 500;
    text-transform: capitalize;
  }

  .provider-label {
    font-size: 0.9375rem;
    color: var(--text-primary);
  }

  .name-cell {
    font-size: 0.9375rem;
  }

  .name-text {
    color: var(--text-primary);
  }

  .key-preview {
    font-family: "Courier New", monospace;
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .key-preview-text {
    display: inline-block;
    max-width: 10rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .status-badge {
    display: inline-flex;
    align-items: center;
    padding: 0.25rem 0.75rem;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-radius: var(--radius-sm);
  }

  .status-badge.valid {
    background: rgba(16, 185, 129, 0.1);
    color: rgb(16, 185, 129);
  }

  .status-badge.invalid {
    background: rgba(239, 68, 68, 0.1);
    color: rgb(239, 68, 68);
  }

  .date-cell {
    font-size: 0.875rem;
  }

  .date-text {
    color: var(--text-secondary);
  }

  .actions {
    display: flex;
    gap: var(--space-sm);
    flex-wrap: wrap;
  }

  .action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    padding: 0.375rem 0.75rem;
    font-size: 0.8125rem;
    font-weight: 500;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
  }

  .action-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .action-btn svg {
    width: 0.875rem;
    height: 0.875rem;
  }

  .btn-spinner {
    width: 0.875rem;
    height: 0.875rem;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: currentColor;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .validate-btn {
    background: rgba(16, 185, 129, 0.1);
    color: rgb(16, 185, 129);
  }

  .validate-btn:hover:not(:disabled) {
    background: rgba(16, 185, 129, 0.2);
  }

  .revoke-btn {
    background: rgba(239, 68, 68, 0.1);
    color: rgb(239, 68, 68);
  }

  .revoke-btn:hover {
    background: rgba(239, 68, 68, 0.2);
  }

  .copy-btn {
    background: rgba(59, 130, 246, 0.1);
    color: rgb(59, 130, 246);
  }

  .copy-btn:hover {
    background: rgba(59, 130, 246, 0.2);
  }

  .key-form {
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

  .form-help {
    font-size: 0.8125rem;
    color: var(--text-secondary);
    margin: 0;
    line-height: 1.5;
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
