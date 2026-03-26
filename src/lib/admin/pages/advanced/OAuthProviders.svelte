<script lang="ts">
  import { onMount } from "svelte";
  import PageHeader from "../../components/PageHeader.svelte";
  import LoadingSpinner from "../../components/LoadingSpinner.svelte";
  import AdminTableCard from "../../components/AdminTableCard.svelte";
  import Modal from "../../components/Modal.svelte";
  import { toast } from "../../../components/Toaster.svelte";
  import { permissionsStore } from "../../../features/auth/index.js";
  import {
    getSSOProviders,
    deleteSSOProvider,
    getSSOProvider,
    updateSSOProvider,
    toggleSSOProviderStatus,
  } from "../../../api/admin/SSOProviders.js";
  import type { UpdateSSOProviderPayload } from "../../../api/admin/SSOProviders.js";
  import type { SSOProvider } from "../../types.js";

  const providerIcons: Record<string, string> = {
    azure: "/azure.svg",
    google: "/google.svg",
  };

  let providers = $state<SSOProvider[]>([]);
  let isLoading = $state(false);
  let error = $state<string | null>(null);
  let pendingToggleId = $state<string | null>(null);

  let isConfirmOpen = $state(false);
  let providerToDelete = $state<SSOProvider | null>(null);
  let isDeleting = $state(false);

  let isEditOpen = $state(false);
  let editingProvider = $state<SSOProvider | null>(null);
  let isEditLoading = $state(false);
  let isEditSaving = $state(false);
  let editErrors = $state<Record<string, string>>({});
  let editTitle = $state("");

  let editForm = $state({
    client_id: "",
    client_secret: "",
    tenant_id: "",
    is_enabled: false,
    allowed_domains: [] as string[],
  });
  let domainInput = $state("");
  let clientSecretPreview = $state("");
  let isTenantFieldAvailable = $state(false);
  let showClientSecret = $state(false);
  const canManageSsoProviders = $derived(
    permissionsStore.canManageSsoProviders()
  );

  async function loadProviders() {
    if (isLoading) return;
    isLoading = true;
    error = null;

    try {
      providers = await getSSOProviders();
    } catch (err: any) {
      error = err?.message || "Unable to load SSO providers";
    } finally {
      isLoading = false;
    }
  }

  async function toggleProvider(provider: SSOProvider): Promise<void> {
    if (isLoading || pendingToggleId) return;

    const nextState = !provider.is_enabled;
    pendingToggleId = provider.id;

    try {
      await toggleSSOProviderStatus(provider.id, nextState);
      toast.success(
        `SSO provider ${provider.name} ${nextState ? "enabled" : "disabled"}.`,
      );
    } catch (err: any) {
      toast.error(
        err?.message ||
          `Unable to ${nextState ? "enable" : "disable"} ${provider.name}`,
      );
    } finally {
      pendingToggleId = null;
      loadProviders();
    }
  }

  function promptDelete(provider: SSOProvider) {
    if (isLoading || isDeleting) return;

    providerToDelete = provider;
    isConfirmOpen = true;
  }

  function closeModal() {
    providerToDelete = null;
    isConfirmOpen = false;
  }

  async function handleDeleteConfirmed() {
    if (isLoading || isDeleting || !providerToDelete) {
      return;
    }

    isDeleting = true;
    try {
      await deleteSSOProvider(providerToDelete.id);
      toast.success("SSO provider deleted");
      closeModal();
      await loadProviders();
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete SSO provider");
    } finally {
      isDeleting = false;
    }
  }

  async function openEditModal(provider: SSOProvider) {
    if (isLoading || isEditLoading || isEditSaving) return;

    editingProvider = null;
    editErrors = {};
    editForm = {
      client_id: "",
      client_secret: "",
      tenant_id: "",
      is_enabled: false,
      allowed_domains: [],
    };
    domainInput = "";
    editTitle = provider.name;
    isEditOpen = true;
    isEditLoading = true;

    try {
      const data = await getSSOProvider(provider.id);
      editingProvider = data;
      clientSecretPreview = data.client_secret_preview ?? "";
      isTenantFieldAvailable = data.provider === "azure";
      showClientSecret = false;

      editForm = {
        client_id: data.client_id,
        client_secret: clientSecretPreview,
        tenant_id: data.tenant_id ?? "",
        is_enabled: data.is_enabled,
        allowed_domains: data.allowed_domains || [],
      };
    } catch (err: any) {
      toast.error(err?.message || "Unable to load provider");
      closeEditModal();
    } finally {
      isEditLoading = false;
    }
  }

  function closeEditModal() {
    editingProvider = null;
    isEditOpen = false;
    isTenantFieldAvailable = false;
    showClientSecret = false;
  }

  function addDomain(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (!editForm.allowed_domains.includes(trimmed)) {
      editForm.allowed_domains = [...editForm.allowed_domains, trimmed];
    }
    domainInput = "";
  }

  function removeDomain(domain: string) {
    editForm.allowed_domains = editForm.allowed_domains.filter(
      (item) => item !== domain,
    );
  }

  function validateEditForm(): boolean {
    const errors: Record<string, string> = {};
    const allowedPattern = /^[A-Za-z0-9_.\-]+$/;
    const clientId = editForm.client_id.trim();
    const clientSecret = editForm.client_secret.trim();

    // Client ID validation
    if (!clientId || !clientId.length || clientId === "<empty>") {
      errors.client_id = "Client ID is required";
    }

    if (!allowedPattern.test(clientId)) {
      errors.client_id = "Client ID contains invalid characters";
    }

    // Client secret validation
    const isPreviewAvailable =
      clientSecretPreview &&
      clientSecretPreview.length &&
      clientSecretPreview !== "<empty>";
    const skipSecretValidation =
      isPreviewAvailable && clientSecretPreview === clientSecret;

    if (!skipSecretValidation) {
      if (!clientSecret || !clientSecret.length || clientSecret === "<empty>") {
        errors.client_secret = "Client secret is required";
      }

      if (!allowedPattern.test(clientSecret)) {
        errors.client_secret = "Client secret contains invalid characters";
      }
    }

    if (isTenantFieldAvailable) {
      const tenantId = editForm.tenant_id.trim();
      if (!tenantId || !tenantId.length || tenantId === "<empty>") {
        errors.tenant_id = "Tenant ID is required";
      }
      if (!allowedPattern.test(tenantId)) {
        errors.tenant_id = "Tenant ID contains invalid characters";
      }
    }

    editErrors = errors;
    return Object.keys(errors).length === 0;
  }

  async function handleEditSubmit() {
    if (!editingProvider || isEditSaving) {
      return;
    }
    if (!validateEditForm()) {
      return;
    }

    isEditSaving = true;

    try {
      const payload: UpdateSSOProviderPayload = {
        client_id: editForm.client_id.trim(),
        allowed_domains: editForm.allowed_domains.map((domain) =>
          domain.trim(),
        ),
        is_enabled: editForm.is_enabled,
      };

      if (isTenantFieldAvailable) {
        payload.tenant_id = editForm.tenant_id.trim();
      }

      // Only update client secret if it has changed
      const clientSecret = editForm.client_secret.trim();
      if (
        clientSecret &&
        clientSecret.length &&
        clientSecret !== clientSecretPreview
      ) {
        payload.client_secret = clientSecret;
      }

      await updateSSOProvider(editingProvider.id, payload);
      toast.success("SSO provider updated");
      closeEditModal();
      await loadProviders();
    } catch (err: any) {
      toast.error(err?.message || "Failed to update provider");
    } finally {
      isEditSaving = false;
    }
  }

  onMount(() => loadProviders());
</script>

<div class="sso-providers-page">
  <PageHeader
    title="OAuth Providers"
    subtitle="Configure OAuth integrations for your organization."
  />

  <section class="providers-card">
    {#if isLoading}
      <LoadingSpinner text="Loading OAuth providers..." size="lg" />
    {:else if error}
      <div class="error-state">
        <p>{error}</p>
        <button
          class="btn btn-primary"
          type="button"
          onclick={() => loadProviders()}
        >
          Retry
        </button>
      </div>
    {:else if providers.length === 0}
      <div class="empty-state">
        <p>No OAuth providers have been configured yet.</p>
      </div>
    {:else}
      <AdminTableCard minWidth="720px">
        <table class="providers-table">
          <thead>
            <tr>
              <th>Provider</th>
              <th>Allowed domains</th>
              <th>Status</th>
              {#if canManageSsoProviders}
                <th>Actions</th>
              {/if}
            </tr>
          </thead>
          <tbody>
            {#each providers as provider (provider.id)}
              <tr class:pending={pendingToggleId === provider.id}>
                <td>
                  <div class="provider-name">
                    <img
                      class="provider-icon"
                      src={providerIcons[provider.provider] ??
                        "/grengin-icon.svg"}
                      alt={`${provider.name} logo`}
                      loading="lazy"
                    />
                    <p class="provider-name__title">{provider.name}</p>
                  </div>
                </td>
                <td>
                  <div class="provider-domains">
                    {#if provider.allowed_domains.length}
                      {#each provider.allowed_domains as domain}
                        <span class="domain-capsule" data-domain={domain}
                          >{domain}</span
                        >
                      {/each}
                    {:else}
                      <span class="domain-empty-text">No domains</span>
                    {/if}
                  </div>
                </td>
                <td>
                  <div class="provider-status">
                    {#if canManageSsoProviders}
                      <label class="status-switch">
                        <input
                          type="checkbox"
                          checked={provider.is_enabled}
                          disabled={pendingToggleId !== null}
                          onchange={() => toggleProvider(provider)}
                        />
                        <span class="status-slider"></span>
                        <span class="status-label">
                          {provider.is_enabled ? "Enabled" : "Disabled"}
                        </span>
                      </label>
                    {:else}
                      <span class="status-label">
                        {provider.is_enabled ? "Enabled" : "Disabled"}
                      </span>
                    {/if}
                  </div>
                </td>
                {#if canManageSsoProviders}
                  <td>
                    <div class="provider-actions">
                      <button
                        class="icon-btn"
                        type="button"
                        aria-label={`Configure ${provider.name}`}
                        onclick={() => openEditModal(provider)}
                        disabled={isEditLoading}
                      >
                        <span
                          class="icon-symbol icon-symbol--edit"
                          aria-hidden="true"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                          >
                            <path
                              fill="currentColor"
                              d="M20.71 7.04c.39-.39.39-1.04 0-1.41l-2.34-2.34c-.37-.39-1.02-.39-1.41 0l-1.84 1.83l3.75 3.75M3 17.25V21h3.75L17.81 9.93l-3.75-3.75z"
                            />
                          </svg>
                        </span>
                      </button>
                      <button
                        class="icon-btn icon-btn--danger"
                        type="button"
                        aria-label={`Delete ${provider.name}`}
                        onclick={() => promptDelete(provider)}
                        disabled={isDeleting &&
                          providerToDelete?.id === provider.id}
                      >
                        <span
                          class="icon-symbol icon-symbol--delete"
                          aria-hidden="true"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                          >
                            <path
                              fill="currentColor"
                              d="M19 4h-3.5l-1-1h-5l-1 1H5v2h14M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6z"
                            />
                          </svg>
                        </span>
                      </button>
                    </div>
                  </td>
                {/if}
              </tr>
            {/each}
          </tbody>
        </table>
      </AdminTableCard>
    {/if}
  </section>

  <!-- Delete Confirmation Modal -->
  <Modal title="Confirm deletion" isOpen={isConfirmOpen} onclose={closeModal}>
    {#snippet children()}
      <div class="confirm-body">
        <p>
          Are you sure you want to delete <strong
            >{providerToDelete?.name}</strong
          >?
        </p>
        <div class="confirm-actions">
          <button
            class="btn btn"
            type="button"
            onclick={closeModal}
            disabled={isDeleting}
          >
            Cancel
          </button>
          <button
            class="btn btn-accent"
            type="button"
            onclick={handleDeleteConfirmed}
            disabled={isDeleting}
          >
            {isDeleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    {/snippet}
  </Modal>

  <Modal
    title={`Edit ${editTitle || "OAuth provider"}`}
    isOpen={isEditOpen}
    onclose={closeEditModal}
  >
    {#snippet children()}
      {#if isEditLoading}
        <div class="edit-loading">
          <LoadingSpinner size="md" text="Loading provider..." />
        </div>
      {:else}
        <form
          class="edit-form"
          onsubmit={(e) => {
            e.preventDefault();
            handleEditSubmit();
          }}
        >
          <div class="form-row">
            <label for="edit-client-id">Client ID</label>
            <input
              id="edit-client-id"
              type="text"
              bind:value={editForm.client_id}
              class:error={editErrors.client_id}
              placeholder={"Enter client ID"}
            />
            {#if editErrors.client_id}
              <span class="field-error">{editErrors.client_id}</span>
            {/if}
          </div>

          <div class="form-row">
            <label for="edit-client-secret">Client secret</label>
            <div
              class="client-secret-input-row"
              class:error={Boolean(editErrors.client_secret)}
            >
              <input
                id="edit-client-secret"
                type={showClientSecret ? "text" : "password"}
                bind:value={editForm.client_secret}
                placeholder="Enter client secret"
                autocomplete="off"
                spellcheck="false"
              />
              <button
                type="button"
                class="client-secret-visibility"
                onclick={() => (showClientSecret = !showClientSecret)}
                aria-label={showClientSecret
                  ? "Hide client secret"
                  : "Show client secret"}
              >
                {#if showClientSecret}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                  >
                    <path
                      fill="currentColor"
                      d="M2 5.27L3.28 4 20 20.72 18.73 22l-3.08-3.08c-1.15.38-2.37.58-3.65.58-5 0-9.27-3.11-11-7.5.69-1.76 1.79-3.31 3.19-4.54zM12 9a3 3 0 0 1 3 3 3 3 0 0 1-.17 1L11 9.17A3 3 0 0 1 12 9m0-4.5c5 0 9.27 3.11 11 7.5a11.8 11.8 0 0 1-4 5.19l-1.42-1.43A9.86 9.86 0 0 0 20.82 12A9.82 9.82 0 0 0 12 6.5c-1.09 0-2.16.18-3.16.5L7.3 5.47c1.44-.62 3.03-.97 4.7-.97M3.18 12A9.82 9.82 0 0 0 12 17.5c.69 0 1.37-.07 2-.21L11.72 15A3.064 3.064 0 0 1 9 12.28L5.6 8.87c-.99.85-1.82 1.91-2.42 3.13"
                    />
                  </svg>
                {:else}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                  >
                    <path
                      fill="currentColor"
                      d="M12 9a3 3 0 1 1 0 6a3 3 0 0 1 0-6zm0-4.5c5 0 9.27 3.11 11 7.5-1.73 4.39-6 7.5-11 7.5S2.73 16.39 1 12c1.73-4.39 6-7.5 11-7.5zM3.18 12a9.821 9.821 0 0 0 17.64 0a9.821 9.821 0 0 0-17.64 0"
                    />
                  </svg>
                {/if}
              </button>
            </div>
            {#if editErrors.client_secret}
              <span class="field-error">{editErrors.client_secret}</span>
            {/if}
          </div>

          {#if isTenantFieldAvailable}
            <div class="form-row">
              <label for="edit-tenant">Tenant ID</label>
              <input
                id="edit-tenant"
                type="text"
                bind:value={editForm.tenant_id}
                placeholder={"Enter tenant ID"}
              />
              {#if editErrors.tenant_id}
                <span class="field-error">{editErrors.tenant_id}</span>
              {/if}
            </div>
          {/if}

          <div class="form-row">
            <label for="edit-domains">Allowed domains</label>
            <input
              id="edit-domains"
              type="text"
              placeholder="Press Enter to add"
              bind:value={domainInput}
              onkeydown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addDomain(domainInput);
                }
              }}
              onblur={() => addDomain(domainInput)}
            />
            {#if editForm.allowed_domains.length}
              <div class="domain-list">
                {#each editForm.allowed_domains as domain (domain)}
                  <span class="domain-pill">
                    {domain}
                    <button
                      type="button"
                      class="domain-pill__remove"
                      tabindex="-1"
                      onclick={() => removeDomain(domain)}
                    >
                      ×
                    </button>
                  </span>
                {/each}
              </div>
            {/if}
          </div>

          <div class="form-row">
            <span class="switch-label">Status</span>
            <label class="status-switch">
              <input type="checkbox" bind:checked={editForm.is_enabled} />
              <span class="status-slider"></span>
              <span class="status-label">
                {editForm.is_enabled ? "Enabled" : "Disabled"}
              </span>
            </label>
          </div>

          <div class="confirm-actions">
            <button
              class="btn"
              type="button"
              onclick={closeEditModal}
              disabled={isEditSaving}
            >
              Cancel
            </button>
            <button
              class="btn btn-accent"
              type="submit"
              disabled={isEditSaving || isEditLoading}
            >
              {isEditSaving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      {/if}
    {/snippet}
  </Modal>
</div>

<style>
  .sso-providers-page {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
    width: 100%;
    min-height: 100%;
    background: var(--bg-primary);
  }

  .providers-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .providers-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.95rem;
  }

  .providers-table th,
  .providers-table td {
    padding: var(--space-md);
    vertical-align: middle;
  }

  .providers-table th:nth-child(3),
  .providers-table td:nth-child(3),
  .providers-table th:nth-child(4),
  .providers-table td:nth-child(4) {
    text-align: center;
  }

  .providers-table thead {
    background: rgba(var(--glass-tint), 0.04);
  }

  .providers-table th {
    font-weight: 600;
    letter-spacing: 0.05em;
    font-size: 0.75rem;
    text-transform: uppercase;
    color: var(--text-secondary);
  }

  .providers-table tbody tr {
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }

  .providers-table tbody tr:last-child {
    border-bottom: none;
  }

  .provider-name {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    font-weight: 600;
    color: var(--text-primary);
  }

  .provider-icon {
    width: 40px;
    height: 40px;
    border-radius: var(--radius-lg);
    padding: 0.25rem;
    background: rgba(var(--glass-tint), 0.1);
    border: 1px solid rgba(255, 255, 255, 0.08);
    object-fit: contain;
  }

  .provider-name__title {
    margin: 0;
    font-size: 1rem;
  }

  .provider-domains {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    font-size: 0.85rem;
  }

  .domain-capsule {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.25rem 0.9rem;
    border-radius: 999px;
    border: 1px solid
      color-mix(in oklab, var(--text-primary) 40%, transparent 60%);
    background: color-mix(
      in oklab,
      var(--btn-secondary) 20%,
      var(--glass-bg-dark) 80%
    );
    color: var(--text-primary);
    font-weight: 600;
    text-transform: lowercase;
    letter-spacing: 0.02em;
  }

  @media (prefers-color-scheme: light) {
    .domain-capsule {
      border-color: rgba(0, 0, 0, 0.12);
      background: rgba(0, 0, 0, 0.04);
      color: var(--text-primary);
    }
  }

  .domain-empty-text {
    font-size: 0.85rem;
    color: var(--text-secondary);
    font-weight: 600;
    text-transform: none;
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
  }

  .provider-status {
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .provider-actions {
    display: flex;
    justify-content: center;
    gap: var(--space-sm);
  }

  .status-switch {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    cursor: pointer;
    position: relative;
  }

  .status-switch input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }

  .status-slider {
    position: relative;
    display: inline-block;
    width: 42px;
    height: 22px;
    background: rgba(143, 143, 143, 0.2);
    border-radius: 999px;
    transition: all 0.3s ease;
  }

  .status-slider::before {
    content: "";
    position: absolute;
    height: 18px;
    width: 18px;
    left: 2px;
    top: 2px;
    background: var(--brand-red);
    border-radius: 999px;
    transition: all 0.3s ease;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  }

  .status-switch input:checked + .status-slider::before {
    background: var(--brand-green);
    transform: translateX(18px);
  }

  .status-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-secondary);
    letter-spacing: 0.08em;
  }

  .icon-btn {
    width: 36px;
    height: 36px;
    border-radius: var(--radius-md);
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: transparent;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
    transition: all 0.2s ease;
  }

  .icon-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .icon-symbol {
    font-size: 1.15rem;
    line-height: 0;
  }

  .icon-symbol--edit {
    color: #f37a2c;
  }

  .icon-symbol--delete {
    color: var(--brand-red);
  }

  .icon-btn:hover {
    border-color: rgba(255, 255, 255, 0.2);
    color: var(--text-primary);
    background: rgba(var(--glass-tint), 0.05);
  }

  .error-state,
  .empty-state {
    display: flex;
    width: 100%;
    flex-direction: column;
    gap: var(--space-md);
    align-items: center;
    justify-content: center;
    padding: var(--space-lg);
    border-radius: var(--radius-lg);
    background: rgba(255, 255, 255, 0.02);
    border: 1px dashed rgba(255, 255, 255, 0.08);
  }

  .error-state p,
  .empty-state p {
    margin: 0;
    color: var(--text-secondary);
  }

  .confirm-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .confirm-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-md);
  }

  .edit-loading {
    padding: var(--space-xl) 0;
    display: flex;
    justify-content: center;
  }

  .edit-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .form-row {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
  }

  .form-row label {
    font-weight: 600;
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .switch-label {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-secondary);
  }

  .form-row {
    background: var(--button-bg);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: var(--radius-md);
    padding: 0.65rem 0.9rem;
    color: var(--text-primary);
  }

  #edit-client-secret {
    padding-right: 56px;
  }

  .client-secret-input-row {
    position: relative;
  }

  .client-secret-input-row input {
    width: 100%;
    padding-right: var(--space-2xl);
  }

  .client-secret-visibility {
    background: none;
    background-color: transparent;
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    right: 0.4rem;
    display: inline-flex;
    height: 32px;
    width: 40px;
    padding: 0;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: var(--text-secondary);
    border-radius: var(--radius-sm);
    transition: color 0.2s ease;
  }

  .client-secret-visibility:hover {
    color: var(--text-primary);
  }

  .domain-list {
    margin-top: var(--space-2xs);
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2xs);
  }

  .domain-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.25rem 0.75rem;
    border-radius: var(--radius-full);
    background: color-mix(
      in oklab,
      var(--glass-bg-dark) 65%,
      var(--btn-secondary) 35%
    );
    border: 1px solid rgba(255, 255, 255, 0.1);
    font-size: 0.85rem;
  }

  .domain-pill__remove {
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    padding: 0;
    font-size: 0.9rem;
    box-shadow: none;
  }

  .providers-table tr.pending {
    opacity: 0.35;
    pointer-events: none;
  }

  @media (prefers-color-scheme: light) {
    .domain-pill {
      background: rgba(255, 255, 255, 0.85);
      border-color: rgba(0, 0, 0, 0.12);
      color: var(--text-primary);
    }
    .domain-pill__remove {
      color: var(--text-primary);
    }
  }

  .form-row input.error {
    border-color: var(--brand-red);
  }

  .field-error {
    font-size: 0.75rem;
    color: var(--brand-red);
  }

  @media (max-width: 992px) {
    .providers-table th,
    .providers-table td {
      padding: var(--space-sm);
    }
  }

  @media (max-width: 640px) {
    .sso-providers-page {
      padding: var(--space-xl);
    }

    .provider-name {
      flex-direction: column;
      align-items: flex-start;
    }

    .provider-icon {
      width: 36px;
      height: 36px;
    }
  }
</style>
