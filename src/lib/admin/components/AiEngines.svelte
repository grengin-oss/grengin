<script lang="ts">
  import { onMount } from "svelte";
  import AdminEmptyState from "./AdminEmptyState.svelte";
  import AdminPanelCard from "./AdminPanelCard.svelte";
  import AdminSectionHeader from "./AdminSectionHeader.svelte";
  import LoadingSpinner from "./LoadingSpinner.svelte";
  import Modal from "./Modal.svelte";
  import { toast } from "../../components/Toaster.svelte";
  import type { AIEngine } from "../types.js";
  import { aiEnginesStore } from "../stores/index.js";

  const store = aiEnginesStore;

  async function toggleEngineStatus(engine: AIEngine) {
    try {
      await store.toggleEngineStatus(engine);
      toast.success(
        `${engine.display_name} ${!engine.is_enabled ? "enabled" : "disabled"}`,
      );
    } catch (err: any) {
      toast.error(err.message || "Failed to update engine status");
    }
  }

  async function handleConfigSubmit() {
    if (!store.selectedEngine) return;

    // Validate: at least one model must be whitelisted if API key is configured
    if (
      store.selectedEngine.api_key_configured &&
      store.formData.whitelisted_models.length === 0
    ) {
      toast.error("Please whitelist at least one model");
      return;
    }

    // Validate: default model is required when models are whitelisted
    if (
      store.selectedEngine.api_key_configured &&
      store.formData.whitelisted_models.length > 0 &&
      !store.formData.default_model
    ) {
      toast.error("Please select a default model for this engine");
      return;
    }

    // Validate: default model must be in whitelisted models
    if (
      store.formData.default_model &&
      !store.formData.whitelisted_models.includes(store.formData.default_model)
    ) {
      toast.error(
        "The default model must be included in the whitelisted models",
      );
      return;
    }

    // Prevent unsetting the default engine if it's currently the default
    const isCurrentlyDefault = store.isDefaultEngine(store.selectedEngine.engine_key);
    if (isCurrentlyDefault && !store.formData.is_default) {
      toast.error("Cannot remove default engine. Please select another engine as default first.");
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

      const action = store.formData.is_default ? "set as system default" : "updated";
      toast.success(`${store.selectedEngine.display_name} ${action} successfully`);
      store.closeConfigModal();
    } catch (err: any) {
      toast.error(err.message || "Failed to update engine configuration");
    }
  }

  async function handleAddOrUpdateApiKey() {
    try {
      await store.addOrUpdateApiKey();
      toast.success("API key added successfully");
    } catch (err: any) {
      toast.error(store.apiKeyMessage || "Error: The provided API key is invalid.");
    }
  }

  async function handleValidateApiKey() {
    try {
      const result = await store.validateApiKey();
      const message = store.apiKeyMessage || "Key is valid and connected.";
      if (result.valid) {
        toast.success(message);
      } else {
        toast.error(message);
      }
    } catch (err: any) {
      toast.error(store.apiKeyMessage || "Error: The provided API key is invalid.");
    }
  }

  async function handleDeleteApiKey() {
    try {
      await store.removeApiKey();
      toast.success("API key removed successfully");
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete API key");
    }
  }

  function toggleModelSelection(modelId: string) {
    // Prevent unchecking the default model
    if (
      modelId === store.formData.default_model &&
      store.formData.whitelisted_models.includes(modelId)
    ) {
      toast.error(
        "Cannot remove the default model from the whitelist. Please change the default model first.",
      );
      return;
    }

    const index = store.formData.whitelisted_models.indexOf(modelId);
    if (index > -1) {
      store.formData = {
        ...store.formData,
        whitelisted_models: store.formData.whitelisted_models.filter(
          (id) => id !== modelId,
        ),
      };

      // If we removed a model and default becomes invalid, clear default
      if (
        store.formData.default_model &&
        !store.formData.whitelisted_models.includes(store.formData.default_model)
      ) {
        store.formData = {
          ...store.formData,
          default_model: null,
        };
      }
    } else {
      store.formData = {
        ...store.formData,
        whitelisted_models: [...store.formData.whitelisted_models, modelId],
      };

      // Auto-select first model as default if none is set
      if (!store.formData.default_model && store.formData.whitelisted_models.length === 1) {
        store.formData = {
          ...store.formData,
          default_model: modelId,
        };
      }
    }
  }

  function selectAllModels() {
    if (store.availableModels) {
      store.formData = {
        ...store.formData,
        whitelisted_models: store.availableModels.models.map(
          (m) => m.model_id,
        ),
      };

      // Auto-select first model as default if none is set
      if (!store.formData.default_model && store.formData.whitelisted_models.length > 0) {
        store.formData = {
          ...store.formData,
          default_model: store.formData.whitelisted_models[0],
        };
      }
    }
  }

  function deselectAllModels() {
    // Keep the default model in the whitelist
    if (store.formData.default_model) {
      store.formData = {
        ...store.formData,
        whitelisted_models: [store.formData.default_model],
      };
      toast.error("Default model must remain whitelisted");
    } else {
      store.formData = {
        ...store.formData,
        whitelisted_models: [],
      };
    }
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
    if (!engine.is_enabled) {
      return { text: "Disabled", type: "disabled" };
    }
    if (
      !engine.api_key_configured ||
      engine.api_key_status === "not_configured"
    ) {
      return { text: "No API Key", type: "no-key" };
    }
    if (engine.api_key_status === "in_valid") {
      return { text: "Invalid Key", type: "invalid" };
    }
    if (engine.api_key_status === "not_validated") {
      return { text: "Not Validated", type: "not-validated" };
    }
    if (engine.api_key_status === "valid") {
      return { text: "Connected", type: "connected" };
    }
    return { text: "Not Configured", type: "not-configured" };
  }

  // Check if engine is default
  function isDefaultEngine(engine: AIEngine): boolean {
    return engine.is_enabled && store.isDefaultEngine(engine.engine_key);
  }

  onMount(() => {
    store.fetch().catch((err: any) => {
      toast.error(err.message || "Failed to load AI engines");
    });
  });
</script>

<div class="ai-engines-container">
  <AdminSectionHeader
    title="AI Engine Configuration"
    subtitle="Configure system settings and integrations with AI providers"
  />

  {#if store.isLoading}
    <AdminPanelCard>
      <LoadingSpinner text="Loading AI engines..." />
    </AdminPanelCard>
  {:else if store.engines.length === 0}
    <AdminPanelCard>
      <AdminEmptyState
        title="No AI engines available"
        message="Contact your administrator to configure AI engines."
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
    <!-- Available Providers Section -->
    <div class="providers-section">
      <div class="providers-grid">
        {#each store.engines as engine (engine.engine_key)}
          {@const status = getEngineStatus(engine)}
          {@const isDefault = isDefaultEngine(engine)}

          <div class="provider-card">
            <div class="provider-header">
              <div class="provider-info">
                <div
                  class="provider-status-indicator"
                  class:disabled={status.type === "disabled"}
                  class:connected={status.type === "connected"}
                  class:no-key={status.type === "no-key" ||
                    status.type === "not-validated" ||
                    status.type === "not-configured"}
                  class:invalid={status.type === "invalid"}
                ></div>
                <div>
                  <h4 class="provider-name">{engine.display_name}</h4>
                  {#if isDefault}
                    <span class="default-badge">Default Engine</span>
                  {/if}
                </div>
              </div>
              <button
                class="status-toggle"
                class:active={engine.is_enabled}
                onclick={() => toggleEngineStatus(engine)}
                aria-label={engine.is_enabled ? "Enabled" : "Disabled"}
              >
                <span class="toggle-slider"></span>
              </button>
            </div>

            <div class="provider-details">
              <!-- Connection Status -->
              <div class="status-item">
                <svg
                  class="status-icon"
                  class:success={status.type === "connected"}
                  class:warning={status.type === "no-key" ||
                    status.type === "not-validated" ||
                    status.type === "not-configured"}
                  class:error={status.type === "invalid"}
                  class:disabled={status.type === "disabled"}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  {#if status.type === "connected"}
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  {:else if status.type === "no-key"}
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  {:else if status.type === "disabled"}
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                  {:else}
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                  {/if}
                </svg>
                <span
                  class="status-text"
                  class:success={status.type === "connected"}
                  class:warning={status.type === "no-key" ||
                    status.type === "not-validated" ||
                    status.type === "not-configured"}
                  class:error={status.type === "invalid"}
                  class:disabled={status.type === "disabled"}
                >
                  {status.text}
                </span>
              </div>

              <!-- API Key Preview (if configured) -->
              {#if engine.api_key_configured && engine.api_key_preview}
                <div class="status-item">
                  <svg
                    class="status-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  <span class="status-text api-key-text">
                    API Key: <code>{engine.api_key_preview}</code>
                  </span>
                </div>
              {/if}

              <!-- Default Model for this Engine -->
              {#if engine.default_model}
                <div class="status-item">
                  <svg
                    class="status-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <circle cx="12" cy="12" r="3" />
                    <path
                      d="M12 1v6m0 6v6M5.64 5.64l4.24 4.24m4.24 4.24l4.24 4.24M1 12h6m6 0h6M5.64 18.36l4.24-4.24m4.24-4.24l4.24-4.24"
                    />
                  </svg>
                  <span class="status-text">
                    Default Model: <strong>{engine.default_model}</strong>
                  </span>
                </div>
              {/if}

              {#if engine.whitelisted_models && engine.whitelisted_models.length > 0}
                <div class="status-item">
                  <svg
                    class="status-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <line x1="8" y1="6" x2="21" y2="6" />
                    <line x1="8" y1="12" x2="21" y2="12" />
                    <line x1="8" y1="18" x2="21" y2="18" />
                    <line x1="3" y1="6" x2="3.01" y2="6" />
                    <line x1="3" y1="12" x2="3.01" y2="12" />
                    <line x1="3" y1="18" x2="3.01" y2="18" />
                  </svg>
                  <span class="status-text"
                    >{engine.whitelisted_models.length} Models Whitelisted</span
                  >
                </div>
              {:else}
                <div class="status-item">
                  <svg
                    class="status-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path
                      d="M13.73 4a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"
                    />
                  </svg>
                  <span class="status-text">No Models Allowed</span>
                </div>
              {/if}
            </div>

            <div class="provider-actions">
              <button class="btn-glass" onclick={() => store.openConfigModal(engine)}>
                Configure Engine
              </button>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<!-- Configure Models Modal -->
<Modal
  bind:isOpen={store.showConfigModal}
  title={store.selectedEngine
    ? `Configure ${store.selectedEngine.display_name} Models`
    : "Configure Models"}
  onclose={store.closeConfigModal}
>
  {#snippet children()}
    {#if store.selectedEngine}
      <form
        class="config-form"
        onsubmit={(e) => {
          e.preventDefault();
          handleConfigSubmit();
        }}
      >
        <!-- API Key Section -->
        <div class="form-section api-key-section">
          <h4 class="form-section-title">API Key</h4>
          {#if store.apiKeyMode === "cta"}
            <div class="api-key-cta">
              <button
                type="button"
                class="btn-primary add-key-button"
                onclick={() => {
                  store.apiKeyMode = "add";
                  store.apiKeyInput = "";
                  store.apiKeyMessage = null;
                  store.apiKeyStatus = "not_configured";
                }}
              >
                + Add API Key
              </button>
              <p class="api-key-helper">Please add api key</p>
            </div>
          {:else if store.apiKeyMode === "add" || store.apiKeyMode === "update"}
            <div class="form-group">
              <div
                class="api-key-input-row"
                data-status={store.apiKeyStatus}
                class:status-valid={store.apiKeyStatus === "valid"}
                class:status-invalid={store.apiKeyStatus === "in_valid"}
              >
                <div class="api-key-input-wrapper">
                  <input
                    id="api-key-input"
                    type={store.showApiKey ? "text" : "password"}
                    placeholder="Enter api key..."
                    bind:value={store.apiKeyInput}
                    autocomplete="off"
                    spellcheck="false"
                    aria-label="API Key"
                    onkeydown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddOrUpdateApiKey();
                      }
                    }}
                  />
                  <button
                    type="button"
                    class="api-key-visibility"
                    onclick={() => (store.showApiKey = !store.showApiKey)}
                    aria-label="Toggle API key visibility"
                  >
                    {#if store.showApiKey}
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        ><path
                          fill="currentColor"
                          d="M2 5.27L3.28 4L20 20.72L18.73 22l-3.08-3.08c-1.15.38-2.37.58-3.65.58c-5 0-9.27-3.11-11-7.5c.69-1.76 1.79-3.31 3.19-4.54zM12 9a3 3 0 0 1 3 3a3 3 0 0 1-.17 1L11 9.17A3 3 0 0 1 12 9m0-4.5c5 0 9.27 3.11 11 7.5a11.8 11.8 0 0 1-4 5.19l-1.42-1.43A9.86 9.86 0 0 0 20.82 12A9.82 9.82 0 0 0 12 6.5c-1.09 0-2.16.18-3.16.5L7.3 5.47c1.44-.62 3.03-.97 4.7-.97M3.18 12A9.82 9.82 0 0 0 12 17.5c.69 0 1.37-.07 2-.21L11.72 15A3.064 3.064 0 0 1 9 12.28L5.6 8.87c-.99.85-1.82 1.91-2.42 3.13"
                        /></svg
                      >
                    {:else}
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        ><path
                          fill="currentColor"
                          d="M12 9a3 3 0 0 1 3 3a3 3 0 0 1-3 3a3 3 0 0 1-3-3a3 3 0 0 1 3-3m0-4.5c5 0 9.27 3.11 11 7.5c-1.73 4.39-6 7.5-11 7.5S2.73 16.39 1 12c1.73-4.39 6-7.5 11-7.5M3.18 12a9.821 9.821 0 0 0 17.64 0a9.821 9.821 0 0 0-17.64 0"
                        /></svg
                      >
                    {/if}
                  </button>
                </div>

                <div class="api-key-edit-actions">
                  <button
                    type="button"
                    class="btn-secondary"
                    onclick={() => {
                      store.apiKeyInput = "";
                      store.apiKeyMessage = null;
                      store.apiKeyMode = store.selectedEngine?.api_key_configured
                        ? "view"
                        : "cta";
                    }}
                    disabled={store.apiKeyLoading}
                    aria-label="Cancel"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    class="btn-primary test-key-button"
                    onclick={handleAddOrUpdateApiKey}
                    disabled={store.apiKeyLoading}
                    aria-label="Add or save API key"
                  >
                    {store.apiKeyMode === "add" ? "Add" : "Update"}
                  </button>
                </div>
              </div>
              {#if store.apiKeyMessage}
                <div
                  class="api-key-message"
                  class:valid={store.apiKeyStatus === "valid"}
                  class:invalid={store.apiKeyStatus === "in_valid"}
                >
                  <span class="status-dot"></span>
                  <span>{store.apiKeyMessage}</span>
                </div>
              {/if}
            </div>
          {:else}
            {#if !store.apiKeyDeleteConfirm}
              <div class="api-key-view-row">
                <div class="api-key-preview">
                  {store.selectedEngine.api_key_preview ?? "••••"}
                </div>
                <div class="api-key-actions">
                  <button
                    type="button"
                    class="btn-secondary success"
                    onclick={handleValidateApiKey}
                    disabled={store.apiKeyLoading}
                    aria-label="Validate API key"
                  >
                    {store.apiKeyLoading && store.apiKeyStatus !== "not_validated"
                      ? "Validating..."
                      : "Validate"}
                  </button>
                  <button
                    type="button"
                    class="btn-secondary"
                    onclick={() => {
                      store.apiKeyMode = "update";
                      store.apiKeyInput = "";
                      store.apiKeyMessage = null;
                      store.apiKeyStatus = "not_validated";
                    }}
                    disabled={store.apiKeyLoading}
                    aria-label="Update API key"
                  >
                    Update
                  </button>
                  <button
                    type="button"
                    class="btn-secondary danger"
                    onclick={() => {
                      store.apiKeyDeleteConfirm = true;
                    }}
                    disabled={store.apiKeyLoading}
                    aria-label="Delete API key"
                  >
                    Delete
                  </button>
                </div>
              </div>
            {:else}
              <div class="api-key-delete-confirm">
                <p>
                  Delete this API key? This will disable the engine until a new
                  key is added.
                </p>
                <div class="api-key-confirm-actions">
                  <button
                    type="button"
                    class="btn-secondary"
                    onclick={() => {
                      store.apiKeyDeleteConfirm = false;
                    }}
                    disabled={store.apiKeyLoading}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    class="btn-secondary danger"
                    onclick={handleDeleteApiKey}
                    disabled={store.apiKeyLoading}
                    aria-label="Confirm delete API key"
                  >
                    Confirm Delete
                  </button>
                </div>
              </div>
            {/if}
            {#if store.apiKeyMessage}
              <div
                class="api-key-message"
                class:valid={store.apiKeyStatus === "valid"}
                class:invalid={store.apiKeyStatus === "in_valid"}
              >
                <span class="status-dot"></span>
                <span>{store.apiKeyMessage}</span>
              </div>
            {/if}
          {/if}
        </div>

        <!-- Models Section -->
        <div class="form-section">
          <div class="section-header">
            <h4 class="form-section-title">Model Whitelist</h4>
            <div class="bulk-actions">
              <button
                type="button"
                class="btn-text success"
                onclick={selectAllModels}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M9 11l3 3L22 4" />
                  <path
                    d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"
                  />
                </svg>
                Check All
              </button>
              <button
                type="button"
                class="btn-text danger"
                onclick={deselectAllModels}
              >
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
                Uncheck All
              </button>
            </div>
          </div>

          {#if store.loadingModels}
            <LoadingSpinner text="Loading models..." />
          {:else if store.availableModels && store.availableModels.models.length > 0}
            <div class="models-list">
              {#each store.availableModels.models as model}
                {@const isDefaultModel =
                  model.model_id === store.formData.default_model}
                <label class="model-item" class:is-default={isDefaultModel}>
                  <input
                    type="checkbox"
                    checked={store.formData.whitelisted_models.includes(
                      model.model_id,
                    )}
                    disabled={isDefaultModel}
                    onchange={() => toggleModelSelection(model.model_id)}
                    title={isDefaultModel
                      ? "Default model must remain whitelisted"
                      : ""}
                  />
                  <div class="model-info">
                    <span class="model-name">
                      {model.model_id}
                      {#if isDefaultModel}
                        <span class="default-model-badge">Default</span>
                      {/if}
                    </span>
                    <span class="model-meta">{model.display_name}</span>
                  </div>
                </label>
              {/each}
            </div>

            <!-- Default Model for this Engine -->
            <div class="form-section">
              <div class="form-group">
                <label for="default-model-select"
                  >Default Model for this Engine</label
                >
                {#if store.formData.whitelisted_models.length > 0}
                  <select
                    id="default-model-select"
                    bind:value={store.formData.default_model}
                    required
                  >
                    {#each store.availableModels.models.filter( (m) => store.formData.whitelisted_models.includes(m.model_id), ) as model}
                      <option value={model.model_id}
                        >{model.display_name}</option
                      >
                    {/each}
                  </select>
                  <span class="form-hint"
                    >This model will be used by default when this engine is
                    selected. Only whitelisted models are available.</span
                  >
                {:else}
                  <div class="form-notice warning">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <path
                        d="M13.73 4a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"
                      />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    <p>
                      Please whitelist at least one model before selecting a
                      default model.
                    </p>
                  </div>
                {/if}
              </div>
            </div>

            <!-- System Default Engine -->
            <div class="default-engine-section">
              <div class="form-group checkbox-group">
                <label class="checkbox-label">
                  <input 
                    type="checkbox" 
                    bind:checked={store.formData.is_default}
                    disabled={store.formData.is_default && store.isDefaultEngine(store.selectedEngine?.engine_key || '')}
                    title={store.formData.is_default && store.isDefaultEngine(store.selectedEngine?.engine_key || '') 
                      ? "You cannot remove the default engine. Select another engine as default first." 
                      : ""}
                  />
                  <span>Set as system default engine</span>
                </label>
                <span class="form-hint"
                  >When enabled, this engine will be used for new conversations
                  when no specific routing is set. Only one engine can be the
                  system default at a time. To change the default, select another engine as default.</span
                >
              </div>
            </div>
          {:else}
            <p class="no-models-message">
              No models available. Try validating your API key first.
            </p>
          {/if}
        </div>

        <!-- Status Toggle -->
        <div class="form-group">
          <label for="engine-status">Engine Status</label>
          <div class="status-toggle-wrapper">
            <button
              id="engine-status"
              type="button"
              class="status-toggle"
              class:active={store.formData.is_enabled}
              onclick={() => {
                store.formData = { ...store.formData, is_enabled: !store.formData.is_enabled };
              }}
              aria-label={store.formData.is_enabled ? "Enabled" : "Disabled"}
            >
              <span class="toggle-slider"></span>
            </button>
            <span class="status-label"
              >{store.formData.is_enabled ? "Enabled" : "Disabled"}</span
            >
          </div>
        </div>

        <div class="form-actions">
          <button
            type="button"
            class="btn-secondary"
            onclick={store.closeConfigModal}
          >
            Cancel
          </button>
          <button type="submit" class="btn-accent"> Save </button>
        </div>
      </form>
    {/if}
  {/snippet}
</Modal>

<style>
  .ai-engines-container {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xl);
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

  .form-group select {
    width: 100%;
    padding: var(--space-md);
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: 0.9375rem;
    cursor: pointer;
    transition: all 0.2s ease;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23ffffff' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right var(--space-md) center;
    background-size: 1.25rem;
  }

  .form-group select:focus {
    outline: none;
    border-color: var(--brand);
    background: rgba(255, 255, 255, 0.08);
  }

  .api-key-section {
    margin-bottom: var(--space-sm);
  }

  .api-key-cta {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .add-key-button {
    width: 100%;
    justify-content: center;
  }

  .api-key-helper {
    margin: 0;
    color: var(--text-primary);
    font-size: 0.95rem;
  }

  .api-key-input-row {
    display: flex;
    align-items: stretch;
    gap: var(--space-sm);
    margin-top: var(--space-sm);
  }

  .api-key-input-wrapper {
    display: flex;
    position: relative;
    align-items: center;
    flex: 1;
    padding: 2px;
    border-radius: var(--radius-md);
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.02);
    overflow: hidden;
  }

  .api-key-input-wrapper input {
    flex: 1;
    border: none;
    padding: var(--space-md);
    padding-right: 48px;
    background: transparent;
    color: var(--text-primary);
    font-family: var(
      --font-mono,
      ui-monospace,
      SFMono-Regular,
      Menlo,
      Monaco,
      Consolas,
      "Liberation Mono",
      "Courier New",
      monospace
    );
    font-size: 0.9rem;
  }

  .api-key-input-wrapper input:focus {
    outline: none;
  }

  .api-key-visibility {
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
    border: none;
    background: transparent;
    padding: 0 var(--space-md);
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--text-secondary);
    cursor: pointer;
  }

  .api-key-visibility:hover {
    color: var(--text-primary);
  }

  .test-key-button {
    white-space: nowrap;
    padding-inline: var(--space-lg);
  }

  .api-key-input-row.status-valid .api-key-input-wrapper {
    border-color: var(--brand-green);
    box-shadow: 0 0 0 1px rgba(34, 197, 94, 0.4);
  }

  .api-key-input-row.status-invalid .api-key-input-wrapper {
    border-color: var(--brand-red);
    box-shadow: 0 0 0 1px rgba(239, 68, 68, 0.4);
  }

  .api-key-message {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    margin-top: var(--space-sm);
    font-size: 0.85rem;
    color: var(--text-secondary);
  }

  .api-key-message.valid {
    color: var(--brand-green);
  }

  .api-key-message.invalid {
    color: var(--brand-red);
  }

  .status-dot {
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 999px;
    background: currentColor;
  }

  .api-key-view-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-md);
  }

  .api-key-preview {
    font-family: var(
      --font-mono,
      ui-monospace,
      SFMono-Regular,
      Menlo,
      Monaco,
      Consolas,
      "Liberation Mono",
      "Courier New",
      monospace
    );
    padding: var(--space-md);
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: var(--radius-md);
    min-width: 10rem;
  }

  .api-key-actions {
    display: flex;
    gap: var(--space-sm);
    flex-wrap: wrap;
  }

  .api-key-edit-actions {
    display: flex;
    gap: var(--space-sm);
  }

  .btn-secondary.danger {
    border-color: rgba(239, 68, 68, 0.4);
    color: var(--brand-red);
  }

  .btn-secondary.danger:hover {
    background: rgba(239, 68, 68, 0.08);
  }

  .btn-secondary.success {
    border-color: var(--brand-green);
    color: var(--brand-green);
  }

  .btn-secondary.success:hover {
    background: rgba(34, 197, 94, 0.08);
  }

  .api-key-delete-confirm {
    padding: var(--space-md);
    border: 1px solid rgba(239, 68, 68, 0.25);
    border-radius: var(--radius-md);
    background: rgba(239, 68, 68, 0.08);
    color: var(--text-primary);
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .api-key-delete-confirm p {
    margin: 0;
    font-size: 0.9rem;
  }

  .api-key-confirm-actions {
    display: flex;
    gap: var(--space-sm);
    justify-content: flex-end;
    flex-wrap: wrap;
  }

  /* Providers Section */
  .providers-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-xl);
  }

  .providers-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: var(--space-lg);
  }

  .provider-card {
    padding: var(--space-xl);
    border-radius: var(--radius-xl);
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
    transition: all 0.2s ease;
    box-shadow:
      0 4px 6px rgba(0, 0, 0, 0.1),
      0 2px 4px rgba(0, 0, 0, 0.06);
  }

  .provider-card:hover {
    transform: translateY(-2px);
    box-shadow:
      0 10px 15px rgba(0, 0, 0, 0.15),
      0 4px 6px rgba(0, 0, 0, 0.1);
    background: rgba(255, 255, 255, 0.07);
  }

  .provider-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .provider-info {
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }

  .provider-status-indicator {
    width: 0.75rem;
    height: 0.75rem;
    border-radius: 50%;
    background: var(--text-tertiary);
    transition: background 0.2s ease;
  }

  .provider-status-indicator.connected {
    background: var(--brand-green);
    box-shadow: 0 0 8px rgba(34, 197, 94, 0.5);
  }

  .provider-status-indicator.no-key {
    background: #f59e0b;
    box-shadow: 0 0 8px rgba(245, 158, 11, 0.5);
  }

  .provider-status-indicator.invalid {
    background: var(--brand-red);
    box-shadow: 0 0 8px rgba(239, 68, 68, 0.5);
  }

  .provider-status-indicator.disabled {
    background: var(--text-tertiary);
    box-shadow: 0 0 8px rgba(107, 114, 128, 0.5);
  }

  .status-toggle {
    position: relative;
    width: 3rem;
    height: 1.75rem;
    background: rgba(255, 255, 255, 0.1);
    border: none;
    border-radius: 1rem;
    cursor: pointer;
    transition: background 0.2s ease;
  }

  .status-toggle.active {
    background: var(--brand-green);
  }

  .toggle-slider {
    position: absolute;
    top: 0.25rem;
    left: 0.25rem;
    width: 1.25rem;
    height: 1.25rem;
    background: white;
    border-radius: 50%;
    transition: transform 0.2s ease;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .status-toggle.active .toggle-slider {
    transform: translateX(1.25rem);
  }

  .status-toggle:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .provider-details {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .status-item {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .status-icon {
    width: 1.125rem;
    height: 1.125rem;
    color: var(--text-secondary);
  }

  .status-icon.success {
    color: var(--brand-green);
  }

  .status-icon.warning {
    color: #f59e0b;
  }

  .status-icon.error {
    color: var(--brand-red);
  }

  .status-icon.disabled {
    color: var(--text-tertiary);
  }

  .status-text {
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .status-text.success {
    color: var(--brand-green);
  }

  .status-text.warning {
    color: #f59e0b;
  }

  .status-text.error {
    color: var(--brand-red);
  }

  .status-text.disabled {
    color: var(--text-tertiary);
  }

  .api-key-text {
    font-family: "Courier New", monospace;
  }

  .api-key-text code {
    padding: 0.125rem var(--space-xs);
    background: rgba(255, 255, 255, 0.05);
    border-radius: var(--radius-sm);
    font-size: 0.8125rem;
    color: var(--text-primary);
  }

  .provider-actions {
    display: flex;
    gap: var(--space-md);
    margin-top: auto;
  }

  /* Modal Styles */
  .config-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-xl);
  }

  .form-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
    padding: var(--space-lg);
    background: rgba(var(--glass-tint), 0.02);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: var(--radius-lg);
  }

  .form-section-title {
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .bulk-actions {
    display: flex;
    gap: var(--space-md);
  }

  .btn-text {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-xs) var(--space-sm);
    background: none;
    border: none;
    color: var(--text-secondary);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: color 0.2s ease;
  }

  .btn-text:hover {
    color: var(--text-primary);
  }

  .btn-text.success {
    color: var(--brand-green);
  }

  .btn-text.success:hover {
    color: #22c55e;
  }

  .btn-text.danger {
    color: var(--brand-red);
  }

  .btn-text.danger:hover {
    color: #ef4444;
  }

  .btn-text svg {
    width: 1rem;
    height: 1rem;
  }

  .form-hint {
    font-size: 0.75rem;
    color: var(--text-tertiary);
  }

  .models-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    max-height: 24rem;
    overflow-y: auto;
    padding: var(--space-xs);
  }

  .model-item {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-md);
    background: rgba(var(--glass-tint), 0.02);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .model-item:hover {
    background: rgba(var(--glass-tint), 0.04);
    border-color: rgba(255, 255, 255, 0.1);
  }

  .model-item input[type="checkbox"] {
    width: 1.125rem;
    height: 1.125rem;
    cursor: pointer;
    accent-color: var(--brand);
  }

  .model-item input[type="checkbox"]:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .model-item.is-default {
    background: rgba(59, 130, 246, 0.05);
    border-color: rgba(59, 130, 246, 0.2);
  }

  .model-item.is-default:hover {
    background: rgba(59, 130, 246, 0.08);
    border-color: rgba(59, 130, 246, 0.3);
  }

  .model-info {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    flex: 1;
  }

  .model-name {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-primary);
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .default-model-badge {
    display: inline-flex;
    align-items: center;
    padding: 0.125rem var(--space-xs);
    background: rgba(59, 130, 246, 0.2);
    color: var(--brand);
    border-radius: var(--radius-sm);
    font-size: 0.6875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.025em;
  }

  .model-meta {
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .no-models-message {
    padding: var(--space-xl);
    text-align: center;
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .form-notice {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-lg);
    background: rgba(59, 130, 246, 0.1);
    border: 1px solid rgba(59, 130, 246, 0.2);
    border-radius: var(--radius-md);
    color: var(--brand);
  }

  .form-notice.warning {
    background: rgba(245, 158, 11, 0.1);
    border: 1px solid rgba(245, 158, 11, 0.2);
    color: #f59e0b;
  }

  .form-notice svg {
    width: 1.5rem;
    height: 1.5rem;
    flex-shrink: 0;
  }

  .form-notice p {
    margin: 0;
    font-size: 0.875rem;
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

  .default-engine-section {
    padding: var(--space-lg);
    background: rgba(59, 130, 246, 0.05);
    border: 1px solid rgba(59, 130, 246, 0.2);
    border-radius: var(--radius-md);
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .checkbox-group {
    gap: var(--space-xs);
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    cursor: pointer;
  }

  .checkbox-label input[type="checkbox"] {
    width: 1.125rem;
    height: 1.125rem;
    cursor: pointer;
    accent-color: var(--brand);
  }

  .checkbox-label span {
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-md);
    padding-top: var(--space-lg);
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  @media (max-width: 768px) {
    .providers-grid {
      grid-template-columns: 1fr;
    }

    .form-actions {
      flex-direction: column-reverse;
    }

    .form-actions button {
      width: 100%;
    }
  }
</style>
