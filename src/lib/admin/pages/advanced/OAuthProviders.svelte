<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { onMount, tick } from "svelte";
  import { _ } from "svelte-i18n";
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

  /** ".skel-card" — three placeholder rows, each with its own bar widths. */
  const SKELETON_WIDTHS = [
    ["60%", "85%"],
    ["50%", "70%"],
    ["65%", "75%"],
  ] as const;

  /** ".pills-group" shows three domain pills, then a "+N" overflow pill. */
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

  /**
   * ".provider-desc" — the list API carries no blurb, so the copy is keyed off
   * the provider key. Anything outside this set falls back to the generic line
   * rather than a missing-key lookup.
   */
  const DESCRIBED_PROVIDERS = ["azure", "google", "okta", "saml"];

  function describeProvider(provider: SSOProvider): string {
    if (DESCRIBED_PROVIDERS.includes(provider.provider)) {
      return $_(
        `admin.settings.oauthProviders.descriptions.${provider.provider}`,
      );
    }
    return $_("admin.settings.oauthProviders.descriptions.generic", {
      values: { name: provider.name },
    });
  }

  /**
   * A provider the backend knows about but that carries no credentials yet gets
   * the blue "Configure" call to action instead of the enable toggle.
   */
  function isConfigured(provider: SSOProvider): boolean {
    const clientId = provider.client_id?.trim();
    return Boolean(clientId) && clientId !== "<empty>";
  }

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

<!-- The two glyphs the card design repeats: the gear on every configure
     control, and the alert triangle on the warning row and the empty/error
     card. -->
{#snippet gearGlyph()}
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="8" cy="8" r="2.2" stroke="currentColor" stroke-width="1.3" />
    <path
      d="M13 9.9a1.1 1.1 0 0 0 .22 1.21l.04.04a1.33 1.33 0 1 1-1.89 1.89l-.04-.04a1.1 1.1 0 0 0-1.21-.22 1.1 1.1 0 0 0-.67 1v.11a1.33 1.33 0 1 1-2.67 0v-.06a1.1 1.1 0 0 0-.72-1 1.1 1.1 0 0 0-1.21.22l-.04.04a1.33 1.33 0 1 1-1.89-1.89l.04-.04a1.1 1.1 0 0 0 .22-1.21 1.1 1.1 0 0 0-1-.67h-.11a1.33 1.33 0 1 1 0-2.67h.06a1.1 1.1 0 0 0 1-.72 1.1 1.1 0 0 0-.22-1.21l-.04-.04a1.33 1.33 0 1 1 1.89-1.89l.04.04a1.1 1.1 0 0 0 1.21.22h.05a1.1 1.1 0 0 0 .67-1v-.11a1.33 1.33 0 1 1 2.67 0v.06a1.1 1.1 0 0 0 .67 1 1.1 1.1 0 0 0 1.21-.22l.04-.04a1.33 1.33 0 1 1 1.89 1.89l-.04.04a1.1 1.1 0 0 0-.22 1.21v.05a1.1 1.1 0 0 0 1 .67h.11a1.33 1.33 0 1 1 0 2.67h-.06a1.1 1.1 0 0 0-1 .67z"
      stroke="currentColor"
      stroke-width="1.3"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
{/snippet}

{#snippet alertGlyph(size = 22)}
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <path
      d="M12 9v4M12 17h.01"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
{/snippet}

<div class="authorisation-container">
  <PageHeader
    title={$_("admin.settings.oauthProviders.pageTitle")}
    subtitle={$_("admin.settings.oauthProviders.subtitle")}
  />

  {#if isLoading}
    <!-- ".cards-list" — loading -->
    <div class="cards-list" aria-busy="true">
      {#each SKELETON_WIDTHS as widths, index (index)}
        <div class="skel-card" aria-hidden="true">
          <div class="skel-row">
            <span class="skel skel-icon"></span>
            <div class="skel-lines">
              <span class="skel skel-line" style:width={widths[0]}></span>
              <span class="skel skel-line" style:width={widths[1]}></span>
            </div>
          </div>
        </div>
      {/each}
      <span class="sr-only" role="status"
        >{$_("admin.settings.oauthProviders.messages.loading")}</span
      >
    </div>
  {:else if error}
    <!-- ".cards-list" — error -->
    <div class="cards-list">
      <div class="empty-card" role="alert">
        <span class="warning-icon-bg" aria-hidden="true">
          {@render alertGlyph()}
        </span>
        <div class="empty-text-group">
          <span class="empty-title"
            >{$_("admin.settings.oauthProviders.messages.errorTitle")}</span
          >
          <span class="empty-body">{error}</span>
        </div>
        <button class="cta-btn" type="button" onclick={() => loadProviders()}>
          <span>{$_("admin.settings.oauthProviders.actions.retry")}</span>
        </button>
      </div>
    </div>
  {:else if providers.length === 0}
    <!-- ".cards-list" — empty -->
    <div class="cards-list">
      <div class="empty-card" role="status">
        <span class="warning-icon-bg" aria-hidden="true">
          {@render alertGlyph()}
        </span>
        <div class="empty-text-group">
          <span class="empty-title"
            >{$_("admin.settings.oauthProviders.messages.emptyTitle")}</span
          >
          <span class="empty-body"
            >{$_("admin.settings.oauthProviders.messages.empty")}</span
          >
        </div>
      </div>
    </div>
  {:else}
    <!-- ".cards-list" — default -->
    <div class="cards-list">
      {#each providers as provider (provider.id)}
        {@const configured = isConfigured(provider)}
        {@const unrestricted = !provider.allowed_domains?.length}
        <article
          class="provider-card"
          class:provider-card--pending={pendingToggleId === provider.id}
        >
          <div class="top-info">
            <div class="left-brand">
              {#if providerIcons[provider.provider]}
                <img
                  class="logo-square"
                  src={providerIcons[provider.provider]}
                  alt={$_(
                    "admin.settings.oauthProviders.aria.providerLogoAlt",
                    { values: { name: provider.name } },
                  )}
                  loading="lazy"
                />
              {:else}
                <!-- No brand mark shipped for this provider key; the design's
                     ".logo-square" carries its initial instead. -->
                <span class="logo-square logo-square--initial" aria-hidden="true"
                  >{provider.name.trim().charAt(0).toUpperCase()}</span
                >
              {/if}
              <div class="details">
                <div class="title-status">
                  <span class="provider-title">{provider.name}</span>
                  <span class="status-indicator">
                    <span class="status-dot" data-on={provider.is_enabled}
                    ></span>
                    <span class="status-word" data-on={provider.is_enabled}>
                      {provider.is_enabled
                        ? $_("admin.settings.oauthProviders.common.active")
                        : $_("admin.settings.oauthProviders.common.inactive")}
                    </span>
                  </span>
                </div>
                <span class="provider-desc">{describeProvider(provider)}</span>
              </div>
            </div>

            <div class="right-controls">
              {#if canManageSsoProviders && !configured}
                <!-- ".cta-btn" — the provider has no credentials yet. -->
                <button
                  class="cta-btn"
                  type="button"
                  onclick={() => openEditModal(provider)}
                  disabled={isEditLoading}
                >
                  {@render gearGlyph()}
                  <span
                    >{$_(
                      "admin.settings.oauthProviders.actions.configure",
                    )}</span
                  >
                </button>
              {:else if canManageSsoProviders}
                <button
                  class="gear-btn"
                  type="button"
                  aria-label={$_(
                    "admin.settings.oauthProviders.aria.configureProvider",
                    { values: { name: provider.name } },
                  )}
                  onclick={() => openEditModal(provider)}
                  disabled={isEditLoading}
                >
                  {@render gearGlyph()}
                </button>
              {/if}

              {#if canManageSsoProviders}
                <button
                  class="gear-btn gear-btn--danger"
                  type="button"
                  aria-label={$_(
                    "admin.settings.oauthProviders.aria.deleteProvider",
                    { values: { name: provider.name } },
                  )}
                  onclick={() => promptDelete(provider)}
                  disabled={isDeleting && providerToDelete?.id === provider.id}
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
              {/if}

              {#if configured && canManageSsoProviders}
                <!-- ".col-status" -->
                <label class="col-status status-switch">
                  <input
                    type="checkbox"
                    checked={provider.is_enabled}
                    disabled={pendingToggleId !== null}
                    aria-label={$_(
                      "admin.settings.oauthProviders.aria.toggleProviderStatus",
                      { values: { name: provider.name } },
                    )}
                    onchange={() => toggleProvider(provider)}
                  />
                  <span class="toggle"><span class="toggle-thumb"></span></span>
                  <span class="status-label">
                    {provider.is_enabled
                      ? $_("admin.settings.oauthProviders.common.enabled")
                      : $_("admin.settings.oauthProviders.common.disabled")}
                  </span>
                </label>
              {:else if !canManageSsoProviders}
                <div class="col-status">
                  <span class="toggle" data-on={provider.is_enabled}
                    ><span class="toggle-thumb"></span></span
                  >
                  <span class="status-label" data-on={provider.is_enabled}>
                    {provider.is_enabled
                      ? $_("admin.settings.oauthProviders.common.enabled")
                      : $_("admin.settings.oauthProviders.common.disabled")}
                  </span>
                </div>
              {/if}
            </div>
          </div>

          <!-- ".domains-row" — a live provider is the only one whose domain
               rules are actually gating anyone. -->
          {#if configured && provider.is_enabled}
            <div class="domains-row">
              <div class="domains-content">
                <div class="pills-group">
                  <span class="pills-label"
                    >{$_(
                      "admin.settings.oauthProviders.card.allowedDomains",
                    )}</span
                  >
                  {#if provider.allowed_domains?.length}
                    {#each visibleDomains(provider.allowed_domains) as domain (domain)}
                      <span class="pill"><span>{domain}</span></span>
                    {/each}
                    {#if overflowDomains(provider.allowed_domains).length}
                      {@const rest = overflowDomains(provider.allowed_domains)}
                      <span
                        class="pill"
                        title={$_(
                          "admin.settings.oauthProviders.aria.moreDomains",
                          {
                            values: {
                              count: rest.length,
                              domains: rest.join(", "),
                            },
                          },
                        )}><span>+{rest.length}</span></span
                      >
                    {/if}
                  {:else}
                    <span class="pill pill--warn"
                      ><span
                        >{$_(
                          "admin.settings.oauthProviders.card.allDomains",
                        )}</span
                      ></span
                    >
                  {/if}
                  {#if canManageSsoProviders}
                    <button
                      class="gear-btn"
                      type="button"
                      aria-label={$_(
                        "admin.settings.oauthProviders.aria.editDomains",
                        { values: { name: provider.name } },
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
                  {/if}
                </div>
                {#if unrestricted}
                  <div class="warning-label">
                    {@render alertGlyph(16)}
                    <span
                      >{$_(
                        "admin.settings.oauthProviders.card.unrestricted",
                      )}</span
                    >
                  </div>
                {/if}
              </div>
            </div>
          {/if}
        </article>
      {/each}
    </div>
  {/if}
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
            <span class="toggle"><span class="toggle-thumb"></span></span>
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
            <span class="toggle"><span class="toggle-thumb"></span></span>
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
    /* ".provider-title" / ".pill" / ".empty-title" ink. */
    --oa-name: rgb(30, 41, 59);
    /* ".provider-desc" and the empty-card body. */
    --oa-body: rgb(100, 116, 139);
    /* ".status-word--inactive" and the modal's chip ink. */
    --oa-chip-fg: rgb(100, 116, 139);
    /* ".pills-label" and the resting ".status-dot". */
    --oa-muted: rgb(148, 163, 184);
    /* ".gear-btn" — a cool hairline, darker ink than the card body. */
    --oa-icon-ring: rgb(220, 229, 244);
    --oa-icon-fg: rgb(55, 65, 81);
    /* ".toggle--on" / ".toggle--off" and the labels that track them. */
    --oa-toggle-on: rgb(45, 144, 107);
    --oa-toggle-off: rgb(156, 163, 176);
    /* The delete control — a tinted square at rest, not on hover. */
    --oa-del-bg: rgb(253, 236, 239);
    --oa-del-fg: rgb(229, 72, 77);
    /* ".skel" — the loading cards' bars and their travelling sheen. */
    --oa-skel: rgb(241, 245, 249);
    --oa-skel-sheen: rgba(255, 255, 255, 0.6);
  }

  @media (prefers-color-scheme: dark) {
    .authorisation-container,
    :global(#modal-portal) {
      --oa-name: var(--gx-slate-900);
      --oa-body: var(--gx-slate-500);
      --oa-chip-fg: var(--gx-slate-600);
      --oa-muted: var(--gx-slate-400);
      --oa-icon-ring: var(--gx-hair);
      --oa-icon-fg: var(--gx-slate-600);
      --oa-toggle-on: rgb(52, 180, 96);
      --oa-toggle-off: var(--gx-slate-500);
      --oa-del-bg: rgba(229, 72, 77, 0.18);
      --oa-del-fg: #f08a83;
      --oa-skel: var(--gx-ring-soft);
      --oa-skel-sheen: rgba(255, 255, 255, 0.08);
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

  /* ---------------- page shell (".main") ---------------- */
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

  /* The design spaces the header from the cards with the column gap alone. */
  .authorisation-container :global(.page-header) {
    padding-bottom: 0;
  }

  /* ---------------- ".cards-list" ---------------- */
  .cards-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
    align-self: stretch;
    flex-shrink: 0;
  }

  /* ---------------- ".provider-card" ---------------- */
  .provider-card {
    border-radius: 12px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 24px;
    align-self: stretch;
  }

  .provider-card--pending {
    opacity: 0.65;
    pointer-events: none;
  }

  .top-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    align-self: stretch;
    flex-wrap: wrap;
  }

  .left-brand {
    display: flex;
    gap: 16px;
    align-items: center;
    min-width: 0;
  }

  .logo-square {
    width: 40px;
    height: 40px;
    border-radius: 8px;
    object-fit: contain;
    padding: 6px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    flex-shrink: 0;
  }

  .logo-square--initial {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--gx-ring-soft);
    font-weight: 700;
    font-size: 16px;
    line-height: 1;
    color: var(--oa-icon-fg);
    padding: 0;
  }

  .details {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .title-status {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }

  .provider-title {
    font-weight: 700;
    font-size: 16px;
    line-height: 100%;
    color: var(--oa-name);
  }

  .status-indicator {
    display: flex;
    gap: 4px;
    align-items: center;
  }

  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--oa-muted);
    flex-shrink: 0;
  }

  .status-dot[data-on="true"] {
    background: var(--oa-toggle-on);
  }

  .status-word {
    font-weight: 600;
    font-size: 12px;
    line-height: 100%;
    color: var(--oa-chip-fg);
  }

  .status-word[data-on="true"] {
    color: var(--oa-toggle-on);
  }

  .provider-desc {
    font-weight: 400;
    font-size: 13px;
    line-height: 1.35;
    color: var(--oa-body);
  }

  /* ---------------- right-hand controls ---------------- */
  .right-controls {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-shrink: 0;
  }

  /* ".gear-btn" — the square icon control, at rest a hairline on the card. */
  .gear-btn {
    width: 26px;
    height: 26px;
    border-radius: 8px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--oa-icon-ring);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--oa-icon-fg);
    flex-shrink: 0;
    transition:
      background-color 120ms ease,
      color 120ms ease;
  }

  .gear-btn svg {
    display: block;
  }

  .gear-btn:hover:not(:disabled) {
    background: var(--gx-ring-soft);
  }

  .gear-btn:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
  }

  .gear-btn--danger {
    color: var(--oa-del-fg);
    box-shadow: inset 0 0 0 1px var(--oa-del-bg);
  }

  .gear-btn--danger:hover:not(:disabled) {
    background: var(--oa-del-bg);
  }

  /* ".cta-btn" — "Configure" on a provider with no credentials yet, and the
     retry on the error card. */
  .cta-btn {
    height: 38px;
    border-radius: 8px;
    background: var(--gx-tx-chip-icon-fg);
    display: inline-flex;
    gap: 8px;
    padding: 10px 16px;
    align-items: center;
    flex-shrink: 0;
    color: #fff;
    transition: background-color 120ms ease;
  }

  .cta-btn:hover:not(:disabled) {
    background: var(--gx-ac-cta-hover);
  }

  .cta-btn:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
  }

  .cta-btn svg {
    display: block;
  }

  .cta-btn span {
    font-weight: 600;
    font-size: 14px;
    line-height: 100%;
  }

  /* ".col-status" — the pill toggle plus its word. */
  .col-status {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .status-switch {
    display: inline-flex;
    gap: 8px;
    align-items: center;
    cursor: pointer;
  }

  .status-switch:has(input:disabled) {
    cursor: not-allowed;
    opacity: 0.6;
  }

  .status-switch input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }

  .toggle {
    width: 36px;
    height: 20px;
    border-radius: 10px;
    background: var(--oa-toggle-off);
    display: flex;
    padding: 2px;
    align-items: center;
    justify-content: flex-start;
    flex-shrink: 0;
    transition:
      background-color 120ms ease,
      justify-content 120ms ease;
  }

  .toggle-thumb {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #fff;
  }

  .toggle[data-on="true"],
  .status-switch input:checked + .toggle {
    background: var(--oa-toggle-on);
    justify-content: flex-end;
  }

  .status-switch input:focus-visible + .toggle {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
  }

  .status-label {
    font-weight: 500;
    font-size: 13px;
    line-height: 100%;
    color: var(--oa-toggle-off);
  }

  .status-label[data-on="true"],
  .status-switch input:checked ~ .status-label {
    color: var(--oa-toggle-on);
  }

  /* ---------------- ".domains-row" ---------------- */
  .domains-row {
    border-top: 1px solid var(--gx-hair);
    padding-top: 16px;
    align-self: stretch;
  }

  .domains-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .pills-group {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
    min-width: 0;
  }

  .pills-label {
    font-weight: 700;
    font-size: 11px;
    line-height: 100%;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    color: var(--oa-muted);
  }

  .pill {
    min-height: 23px;
    border-radius: 6px;
    background: var(--gx-ring-soft);
    display: inline-flex;
    align-items: center;
    padding: 4px 10px;
    max-width: 100%;
  }

  .pill span {
    font-weight: 600;
    font-size: 12px;
    line-height: 100%;
    color: var(--oa-name);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pill--warn {
    background: var(--gx-mcpd-warn-bg);
  }

  .pill--warn span {
    color: var(--gx-mcpd-warn-fg);
  }

  .warning-label {
    display: flex;
    gap: 6px;
    align-items: center;
    color: var(--gx-org-warn);
  }

  .warning-label svg {
    display: block;
    flex-shrink: 0;
  }

  .warning-label span {
    font-weight: 600;
    font-size: 12px;
    line-height: 1.3;
  }

  /* ---------------- ".skel-card" (loading) ---------------- */
  .skel-card {
    border-radius: 12px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    padding: 24px;
    align-self: stretch;
    min-height: 87px;
    display: flex;
    align-items: center;
  }

  .skel-row {
    display: flex;
    gap: 16px;
    align-items: center;
    width: 100%;
  }

  .skel {
    background: var(--oa-skel);
    border-radius: 6px;
    position: relative;
    overflow: hidden;
  }

  .skel::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(
      90deg,
      transparent,
      var(--oa-skel-sheen),
      transparent
    );
    animation: oa-shimmer 1.4s infinite;
  }

  @keyframes oa-shimmer {
    from {
      transform: translateX(-100%);
    }
    to {
      transform: translateX(100%);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .skel::after {
      animation: none;
    }
  }

  .skel-icon {
    width: 39px;
    height: 39px;
    border-radius: 8px;
    flex-shrink: 0;
  }

  .skel-lines {
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex-grow: 1;
    max-width: 320px;
  }

  .skel-line {
    height: 12px;
    border-radius: 4px;
  }

  /* ---------------- ".empty-card" (empty / error) ---------------- */
  .empty-card {
    border-radius: 12px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    display: flex;
    flex-direction: column;
    gap: 24px;
    padding: 64px;
    justify-content: center;
    align-items: center;
    align-self: stretch;
  }

  .warning-icon-bg {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--oa-body);
  }

  .warning-icon-bg :global(svg) {
    display: block;
  }

  .empty-text-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: center;
    max-width: 400px;
  }

  .empty-title {
    font-weight: 700;
    font-size: 16px;
    text-align: center;
    line-height: 100%;
    color: var(--oa-name);
  }

  .empty-body {
    font-weight: 400;
    font-size: 13px;
    text-align: center;
    line-height: 1.5;
    color: var(--oa-body);
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

    .provider-card,
    .skel-card {
      padding: 16px;
    }

    .empty-card {
      padding: 40px 24px;
    }
  }
</style>
