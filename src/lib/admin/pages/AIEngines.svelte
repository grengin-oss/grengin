<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { onMount, tick } from "svelte";
  import { _ } from "svelte-i18n";
  import AdminEmptyState from "../components/AdminEmptyState.svelte";
  import AdminPanelCard from "../components/AdminPanelCard.svelte";
  import PageHeader from "../components/PageHeader.svelte";
  import LoadingSpinner from "../components/LoadingSpinner.svelte";
  import Modal from "../components/Modal.svelte";
  import { toast } from "../../components/Toaster.svelte";
  import { ApiError } from "../../api/client.js";
  import { getAnalyticsOverview } from "../../api/admin/analytics.js";
  import { getModels } from "../../api/models.js";
  import { getLocalizedError } from "../../utils/errorLocalization.js";
  import {
    providerIconSvg,
    providerIconUrl,
  } from "../../utils/providerIcon.js";
  import type { AIEngine, AIEngineModel } from "../types.js";
  import { aiEnginesStore } from "../stores/index.js";
  import { permissionsStore } from "../../features/auth/index.js";
  import { PERMISSIONS } from "../../features/auth/permissions.js";
  import { setPageTitle } from "../../utils/pageTitle";

  $effect(() => {
    setPageTitle($_("aiEngines.title"));
  });

  const store = aiEnginesStore;
  const canManageEngines = $derived(permissionsStore.canManageAiEngines());
  // The "most used this week" tile reads the analytics overview. Engine admins
  // do not necessarily hold analytics:view, so the tile is best-effort: without
  // the grant (or if the call fails) it falls back to "no usage recorded".
  const canViewAnalytics = $derived(
    permissionsStore.hasPermission(PERMISSIONS.analytics.view),
  );

  type EngineFilter = "all" | "active" | "available";

  let query = $state("");
  let filter = $state<EngineFilter>("all");
  let modelQuery = $state("");
  /** Requests per engine key over the last 7 days. Empty until analytics loads. */
  let weeklyRequests = $state<Record<string, number>>({});
  /**
   * Brand marks from the models catalog (GET /models), keyed by provider key and
   * name. The engine list does not always carry `icon`; the catalog that the chat
   * composer draws its provider logos from does, and the keys line up, so it is
   * the fallback rather than dropping to a bare initial.
   */
  let providerIcons = $state<
    Record<string, { icon?: string; icon_dark?: string }>
  >({});

  // Whether a whitelist model generates images (vs. text). Prefer the registry
  // `model_type` when the backend provides it; otherwise fall back to a
  // name-based heuristic covering the known image models (gpt-image-*, the
  // gemini "*-image" / Nano Banana family).
  function isImageEngineModel(model: {
    model_type?: string;
    model_id?: string;
    display_name?: string;
  }): boolean {
    if (model.model_type) return model.model_type === "image_generator";
    const hint =
      `${model.model_id ?? ""} ${model.display_name ?? ""}`.toLowerCase();
    return /image/.test(hint);
  }

  const apiKeyMessageId = "ai-engine-api-key-message";
  const defaultModelHintId = "ai-engine-default-model-hint";
  const systemDefaultHintId = "ai-engine-system-default-hint";
  const modalEngineStatusLabelId = "ai-engine-modal-status-label";
  let isDarkMode = $state(false);
  let apiKeyInputEl = $state<HTMLInputElement | null>(null);
  let connectInputEl = $state<HTMLInputElement | null>(null);

  function focusApiKeyInput() {
    tick().then(() => {
      apiKeyInputEl?.focus();
      apiKeyInputEl?.select();
    });
  }

  function syncThemeState() {
    isDarkMode =
      document.documentElement.classList.contains("dark") ||
      window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function getIconForTheme(iconSource?: {
    icon?: string;
    icon_dark?: string;
  }): string | undefined {
    if (!iconSource) return undefined;
    return isDarkMode
      ? iconSource.icon_dark || iconSource.icon
      : iconSource.icon;
  }

  /** The engine's own mark, else the models catalog's, else nothing. */
  function engineIcon(engine?: AIEngine | null): string | undefined {
    if (!engine) return undefined;
    if (engine.icon) return getIconForTheme(engine);
    const fallback =
      providerIcons[engine.engine_key.toLowerCase()] ??
      providerIcons[engine.display_name.toLowerCase()];
    return getIconForTheme(fallback);
  }

  /** An engine is "connected" once it holds a key — the design's card split. */
  function isConnected(engine: AIEngine): boolean {
    return Boolean(engine.api_key_configured);
  }

  function initialOf(name: string): string {
    return (name.trim()[0] ?? "?").toUpperCase();
  }

  // Optimize .includes() lookups from O(n) to O(1)
  const whitelistedSet = $derived(new Set(store.formData.whitelisted_models));

  const connectedCount = $derived(store.engines.filter(isConnected).length);

  const whitelistedTotal = $derived(
    store.engines.reduce(
      (sum, e) => sum + (e.whitelisted_models?.length ?? 0),
      0,
    ),
  );

  const mostUsed = $derived.by(() => {
    let best: { engine: AIEngine; requests: number } | null = null;
    for (const engine of store.engines) {
      const requests = weeklyRequests[engine.engine_key.toLowerCase()] ?? 0;
      if (requests > 0 && (!best || requests > best.requests)) {
        best = { engine, requests };
      }
    }
    return best;
  });

  const visibleEngines = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return store.engines.filter((engine) => {
      if (filter === "active" && !isConnected(engine)) return false;
      if (filter === "available" && isConnected(engine)) return false;
      if (!q) return true;
      return (
        engine.display_name.toLowerCase().includes(q) ||
        engine.engine_key.toLowerCase().includes(q)
      );
    });
  });

  const allModels = $derived(store.availableModels?.models ?? []);

  const visibleModels = $derived.by(() => {
    const q = modelQuery.trim().toLowerCase();
    if (!q) return allModels;
    return allModels.filter(
      (model) =>
        model.model_id.toLowerCase().includes(q) ||
        model.display_name.toLowerCase().includes(q),
    );
  });

  const whitelistedModels = $derived(
    allModels.filter((model) => whitelistedSet.has(model.model_id)),
  );

  const defaultModelIsImage = $derived.by(() => {
    const model = allModels.find(
      (m) => m.model_id === store.formData.default_model,
    );
    return !!model && isImageEngineModel(model);
  });

  function toISODate(date: Date): string {
    return date.toISOString().split("T")[0];
  }

  async function fetchProviderIcons() {
    try {
      const { providers } = await getModels();
      const map: Record<string, { icon?: string; icon_dark?: string }> = {};
      for (const provider of providers ?? []) {
        const mark = { icon: provider.icon, icon_dark: provider.icon_dark };
        if (provider.key) map[provider.key.toLowerCase()] = mark;
        if (provider.name) map[provider.name.toLowerCase()] = mark;
      }
      providerIcons = map;
    } catch {
      // Logos are decoration — fall back to the initial-letter tile.
      providerIcons = {};
    }
  }

  async function fetchWeeklyUsage() {
    if (!canViewAnalytics) return;
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 7);

    try {
      const overview = await getAnalyticsOverview({
        start_date: toISODate(start),
        end_date: toISODate(end),
      });
      const totals: Record<string, number> = {};
      for (const model of overview.top_models ?? []) {
        const provider = (model.model_provider ?? "").toLowerCase();
        if (!provider) continue;
        totals[provider] =
          (totals[provider] ?? 0) + (model.total_requests ?? 0);
      }
      weeklyRequests = totals;
    } catch {
      // Supplementary tile — the rest of the page still reads without it.
      weeklyRequests = {};
    }
  }

  async function toggleEngineStatus(engine: AIEngine) {
    try {
      await store.toggleEngineStatus(engine);
      toast.success(
        $_(
          "aiEngines.toasts." + (!engine.is_enabled ? "enabled" : "disabled"),
          {
            values: { name: engine.display_name },
          },
        ),
      );
    } catch (err: any) {
      const errorMessage =
        err instanceof ApiError
          ? getLocalizedError(err, "description", $_)
          : err.message;
      toast.error(errorMessage || $_("aiEngines.toasts.failedToUpdate"));
    }
  }

  function openConfig(engine: AIEngine) {
    modelQuery = "";
    store.openConfigModal(engine);
  }

  async function handleConfigSubmit() {
    if (!store.selectedEngine) return;

    // Validate: at least one model must be whitelisted if API key is configured
    if (
      store.selectedEngine.api_key_configured &&
      store.formData.whitelisted_models.length === 0
    ) {
      toast.error($_("aiEngines.toasts.pleaseWhitelistModel"));
      return;
    }

    // Validate: default model is required when models are whitelisted
    if (
      store.selectedEngine.api_key_configured &&
      store.formData.whitelisted_models.length > 0 &&
      !store.formData.default_model
    ) {
      toast.error($_("aiEngines.toasts.selectDefaultModel"));
      return;
    }

    // Validate: default model must be in whitelisted models
    if (
      store.formData.default_model &&
      !store.formData.whitelisted_models.includes(store.formData.default_model)
    ) {
      toast.error($_("aiEngines.toasts.defaultMustBeWhitelisted"));
      return;
    }

    // Prevent unsetting the default engine if it's currently the default
    const isCurrentlyDefault = store.isDefaultEngine(
      store.selectedEngine.engine_key,
    );
    if (isCurrentlyDefault && !store.formData.is_default) {
      toast.error($_("aiEngines.toasts.cannotRemoveDefault"));
      return;
    }

    try {
      const updateData: any = {
        is_enabled: store.formData.is_enabled,
        whitelisted_models: store.formData.whitelisted_models,
        // Each engine has its own default_model (independent of is_default flag)
        default_model: store.formData.default_model || null,
        // is_default marks which engine is THE system default
        is_default: store.formData.is_default,
      };

      // Backend will automatically unset other engines when is_default: true
      await store.updateEngine(store.selectedEngine.engine_key, updateData);

      const action = store.formData.is_default
        ? $_("aiEngines.toasts.setAsDefault", {
            values: { name: store.selectedEngine.display_name },
          })
        : $_("aiEngines.toasts.updated", {
            values: { name: store.selectedEngine.display_name },
          });
      toast.success(action);
      store.closeConfigModal();
    } catch (err: any) {
      const errorMessage =
        err instanceof ApiError
          ? getLocalizedError(err, "description", $_)
          : err.message;
      toast.error(errorMessage || $_("aiEngines.toasts.failedToUpdate"));
    }
  }

  async function handleAddOrUpdateApiKey() {
    try {
      await store.addOrUpdateApiKey();
      toast.success($_("aiEngines.apiKey.added"));
    } catch (err: any) {
      const errorMessage =
        err instanceof ApiError
          ? getLocalizedError(err, "description", $_)
          : err.message;
      toast.error(
        errorMessage || store.apiKeyMessage || $_("aiEngines.apiKey.invalid"),
      );
    }
  }

  function openConnect(engine: AIEngine) {
    store.openConnectModal(engine);
    tick().then(() => connectInputEl?.focus());
  }

  async function handleConnectSubmit() {
    const engine = store.selectedEngine;
    if (!engine) return;
    try {
      await store.addOrUpdateApiKey();
      toast.success(
        $_("aiEngines.connect.connected", {
          values: { name: engine.display_name },
        }),
      );
      store.closeConnectModal();
    } catch (err: any) {
      const errorMessage =
        err instanceof ApiError
          ? getLocalizedError(err, "description", $_)
          : err.message;
      toast.error(
        errorMessage || store.apiKeyMessage || $_("aiEngines.apiKey.invalid"),
      );
    }
  }

  async function handleValidateApiKey() {
    try {
      const result = await store.validateApiKey();
      const message = store.apiKeyMessage || $_("aiEngines.apiKey.valid");
      if (result.valid) {
        toast.success(message);
      } else {
        toast.error(message);
      }
    } catch (err: any) {
      const errorMessage =
        err instanceof ApiError
          ? getLocalizedError(err, "description", $_)
          : err.message;
      toast.error(
        errorMessage || store.apiKeyMessage || $_("aiEngines.apiKey.invalid"),
      );
    }
  }

  async function handleDeleteApiKey() {
    try {
      await store.removeApiKey();
      toast.success($_("aiEngines.apiKey.removed"));
    } catch (err: any) {
      const errorMessage =
        err instanceof ApiError
          ? getLocalizedError(err, "description", $_)
          : err.message;
      toast.error(errorMessage || $_("aiEngines.toasts.failedToDeleteKey"));
    }
  }

  function toggleModelSelection(modelId: string) {
    // Prevent unchecking the default model
    if (
      modelId === store.formData.default_model &&
      store.formData.whitelisted_models.includes(modelId)
    ) {
      toast.error($_("aiEngines.modelWhitelist.cannotRemoveDefault"));
      return;
    }

    const index = store.formData.whitelisted_models.indexOf(modelId);

    // Calculate new values without updating state yet
    let newWhitelistedModels: string[];
    let newDefaultModel = store.formData.default_model;

    if (index > -1) {
      // Removing model
      newWhitelistedModels = store.formData.whitelisted_models.filter(
        (id) => id !== modelId,
      );

      // If we removed a model and default becomes invalid, clear default
      if (
        store.formData.default_model &&
        !newWhitelistedModels.includes(store.formData.default_model)
      ) {
        newDefaultModel = null;
      }
    } else {
      // Adding model
      newWhitelistedModels = [...store.formData.whitelisted_models, modelId];

      // Auto-select first model as default if none is set
      if (!store.formData.default_model && newWhitelistedModels.length === 1) {
        newDefaultModel = modelId;
      }
    }

    // Single update - only one re-render
    store.formData = {
      ...store.formData,
      whitelisted_models: newWhitelistedModels,
      default_model: newDefaultModel,
    };
  }

  function selectAllModels() {
    if (store.availableModels) {
      const allModelIds = store.availableModels.models.map((m) => m.model_id);

      // Auto-select first model as default if none is set
      const newDefaultModel =
        !store.formData.default_model && allModelIds.length > 0
          ? allModelIds[0]
          : store.formData.default_model;

      // Single update
      store.formData = {
        ...store.formData,
        whitelisted_models: allModelIds,
        default_model: newDefaultModel,
      };
    }
  }

  function deselectAllModels() {
    // Keep the default model in the whitelist
    if (store.formData.default_model) {
      store.formData = {
        ...store.formData,
        whitelisted_models: [store.formData.default_model],
      };
      toast.error($_("aiEngines.modelWhitelist.mustRemainWhitelisted"));
    } else {
      store.formData = {
        ...store.formData,
        whitelisted_models: [],
      };
    }
  }

  function toggleSystemDefault() {
    if (
      store.formData.is_default &&
      store.isDefaultEngine(store.selectedEngine?.engine_key || "")
    ) {
      toast.error($_("aiEngines.systemDefault.cannotRemove"));
      return;
    }
    store.formData = {
      ...store.formData,
      is_default: !store.formData.is_default,
    };
  }

  // Helper to get engine status
  function getEngineStatus(engine: AIEngine): {
    text: string;
    type:
      | "connected"
      | "no-key"
      | "invalid"
      | "disabled"
      | "not-validated"
      | "not-configured";
  } {
    // Keylessness outranks the enabled flag: the design labels an engine with no
    // key "Not Connected", even though the backend also reports it as disabled.
    if (
      !engine.api_key_configured ||
      engine.api_key_status === "not_configured"
    ) {
      return { text: $_("aiEngines.card.notConnected"), type: "no-key" };
    }
    if (!engine.is_enabled) {
      return { text: $_("aiEngines.status.disabled"), type: "disabled" };
    }
    if (engine.api_key_status === "in_valid") {
      return { text: $_("aiEngines.status.invalid"), type: "invalid" };
    }
    if (engine.api_key_status === "not_validated") {
      return {
        text: $_("aiEngines.status.notValidated"),
        type: "not-validated",
      };
    }
    if (engine.api_key_status === "valid") {
      return { text: $_("aiEngines.status.connected"), type: "connected" };
    }
    return {
      text: $_("aiEngines.status.notConfigured"),
      type: "not-configured",
    };
  }

  function modelTypeLabel(model: AIEngineModel): string {
    return isImageEngineModel(model)
      ? $_("aiEngines.modelWhitelist.imageModel")
      : $_("aiEngines.modelWhitelist.textModel");
  }

  onMount(() => {
    syncThemeState();
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaQuery.addEventListener("change", syncThemeState);

    void fetchProviderIcons();

    store
      .fetch()
      .then(fetchWeeklyUsage)
      .catch((err: any) => {
        const errorMessage =
          err instanceof ApiError
            ? getLocalizedError(err, "description", $_)
            : err.message;
        toast.error(errorMessage || $_("aiEngines.toasts.failedToLoad"));
      });

    return () => mediaQuery.removeEventListener("change", syncThemeState);
  });
</script>

<!-- Image-generation models carry a picture glyph where text models keep the
     design's "T" letter — an "I" at 11px reads as a 1 or a pipe. -->
{#snippet imageGlyph(size: number)}
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
{/snippet}

{#snippet checkIcon()}
  <svg
    width="12"
    height="12"
    viewBox="0 0 12 12"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="m2 6 3 3 5-6"
      stroke="currentColor"
      stroke-width="1.6"
      fill="none"
    />
  </svg>
{/snippet}

<div class="ai-engines-container">
  <PageHeader
    title={$_("aiEngines.title")}
    subtitle={$_("aiEngines.subtitle")}
  />

  {#if store.isLoading}
    <AdminPanelCard>
      <LoadingSpinner text={$_("aiEngines.loading")} />
    </AdminPanelCard>
  {:else if store.engines.length === 0}
    <AdminPanelCard>
      <AdminEmptyState
        title={$_("aiEngines.emptyTitle")}
        message={$_("aiEngines.emptyMessage")}
      >
        {#snippet icon()}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        {/snippet}
      </AdminEmptyState>
    </AdminPanelCard>
  {:else}
    <!-- ".toolbar-row": search on the left, the status filter on the right. -->
    <div class="toolbar-row">
      <div class="search-row">
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
        >
          <circle
            cx="7"
            cy="7"
            r="4.5"
            stroke="currentColor"
            stroke-width="1.3"
          />
          <path d="m13 13-2.5-2.5" stroke="currentColor" stroke-width="1.3" />
        </svg>
        <input
          type="text"
          bind:value={query}
          placeholder={$_("aiEngines.searchPlaceholder")}
          aria-label={$_("aiEngines.searchPlaceholder")}
        />
      </div>
      <div
        class="layout-toggles"
        role="group"
        aria-label={$_("aiEngines.filters.label")}
      >
        {#each ["all", "active", "available"] as const as mode}
          <button
            class="grid-toggle"
            type="button"
            aria-pressed={filter === mode}
            onclick={() => (filter = mode)}
          >
            {$_("aiEngines.filters." + mode)}
          </button>
        {/each}
      </div>
    </div>

    <!-- ".stat-row" -->
    <div class="stat-row">
      <div class="stat-card">
        <span class="stat-card__icon stat-card__icon--green" aria-hidden="true">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="22"
            height="22"
            viewBox="0 0 22 22"
            fill="none"
          >
            <path
              d="M19.9847 9.16684C20.4033 11.2214 20.105 13.3573 19.1394 15.2185C18.1738 17.0797 16.5994 18.5536 14.6786 19.3944C12.7578 20.2352 10.6069 20.3921 8.5844 19.839C6.56193 19.2859 4.79022 18.0561 3.56471 16.3548C2.3392 14.6535 1.73399 12.5835 1.84998 10.4899C1.96598 8.39641 2.79618 6.40592 4.20214 4.85041C5.60809 3.2949 7.50482 2.2684 9.57602 1.94209C11.6472 1.61578 13.7677 2.00938 15.5838 3.05726M8.25081 10.0831L11.0008 12.8331L20.1675 3.6664"
              stroke="#F1F8F4"
              stroke-width="2"
              stroke-linecap="round"
            />
          </svg>
        </span>
        <div class="stat-card__info">
          <span class="stat-card__value">
            {$_("aiEngines.stats.connectedValue", {
              values: {
                connected: connectedCount,
                total: store.engines.length,
              },
            })}
          </span>
          <span class="stat-card__label"
            >{$_("aiEngines.stats.connectedLabel")}</span
          >
        </div>
      </div>
      <div class="stat-card">
        <span class="stat-card__icon" aria-hidden="true">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="21"
            height="21"
            viewBox="0 0 21 21"
            fill="none"
          >
            <path
              d="M1 10.1672C0.999569 10.3425 1.04943 10.5143 1.14367 10.6622C1.23791 10.81 1.37258 10.9277 1.53171 11.0014L9.41559 14.5858C9.65321 14.6934 9.91105 14.749 10.1719 14.749C10.4327 14.749 10.6906 14.6934 10.9282 14.5858L18.7937 11.0106C18.956 10.9376 19.0936 10.819 19.1896 10.6693C19.2856 10.5195 19.336 10.3451 19.3346 10.1672M1 14.7508C0.999569 14.9261 1.04943 15.0979 1.14367 15.2457C1.23791 15.3936 1.37258 15.5113 1.53171 15.585L9.41559 19.1693C9.65321 19.2769 9.91105 19.3326 10.1719 19.3326C10.4327 19.3326 10.6906 19.2769 10.9282 19.1693L18.7937 15.5941C18.956 15.5212 19.0936 15.4026 19.1896 15.2529C19.2856 15.1031 19.336 14.9287 19.3346 14.7508M10.9286 1.16534C10.6897 1.05638 10.4303 1 10.1677 1C9.90518 1 9.6457 1.05638 9.40684 1.16534L1.55045 4.74054C1.38778 4.81226 1.24947 4.92975 1.15237 5.07867C1.05528 5.2276 1.00358 5.40155 1.00358 5.57933C1.00358 5.75712 1.05528 5.93106 1.15237 6.07999C1.24947 6.22892 1.38778 6.3464 1.55045 6.41813L9.416 10.0025C9.65487 10.1114 9.91435 10.1678 10.1769 10.1678C10.4394 10.1678 10.6989 10.1114 10.9378 10.0025L18.8033 6.4273C18.966 6.35557 19.1043 6.23809 19.2014 6.08916C19.2985 5.94023 19.3502 5.76628 19.3502 5.5885C19.3502 5.41072 19.2985 5.23677 19.2014 5.08784C19.1043 4.93891 18.966 4.82143 18.8033 4.7497L10.9286 1.16534Z"
              stroke="#EFF4FC"
              stroke-width="2"
              stroke-linecap="round"
            />
          </svg>
        </span>
        <div class="stat-card__info">
          <span class="stat-card__value">{whitelistedTotal}</span>
          <span class="stat-card__label"
            >{$_("aiEngines.stats.whitelistedLabel")}</span
          >
        </div>
      </div>
      <div class="stat-card">
        <span class="stat-card__icon" aria-hidden="true">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="22"
            height="22"
            viewBox="0 0 22 22"
            fill="none"
          >
            <path
              d="M13.7497 8.24976L8.24921 13.7502M8.24921 8.24976L13.7497 13.7502M20.1668 11C20.1668 16.063 16.0624 20.1674 10.9994 20.1674C5.93642 20.1674 1.83203 16.063 1.83203 11C1.83203 5.93697 5.93642 1.83258 10.9994 1.83258C16.0624 1.83258 20.1668 5.93697 20.1668 11Z"
              stroke="#EFF4FC"
              stroke-width="2"
              stroke-linecap="round"
            />
          </svg>
        </span>
        <div class="stat-card__info">
          <span class="stat-card__value">
            {mostUsed
              ? mostUsed.engine.display_name
              : $_("aiEngines.stats.noUsageValue")}
          </span>
          <span class="stat-card__label">
            {mostUsed
              ? $_("aiEngines.stats.mostUsedLabel", {
                  values: { count: mostUsed.requests },
                })
              : $_("aiEngines.stats.noUsageLabel")}
          </span>
        </div>
      </div>
    </div>

    {#if visibleEngines.length === 0}
      <AdminPanelCard>
        <AdminEmptyState
          message={query.trim()
            ? $_("aiEngines.noResults", { values: { query: query.trim() } })
            : $_("aiEngines.noFilterResults")}
        />
      </AdminPanelCard>
    {:else}
      <div
        class="engine-grid"
        role="list"
        aria-label={$_("aiEngines.subtitle")}
      >
        {#each visibleEngines as engine (engine.engine_key)}
          {@const connected = isConnected(engine)}
          {@const status = getEngineStatus(engine)}
          {@const cardLabelId = `engine-name-${engine.engine_key}`}
          {@const cardStatusId = `engine-status-${engine.engine_key}`}
          {@const iconValue = engineIcon(engine)}
          {@const engineIconSvg = providerIconSvg(iconValue)}
          {@const engineIconUrl = providerIconUrl(iconValue)}

          <div
            class="engine-card"
            class:engine-card--disconnected={!connected}
            role="listitem"
          >
            <div class="card-header">
              <div class="brand-group">
                <span
                  class="logo-box"
                  class:logo-box--muted={!connected}
                  aria-hidden="true"
                >
                  {#if engineIconSvg}
                    <!-- eslint-disable-next-line svelte/no-at-html-tags — sanitized by providerIconSvg -->
                    {@html engineIconSvg}
                  {:else if engineIconUrl}
                    <img class="logo-img" src={engineIconUrl} alt="" />
                  {:else}
                    {initialOf(engine.display_name)}
                  {/if}
                </span>
                <span
                  id={cardLabelId}
                  class="brand-name"
                  class:brand-name--dim={!connected}
                >
                  {engine.display_name}
                </span>
              </div>
              {#if canManageEngines}
                <button
                  class="toggle-switch"
                  class:toggle-switch--on={engine.is_enabled}
                  type="button"
                  role="switch"
                  aria-checked={engine.is_enabled}
                  aria-labelledby={cardLabelId}
                  aria-describedby={cardStatusId}
                  disabled={!connected}
                  title={connected ? "" : $_("aiEngines.card.connectFirst")}
                  onclick={() => toggleEngineStatus(engine)}
                >
                  <span class="toggle-handle"></span>
                </button>
              {/if}
            </div>

            <div class="status-row">
              {#if status.type === "connected"}
                <svg
                  class="status-check"
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle
                    cx="7"
                    cy="7"
                    r="6"
                    stroke="currentColor"
                    stroke-width="1.1"
                  />
                  <path
                    d="m4.5 7 1.8 1.8L9.7 5"
                    stroke="currentColor"
                    stroke-width="1.1"
                    fill="none"
                  />
                </svg>
              {:else}
                <span
                  class="status-dot"
                  class:status-dot--danger={status.type === "invalid"}
                  class:status-dot--warn={status.type === "not-validated"}
                  aria-hidden="true"
                ></span>
              {/if}
              <span
                id={cardStatusId}
                class="status-label"
                class:status-label--muted={!connected}
                class:status-label--danger={status.type === "invalid"}
              >
                {status.text}
              </span>
            </div>

            {#if connected}
              <div class="details-list">
                <div class="detail-row">
                  <span class="detail-key">{$_("aiEngines.apiKey.title")}</span>
                  <span class="key-badge">
                    <span>{engine.api_key_preview ?? "••••"}</span>
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="none"
                      aria-hidden="true"
                    >
                      <rect
                        x="4"
                        y="4"
                        width="6"
                        height="6"
                        rx="1"
                        stroke="currentColor"
                        stroke-width="1"
                      />
                      <rect
                        x="2"
                        y="2"
                        width="6"
                        height="6"
                        rx="1"
                        stroke="currentColor"
                        stroke-width="1"
                      />
                    </svg>
                  </span>
                </div>
                <div class="detail-divider"></div>
                <div class="detail-row">
                  <span class="detail-key"
                    >{$_("aiEngines.card.defaultModel")}</span
                  >
                  <span class="detail-val">
                    {engine.default_model || $_("aiEngines.card.notSet")}
                  </span>
                </div>
                <div class="detail-divider"></div>
                <div class="detail-row">
                  <span class="detail-key"
                    >{$_("aiEngines.card.whitelist")}</span
                  >
                  <span class="detail-val detail-val--accent">
                    {$_("aiEngines.card.whitelistCount", {
                      values: { count: engine.whitelisted_models?.length ?? 0 },
                    })}
                  </span>
                </div>
              </div>
            {:else}
              <span class="card-desc">
                {$_("aiEngines.card.noKeyDescription", {
                  values: { name: engine.display_name },
                })}
              </span>
            {/if}

            {#if canManageEngines}
              <div class="card-footer">
                {#if connected}
                  <button
                    class="card-btn card-btn--config"
                    type="button"
                    onclick={() => openConfig(engine)}
                  >
                    {$_("aiEngines.configureEngine")}
                  </button>
                {:else}
                  <button
                    class="card-btn card-btn--connect"
                    type="button"
                    onclick={() => openConnect(engine)}
                  >
                    {$_("aiEngines.connectEngine")}
                  </button>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<!-- ================= Configure engine (design: .cfg-modal) ================= -->
<Modal
  bind:isOpen={store.showConfigModal}
  variant="ai-engines"
  title={$_("aiEngines.configure.title", {
    values: { name: store.selectedEngine?.display_name ?? "" },
  })}
  subtitle={$_("aiEngines.configure.subtitle")}
  onclose={store.closeConfigModal}
>
  {#snippet headerIcon()}
    {@const cfgIcon = engineIcon(store.selectedEngine)}
    {@const cfgIconSvg = providerIconSvg(cfgIcon)}
    {@const cfgIconUrl = providerIconUrl(cfgIcon)}
    <span class="cfg-brand-icon">
      {#if cfgIconSvg}
        {@html cfgIconSvg}
      {:else if cfgIconUrl}
        <img class="cfg-brand-img" src={cfgIconUrl} alt="" />
      {:else}
        <svg
          width="20"
          height="19"
          viewBox="0 0 20 19"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M10 0c0 5.5 4.5 9.5 9.5 9.5-5 0-9.5 4-9.5 9.5 0-5.5-4.5-9.5-9.5-9.5C5.5 9.5 10 5.5 10 0z"
            fill="currentColor"
          />
        </svg>
      {/if}
    </span>
  {/snippet}

  {#snippet children()}
    {#if store.selectedEngine}
      <!-- API key -->
      <div class="cfg-section">
        <span class="cfg-label">{$_("aiEngines.apiKey.title")}</span>

        {#if store.apiKeyMode === "view" && !store.apiKeyDeleteConfirm}
          <div class="api-key-row">
            <div class="api-chip">
              <span>{store.selectedEngine.api_key_preview ?? "••••"}</span>
            </div>
            <div class="api-actions">
              <button
                class="validate-btn"
                type="button"
                onclick={handleValidateApiKey}
                disabled={store.apiKeyLoading}
              >
                {store.apiKeyLoading
                  ? $_("aiEngines.apiKey.validating")
                  : $_("aiEngines.apiKey.validate")}
              </button>
              <button
                class="validate-btn"
                type="button"
                disabled={store.apiKeyLoading}
                onclick={() => {
                  store.apiKeyMode = "update";
                  store.apiKeyInput = "";
                  store.apiKeyMessage = null;
                  store.apiKeyStatus = "not_validated";
                  focusApiKeyInput();
                }}
              >
                {$_("aiEngines.apiKey.update")}
              </button>
              <button
                class="validate-btn validate-btn--danger"
                type="button"
                disabled={store.apiKeyLoading}
                onclick={() => (store.apiKeyDeleteConfirm = true)}
              >
                {$_("aiEngines.apiKey.delete")}
              </button>
            </div>
          </div>
        {:else if store.apiKeyDeleteConfirm}
          <p class="cfg-confirm-text">{$_("aiEngines.apiKey.deleteConfirm")}</p>
          <div class="api-actions">
            <button
              class="validate-btn validate-btn--neutral"
              type="button"
              disabled={store.apiKeyLoading}
              onclick={() => (store.apiKeyDeleteConfirm = false)}
            >
              {$_("common.cancel")}
            </button>
            <button
              class="validate-btn validate-btn--danger"
              type="button"
              disabled={store.apiKeyLoading}
              onclick={handleDeleteApiKey}
            >
              {$_("aiEngines.apiKey.confirmDelete")}
            </button>
          </div>
        {:else}
          <div class="api-key-row">
            <div class="api-chip api-chip--input">
              <input
                bind:this={apiKeyInputEl}
                type={store.showApiKey ? "text" : "password"}
                placeholder={$_("aiEngines.apiKey.placeholder")}
                aria-label={$_("aiEngines.apiKey.title")}
                autocomplete="off"
                spellcheck="false"
                bind:value={store.apiKeyInput}
                onkeydown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddOrUpdateApiKey();
                  }
                }}
              />
              <button
                class="api-chip__eye"
                type="button"
                aria-label={$_("aiEngines.apiKey.toggleVisibility")}
                onclick={() => (store.showApiKey = !store.showApiKey)}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  {#if store.showApiKey}
                    <path
                      fill="currentColor"
                      d="M2 5.27L3.28 4L20 20.72L18.73 22l-3.08-3.08c-1.15.38-2.37.58-3.65.58c-5 0-9.27-3.11-11-7.5c.69-1.76 1.79-3.31 3.19-4.54zM12 9a3 3 0 0 1 3 3a3 3 0 0 1-.17 1L11 9.17A3 3 0 0 1 12 9m0-4.5c5 0 9.27 3.11 11 7.5a11.8 11.8 0 0 1-4 5.19l-1.42-1.43A9.86 9.86 0 0 0 20.82 12A9.82 9.82 0 0 0 12 6.5c-1.09 0-2.16.18-3.16.5L7.3 5.47c1.44-.62 3.03-.97 4.7-.97M3.18 12A9.82 9.82 0 0 0 12 17.5c.69 0 1.37-.07 2-.21L11.72 15A3.064 3.064 0 0 1 9 12.28L5.6 8.87c-.99.85-1.82 1.91-2.42 3.13"
                    />
                  {:else}
                    <path
                      fill="currentColor"
                      d="M12 9a3 3 0 0 1 3 3a3 3 0 0 1-3 3a3 3 0 0 1-3-3a3 3 0 0 1 3-3m0-4.5c5 0 9.27 3.11 11 7.5c-1.73 4.39-6 7.5-11 7.5S2.73 16.39 1 12c1.73-4.39 6-7.5 11-7.5M3.18 12a9.821 9.821 0 0 0 17.64 0a9.821 9.821 0 0 0-17.64 0"
                    />
                  {/if}
                </svg>
              </button>
            </div>
            <div class="api-actions">
              {#if store.apiKeyMode === "update"}
                <button
                  class="validate-btn validate-btn--neutral"
                  type="button"
                  disabled={store.apiKeyLoading}
                  onclick={() => {
                    store.apiKeyInput = "";
                    store.apiKeyMessage = null;
                    store.apiKeyMode = store.selectedEngine?.api_key_configured
                      ? "view"
                      : "cta";
                  }}
                >
                  {$_("common.cancel")}
                </button>
              {/if}
              <button
                class="validate-btn"
                type="button"
                disabled={store.apiKeyLoading}
                onclick={handleAddOrUpdateApiKey}
              >
                {store.apiKeyMode === "update"
                  ? $_("aiEngines.apiKey.update")
                  : $_("aiEngines.apiKey.add")}
              </button>
            </div>
          </div>
        {/if}

        {#if store.apiKeyMessage}
          <div
            class="key-status-row"
            id={apiKeyMessageId}
            role="status"
            aria-live="polite"
            aria-atomic="true"
            class:key-status-row--bad={store.apiKeyStatus === "in_valid"}
          >
            <span class="status-dot" aria-hidden="true"></span>
            <span>{store.apiKeyMessage}</span>
          </div>
        {/if}
      </div>

      {#if store.selectedEngine.api_key_configured}
        <div class="cfg-hr"></div>

        <!-- Model whitelist -->
        <div class="cfg-section">
          <div class="whitelist-header">
            <div class="whitelist-header-left">
              <span class="cfg-label"
                >{$_("aiEngines.modelWhitelist.title")}</span
              >
              <span class="whitelist-count">
                {$_("aiEngines.modelWhitelist.countEnabled", {
                  values: {
                    count: store.formData.whitelisted_models.length,
                    total: allModels.length,
                  },
                })}
              </span>
            </div>
            <div class="whitelist-actions">
              <button
                class="check-all-btn"
                type="button"
                onclick={selectAllModels}
              >
                {@render checkIcon()}
                {$_("aiEngines.modelWhitelist.checkAll")}
              </button>
              <button
                class="uncheck-all-btn"
                type="button"
                onclick={deselectAllModels}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M2 2l8 8M10 2 2 10"
                    stroke="currentColor"
                    stroke-width="1.4"
                  />
                </svg>
                {$_("aiEngines.modelWhitelist.uncheckAll")}
              </button>
            </div>
          </div>

          <div class="model-search">
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              aria-hidden="true"
            >
              <circle
                cx="6"
                cy="6"
                r="4"
                stroke="currentColor"
                stroke-width="1.2"
              />
              <path
                d="m11.5 11.5-2-2"
                stroke="currentColor"
                stroke-width="1.2"
              />
            </svg>
            <input
              type="text"
              bind:value={modelQuery}
              placeholder={$_("aiEngines.modelWhitelist.searchPlaceholder")}
              aria-label={$_("aiEngines.modelWhitelist.searchPlaceholder")}
            />
          </div>

          {#if store.loadingModels}
            <LoadingSpinner text={$_("aiEngines.modelWhitelist.loading")} />
          {:else if allModels.length === 0}
            <p class="helper-text">{$_("aiEngines.modelWhitelist.noModels")}</p>
          {:else if visibleModels.length === 0}
            <p class="helper-text">
              {$_("aiEngines.modelWhitelist.noSearchResults", {
                values: { query: modelQuery },
              })}
            </p>
          {:else}
            <div class="models-list">
              {#each visibleModels as model (model.model_id)}
                {@const checked = whitelistedSet.has(model.model_id)}
                {@const isDefaultModel =
                  model.model_id === store.formData.default_model}
                {@const modelLabelId = `model-name-${model.model_id}`}
                <div class="model-row" class:model-row--dim={!checked}>
                  <button
                    class="model-check"
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    aria-labelledby={modelLabelId}
                    data-checked={checked}
                    disabled={isDefaultModel}
                    title={isDefaultModel
                      ? $_("aiEngines.modelWhitelist.mustRemainWhitelisted")
                      : ""}
                    onclick={() => toggleModelSelection(model.model_id)}
                  >
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 10 10"
                      aria-hidden="true"
                    >
                      <path
                        d="M1 5l3 3 5-6"
                        stroke="currentColor"
                        stroke-width="1.6"
                        fill="none"
                      />
                    </svg>
                  </button>
                  <span class="type-badge" title={modelTypeLabel(model)}>
                    {#if isImageEngineModel(model)}
                      {@render imageGlyph(12)}
                    {:else}
                      <span aria-hidden="true">T</span>
                    {/if}
                    <span class="sr-only">{modelTypeLabel(model)}</span>
                  </span>
                  <div class="model-details">
                    <span class="model-name" id={modelLabelId}>
                      {model.display_name}
                      {#if isDefaultModel}
                        <span class="default-model-badge">
                          {$_("aiEngines.modelWhitelist.defaultBadge")}
                        </span>
                      {/if}
                    </span>
                    <span class="model-id">{model.model_id}</span>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>

        <div class="cfg-hr"></div>

        <!-- Default model for this engine -->
        <div class="cfg-section">
          <span class="cfg-label" id="ai-engine-default-model-label">
            {$_("aiEngines.modelWhitelist.defaultModel")}
          </span>
          {#if whitelistedModels.length > 0}
            <div class="dropdown">
              <div class="dropdown-value">
                <span class="mini-badge" aria-hidden="true">
                  {#if defaultModelIsImage}
                    {@render imageGlyph(11)}
                  {:else}
                    T
                  {/if}
                </span>
                <span>{store.formData.default_model}</span>
              </div>
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="m4 5.5 3 3 3-3"
                  stroke="currentColor"
                  stroke-width="1.3"
                  fill="none"
                />
              </svg>
              <select
                class="dropdown-select"
                bind:value={store.formData.default_model}
                aria-labelledby="ai-engine-default-model-label"
                aria-describedby={defaultModelHintId}
              >
                {#each whitelistedModels as model (model.model_id)}
                  <option value={model.model_id}>{model.display_name}</option>
                {/each}
              </select>
            </div>
            <span class="helper-text" id={defaultModelHintId}>
              {$_("aiEngines.modelWhitelist.defaultModelHint")}
            </span>
          {:else}
            <p class="helper-text" role="status" aria-live="polite">
              {$_("aiEngines.modelWhitelist.defaultModelWarning")}
            </p>
          {/if}
        </div>

        <div class="cfg-hr"></div>

        <!-- System default engine -->
        {#if store.loadingOrganization}
          <div class="default-callout">
            <LoadingSpinner text={$_("aiEngines.systemDefault.loading")} />
          </div>
        {:else}
          <div class="default-callout">
            <div class="callout-row">
              <button
                class="callout-check"
                type="button"
                role="checkbox"
                aria-checked={store.formData.is_default}
                aria-labelledby="ai-engine-system-default-label"
                aria-describedby={systemDefaultHintId}
                data-checked={store.formData.is_default}
                onclick={toggleSystemDefault}
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  aria-hidden="true"
                >
                  <path
                    d="M1 5l3 3 5-6"
                    stroke="currentColor"
                    stroke-width="1.6"
                    fill="none"
                  />
                </svg>
              </button>
              <span class="callout-label" id="ai-engine-system-default-label">
                {$_("aiEngines.systemDefault.title")}
              </span>
            </div>
            <span class="callout-desc" id={systemDefaultHintId}>
              {$_("aiEngines.systemDefault.hint")}
            </span>
          </div>
        {/if}

        <div class="cfg-hr"></div>
      {/if}

      <!-- Engine status -->
      <div class="status-toggle-row">
        <div class="status-toggle-labels">
          <span class="cfg-label" id={modalEngineStatusLabelId}>
            {$_("aiEngines.engineStatus.label")}
          </span>
          <span>
            {store.formData.is_enabled
              ? $_("aiEngines.engineStatus.enabled")
              : $_("aiEngines.engineStatus.disabled")}
          </span>
        </div>
        <button
          class="status-toggle"
          class:status-toggle--on={store.formData.is_enabled}
          type="button"
          role="switch"
          aria-checked={store.formData.is_enabled}
          aria-labelledby={modalEngineStatusLabelId}
          onclick={() => {
            store.formData = {
              ...store.formData,
              is_enabled: !store.formData.is_enabled,
            };
          }}
        >
          <span class="status-toggle-handle"></span>
        </button>
      </div>
    {/if}
  {/snippet}

  {#snippet footer()}
    <div class="cfg-footer-actions">
      <button
        class="btn-cancel-sm"
        type="button"
        onclick={store.closeConfigModal}
        disabled={store.saving}
      >
        {$_("common.cancel")}
      </button>
      <button
        class="btn-save"
        type="button"
        onclick={handleConfigSubmit}
        disabled={store.saving}
      >
        {store.saving
          ? $_("aiEngines.actions.saving")
          : $_("aiEngines.actions.saveChanges")}
      </button>
    </div>
  {/snippet}
</Modal>

<!-- ================= Connect engine (design: .cnx-modal) ================= -->
<Modal
  bind:isOpen={store.showConnectModal}
  variant="ai-connect"
  title={$_("aiEngines.connect.title", {
    values: { name: store.selectedEngine?.display_name ?? "" },
  })}
  onclose={store.closeConnectModal}
>
  {#snippet headerIcon()}
    {@const cnxIcon = engineIcon(store.selectedEngine)}
    {@const cnxIconSvg = providerIconSvg(cnxIcon)}
    {@const cnxIconUrl = providerIconUrl(cnxIcon)}
    <span class="cnx-brand-icon">
      {#if cnxIconSvg}
        {@html cnxIconSvg}
      {:else if cnxIconUrl}
        <img class="cnx-brand-img" src={cnxIconUrl} alt="" />
      {:else}
        {initialOf(store.selectedEngine?.display_name ?? "")}
      {/if}
    </span>
  {/snippet}

  {#snippet headerBadge()}
    <span class="cnx-badge">{$_("aiEngines.card.notConnected")}</span>
  {/snippet}

  {#snippet children()}
    {#if store.selectedEngine}
      <div class="cnx-empty">
        <span class="cnx-icon-glow" aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <circle
              cx="11"
              cy="11"
              r="5"
              stroke="currentColor"
              stroke-width="1.6"
            />
            <path
              d="M14.5 14.5 24 24M20 20l3-3"
              stroke="currentColor"
              stroke-width="1.6"
              fill="none"
            />
          </svg>
        </span>
        <div class="cnx-empty-title">
          {$_("aiEngines.connect.emptyTitle", {
            values: { name: store.selectedEngine.display_name },
          })}
        </div>
        <p class="cnx-empty-desc">
          {$_("aiEngines.connect.emptyDescription", {
            values: { name: store.selectedEngine.display_name },
          })}
        </p>
      </div>

      <div class="cnx-input-section">
        <label class="cnx-input-label" for="ai-engine-connect-key">
          {$_("aiEngines.apiKey.title")}
        </label>
        <div class="cnx-input-wrapper">
          <input
            id="ai-engine-connect-key"
            bind:this={connectInputEl}
            type={store.showApiKey ? "text" : "password"}
            autocomplete="off"
            spellcheck="false"
            placeholder={$_("aiEngines.connect.placeholder", {
              values: { name: store.selectedEngine.display_name },
            })}
            bind:value={store.apiKeyInput}
            onkeydown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleConnectSubmit();
              }
            }}
          />
          <button
            class="api-chip__eye"
            type="button"
            aria-label={$_("aiEngines.apiKey.toggleVisibility")}
            onclick={() => (store.showApiKey = !store.showApiKey)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              {#if store.showApiKey}
                <path
                  fill="currentColor"
                  d="M2 5.27L3.28 4L20 20.72L18.73 22l-3.08-3.08c-1.15.38-2.37.58-3.65.58c-5 0-9.27-3.11-11-7.5c.69-1.76 1.79-3.31 3.19-4.54zM12 9a3 3 0 0 1 3 3a3 3 0 0 1-.17 1L11 9.17A3 3 0 0 1 12 9m0-4.5c5 0 9.27 3.11 11 7.5a11.8 11.8 0 0 1-4 5.19l-1.42-1.43A9.86 9.86 0 0 0 20.82 12A9.82 9.82 0 0 0 12 6.5c-1.09 0-2.16.18-3.16.5L7.3 5.47c1.44-.62 3.03-.97 4.7-.97M3.18 12A9.82 9.82 0 0 0 12 17.5c.69 0 1.37-.07 2-.21L11.72 15A3.064 3.064 0 0 1 9 12.28L5.6 8.87c-.99.85-1.82 1.91-2.42 3.13"
                />
              {:else}
                <path
                  fill="currentColor"
                  d="M12 9a3 3 0 0 1 3 3a3 3 0 0 1-3 3a3 3 0 0 1-3-3a3 3 0 0 1 3-3m0-4.5c5 0 9.27 3.11 11 7.5c-1.73 4.39-6 7.5-11 7.5S2.73 16.39 1 12c1.73-4.39 6-7.5 11-7.5M3.18 12a9.821 9.821 0 0 0 17.64 0a9.821 9.821 0 0 0-17.64 0"
                />
              {/if}
            </svg>
          </button>
        </div>
        <div class="cnx-help-text">
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            aria-hidden="true"
          >
            <circle
              cx="6"
              cy="6"
              r="5"
              stroke="currentColor"
              stroke-width="1"
            />
            <path
              d="M6 5.3v3.4M6 3.6v.1"
              stroke="currentColor"
              stroke-width="1"
            />
          </svg>
          <span>
            {$_("aiEngines.connect.help", {
              values: { name: store.selectedEngine.display_name },
            })}
          </span>
        </div>
      </div>
    {/if}
  {/snippet}

  {#snippet footer()}
    <div class="cnx-footer-actions">
      <button
        class="cnx-cancel"
        type="button"
        onclick={store.closeConnectModal}
        disabled={store.apiKeyLoading}
      >
        {$_("common.cancel")}
      </button>
      <button
        class="cnx-connect-btn"
        type="button"
        onclick={handleConnectSubmit}
        disabled={store.apiKeyLoading}
      >
        {store.apiKeyLoading
          ? $_("aiEngines.connect.connecting")
          : $_("aiEngines.connect.submit")}
      </button>
    </div>
  {/snippet}
</Modal>

<style>
  /* ===== ai-engines.html, transcribed. Design values that no --gx-* token
     already carried live in app.css as --gx-ae-*. ===== */

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

  .ai-engines-container {
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

  /* The design spaces the header from the toolbar with the column gap alone. */
  .ai-engines-container :global(.page-header) {
    padding-bottom: 0;
  }

  /* ---- ".toolbar-row" ---- */
  .toolbar-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    align-self: stretch;
    gap: 16px;
    flex-shrink: 0;
  }

  .search-row {
    width: 431px;
    max-width: 100%;
    height: 37px;
    border-radius: 8px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    display: flex;
    gap: 10px;
    padding: 10px 14px;
    align-items: center;
    flex-shrink: 1;
    color: var(--gx-org-slate-350);
    box-sizing: border-box;
  }

  .search-row:focus-within {
    box-shadow: inset 0 0 0 1px var(--gx-org-primary-500);
  }

  .search-row svg {
    display: block;
    flex-shrink: 0;
  }

  .search-row input {
    flex-grow: 1;
    min-width: 0;
    font-weight: 400;
    font-size: 14px;
    color: var(--gx-slate-900);
  }

  .search-row input::placeholder {
    color: var(--gx-an-sub);
    opacity: 1;
  }

  .layout-toggles {
    height: 31px;
    border-radius: 8px;
    background: var(--gx-ring-soft);
    display: flex;
    gap: 2px;
    padding: 2px;
    flex-shrink: 0;
    box-sizing: border-box;
  }

  .grid-toggle {
    height: 27px;
    border-radius: 6px;
    padding: 6px 12px;
    font-weight: 600;
    font-size: 12px;
    line-height: 100%;
    color: var(--gx-an-sub);
    transition:
      background-color 120ms ease,
      color 120ms ease,
      box-shadow 120ms ease;
  }

  .grid-toggle[aria-pressed="true"] {
    background: var(--gx-card);
    box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.051);
    color: var(--gx-org-primary-500);
  }

  .grid-toggle:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 1px;
  }

  /* ---- ".stat-row" ---- */
  .stat-row {
    display: flex;
    gap: 16px;
    align-self: stretch;
    flex-shrink: 0;
  }

  .stat-card {
    min-height: 85px;
    border-radius: 12px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-ring-soft);
    display: flex;
    gap: 16px;
    padding: 20px;
    align-items: center;
    flex: 1 1 0;
    min-width: 0;
    box-sizing: border-box;
  }

  .stat-card__icon {
    width: 44px;
    align-self: stretch;
    border-radius: 8px;
    background: var(--gx-org-primary-500);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    /* The tile stays saturated in both schemes, so its ink does not flip. */
    color: rgb(241, 248, 244);
  }

  .stat-card__icon--green {
    background: var(--gx-ae-green-soft);
  }

  .stat-card__info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .stat-card__value {
    font-weight: 700;
    font-size: 22px;
    line-height: 100%;
    color: var(--gx-org-ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .stat-card__label {
    font-weight: 500;
    font-size: 13px;
    line-height: 100%;
    color: var(--gx-an-sub);
  }

  /* ---- ".grid-section" / ".engine-card" ---- */
  .engine-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 20px;
    align-self: stretch;
  }

  .engine-card {
    position: relative;
    border-radius: 14px;
    background: var(--gx-card);
    box-shadow:
      inset 0 0 0 1px var(--gx-ring-soft),
      var(--gx-ae-card-shadow);
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 24px;
    min-width: 0;
  }

  .engine-card--disconnected {
    opacity: 0.8;
    outline: 1px dashed var(--gx-org-slate-350);
    outline-offset: -1px;
    box-shadow: none;
    gap: 20px;
  }

  .card-header {
    min-height: 40px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    align-self: stretch;
    gap: 12px;
  }

  .brand-group {
    display: flex;
    gap: 12px;
    align-items: center;
    min-width: 0;
  }

  .logo-box {
    width: 40px;
    height: 40px;
    border-radius: 8px;
    background: var(--gx-ring-soft);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    overflow: hidden;
    color: var(--gx-ae-tile-fg);
    font-weight: 700;
    font-size: 15px;
  }

  /* Registry marks paint with `fill="currentColor"`, so they take the tile's
     ink — the same rule the chat composer's brand badge follows. */
  .logo-box :global(svg) {
    width: 24px;
    height: 24px;
    display: block;
  }

  .cfg-brand-icon :global(svg),
  .cnx-brand-icon :global(svg) {
    width: 22px;
    height: 22px;
    display: block;
  }

  .logo-box--muted {
    background: var(--gx-ring-soft);
    color: var(--gx-org-slate-350);
  }

  .logo-img {
    width: 24px;
    height: 24px;
    object-fit: contain;
  }

  .brand-name {
    font-weight: 600;
    font-size: 16px;
    line-height: 100%;
    color: var(--gx-org-ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .brand-name--dim {
    color: var(--gx-org-slate-350);
  }

  .toggle-switch {
    width: 36px;
    height: 20px;
    border-radius: 10px;
    background: var(--gx-org-hair-soft);
    display: flex;
    padding: 2px;
    justify-content: flex-start;
    align-items: center;
    flex-shrink: 0;
    box-sizing: border-box;
    transition:
      background-color 160ms ease,
      justify-content 160ms ease;
  }

  .toggle-switch--on {
    background: var(--gx-org-primary-500);
    justify-content: flex-end;
  }

  .toggle-switch:hover:not(:disabled) {
    background: var(--gx-org-hair-soft);
  }

  .toggle-switch--on:hover:not(:disabled) {
    background: var(--gx-org-primary-500);
  }

  .toggle-switch:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
  }

  .toggle-handle {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #fff;
    flex-shrink: 0;
  }

  .status-row {
    min-height: 15px;
    display: flex;
    gap: 6px;
    align-items: center;
    align-self: stretch;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--gx-org-slate-350);
    flex-shrink: 0;
  }

  .status-dot--danger {
    background: var(--gx-ae-bad);
  }

  .status-dot--warn {
    background: var(--gx-org-warn);
  }

  .status-check {
    width: 14px;
    height: 14px;
    color: var(--gx-org-brand-alt);
    flex-shrink: 0;
  }

  .status-label {
    font-weight: 600;
    font-size: 12px;
    line-height: 100%;
    color: var(--gx-an-sub);
  }

  .status-label--muted {
    font-weight: 500;
    color: var(--gx-org-slate-350);
  }

  .status-label--danger {
    color: var(--gx-ae-bad);
  }

  .details-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-self: stretch;
  }

  .detail-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    align-self: stretch;
    gap: 8px;
  }

  .detail-key {
    font-weight: 500;
    font-size: 12px;
    line-height: 100%;
    color: var(--gx-org-slate-350);
    flex-shrink: 0;
  }

  .detail-val {
    font-weight: 400;
    font-size: 12px;
    line-height: 100%;
    color: var(--gx-an-sub);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .detail-val--accent {
    font-weight: 600;
    color: var(--gx-org-primary-500);
  }

  .key-badge {
    border-radius: 6px;
    background: var(--gx-ring-soft);
    display: flex;
    gap: 6px;
    padding: 4px 8px;
    align-items: center;
    min-width: 0;
  }

  .key-badge span {
    font-weight: 400;
    font-size: 11px;
    line-height: 100%;
    color: var(--gx-an-sub);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .key-badge svg {
    display: block;
    color: var(--gx-org-slate-350);
    flex-shrink: 0;
  }

  .detail-divider {
    height: 1px;
    background: var(--gx-ring-soft);
    align-self: stretch;
  }

  .card-desc {
    font-weight: 400;
    font-size: 13px;
    line-height: 140%;
    color: var(--gx-an-sub);
    align-self: stretch;
  }

  .card-footer {
    margin-top: auto;
    align-self: stretch;
  }

  .card-btn {
    width: 100%;
    height: 38px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: 13px;
    transition: background-color 120ms ease;
  }

  .card-btn--config {
    box-shadow: inset 0 0 0 1px var(--gx-ring-soft);
    color: var(--gx-an-sub);
  }

  .card-btn--config:hover {
    background: var(--gx-page);
  }

  .card-btn--connect {
    background: var(--gx-org-primary-500);
    color: #fff;
  }

  .card-btn--connect:hover {
    background: var(--gx-ac-cta-hover);
  }

  .card-btn:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
  }

  /* ===== Configure dialog (".cfg-modal" body) ===== */
  .cfg-brand-icon {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    background: linear-gradient(
      135deg,
      rgb(76, 169, 122) 0%,
      rgb(51, 73, 155) 100%
    );
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    flex-shrink: 0;
    overflow: hidden;
  }

  .cfg-brand-img {
    width: 22px;
    height: 22px;
    object-fit: contain;
  }

  .cfg-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-items: flex-start;
    align-self: stretch;
  }

  .cfg-hr {
    height: 1px;
    background: var(--gx-ae-hair);
    align-self: stretch;
    flex-shrink: 0;
  }

  .cfg-label {
    font-weight: 700;
    font-size: 11px;
    line-height: 100%;
    letter-spacing: 0.5px;
    color: var(--gx-ae-dim);
    text-transform: uppercase;
  }

  .cfg-confirm-text {
    margin: 0;
    font-weight: 400;
    font-size: 13px;
    line-height: 1.5;
    color: var(--gx-ae-ink);
  }

  .api-key-row {
    display: flex;
    gap: 12px;
    align-items: center;
    align-self: stretch;
    flex-wrap: wrap;
  }

  .api-chip {
    border-radius: 6px;
    background: var(--gx-ae-chip);
    box-shadow: inset 0 0 0 1px var(--gx-ae-hair);
    padding: 8px 12px;
    flex-grow: 1;
    min-width: 0;
  }

  .api-chip > span {
    font-family: "IBM Plex Mono", ui-monospace, monospace;
    font-weight: 400;
    font-size: 13px;
    color: var(--gx-ae-ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: block;
  }

  .api-chip--input {
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 6px 8px 6px 12px;
  }

  .api-chip--input:focus-within {
    box-shadow: inset 0 0 0 1px var(--gx-ae-blue);
  }

  .api-chip--input input {
    flex-grow: 1;
    min-width: 0;
    font-family: "IBM Plex Mono", ui-monospace, monospace;
    font-size: 13px;
    color: var(--gx-ae-ink);
  }

  .api-chip--input input::placeholder {
    color: var(--gx-ae-dim);
    opacity: 1;
  }

  /* Keys are secrets, so both entry fields mask by default — this reveals. */
  .api-chip__eye {
    width: 24px;
    height: 24px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--gx-ae-dim);
    flex-shrink: 0;
    transition: background-color 120ms ease;
  }

  .api-chip__eye:hover {
    background: var(--gx-ae-chip);
  }

  .api-actions {
    display: flex;
    gap: 8px;
    flex-shrink: 0;
  }

  .validate-btn {
    height: 33px;
    border-radius: 6px;
    box-shadow: inset 0 0 0 1px var(--gx-ae-ok);
    padding: 8px 12px;
    display: flex;
    align-items: center;
    font-weight: 600;
    font-size: 13px;
    color: var(--gx-ae-ok);
    transition: background-color 120ms ease;
  }

  .validate-btn:hover:not(:disabled) {
    background: var(--gx-ae-ok-bg);
  }

  .validate-btn--danger {
    box-shadow: inset 0 0 0 1px var(--gx-ae-bad);
    color: var(--gx-ae-bad);
  }

  .validate-btn--danger:hover:not(:disabled) {
    background: var(--gx-ae-bad-bg);
  }

  .validate-btn--neutral {
    box-shadow: inset 0 0 0 1px var(--gx-ae-hair);
    color: var(--gx-ae-muted);
  }

  .validate-btn--neutral:hover:not(:disabled) {
    background: var(--gx-ae-chip);
  }

  .key-status-row {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .key-status-row span:last-child {
    font-weight: 500;
    font-size: 13px;
    color: var(--gx-ae-ok);
  }

  .key-status-row .status-dot {
    background: var(--gx-ae-ok);
  }

  .key-status-row--bad span:last-child {
    color: var(--gx-ae-bad);
  }

  .key-status-row--bad .status-dot {
    background: var(--gx-ae-bad);
  }

  .whitelist-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    align-self: stretch;
    gap: 12px;
    flex-wrap: wrap;
  }

  .whitelist-header-left {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .whitelist-count {
    border-radius: 4px;
    background: var(--gx-ae-chip);
    padding: 2px 6px;
    font-weight: 600;
    font-size: 11px;
    color: var(--gx-ae-muted);
  }

  .whitelist-actions {
    display: flex;
    gap: 8px;
  }

  .check-all-btn,
  .uncheck-all-btn {
    height: 26px;
    border-radius: 4px;
    display: flex;
    gap: 4px;
    padding: 5px 10px;
    align-items: center;
    font-weight: 600;
    font-size: 12px;
    transition: filter 120ms ease;
  }

  .check-all-btn {
    background: var(--gx-ae-ok-bg);
    color: var(--gx-ae-ok);
  }

  .uncheck-all-btn {
    background: var(--gx-ae-bad-bg);
    color: var(--gx-ae-bad);
  }

  .check-all-btn:hover,
  .uncheck-all-btn:hover {
    filter: brightness(0.97);
  }

  .check-all-btn svg,
  .uncheck-all-btn svg {
    display: block;
    flex-shrink: 0;
  }

  .model-search {
    height: 37px;
    border-radius: 6px;
    background: var(--gx-ae-chip);
    box-shadow: inset 0 0 0 1px var(--gx-ae-hair);
    display: flex;
    gap: 8px;
    padding: 10px 12px;
    align-items: center;
    align-self: stretch;
    color: var(--gx-ae-dim);
    box-sizing: border-box;
  }

  .model-search:focus-within {
    box-shadow: inset 0 0 0 1px var(--gx-ae-blue);
  }

  .model-search svg {
    display: block;
    flex-shrink: 0;
  }

  .model-search input {
    flex-grow: 1;
    min-width: 0;
    font-weight: 400;
    font-size: 13px;
    color: var(--gx-ae-ink);
  }

  .model-search input::placeholder {
    color: var(--gx-ae-dim);
    opacity: 1;
  }

  .models-list {
    max-height: 210px;
    overflow-y: auto;
    border-radius: 8px;
    box-shadow: inset 0 0 0 1px var(--gx-ae-hair);
    display: flex;
    flex-direction: column;
    align-self: stretch;
  }

  .model-row {
    min-height: 53px;
    background: var(--gx-card);
    border-top: 1px solid var(--gx-ae-chip);
    display: flex;
    gap: 12px;
    padding: 10px 12px;
    align-items: center;
  }

  .model-row:first-child {
    border-top: 0;
  }

  .model-row--dim {
    background: var(--gx-ae-row-dim);
  }

  .model-check {
    width: 18px;
    height: 18px;
    border-radius: 4px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1.5px var(--gx-ae-hair);
    color: #fff;
    transition:
      background-color 120ms ease,
      box-shadow 120ms ease;
  }

  .model-check[data-checked="true"] {
    background: var(--gx-ae-blue);
    box-shadow: inset 0 0 0 1.5px var(--gx-ae-blue);
  }

  .model-check svg {
    display: none;
  }

  .model-check[data-checked="true"] svg {
    display: block;
  }

  .model-check:focus-visible {
    outline: 2px solid var(--gx-ae-blue);
    outline-offset: 2px;
  }

  .type-badge {
    width: 20px;
    height: 20px;
    border-radius: 4px;
    background: var(--gx-ae-chip);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    font-weight: 700;
    font-size: 11px;
    color: var(--gx-ae-muted);
  }

  .type-badge svg,
  .mini-badge svg {
    display: block;
    flex-shrink: 0;
  }

  .model-details {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex-grow: 1;
    min-width: 0;
  }

  .model-name {
    display: flex;
    gap: 6px;
    align-items: center;
    font-weight: 600;
    font-size: 13px;
    line-height: 100%;
    color: var(--gx-ae-ink);
    min-width: 0;
  }

  .default-model-badge {
    border-radius: 4px;
    background: var(--gx-ae-callout-bg);
    padding: 2px 6px;
    font-weight: 700;
    font-size: 10px;
    color: var(--gx-ae-blue);
    flex-shrink: 0;
  }

  .model-id {
    font-family: "IBM Plex Mono", ui-monospace, monospace;
    font-weight: 400;
    font-size: 11px;
    line-height: 100%;
    color: var(--gx-ae-dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .dropdown {
    position: relative;
    height: 42px;
    border-radius: 6px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-ae-hair);
    display: flex;
    padding: 12px;
    justify-content: space-between;
    align-items: center;
    align-self: stretch;
    color: var(--gx-ae-dim);
    box-sizing: border-box;
  }

  .dropdown:focus-within {
    box-shadow: inset 0 0 0 1px var(--gx-ae-blue);
  }

  .dropdown svg {
    display: block;
    flex-shrink: 0;
  }

  .dropdown-value {
    display: flex;
    gap: 8px;
    align-items: center;
    min-width: 0;
  }

  .dropdown-value span:last-child {
    font-family: "IBM Plex Mono", ui-monospace, monospace;
    font-weight: 500;
    font-size: 13px;
    color: var(--gx-ae-ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* The design draws its own value + chevron, so the real <select> sits on top,
     invisible but focusable — it stays the thing keyboards and AT operate. */
  .dropdown-select {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    padding: 0;
    border: 0;
    border-radius: 6px;
    opacity: 0;
    background: transparent;
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    cursor: pointer;
  }

  .mini-badge {
    width: 18px;
    height: 18px;
    border-radius: 4px;
    background: var(--gx-ae-chip);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 10px;
    color: var(--gx-ae-muted);
    flex-shrink: 0;
  }

  .helper-text {
    margin: 0;
    font-weight: 400;
    font-size: 12px;
    line-height: 1.4;
    color: var(--gx-ae-dim);
    align-self: stretch;
  }

  .default-callout {
    border-radius: 8px;
    background: var(--gx-ae-callout-bg);
    box-shadow: inset 0 0 0 1px var(--gx-ae-callout-ring);
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 16px;
    align-self: stretch;
    box-sizing: border-box;
  }

  .callout-row {
    display: flex;
    gap: 10px;
    align-items: center;
  }

  .callout-check {
    width: 18px;
    height: 18px;
    border-radius: 4px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1.5px var(--gx-ae-callout-ring);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    flex-shrink: 0;
    transition:
      background-color 120ms ease,
      box-shadow 120ms ease;
  }

  .callout-check[data-checked="true"] {
    background: var(--gx-ae-blue);
    box-shadow: inset 0 0 0 1.5px var(--gx-ae-blue);
  }

  .callout-check svg {
    display: none;
  }

  .callout-check[data-checked="true"] svg {
    display: block;
  }

  .callout-check:focus-visible {
    outline: 2px solid var(--gx-ae-blue);
    outline-offset: 2px;
  }

  .callout-label {
    font-weight: 700;
    font-size: 13px;
    color: var(--gx-ae-blue);
  }

  .callout-desc {
    font-weight: 400;
    font-size: 12px;
    line-height: 1.4;
    color: var(--gx-ae-muted);
  }

  .status-toggle-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    align-self: stretch;
    gap: 16px;
  }

  .status-toggle-labels {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .status-toggle-labels span:last-child {
    font-weight: 500;
    font-size: 13px;
    color: var(--gx-ae-ink);
  }

  .status-toggle {
    width: 40px;
    height: 22px;
    border-radius: 11px;
    background: var(--gx-org-hair-soft);
    display: flex;
    padding: 2px;
    justify-content: flex-start;
    align-items: center;
    flex-shrink: 0;
    box-sizing: border-box;
    transition: background-color 160ms ease;
  }

  .status-toggle--on {
    background: var(--gx-ae-ok);
    justify-content: flex-end;
  }

  .status-toggle:focus-visible {
    outline: 2px solid var(--gx-ae-blue);
    outline-offset: 2px;
  }

  .status-toggle-handle {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #fff;
  }

  .cfg-footer-actions {
    display: flex;
    gap: 12px;
  }

  .btn-cancel-sm {
    height: 37px;
    border-radius: 6px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-ae-hair);
    padding: 10px 16px;
    display: flex;
    align-items: center;
    font-weight: 600;
    font-size: 13px;
    color: var(--gx-ae-muted);
    transition: background-color 120ms ease;
  }

  .btn-cancel-sm:hover:not(:disabled) {
    background: var(--gx-ae-chip);
  }

  .btn-save {
    height: 37px;
    border-radius: 6px;
    background: var(--gx-ae-blue);
    padding: 10px 16px;
    display: flex;
    align-items: center;
    font-weight: 600;
    font-size: 13px;
    color: #fff;
    transition: background-color 120ms ease;
  }

  .btn-save:hover:not(:disabled) {
    background: var(--gx-ae-blue-hover);
  }

  .btn-cancel-sm:focus-visible,
  .btn-save:focus-visible {
    outline: 2px solid var(--gx-ae-blue);
    outline-offset: 2px;
  }

  /* ===== Connect dialog (".cnx-modal" body) ===== */
  .cnx-brand-icon {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    background: linear-gradient(
      135deg,
      rgb(79, 114, 210) 0%,
      rgb(59, 92, 184) 100%
    );
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-weight: 700;
    font-size: 18px;
    flex-shrink: 0;
    overflow: hidden;
  }

  .cnx-brand-img {
    width: 22px;
    height: 22px;
    object-fit: contain;
  }

  .cnx-badge {
    border-radius: 100px;
    background: var(--gx-fill-soft);
    padding: 4px 10px;
    font-weight: 700;
    font-size: 12px;
    color: var(--gx-muted);
    white-space: nowrap;
  }

  .cnx-empty {
    width: 480px;
    max-width: 100%;
    display: flex;
    flex-direction: column;
    gap: 16px;
    align-items: center;
  }

  .cnx-icon-glow {
    width: 64px;
    height: 64px;
    border-radius: 32px;
    background: var(--gx-ae-teal-bg);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--gx-ae-teal);
    flex-shrink: 0;
  }

  .cnx-empty-title {
    font-weight: 700;
    font-size: 18px;
    text-align: center;
    color: var(--gx-ink);
  }

  .cnx-empty-desc {
    margin: 0;
    font-weight: 400;
    font-size: 14px;
    line-height: 1.5;
    text-align: center;
    color: var(--gx-muted);
    align-self: stretch;
  }

  .cnx-input-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: flex-start;
    align-self: stretch;
  }

  .cnx-input-label {
    font-weight: 600;
    font-size: 13px;
    color: var(--gx-ink);
  }

  .cnx-input-wrapper {
    height: 41px;
    border-radius: 8px;
    box-shadow: inset 0 0 0 1px var(--gx-line);
    display: flex;
    gap: 8px;
    padding: 0 8px 0 14px;
    align-items: center;
    align-self: stretch;
    box-sizing: border-box;
  }

  .cnx-input-wrapper:focus-within {
    box-shadow: inset 0 0 0 1px var(--gx-ae-teal);
  }

  .cnx-input-wrapper input {
    flex-grow: 1;
    min-width: 0;
    font-weight: 400;
    font-size: 13px;
    color: var(--gx-slate-900);
  }

  .cnx-input-wrapper input::placeholder {
    color: var(--gx-dim);
    opacity: 1;
  }

  .cnx-help-text {
    display: flex;
    gap: 4px;
    align-items: center;
    align-self: stretch;
    color: var(--gx-dim);
  }

  .cnx-help-text svg {
    display: block;
    flex-shrink: 0;
  }

  .cnx-help-text span {
    font-weight: 400;
    font-size: 12px;
    color: var(--gx-dim);
  }

  .cnx-footer-actions {
    display: flex;
    gap: 16px;
    align-items: center;
  }

  .cnx-cancel {
    font-weight: 600;
    font-size: 13px;
    color: var(--gx-muted);
  }

  .cnx-connect-btn {
    height: 37px;
    border-radius: 8px;
    background: var(--gx-ae-teal);
    padding: 10px 20px;
    display: flex;
    align-items: center;
    font-weight: 600;
    font-size: 13px;
    color: #fff;
    transition: background-color 120ms ease;
  }

  .cnx-connect-btn:hover:not(:disabled) {
    background: var(--gx-ae-teal-hover);
  }

  .cnx-cancel:focus-visible,
  .cnx-connect-btn:focus-visible {
    outline: 2px solid var(--gx-ae-teal);
    outline-offset: 2px;
  }

  /* The grid is three cards wide by design; step down rather than squeeze. */
  @media (max-width: 1200px) {
    .engine-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 900px) {
    .stat-row {
      flex-wrap: wrap;
    }

    .stat-card {
      flex-basis: calc(50% - 8px);
    }
  }

  @media (max-width: 768px) {
    .ai-engines-container {
      padding: 20px;
    }

    .engine-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .toolbar-row {
      flex-direction: column;
      align-items: stretch;
      gap: 12px;
    }

    .search-row {
      width: 100%;
    }

    .stat-card {
      flex-basis: 100%;
    }
  }

  /* Engine detail rows are key-left / value-right. On a narrow phone the
     value (an API key tail, or a model id like "claude-sonnet-4-20250514")
     is squeezed to ~140px and truncates. Stack the pair so the value gets
     the card's full width. */
  @media (max-width: 420px) {
    .detail-row {
      flex-direction: column;
      align-items: flex-start;
      gap: 4px;
    }

    .detail-val {
      max-width: 100%;
      text-align: start;
    }
  }
</style>
