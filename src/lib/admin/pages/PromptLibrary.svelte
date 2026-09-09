<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { onMount } from "svelte";
  import { _ } from "svelte-i18n";
  import { navigate } from "svelte-routing";
  import PageHeader from "../components/PageHeader.svelte";
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
  import { setPageTitle } from "../../utils/pageTitle";

  $effect(() => {
    setPageTitle($_("admin.promptLibrary.title"));
  });

  // State
  let prompts = $state<RolePrompt[]>([]);
  let roles = $state<Role[]>([]);
  let loading = $state(true);
  let searchQuery = $state("");
  let filterRoleId = $state("");
  let filterSystem = $state<"all" | "system" | "user">("all");
  /** ".layout-toggles" choice — the design opens on the list. */
  let viewMode = $state<"grid" | "list">("list");
  /** ".rows-select" in the list footer. */
  let rowsPerPage = $state(10);
  let page = $state(1);

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

  let hasFilters = $derived(
    Boolean(searchQuery.trim()) ||
      Boolean(filterRoleId) ||
      filterSystem !== "all",
  );

  let filteredPrompts = $derived.by(() => {
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

  let totalPages = $derived(
    Math.max(1, Math.ceil(filteredPrompts.length / rowsPerPage)),
  );

  /** The list view pages; the grid, as in the design, shows every match. */
  let pagedPrompts = $derived(
    filteredPrompts.slice((page - 1) * rowsPerPage, page * rowsPerPage),
  );

  /** ".pr-count" — "5 prompts". */
  let countLabel = $derived(
    $_(
      filteredPrompts.length === 1
        ? "admin.promptLibrary.countOne"
        : "admin.promptLibrary.countOther",
      { values: { count: filteredPrompts.length } },
    ),
  );

  /** ".footer-count" — "5 of 5 prompts". */
  let footerLabel = $derived(
    $_("admin.promptLibrary.footerCount", {
      values: { shown: filteredPrompts.length, total: prompts.length },
    }),
  );

  // A narrowed filter can leave the cursor past the last page.
  $effect(() => {
    if (page > totalPages) page = totalPages;
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
      toast.error(msg || $_("admin.promptLibrary.toast.failedToLoad"));
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
        toast.success($_("admin.promptLibrary.toast.created"));
      } else if (editingPrompt) {
        await updateRolePrompt(editingPrompt.id, data);
        toast.success($_("admin.promptLibrary.toast.updated"));
      }
      await loadData();
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? getLocalizedError(err, "description", () => "")
          : (err as Error).message;
      toast.error(msg || $_("admin.promptLibrary.toast.failedToSave"));
      throw err;
    }
  }

  async function handleDelete() {
    if (!promptToDelete) return;
    isDeleting = true;
    try {
      await deleteRolePrompt(promptToDelete.id);
      toast.success($_("admin.promptLibrary.toast.deleted"));
      deleteConfirmOpen = false;
      promptToDelete = null;
      await loadData();
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? getLocalizedError(err, "description", () => "")
          : (err as Error).message;
      toast.error(msg || $_("admin.promptLibrary.toast.failedToDelete"));
    } finally {
      isDeleting = false;
    }
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

  function usesLabel(count: number): string {
    return $_(
      count === 1
        ? "admin.promptLibrary.usesOne"
        : "admin.promptLibrary.usesOther",
      { values: { count: count.toLocaleString() } },
    );
  }
</script>

<!-- ===== prompts.html ".main", transcribed ===== -->
<div class="prompt-library-container">
  <PageHeader
    title={$_("admin.promptLibrary.title")}
    subtitle={$_("admin.promptLibrary.subtitle")}
  >
    {#snippet children()}
      <button class="cta-btn" type="button" onclick={openCreateForm}>
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          aria-hidden="true"
        >
          <path d="M7 2v10M2 7h10" stroke="currentColor" stroke-width="1.6" />
        </svg>
        <span>{$_("admin.promptLibrary.createPrompt")}</span>
      </button>
    {/snippet}
  </PageHeader>

  <!-- ".filter-card" — search, then the role and type selects. -->
  <div class="filter-card">
    <div class="filter-field filter-field--grow">
      <label class="filter-field-label" for="prompt-search">
        {$_("admin.promptLibrary.searchLabel")}
      </label>
      <div class="filter-input">
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
            r="5"
            stroke="currentColor"
            stroke-width="1.3"
          />
          <path d="m13 13-2.3-2.3" stroke="currentColor" stroke-width="1.3" />
        </svg>
        <input
          id="prompt-search"
          type="text"
          bind:value={searchQuery}
          placeholder={$_("admin.promptLibrary.searchPlaceholder")}
        />
      </div>
    </div>

    <div class="filter-field filter-field--fixed">
      <label class="filter-field-label" for="filter-role">
        {$_("admin.promptLibrary.columns.role")}
      </label>
      <div class="filter-select">
        <select id="filter-role" bind:value={filterRoleId}>
          <option value="">{$_("admin.promptLibrary.allRoles")}</option>
          {#each roles as role (role.id)}
            <option value={role.id}>{role.name}</option>
          {/each}
        </select>
        <svg
          width="8"
          height="4"
          viewBox="0 0 8 4"
          fill="none"
          aria-hidden="true"
        >
          <path d="M0 0l4 4 4-4" stroke="currentColor" stroke-width="1.2" />
        </svg>
      </div>
    </div>

    <div class="filter-field filter-field--fixed">
      <label class="filter-field-label" for="filter-type">
        {$_("admin.promptLibrary.columns.type")}
      </label>
      <div class="filter-select">
        <select id="filter-type" bind:value={filterSystem}>
          <option value="all">{$_("admin.promptLibrary.allTypes")}</option>
          <option value="system">{$_("admin.promptLibrary.systemType")}</option>
          <option value="user">{$_("admin.promptLibrary.userType")}</option>
        </select>
        <svg
          width="8"
          height="4"
          viewBox="0 0 8 4"
          fill="none"
          aria-hidden="true"
        >
          <path d="M0 0l4 4 4-4" stroke="currentColor" stroke-width="1.2" />
        </svg>
      </div>
    </div>
  </div>

  <!-- ".pr-toolbar" — the match count on the left, the list/grid choice right. -->
  <div class="pr-toolbar">
    <span class="pr-count">{loading ? "—" : countLabel}</span>
    <div
      class="layout-toggles"
      role="group"
      aria-label={$_("admin.promptLibrary.viewModeLabel")}
    >
      <button
        class="grid-toggle"
        type="button"
        aria-pressed={viewMode === "grid"}
        onclick={() => (viewMode = "grid")}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          aria-hidden="true"
        >
          <rect
            x="1.75"
            y="1.75"
            width="4.5"
            height="4.5"
            rx="1"
            stroke="currentColor"
            stroke-width="1.4"
          />
          <rect
            x="7.75"
            y="1.75"
            width="4.5"
            height="4.5"
            rx="1"
            stroke="currentColor"
            stroke-width="1.4"
          />
          <rect
            x="1.75"
            y="7.75"
            width="4.5"
            height="4.5"
            rx="1"
            stroke="currentColor"
            stroke-width="1.4"
          />
          <rect
            x="7.75"
            y="7.75"
            width="4.5"
            height="4.5"
            rx="1"
            stroke="currentColor"
            stroke-width="1.4"
          />
        </svg>
        <span>{$_("admin.promptLibrary.viewGrid")}</span>
      </button>
      <button
        class="grid-toggle"
        type="button"
        aria-pressed={viewMode === "list"}
        onclick={() => (viewMode = "list")}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M1.75 3.5h10.5M1.75 7h10.5M1.75 10.5h10.5"
            stroke="currentColor"
            stroke-width="1.4"
          />
        </svg>
        <span>{$_("admin.promptLibrary.viewList")}</span>
      </button>
    </div>
  </div>

  {#if loading}
    <!-- ".list-table-card" placeholder while the library loads. -->
    <div
      class="list-table-card"
      aria-busy="true"
      aria-label={$_("admin.promptLibrary.loading")}
    >
      {#each [[42, 70], [36, 58], [48, 64]] as [top, bottom] (top)}
        <div class="table-row skel-row">
          <div class="row-name-group">
            <span class="skel-box skel-line" style="width:{top}%"></span>
            <span
              class="skel-box skel-line skel-line--sm"
              style="width:{bottom}%"
            ></span>
          </div>
          <div class="col-role"><span class="skel-box skel-pill"></span></div>
          <div class="col-type"><span class="skel-box skel-pill"></span></div>
          <div class="var-chips">
            <span class="skel-box skel-pill"></span>
            <span class="skel-box skel-pill"></span>
          </div>
          <div class="usage-val">
            <span class="skel-box skel-line skel-line--sm" style="width:60%"
            ></span>
          </div>
          <div class="updated-val">
            <span class="skel-box skel-line skel-line--sm" style="width:80%"
            ></span>
          </div>
          <div class="row-actions">
            <span class="skel-box skel-square"></span>
            <span class="skel-box skel-square"></span>
            <span class="skel-box skel-square"></span>
          </div>
        </div>
      {/each}
    </div>
  {:else if filteredPrompts.length === 0}
    <!-- ".empty-hint" -->
    <div class="empty-hint">
      <span>
        {hasFilters
          ? $_("admin.promptLibrary.noResults")
          : $_("admin.promptLibrary.noPromptsMessage")}
      </span>
      {#if !hasFilters}
        <button class="cta-btn" type="button" onclick={openCreateForm}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            aria-hidden="true"
          >
            <path d="M7 2v10M2 7h10" stroke="currentColor" stroke-width="1.6" />
          </svg>
          <span>{$_("admin.promptLibrary.createPrompt")}</span>
        </button>
      {/if}
    </div>
  {:else if viewMode === "list"}
    <!-- ===== ".list-table-card" ===== -->
    <div class="list-table-card">
      <div class="table-header">
        <span class="col-name"></span>
        <span class="col-role">{$_("admin.promptLibrary.columns.role")}</span>
        <span class="col-type">{$_("admin.promptLibrary.columns.type")}</span>
        <span class="col-vars"
          >{$_("admin.promptLibrary.columns.variables")}</span
        >
        <span class="col-usage">{$_("admin.promptLibrary.columns.usage")}</span>
        <span class="col-updated"
          >{$_("admin.promptLibrary.columns.updated")}</span
        >
        <span class="col-actions"
          >{$_("admin.promptLibrary.columns.actions")}</span
        >
      </div>

      {#each pagedPrompts as prompt (prompt.id)}
        <div class="table-row">
          <div class="row-name-group">
            <span class="row-title">{prompt.name}</span>
            <span class="row-desc">{prompt.prompt_text}</span>
          </div>
          <div class="col-role">
            <span class="badge-pill badge-role">
              {roleMap[prompt.role_id] || $_("admin.promptLibrary.unknown")}
            </span>
          </div>
          <div class="col-type">
            <span class="badge-pill badge-type">
              {prompt.is_system
                ? $_("admin.promptLibrary.systemType")
                : $_("admin.promptLibrary.userType")}
            </span>
          </div>
          <div class="var-chips">
            {#if prompt.variables.length > 0}
              {#each prompt.variables.slice(0, 3) as v (v)}
                <span class="var-chip">{v}</span>
              {/each}
              {#if prompt.variables.length > 3}
                <span class="var-chip var-chip--more"
                  >+{prompt.variables.length - 3}</span
                >
              {/if}
            {:else}
              <span class="no-vars">{$_("admin.promptLibrary.none")}</span>
            {/if}
          </div>
          <button
            class="usage-val"
            type="button"
            onclick={() =>
              navigate(`/admin/prompt-effectiveness?prompt_id=${prompt.id}`)}
            title={$_("admin.promptLibrary.viewEffectiveness")}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M2 12V6M7 12V2M12 12V8"
                stroke="currentColor"
                stroke-width="1.4"
              />
            </svg>
            {prompt.usage_count.toLocaleString()}
          </button>
          <div class="updated-val">{formatDate(prompt.updated_at)}</div>
          <div class="row-actions">
            <button
              class="action-icon-btn"
              type="button"
              onclick={() => openPreview(prompt)}
              title={$_("admin.promptLibrary.previewPrompt")}
              aria-label={$_("admin.promptLibrary.previewPrompt")}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M1 7s2-4.2 6-4.2S13 7 13 7s-2 4.2-6 4.2S1 7 1 7z"
                  stroke="currentColor"
                  stroke-width="1.1"
                  fill="none"
                  stroke-linejoin="round"
                />
                <circle
                  cx="7"
                  cy="7"
                  r="1.6"
                  stroke="currentColor"
                  stroke-width="1.1"
                />
              </svg>
            </button>
            <button
              class="action-icon-btn"
              type="button"
              onclick={() => openEditForm(prompt)}
              title={$_("admin.promptLibrary.editPrompt")}
              aria-label={$_("admin.promptLibrary.editPrompt")}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M8.5 1.5 11 4 4 11H1.5V8.5z"
                  stroke="currentColor"
                  stroke-width="1.1"
                  fill="none"
                  stroke-linejoin="round"
                />
              </svg>
            </button>
            <button
              class="action-icon-btn action-icon-btn--danger"
              type="button"
              onclick={() => confirmDelete(prompt)}
              title={$_("admin.promptLibrary.deletePrompt")}
              aria-label={$_("admin.promptLibrary.deletePrompt")}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M2.5 3.5h9M5.5 3.5V2h3v1.5M4 3.5 4.5 12h5l.5-8.5"
                  stroke="currentColor"
                  stroke-width="1.1"
                  fill="none"
                />
              </svg>
            </button>
          </div>
        </div>
      {/each}

      <div class="table-footer">
        <div class="rows-per-page">
          <label for="prompt-rows-per-page">
            {$_("admin.promptLibrary.rowsPerPage")}
          </label>
          <div class="rows-select">
            <select
              id="prompt-rows-per-page"
              value={rowsPerPage}
              onchange={(e) => {
                rowsPerPage = Number(
                  (e.currentTarget as HTMLSelectElement).value,
                );
                page = 1;
              }}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
            <svg
              width="7"
              height="4"
              viewBox="0 0 8 4"
              fill="none"
              aria-hidden="true"
            >
              <path d="M0 0l4 4 4-4" stroke="currentColor" stroke-width="1.2" />
            </svg>
          </div>
        </div>
        <div class="footer-right">
          {#if totalPages > 1}
            <nav class="pager" aria-label={$_("admin.common.pagination")}>
              <button
                class="action-icon-btn"
                type="button"
                disabled={page <= 1}
                onclick={() => (page -= 1)}
                aria-label={$_("admin.common.previousPage")}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M8.5 2.5 4.5 7l4 4.5"
                    stroke="currentColor"
                    stroke-width="1.3"
                    fill="none"
                  />
                </svg>
              </button>
              <button
                class="action-icon-btn"
                type="button"
                disabled={page >= totalPages}
                onclick={() => (page += 1)}
                aria-label={$_("admin.common.nextPage")}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M5.5 2.5 9.5 7l-4 4.5"
                    stroke="currentColor"
                    stroke-width="1.3"
                    fill="none"
                  />
                </svg>
              </button>
            </nav>
          {/if}
          <span class="footer-count">{footerLabel}</span>
        </div>
      </div>
    </div>
  {:else}
    <!-- ===== ".prompt-grid" ===== -->
    <div class="prompt-grid">
      {#each filteredPrompts as prompt (prompt.id)}
        <div class="prompt-card">
          <div class="card-upper">
            <div class="card-header-row">
              <span class="card-title">{prompt.name}</span>
              <div class="card-badges">
                <span class="badge-pill badge-role">
                  {roleMap[prompt.role_id] || $_("admin.promptLibrary.unknown")}
                </span>
                <span class="badge-pill badge-type">
                  {prompt.is_system
                    ? $_("admin.promptLibrary.systemType")
                    : $_("admin.promptLibrary.userType")}
                </span>
              </div>
            </div>
            <p class="card-desc">{prompt.prompt_text}</p>
            {#if prompt.variables.length > 0}
              <div class="card-vars">
                {#each prompt.variables as v (v)}
                  <span class="var-chip">{v}</span>
                {/each}
              </div>
            {/if}
          </div>
          <div class="card-footer">
            <div class="card-footer-left">
              <button
                class="card-usage"
                type="button"
                onclick={() =>
                  navigate(
                    `/admin/prompt-effectiveness?prompt_id=${prompt.id}`,
                  )}
                title={$_("admin.promptLibrary.viewEffectiveness")}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M2 12V6M7 12V2M12 12V8"
                    stroke="currentColor"
                    stroke-width="1.4"
                  />
                </svg>
                {usesLabel(prompt.usage_count)}
              </button>
              <span class="card-updated">
                <span aria-hidden="true">•</span>
                <span>
                  {$_("admin.promptLibrary.updatedOn", {
                    values: { date: formatDate(prompt.updated_at) },
                  })}
                </span>
              </span>
            </div>
            <div class="card-footer-actions">
              <button
                class="action-icon-btn"
                type="button"
                onclick={() => openPreview(prompt)}
                title={$_("admin.promptLibrary.previewPrompt")}
                aria-label={$_("admin.promptLibrary.previewPrompt")}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M1 7s2-4.2 6-4.2S13 7 13 7s-2 4.2-6 4.2S1 7 1 7z"
                    stroke="currentColor"
                    stroke-width="1.1"
                    fill="none"
                    stroke-linejoin="round"
                  />
                  <circle
                    cx="7"
                    cy="7"
                    r="1.6"
                    stroke="currentColor"
                    stroke-width="1.1"
                  />
                </svg>
              </button>
              <button
                class="action-icon-btn"
                type="button"
                onclick={() => openEditForm(prompt)}
                title={$_("admin.promptLibrary.editPrompt")}
                aria-label={$_("admin.promptLibrary.editPrompt")}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M8.5 1.5 11 4 4 11H1.5V8.5z"
                    stroke="currentColor"
                    stroke-width="1.1"
                    fill="none"
                    stroke-linejoin="round"
                  />
                </svg>
              </button>
              <button
                class="action-icon-btn action-icon-btn--danger"
                type="button"
                onclick={() => confirmDelete(prompt)}
                title={$_("admin.promptLibrary.deletePrompt")}
                aria-label={$_("admin.promptLibrary.deletePrompt")}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M2.5 3.5h9M5.5 3.5V2h3v1.5M4 3.5 4.5 12h5l.5-8.5"
                    stroke="currentColor"
                    stroke-width="1.1"
                    fill="none"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      {/each}
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
  roleName={previewPrompt ? roleMap[previewPrompt.role_id] : undefined}
/>

<!-- Delete Confirmation Modal -->
<Modal
  isOpen={deleteConfirmOpen}
  onclose={() => {
    deleteConfirmOpen = false;
    promptToDelete = null;
  }}
  title={$_("admin.promptLibrary.deletePrompt")}
  variant="prompts"
>
  {#snippet headerIcon()}
    <span class="pr-header-icon" aria-hidden="true">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path
          d="M3.5 5.5h13M7.5 5.5V3.2h5v2.3M5.5 5.5 6.3 17.5h7.4l.8-12"
          stroke="currentColor"
          stroke-width="1.3"
          fill="none"
          stroke-linejoin="round"
        />
      </svg>
    </span>
  {/snippet}

  <div class="delete-confirm">
    <p>
      {$_("admin.promptLibrary.delete.confirmMessage")}
      <strong>{promptToDelete?.name}</strong>?
    </p>
    <p class="delete-warning">{$_("admin.promptLibrary.delete.warning")}</p>
  </div>

  {#snippet footer()}
    <button
      class="pr-btn-cancel"
      type="button"
      onclick={() => {
        deleteConfirmOpen = false;
        promptToDelete = null;
      }}
      disabled={isDeleting}
    >
      {$_("common.cancel")}
    </button>
    <button
      class="pr-btn-danger"
      type="button"
      onclick={handleDelete}
      disabled={isDeleting}
    >
      {isDeleting
        ? $_("admin.promptLibrary.delete.deleting")
        : $_("common.delete")}
    </button>
  {/snippet}
</Modal>

<style>
  /* ===== prompts.html, transcribed. Every design value maps to a --gx-* token
     (see the "Prompts" note in app.css); only the dialog shadow was new. ===== */

  /* app.css paints every bare <button>/<input>/<select> as a glass pill —
     padding, a fill, a radius, an inset shadow, a lift on hover. Every control
     below is flat, so strip that once here and let each rule paint its own
     skin. */
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
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  button:hover,
  button:active {
    transform: none;
    box-shadow: none;
    background: none;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  input,
  select {
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

  input:focus,
  select:focus {
    background: transparent;
    box-shadow: none;
  }

  /* ".main" */
  .prompt-library-container {
    display: flex;
    flex-direction: column;
    gap: 24px;
    height: 100%;
    width: 100%;
    background: var(--gx-page);
    padding: 32px;
    overflow-y: auto;
    font-family: var(--gx-font);
  }

  /* The design spaces the header from the filter card with the column gap. */
  .prompt-library-container :global(.page-header) {
    padding-bottom: 0;
  }

  /* ".cta-btn" — the design's 37px primary action. */
  .cta-btn {
    height: 37px;
    border-radius: 8px;
    background: var(--gx-org-primary-500);
    display: flex;
    gap: 8px;
    padding: 10px 16px;
    align-items: center;
    flex-shrink: 0;
    font-weight: 600;
    font-size: 14px;
    line-height: 100%;
    color: #fff;
    white-space: nowrap;
    transition: background-color 120ms ease;
  }

  .cta-btn:hover {
    background: var(--gx-ac-cta-hover);
  }

  .cta-btn:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
  }

  .cta-btn svg {
    display: block;
    flex-shrink: 0;
  }

  /* ---------------- ".filter-card" ---------------- */
  .filter-card {
    border-radius: 16px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-an-chip-ring);
    display: flex;
    gap: 16px;
    padding: 20px;
    align-self: stretch;
    flex-shrink: 0;
    flex-wrap: wrap;
  }

  .filter-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  .filter-field--grow {
    flex: 1 1 240px;
  }

  .filter-field--fixed {
    width: 240px;
    flex-shrink: 0;
  }

  .filter-field-label {
    font-weight: 700;
    font-size: 11px;
    line-height: 100%;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: var(--gx-an-sub);
  }

  .filter-input,
  .filter-select {
    height: 37px;
    border-radius: 8px;
    box-shadow: inset 0 0 0 1px var(--gx-an-chip-ring);
    display: flex;
    gap: 10px;
    padding: 0 14px;
    align-items: center;
    font-weight: 400;
    font-size: 14px;
    color: var(--gx-an-strong);
    box-sizing: border-box;
  }

  .filter-input {
    background: var(--gx-an-field-bg);
    color: var(--gx-org-slate-350);
  }

  .filter-input:focus-within,
  .filter-select:focus-within {
    box-shadow: inset 0 0 0 1px var(--gx-org-primary-500);
  }

  .filter-input svg {
    display: block;
    flex-shrink: 0;
  }

  .filter-input input {
    flex-grow: 1;
    min-width: 0;
    font-size: 14px;
    color: var(--gx-an-strong);
  }

  .filter-input input::placeholder {
    color: var(--gx-org-slate-350);
    opacity: 1;
  }

  /* The design draws its own chevron, so the native one is suppressed. */
  .filter-select {
    position: relative;
    background: var(--gx-card);
    padding-inline-end: 32px;
    color: var(--gx-an-sub);
  }

  .filter-select select,
  .filter-select select:focus {
    appearance: none;
    -webkit-appearance: none;
    width: 100%;
    height: 100%;
    font-size: 14px;
    color: var(--gx-an-strong);
    cursor: pointer;
  }

  .filter-select > svg {
    position: absolute;
    inset-inline-end: 14px;
    pointer-events: none;
    display: block;
  }

  /* ---------------- ".pr-toolbar" ---------------- */
  .pr-toolbar {
    min-height: 31px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    align-self: stretch;
    flex-shrink: 0;
    gap: 16px;
    flex-wrap: wrap;
  }

  .pr-count {
    font-weight: 400;
    font-size: 14px;
    line-height: 100%;
    color: var(--gx-an-sub);
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
    display: flex;
    gap: 6px;
    padding: 6px 12px;
    align-items: center;
    font-weight: 600;
    font-size: 12px;
    line-height: 100%;
    color: var(--gx-an-sub);
    white-space: nowrap;
    box-sizing: border-box;
    transition:
      background-color 120ms ease,
      color 120ms ease,
      box-shadow 120ms ease;
  }

  .grid-toggle svg {
    display: block;
    flex-shrink: 0;
  }

  .grid-toggle[aria-pressed="true"] {
    background: var(--gx-card);
    box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.051);
    color: var(--gx-org-primary-500);
  }

  .grid-toggle:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
  }

  /* ---------------- ".list-table-card" ---------------- */
  .list-table-card {
    border-radius: 16px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-an-chip-ring);
    align-self: stretch;
    overflow: hidden;
  }

  .table-header {
    min-height: 37px;
    background: var(--gx-an-field-bg);
    border-bottom: 1px solid var(--gx-an-chip-ring);
    display: flex;
    gap: 16px;
    padding: 12px 20px;
    align-items: center;
  }

  .table-header span {
    font-weight: 700;
    font-size: 11px;
    line-height: 100%;
    letter-spacing: 0.4px;
    text-transform: uppercase;
    color: var(--gx-an-sub);
  }

  .table-row {
    min-height: 86px;
    padding: 16px 20px;
    display: flex;
    gap: 16px;
    align-items: center;
    border-top: 1px solid var(--gx-an-chip-ring);
  }

  /* The header already rules the first row off. */
  .table-header + .table-row {
    border-top: 0;
  }

  /* Column widths, shared by the header and every row. */
  .col-name,
  .row-name-group {
    flex-grow: 1;
    min-width: 0;
  }

  .col-role,
  .col-type {
    width: 80px;
    flex-shrink: 0;
  }

  .col-vars,
  .var-chips {
    width: 190px;
    flex-shrink: 0;
  }

  .col-usage,
  .usage-val {
    width: 80px;
    flex-shrink: 0;
  }

  .col-updated,
  .updated-val {
    width: 100px;
    flex-shrink: 0;
  }

  .col-actions,
  .row-actions {
    width: 108px;
    flex-shrink: 0;
  }

  .col-actions {
    text-align: end;
  }

  .row-name-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .row-title {
    font-weight: 600;
    font-size: 15px;
    line-height: 100%;
    color: var(--gx-an-strong);
  }

  .row-desc {
    font-weight: 400;
    font-size: 13px;
    line-height: 1.4;
    color: var(--gx-an-sub);
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .badge-pill {
    border-radius: 999px;
    padding: 4px 10px;
    font-weight: 600;
    font-size: 12px;
    line-height: 100%;
    display: inline-flex;
    white-space: nowrap;
  }

  .badge-role {
    background: var(--gx-an-insight-bg);
    color: var(--gx-an-chip-fg);
  }

  .badge-type {
    background: var(--gx-blue-soft);
    color: var(--gx-ac-system-fg);
  }

  .var-chips {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    align-items: center;
  }

  .var-chip {
    border-radius: 999px;
    background: var(--gx-blue-soft);
    padding: 3px 9px;
    font-family: var(--gx-mono, ui-monospace, "SF Mono", Menlo, monospace);
    font-weight: 500;
    font-size: 11px;
    line-height: 100%;
    color: var(--gx-tx-chip-icon-fg);
    white-space: nowrap;
  }

  .var-chip--more {
    background: var(--gx-an-insight-bg);
    color: var(--gx-an-chip-fg);
  }

  .no-vars {
    font-weight: 400;
    font-style: italic;
    font-size: 12px;
    color: var(--gx-org-slate-350);
  }

  /* The usage figure doubles as the link into Prompt Metrics. */
  .usage-val {
    display: flex;
    gap: 6px;
    align-items: center;
    font-weight: 600;
    font-size: 14px;
    line-height: 100%;
    color: var(--gx-an-strong);
    border-radius: 6px;
    transition: color 120ms ease;
  }

  .usage-val svg {
    display: block;
    color: var(--gx-tx-chip-icon-fg);
    flex-shrink: 0;
  }

  .usage-val:hover {
    color: var(--gx-tx-chip-icon-fg);
    text-decoration: underline;
  }

  .usage-val:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
  }

  .updated-val {
    font-weight: 400;
    font-size: 14px;
    line-height: 100%;
    color: var(--gx-an-sub);
  }

  .row-actions {
    display: flex;
    gap: 6px;
    justify-content: flex-end;
  }

  .action-icon-btn {
    width: 30px;
    height: 30px;
    border-radius: 6px;
    background: var(--gx-an-field-bg);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--gx-an-sub);
    flex-shrink: 0;
    transition:
      background-color 120ms ease,
      color 120ms ease;
  }

  .action-icon-btn:hover:not(:disabled) {
    background: var(--gx-sk-m-seg-bg);
  }

  /* Delete carries its danger tint at rest, ringed and red-glyphed. */
  .action-icon-btn--danger {
    background: var(--gx-org-danger-bg);
    box-shadow: inset 0 0 0 1px var(--gx-pr-danger-ring);
    color: var(--gx-org-danger);
  }

  .action-icon-btn--danger:hover:not(:disabled) {
    background: var(--gx-org-danger-line);
    color: var(--gx-org-danger);
  }

  .action-icon-btn:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
  }

  .action-icon-btn svg {
    display: block;
  }

  /* ".table-footer" — rows-per-page on the left, the tally on the right. */
  .table-footer {
    min-height: 65px;
    border-top: 1px solid var(--gx-an-chip-ring);
    display: flex;
    padding: 20px;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
  }

  .rows-per-page {
    display: flex;
    gap: 8px;
    align-items: center;
    font-weight: 400;
    font-size: 14px;
    line-height: 100%;
    color: var(--gx-an-sub);
  }

  .rows-select {
    position: relative;
    border-radius: 6px;
    box-shadow: inset 0 0 0 1px var(--gx-an-chip-ring);
    background: var(--gx-card);
    display: flex;
    align-items: center;
    padding: 4px 22px 4px 8px;
    color: var(--gx-an-sub);
  }

  .rows-select select,
  .rows-select select:focus {
    appearance: none;
    -webkit-appearance: none;
    font-weight: 500;
    font-size: 14px;
    color: var(--gx-an-strong);
    cursor: pointer;
  }

  .rows-select > svg {
    position: absolute;
    inset-inline-end: 8px;
    pointer-events: none;
    display: block;
  }

  .footer-right {
    display: flex;
    gap: 12px;
    align-items: center;
  }

  .pager {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .footer-count {
    font-weight: 400;
    font-size: 14px;
    line-height: 100%;
    color: var(--gx-an-sub);
  }

  /* ---------------- ".prompt-grid" ---------------- */
  /* A grid rather than a wrapping flex row: a short last row keeps the same
     column width as the rows above it instead of stretching to fill. */
  .prompt-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 20px;
    align-self: stretch;
  }

  .prompt-card {
    min-width: 0;
    border-radius: 16px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-an-chip-ring);
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }

  .card-upper {
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
  }

  .card-header-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .card-title {
    font-weight: 700;
    font-size: 16px;
    line-height: 100%;
    color: var(--gx-an-strong);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .card-badges {
    display: flex;
    gap: 6px;
    align-items: center;
    flex-shrink: 0;
  }

  .card-badges .badge-pill {
    padding: 3px 8px;
    font-size: 11px;
  }

  .card-desc {
    margin: 0;
    font-weight: 400;
    font-size: 13px;
    line-height: 1.4;
    color: var(--gx-an-sub);
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .card-vars {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  /* The actions stay pinned to the end of the row: the meta line beside them
     is what gives way, wrapping inside its own group when the card is too
     narrow to hold both. */
  .card-footer {
    border-top: 1px solid var(--gx-an-chip-ring);
    padding: 12px 15px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    flex-wrap: nowrap;
  }

  .card-footer-left {
    display: flex;
    gap: 12px;
    row-gap: 6px;
    align-items: center;
    flex-wrap: wrap;
    min-width: 0;
    font-weight: 400;
    font-size: 12px;
    line-height: 100%;
    color: var(--gx-an-sub);
  }

  /* The bullet travels with the date so it never starts a wrapped line. */
  .card-updated {
    display: flex;
    gap: 12px;
    align-items: center;
    white-space: nowrap;
  }

  .card-usage {
    display: flex;
    gap: 4px;
    align-items: center;
    font-weight: 600;
    font-size: 12px;
    line-height: 100%;
    color: var(--gx-an-strong);
    border-radius: 6px;
    transition: color 120ms ease;
  }

  .card-usage svg {
    display: block;
    color: var(--gx-tx-chip-icon-fg);
    flex-shrink: 0;
  }

  .card-usage:hover {
    color: var(--gx-tx-chip-icon-fg);
    text-decoration: underline;
  }

  .card-usage:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
  }

  .card-footer-actions {
    display: flex;
    gap: 6px;
  }

  /* ---------------- ".empty-hint" ---------------- */
  .empty-hint {
    align-self: stretch;
    display: flex;
    flex-direction: column;
    gap: 16px;
    align-items: center;
    text-align: center;
    padding: 32px;
    font-weight: 500;
    font-size: 13px;
    color: var(--gx-an-sub);
  }

  /* ---------------- loading placeholder ---------------- */
  .skel-row {
    align-items: center;
  }

  .skel-box {
    display: block;
    border-radius: 6px;
    background: linear-gradient(
      90deg,
      var(--gx-mcp-skel-a),
      var(--gx-mcp-skel-b),
      var(--gx-mcp-skel-a)
    );
    background-size: 200% 100%;
    animation: skelShimmer 1.3s ease-in-out infinite;
  }

  @keyframes skelShimmer {
    0% {
      background-position: 100% 0;
    }
    100% {
      background-position: -100% 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .skel-box {
      animation: none;
    }
  }

  .skel-line {
    height: 12px;
  }

  .skel-line--sm {
    height: 10px;
  }

  .skel-pill {
    width: 64px;
    height: 18px;
    border-radius: 999px;
  }

  .skel-square {
    width: 30px;
    height: 30px;
  }

  /* ---------------- delete dialog ---------------- */
  .pr-header-icon {
    width: 40px;
    height: 40px;
    border-radius: 12px;
    background: var(--gx-org-kpi-icon-bg);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--gx-tools-badge);
    flex-shrink: 0;
  }

  .delete-confirm p {
    margin: 0 0 8px 0;
    font-size: 14px;
    line-height: 1.6;
    color: var(--gx-slate-900);
  }

  .delete-warning {
    font-size: 13px;
    color: var(--gx-org-danger);
  }

  .pr-btn-cancel,
  .pr-btn-danger {
    height: 39px;
    border-radius: 10px;
    padding: 0 18px;
    display: flex;
    align-items: center;
    font-weight: 600;
    font-size: 14px;
    line-height: 100%;
    flex-shrink: 0;
    transition:
      background-color 120ms ease,
      filter 120ms ease;
  }

  .pr-btn-cancel {
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    color: var(--gx-ac-slate-600);
  }

  .pr-btn-cancel:hover:not(:disabled) {
    background: var(--gx-page);
  }

  .pr-btn-danger {
    background: var(--gx-org-danger);
    color: #fff;
  }

  .pr-btn-danger:hover:not(:disabled) {
    background: var(--gx-org-danger-hover);
  }

  .pr-btn-cancel:focus-visible,
  .pr-btn-danger:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
  }

  /* ---------------- narrow viewports ---------------- */
  @media (max-width: 1100px) {
    /* The seven-column row cannot hold its widths below the design's 1440;
       the header labels go with it and every cell states its own value. */
    .table-header {
      display: none;
    }

    .table-row {
      flex-wrap: wrap;
      gap: 12px;
    }

    .row-name-group {
      flex: 1 1 100%;
    }

    .col-vars,
    .var-chips {
      width: auto;
    }

    .row-actions {
      margin-inline-start: auto;
    }
  }

  @media (max-width: 768px) {
    .prompt-library-container {
      padding: 20px;
      gap: 20px;
    }

    .filter-field--fixed {
      width: 100%;
    }
  }
</style>
