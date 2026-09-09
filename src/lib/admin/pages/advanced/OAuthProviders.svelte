<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { onMount, tick } from "svelte";
  import { _, locale } from "svelte-i18n";
  import PageHeader from "../../components/PageHeader.svelte";
  import LoadingSpinner from "../../components/LoadingSpinner.svelte";
  import Modal from "../../components/Modal.svelte";
  import { toast } from "../../../components/Toaster.svelte";
  import { permissionsStore } from "../../../features/auth/index.js";
  import {
    getSSOProviders,
    deleteSSOProvider,
    getSSOProvider,
    updateSSOProvider,
    validateSSOProvider,
    toggleSSOProviderStatus,
  } from "../../../api/admin/SSOProviders.js";
  import type {
    UpdateSSOProviderPayload,
    ValidateSSOProviderPayload,
  } from "../../../api/admin/SSOProviders.js";
  import type { SSOProvider, SSOProviderDetails } from "../../types.js";

  const providerIcons: Record<string, string> = {
    azure: "/azure.svg",
    google: "/google.svg",
  };

  /** ".col-domains" shows three chips, then a "+N" overflow chip. */
  const MAX_DOMAIN_CHIPS = 3;

  let providers = $state<SSOProvider[]>([]);
  let isLoading = $state(false);
  let error = $state<string | null>(null);
  let pendingToggleId = $state<string | null>(null);

  let isConfirmOpen = $state(false);
  let providerToDelete = $state<SSOProvider | null>(null);
  let isDeleting = $state(false);

  let isEditOpen = $state(false);
  let editingProvider = $state<SSOProviderDetails | null>(null);
  let isEditLoading = $state(false);
  let isEditSaving = $state(false);
  let isValidating = $state(false);
  let editErrors = $state<Record<string, string>>({});
  let editTitle = $state("");

  let editForm = $state({
    client_id: "",
    client_secret: "",
    tenant_id: "",
    is_enabled: false,
    allow_self_provisioning: false,
    allowed_domains: [] as string[],
  });
  let domainInput = $state("");
  let clientSecretPreview = $state("");
  let isTenantFieldAvailable = $state(false);
  let showClientSecret = $state(false);
  let editClientIdInputEl = $state<HTMLInputElement | null>(null);

  const canManageSsoProviders = $derived(
    permissionsStore.canManageSsoProviders(),
  );

  /** ".info-banner" — only worth showing while some provider takes all comers. */
  const unrestrictedProviders = $derived(
    providers.filter((provider) => !provider.allowed_domains?.length),
  );

  function formatNameList(names: string[]): string {
    try {
      return new Intl.ListFormat($locale ?? "en", {
        style: "long",
        type: "conjunction",
      }).format(names);
    } catch {
      return names.join(", ");
    }
  }

  const domainBanner = $derived.by(() => {
    if (!unrestrictedProviders.length) return null;
    const names = unrestrictedProviders.map((provider) => provider.name);
    if (names.length === 1) {
      return $_("admin.settings.oauthProviders.messages.domainBannerOne", {
        values: { name: names[0] },
      });
    }
    return $_("admin.settings.oauthProviders.messages.domainBannerAll", {
      values: { names: formatNameList(names) },
    });
  });

  function visibleDomains(domains: string[]): string[] {
    return domains.slice(0, MAX_DOMAIN_CHIPS);
  }

  function overflowDomains(domains: string[]): string[] {
    return domains.slice(MAX_DOMAIN_CHIPS);
  }

  async function loadProviders() {
    if (isLoading) return;
    isLoading = true;
    error = null;

    try {
      providers = await getSSOProviders();
    } catch (err: any) {
      error =
        err?.message || $_("admin.settings.oauthProviders.messages.loadError");
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
        $_("admin.settings.oauthProviders.toasts.statusUpdated", {
          values: {
            name: provider.name,
            status: nextState
              ? $_("admin.settings.oauthProviders.common.enabled")
              : $_("admin.settings.oauthProviders.common.disabled"),
          },
        }),
      );
    } catch (err: any) {
      toast.error(
        err?.message ||
          $_("admin.settings.oauthProviders.toasts.statusUpdateError", {
            values: {
              action: nextState
                ? $_("admin.settings.oauthProviders.common.enableVerb")
                : $_("admin.settings.oauthProviders.common.disableVerb"),
              name: provider.name,
            },
          }),
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
      toast.success($_("admin.settings.oauthProviders.toasts.deleted"));
      closeModal();
      await loadProviders();
    } catch (err: any) {
      toast.error(
        err?.message || $_("admin.settings.oauthProviders.toasts.deleteError"),
      );
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
      allow_self_provisioning: false,
      allowed_domains: [],
    };
    domainInput = "";
    editTitle = provider.name;
    isEditOpen = true;
    isEditLoading = true;

    try {
      const data = await getSSOProvider(provider.id);
      editingProvider = data;
      clientSecretPreview = data.client_secret_preview?.value ?? "";
      isTenantFieldAvailable = data.provider.value === "azure";
      showClientSecret = false;

      editForm = {
        client_id: data.client_id.value,
        client_secret: data.client_secret_preview?.value ?? "",
        tenant_id:
          typeof data.tenant_id === "string"
            ? data.tenant_id
            : (data.tenant_id?.value ?? ""),
        is_enabled: data.is_enabled,
        allow_self_provisioning: (data as any).allow_self_provisioning ?? false,
        allowed_domains: data.allowed_domains || [],
      };
      tick().then(() => {
        editClientIdInputEl?.focus();
        editClientIdInputEl?.select();
      });
    } catch (err: any) {
      toast.error(
        err?.message ||
          $_("admin.settings.oauthProviders.messages.loadProviderError"),
      );
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
      errors.client_id = $_(
        "admin.settings.oauthProviders.validation.clientIdRequired",
      );
    }

    if (!allowedPattern.test(clientId)) {
      errors.client_id = $_(
        "admin.settings.oauthProviders.validation.clientIdInvalid",
      );
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
        errors.client_secret = $_(
          "admin.settings.oauthProviders.validation.clientSecretRequired",
        );
      }

      if (!allowedPattern.test(clientSecret)) {
        errors.client_secret = $_(
          "admin.settings.oauthProviders.validation.clientSecretInvalid",
        );
      }
    }

    if (isTenantFieldAvailable) {
      const tenantId = editForm.tenant_id.trim();
      if (!tenantId || !tenantId.length || tenantId === "<empty>") {
        errors.tenant_id = $_(
          "admin.settings.oauthProviders.validation.tenantIdRequired",
        );
      }
      if (!allowedPattern.test(tenantId)) {
        errors.tenant_id = $_(
          "admin.settings.oauthProviders.validation.tenantIdInvalid",
        );
      }
    }

    editErrors = errors;
    return Object.keys(errors).length === 0;
  }

  async function handleEditSubmit() {
    if (!editingProvider || isEditSaving || isValidating) {
      return;
    }
    if (!validateEditForm()) {
      return;
    }

    const clientSecret = editForm.client_secret.trim();
    const hasSecretChanged =
      clientSecret &&
      clientSecret.length > 0 &&
      clientSecret !== clientSecretPreview;
    const hasClientIdChanged =
      editForm.client_id.trim() !== editingProvider.client_id.value;
    const hasTenantIdChanged =
      isTenantFieldAvailable &&
      editForm.tenant_id.trim() !== (editingProvider.tenant_id?.value ?? "");
    const credentialsChanged =
      hasSecretChanged || hasClientIdChanged || hasTenantIdChanged;

    let validationToken: string | undefined;

    if (credentialsChanged) {
      isValidating = true;
      try {
        const validatePayload: ValidateSSOProviderPayload = {
          client_id: editForm.client_id.trim(),
          provider: editingProvider.provider.value,
          issuer_url: editingProvider.issuer_url.value,
          redirect_url: editingProvider.redirect_url.value,
          frontend_hosted_url: window.location.origin,
        };

        if (hasSecretChanged) {
          validatePayload.client_secret = clientSecret;
        }

        if (isTenantFieldAvailable) {
          validatePayload.tenant_id = editForm.tenant_id.trim();
        }

        const result = await validateSSOProvider(
          editingProvider.id,
          validatePayload,
        );

        if (!result.valid) {
          toast.error(
            result.message ||
              $_("admin.settings.oauthProviders.toasts.validationFailed"),
          );
          return;
        }

        validationToken = result.validation_token;
      } catch (err: any) {
        toast.error(
          err?.message ||
            $_("admin.settings.oauthProviders.toasts.validationFailed"),
        );
        return;
      } finally {
        isValidating = false;
      }
    }

    isEditSaving = true;

    try {
      const payload: UpdateSSOProviderPayload = {
        client_id: editForm.client_id.trim(),
        allowed_domains: editForm.allowed_domains.map((domain) =>
          domain.trim(),
        ),
        is_enabled: editForm.is_enabled,
        jit_provisioning: editForm.allow_self_provisioning,
      };

      if (isTenantFieldAvailable) {
        payload.tenant_id = editForm.tenant_id.trim();
      }

      if (hasSecretChanged) {
        payload.client_secret = clientSecret;
      }

      if (validationToken) {
        payload.validation_token = validationToken;
      }

      await updateSSOProvider(editingProvider.id, payload);
      toast.success($_("admin.settings.oauthProviders.toasts.updated"));
      closeEditModal();
      await loadProviders();
    } catch (err: any) {
      toast.error(
        err?.message || $_("admin.settings.oauthProviders.toasts.updateError"),
      );
    } finally {
      isEditSaving = false;
    }
  }

  onMount(() => loadProviders());
</script>

<div class="authorisation-container">
  <PageHeader
    title={$_("admin.settings.oauthProviders.pageTitle")}
    subtitle={$_("admin.settings.oauthProviders.subtitle")}
  />

  <!-- ".oauth-card" -->
  <section class="oauth-card">
    <div class="card-header">
      <span class="badge" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path
            d="M8.3 11.7a3 3 0 0 0 4.2 0l2.3-2.3a3 3 0 0 0-4.2-4.2l-1 1M11.7 8.3a3 3 0 0 0-4.2 0l-2.3 2.3a3 3 0 0 0 4.2 4.2l1-1"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </span>
      <h2 class="card-title">{$_("admin.settings.oauthProviders.title")}</h2>
    </div>

    {#if isLoading}
      <div class="card-state">
        <LoadingSpinner
          text={$_("admin.settings.oauthProviders.messages.loading")}
          size="lg"
        />
      </div>
    {:else if error}
      <div class="card-state card-state--message">
        <p>{error}</p>
        <button class="retry-btn" type="button" onclick={() => loadProviders()}>
          {$_("admin.settings.oauthProviders.actions.retry")}
        </button>
      </div>
    {:else if providers.length === 0}
      <div class="card-state card-state--message">
        <p>{$_("admin.settings.oauthProviders.messages.empty")}</p>
      </div>
    {:else}
      <div
        class="providers-table"
        role="table"
        aria-label={$_("admin.settings.oauthProviders.table.caption")}
      >
        <!-- ".table-headers" -->
        <div class="table-headers" role="row">
          <span class="th th-provider" role="columnheader"
            >{$_("admin.settings.oauthProviders.table.provider")}</span
          >
          <span class="th th-domains" role="columnheader"
            >{$_("admin.settings.oauthProviders.table.allowedDomains")}</span
          >
          <span class="th th-status" role="columnheader"
            >{$_("admin.settings.oauthProviders.table.status")}</span
          >
          {#if canManageSsoProviders}
            <span class="th th-actions" role="columnheader"
              >{$_("admin.settings.oauthProviders.table.actions")}</span
            >
          {/if}
        </div>

        <div class="table-body" role="rowgroup">
          {#each providers as provider (provider.id)}
            <div
              class="row"
              class:row--pending={pendingToggleId === provider.id}
              role="row"
            >
              <!-- ".col-provider" -->
              <div class="col-provider" role="cell">
                <img
                  class="provider-icon"
                  src={providerIcons[provider.provider] ?? "/grengin-icon.svg"}
                  alt={$_(
                    "admin.settings.oauthProviders.aria.providerLogoAlt",
                    {
                      values: { name: provider.name },
                    },
                  )}
                  loading="lazy"
                />
                <span class="provider-name">{provider.name}</span>
              </div>

              <!-- ".col-domains" -->
              <div class="col-domains" role="cell">
                {#if provider.allowed_domains?.length}
                  {#each visibleDomains(provider.allowed_domains) as domain (domain)}
                    <span class="chip">{domain}</span>
                  {/each}
                  {#if overflowDomains(provider.allowed_domains).length}
                    {@const rest = overflowDomains(provider.allowed_domains)}
                    <span
                      class="chip"
                      title={$_(
                        "admin.settings.oauthProviders.aria.moreDomains",
                        {
                          values: {
                            count: rest.length,
                            domains: rest.join(", "),
                          },
                        },
                      )}>+{rest.length}</span
                    >
                  {/if}
                {:else}
                  <span class="domain-empty"
                    >{$_(
                      "admin.settings.oauthProviders.messages.noDomains",
                    )}</span
                  >
                {/if}
              </div>

              <!-- ".col-status" -->
              <div class="col-status" role="cell">
                {#if canManageSsoProviders}
                  <label class="status-switch">
                    <input
                      type="checkbox"
                      checked={provider.is_enabled}
                      disabled={pendingToggleId !== null}
                      aria-label={$_(
                        "admin.settings.oauthProviders.aria.toggleProviderStatus",
                        {
                          values: { name: provider.name },
                        },
                      )}
                      aria-describedby={`provider-status-${provider.id}`}
                      onchange={() => toggleProvider(provider)}
                    />
                    <span class="status-slider"></span>
                    <span
                      class="status-label"
                      id={`provider-status-${provider.id}`}
                    >
                      {provider.is_enabled
                        ? $_("admin.settings.oauthProviders.common.enabled")
                        : $_("admin.settings.oauthProviders.common.disabled")}
                    </span>
                  </label>
                {:else}
                  <span class="status-dot" data-on={provider.is_enabled}></span>
                  <span class="status-label">
                    {provider.is_enabled
                      ? $_("admin.settings.oauthProviders.common.enabled")
                      : $_("admin.settings.oauthProviders.common.disabled")}
                  </span>
                {/if}
              </div>

              <!-- ".col-actions" -->
              {#if canManageSsoProviders}
                <div class="col-actions" role="cell">
                  <button
                    class="icon-btn icon-btn--edit"
                    type="button"
                    aria-label={$_(
                      "admin.settings.oauthProviders.aria.configureProvider",
                      {
                        values: { name: provider.name },
                      },
                    )}
                    onclick={() => openEditModal(provider)}
                    disabled={isEditLoading}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 14 14"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M9.5 1.5 12.5 4.5 4.5 12.5 1 13l0.5-3.5z"
                        stroke="currentColor"
                        stroke-width="1.2"
                        stroke-linejoin="round"
                      />
                    </svg>
                  </button>
                  <button
                    class="icon-btn icon-btn--delete"
                    type="button"
                    aria-label={$_(
                      "admin.settings.oauthProviders.aria.deleteProvider",
                      {
                        values: { name: provider.name },
                      },
                    )}
                    onclick={() => promptDelete(provider)}
                    disabled={isDeleting &&
                      providerToDelete?.id === provider.id}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 14 14"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M1.75 3.5h10.5M5.25 1.75h3.5M2.917 3.5v8.167a1.167 1.167 0 0 0 1.166 1.166h5.834a1.167 1.167 0 0 0 1.166-1.166V3.5"
                        stroke="currentColor"
                        stroke-width="1.2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    </svg>
                  </button>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </div>

      <!-- ".info-banner" -->
      {#if domainBanner}
        <div class="info-banner">
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <circle
              cx="8"
              cy="8"
              r="6.7"
              stroke="currentColor"
              stroke-width="1.3"
            />
            <path
              d="M6.1 6.1a1.9 1.9 0 0 1 3.6.9c0 1.3-1.7 1.5-1.7 2.9"
              stroke="currentColor"
              stroke-width="1.3"
              stroke-linecap="round"
            />
            <circle
              cx="8"
              cy="11.6"
              r="0.1"
              fill="currentColor"
              stroke="currentColor"
              stroke-width="1"
            />
          </svg>
          <span>{domainBanner}</span>
        </div>
      {/if}
    {/if}
  </section>

  <!-- Delete Confirmation Modal -->
  <Modal
    title={$_("admin.settings.oauthProviders.modals.confirmDeleteTitle")}
    isOpen={isConfirmOpen}
    onclose={closeModal}
    variant="access-control"
  >
    <p class="confirm-text">
      {$_("admin.settings.oauthProviders.modals.confirmDeleteMessage", {
        values: { name: providerToDelete?.name ?? "" },
      })}
    </p>

    {#snippet footer()}
      <span></span>
      <div class="footer-actions">
        <button
          class="btn-cancel"
          type="button"
          onclick={closeModal}
          disabled={isDeleting}
        >
          {$_("common.cancel")}
        </button>
        <button
          class="btn-danger"
          type="button"
          onclick={handleDeleteConfirmed}
          disabled={isDeleting}
        >
          {isDeleting
            ? $_("admin.settings.oauthProviders.actions.deleting")
            : $_("common.delete")}
        </button>
      </div>
    {/snippet}
  </Modal>

  <Modal
    title={$_("admin.settings.oauthProviders.modals.editTitle", {
      values: {
        name:
          editTitle ||
          $_("admin.settings.oauthProviders.modals.providerFallback"),
      },
    })}
    isOpen={isEditOpen}
    onclose={closeEditModal}
    variant="access-control"
  >
    {#if isEditLoading}
      <div class="edit-loading">
        <LoadingSpinner
          size="md"
          text={$_("admin.settings.oauthProviders.messages.loadingProvider")}
        />
      </div>
    {:else}
      <form
        class="edit-form"
        id="oauth-edit-form"
        onsubmit={(e) => {
          e.preventDefault();
          handleEditSubmit();
        }}
      >
        <div class="field-group">
          <label class="field-label" for="edit-client-id"
            >{$_("admin.settings.oauthProviders.form.clientId")}</label
          >
          <div
            class="input-wrapper"
            class:input-wrapper--error={editErrors.client_id}
          >
            <input
              bind:this={editClientIdInputEl}
              id="edit-client-id"
              type="text"
              bind:value={editForm.client_id}
              placeholder={$_(
                "admin.settings.oauthProviders.form.clientIdPlaceholder",
              )}
              aria-invalid={Boolean(editErrors.client_id)}
              aria-describedby={editErrors.client_id
                ? "edit-client-id-error"
                : undefined}
            />
          </div>
          {#if editErrors.client_id}
            <span class="field-error" id="edit-client-id-error"
              >{editErrors.client_id}</span
            >
          {/if}
        </div>

        <div class="field-group">
          <label class="field-label" for="edit-client-secret"
            >{$_("admin.settings.oauthProviders.form.clientSecret")}</label
          >
          <div
            class="input-wrapper"
            class:input-wrapper--error={editErrors.client_secret}
          >
            <input
              id="edit-client-secret"
              type={showClientSecret ? "text" : "password"}
              bind:value={editForm.client_secret}
              placeholder={$_(
                "admin.settings.oauthProviders.form.clientSecretPlaceholder",
              )}
              autocomplete="off"
              spellcheck="false"
              aria-invalid={Boolean(editErrors.client_secret)}
              aria-describedby={editErrors.client_secret
                ? "edit-client-secret-error"
                : undefined}
            />
            <button
              type="button"
              class="secret-toggle"
              onclick={() => (showClientSecret = !showClientSecret)}
              aria-pressed={showClientSecret}
              aria-label={showClientSecret
                ? $_("admin.settings.oauthProviders.aria.hideClientSecret")
                : $_("admin.settings.oauthProviders.aria.showClientSecret")}
            >
              {#if showClientSecret}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    fill="currentColor"
                    d="M2 5.27L3.28 4 20 20.72 18.73 22l-3.08-3.08c-1.15.38-2.37.58-3.65.58-5 0-9.27-3.11-11-7.5.69-1.76 1.79-3.31 3.19-4.54zM12 9a3 3 0 0 1 3 3 3 3 0 0 1-.17 1L11 9.17A3 3 0 0 1 12 9m0-4.5c5 0 9.27 3.11 11 7.5a11.8 11.8 0 0 1-4 5.19l-1.42-1.43A9.86 9.86 0 0 0 20.82 12A9.82 9.82 0 0 0 12 6.5c-1.09 0-2.16.18-3.16.5L7.3 5.47c1.44-.62 3.03-.97 4.7-.97M3.18 12A9.82 9.82 0 0 0 12 17.5c.69 0 1.37-.07 2-.21L11.72 15A3.064 3.064 0 0 1 9 12.28L5.6 8.87c-.99.85-1.82 1.91-2.42 3.13"
                  />
                </svg>
              {:else}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
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
            <span class="field-error" id="edit-client-secret-error"
              >{editErrors.client_secret}</span
            >
          {/if}
        </div>

        {#if isTenantFieldAvailable}
          <div class="field-group">
            <label class="field-label" for="edit-tenant"
              >{$_("admin.settings.oauthProviders.form.tenantId")}</label
            >
            <div
              class="input-wrapper"
              class:input-wrapper--error={editErrors.tenant_id}
            >
              <input
                id="edit-tenant"
                type="text"
                bind:value={editForm.tenant_id}
                placeholder={$_(
                  "admin.settings.oauthProviders.form.tenantIdPlaceholder",
                )}
                aria-invalid={Boolean(editErrors.tenant_id)}
                aria-describedby={editErrors.tenant_id
                  ? "edit-tenant-id-error"
                  : undefined}
              />
            </div>
            {#if editErrors.tenant_id}
              <span class="field-error" id="edit-tenant-id-error"
                >{editErrors.tenant_id}</span
              >
            {/if}
          </div>
        {/if}

        <div class="field-group">
          <label class="field-label" for="edit-domains"
            >{$_("admin.settings.oauthProviders.form.allowedDomains")}</label
          >
          <div class="input-wrapper">
            <input
              id="edit-domains"
              type="text"
              placeholder={$_(
                "admin.settings.oauthProviders.form.domainsPlaceholder",
              )}
              bind:value={domainInput}
              onkeydown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addDomain(domainInput);
                }
              }}
              onblur={() => addDomain(domainInput)}
            />
          </div>
          {#if editForm.allowed_domains.length}
            <div class="domain-list">
              {#each editForm.allowed_domains as domain (domain)}
                <span class="domain-pill">
                  {domain}
                  <button
                    type="button"
                    class="domain-pill__remove"
                    aria-label={$_(
                      "admin.settings.oauthProviders.aria.removeDomain",
                      {
                        values: { domain },
                      },
                    )}
                    onclick={() => removeDomain(domain)}
                  >
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 10 10"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M1 1l8 8M9 1l-8 8"
                        stroke="currentColor"
                        stroke-width="1.4"
                        stroke-linecap="round"
                      />
                    </svg>
                  </button>
                </span>
              {/each}
            </div>
          {/if}
        </div>

        <div class="field-group field-group--switch">
          <span class="field-label"
            >{$_("admin.settings.oauthProviders.form.status")}</span
          >
          <label class="status-switch">
            <input type="checkbox" bind:checked={editForm.is_enabled} />
            <span class="status-slider"></span>
            <span class="status-label">
              {editForm.is_enabled
                ? $_("admin.settings.oauthProviders.common.enabled")
                : $_("admin.settings.oauthProviders.common.disabled")}
            </span>
          </label>
        </div>

        <div class="field-group field-group--switch">
          <span class="switch-label-row">
            <span class="field-label field-label--with-icon">
              <svg
                class="provisioning-icon"
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <line x1="19" y1="8" x2="19" y2="14" />
                <line x1="22" y1="11" x2="16" y2="11" />
              </svg>
              {$_("admin.settings.oauthProviders.selfProvisioning.label")}
            </span>
            <span
              class="info-icon-btn"
              role="button"
              tabindex="0"
              aria-label={$_(
                "admin.settings.oauthProviders.selfProvisioning.hint",
              )}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              <span class="info-tooltip"
                >{$_(
                  "admin.settings.oauthProviders.selfProvisioning.hint",
                )}</span
              >
            </span>
          </span>
          <label class="status-switch">
            <input
              type="checkbox"
              bind:checked={editForm.allow_self_provisioning}
            />
            <span class="status-slider"></span>
            <span class="status-label">
              {editForm.allow_self_provisioning
                ? $_("admin.settings.oauthProviders.common.enabled")
                : $_("admin.settings.oauthProviders.common.disabled")}
            </span>
          </label>
        </div>
      </form>
    {/if}

    {#snippet footer()}
      <span></span>
      <div class="footer-actions">
        <button
          class="btn-cancel"
          type="button"
          onclick={closeEditModal}
          disabled={isEditSaving || isValidating}
        >
          {$_("common.cancel")}
        </button>
        <button
          class="btn-primary"
          type="submit"
          form="oauth-edit-form"
          disabled={isEditSaving || isEditLoading || isValidating}
        >
          {isValidating
            ? $_("admin.settings.oauthProviders.actions.validating")
            : isEditSaving
              ? $_("admin.settings.oauthProviders.actions.saving")
              : $_("common.save")}
        </button>
      </div>
    {/snippet}
  </Modal>
</div>

<style>
  /* ===== authorisation.html, transcribed. Values the design carries that no
     --gx-* token already holds are declared locally below, not in app.css. ===== */

  /* The dialogs render in the shared #modal-portal, outside this page's
     container, so the palette is declared on both roots. The names are
     page-local, so nothing else can read them. */
  .authorisation-container,
  :global(#modal-portal) {
    /* ".th" ink and the provider/card headings. */
    --oa-head-fg: rgb(140, 145, 154);
    --oa-name: rgb(19, 22, 30);
    /* ".chip" text and the ".status-label" / edit-glyph ink. */
    --oa-chip-fg: rgb(73, 85, 100);
    --oa-label: rgb(73, 78, 90);
    --oa-toggle-on: rgb(46, 168, 85);
    /* ".icon-btn--delete" — a tinted square at rest, not on hover. */
    --oa-del-bg: rgb(253, 236, 239);
    --oa-del-fg: rgb(229, 72, 77);
    /* ".info-banner" */
    --oa-banner-bg: rgb(183, 205, 235);
    --oa-banner-fg: rgb(43, 82, 161);
  }

  @media (prefers-color-scheme: dark) {
    .authorisation-container,
    :global(#modal-portal) {
      --oa-head-fg: var(--gx-slate-400);
      --oa-name: var(--gx-slate-900);
      --oa-chip-fg: var(--gx-slate-600);
      --oa-label: var(--gx-slate-600);
      --oa-toggle-on: rgb(52, 180, 96);
      --oa-del-bg: rgba(229, 72, 77, 0.18);
      --oa-del-fg: #f08a83;
      --oa-banner-bg: rgba(59, 103, 189, 0.22);
      --oa-banner-fg: #bcd2f5;
    }
  }

  /* app.css paints every bare <button>/<input> as a glass pill — padding, a
     fill, a radius, an inset shadow, a lift on hover. Every control below is
     flat, so strip that once here and let each rule paint its own skin. */
  button {
    padding: 0;
    border: 0;
    border-radius: 0;
    background: none;
    box-shadow: none;
    color: inherit;
    font: inherit;
    line-height: normal;
    text-align: start;
    white-space: nowrap;
    cursor: pointer;
    transition: none;
  }

  button:hover {
    transform: none;
    box-shadow: none;
    background: none;
  }

  button:active {
    transform: none;
    box-shadow: none;
  }

  button:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  input {
    width: 100%;
    padding: 0;
    border: 0;
    border-radius: 0;
    outline: none;
    background: transparent;
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    font-family: var(--gx-font);
    line-height: 100%;
  }

  input:focus {
    background: transparent;
    box-shadow: none;
  }

  /* ".main" */
  .authorisation-container {
    display: flex;
    flex-direction: column;
    gap: 28px;
    height: 100%;
    width: 100%;
    background: var(--gx-page);
    padding: 32px;
    overflow-y: auto;
    font-family: var(--gx-font);
  }

  /* The design spaces the header from the card with the column gap alone. */
  .authorisation-container :global(.page-header) {
    padding-bottom: 0;
  }

  /* ---------------- ".oauth-card" ---------------- */
  .oauth-card {
    border-radius: 12px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-mcp-m-ring);
    display: flex;
    flex-direction: column;
    align-self: stretch;
    flex-shrink: 0;
    overflow: hidden;
  }

  .card-header {
    min-height: 88px;
    /* The design's 88px/62px include the hairline; a real border-bottom would
       stack on top of the content box and add a pixel, so draw it inset. */
    box-shadow: inset 0 -1px 0 0 var(--gx-mcp-m-ring);
    display: flex;
    gap: 16px;
    padding: 24px;
    align-items: center;
    flex-shrink: 0;
  }

  .badge {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    background: var(--gx-ring-soft);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--gx-tx-chip-icon-fg);
    flex-shrink: 0;
  }

  .badge svg {
    display: block;
  }

  .card-title {
    margin: 0;
    font-weight: 700;
    font-size: 16px;
    line-height: 100%;
    color: var(--oa-name);
  }

  /* ---------------- table ---------------- */
  .providers-table {
    display: flex;
    flex-direction: column;
    align-self: stretch;
    min-width: 0;
    overflow-x: auto;
  }

  /* ".table-headers" */
  .table-headers,
  .row {
    display: flex;
    align-items: center;
    align-self: stretch;
    min-width: 720px;
  }

  .table-headers {
    min-height: 37px;
    background: var(--gx-mcp-code-bg);
    border-left: 1px solid var(--gx-mcp-m-ring);
    border-right: 1px solid var(--gx-mcp-m-ring);
    border-bottom: 1px solid var(--gx-mcp-m-ring);
    padding: 12px 24px;
    flex-shrink: 0;
  }

  .th {
    font-weight: 700;
    font-size: 11px;
    line-height: 100%;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: var(--oa-head-fg);
  }

  .table-body {
    display: flex;
    flex-direction: column;
    align-self: stretch;
  }

  .row {
    min-height: 62px;
    box-shadow: inset 0 -1px 0 0 var(--gx-mcp-m-ring);
    padding: 16px 24px;
    flex-shrink: 0;
  }

  /* The banner, when it renders, keeps the last row's rule; without it the
     card closes on the row itself. */
  .providers-table:last-child .table-body .row:last-child {
    box-shadow: none;
  }

  .row--pending {
    opacity: 0.35;
    pointer-events: none;
  }

  .th-provider,
  .col-provider {
    width: 220px;
    flex-shrink: 0;
  }

  .th-domains,
  .col-domains {
    flex-grow: 1;
    min-width: 0;
  }

  .th-status,
  .col-status {
    width: 150px;
    flex-shrink: 0;
  }

  .th-actions,
  .col-actions {
    width: 100px;
    flex-shrink: 0;
  }

  .th-actions {
    text-align: end;
  }

  /* ".col-provider" */
  .col-provider {
    display: flex;
    gap: 12px;
    align-items: center;
  }

  .provider-icon {
    width: 24px;
    height: 24px;
    border-radius: 8px;
    box-shadow: inset 0 0 0 1px var(--gx-mcp-m-ring);
    padding: 3px;
    object-fit: contain;
    flex-shrink: 0;
    background: var(--gx-card);
  }

  .provider-name {
    font-weight: 600;
    font-size: 14px;
    line-height: 100%;
    color: var(--oa-name);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ".col-domains" */
  .col-domains {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }

  .chip {
    min-height: 21px;
    border-radius: 6px;
    background: var(--gx-ring-soft);
    display: flex;
    align-items: center;
    padding: 4px 8px;
    font-weight: 400;
    font-size: 11px;
    line-height: 100%;
    color: var(--oa-chip-fg);
    white-space: nowrap;
  }

  .domain-empty {
    font-weight: 400;
    font-size: 12px;
    line-height: 100%;
    color: var(--gx-slate-400);
  }

  /* ".col-status" */
  .col-status {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .status-switch {
    display: flex;
    gap: 8px;
    align-items: center;
    position: relative;
    cursor: pointer;
  }

  .status-switch input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }

  /* ".toggle" + ".toggle-thumb" */
  .status-slider {
    position: relative;
    display: block;
    width: 36px;
    height: 20px;
    border-radius: 10px;
    background: var(--gx-org-toggle-off);
    flex-shrink: 0;
    transition: background-color 160ms ease;
  }

  .status-slider::before {
    content: "";
    position: absolute;
    top: 2px;
    inset-inline-start: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #fff;
    transition: transform 160ms ease;
  }

  .status-switch input:checked + .status-slider {
    background: var(--oa-toggle-on);
  }

  .status-switch input:checked + .status-slider::before {
    transform: translateX(16px);
  }

  :global([dir="rtl"]) .status-switch input:checked + .status-slider::before {
    transform: translateX(-16px);
  }

  .status-switch input:focus-visible + .status-slider {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
  }

  .status-switch:has(input:disabled) {
    cursor: not-allowed;
  }

  /* Read-only status, for admins without the manage permission. */
  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--gx-org-toggle-off);
    flex-shrink: 0;
  }

  .status-dot[data-on="true"] {
    background: var(--oa-toggle-on);
  }

  .status-label {
    font-weight: 500;
    font-size: 13px;
    line-height: 100%;
    color: var(--oa-label);
    white-space: nowrap;
  }

  /* ".col-actions" */
  .col-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  .icon-btn {
    width: 30px;
    height: 30px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: filter 120ms ease;
  }

  .icon-btn svg {
    display: block;
  }

  .icon-btn:hover:not(:disabled) {
    filter: brightness(0.97);
  }

  .icon-btn:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
  }

  .icon-btn--edit {
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-mcp-m-ring);
    color: var(--oa-label);
  }

  .icon-btn--delete {
    background: var(--oa-del-bg);
    color: var(--oa-del-fg);
  }

  /* ".info-banner" */
  .info-banner {
    background: var(--oa-banner-bg);
    display: flex;
    gap: 12px;
    padding: 16px;
    align-items: flex-start;
    align-self: stretch;
    flex-shrink: 0;
  }

  .info-banner svg {
    display: block;
    color: var(--gx-tx-chip-icon-fg);
    flex-shrink: 0;
    margin-top: 1px;
  }

  .info-banner span {
    font-weight: 400;
    font-size: 13px;
    line-height: 1.5;
    color: var(--oa-banner-fg);
  }

  /* ---------------- loading / error / empty ---------------- */
  .card-state {
    display: flex;
    flex-direction: column;
    gap: 16px;
    align-items: center;
    justify-content: center;
    align-self: stretch;
  }

  .card-state--message {
    padding: 48px 24px;
  }

  .card-state p {
    margin: 0;
    font-size: 14px;
    line-height: 1.5;
    color: var(--gx-slate-500);
    text-align: center;
  }

  .retry-btn {
    height: 37px;
    border-radius: 8px;
    background: var(--gx-org-primary-500);
    padding: 10px 16px;
    font-weight: 600;
    font-size: 14px;
    line-height: 100%;
    color: #fff;
    transition: background-color 120ms ease;
  }

  .retry-btn:hover {
    background: var(--gx-ac-cta-hover);
  }

  .retry-btn:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
  }

  /* ---------------- dialogs ----------------
     authorisation.html ships no dialog of its own, so the Edit and Delete
     cards borrow the light 560px shell the rest of the redesign uses
     (Modal variant="access-control"). */
  .confirm-text {
    margin: 0;
    font-size: 14px;
    line-height: 1.6;
    color: var(--gx-slate-700);
  }

  .edit-loading {
    padding: 24px 0;
    display: flex;
    justify-content: center;
    align-self: stretch;
  }

  .edit-form {
    display: flex;
    flex-direction: column;
    gap: 20px;
    align-self: stretch;
    width: 100%;
  }

  .field-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: flex-start;
    align-self: stretch;
  }

  .field-group--switch {
    gap: 10px;
  }

  .field-label {
    font-family: var(--gx-font);
    font-weight: 700;
    font-size: 11px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    color: var(--gx-slate-500);
  }

  .field-label--with-icon {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .provisioning-icon {
    flex-shrink: 0;
  }

  .switch-label-row {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .input-wrapper {
    position: relative;
    min-height: 42px;
    border-radius: 10px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    display: flex;
    padding-inline: 14px;
    align-items: center;
    align-self: stretch;
    box-sizing: border-box;
    transition: box-shadow 120ms ease;
  }

  .input-wrapper:focus-within {
    box-shadow:
      inset 0 0 0 1.5px var(--gx-tx-chip-icon-fg),
      inset 0 0 4px 0 rgba(59, 103, 189, 0.149);
  }

  .input-wrapper--error {
    box-shadow: inset 0 0 0 1.5px var(--gx-danger);
  }

  .input-wrapper input {
    flex-grow: 1;
    min-width: 0;
    padding-block: 12px;
    font-weight: 400;
    font-size: 14px;
    color: var(--gx-slate-900);
  }

  .input-wrapper input::placeholder {
    color: var(--gx-slate-400);
    opacity: 1;
  }

  .secret-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 6px;
    flex-shrink: 0;
    color: var(--gx-slate-500);
    transition: color 120ms ease;
  }

  .secret-toggle:hover {
    color: var(--gx-slate-900);
  }

  .secret-toggle:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
  }

  .secret-toggle svg {
    display: block;
  }

  .field-error {
    font-size: 11px;
    line-height: 1.4;
    color: var(--gx-danger);
  }

  .domain-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-self: stretch;
  }

  .domain-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 24px;
    padding: 4px 8px;
    border-radius: 6px;
    background: var(--gx-ring-soft);
    font-size: 12px;
    line-height: 100%;
    color: var(--oa-chip-fg);
  }

  .domain-pill__remove {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--gx-slate-500);
    transition: color 120ms ease;
  }

  .domain-pill__remove:hover {
    color: var(--gx-danger);
  }

  .domain-pill__remove:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
  }

  .info-icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    position: relative;
    cursor: help;
    color: var(--gx-slate-400);
    transition: color 120ms ease;
  }

  .info-icon-btn:hover {
    color: var(--gx-slate-600);
  }

  .info-tooltip {
    display: none;
    position: absolute;
    bottom: calc(100% + 8px);
    inset-inline-start: 50%;
    transform: translateX(-50%);
    background: var(--gx-slate-900);
    color: var(--gx-card);
    font-size: 11px;
    font-weight: 400;
    line-height: 1.4;
    letter-spacing: normal;
    text-transform: none;
    padding: 6px 10px;
    border-radius: 6px;
    width: max-content;
    max-width: 240px;
    white-space: normal;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    z-index: 10;
    pointer-events: none;
  }

  .info-icon-btn:hover .info-tooltip,
  .info-icon-btn:focus-visible .info-tooltip {
    display: block;
  }

  .footer-actions {
    display: flex;
    gap: 12px;
    flex-shrink: 0;
    margin-inline-start: auto;
  }

  .btn-cancel,
  .btn-primary,
  .btn-danger {
    height: 37px;
    border-radius: 10px;
    padding: 10px 16px;
    font-family: var(--gx-font);
    font-weight: 600;
    font-size: 14px;
    line-height: 100%;
    transition: background-color 120ms ease;
  }

  .btn-cancel {
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    color: var(--gx-ac-slate-600);
  }

  .btn-cancel:hover:not(:disabled) {
    background: var(--gx-org-track);
  }

  .btn-primary {
    background: var(--gx-tx-chip-icon-fg);
    color: #fff;
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--gx-ac-cta-hover);
  }

  .btn-danger {
    background: var(--gx-org-danger);
    color: #fff;
  }

  .btn-danger:hover:not(:disabled) {
    background: var(--gx-org-danger-hover);
  }

  .btn-cancel:focus-visible,
  .btn-primary:focus-visible,
  .btn-danger:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
  }

  @media (max-width: 768px) {
    .authorisation-container {
      padding: 20px;
      gap: 20px;
    }

    .card-header {
      min-height: 72px;
      padding: 16px;
    }
  }
</style>
