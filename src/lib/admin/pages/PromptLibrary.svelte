<script lang="ts">
  import { onMount } from "svelte";
  import { _ } from "svelte-i18n";
  import PageHeader from "../components/PageHeader.svelte";
  import AdminTableCard from "../components/AdminTableCard.svelte";
  import LoadingSpinner from "../components/LoadingSpinner.svelte";
  import AdminEmptyState from "../components/AdminEmptyState.svelte";
  import Modal from "../components/Modal.svelte";
  import PromptFormModal from "../components/prompt-library/PromptFormModal.svelte";
  import PromptPreviewModal from "../components/prompt-library/PromptPreviewModal.svelte";
  import { toast } from "../../components/Toaster.svelte";
  import { ApiError } from "../../api/client.js";
  import { getLocalizedError } from "../../utils/errorLocalization.js";
  import {
    getRolePrompts,
    createRolePrompt,
    updateRolePrompt,
    deleteRolePrompt,
    type RolePrompt,
    type CreateRolePromptPayload,
  } from "../../api/admin/rolePrompts.js";
  import { getRoles, type Role } from "../../api/admin/roles.js";

  // State
  let prompts = $state<RolePrompt[]>([]);
  let roles = $state<Role[]>([]);
  let loading = $state(true);
  let searchQuery = $state("");
  let filterRoleId = $state("");
  let filterSystem = $state<"all" | "system" | "user">("all");

  // Modal state
  let formMode = $state<"create" | "edit">("create");
  let formOpen = $state(false);
  let editingPrompt = $state<RolePrompt | null>(null);
  let previewOpen = $state(false);
  let previewPrompt = $state<RolePrompt | null>(null);
  let deleteConfirmOpen = $state(false);
  let promptToDelete = $state<RolePrompt | null>(null);
  let isDeleting = $state(false);

  // Derived
  let roleMap = $derived(
    roles.reduce(
      (m, r) => {
        m[r.id] = r.name;
        return m;
      },
      {} as Record<string, string>,
    ),
  );

  let filteredPrompts = $derived(() => {
    let result = prompts;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.prompt_text.toLowerCase().includes(q),
      );
    }

    if (filterRoleId) {
      result = result.filter((p) => p.role_id === filterRoleId);
    }

    if (filterSystem === "system") {
      result = result.filter((p) => p.is_system);
    } else if (filterSystem === "user") {
      result = result.filter((p) => !p.is_system);
    }

    return result;
  });

  onMount(() => {
    loadData();
  });

  async function loadData() {
    loading = true;
    try {
      const [promptsRes, rolesRes] = await Promise.all([
        getRolePrompts(),
        getRoles(),
      ]);
      prompts = promptsRes;
      roles = rolesRes.roles;
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? getLocalizedError(err, "description", () => "")
          : (err as Error).message;
      toast.error(msg || $_('admin.promptLibrary.toast.failedToLoad'));
    } finally {
      loading = false;
    }
  }

  function openCreateForm() {
    formMode = "create";
    editingPrompt = null;
    formOpen = true;
  }

  function openEditForm(prompt: RolePrompt) {
    formMode = "edit";
    editingPrompt = prompt;
    formOpen = true;
  }

  function openPreview(prompt: RolePrompt) {
    previewPrompt = prompt;
    previewOpen = true;
  }

  function confirmDelete(prompt: RolePrompt) {
    promptToDelete = prompt;
    deleteConfirmOpen = true;
  }

  async function handleFormSubmit(data: CreateRolePromptPayload) {
    try {
      if (formMode === "create") {
        await createRolePrompt(data);
        toast.success($_('admin.promptLibrary.toast.created'));
      } else if (editingPrompt) {
        await updateRolePrompt(editingPrompt.id, data);
        toast.success($_('admin.promptLibrary.toast.updated'));
      }
      await loadData();
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? getLocalizedError(err, "description", () => "")
          : (err as Error).message;
      toast.error(msg || $_('admin.promptLibrary.toast.failedToSave'));
      throw err;
    }
  }

  async function handleDelete() {
    if (!promptToDelete) return;
    isDeleting = true;
    try {
      await deleteRolePrompt(promptToDelete.id);
      toast.success($_('admin.promptLibrary.toast.deleted'));
      deleteConfirmOpen = false;
      promptToDelete = null;
      await loadData();
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? getLocalizedError(err, "description", () => "")
          : (err as Error).message;
      toast.error(msg || $_('admin.promptLibrary.toast.failedToDelete'));
    } finally {
      isDeleting = false;
    }
  }

  function clearFilters() {
    searchQuery = "";
    filterRoleId = "";
    filterSystem = "all";
  }

  function formatDate(dateStr: string): string {
    try {
      return new Date(dateStr).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateStr;
    }
  }

  function truncateText(text: string, max: number): string {
    if (text.length <= max) return text;
    return text.slice(0, max) + "...";
  }
</script>

<div class="prompt-library-container">
  <PageHeader title={$_('admin.promptLibrary.title')} subtitle={$_('admin.promptLibrary.subtitle')}>
    <button class="btn-primary" onclick={openCreateForm}>
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
      {$_('admin.promptLibrary.createPrompt')}
    </button>
  </PageHeader>

  <!-- Filters -->
  <div class="filters-bar">
    <div class="filter-row">
      <div class="filter-item search-box">
        <svg
          class="search-icon"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          placeholder={$_('admin.promptLibrary.searchPlaceholder')}
          bind:value={searchQuery}
        />
      </div>

      <div class="filter-item">
        <label for="filter-role" class="filter-label">{$_('admin.promptLibrary.columns.role')}</label>
        <select id="filter-role" class="filter-select" bind:value={filterRoleId}>
          <option value="">{$_('admin.promptLibrary.allRoles')}</option>
          {#each roles as role}
            <option value={role.id}>{role.name}</option>
          {/each}
        </select>
      </div>

      <div class="filter-item">
        <label for="filter-type" class="filter-label">{$_('admin.promptLibrary.columns.type')}</label>
        <select id="filter-type" class="filter-select" bind:value={filterSystem}>
          <option value="all">{$_('admin.promptLibrary.allTypes')}</option>
          <option value="system">{$_('admin.promptLibrary.systemType')}</option>
          <option value="user">{$_('admin.promptLibrary.userType')}</option>
        </select>
      </div>

      {#if searchQuery || filterRoleId || filterSystem !== "all"}
        <div class="filter-item filter-item--action">
          <button class="btn-clear-filters" onclick={clearFilters}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            {$_('admin.promptLibrary.clearFilters')}
          </button>
        </div>
      {/if}
    </div>
  </div>

  <!-- Content -->
  {#if loading}
    <LoadingSpinner text={$_('admin.promptLibrary.loading')} />
  {:else if filteredPrompts().length === 0}
    <AdminEmptyState
      title={searchQuery || filterRoleId || filterSystem !== "all"
        ? $_('admin.promptLibrary.noMatchTitle')
        : $_('admin.promptLibrary.noPromptsTitle')}
      message={searchQuery || filterRoleId || filterSystem !== "all"
        ? $_('admin.promptLibrary.noMatchMessage')
        : $_('admin.promptLibrary.noPromptsMessage')}
    >
      {#snippet icon()}
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      {/snippet}
      {#snippet actions()}
        {#if !(searchQuery || filterRoleId || filterSystem !== "all")}
          <button class="btn-primary" onclick={openCreateForm}>
            {$_('admin.promptLibrary.createPrompt')}
          </button>
        {/if}
      {/snippet}
    </AdminEmptyState>
  {:else}
    <AdminTableCard minWidth="900px">
      <table>
        <thead>
          <tr>
            <th>{$_('admin.promptLibrary.columns.name')}</th>
            <th>{$_('admin.promptLibrary.columns.role')}</th>
            <th>{$_('admin.promptLibrary.columns.type')}</th>
            <th>{$_('admin.promptLibrary.columns.variables')}</th>
            <th>{$_('admin.promptLibrary.columns.usage')}</th>
            <th>{$_('admin.promptLibrary.columns.updated')}</th>
            <th class="actions-col">{$_('admin.promptLibrary.columns.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {#each filteredPrompts() as prompt (prompt.id)}
            <tr>
              <td>
                <div class="prompt-name-cell">
                  <span class="prompt-name">{prompt.name}</span>
                  <span class="prompt-preview-text"
                    >{truncateText(prompt.prompt_text, 60)}</span
                  >
                </div>
              </td>
              <td>
                <span class="role-badge">
                  {roleMap[prompt.role_id] || $_('admin.promptLibrary.unknown')}
                </span>
              </td>
              <td>
                <span
                  class="type-pill {prompt.is_system ? 'system' : 'user'}"
                >
                  {prompt.is_system ? $_('admin.promptLibrary.systemType') : $_('admin.promptLibrary.userType')}
                </span>
              </td>
              <td>
                <div class="variables-cell">
                  {#if prompt.variables.length > 0}
                    {#each prompt.variables.slice(0, 3) as v}
                      <span class="var-tag">{v}</span>
                    {/each}
                    {#if prompt.variables.length > 3}
                      <span class="var-more"
                        >+{prompt.variables.length - 3}</span
                      >
                    {/if}
                  {:else}
                    <span class="no-vars">{$_('admin.promptLibrary.none')}</span>
                  {/if}
                </div>
              </td>
              <td>
                <span class="usage-count">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path d="M3 3v18h18" />
                    <path d="M18 17V9" />
                    <path d="M13 17V5" />
                    <path d="M8 17v-3" />
                  </svg>
                  {prompt.usage_count.toLocaleString()}
                </span>
              </td>
              <td>
                <span class="date-text">{formatDate(prompt.updated_at)}</span>
              </td>
              <td>
                <div class="action-buttons">
                  <button
                    class="action-btn preview"
                    onclick={() => openPreview(prompt)}
                    title={$_('admin.promptLibrary.previewPrompt')}
                    aria-label={$_('admin.promptLibrary.previewPrompt')}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  </button>
                  <button
                    class="action-btn edit"
                    onclick={() => openEditForm(prompt)}
                    title={$_('admin.promptLibrary.editPrompt')}
                    aria-label={$_('admin.promptLibrary.editPrompt')}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                  <button
                    class="action-btn delete"
                    onclick={() => confirmDelete(prompt)}
                    title={$_('admin.promptLibrary.deletePrompt')}
                    aria-label={$_('admin.promptLibrary.deletePrompt')}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </AdminTableCard>

    <div class="table-footer">
      <span class="result-count">
        {filteredPrompts().length} prompt{filteredPrompts().length !== 1 ? "s" : ""}
      </span>
    </div>
  {/if}
</div>

<!-- Create/Edit Modal -->
<PromptFormModal
  isOpen={formOpen}
  onClose={() => {
    formOpen = false;
    editingPrompt = null;
  }}
  onSubmit={handleFormSubmit}
  prompt={editingPrompt}
  {roles}
  mode={formMode}
/>

<!-- Preview Modal -->
<PromptPreviewModal
  bind:isOpen={previewOpen}
  onClose={() => {
    previewOpen = false;
    previewPrompt = null;
  }}
  prompt={previewPrompt}
/>

<!-- Delete Confirmation Modal -->
<Modal
  isOpen={deleteConfirmOpen}
  onclose={() => {
    deleteConfirmOpen = false;
    promptToDelete = null;
  }}
  title={$_('admin.promptLibrary.deletePrompt')}
>
  <div class="delete-confirm">
    <p>
      {$_('admin.promptLibrary.delete.confirmMessage')} <strong>{promptToDelete?.name}</strong>?
    </p>
    <p class="delete-warning">{$_('admin.promptLibrary.delete.warning')}</p>
    <div class="delete-actions">
      <button
        class="btn-secondary"
        onclick={() => {
          deleteConfirmOpen = false;
          promptToDelete = null;
        }}
        disabled={isDeleting}
      >
        {$_('common.cancel')}
      </button>
      <button
        class="btn-danger"
        onclick={handleDelete}
        disabled={isDeleting}
      >
        {isDeleting ? $_('admin.promptLibrary.delete.deleting') : $_('common.delete')}
      </button>
    </div>
  </div>
</Modal>

<style>
  .prompt-library-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    background: var(--bg-primary);
    padding: var(--space-3xl);
    overflow-y: auto;
  }

  /* Filters */
  .filters-bar {
    margin-bottom: var(--space-xl);
    padding: var(--space-lg);
    background: var(--button-bg);
    border: 1px solid var(--button-border);
    border-radius: var(--radius-md);
  }

  .filter-row {
    display: flex;
    align-items: flex-end;
    gap: 16px;
    flex-wrap: wrap;
  }

  .filter-item {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .filter-item--action {
    justify-content: flex-end;
    align-self: flex-end;
  }

  .filter-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .search-box {
    position: relative;
    flex: 1;
    min-width: 200px;
    max-width: 360px;
  }

  .search-icon {
    position: absolute;
    left: 12px;
    bottom: 10px;
    color: var(--text-secondary);
    pointer-events: none;
  }

  .search-box input {
    width: 100%;
    padding: 9px 12px 9px 36px;
    border: 1px solid var(--button-border);
    border-radius: var(--radius-sm);
    font-size: 14px;
    color: var(--text-primary);
    background: var(--bg-primary);
    transition: border-color 0.2s;
  }

  .search-box input:focus {
    outline: none;
    border-color: var(--brand);
    background: var(--btn-secondary);
  }

  .filter-select {
    padding: 9px 12px;
    border: 1px solid var(--button-border);
    border-radius: var(--radius-sm);
    font-size: 14px;
    color: var(--text-primary);
    background: var(--bg-primary);
    cursor: pointer;
    transition: border-color 0.2s;
    min-width: 160px;
  }

  .filter-select:focus {
    outline: none;
    border-color: var(--brand);
  }

  .btn-clear-filters {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 9px 14px;
    background: transparent;
    border: 1px solid var(--button-border);
    border-radius: var(--radius-sm);
    font-size: 13px;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-clear-filters:hover {
    color: var(--brand-red);
    border-color: color-mix(in oklab, var(--brand-red) 40%, transparent);
    background: color-mix(in oklab, var(--brand-red) 8%, var(--button-bg));
    transform: none;
    box-shadow: none;
  }

  /* Table cells */
  .prompt-name-cell {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .prompt-name {
    font-weight: 600;
    font-size: 14px;
    color: var(--text-primary);
  }

  .prompt-preview-text {
    font-size: 12px;
    color: var(--text-secondary);
    line-height: 1.4;
  }

  .role-badge {
    display: inline-flex;
    padding: 3px 10px;
    background: var(--btn-secondary);
    border: 1px solid var(--surface-border);
    border-radius: var(--radius-full);
    font-size: 12px;
    font-weight: 500;
    color: var(--text-primary);
  }

  .type-pill {
    display: inline-flex;
    align-items: center;
    padding: 3px 10px;
    border-radius: var(--radius-full);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  .type-pill.system {
    background: color-mix(in oklab, var(--brand) 15%, var(--button-bg));
    color: var(--brand);
    border: 1px solid color-mix(in oklab, var(--brand) 25%, transparent);
  }

  .type-pill.user {
    background: color-mix(in oklab, var(--brand-green) 15%, var(--button-bg));
    color: var(--brand-green);
    border: 1px solid color-mix(in oklab, var(--brand-green) 25%, transparent);
  }

  .variables-cell {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
  }

  .var-tag {
    display: inline-flex;
    padding: 2px 7px;
    background: color-mix(in oklab, var(--brand) 10%, var(--button-bg));
    border: 1px solid color-mix(in oklab, var(--brand) 20%, transparent);
    border-radius: 4px;
    font-size: 11px;
    font-family: monospace;
    color: var(--brand);
  }

  .var-more {
    font-size: 11px;
    color: var(--text-secondary);
    font-weight: 500;
  }

  .no-vars {
    font-size: 12px;
    color: var(--text-secondary);
    font-style: italic;
  }

  .usage-count {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-secondary);
  }

  .date-text {
    font-size: 13px;
    color: var(--text-secondary);
  }

  .actions-col {
    text-align: right !important;
    width: 120px;
  }

  .action-buttons {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
  }

  .action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.15s;
  }

  .action-btn:hover {
    transform: none;
    box-shadow: none;
  }

  .action-btn.preview:hover {
    background: color-mix(in oklab, var(--brand) 12%, var(--button-bg));
    color: var(--brand);
  }

  .action-btn.edit:hover {
    background: color-mix(in oklab, var(--brand) 12%, var(--button-bg));
    color: var(--brand);
  }

  .action-btn.delete:hover {
    background: color-mix(in oklab, var(--brand-red) 12%, var(--button-bg));
    color: var(--brand-red);
  }

  .table-footer {
    display: flex;
    justify-content: flex-end;
    padding: var(--space-md) 0;
  }

  .result-count {
    font-size: 13px;
    color: var(--text-secondary);
  }

  /* Delete confirmation */
  .delete-confirm {
    padding: 4px;
  }

  .delete-confirm p {
    font-size: 14px;
    color: var(--text-primary);
    margin: 0 0 8px 0;
    line-height: 1.6;
  }

  .delete-warning {
    font-size: 13px !important;
    color: var(--brand-red) !important;
  }

  .delete-actions {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
    margin-top: 24px;
    padding-top: 20px;
    border-top: 1px solid var(--glass-stroke-dark);
  }

  .btn-secondary {
    padding: 10px 20px;
    background: var(--button-bg);
    border: 1px solid var(--button-border);
    border-radius: var(--radius-sm);
    font-size: 14px;
    font-weight: 500;
    color: var(--text-primary);
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--btn-secondary);
    border-color: var(--glass-stroke-light);
    transform: none;
    box-shadow: none;
  }

  .btn-secondary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-danger {
    padding: 10px 20px;
    background: var(--brand-red);
    border: none;
    border-radius: var(--radius-sm);
    font-size: 14px;
    font-weight: 500;
    color: white;
    cursor: pointer;
    transition: background 0.2s;
  }

  .btn-danger:hover:not(:disabled) {
    background: color-mix(in oklab, var(--brand-red) 85%, black);
    transform: none;
    box-shadow: none;
  }

  .btn-danger:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-primary {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    background: var(--brand);
    border: none;
    border-radius: var(--radius-sm);
    font-size: 14px;
    font-weight: 600;
    color: white;
    cursor: pointer;
    transition: background 0.2s;
  }

  .btn-primary:hover {
    background: var(--brand-hover);
  }

  .btn-primary svg {
    flex-shrink: 0;
  }

  @media (max-width: 768px) {
    .prompt-library-container {
      padding: var(--space-xl);
    }

    .filter-row {
      flex-direction: column;
      align-items: stretch;
    }

    .search-box {
      max-width: none;
    }

    .filter-select {
      min-width: auto;
      width: 100%;
    }

    .filter-item--action {
      align-self: stretch;
    }

    .btn-clear-filters {
      width: 100%;
      justify-content: center;
    }
  }

  @media (max-width: 480px) {
    .prompt-library-container {
      padding: var(--space-lg);
    }
  }
</style>
