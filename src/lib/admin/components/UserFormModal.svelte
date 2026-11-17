<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import Modal from "./Modal.svelte";
  import LoadingSpinner from "./LoadingSpinner.svelte";
  import type { Role } from "../../api/admin/roles.js";
  import { getDepartments } from "../../api/admin/departments.js";
  import { ApiError } from "../../api/client.js";
  import type { Department, RoleUserAssignment } from "../types.js";
  import { toast } from "../../components/Toaster.svelte";
  import { getLocalizedError } from "../../utils/errorLocalization.js";
  import { tick } from "svelte";
  import { _ } from "svelte-i18n";

  type Mode = "create" | "edit";

  interface FormData {
    email: string;
    name: string;
    department_id?: string | null;
    department_name?: string;
  }

  interface Props {
    isOpen: boolean;
    mode: Mode;
    formData: FormData;
    formErrors: Record<string, string>;
    isSubmitting: boolean;
    roles: Role[];
    roleAssignments: RoleUserAssignment[];
    roleAssignmentsLoading: boolean;
    rolesOpen: boolean;
    addRoleOpen: boolean;
    roleSearchQuery: string;
    onClose: () => void;
    onSubmit: () => void;
    handleAddRoleGlobal?: (roleId: string) => Promise<void>;
    openRoleScoping?: (role: Role) => void;
    handleRemoveAssignment?: (assignmentId: string) => Promise<void>;
    closeRoleSearch?: () => void;
  }

  let {
    isOpen,
    mode,
    formData = $bindable(),
    formErrors,
    isSubmitting,
    roles,
    roleAssignments,
    roleAssignmentsLoading,
    rolesOpen = $bindable(),
    addRoleOpen = $bindable(),
    roleSearchQuery = $bindable(),
    onClose,
    onSubmit,
    handleAddRoleGlobal = async () => {},
    openRoleScoping = () => {},
    handleRemoveAssignment = async () => {},
    closeRoleSearch = () => {},
  }: Props = $props();

  const isCreate = $derived(mode === "create");
  
  const filteredRoles = $derived(() => {
    const normalizedQuery = roleSearchQuery.trim().toLowerCase();
    const resultList = normalizedQuery
      ? roles.filter((role) =>
          role.name.toLowerCase().includes(normalizedQuery),
        )
      : roles;
    return resultList;
  });

  // Remove duplicate role assignments by role_id, keeping the one with the scope_department_id if it exists
  const uniqueRoleAssignments = $derived(() => {
    const byRole = new Map<string, RoleUserAssignment>();
    for (const assignment of roleAssignments) {
      const existing = byRole.get(assignment.role_id);
      if (!existing) {
        byRole.set(assignment.role_id, assignment);
        continue;
      }

      if (!existing.scope_department_id && assignment.scope_department_id) {
        continue;
      }

      if (existing.scope_department_id && !assignment.scope_department_id) {
        byRole.set(assignment.role_id, assignment);
      }
    }
    return Array.from(byRole.values());
  });
  let roleSearchInput = $state<HTMLInputElement | null>(null);
  let showRemoveRoleConfirm = $state(false);
  let pendingRemoval = $state<{ id: string; roleName: string } | null>(null);
  let isRemovingRole = $state(false);
  let addingRoleId = $state<string | null>(null);
  let departmentSearchQuery = $state("");
  let departmentSearchResults = $state<Department[]>([]);
  let departmentSearching = $state(false);
  let departmentSearchTimeout: number | undefined;
  let emailInputRef = $state<HTMLInputElement | null>(null);

  $effect(() => {
    if (isOpen) {
      departmentSearchQuery = formData.department_name ?? "";
      departmentSearchResults = [];
      departmentSearching = false;
    } else {
      departmentSearchQuery = "";
      departmentSearchResults = [];
      departmentSearching = false;
    }
  });

  // Focus email when opening create-user modal (after Modal moves focus to backdrop)
  $effect(() => {
    if (!isOpen || !isCreate) return;
    let cancelled = false;
    tick().then(() => {
      setTimeout(() => {
        if (!cancelled) {
          emailInputRef?.focus({ preventScroll: true });
        }
      }, 0);
    });
    return () => {
      cancelled = true;
    };
  });

  async function toggleRoleSearch(): Promise<void> {
    addRoleOpen = !addRoleOpen;
    if (!addRoleOpen) {
      roleSearchQuery = "";
      return;
    }
    await tick();
    roleSearchInput?.focus();
  }

  async function handleAddRoleAndClose(roleId: string): Promise<void> {
    addingRoleId = roleId;
    try {
      await handleAddRoleGlobal(roleId);
      addRoleOpen = false;
    } finally {
      addingRoleId = null;
    }
  }

  function openRoleScopingAndClose(role: Role): void {
    openRoleScoping(role);
    addRoleOpen = false;
  }

  function requestRemoveAssignment(assignment: RoleUserAssignment): void {
    const role = roles.find((r) => r.id === assignment.role_id);
    pendingRemoval = {
      id: assignment.id,
      roleName: role?.name ?? assignment.role_id,
    };
    showRemoveRoleConfirm = true;
  }

  function cancelRemoveAssignment(): void {
    showRemoveRoleConfirm = false;
    pendingRemoval = null;
  }

  async function confirmRemoveAssignment(): Promise<void> {
    if (!pendingRemoval) return;
    isRemovingRole = true;
    try {
      await handleRemoveAssignment(pendingRemoval.id);
      showRemoveRoleConfirm = false;
      pendingRemoval = null;
    } finally {
      isRemovingRole = false;
    }
  }

  function handleDepartmentSearchInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const query = target.value;
    departmentSearchQuery = query;
    if (!query.trim()) {
      departmentSearchResults = [];
      formData.department_id = null;
      formData.department_name = "";
      if (departmentSearchTimeout) {
        clearTimeout(departmentSearchTimeout);
      }
      return;
    }
    formData.department_id = null;
    formData.department_name = query;
    if (departmentSearchTimeout) {
      clearTimeout(departmentSearchTimeout);
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

  function selectDepartment(department: Department) {
    formData.department_id = department.id;
    formData.department_name = department.name;
    departmentSearchQuery = department.name;
    departmentSearchResults = [];
  }

  function clearDepartmentSelection() {
    formData.department_id = null;
    formData.department_name = "";
    departmentSearchQuery = "";
    departmentSearchResults = [];
  }
</script>

<Modal
  {isOpen}
  variant="organization"
  title={isCreate
    ? $_("admin.users.createNewUser")
    : $_("admin.users.editUser")}
  onclose={onClose}
>
  {#snippet children()}
    <form
      onsubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      class="user-form"
      aria-busy={isSubmitting}
      novalidate
    >
      <div class="form-group">
        <label for={isCreate ? "create-email" : "edit-email"}>
          {$_("admin.common.email")}
          {#if isCreate}
            <span class="required" aria-hidden="true">*</span>
          {/if}
        </label>
        <input
          id={isCreate ? "create-email" : "edit-email"}
          type="email"
          bind:this={emailInputRef}
          bind:value={formData.email}
          placeholder="user@example.com"
          required={isCreate}
          disabled={!isCreate}
          class:error={isCreate && formErrors.email}
          autocomplete="email"
          aria-required={isCreate}
          aria-invalid={isCreate && !!formErrors.email}
          aria-describedby={isCreate && formErrors.email
            ? `${mode}-user-form-email-error`
            : undefined}
        />
        {#if isCreate && formErrors.email}
          <span
            class="error-text"
            id={`${mode}-user-form-email-error`}
            role="alert"
          >{formErrors.email}</span>
        {/if}
      </div>

      <div class="form-group">
        <label for={isCreate ? "create-name" : "edit-name"}>
          {$_("admin.common.name")}
        </label>
        <input
          id={isCreate ? "create-name" : "edit-name"}
          type="text"
          bind:value={formData.name}
          placeholder={$_("admin.users.namePlaceholder")}
          autocomplete="name"
        />
      </div>

      {#if !isCreate}
        <div
          class="form-group roles-group"
          role="group"
          aria-labelledby={`${mode}-user-form-roles-label`}
        >
          <div class="roles-header">
            <span class="form-label" id={`${mode}-user-form-roles-label`}
              >{$_("admin.common.roles")}</span
            >
            <button
              type="button"
              class="btn-role-toggle"
              onclick={() => (rolesOpen = !rolesOpen)}
              aria-expanded={rolesOpen}
              aria-controls={`${mode}-user-form-roles-panel`}
              aria-label={rolesOpen
                ? $_("admin.users.hideRoles")
                : $_("admin.users.showRoles")}
            >
              {#if rolesOpen}
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path
                    d="M5 12l5-5 5 5"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              {:else}
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path
                    d="M5 8l5 5 5-5"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              {/if}
            </button>
          </div>
          {#if rolesOpen}
            <div
              class="roles-applied"
              id={`${mode}-user-form-roles-panel`}
            >
              {#if roleAssignmentsLoading}
                <div
                  class="roles-loading"
                  role="status"
                  aria-live="polite"
                  aria-busy={true}
                >
                  <LoadingSpinner />
                </div>
              {:else if roleAssignments.length === 0}
                <span class="roles-empty">
                  {$_("admin.users.noRolesAssigned")}
                </span>
              {:else}
                {#each uniqueRoleAssignments() as assignment (assignment.id)}
                  {@const role = roles.find((r) => r.id === assignment.role_id)}
                  <div class="role-chip">
                    <div class="role-chip-meta">
                      <span class="role-chip-name">
                        {role?.name ?? assignment.role_id}
                      </span>
                      {#if !assignment.scope_department_id}
                        <span class="role-chip-badge">
                          {$_("admin.accessControl.permissionsTab.globalBadge")}
                        </span>
                      {/if}
                    </div>
                    <div class="role-chip-actions">
                      {#if role}
                        <button
                          type="button"
                          class="btn-role-scope"
                          onclick={() => openRoleScoping(role)}
                          aria-label={$_("admin.users.manageScopingAria", {
                            values: { role: role.name },
                          })}
                        >
                          {$_("admin.accessControl.manageScoping")}
                        </button>
                      {/if}
                      <button
                        type="button"
                        class="btn-remove-role"
                        onclick={() => requestRemoveAssignment(assignment)}
                        aria-label={$_("admin.users.removeRoleAria", {
                          values: {
                            role: role?.name ?? assignment.role_id,
                          },
                        })}
                      >
                        {$_("common.delete")}
                      </button>
                    </div>
                  </div>
                {/each}
              {/if}
            </div>
            <button
              type="button"
              class="btn-add-role"
              onclick={toggleRoleSearch}
              aria-expanded={addRoleOpen}
              aria-controls={`${mode}-user-form-add-role-panel`}
            >
              {$_("admin.users.addRole")}
            </button>
            {#if addRoleOpen}
              <div
                class="role-search-panel"
                id={`${mode}-user-form-add-role-panel`}
                role="region"
                aria-label={$_("admin.users.roleOptionsLabel")}
              >
                <div class="role-search">
                  <input
                    type="text"
                    class="role-search-input"
                    id={`${mode}-user-form-role-search`}
                    placeholder={$_("admin.users.searchRoles")}
                    bind:value={roleSearchQuery}
                    bind:this={roleSearchInput}
                    aria-label={$_("admin.users.searchRoles")}
                  />
                  <button
                    type="button"
                    class="role-search-close"
                    onclick={closeRoleSearch}
                    aria-label={$_("admin.common.closeModal")}
                  >
                    <svg viewBox="0 0 20 20" aria-hidden="true">
                      <path
                        d="M6 6l8 8M14 6l-8 8"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    </svg>
                  </button>
                </div>
                <div class="roles-selector">
                  {#each filteredRoles() as role (role.id)}
                    <div class="role-option">
                      <div class="role-name" id={`role-option-${mode}-${role.id}`}>
                        {role.name}
                      </div>
                      <div class="role-actions" role="group" aria-labelledby={`role-option-${mode}-${role.id}`}>
                        <button
                          type="button"
                          class="btn-role-add"
                          onclick={() => handleAddRoleAndClose(role.id)}
                          disabled={addingRoleId === role.id}
                          aria-label={$_("admin.users.addRoleGlobalAria", {
                            values: { role: role.name },
                          })}
                        >
                        {addingRoleId === role.id
                          ? $_("admin.common.adding")
                          : $_("admin.users.addRoleGlobal")}
                        </button>
                        <button
                          type="button"
                          class="btn-role-scope"
                          onclick={() => openRoleScopingAndClose(role)}
                          disabled={addingRoleId === role.id}
                          aria-label={$_("admin.users.addRoleScopedAria", {
                            values: { role: role.name },
                          })}
                        >
                          {$_("admin.users.addRoleScoped")}
                        </button>
                      </div>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
          {/if}
        </div>
      {/if}

      <div class="form-group">
        <label for={isCreate ? "create-department" : "edit-department"}>
          {$_("admin.common.department")}
        </label>
        <div class="department-search">
          <div class="input-with-clear">
          <input
            id={isCreate ? "create-department" : "edit-department"}
            type="text"
            placeholder={$_("admin.users.departmentPlaceholder")}
            value={departmentSearchQuery}
            oninput={handleDepartmentSearchInput}
            autocomplete="off"
            aria-autocomplete="list"
            aria-controls={`${mode}-user-form-dept-results`}
            aria-busy={departmentSearching}
          />
          {#if formData.department_id}
            <button
              type="button"
              class="input-clear-btn"
              onclick={clearDepartmentSelection}
              aria-label={$_("common.clear")}
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path
                  d="M6 6l8 8M14 6l-8 8"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </button>
          {/if}
          </div>
          {#if departmentSearching}
            <div
              class="department-search-loading"
              role="status"
              aria-live="polite"
            >
              <LoadingSpinner size="sm" />
              <span>{$_("admin.accessControl.loadingDepartments")}</span>
            </div>
          {:else if departmentSearchQuery && departmentSearchResults.length === 0 && !formData.department_id}
            <div class="department-search-empty" role="status">
              <span>{$_("admin.accessControl.noDepartmentsFound")}</span>
            </div>
          {:else if departmentSearchResults.length > 0}
            <ul
              class="department-search-results"
              id={`${mode}-user-form-dept-results`}
              aria-label={$_("admin.users.departmentResultsLabel")}
            >
              {#each departmentSearchResults as department (department.id)}
                <li class="department-search-result">
                  <div class="department-search-info">
                    <span class="department-search-name">{department.name}</span>
                    {#if department.description}
                      <span class="department-search-description">
                        {department.description}
                      </span>
                    {/if}
                  </div>
                  <button
                    type="button"
                    class="btn-department-select"
                    aria-label={$_("admin.users.selectDepartmentOption", {
                      values: { name: department.name },
                    })}
                    onclick={() => selectDepartment(department)}
                  >
                    {$_("common.select")}
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      </div>

      <div class="form-actions">
        <button type="button" class="btn-secondary" onclick={onClose}>
          {$_("common.cancel")}
        </button>
        <button
          type="submit"
          class="btn-primary"
          disabled={isSubmitting}
          aria-busy={isSubmitting}
        >
          {#if isCreate}
            {isSubmitting
              ? $_("admin.common.creating")
              : $_("admin.users.createUser")}
          {:else}
            {isSubmitting
              ? $_("admin.common.updating")
              : $_("admin.users.updateUser")}
          {/if}
        </button>
      </div>
    </form>
  {/snippet}
</Modal>

<Modal
  isOpen={showRemoveRoleConfirm}
  variant="organization"
  title={$_("admin.users.confirmRemoveRoleTitle")}
  onclose={cancelRemoveAssignment}
  descriptionId="remove-role-modal-desc"
>
  {#snippet children()}
    <div class="remove-role-confirm">
      <p class="remove-role-warning" id="remove-role-modal-desc">
        {$_("admin.users.confirmRemoveRoleMessage", {
          values: { role: pendingRemoval?.roleName ?? "-" },
        })}
      </p>
      <div class="modal-actions">
        <button class="btn-secondary" type="button" onclick={cancelRemoveAssignment}>
          {$_("common.cancel")}
        </button>
        <button
          class="btn-danger"
          type="button"
          onclick={confirmRemoveAssignment}
          disabled={isRemovingRole}
          aria-busy={isRemovingRole}
        >
          {isRemovingRole ? $_("admin.common.deleting") : $_("common.delete")}
        </button>
      </div>
    </div>
  {/snippet}
</Modal>

<style>
  /* app.css gives every button backdrop-filter: blur(); on the flat
     Organization surfaces that repaints the 1px hairlines behind them, so
     switch it off (as DepartmentFormModal does). */
  button {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  /* Organization design (organization.html #createUsersModal / .edit-modal),
     shared with DepartmentFormModal: 424px card, 24px rhythm, 16px between
     fields, 37px fields. The Modal shell paints the card, title and close. */
  .user-form {
    display: flex;
    flex-direction: column;
    gap: 16px;
    font-family: var(--gx-font);
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0;
  }

  .form-group label,
  .form-label {
    display: flex;
    align-items: center;
    gap: 2px;
    font-weight: 600;
    font-size: 13px;
    line-height: 100%;
    color: var(--gx-slate-900);
  }

  .required {
    color: var(--gx-org-danger);
  }

  .form-group input,
  .role-search-input {
    width: 100%;
    height: 37px;
    border: 0;
    border-radius: 8px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    padding: 10px 14px;
    font-family: inherit;
    font-weight: 400;
    font-size: 14px;
    line-height: 100%;
    color: var(--gx-slate-900);
    transition: box-shadow 120ms ease;
  }

  .form-group input::placeholder,
  .role-search-input::placeholder {
    color: var(--gx-slate-400);
  }

  .form-group input:focus,
  .role-search-input:focus {
    outline: none;
    box-shadow: inset 0 0 0 1px var(--gx-org-brand-alt);
  }

  .form-group input.error {
    box-shadow: inset 0 0 0 1px var(--gx-org-danger);
  }

  .form-group input:disabled {
    background: var(--gx-org-field-bg);
    color: var(--gx-slate-500);
    cursor: not-allowed;
  }

  .error-text {
    font-size: 12px;
    line-height: 130%;
    color: var(--gx-org-danger);
  }

  /* ----- Actions ----- */
  .form-actions,
  .modal-actions {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
  }

  .form-actions {
    margin-top: 8px;
  }

  .btn-secondary,
  .btn-primary,
  .btn-danger {
    height: 35px;
    border: 0;
    border-radius: 8px;
    padding: 0 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-family: inherit;
    font-weight: 600;
    font-size: 13px;
    white-space: nowrap;
    cursor: pointer;
    box-shadow: none;
    transition: background-color 120ms ease;
  }

  .btn-secondary {
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    color: var(--gx-slate-500);
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--gx-org-track);
    transform: none;
  }

  .btn-primary {
    background: var(--gx-org-brand);
    color: #fff;
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--gx-org-brand-hover);
    transform: none;
  }

  .btn-danger {
    background: var(--gx-org-danger);
    color: #fff;
  }

  .btn-danger:hover:not(:disabled) {
    background: var(--gx-org-danger-hover);
  }

  .btn-secondary:disabled,
  .btn-primary:disabled,
  .btn-danger:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* ----- Remove-role confirmation ----- */
  .remove-role-confirm {
    display: flex;
    flex-direction: column;
    gap: 24px;
    font-family: var(--gx-font);
  }

  .remove-role-warning {
    margin: 0;
    font-size: 14px;
    line-height: 150%;
    color: var(--gx-slate-500);
  }

  /* ----- Roles (edit mode) ----- */
  .roles-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .btn-role-toggle,
  .role-search-close,
  .input-clear-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 0;
    border-radius: 999px;
    background: var(--gx-org-track);
    color: var(--gx-slate-500);
    cursor: pointer;
    transition: background-color 120ms ease;
  }

  .btn-role-toggle:hover,
  .role-search-close:hover,
  .input-clear-btn:hover {
    background: var(--gx-hair);
  }

  .btn-role-toggle svg,
  .role-search-close svg,
  .input-clear-btn svg {
    width: 14px;
    height: 14px;
    fill: none;
  }

  .roles-applied,
  .roles-selector,
  .department-search-results {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .roles-empty,
  .department-search-loading,
  .department-search-empty {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--gx-slate-500);
  }

  .roles-loading {
    display: flex;
    justify-content: center;
    padding: 8px 0;
  }

  .role-chip,
  .role-option,
  .department-search-result {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 37px;
    padding: 6px 8px 6px 14px;
    border-radius: 8px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    transition: background-color 120ms ease;
  }

  .role-option:hover,
  .department-search-result:hover {
    background: var(--gx-org-row-hover);
  }

  .role-chip-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .role-chip-name,
  .role-name,
  .department-search-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--gx-slate-900);
  }

  .role-chip-badge {
    display: inline-flex;
    align-items: center;
    height: 20px;
    padding: 0 8px;
    border-radius: 999px;
    background: var(--gx-org-brand-tint);
    font-size: 11px;
    font-weight: 600;
    color: var(--gx-org-brand);
  }

  .role-chip-actions,
  .role-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .btn-role-add,
  .btn-role-scope,
  .btn-remove-role,
  .btn-department-select {
    height: 26px;
    padding: 0 8px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    font-family: inherit;
    font-size: 12px;
    font-weight: 600;
    color: var(--gx-org-brand-alt);
    cursor: pointer;
    transition: background-color 120ms ease, color 120ms ease;
  }

  .btn-role-add:hover:not(:disabled),
  .btn-role-scope:hover:not(:disabled),
  .btn-department-select:hover {
    background: var(--gx-org-brand-alt-tint);
    color: var(--gx-org-brand);
  }

  .btn-remove-role {
    color: var(--gx-org-danger);
  }

  .btn-remove-role:hover {
    background: var(--gx-org-danger-bg);
  }

  .btn-role-add:disabled,
  .btn-role-scope:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-add-role {
    align-self: flex-start;
    height: 30px;
    padding: 0 12px;
    border: 0;
    border-radius: 8px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    font-family: inherit;
    font-size: 12px;
    font-weight: 600;
    color: var(--gx-slate-900);
    cursor: pointer;
    transition: background-color 120ms ease;
  }

  .btn-add-role:hover {
    background: var(--gx-org-track);
  }

  .role-search-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px;
    border-radius: 10px;
    background: var(--gx-org-field-bg);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
  }

  .role-search,
  .input-with-clear {
    position: relative;
    display: flex;
    align-items: center;
  }

  .role-search-input,
  .input-with-clear input {
    padding-inline-end: 40px;
  }

  .role-search-close,
  .input-clear-btn {
    position: absolute;
    inset-inline-end: 8px;
    top: 50%;
    transform: translateY(-50%);
  }

  .roles-selector,
  .department-search-results {
    max-height: 220px;
    overflow-y: auto;
  }

  /* ----- Department search ----- */
  .department-search {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .department-search-results {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .department-search-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .department-search-description {
    font-size: 12px;
    color: var(--gx-slate-500);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* ----- Keyboard focus ----- */
  .btn-role-toggle:focus-visible,
  .btn-remove-role:focus-visible,
  .btn-add-role:focus-visible,
  .role-search-close:focus-visible,
  .input-clear-btn:focus-visible,
  .btn-department-select:focus-visible,
  .btn-role-add:focus-visible,
  .btn-role-scope:focus-visible,
  .btn-secondary:focus-visible,
  .btn-primary:focus-visible,
  .btn-danger:focus-visible {
    outline: 2px solid var(--gx-org-brand-alt);
    outline-offset: 2px;
  }
</style>
