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

  /**
   * Brand marks, per the Figma "Authentication" page. Azure and Google ship as
   * artwork under /public. Okta and Generic SAML have no licensed wordmark in
   * the repo, so the design gives them a tinted tile carrying a white glyph —
   * an identity of their own rather than the initials fallback they had.
   */
  const providerIcons: Record<string, string> = {
    azure: "/azure.svg",
    google: "/google.svg",
  };

  type BrandGlyph = "okta" | "saml";
  const providerGlyphs: Record<string, BrandGlyph> = {
    okta: "okta",
    saml: "saml",
  };

  /**
   * "View {provider} setup documentation". Only providers with a canonical
   * vendor guide get the link; the rest simply don't render one, which is
   * better than sending an admin to a generic spec page.
   */
  const PROVIDER_DOCS: Record<string, string> = {
    azure:
      "https://learn.microsoft.com/entra/identity-platform/quickstart-register-app",
    google:
      "https://developers.google.com/identity/openid-connect/openid-connect",
    okta: "https://developer.okta.com/docs/guides/implement-oauth-for-okta/main/",
  };

  /** What the API requests when a provider carries no explicit scope list. */
  const DEFAULT_SCOPES = ["openid", "email", "profile"];

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
  /** Known from the list row, so the dialog header is right while loading. */
  let editProviderKey = $state("");

  let editForm = $state({
    client_id: "",
    client_secret: "",
    tenant_id: "",
    is_enabled: false,
    allow_self_provisioning: false,
    allowed_domains: [] as string[],
  });
  let clientSecretPreview = $state("");
  let isTenantFieldAvailable = $state(false);
  let showClientSecret = $state(false);
  let editClientIdInputEl = $state<HTMLInputElement | null>(null);

  /**
   * The Configure dialog doesn't close on a successful save any more: it swaps
   * its body for the "{Provider} connected and enabled" panel with the fields
   * read-only, and its footer for a single Close. The card list behind it is
   * refreshed at the same moment, so Close lands on up-to-date rows.
   */
  let editSaved = $state(false);
  /**
   * Whether the save actually enabled the provider. The design has no status
   * switch in this dialog, so its confirmation is unconditionally "connected
   * and enabled" — but AC10 keeps the switch, so a save can legitimately leave
   * the provider off, and the banner must not claim otherwise.
   */
  let savedEnabled = $state(false);
  /** ".scopes-card" — the required-scopes disclosure, collapsed by default. */
  let scopesOpen = $state(false);

  /**
   * ".provider-card--editing" — allowed domains are edited in place on the
   * card now, not by opening the Configure dialog. The draft lives here so the
   * card can be cancelled without touching the provider.
   */
  let domainEditId = $state<string | null>(null);
  let domainEditLoading = $state(false);
  let domainEditSaving = $state(false);
  let domainDraft = $state<string[]>([]);
  let domainDraftInput = $state("");
  /**
   * PUT /admin/sso-providers/:id replaces the whole configuration, so editing
   * domains alone still has to send back every other field untouched. That
   * means reading the provider's detail payload first.
   */
  let domainEditSource = $state<SSOProviderDetails | null>(null);
  let domainInputEl = $state<HTMLInputElement | null>(null);

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
    return describeProviderKey(provider.provider, provider.name);
  }

  /**
   * A provider the backend knows about but that carries no credentials yet gets
   * the blue "Configure" call to action instead of the enable toggle.
   */
  function isConfigured(provider: SSOProvider): boolean {
    const clientId = provider.client_id?.trim();
    return Boolean(clientId) && clientId !== "<empty>";
  }

  /** AC6 — the fixed scope list the dialog discloses. */
  const editScopes = $derived(editingProvider?.scopes?.length
    ? editingProvider.scopes
    : DEFAULT_SCOPES);

  /** AC7 — the vendor setup guide, when one exists for this provider. */
  const editDocsUrl = $derived(PROVIDER_DOCS[editProviderKey] ?? "");

  /** The blurb under the provider name, reused as the Configure dialog's subtitle. */
  function describeProviderKey(key: string, name: string): string {
    if (DESCRIBED_PROVIDERS.includes(key)) {
      return $_(`admin.settings.oauthProviders.descriptions.${key}`);
    }
    return $_("admin.settings.oauthProviders.descriptions.generic", {
      values: { name },
    });
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
    editTitle = provider.name;
    editProviderKey = provider.provider;
    editSaved = false;
    savedEnabled = false;
    scopesOpen = false;
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
        allow_self_provisioning: data.allow_self_provisioning ?? false,
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
    editSaved = false;
    scopesOpen = false;
    editErrors = {};
  }

  function validateEditForm(): boolean {
    const errors: Record<string, string> = {};
    const allowedPattern = /^[A-Za-z0-9_.\-]+$/;
    const clientId = editForm.client_id.trim();
    const clientSecret = editForm.client_secret.trim();

    /* The checks are exclusive: an empty field is *missing*, not *malformed*.
       Running the pattern unconditionally let "invalid characters" overwrite
       every "is required" message, since the empty string fails the pattern —
       so a blank field never got the inline error the design asks for. */
    // Client ID validation
    if (!clientId || !clientId.length || clientId === "<empty>") {
      errors.client_id = $_(
        "admin.settings.oauthProviders.validation.clientIdRequired",
      );
    } else if (!allowedPattern.test(clientId)) {
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
      } else if (!allowedPattern.test(clientSecret)) {
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
      } else if (!allowedPattern.test(tenantId)) {
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
      /* The design replaces the toast-and-close flow with an inline confirmation:
         the dialog stays open, its fields go read-only, and the footer becomes a
         single Close. The list behind it is refreshed now so Close reveals the
         updated card rather than a stale one. */
      editSaved = true;
      savedEnabled = editForm.is_enabled;
      await loadProviders();
    } catch (err: any) {
      toast.error(
        err?.message || $_("admin.settings.oauthProviders.toasts.updateError"),
      );
    } finally {
      isEditSaving = false;
    }
  }

  /* ---------------------------------------------------------------------
     AC4 — allowed domains are edited in place on the provider card. The
     pencil no longer opens the Configure dialog.
     --------------------------------------------------------------------- */

  async function openDomainEditor(provider: SSOProvider) {
    if (domainEditLoading || domainEditSaving) return;

    domainEditId = provider.id;
    domainDraft = [...(provider.allowed_domains ?? [])];
    domainDraftInput = "";
    domainEditSource = null;
    domainEditLoading = true;

    try {
      domainEditSource = await getSSOProvider(provider.id);
      tick().then(() => domainInputEl?.focus());
    } catch (err: any) {
      toast.error(
        err?.message ||
          $_("admin.settings.oauthProviders.messages.loadProviderError"),
      );
      closeDomainEditor();
    } finally {
      domainEditLoading = false;
    }
  }

  function closeDomainEditor() {
    domainEditId = null;
    domainEditSource = null;
    domainDraft = [];
    domainDraftInput = "";
  }

  function addDraftDomain(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (!domainDraft.includes(trimmed)) {
      domainDraft = [...domainDraft, trimmed];
    }
    domainDraftInput = "";
  }

  function removeDraftDomain(domain: string) {
    domainDraft = domainDraft.filter((item) => item !== domain);
  }

  async function saveDomains() {
    if (!domainEditSource || domainEditSaving) return;

    /* A domain typed but not yet committed with Enter still counts — losing it
       on Save would silently drop what the admin just entered. */
    const pending = domainDraftInput.trim();
    const domains =
      pending && !domainDraft.includes(pending)
        ? [...domainDraft, pending]
        : domainDraft;

    const source = domainEditSource;
    domainEditSaving = true;

    try {
      const payload: UpdateSSOProviderPayload = {
        client_id: source.client_id.value,
        allowed_domains: domains.map((domain) => domain.trim()),
        is_enabled: source.is_enabled,
        jit_provisioning: source.allow_self_provisioning ?? false,
      };

      const tenantId = source.tenant_id?.value;
      if (tenantId) {
        payload.tenant_id = tenantId;
      }

      await updateSSOProvider(source.id, payload);
      toast.success($_("admin.settings.oauthProviders.toasts.updated"));
      closeDomainEditor();
      await loadProviders();
    } catch (err: any) {
      toast.error(
        err?.message || $_("admin.settings.oauthProviders.toasts.updateError"),
      );
    } finally {
      domainEditSaving = false;
    }
  }

  onMount(() => loadProviders());
</script>

<!-- ".cta-btn" / ".gear-btn" — the design swaps the old gear for octicon's
     tools mark on every configure control. Drawn at the source aspect ratio
     (10.5 x 12.87) so it doesn't smear inside the 14px slot. -->
{#snippet toolsGlyph(size = 14)}
  <svg
    width={(size * 10.5) / 12.8739}
    height={size}
    viewBox="0 0 10.5 12.8739"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M3.00388 1.31564C2.48135 1.67764 2.05447 2.16103 1.75988 2.72432C1.46528 3.28761 1.31176 3.91396 1.3125 4.54964C1.3125 5.94789 2.0405 7.17639 3.14125 7.87639C3.5945 8.16339 3.95413 8.68401 3.9305 9.31139V9.31839L3.787 12.2383C3.78426 12.3253 3.7642 12.411 3.728 12.4903C3.6918 12.5695 3.64018 12.6408 3.57615 12.6999C3.51212 12.759 3.43696 12.8047 3.35506 12.8345C3.27316 12.8642 3.18616 12.8773 3.09913 12.8731C3.01211 12.8688 2.92679 12.8473 2.84817 12.8098C2.76956 12.7722 2.6992 12.7193 2.64122 12.6543C2.58324 12.5893 2.53879 12.5133 2.51047 12.4309C2.48214 12.3485 2.47051 12.2613 2.47625 12.1744L2.61888 9.26064C2.62063 9.18626 2.57513 9.07164 2.43775 8.98414C1.6907 8.51024 1.07551 7.85524 0.64933 7.07998C0.223148 6.30471 -0.000209633 5.43432 0 4.54964C0.000116286 3.70424 0.204388 2.87137 0.595446 2.12185C0.986505 1.37234 1.55278 0.728345 2.24613 0.244636C2.4581 0.0917695 2.71137 0.00661691 2.97264 0.000370129C3.23391 -0.00587665 3.49096 0.0670746 3.71 0.209636C4.11425 0.468636 4.375 0.933261 4.375 1.45476V3.92226C4.375 3.99401 4.41088 4.06226 4.47125 4.10251L5.1275 4.54876C5.16367 4.57321 5.20634 4.58628 5.25 4.58628C5.29366 4.58628 5.33633 4.57321 5.3725 4.54876L6.02875 4.10251C6.05838 4.08249 6.08264 4.0555 6.09942 4.02393C6.1162 3.99235 6.12498 3.95714 6.125 3.92139V1.45476C6.125 0.933261 6.38575 0.468636 6.79 0.209636C7.00904 0.0670746 7.26609 -0.00587665 7.52736 0.000370129C7.78863 0.00661691 8.0419 0.0917695 8.25387 0.244636C8.94722 0.728345 9.5135 1.37234 9.90455 2.12185C10.2956 2.87137 10.4999 3.70424 10.5 4.54964C10.5002 5.43432 10.2769 6.30471 9.85067 7.07998C9.42449 7.85524 8.8093 8.51024 8.06225 8.98414C7.92487 9.07164 7.87937 9.18539 7.88112 9.25976L8.02375 12.1735C8.03069 12.2894 8.00685 12.405 7.95466 12.5087C7.90246 12.6124 7.82377 12.7004 7.72656 12.7639C7.62935 12.8273 7.51708 12.8639 7.40116 12.87C7.28523 12.876 7.16978 12.8513 7.0665 12.7983C6.96322 12.7446 6.87605 12.6645 6.81393 12.5661C6.75181 12.4677 6.71698 12.3546 6.713 12.2383L6.5695 9.31139C6.54588 8.68401 6.9055 8.16339 7.35875 7.87639C7.91925 7.52094 8.3808 7.02957 8.70052 6.44796C9.02024 5.86634 9.18776 5.21334 9.1875 4.54964C9.18824 3.91396 9.03472 3.28761 8.74012 2.72432C8.44553 2.16103 8.01865 1.67764 7.49613 1.31564C7.47513 1.33051 7.4375 1.37426 7.4375 1.45564V3.92139C7.43752 4.17131 7.37638 4.41744 7.25939 4.63829C7.14241 4.85914 6.97314 5.048 6.76637 5.18839L6.11012 5.63464C5.85637 5.80692 5.55672 5.89903 5.25 5.89903C4.94328 5.89903 4.64363 5.80692 4.38988 5.63464L3.73363 5.18839C3.52686 5.048 3.35759 4.85914 3.24061 4.63829C3.12362 4.41744 3.06248 4.17131 3.0625 3.92139V1.45476C3.0625 1.37426 3.02488 1.33051 3.00388 1.31564Z"
      fill="currentColor"
    />
  </svg>
{/snippet}

<!-- ".domains-content" — the pencil that opens the in-place domain editor. -->
{#snippet pencilGlyph()}
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path
      d="M7.58344 12.2493H12.2505M12.352 3.97337C12.6604 3.66504 12.8337 3.24683 12.8338 2.81073C12.8339 2.37462 12.6606 1.95636 12.3523 1.64796C12.0439 1.33955 11.6257 1.16625 11.1895 1.1662C10.7534 1.16615 10.3351 1.33933 10.0266 1.64766L2.24076 9.43445C2.10531 9.56949 2.00514 9.73575 1.94907 9.91861L1.17841 12.4572C1.16334 12.5077 1.1622 12.5613 1.17512 12.6123C1.18804 12.6633 1.21454 12.7099 1.2518 12.7471C1.28906 12.7843 1.33571 12.8108 1.38677 12.8236C1.43784 12.8364 1.49143 12.8352 1.54186 12.8201L4.08134 12.0501C4.26404 11.9945 4.4303 11.895 4.56555 11.7602L12.352 3.97337Z"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
    />
  </svg>
{/snippet}

<!-- The two brand glyphs the design draws on a tinted tile (Okta, SAML). -->
{#snippet oktaGlyph()}
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
    <path
      d="M11.2502 6.74982L6.74982 11.2502M6.74982 6.74982L11.2502 11.2502M16.5006 9C16.5006 13.1425 13.1425 16.5006 9 16.5006C4.85753 16.5006 1.4994 13.1425 1.4994 9C1.4994 4.85753 4.85753 1.4994 9 1.4994C13.1425 1.4994 16.5006 4.85753 16.5006 9Z"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
    />
  </svg>
{/snippet}

{#snippet samlGlyph()}
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path
      d="M12.916 6.24933L14.8327 8.166C14.9884 8.31869 15.1979 8.40421 15.416 8.40421C15.6341 8.40421 15.8436 8.31869 15.9993 8.166L17.7493 6.416C17.902 6.26023 17.9875 6.05079 17.9875 5.83267C17.9875 5.61454 17.902 5.40511 17.7493 5.24933L15.8327 3.33267M17.4993 1.666L9.49925 9.666M10.8327 12.916C10.8327 15.4473 8.78064 17.4993 6.24933 17.4993C3.71803 17.4993 1.666 15.4473 1.666 12.916C1.666 10.3847 3.71803 8.33267 6.24933 8.33267C8.78064 8.33267 10.8327 10.3847 10.8327 12.916Z"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
    />
  </svg>
{/snippet}

<!-- Configure-dialog glyphs: the inline field error, the documentation link,
     the scopes disclosure chevron and its ticks. -->
{#snippet alertCircleGlyph()}
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path
      d="M7 4.66648V7M7 9.33352H7.00583M12.8338 7C12.8338 10.2219 10.2219 12.8338 7 12.8338C3.77808 12.8338 1.1662 10.2219 1.1662 7C1.1662 3.77808 3.77808 1.1662 7 1.1662C10.2219 1.1662 12.8338 3.77808 12.8338 7Z"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
    />
  </svg>
{/snippet}

{#snippet linkGlyph()}
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M6.66677 8.66664C6.95307 9.04939 7.31834 9.36609 7.73781 9.59527C8.15727 9.82444 8.62111 9.96072 9.09787 9.99486C9.57464 10.029 10.0532 9.96022 10.501 9.79316C10.9488 9.6261 11.3555 9.36469 11.6934 9.02664L13.6934 7.02664C14.3006 6.39797 14.6366 5.55596 14.629 4.68197C14.6214 3.80798 14.2709 2.97194 13.6528 2.35391C13.0348 1.73588 12.1988 1.38532 11.3248 1.37773C10.4508 1.37013 9.60878 1.70611 8.98011 2.31331L7.83344 3.45331M9.33357 7.33348C9.04727 6.95073 8.682 6.63402 8.26254 6.40485C7.84308 6.17568 7.37923 6.0394 6.90247 6.00526C6.42571 5.97111 5.94718 6.0399 5.49934 6.20696C5.0515 6.37402 4.64483 6.63543 4.30691 6.97348L2.30691 8.97348C1.69971 9.60215 1.36373 10.4442 1.37133 11.3182C1.37892 12.1921 1.72948 13.0282 2.34751 13.6462C2.96554 14.2642 3.80158 14.6148 4.67557 14.6224C5.54956 14.63 6.39157 14.294 7.02024 13.6868L8.16024 12.5468"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
    />
  </svg>
{/snippet}

{#snippet chevronGlyph()}
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
    <path
      d="M2.5 3.75L5 6.25L7.5 3.75"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
    />
  </svg>
{/snippet}

{#snippet checkGlyph()}
  <svg width="14" height="10" viewBox="0 0 14 10" fill="none" aria-hidden="true">
    <path
      d="M11.6662 2.5L5.25017 7.083L2.3338 4.99982"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
    />
  </svg>
{/snippet}

{#snippet userAddGlyph()}
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
    <path
      d="M9.375 11.875C9.375 10.4937 7.69625 9.375 5.625 9.375C3.55375 9.375 1.875 10.4937 1.875 11.875M11.875 10V8.125M11.875 8.125V6.25M11.875 8.125H10M11.875 8.125H13.75M5.625 7.5C4.96196 7.5 4.32607 7.23661 3.85723 6.76777C3.38839 6.29893 3.125 5.66304 3.125 5C3.125 4.33696 3.38839 3.70107 3.85723 3.23223C4.32607 2.76339 4.96196 2.5 5.625 2.5C6.28804 2.5 6.92393 2.76339 7.39277 3.23223C7.86161 3.70107 8.125 4.33696 8.125 5C8.125 5.66304 7.86161 6.29893 7.39277 6.76777C6.92393 7.23661 6.28804 7.5 5.625 7.5Z"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
{/snippet}

{#snippet powerGlyph()}
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M12 3v9M18.36 6.64a9 9 0 1 1-12.73 0"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
{/snippet}

<!-- ".left-brand" / the dialog header — one provider mark, three ways: the
     shipped artwork, the design's tinted tile for Okta and Generic SAML, and
     the initial as a last resort for a provider key we know nothing about. -->
{#snippet brandTile(provider: { provider: string; name: string })}
  {#if providerIcons[provider.provider]}
    <span class="logo-square logo-square--art">
      <img
        src={providerIcons[provider.provider]}
        alt={$_("admin.settings.oauthProviders.aria.providerLogoAlt", {
          values: { name: provider.name },
        })}
        loading="lazy"
      />
    </span>
  {:else if providerGlyphs[provider.provider]}
    <span
      class="logo-square logo-square--tile"
      data-brand={providerGlyphs[provider.provider]}
      aria-hidden="true"
    >
      {#if providerGlyphs[provider.provider] === "okta"}
        {@render oktaGlyph()}
      {:else}
        {@render samlGlyph()}
      {/if}
    </span>
  {:else}
    <span class="logo-square logo-square--initial" aria-hidden="true"
      >{provider.name.trim().charAt(0).toUpperCase()}</span
    >
  {/if}
{/snippet}

<!-- The alert triangle on the warning row and the empty/error card. -->
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
        {@const editingDomains = domainEditId === provider.id}
        <article
          class="provider-card"
          class:provider-card--pending={pendingToggleId === provider.id}
          class:provider-card--editing={editingDomains}
        >
          <div class="top-info">
            <div class="left-brand">
              {@render brandTile(provider)}
              <div class="details">
                <div class="title-status">
                  {#if editingDomains}
                    <!-- The editing card leads with the dot and a larger name,
                         so the row reads as a heading for the panel below. -->
                    <span class="status-dot" data-on={provider.is_enabled}
                    ></span>
                  {/if}
                  <span class="provider-title">{provider.name}</span>
                  {#if !editingDomains}
                    <span class="status-indicator">
                      <span class="status-dot" data-on={provider.is_enabled}
                      ></span>
                      <span class="status-word" data-on={provider.is_enabled}>
                        {provider.is_enabled
                          ? $_("admin.settings.oauthProviders.common.active")
                          : $_("admin.settings.oauthProviders.common.inactive")}
                      </span>
                    </span>
                  {/if}
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
                  {@render toolsGlyph(18)}
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
                  {@render toolsGlyph()}
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
                  {#if editingDomains}
                    <!-- The draft, not the saved list: every chip is removable
                         until Save commits it. -->
                    {#each domainDraft as domain (domain)}
                      <span class="pill pill--draft">
                        <span>{domain}</span>
                        <button
                          class="pill__remove"
                          type="button"
                          aria-label={$_(
                            "admin.settings.oauthProviders.aria.removeDomain",
                            { values: { domain } },
                          )}
                          onclick={() => removeDraftDomain(domain)}
                          disabled={domainEditSaving}>&times;</button
                        >
                      </span>
                    {/each}
                    {#if domainDraft.length === 0}
                      <span class="pill pill--warn"
                        ><span
                          >{$_(
                            "admin.settings.oauthProviders.card.allDomains",
                          )}</span
                        ></span
                      >
                    {/if}
                  {:else if provider.allowed_domains?.length}
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
                    <!-- AC4 — the pencil expands the card in place instead of
                         opening the Configure dialog. -->
                    <button
                      class="gear-btn"
                      class:gear-btn--active={editingDomains}
                      type="button"
                      aria-label={$_(
                        "admin.settings.oauthProviders.aria.editDomains",
                        { values: { name: provider.name } },
                      )}
                      aria-expanded={editingDomains}
                      onclick={() =>
                        editingDomains
                          ? closeDomainEditor()
                          : openDomainEditor(provider)}
                      disabled={domainEditLoading || domainEditSaving}
                    >
                      {@render pencilGlyph()}
                    </button>
                  {/if}
                </div>
                {#if unrestricted && !editingDomains}
                  <div class="warning-label">
                    {@render alertGlyph(16)}
                    <span
                      >{$_(
                        "admin.settings.oauthProviders.card.unrestricted",
                      )}</span
                    >
                  </div>
                {:else if editingDomains && domainDraft.length === 0}
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

            {#if editingDomains}
              <div class="domain-editor">
                <input
                  class="domain-editor__input"
                  type="text"
                  bind:this={domainInputEl}
                  bind:value={domainDraftInput}
                  placeholder={$_(
                    "admin.settings.oauthProviders.domains.placeholder",
                  )}
                  disabled={domainEditLoading || domainEditSaving}
                  onkeydown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addDraftDomain(domainDraftInput);
                    }
                  }}
                />
                <div class="footer-actions">
                  <button
                    class="btn-cancel"
                    type="button"
                    onclick={closeDomainEditor}
                    disabled={domainEditSaving}
                  >
                    {$_("common.cancel")}
                  </button>
                  <button
                    class="btn-primary"
                    type="button"
                    onclick={saveDomains}
                    disabled={domainEditLoading || domainEditSaving}
                  >
                    {domainEditSaving
                      ? $_("admin.settings.oauthProviders.actions.saving")
                      : $_("common.save")}
                  </button>
                </div>
              </div>
            {/if}
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

  <!-- ===== Configure dialog =====
       The design turns this into a guided setup: per-field help, inline
       validation, a disclosure of the scopes the provider will be asked for, a
       link to the vendor's own guide, and — after a successful save — a
       confirmation panel in place of the form. -->
  <Modal
    title={$_("admin.settings.oauthProviders.modals.editTitle", {
      values: {
        name:
          editTitle ||
          $_("admin.settings.oauthProviders.modals.providerFallback"),
      },
    })}
    subtitle={editProviderKey
      ? describeProviderKey(editProviderKey, editTitle)
      : undefined}
    isOpen={isEditOpen}
    onclose={closeEditModal}
    variant="access-control"
  >
    {#snippet headerIcon()}
      {@render brandTile({ provider: editProviderKey, name: editTitle })}
    {/snippet}

    {#if isEditLoading}
      <div class="edit-loading">
        <LoadingSpinner
          size="md"
          text={$_("admin.settings.oauthProviders.messages.loadingProvider")}
        />
      </div>
    {:else if editSaved}
      <!-- AC8 — the inline success state. The credentials stay on screen, read
           only, so the admin can see what was stored before closing. -->
      <div class="edit-form" role="status">
        <div class="success-banner">
          <span class="success-title"
            >{$_(
              savedEnabled
                ? "admin.settings.oauthProviders.success.title"
                : "admin.settings.oauthProviders.success.titleDisabled",
              { values: { name: editTitle } },
            )}</span
          >
          <span class="success-body"
            >{$_(
              savedEnabled
                ? "admin.settings.oauthProviders.success.body"
                : "admin.settings.oauthProviders.success.bodyDisabled",
            )}</span
          >
        </div>

        <div class="field-group">
          <span class="field-label field-label--required"
            >{$_("admin.settings.oauthProviders.form.clientId")}</span
          >
          <div class="readonly-field">{editForm.client_id}</div>
        </div>

        <div class="field-group">
          <span class="field-label field-label--required"
            >{$_("admin.settings.oauthProviders.form.clientSecret")}</span
          >
          <div class="readonly-field">{"•".repeat(24)}</div>
        </div>

        {#if isTenantFieldAvailable}
          <div class="field-group">
            <span class="field-label field-label--required"
              >{$_("admin.settings.oauthProviders.form.tenantId")}</span
            >
            <div class="readonly-field">{editForm.tenant_id}</div>
          </div>
        {/if}
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
          <label class="field-label field-label--required" for="edit-client-id"
            >{$_("admin.settings.oauthProviders.form.clientId")}</label
          >
          <div
            class="input-wrapper"
            class:input-wrapper--error={editErrors.client_id}
          >
            <input
              id="edit-client-id"
              type="text"
              bind:this={editClientIdInputEl}
              bind:value={editForm.client_id}
              placeholder={$_(
                "admin.settings.oauthProviders.form.clientIdPlaceholder",
              )}
              aria-invalid={Boolean(editErrors.client_id)}
              aria-describedby={editErrors.client_id
                ? "edit-client-id-error"
                : "edit-client-id-hint"}
            />
          </div>
          {#if editErrors.client_id}
            <span class="field-error" id="edit-client-id-error">
              {@render alertCircleGlyph()}
              <span>{editErrors.client_id}</span>
            </span>
          {:else}
            <span class="field-hint" id="edit-client-id-hint"
              >{editProviderKey === "azure"
                ? $_("admin.settings.oauthProviders.form.hints.clientIdAzure")
                : $_("admin.settings.oauthProviders.form.hints.clientId")}</span
            >
          {/if}
        </div>

        <div class="field-group">
          <label
            class="field-label field-label--required"
            for="edit-client-secret"
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
              aria-invalid={Boolean(editErrors.client_secret)}
              aria-describedby={editErrors.client_secret
                ? "edit-client-secret-error"
                : "edit-client-secret-hint"}
            />
            <button
              class="secret-toggle"
              type="button"
              aria-label={showClientSecret
                ? $_("admin.settings.oauthProviders.aria.hideClientSecret")
                : $_("admin.settings.oauthProviders.aria.showClientSecret")}
              onclick={() => (showClientSecret = !showClientSecret)}
            >
              {#if showClientSecret}
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path
                    d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
                  />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              {:else}
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              {/if}
            </button>
          </div>
          {#if editErrors.client_secret}
            <span class="field-error" id="edit-client-secret-error">
              {@render alertCircleGlyph()}
              <span>{editErrors.client_secret}</span>
            </span>
          {:else}
            <span class="field-hint" id="edit-client-secret-hint"
              >{editProviderKey === "azure"
                ? $_(
                    "admin.settings.oauthProviders.form.hints.clientSecretAzure",
                  )
                : $_(
                    "admin.settings.oauthProviders.form.hints.clientSecret",
                  )}</span
            >
          {/if}
        </div>

        <!-- AC11 — the provider-specific required field sits directly under the
             client secret. -->
        {#if isTenantFieldAvailable}
          <div class="field-group">
            <label class="field-label field-label--required" for="edit-tenant-id"
              >{$_("admin.settings.oauthProviders.form.tenantId")}</label
            >
            <div
              class="input-wrapper"
              class:input-wrapper--error={editErrors.tenant_id}
            >
              <input
                id="edit-tenant-id"
                type="text"
                bind:value={editForm.tenant_id}
                placeholder={$_(
                  "admin.settings.oauthProviders.form.tenantIdPlaceholder",
                )}
                aria-invalid={Boolean(editErrors.tenant_id)}
                aria-describedby={editErrors.tenant_id
                  ? "edit-tenant-id-error"
                  : "edit-tenant-id-hint"}
              />
            </div>
            {#if editErrors.tenant_id}
              <span class="field-error" id="edit-tenant-id-error">
                {@render alertCircleGlyph()}
                <span>{editErrors.tenant_id}</span>
              </span>
            {:else}
              <span class="field-hint" id="edit-tenant-id-hint"
                >{$_(
                  "admin.settings.oauthProviders.form.hints.tenantId",
                )}</span
              >
            {/if}
          </div>
        {/if}

        <!-- AC10 — both switches are retained, restyled to the new dialog's
             stacked "label row over control row" shape. -->
        <div class="switch-field">
          <span class="switch-label-row">
            {@render userAddGlyph()}
            <span class="switch-title"
              >{$_(
                "admin.settings.oauthProviders.selfProvisioning.label",
              )}</span
            >
            <span
              class="info-icon-btn"
              role="button"
              tabindex="0"
              aria-label={$_(
                "admin.settings.oauthProviders.selfProvisioning.hint",
              )}
            >
              <svg
                width="13"
                height="13"
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
          <label class="status-switch status-switch--lg">
            <input
              type="checkbox"
              bind:checked={editForm.allow_self_provisioning}
            />
            <span class="toggle"><span class="toggle-thumb"></span></span>
            <span class="switch-state">
              {editForm.allow_self_provisioning
                ? $_("admin.settings.oauthProviders.common.enabled")
                : $_("admin.settings.oauthProviders.common.disabled")}
            </span>
          </label>
        </div>

        <div class="switch-field">
          <span class="switch-label-row">
            {@render powerGlyph()}
            <span class="switch-title"
              >{$_("admin.settings.oauthProviders.form.status")}</span
            >
          </span>
          <label class="status-switch status-switch--lg">
            <input type="checkbox" bind:checked={editForm.is_enabled} />
            <span class="toggle"><span class="toggle-thumb"></span></span>
            <span class="switch-state">
              {editForm.is_enabled
                ? $_("admin.settings.oauthProviders.common.enabled")
                : $_("admin.settings.oauthProviders.common.disabled")}
            </span>
          </label>
        </div>

        <!-- AC7 -->
        {#if editDocsUrl}
          <a
            class="docs-link"
            href={editDocsUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {@render linkGlyph()}
            <span
              >{$_("admin.settings.oauthProviders.docs.link", {
                values: { name: editTitle },
              })}</span
            >
          </a>
        {/if}

        <!-- AC6 -->
        <div class="scopes">
          <button
            class="scopes__trigger"
            type="button"
            aria-expanded={scopesOpen}
            aria-controls="edit-scopes-panel"
            onclick={() => (scopesOpen = !scopesOpen)}
          >
            <span>{$_("admin.settings.oauthProviders.scopes.trigger")}</span>
            <span class="scopes__chevron" class:scopes__chevron--open={scopesOpen}
              >{@render chevronGlyph()}</span
            >
          </button>
          {#if scopesOpen}
            <div class="scopes-card" id="edit-scopes-panel">
              {#each editScopes as scope (scope)}
                <span class="scope-item">
                  <span class="scope-check">{@render checkGlyph()}</span>
                  <span class="scope-name">{scope}</span>
                </span>
              {/each}
              <span class="scopes-note"
                >{$_("admin.settings.oauthProviders.scopes.note")}</span
              >
            </div>
          {/if}
        </div>
      </form>
    {/if}

    {#snippet footer()}
      <span></span>
      <div class="footer-actions">
        {#if editSaved}
          <button class="btn-cancel" type="button" onclick={closeEditModal}>
            {$_("admin.settings.oauthProviders.actions.close")}
          </button>
        {:else}
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
                : editForm.is_enabled
                  ? $_("admin.settings.oauthProviders.actions.saveEnable")
                  : $_("common.save")}
          </button>
        {/if}
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
    /* ".logo-square--tile" — the two providers the design gives a solid mark. */
    --oa-tile-okta: rgb(0, 0, 0);
    --oa-tile-saml: rgb(148, 163, 184);
    /* ".docs-link" / ".scopes__trigger" — the dialog's two disclosure links. */
    --oa-link: rgb(59, 125, 216);
    /* ".field-hint" under each input. */
    --oa-hint: rgb(148, 163, 184);
    /* ".field-error" and the input it marks. */
    --oa-err: rgb(239, 68, 68);
    --oa-err-bg: rgb(254, 242, 242);
    /* ".success-banner" after a save lands. */
    --oa-ok: rgb(45, 144, 107);
    --oa-ok-bg: rgb(230, 246, 240);
    --oa-ok-ring: rgb(198, 246, 213);
    /* ".readonly-field" / ".scopes-card" — the two inert surfaces. */
    --oa-inert-bg: rgb(248, 250, 252);
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
      --oa-tile-okta: rgb(24, 24, 27);
      --oa-tile-saml: rgb(100, 116, 139);
      --oa-link: rgb(122, 168, 237);
      --oa-hint: var(--gx-slate-500);
      --oa-err: #f08a83;
      --oa-err-bg: rgba(239, 68, 68, 0.14);
      --oa-ok: rgb(52, 180, 96);
      --oa-ok-bg: rgba(45, 144, 107, 0.16);
      --oa-ok-ring: rgba(45, 144, 107, 0.34);
      --oa-inert-bg: var(--gx-ring-soft);
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

  /* AC4 — the card expands in place to edit its domains: a wider gutter, a
     softer corner and a lift, so the open row reads as a panel rather than a
     taller row. */
  .provider-card--editing {
    border-radius: 16px;
    gap: 20px;
    padding: 24px 32px 28px;
    box-shadow:
      inset 0 0 0 1px var(--gx-hair),
      0 4px 6px rgba(0, 0, 0, 0.02);
  }

  /* The editing header leads with the status dot and a larger name. */
  .provider-card--editing .provider-title {
    font-size: 18px;
  }

  .provider-card--editing .details {
    gap: 2px;
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

  /* One 40px mark, three fills: shipped artwork inside a hairline tile, the
     design's solid tile for Okta and Generic SAML, and the initial for a
     provider key that has neither. */
  .logo-square {
    width: 40px;
    height: 40px;
    border-radius: 8px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .logo-square--art {
    padding: 8px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
  }

  .logo-square--art img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .logo-square--tile {
    color: #fff;
  }

  .logo-square--tile[data-brand="okta"] {
    background: var(--oa-tile-okta);
  }

  .logo-square--tile[data-brand="saml"] {
    background: var(--oa-tile-saml);
  }

  .logo-square--tile svg {
    display: block;
  }

  .logo-square--initial {
    background: var(--gx-ring-soft);
    font-weight: 700;
    font-size: 16px;
    line-height: 1;
    color: var(--oa-icon-fg);
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

  /* The pencil stays lit while its editor is open — it is the way back out. */
  .gear-btn--active {
    background: var(--gx-ring-soft);
    color: var(--gx-tx-chip-icon-fg);
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

  /* A chip in the draft carries its own remove control; the saved list is
     read-only, so only the editing card shows these. */
  .pill--draft {
    gap: 6px;
    padding-inline-end: 4px;
  }

  .pill__remove {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border-radius: 4px;
    font-size: 13px;
    line-height: 1;
    color: var(--oa-body);
    flex-shrink: 0;
  }

  .pill__remove:hover:not(:disabled) {
    background: var(--gx-org-track);
    color: var(--oa-name);
  }

  .pill__remove:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 1px;
  }

  /* ".domain-editor" — the input and the two actions the expanded card adds. */
  .domain-editor {
    display: flex;
    flex-direction: column;
    gap: 20px;
    align-self: stretch;
  }

  .domain-editor__input {
    min-height: 50px;
    box-sizing: border-box;
    padding: 16px;
    border-radius: 8px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    font-weight: 400;
    font-size: 14px;
    color: var(--gx-slate-900);
    transition: box-shadow 120ms ease;
  }

  .domain-editor__input:focus {
    box-shadow:
      inset 0 0 0 1.5px var(--gx-tx-chip-icon-fg),
      inset 0 0 4px 0 rgba(59, 103, 189, 0.149);
  }

  .domain-editor__input::placeholder {
    color: var(--gx-slate-400);
    opacity: 1;
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

  /* The redesign drops the small-caps field label for a 14px sentence-case one
     with the required marker beside it. */
  .field-label {
    font-family: var(--gx-font);
    font-weight: 700;
    font-size: 14px;
    line-height: 100%;
    color: var(--oa-name);
  }

  .field-label--required::after {
    content: " *";
    color: var(--oa-err);
  }

  /* ".field-hint" — the "where do I find this?" line under each input. It is
     replaced by ".field-error" the moment the field is in error. */
  .field-hint {
    font-weight: 400;
    font-size: 12px;
    line-height: 1.45;
    color: var(--oa-hint);
  }

  /* ---------------- ".switch-field" — AC10 ----------------
     Both switches keep their behaviour and take the dialog's new shape: an
     icon-and-title row, with the control and its state word beneath. */
  .switch-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: flex-start;
    align-self: stretch;
  }

  .switch-label-row {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--oa-name);
  }

  .switch-label-row svg {
    flex-shrink: 0;
  }

  .switch-title {
    font-weight: 700;
    font-size: 14px;
    line-height: 100%;
    color: var(--oa-name);
  }

  .status-switch--lg {
    gap: 10px;
  }

  .status-switch--lg .toggle {
    width: 44px;
    height: 24px;
    border-radius: 12px;
  }

  .status-switch--lg .toggle-thumb {
    width: 20px;
    height: 20px;
  }

  .switch-state {
    font-weight: 400;
    font-size: 14px;
    line-height: 100%;
    color: var(--oa-body);
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
    background: var(--oa-err-bg);
    box-shadow: inset 0 0 0 1px var(--oa-err);
  }

  .input-wrapper--error:focus-within {
    box-shadow: inset 0 0 0 1.5px var(--oa-err);
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
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-weight: 500;
    font-size: 13px;
    line-height: 1.4;
    color: var(--oa-err);
  }

  .field-error svg {
    flex-shrink: 0;
  }

  /* ---------------- AC7 — ".docs-link" ---------------- */
  .docs-link {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
    font-size: 14px;
    line-height: 100%;
    color: var(--oa-link);
    text-decoration: none;
  }

  .docs-link:hover {
    text-decoration: underline;
  }

  .docs-link svg {
    flex-shrink: 0;
  }

  /* ---------------- AC6 — ".scopes" ----------------
     The scope list is fixed by the API, so it is disclosed rather than edited. */
  .scopes {
    display: flex;
    flex-direction: column;
    gap: 12px;
    align-self: stretch;
  }

  .scopes__trigger {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    align-self: flex-start;
    font-weight: 600;
    font-size: 14px;
    line-height: 100%;
    color: var(--oa-link);
  }

  .scopes__trigger:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 3px;
    border-radius: 4px;
  }

  .scopes__chevron {
    display: inline-flex;
    transition: transform 160ms ease;
  }

  .scopes__chevron--open {
    transform: rotate(180deg);
  }

  .scopes-card {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    border-radius: 8px;
    background: var(--oa-inert-bg);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
  }

  .scope-item {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .scope-check {
    display: inline-flex;
    flex-shrink: 0;
    color: var(--oa-ok);
  }

  .scope-name {
    font-weight: 500;
    font-size: 14px;
    line-height: 100%;
    color: var(--oa-name);
  }

  .scopes-note {
    font-style: italic;
    font-size: 12px;
    line-height: 1.45;
    color: var(--oa-body);
  }

  /* ---------------- AC8 — the saved state ---------------- */
  .success-banner {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 16px;
    border-radius: 8px;
    background: var(--oa-ok-bg);
    box-shadow: inset 0 0 0 1px var(--oa-ok-ring);
    align-self: stretch;
  }

  .success-title {
    font-weight: 700;
    font-size: 14px;
    line-height: 100%;
    color: var(--oa-ok);
  }

  .success-body {
    font-weight: 400;
    font-size: 13px;
    line-height: 1.45;
    color: var(--oa-body);
  }

  /* The credentials stay visible after the save, but inert. */
  .readonly-field {
    min-height: 42px;
    display: flex;
    align-items: center;
    align-self: stretch;
    padding: 12px;
    border-radius: 10px;
    background: var(--oa-inert-bg);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    font-size: 14px;
    color: var(--oa-body);
    overflow-wrap: anywhere;
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
