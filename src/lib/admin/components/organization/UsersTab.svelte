<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { onMount } from "svelte";
  import { usersStore } from "../../stores/index.js";
  import LoadingSpinner from "../LoadingSpinner.svelte";
  import UserFormModal from "../UserFormModal.svelte";
  import DepartmentScopingModal from "../access-control/DepartmentScopingModal.svelte";
  import { toast } from "$lib/components/Toaster.svelte";
  import { ApiError } from "$lib/api/client.js";
  import { getLocalizedError } from "$lib/utils/errorLocalization.js";
  import type { Department, RoleUserAssignment, User } from "../../types.js";
  import UserRow from "../UserRow.svelte";
  import SortIcon from "../SortIcon.svelte";
  import { _ } from "svelte-i18n";
  import { formatNumber } from "$lib/utils/format.js";
  import { getAuthState, permissionsStore } from "$lib/features/auth/index.js";
  import {
    addRoleToUser,
    getUserRoleAssignments,
    removeRoleFromUser,
    type Role,
  } from "$lib/api/admin/roles.js";
  import { getDepartment } from "$lib/api/admin/departments.js";

  interface Props {
    /** Controlled by the Organization header's contextual "Create User" button. */
    showCreateModal?: boolean;
    /** Opens the shared team picker for a user. */
    onAssignTeam?: (user: User) => void;
    /** Roles catalogue, loaded once by the Organization page (also feeds its filter). */
    roles?: Role[];
  }

  let {
    showCreateModal = $bindable(false),
    onAssignTeam,
    roles = [],
  }: Props = $props();

  let isEditModalOpen = $state(false);
  let selectedUser = $state<User | null>(null);
  let roleAssignments = $state<RoleUserAssignment[]>([]);
  let roleAssignmentsLoading = $state(false);
  let roleScopingContext = $state<{ role: Role; user: User } | null>(null);
  let rolesOpen = $state(true);
  let addRoleOpen = $state(false);
  let roleSearchQuery = $state("");
  let departmentCache = $state<Record<string, Department>>({});

  // Form state
  let formData = $state({
    email: "",
    name: "",
    department_id: "",
    department_name: "",
  });

  let formErrors = $state<Record<string, string>>({});
  let isSubmitting = $state(false);

  const authState = getAuthState();
  const currentUserId = $derived(authState.user?.id);
  const canManageUsers = $derived(permissionsStore.canManageUsers());

  onMount(() => {
    usersStore.fetchUsers();
  });

  // Reset the form whenever the parent opens the create modal via its header button.
  let wasCreateOpen = $state(false);
  $effect(() => {
    if (showCreateModal && !wasCreateOpen) {
      formData = { email: "", name: "", department_id: "", department_name: "" };
      formErrors = {};
      rolesOpen = true;
      addRoleOpen = false;
      roleSearchQuery = "";
    }
    wasCreateOpen = showCreateModal;
  });

  // Handle errors with toast
  $effect(() => {
    if (usersStore.error) {
      const errorMessage = usersStore.error instanceof ApiError ? getLocalizedError(usersStore.error, 'description', $_) : usersStore.error.message;
      toast.error(errorMessage || $_('admin.users.failedToFetchUsers'));
      usersStore.clearError();
    }
  });

  async function openEditModal(user: User) {
    selectedUser = user;
    formData = {
      email: user.email,
      name: user.name || "",
      department_id: user.department_id || "",
      department_name: user.department || "",
    };
    formErrors = {};
    isEditModalOpen = true;
    rolesOpen = true;
    addRoleOpen = false;
    roleSearchQuery = "";
    await loadUserRoles(user.id);
  }

  function validateForm(): boolean {
    formErrors = {};

    if (!formData.email) {
      formErrors.email = $_('admin.users.emailRequired');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      formErrors.email = $_('admin.users.invalidEmailFormat');
    }

    return Object.keys(formErrors).length === 0;
  }

  async function handleCreate() {
    if (!validateForm()) return;

    isSubmitting = true;
    try {
      await usersStore.create({
        email: formData.email,
        name: formData.name,
        department_id: formData.department_id ?? null,
      });
      showCreateModal = false;
      formData = { email: "", name: "", department_id: "", department_name: "" };
      toast.success($_('admin.users.userCreatedSuccessfully'));
    } catch (err: any) {
      const errorMessage = err instanceof ApiError ? getLocalizedError(err, 'description', $_) : err.message;
      toast.error(errorMessage || $_('admin.users.failedToCreateUser'));
    } finally {
      isSubmitting = false;
    }
  }

  async function handleUpdate() {
    if (!validateForm() || !selectedUser) return;

    isSubmitting = true;
    try {
      await usersStore.update(selectedUser.id, {
        email: formData.email,
        name: formData.name,
        department_id: formData.department_id ?? null,
      });
      isEditModalOpen = false;
      selectedUser = null;
      toast.success($_('admin.users.userUpdatedSuccessfully'));
    } catch (err: any) {
      const errorMessage = err instanceof ApiError ? getLocalizedError(err, 'description', $_) : err.message;
      toast.error(errorMessage || $_('admin.users.failedToUpdateUser'));
    } finally {
      isSubmitting = false;
    }
  }

  async function toggleUserStatus(user: User) {
    const newStatus = user.status === "active" ? "deactivated" : "active";

    try {
      await usersStore.updateStatus(user.id, newStatus);
      toast.success(
        newStatus === "active" ? $_('admin.users.activatedMessage') : $_('admin.users.deactivatedMessage'),
      );
    } catch (err: any) {
      const errorMessage = err instanceof ApiError ? getLocalizedError(err, 'description', $_) : err.message;
      toast.error(errorMessage || $_('admin.users.failedToUpdateUserStatus'));
    }
  }

  function handlePageChange(page: number) {
    usersStore.setPage(page);
  }

  function handleSort(field: 'name' | 'email' | 'created_at') {
    usersStore.setSort(field);
  }

  async function loadUserRoles(userId: string) {
    try {
      roleAssignmentsLoading = true;
      const { assignments } = await getUserRoleAssignments(userId);
      roleAssignments = assignments;
      const departmentIds = [
        ...new Set(
          assignments
            .map((assignment) => assignment.scope_department_id)
            .filter(Boolean),
        ),
      ] as string[];
      await ensureDepartments(departmentIds);
    } catch (err: any) {
      const errorMessage = err instanceof ApiError ? getLocalizedError(err, 'description', $_) : err.message;
      toast.error(errorMessage || $_("admin.accessControl.failedToLoadAssignments"));
      roleAssignments = [];
    } finally {
      roleAssignmentsLoading = false;
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
          // ignore; fallback to id if lookup fails
        }
      }),
    );
  }

  function openRoleScoping(role: Role) {
    if (!selectedUser) return;
    roleScopingContext = { role, user: selectedUser };
  }

  function closeRoleScoping() {
    roleScopingContext = null;
  }

  async function handleScopingUpdate() {
    const userId = roleScopingContext?.user?.id;
    if (!userId) return;
    await loadUserRoles(userId);
  }

  async function handleAddRoleGlobal(roleId: string) {
    if (!selectedUser) return;
    try {
      await addRoleToUser(selectedUser.id, { role_id: roleId });
      await loadUserRoles(selectedUser.id);
    } catch (err: any) {
      const errorMessage = err instanceof ApiError ? getLocalizedError(err, 'description', $_) : err.message;
      toast.error(errorMessage || $_("admin.users.failedToAssignRoles"));
    }
  }

  async function handleRemoveAssignment(assignmentId: string) {
    if (!selectedUser) return;
    try {
      await removeRoleFromUser(selectedUser.id, assignmentId);
      await loadUserRoles(selectedUser.id);
    } catch (err: any) {
      const errorMessage = err instanceof ApiError ? getLocalizedError(err, 'description', $_) : err.message;
      toast.error(errorMessage || $_("admin.accessControl.failedToRemoveUser"));
    }
  }

  function closeRoleSearch() {
    roleSearchQuery = "";
    addRoleOpen = false;
  }

  const currentPage = $derived(
    Math.floor(usersStore.offset / usersStore.limit),
  );
  const totalPages = $derived(Math.ceil(usersStore.total / usersStore.limit));
</script>

<div class="users-tab">
  {#if usersStore.isLoading}
    <div class="table-loading">
      <LoadingSpinner size="lg" text={$_('admin.users.loadingUsers')} />
    </div>
  {:else}
    <div class="table-container">
      <div class="users-table" role="table" aria-label={$_('admin.users.userManagement')}>
        <div class="table-header" role="row">
          <span
            class="hcell hcell--name"
            role="columnheader"
            aria-sort={usersStore.sort === 'name' ? (usersStore.ascending ? 'ascending' : 'descending') : 'none'}
          >
            <button
              type="button"
              class="th-sort-btn"
              onclick={() => handleSort('name')}
              aria-label={$_('admin.users.sortByAria', { values: { field: $_('admin.common.name') } })}
            >
              {$_('admin.common.name')}
              <span class="th-sort-icon" class:th-sort-icon--on={usersStore.sort === 'name'}>
                <SortIcon sort="name" currentSort={usersStore.sort} ascending={usersStore.ascending} />
              </span>
            </button>
          </span>
          <span
            class="hcell hcell--email"
            role="columnheader"
            aria-sort={usersStore.sort === 'email' ? (usersStore.ascending ? 'ascending' : 'descending') : 'none'}
          >
            <button
              type="button"
              class="th-sort-btn"
              onclick={() => handleSort('email')}
              aria-label={$_('admin.users.sortByAria', { values: { field: $_('admin.common.email') } })}
            >
              {$_('admin.common.email')}
              <span class="th-sort-icon" class:th-sort-icon--on={usersStore.sort === 'email'}>
                <SortIcon sort="email" currentSort={usersStore.sort} ascending={usersStore.ascending} />
              </span>
            </button>
          </span>
          <span class="hcell hcell--role" role="columnheader">{$_('admin.common.role')}</span>
          <span class="hcell hcell--dept" role="columnheader">{$_('admin.common.department')}</span>
          <span class="hcell hcell--status" role="columnheader">{$_('admin.common.status')}</span>
        </div>

        <div class="table-body" role="rowgroup">
          {#each usersStore.users as user (user.id)}
            <UserRow
              {user}
              {toggleUserStatus}
              {openEditModal}
              {currentUserId}
              {canManageUsers}
              {onAssignTeam}
            />
          {:else}
            <div class="empty-cell">{$_('admin.users.noUsersFound')}</div>
          {/each}
        </div>
      </div>
    </div>

    <!-- Pagination -->
    {#if totalPages > 1}
      <nav class="pagination" aria-label={$_('admin.common.pagination')}>
        <button
          type="button"
          class="page-btn"
          onclick={() => handlePageChange(currentPage - 1)}
          disabled={currentPage === 0}
          aria-label={$_('admin.common.previousPage')}
        >
          {$_('admin.common.previous')}
        </button>
        <span class="pagination-info" role="status" aria-live="polite">
          {$_('admin.common.pageInfo', { values: { current: formatNumber(currentPage + 1), total: formatNumber(totalPages), count: formatNumber(usersStore.total) } })}
        </span>
        <button
          type="button"
          class="page-btn"
          onclick={() => handlePageChange(currentPage + 1)}
          disabled={currentPage >= totalPages - 1}
          aria-label={$_('admin.common.nextPage')}
        >
          {$_('admin.common.next')}
        </button>
      </nav>
    {/if}
  {/if}

  <!-- Create User Modal -->
  <UserFormModal
    isOpen={showCreateModal}
    mode="create"
    bind:formData
    {formErrors}
    {isSubmitting}
    {roles}
    roleAssignments={[]}
    roleAssignmentsLoading={false}
    bind:rolesOpen
    bind:addRoleOpen
    bind:roleSearchQuery
    onClose={() => (showCreateModal = false)}
    onSubmit={handleCreate}
    {closeRoleSearch}
  />

  <!-- Edit User Modal -->
  <UserFormModal
    isOpen={isEditModalOpen}
    mode="edit"
    bind:formData
    {formErrors}
    {isSubmitting}
    {roles}
    {roleAssignments}
    {roleAssignmentsLoading}
    bind:rolesOpen
    bind:addRoleOpen
    bind:roleSearchQuery
    onClose={() => (isEditModalOpen = false)}
    onSubmit={handleUpdate}
    {handleAddRoleGlobal}
    {openRoleScoping}
    {handleRemoveAssignment}
    {closeRoleSearch}
  />

  <!-- Department Scoping Modal -->
  <DepartmentScopingModal
    role={roleScopingContext?.role ?? null}
    user={roleScopingContext?.user ?? null}
    isOpen={!!roleScopingContext}
    onclose={closeRoleScoping}
    onUpdate={handleScopingUpdate}
  />
</div>

<style>
  /* app.css gives every button backdrop-filter: blur(); on the flat
     Organization surfaces that repaints the 1px hairlines behind them
     (the tab-row ring, the tree's branch rails), so switch it off. */
  button {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .users-tab {
    display: flex;
    flex-direction: column;
    gap: 20px;
    width: 100%;
    font-family: var(--gx-font);
  }

  .table-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 64px 20px;
  }

  /* Long user lists scroll inside the card, header pinned. */
  .table-container {
    overflow: auto;
    max-height: calc(100vh - 280px);
    border-radius: 12px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    align-self: stretch;
  }

  /* Design (247:24146): one flex row per user, 240/240/160/160 + flexible
     status column, a full hairline ring on the header and on every row. */
  .users-table {
    display: flex;
    flex-direction: column;
    min-width: 880px;
    align-self: stretch;
  }

  .table-header {
    position: sticky;
    top: 0;
    z-index: 1;
    height: 45px;
    display: flex;
    padding: 16px;
    align-items: flex-start;
    align-self: stretch;
    flex-shrink: 0;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
  }

  .hcell {
    font-weight: 700;
    font-size: 11px;
    line-height: 100%;
    letter-spacing: 0.55px;
    text-transform: uppercase;
    color: var(--gx-slate-500);
  }

  .hcell--name,
  .hcell--email {
    width: 240px;
    flex-shrink: 0;
  }

  .hcell--role,
  .hcell--dept {
    width: 160px;
    flex-shrink: 0;
  }

  .hcell--status {
    flex-grow: 1;
  }

  .table-body {
    display: flex;
    flex-direction: column;
    align-self: stretch;
  }

  .th-sort-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0;
    border: 0;
    background: transparent;
    box-shadow: none;
    font: inherit;
    letter-spacing: inherit;
    text-transform: inherit;
    color: inherit;
    cursor: pointer;
  }

  .th-sort-btn:hover {
    color: var(--gx-org-slate-800);
    background: transparent;
    transform: none;
  }

  .th-sort-btn:focus-visible {
    outline: 2px solid var(--gx-org-brand-alt);
    outline-offset: 2px;
  }

  /* The design's header is plain text, so the sort caret only shows on hover
     (or once a column is actually the active sort). */
  .th-sort-icon {
    display: inline-flex;
    opacity: 0;
    transition: opacity 120ms ease;
  }

  .th-sort-btn:hover .th-sort-icon,
  .th-sort-btn:focus-visible .th-sort-icon,
  .th-sort-icon--on {
    opacity: 1;
  }

  .empty-cell {
    padding: 48px 16px;
    text-align: center;
    font-size: 13px;
    color: var(--gx-slate-500);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
  }

  /* ---------------- pagination ---------------- */
  .pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 20px;
  }

  .pagination-info {
    color: var(--gx-slate-500);
    font-size: 13px;
  }

  .page-btn {
    height: 32px;
    border: 0;
    border-radius: 8px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    padding: 0 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-family: inherit;
    font-weight: 600;
    font-size: 13px;
    color: var(--gx-slate-500);
    cursor: pointer;
    transition: background-color 120ms ease;
  }

  .page-btn:hover:not(:disabled) {
    background: var(--gx-org-track);
    transform: none;
  }

  .page-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .page-btn:focus-visible {
    outline: 2px solid var(--gx-org-brand-alt);
    outline-offset: 2px;
  }
</style>
