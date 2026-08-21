<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import type { Department } from "../types.js";
  import { departmentsStore } from "../stores/index.js";
  import { toast } from "../../components/Toaster.svelte";
  import { ApiError } from "../../api/client.js";
  import { getLocalizedError } from "../../utils/errorLocalization.js";
  import { _ } from "svelte-i18n";
  import { getModels, type ModelsResponse } from "../../api/models.js";
  import { updateDepartmentAllowedModels } from "../../api/admin/departments.js";
  import LoadingSpinner from "./LoadingSpinner.svelte";
  import Modal from "./Modal.svelte";

  interface Props {
    department: Department;
    /** When false, hide edit UI (typically same permission as budget allocation). */
    canEditModels?: boolean;
  }

  let { department, canEditModels = true }: Props = $props();

  let showEditModal = $state(false);
  let isSubmitting = $state(false);
  let isLoadingModels = $state(false);
  let isLoadingAllowedModels = $state(false);
  let modelsResponse = $state<ModelsResponse | null>(null);
  let selectedAllowedModels = $state<Array<{ model: string; provider: string }>>([]);
  let requestedDepartmentId = $state<string | null>(null);
  let fetchedCatalog = $state(false);
  const selectedDepartment = $derived($departmentsStore.selectedDepartment?.id === department.id
    ? $departmentsStore.selectedDepartment
    : null);
  const resolvedAllowedModels = $derived(selectedDepartment?.allowed_models ?? null);
  const groupedAllowedModels = $derived.by(() => {
    const grouped = new Map<string, string[]>();
    for (const item of resolvedAllowedModels ?? []) {
      const existing = grouped.get(item.provider) ?? [];
      existing.push(item.model);
      grouped.set(item.provider, existing);
    }
    return Array.from(grouped.entries()).map(([provider, models]) => ({ provider, models }));
  });

  $effect(() => {
    if (!showEditModal) {
      selectedAllowedModels = resolvedAllowedModels ? [...resolvedAllowedModels] : [];
    }
  });

  $effect(() => {
    if (!fetchedCatalog) {
      fetchedCatalog = true;
      void fetchModels();
    }
  });

  $effect(() => {
    if (requestedDepartmentId === department.id) return;
    requestedDepartmentId = department.id;
    isLoadingAllowedModels = true;
    void departmentsStore.fetchDepartment(department.id).finally(() => {
      isLoadingAllowedModels = false;
    });
  });

  async function fetchModels() {
    isLoadingModels = true;
    try {
      modelsResponse = await getModels();
    } catch (error) {
      const errorMessage = error instanceof ApiError
        ? getLocalizedError(error, 'description', $_)
        : $_('admin.departments.allowedModels.failedToLoadModelsCatalog');
      toast.error(errorMessage);
    } finally {
      isLoadingModels = false;
    }
  }

  function startEditing() {
    if (!canEditModels) return;
    selectedAllowedModels = resolvedAllowedModels ? [...resolvedAllowedModels] : [];
    showEditModal = true;
  }

  function cancelEditing() {
    selectedAllowedModels = selectedDepartment?.allowed_models
      ? [...selectedDepartment.allowed_models]
      : (department.allowed_models ? [...department.allowed_models] : []);
    showEditModal = false;
  }

  function toggleAllowedModel(provider: string, model: string) {
    const exists = selectedAllowedModels.some((entry) => entry.provider === provider && entry.model === model);
    selectedAllowedModels = exists
      ? selectedAllowedModels.filter((entry) => !(entry.provider === provider && entry.model === model))
      : [...selectedAllowedModels, { provider, model }];
  }

  function isAllowedModel(provider: string, model: string) {
    return selectedAllowedModels.some((entry) => entry.provider === provider && entry.model === model);
  }

  function selectAllModels() {
    if (!modelsResponse?.providers) return;
    selectedAllowedModels = modelsResponse.providers.flatMap((provider) =>
      provider.models.map((model) => ({ provider: provider.key, model: model.key }))
    );
  }

  function clearAllModels() {
    selectedAllowedModels = [];
  }

  function selectAllForProvider(providerKey: string) {
    const provider = modelsResponse?.providers.find((item) => item.key === providerKey);
    if (!provider) return;

    const withoutProvider = selectedAllowedModels.filter((entry) => entry.provider !== providerKey);
    const providerModels = provider.models.map((model) => ({ provider: provider.key, model: model.key }));
    selectedAllowedModels = [...withoutProvider, ...providerModels];
  }

  function clearAllForProvider(providerKey: string) {
    selectedAllowedModels = selectedAllowedModels.filter((entry) => entry.provider !== providerKey);
  }

  async function saveAllowedModels() {
    isSubmitting = true;
    try {
      await updateDepartmentAllowedModels(
        department.id,
        selectedAllowedModels
      );
      await departmentsStore.fetchDepartment(department.id);
      toast.success($_('admin.departments.allowedModels.updatedSuccess'));
      showEditModal = false;
    } catch (error) {
      const errorMessage = error instanceof ApiError
        ? getLocalizedError(error, "description", $_)
        : $_('admin.departments.allowedModels.updateFailed');
      toast.error(errorMessage);
    } finally {
      isSubmitting = false;
    }
  }
</script>

<div class="section">
  <div class="section-header">
    <h3>{$_('admin.departments.allowedModels.title')}</h3>
    {#if canEditModels}
      <button type="button" class="btn-secondary" onclick={startEditing}>{$_('admin.departments.allowedModels.editModels')}</button>
    {/if}
  </div>

  <div class="models-view">
    {#if isLoadingAllowedModels}
      <div class="models-loading-state">
        <LoadingSpinner size="md" text={$_('admin.departments.allowedModels.loadingSelectedModels')} />
      </div>
    {:else if resolvedAllowedModels === null || (resolvedAllowedModels?.length ?? 0) === 0}
      <p class="models-summary">{$_('admin.departments.allowedModels.allModelsAllowed')}</p>
    {:else}
      <p class="models-summary">{$_('admin.departments.allowedModels.modelsAllowedCount', { values: { count: resolvedAllowedModels?.length ?? 0 } })}</p>
      <div class="allowed-models-list">
        {#each groupedAllowedModels as group}
          <div class="allowed-provider-group">
            <div class="allowed-provider-title">{group.provider}</div>
            <div class="allowed-model-chips">
              {#each group.models as model}
                <span class="allowed-model-chip">{model}</span>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

{#if showEditModal}
  <Modal isOpen={showEditModal} onclose={cancelEditing} title={$_('admin.departments.allowedModels.editModalTitle')}>
    <div class="models-edit-modal">
      <div class="modal-top-row">
        <p class="section-description">{$_('admin.departments.allowedModels.hintUncheckedAllowsAll')}</p>
        <div class="bulk-actions">
          <button type="button" class="btn-bulk-action" onclick={selectAllModels} disabled={isSubmitting || isLoadingModels}>
            {$_('admin.departments.allowedModels.selectAll')}
          </button>
          <button type="button" class="btn-bulk-action danger" onclick={clearAllModels} disabled={isSubmitting || isLoadingModels}>
            {$_('admin.departments.allowedModels.clear')}
          </button>
        </div>
      </div>
      <div class="models-edit-body">
        {#if isLoadingModels}
          <div class="models-loading">
            <LoadingSpinner size="md" text={$_('admin.departments.allowedModels.loadingModelsCatalog')} />
          </div>
        {:else if modelsResponse?.providers?.length}
          <div class="providers-list">
            {#each modelsResponse.providers as provider}
              <div class="provider-group">
                <div class="provider-header">
                  <div class="provider-name">{provider.name}</div>
                  <div class="provider-actions">
                    <button
                      type="button"
                      class="btn-link-action"
                      onclick={() => selectAllForProvider(provider.key)}
                      disabled={isSubmitting}
                    >
                      {$_('admin.departments.allowedModels.selectAll')}
                    </button>
                    <button
                      type="button"
                      class="btn-link-action"
                      onclick={() => clearAllForProvider(provider.key)}
                      disabled={isSubmitting}
                    >
                      {$_('admin.departments.allowedModels.clear')}
                    </button>
                  </div>
                </div>
                <div class="model-chips">
                  {#each provider.models as model}
                    <label class="model-chip">
                      <input
                        type="checkbox"
                        checked={isAllowedModel(provider.key, model.key)}
                        onchange={() => toggleAllowedModel(provider.key, model.key)}
                        disabled={isSubmitting}
                      />
                      <span>{model.name}</span>
                    </label>
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <div class="models-empty">{$_('admin.departments.allowedModels.noModelsAvailable')}</div>
        {/if}
      </div>

      <div class="form-actions">
        <button type="button" class="btn-secondary" onclick={cancelEditing} disabled={isSubmitting}>
          {$_('common.cancel')}
        </button>
        <button type="button" class="btn-primary" onclick={saveAllowedModels} disabled={isSubmitting}>
          {isSubmitting ? $_('admin.common.saving') : $_('common.save')}
        </button>
      </div>
    </div>
  </Modal>
{/if}

<style>
  /* app.css gives every button backdrop-filter: blur(); on the flat
     Organization surfaces that repaints the 1px hairlines behind them
     (the tab-row ring, the tree's branch rails), so switch it off. */
  button {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .section {
    border-radius: 12px;
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    align-self: stretch;
    font-family: var(--gx-font);
  }

  .section-header,
  .form-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }

  .section-header h3 {
    margin: 0;
    font-weight: 700;
    font-size: 14px;
    line-height: 100%;
    color: var(--gx-slate-900);
  }

  .section-description,
  .models-summary {
    color: var(--gx-slate-500);
    font-size: 13px;
    font-weight: 400;
    line-height: 100%;
    margin: 0;
  }

  .modal-top-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .bulk-actions,
  .provider-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .providers-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin: 12px 0;
  }

  .provider-group {
    padding: 12px;
    background: var(--button-bg);
    border-radius: var(--radius-sm);
  }

  .provider-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .provider-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 10px;
  }

  .model-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .model-chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 7px 11px;
    border-radius: var(--radius-sm);
    background: var(--btn-quaternary);
    border: 1px solid var(--button-border);
    cursor: pointer;
    font-size: 13px;
    color: var(--text-primary);
    transition: background 0.2s ease, border-color 0.2s ease, transform 0.15s ease;
  }

  .model-chip:hover {
    background: var(--button-bg);
    border-color: var(--glass-stroke-light);
    transform: translateY(-1px);
  }

  .model-chip:has(input:checked) {
    background: color-mix(in oklab, var(--brand) 12%, var(--btn-quaternary));
    border-color: color-mix(in oklab, var(--brand) 35%, transparent);
  }

  .model-chip:has(input:focus-visible) {
    outline: 2px solid var(--brand);
    outline-offset: 1px;
  }

  .model-chip input {
    width: 14px;
    height: 14px;
    accent-color: var(--brand);
    margin: 0;
    flex-shrink: 0;
  }

  .model-chip span {
    line-height: 1.2;
  }

  .models-loading,
  .models-empty {
    padding: 16px;
    text-align: center;
    color: var(--text-secondary);
    font-size: 13px;
  }

  .models-loading-state {
    padding: 12px 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .models-edit-modal {
    max-height: min(70vh, 640px);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .models-edit-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    margin-top: 12px;
    padding-right: 4px;
  }

  .allowed-models-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 10px;
  }

  .allowed-provider-group {
    background: var(--button-bg);
    border-radius: var(--radius-sm);
    padding: 10px;
  }

  .allowed-provider-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.4px;
    margin-bottom: 8px;
  }

  .allowed-model-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .allowed-model-chip {
    display: inline-flex;
    align-items: center;
    padding: 4px 8px;
    border-radius: var(--radius-sm);
    background: var(--btn-quaternary);
    color: var(--text-primary);
    font-size: 12px;
  }

  .btn-secondary,
  .btn-primary {
    padding: 8px 16px;
    border-radius: var(--radius-sm);
    font-size: 14px;
    font-weight: 500;
    border: none;
    cursor: pointer;
  }

  .form-actions {
    justify-content: flex-end;
    border-top: 1px solid var(--glass-stroke-dark);
    background: var(--btn-secondary);
    position: sticky;
    padding: 12px;
    border-radius: 0 0 var(--radius-md) var(--radius-md);
    bottom: 0;
    z-index: 1;
  }

  .btn-secondary {
    background: var(--button-bg);
    color: var(--text-primary);
    border: 1px solid var(--button-border);
  }

  /* Card header action follows the Organization design's secondary button. */
  .section-header .btn-secondary {
    height: 33px;
    padding: 0 14px;
    border: 0;
    border-radius: 8px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 600;
    color: var(--gx-slate-500);
    transition: background-color 120ms ease;
  }

  .section-header .btn-secondary:hover {
    background: var(--gx-org-track);
    transform: none;
  }

  .btn-primary {
    background: var(--brand);
    color: white;
  }

  .btn-link-action {
    border: none;
    background: transparent;
    color: var(--brand);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    padding: 0.25rem 0.5rem;
    border-radius: var(--radius-sm);
  }

  .btn-link-action:hover:not(:disabled) {
    background: color-mix(in oklab, var(--brand) 12%, transparent);
  }

  .btn-link-action:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-bulk-action {
    border: 1px solid var(--button-border);
    background: var(--button-bg);
    color: var(--text-primary);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    padding: 6px 10px;
    border-radius: var(--radius-sm);
    transition: all 0.2s ease;
  }

  .btn-bulk-action:hover:not(:disabled) {
    border-color: var(--glass-stroke-light);
    background: var(--btn-tertiary);
  }

  .btn-bulk-action.danger {
    color: #f87171;
    background: var(--button-bg);
    border-color: color-mix(in oklab, var(--brand-red) 50%, var(--button-border));
  }

  .btn-bulk-action.danger:hover:not(:disabled) {
    color: #fca5a5;
    background: color-mix(in oklab, var(--brand-red) 24%, var(--button-bg));
    border-color: color-mix(in oklab, var(--brand-red) 70%, var(--button-border));
  }

  .btn-bulk-action.danger:focus-visible {
    outline: 2px solid color-mix(in oklab, var(--brand-red) 60%, white);
    outline-offset: 1px;
  }

  .btn-bulk-action:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
