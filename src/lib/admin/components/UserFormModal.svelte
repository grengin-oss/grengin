<script lang="ts">
  import Modal from "./Modal.svelte";
  import LoadingSpinner from "./LoadingSpinner.svelte";
  import type { Role } from "../../api/admin/roles.js";
  import type { RoleUserAssignment } from "../types.js";
  import { tick } from "svelte";
  import { _ } from "svelte-i18n";

  type Mode = "create" | "edit";

  interface FormData {
    email: string;
    name: string;
    department: string;
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
</script>

<Modal
  {isOpen}
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
    >
      <div class="form-group">
        <label for={isCreate ? "create-email" : "edit-email"}>
          {$_("admin.common.email")}
          {#if isCreate}
            <span class="required">*</span>
          {/if}
        </label>
        <input
          id={isCreate ? "create-email" : "edit-email"}
          type="email"
          bind:value={formData.email}
          placeholder="user@example.com"
          required={isCreate}
          disabled={!isCreate}
          class:error={isCreate && formErrors.email}
        />
        {#if isCreate && formErrors.email}
          <span class="error-text">{formErrors.email}</span>
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
        />
      </div>

      {#if !isCreate}
        <div class="form-group roles-group">
          <div class="roles-header">
            <span class="form-label">{$_("admin.common.roles")}</span>
            <button
              type="button"
              class="btn-role-toggle"
              onclick={() => (rolesOpen = !rolesOpen)}
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
            <div class="roles-applied">
              {#if roleAssignmentsLoading}
                <div class="roles-loading">
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
                        >
                          {$_("admin.accessControl.manageScoping")}
                        </button>
                      {/if}
                      <button
                        type="button"
                        class="btn-remove-role"
                        onclick={() => requestRemoveAssignment(assignment)}
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
            >
              {$_("admin.users.addRole")}
            </button>
            {#if addRoleOpen}
              <div class="role-search-panel">
                <div class="role-search">
                  <input
                    type="text"
                    class="role-search-input"
                    placeholder={$_("admin.users.searchRoles")}
                    bind:value={roleSearchQuery}
                    bind:this={roleSearchInput}
                  />
                  <button
                    type="button"
                    class="role-search-close"
                    onclick={closeRoleSearch}
                    aria-label={$_("common.close")}
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
                      <div class="role-name">{role.name}</div>
                      <div class="role-actions">
                        <button
                          type="button"
                          class="btn-role-add"
                          onclick={() => handleAddRoleAndClose(role.id)}
                          disabled={addingRoleId === role.id}
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
        <input
          id={isCreate ? "create-department" : "edit-department"}
          type="text"
          bind:value={formData.department}
          placeholder={$_("admin.users.departmentPlaceholder")}
        />
      </div>

      <div class="form-actions">
        <button type="button" class="btn" onclick={onClose}>
          {$_("common.cancel")}
        </button>
        <button type="submit" class="btn-primary" disabled={isSubmitting}>
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
  title={$_("admin.users.confirmRemoveRoleTitle")}
  onclose={cancelRemoveAssignment}
>
  {#snippet children()}
    <div class="remove-role-confirm">
      <p class="remove-role-warning">
        {$_("admin.users.confirmRemoveRoleMessage", {
          values: { role: pendingRemoval?.roleName ?? "-" },
        })}
      </p>
      <div class="modal-actions">
        <button class="btn" type="button" onclick={cancelRemoveAssignment}>
          {$_("common.cancel")}
        </button>
        <button
          class="btn-danger"
          type="button"
          onclick={confirmRemoveAssignment}
          disabled={isRemovingRole}
        >
          {isRemovingRole ? $_("admin.common.deleting") : $_("common.delete")}
        </button>
      </div>
    </div>
  {/snippet}
</Modal>

<style>
  .user-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-xl);
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .form-group label,
  .form-label {
    font-weight: 600;
    color: var(--text-primary);
    font-size: 0.9375rem;
  }

  .required {
    color: var(--brand-red);
  }

  .form-group input.error {
    border-color: var(--brand-red);
  }

  .error-text {
    color: var(--brand-red);
    font-size: 0.8125rem;
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-md);
    padding-top: var(--space-lg);
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  .remove-role-confirm {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
    padding: var(--space-md) 0;
  }

  .remove-role-warning {
    color: var(--brand-red);
    font-weight: 600;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-md);
  }

  .btn-danger {
    background: var(--brand-red);
    color: white;
    border: none;
    padding: var(--space-xs) var(--space-md);
    border-radius: var(--radius-md);
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s ease;
  }

  .btn-danger:hover {
    background: color-mix(in oklab, var(--brand-red) 90%, black);
  }

  .roles-group {
    gap: var(--space-sm);
  }

  .roles-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-md);
  }

  .btn-role-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition: color 0.2s ease;
    padding: var(--space-xs);
  }

  .btn-role-toggle:hover {
    color: var(--text-primary);
  }

  .btn-role-toggle svg {
    width: 18px;
    height: 18px;
  }

  .roles-applied {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .roles-empty {
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .roles-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-sm) 0;
  }

  .role-chip {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-md);
    padding: var(--space-xs) var(--space-sm);
    border-radius: var(--radius-md);
    background: var(--surface-subtle);
    border: 1px solid var(--surface-border);
  }

  .role-chip-meta {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
  }

  .role-chip-name {
    font-weight: 600;
    color: var(--text-primary);
  }

  .role-chip-actions {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .role-chip-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 var(--space-xs);
    border-radius: var(--radius-md);
    background: rgba(var(--brand-green-rgb), 0.12);
    border: 1px solid color-mix(in oklab, var(--brand-green) 60%, transparent);
    font-size: 0.6875rem;
    font-weight: 600;
    color: var(--brand-green-accent);
  }

  .btn-remove-role {
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.8125rem;
    cursor: pointer;
    transition: color 0.2s ease;
  }

  .btn-remove-role:hover {
    color: var(--text-primary);
  }

  .btn-add-role {
    align-self: flex-end;
    border: 1px solid var(--surface-border);
    background: var(--surface-card);
    color: var(--text-primary);
    padding: var(--space-xs) var(--space-md);
    border-radius: var(--radius-md);
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    padding: var(--space-xs) var(--space-md);
  }

  .btn-add-role:hover {
    background: var(--surface-subtle);
  }

  .role-search {
    position: relative;
  }

  .role-search-panel {
    background: var(--surface-card-interactive);
    border-radius: var(--radius-lg);
    border: 1px solid var(--surface-border);
    padding: var(--space-sm);
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .role-search-input {
    width: 100%;
    padding: var(--space-sm) var(--space-md);
    padding-right: 2rem;
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
    background: var(--surface-card);
    color: var(--text-primary);
    font-size: 0.875rem;
  }

  .role-search-close {
    position: absolute;
    top: 50%;
    right: var(--space-sm);
    transform: translateY(-50%);
    border: none;
    background: transparent;
    color: var(--text-secondary);
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: color 0.2s ease;
    padding: var(--space-xs);
  }

  .role-search-close:hover {
    color: var(--text-primary);
  }

  .role-search-close svg {
    width: 16px;
    height: 16px;
  }

  .roles-selector {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    max-height: 220px;
    overflow-y: auto;
  }

  .role-option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-md);
    padding: var(--space-xs) var(--space-sm);
    border-radius: var(--radius-md);
    background: var(--surface-subtle);
    border: 1px solid var(--surface-border);
  }

  .role-name {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .role-actions {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .btn-role-add,
  .btn-role-scope {
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
    transition: color 0.2s ease;
  }

  .btn-role-add:disabled,
  .btn-role-scope:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-role-add:hover,
  .btn-role-scope:hover {
    color: var(--text-primary);
  }

</style>
