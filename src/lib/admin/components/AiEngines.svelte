<script lang="ts">
  import { onMount } from "svelte";
  import AdminEmptyState from "./AdminEmptyState.svelte";
  import AdminPanelCard from "./AdminPanelCard.svelte";
  import AdminSectionHeader from "./AdminSectionHeader.svelte";
  import LoadingSpinner from "./LoadingSpinner.svelte";
  import Modal from "./Modal.svelte";
  import { toast } from "../../components/Toaster.svelte";
  import type { AIEngine, AIEngineModels } from "../types.js";
  import {
    getAIEngines,
    updateAIEngine,
    validateAIEngineKey,
    getAIEngineModels,
    deleteAIEngineKey,
  } from "../../api/adminAiEngines.js";

  let engines = $state<AIEngine[]>([]);
  let loading = $state(true);
  let showConfigModal = $state(false);
  let selectedEngine = $state<AIEngine | null>(null);
  let availableModels = $state<AIEngineModels | null>(null);
  let loadingModels = $state(false);

  // Form data for configuring engines
  let formData = $state({
    is_enabled: true,
    whitelisted_models: [] as string[],
    default_model: null as string | null | undefined,
    is_default: false,
  });

  async function loadEngines() {
    try {
      loading = true;
      engines = await getAIEngines();
    } catch (err: any) {
      toast.error(err.message || "Failed to load AI engines");
    } finally {
      loading = false;
    }
  }

  async function toggleEngineStatus(engine: AIEngine) {
    try {
      await updateAIEngine(engine.engine_key, {
        is_enabled: !engine.is_enabled,
      });
      toast.success(
        `${engine.display_name} ${!engine.is_enabled ? "enabled" : "disabled"}`,
      );
      await loadEngines();
    } catch (err: any) {
      toast.error(err.message || "Failed to update engine status");
    }
  }

  async function openConfigModal(engine: AIEngine) {
    selectedEngine = engine;

    formData = {
      is_enabled: engine.is_enabled,
      whitelisted_models: engine.whitelisted_models || [],
      default_model: engine.default_model,
      is_default: engine.is_default || false,
    };

    // Load available models if API key is configured
    if (engine.api_key_configured) {
      try {
        loadingModels = true;
        availableModels = await getAIEngineModels(engine.engine_key);
      } catch (err: any) {
        toast.error(err.message || "Failed to load models");
        availableModels = null;
      } finally {
        loadingModels = false;
      }
    } else {
      availableModels = null;
    }

    showConfigModal = true;
  }

  function closeConfigModal() {
    showConfigModal = false;
    selectedEngine = null;
    availableModels = null;
  }

  async function handleConfigSubmit() {
    if (!selectedEngine) return;

    // Validate: default model is required when API key is configured
    if (selectedEngine.api_key_configured && !formData.default_model) {
      toast.error("Please select a default model for this engine");
      return;
    }

    try {
      const updateData: any = {
        is_enabled: formData.is_enabled,
        whitelisted_models: formData.whitelisted_models,
        // Each engine has its own default_model (independent of is_default flag)
        default_model: formData.default_model || null,
        // is_default marks which engine is THE system default
        is_default: formData.is_default,
      };

      // Backend will automatically unset other engines when is_default: true
      await updateAIEngine(selectedEngine.engine_key, updateData);
      
      const action = formData.is_default ? "set as system default" : "updated";
      toast.success(`${selectedEngine.display_name} ${action} successfully`);
      await loadEngines();
      closeConfigModal();
    } catch (err: any) {
      toast.error(err.message || "Failed to update engine configuration");
    }
  }

  function toggleModelSelection(modelId: string) {
    const index = formData.whitelisted_models.indexOf(modelId);
    if (index > -1) {
      formData.whitelisted_models = formData.whitelisted_models.filter(
        (id) => id !== modelId,
      );
    } else {
      formData.whitelisted_models = [...formData.whitelisted_models, modelId];
    }
  }

  function selectAllModels() {
    if (availableModels) {
      formData.whitelisted_models = availableModels.models.map(
        (m) => m.model_id,
      );
    }
  }

  function deselectAllModels() {
    formData.whitelisted_models = [];
  }

  // Helper to get engine status
  function getEngineStatus(engine: AIEngine): {
    text: string;
    type: "connected" | "no-key" | "invalid" | "disabled";
  } {
    if (!engine.is_enabled) {
      return { text: "Disabled", type: "disabled" };
    }
    if (!engine.api_key_configured) {
      return { text: "No API Key", type: "no-key" };
    }
    if (engine.api_key_status === "invalid") {
      return { text: "Invalid Key", type: "invalid" };
    }
    return { text: "Connected", type: "connected" };
  }

  // Check if engine is default
  function isDefaultEngine(engine: AIEngine): boolean {
    return engine.is_enabled && engine.is_default;
  }

  onMount(() => {
    loadEngines();
  });
</script>

<div class="ai-engines-container">
  <AdminSectionHeader
    title="AI Engine Configuration"
    subtitle="Configure system settings and integrations with AI providers"
  />

  {#if loading}
    <AdminPanelCard>
      <LoadingSpinner text="Loading AI engines..." />
    </AdminPanelCard>
  {:else if engines.length === 0}
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
        {#each engines as engine (engine.engine_key)}
          {@const status = getEngineStatus(engine)}
          {@const isDefault = isDefaultEngine(engine)}

          <div class="provider-card">
            <div class="provider-header">
              <div class="provider-info">
                <div
                  class="provider-status-indicator"
                  class:disabled={status.type === "disabled"}
                  class:connected={status.type === "connected"}
                  class:no-key={status.type === "no-key"}
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
                  class:warning={status.type === "no-key"}
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
                  class:warning={status.type === "no-key"}
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
                    <path d="M12 1v6m0 6v6M5.64 5.64l4.24 4.24m4.24 4.24l4.24 4.24M1 12h6m6 0h6M5.64 18.36l4.24-4.24m4.24-4.24l4.24-4.24" />
                  </svg>
                  <span class="status-text">
                    Default Model: <strong>{engine.default_model}</strong>
                  </span>
                </div>
              {/if}

              {#if engine.api_key_configured}
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
              {/if}
            </div>

            <div class="provider-actions">
              <button class="btn-glass" onclick={() => openConfigModal(engine)}>
                Configure Models
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
  bind:isOpen={showConfigModal}
  title={selectedEngine
    ? `Configure ${selectedEngine.display_name} Models`
    : "Configure Models"}
  onclose={closeConfigModal}
>
  {#snippet children()}
    {#if selectedEngine}
      <form
        class="config-form"
        onsubmit={(e) => {
          e.preventDefault();
          handleConfigSubmit();
        }}
      >
        <!-- Models Section -->
        {#if selectedEngine.api_key_configured}
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

            {#if loadingModels}
              <LoadingSpinner text="Loading models..." />
            {:else if availableModels && availableModels.models.length > 0}
              <div class="models-list">
                {#each availableModels.models as model}
                  <label class="model-item">
                    <input
                      type="checkbox"
                      checked={formData.whitelisted_models.includes(
                        model.model_id,
                      )}
                      onchange={() => toggleModelSelection(model.model_id)}
                    />
                    <div class="model-info">
                      <span class="model-name">{model.model_id}</span>
                      <span class="model-meta">{model.display_name}</span>
                    </div>
                  </label>
                {/each}
              </div>

              <!-- Default Model for this Engine -->
              <div class="form-section">
                <div class="form-group">
                  <label for="default-model-select">Default Model for this Engine</label>
                  <select
                    id="default-model-select"
                    bind:value={formData.default_model}
                    required
                  >
                    {#each availableModels.models as model}
                      <option value={model.model_id}
                        >{model.display_name}</option
                      >
                    {/each}
                  </select>
                  <span class="form-hint"
                    >This model will be used by default when this engine is
                    selected.</span
                  >
                </div>
              </div>

              <!-- System Default Engine -->
              <div class="default-engine-section">
                <div class="form-group checkbox-group">
                  <label class="checkbox-label">
                    <input type="checkbox" bind:checked={formData.is_default} />
                    <span>Set as system default engine</span>
                  </label>
                  <span class="form-hint"
                    >When enabled, this engine will be used for new
                    conversations when no specific routing is set. Only one
                    engine can be the system default at a time.</span
                  >
                </div>
              </div>
            {:else}
              <p class="no-models-message">
                No models available. Try validating your API key first.
              </p>
            {/if}
          </div>
        {:else}
          <div class="form-notice">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <p>Configure an API key first to access model configuration.</p>
          </div>
        {/if}

        <!-- Status Toggle -->
        <div class="form-group">
          <label for="engine-status">Engine Status</label>
          <div class="status-toggle-wrapper">
            <button
              id="engine-status"
              type="button"
              class="status-toggle"
              class:active={formData.is_enabled}
              onclick={() => (formData.is_enabled = !formData.is_enabled)}
              aria-label={formData.is_enabled ? "Enabled" : "Disabled"}
            >
              <span class="toggle-slider"></span>
            </button>
            <span class="status-label"
              >{formData.is_enabled ? "Enabled" : "Disabled"}</span
            >
          </div>
        </div>

        <div class="form-actions">
          <button
            type="button"
            class="btn-secondary"
            onclick={closeConfigModal}
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
