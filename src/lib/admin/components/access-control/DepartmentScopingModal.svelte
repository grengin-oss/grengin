<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import type { Role } from "../../../api/admin/roles.js";
  import type { Department, RoleUserAssignment, User } from "../../types.js";
  import LoadingSpinner from "../LoadingSpinner.svelte";
  import Modal from "../Modal.svelte";
  import { toast } from "../../../components/Toaster.svelte";
  import { ApiError } from "../../../api/client.js";
  import { getLocalizedError } from "../../../utils/errorLocalization.js";
  import { _ } from "svelte-i18n";
  import { tick } from "svelte";
  import {
    getDepartments,
    getDepartment,
  } from "../../../api/admin/departments.js";
  import * as rolesApi from "../../../api/admin/roles.js";

  interface Props {
    role: Role | null;
    user: User | null;
    isOpen: boolean;
    onclose: () => void;
    onUpdate?: () => Promise<void> | void;
  }

  let { role, user, isOpen, onclose, onUpdate }: Props = $props();

  let departmentModalAssignments = $state<RoleUserAssignment[]>([]);
  let assignmentsLoading = $state(false);
  let departmentSearchQuery = $state("");
  let departmentSearchResults = $state<Department[]>([]);
  const availableSearchResults = $derived(
    departmentSearchResults.filter(
      (department: Department) =>
        !departmentModalAssignments.some(
          (assignment) => assignment.scope_department_id === department.id,
        ),
    ),
  );
  const hasGlobalScopeAssignment = $derived(
    departmentModalAssignments.some(
      (assignment) => !assignment.scope_department_id,
    ),
  );

  let departmentSearching = $state(false);
  let departmentSearchTimeout: number | undefined;
  let departmentSearchInputRef = $state<HTMLInputElement | null>(null);
  let departmentAdditionLoading = $state<Record<string, boolean>>({});
  let departmentRemovalLoading = $state<Record<string, boolean>>({});
  let departmentCache = $state<Record<string, Department>>({});
  let assignedSectionExpanded = $state(true);
  let searchSectionExpanded = $state(false);
  let globalScopeLoading = $state(false);

  function resetModalState() {
    departmentModalAssignments = [];
    resetSearchState();
  }

  function resetSearchState() {
    departmentSearchQuery = "";
    departmentSearchResults = [];
    departmentSearching = false;
    departmentAdditionLoading = {};
    departmentRemovalLoading = {};
    if (departmentSearchTimeout) {
      clearTimeout(departmentSearchTimeout);
      departmentSearchTimeout = undefined;
    }
  }

  async function loadAssignments() {
    if (!role || !user) return;
    assignmentsLoading = true;
    try {
      const { assignments } = await rolesApi.getUserRoleAssignments(user.id);
      const scoped = assignments.filter(
        (assignment) => assignment.role_id === role.id,
      );
      const departmentIds = [
        ...new Set(
          scoped
            .map((assignment) => assignment.scope_department_id)
            .filter(Boolean),
        ),
      ] as string[];
      await ensureDepartments(departmentIds);
      departmentModalAssignments = scoped;
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? getLocalizedError(err, "description", $_)
          : (err as Error).message;
      toast.error(msg || $_("admin.accessControl.failedToLoadAssignments"));
    } finally {
      assignmentsLoading = false;
    }
  }

  async function ensureDepartments(ids: string[]) {
    const missingIds = ids.filter((id) => id && !(id in departmentCache));
    if (missingIds.length === 0) return;
    await Promise.all(
      missingIds.map(async (id) => {
        try {
          const department = await getDepartment(id);
          departmentCache = { ...departmentCache, [id]: department };
        } catch {
          // ignore; we will show the id if the lookup fails
        }
      }),
    );
  }

  function getDepartmentInfo(departmentId?: string | null) {
    if (!departmentId)
      return { name: $_("admin.accessControl.globalScope"), description: $_("admin.accessControl.globalScopeDescription") };
    const department = departmentCache[departmentId];
    return {
      name: department?.name ?? $_("admin.accessControl.globalScope"),
      description: department?.description ?? $_("admin.accessControl.globalScopeDescription"),
    };
  }

  $effect(() => {
    if (isOpen && role && user) {
      resetSearchState();
      loadAssignments();
      tick().then(() => departmentSearchInputRef?.focus());
    } else if (!isOpen) {
      resetModalState();
    }
  });

  function handleClose() {
    resetModalState();
    onclose();
  }

  function handleDepartmentSearchInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const query = target.value;
    departmentSearchQuery = query;
    if (departmentSearchTimeout) {
      clearTimeout(departmentSearchTimeout);
    }
    if (!query.trim()) {
      departmentSearchResults = [];
      return;
    }
    departmentSearchTimeout = setTimeout(() => {
      searchDepartments(query);
    }, 300);
  }

  async function searchDepartments(query: string) {
    if (!query.trim()) {
      departmentSearchResults = [];
      return;
    }
    departmentSearching = true;
    try {
      const response = await getDepartments({ search: query, limit: 10 });
      departmentSearchResults = response.departments;
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? getLocalizedError(err, "description", $_)
          : (err as Error).message;
      toast.error(msg || $_("admin.accessControl.failedToSearchDepartments"));
      departmentSearchResults = [];
    } finally {
      departmentSearching = false;
    }
  }

  async function addDepartmentScope(department: Department) {
    if (!role || !user) return;
    if (
      departmentModalAssignments.some(
        (assignment) => assignment.scope_department_id === department.id,
      )
    ) {
      return;
    }
    departmentAdditionLoading = {
      ...departmentAdditionLoading,
      [department.id]: true,
    };
    try {
      await rolesApi.addRoleToUser(user.id, {
        role_id: role.id,
        scope_department_id: department.id,
      });
      toast.success($_("admin.accessControl.departmentAssigned"));
      await loadAssignments();
      await onUpdate?.();
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? getLocalizedError(err, "description", $_)
          : (err as Error).message;
      toast.error(msg || $_("admin.accessControl.failedToAssignDepartment"));
    } finally {
      departmentAdditionLoading = {
        ...departmentAdditionLoading,
        [department.id]: false,
      };
    }
  }

  async function addGlobalScope() {
    if (!role || !user || hasGlobalScopeAssignment) return;
    globalScopeLoading = true;
    try {
      await rolesApi.addRoleToUser(user.id, {
        role_id: role.id,
      });
      toast.success($_("admin.accessControl.departmentAssigned"));
      await loadAssignments();
      await onUpdate?.();
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? getLocalizedError(err, "description", $_)
          : (err as Error).message;
      toast.error(msg || $_("admin.accessControl.failedToAssignDepartment"));
    } finally {
      globalScopeLoading = false;
    }
  }

  async function removeDepartmentScope(assignment: RoleUserAssignment) {
    if (!user) return;
    departmentRemovalLoading = {
      ...departmentRemovalLoading,
      [assignment.id]: true,
    };
    try {
      await rolesApi.removeRoleFromUser(user.id, assignment.id);
      toast.success($_("admin.accessControl.departmentRemoved"));
      await loadAssignments();
      await onUpdate?.();
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? getLocalizedError(err, "description", $_)
          : (err as Error).message;
      toast.error(msg || $_("admin.accessControl.failedToRemoveDepartment"));
    } finally {
      departmentRemovalLoading = {
        ...departmentRemovalLoading,
        [assignment.id]: false,
      };
    }
  }
</script>

<Modal
  {isOpen}
  onclose={handleClose}
  title={$_("admin.accessControl.manageDepartmentsTitle", {
    values: {
      user: user?.name || user?.email || "",
      role: role?.name || "",
    },
  })}
>
  <div class="department-modal">
    <div class="modal-done">
      <button class="btn-secondary" onclick={handleClose}
        >{$_("admin.common.done")}</button
      >
    </div>
    <div class="modal-section assigned-section">
      <div
        class="section-header"
        role="button"
        tabindex="0"
        onclick={() => (assignedSectionExpanded = !assignedSectionExpanded)}
        onkeydown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            assignedSectionExpanded = !assignedSectionExpanded;
          }
        }}
      >
        <div>
          <h3>{$_("admin.accessControl.assignedDepartments")}</h3>
          <p>{$_("admin.accessControl.assignedDepartmentsHint")}</p>
        </div>
        <span
          class="collapse-icon"
          aria-hidden="true"
          class:expanded={assignedSectionExpanded}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M4 6l4 4 4-4"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </span>
      </div>
      {#if assignedSectionExpanded}
        {#if assignmentsLoading}
          <div class="assigned-loading">
            <LoadingSpinner />
            <span>{$_("admin.accessControl.loadingAssignedDepartments")}</span>
          </div>
        {:else if departmentModalAssignments.length === 0}
          <p class="assigned-empty">
            {$_("admin.accessControl.noDepartmentsAssigned")}
          </p>
        {:else}
          <div class="assigned-list">
            {#each departmentModalAssignments as assignment (assignment.id)}
              {@const departmentInfo = getDepartmentInfo(
                assignment.scope_department_id,
              )}
              <div
                class="assigned-item"
              >
                <div>
                  <span
                    class="assigned-name"
                    class:assigned-global={!assignment.scope_department_id}
                  >
                    {departmentInfo.name}
                  </span>
                  <p class="assigned-description">
                    {departmentInfo.description}
                  </p>
                </div>
                <button
                  class="assigned-remove"
                  onclick={() => removeDepartmentScope(assignment)}
                  disabled={departmentRemovalLoading[assignment.id]}
                >
                  {#if departmentRemovalLoading[assignment.id]}
                    <LoadingSpinner size="sm" />
                  {:else}
                    {$_("admin.accessControl.removeDepartmentScope")}
                  {/if}
                </button>
              </div>
            {/each}
          </div>
        {/if}
      {/if}
    </div>
    <div class="modal-section search-section">
      <div
        class="section-header"
        role="button"
        tabindex="0"
        onclick={() => (searchSectionExpanded = !searchSectionExpanded)}
        onkeydown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            searchSectionExpanded = !searchSectionExpanded;
          }
        }}
      >
        <div>
          <h3>{$_("admin.accessControl.searchDepartments")}</h3>
          <p>{$_("admin.accessControl.searchDepartmentsHint")}</p>
        </div>
        <span
          class="collapse-icon"
          aria-hidden="true"
          class:expanded={searchSectionExpanded}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M4 6l4 4 4-4"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </span>
      </div>
      {#if searchSectionExpanded}
        <div class="department-search">
          <div class="department-search-box">
            <input
              type="text"
              class="department-search-input"
              placeholder={$_(
                "admin.accessControl.departmentSearchPlaceholder",
              )}
              value={departmentSearchQuery}
              bind:this={departmentSearchInputRef}
              oninput={handleDepartmentSearchInput}
            />
          </div>
          {#if !assignmentsLoading && !departmentSearching && !hasGlobalScopeAssignment}
            <div class="department-global-option">
              <div class="department-global-details">
                <span class="department-search-name">
                  {$_("admin.accessControl.globalScope")}
                </span>
                <p class="department-global-description">
                  {$_("admin.accessControl.globalScopeHint")}
                </p>
              </div>
              <button
                class="btn-edit-departments"
                onclick={addGlobalScope}
                disabled={hasGlobalScopeAssignment || globalScopeLoading}
              >
                {#if globalScopeLoading}
                  <LoadingSpinner size="sm" />
                {:else}
                  {$_("admin.accessControl.assignAllDepartments")}
                {/if}
              </button>
            </div>
          {/if}
          {#if departmentSearching}
            <div class="department-search-loading">
              <LoadingSpinner />
              <span>{$_("admin.accessControl.loadingDepartments")}</span>
            </div>
          {:else if departmentSearchQuery && departmentSearchResults.length === 0}
            <div class="department-search-empty">
              <p>{$_("admin.accessControl.noDepartmentsFound")}</p>
            </div>
          {:else if availableSearchResults.length > 0}
            <ul class="department-search-results">
              {#each availableSearchResults as department (department.id)}
                <li class="department-search-result">
                  <div class="department-search-info">
                    <span class="department-search-name">{department.name}</span
                    >
                    {#if department.description}
                      <span class="department-search-description"
                        >{department.description}</span
                      >
                    {/if}
                  </div>
                  <button
                    class="btn-edit-departments"
                    onclick={() => addDepartmentScope(department)}
                    disabled={departmentAdditionLoading[department.id]}
                  >
                    {#if departmentAdditionLoading[department.id]}
                      <LoadingSpinner size="sm" />
                    {:else}
                      {$_("admin.accessControl.addDepartmentScope")}
                    {/if}
                  </button>
                </li>
              {/each}
            </ul>
          {:else if departmentSearchQuery && availableSearchResults.length === 0}
            <div class="department-search-empty">
              <p>{$_("admin.accessControl.noDepartmentsFound")}</p>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</Modal>

<style>
  .department-modal {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
    min-width: 320px;
    max-height: 560px;
    overflow: hidden;
  }

  .assigned-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    max-height: 220px;
    padding-right: 0.5rem;
  }

  .assigned-loading {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-size: 0.85rem;
    color: var(--text-secondary);
  }

  .assigned-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--radius-lg);
    border: 1px solid rgba(255, 255, 255, 0.06);
    background: var(--surface-card, rgba(255, 255, 255, 0.02));
  }

  .assigned-name {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .assigned-description {
    display: block;
    font-size: 0.75rem;
    color: var(--text-secondary);
    margin-top: 0.1rem;
  }

  .assigned-global {
    color: var(--brand-green-accent);
  }

  .assigned-remove {
    border: none;
    background: transparent;
    color: var(--brand-red);
    font-size: 0.8125rem;
    font-weight: 600;
    padding: 0.25rem 0.75rem;
    border-radius: var(--radius-md);
    cursor: pointer;
  }

  .assigned-remove:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .modal-section {
    background: var(--surface-card, rgba(255, 255, 255, 0.04));
    padding: var(--space-md);
    border-radius: var(--radius-xl);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.08);
    overflow-y: auto;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    cursor: pointer;
    gap: var(--space-sm);
    margin-bottom: var(--space-sm);
  }

  .section-header h3 {
    margin: 0;
    font-size: 0.95rem;
    color: var(--text-primary);
  }

  .section-header p {
    margin: 0.25rem 0 0;
    font-size: 0.8rem;
    color: var(--text-secondary);
  }

  .department-search {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    max-height: 240px;
    overflow: auto;
    padding-right: 0.5rem;
  }

  .department-search-box {
    padding: var(--space-sm) var(--space-md);
    border: 1px solid var(--glass-stroke-dark);
    border-radius: var(--radius-md);
    background: var(--glass-bg-dark);
  }

  .department-global-option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-md);
    padding: var(--space-sm) var(--space-md);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-xl);
    background: var(--surface-card, rgba(255, 255, 255, 0.04));
  }

  .department-global-details {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }

  .department-global-description {
    margin: 0;
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .department-global-option button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .department-search-input {
    width: 100%;
    border: none;
    background: transparent;
    font-size: 0.875rem;
    color: var(--text-primary);
    outline: none;
  }

  .department-search-loading,
  .department-search-empty {
    font-size: 0.85rem;
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .department-search-results {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .department-search-result {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-md);
    padding-bottom: var(--space-sm);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .department-search-info {
    display: flex;
    flex-direction: column;
  }

  .department-search-name {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .department-search-description {
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    cursor: pointer;
    gap: var(--space-sm);
  }

  .section-header h3 {
    margin: 0;
  }

  .collapse-icon {
    transition: transform 0.2s ease;
  }

  .collapse-icon.expanded {
    transform: rotate(-180deg);
  }

  .modal-done {
    display: flex;
    justify-content: flex-end;
    padding-bottom: var(--space-sm);
  }
</style>
