<script lang="ts">
  import { onMount } from "svelte";
  import { usersStore } from "../stores/index.js";
  import AdminTableCard from "../components/AdminTableCard.svelte";
  import PageHeader from "../components/PageHeader.svelte";
  import LoadingSpinner from "../components/LoadingSpinner.svelte";
  import UserFormModal from "../components/UserFormModal.svelte";
  import DepartmentScopingModal from "../components/access-control/DepartmentScopingModal.svelte";
  import { toast } from "../../components/Toaster.svelte";
  import { ApiError } from "../../api/client.js";
  import { getLocalizedError } from "../../utils/errorLocalization.js";
  import type { Department, RoleUserAssignment, User } from "../types.js";
  import UserRow from "../components/UserRow.svelte";
  import SortIcon from "../components/SortIcon.svelte";
  import { _ } from "svelte-i18n";
  import { formatNumber } from "../../utils/format.js";
  import { getAuthState, permissionsStore } from "../../features/auth/index.js";
  import {
    addRoleToUser,
    getUserRoleAssignments,
    removeRoleFromUser,
    getRoles,
    type Role,
  } from "../../api/admin/roles.js";
  import { getDepartment } from "../../api/admin/departments.js";

  let isCreateModalOpen = $state(false);
  let isEditModalOpen = $state(false);
  let selectedUser = $state<User | null>(null);
  let searchQuery = $state("");
  let filterRole = $state("");
  let filterStatus = $state("");
  let filterDepartment = $state("");
  let debounceTimeout: number | null = null;
  let filtersOpen = $state(false);
  let roles = $state<Role[]>([]);
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
    fetchRoles();
  });

  // Handle errors with toast
  $effect(() => {
    if (usersStore.error) {
      const errorMessage = usersStore.error instanceof ApiError ? getLocalizedError(usersStore.error, 'description', $_) : usersStore.error.message;
      toast.error(errorMessage || $_('admin.users.failedToFetchUsers'));
      usersStore.clearError();
    }
  });

  function applyFilters() {
    usersStore.setFilters({
      search: searchQuery,
      role_id: filterRole,
      status: filterStatus,
      department: filterDepartment,
    });
  }

  function applyFiltersDebounced() {
    if (debounceTimeout) clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      applyFilters();
    }, 500); // ms
  }

  async function fetchRoles() {
    try {
      const res = await getRoles();
      roles = res.roles;
    } catch (err: any) {
      const errorMessage = err instanceof ApiError ? getLocalizedError(err, 'description', $_) : err.message;
      toast.error(errorMessage || $_("admin.accessControl.failedToLoadRoles"));
    }
  }

  function clearFilters() {
    searchQuery = "";
    filterRole = "";
    filterStatus = "";
    filterDepartment = "";
    usersStore.setFilters({
      search: "",
      role_id: "",
      status: "",
      department: "",
    });
  }

  function openCreateModal() {
    formData = { email: "", name: "", department_id: "", department_name: "" };
    formErrors = {};
    rolesOpen = true;
    addRoleOpen = false;
    roleSearchQuery = "";
    isCreateModalOpen = true;
  }

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
      isCreateModalOpen = false;
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

<div class="users-container">
  <PageHeader title={$_('admin.users.userManagement')} subtitle={$_('admin.users.manageUsersAndRoles')}>
    {#snippet children()}
      {#if canManageUsers}
        <button class="btn-primary" onclick={openCreateModal}>
          + {$_('admin.users.createUserButton')}
        </button>
      {/if}
    {/snippet}
  </PageHeader>

  <!-- Filters -->
  <div class="filters-section">
    <button
      class="filter-toggle-btn"
      class:open={filtersOpen}
      onclick={() => (filtersOpen = !filtersOpen)}
      aria-label={filtersOpen ? $_('admin.users.closeFilters') : $_('admin.users.openFilters')}
    >
      {#if filtersOpen}
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M10 6l-5 5M10 6l5 5"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      {:else}
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M2.5 5h15M5 10h10M7.5 15h5"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
          />
          <circle cx="15" cy="5" r="2" fill="currentColor" />
          <circle cx="10" cy="10" r="2" fill="currentColor" />
          <circle cx="5" cy="15" r="2" fill="currentColor" />
        </svg>
        {$_('admin.users.filters')}
      {/if}
    </button>
    <div class="filters-grid" class:open={filtersOpen}>
      <input
        type="text"
        placeholder={$_('admin.users.searchByNameOrEmail')}
        bind:value={searchQuery}
        oninput={applyFiltersDebounced}
        class="filter-input"
      />
      <select
        bind:value={filterRole}
        class="filter-select"
        onchange={applyFilters}
      >
        <option value="">{$_('admin.common.allRoles')}</option>
        {#each roles as role (role.id)}
          <option value={role.id}>{role.name}</option>
        {/each}
      </select>
      <select
        bind:value={filterStatus}
        class="filter-select"
        onchange={applyFilters}
      >
        <option value="">{$_('admin.common.allStatuses')}</option>
        <option value="active">{$_('admin.common.active')}</option>
        <option value="deactivated">{$_('admin.common.deactivated')}</option>
      </select>
      <button class="btn-secondary reset-btn" onclick={clearFilters}
        >{$_('admin.users.reset')}</button
      >
    </div>
  </div>

  {#if usersStore.isLoading}
    <LoadingSpinner size="lg" text={$_('admin.users.loadingUsers')} />
  {:else}
    <!-- Users Table -->
    <AdminTableCard minWidth="960px">
      <table class="admin-table users-table">
        <thead>
          <tr>
            <th class="sortable" onclick={() => handleSort('name')}>
              <span class="th-content">
                {$_('admin.common.name')}
                <SortIcon sort="name" currentSort={usersStore.sort} ascending={usersStore.ascending} />
              </span>
            </th>
            <th class="sortable" onclick={() => handleSort('email')}>
              <span class="th-content">
                {$_('admin.common.email')}
                <SortIcon sort="email" currentSort={usersStore.sort} ascending={usersStore.ascending} />
              </span>
            </th>
            <th>{$_('admin.common.role')}</th>
            <th>{$_('admin.common.department')}</th>
            <th>{$_('admin.common.status')}</th>
            <th class="sortable" onclick={() => handleSort('created_at')}>
              <span class="th-content">
                {$_('admin.common.created')}
                <SortIcon sort="created_at" currentSort={usersStore.sort} ascending={usersStore.ascending} />
              </span>
            </th>
            {#if canManageUsers}
              <th>{$_('admin.common.actions')}</th>
            {/if}
          </tr>
        </thead>
        <tbody>
          {#each usersStore.users as user (user.id)}
            <UserRow
              {user}
              {toggleUserStatus}
              {openEditModal}
              {currentUserId}
              {canManageUsers}
            />
          {:else}
            <tr>
              <td colspan={canManageUsers ? 7 : 6} class="empty-state">
                {$_('admin.users.noUsersFound')}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </AdminTableCard>

    <!-- Pagination -->
    {#if totalPages > 1}
      <div class="pagination">
        <button
          class="btn"
          onclick={() => handlePageChange(currentPage - 1)}
          disabled={currentPage === 0}
        >
          {$_('admin.common.previous')}
        </button>
        <span class="pagination-info">
          {$_('admin.common.pageInfo', { values: { current: formatNumber(currentPage + 1), total: formatNumber(totalPages), count: formatNumber(usersStore.total) } })}
        </span>
        <button
          class="btn"
          onclick={() => handlePageChange(currentPage + 1)}
          disabled={currentPage >= totalPages - 1}
        >
          {$_('admin.common.next')}
        </button>
      </div>
    {/if}
  {/if}

  <!-- Create User Modal -->
  <UserFormModal
    isOpen={isCreateModalOpen}
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
    onClose={() => (isCreateModalOpen = false)}
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
  .users-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    background: var(--bg-primary);
    padding: var(--space-3xl);
    overflow-y: auto;
  }

  .filters-section {
    padding: var(--space-xl);
    margin: var(--space-md) 0;
    background: rgba(var(--glass-tint), 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-lg);
    position: relative;
  }

  .filter-toggle-btn {
    display: none;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-md) var(--space-lg);
    background: var(--button-bg);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: 0.9375rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    margin-left: auto;
  }

  .filter-toggle-btn:hover {
    background: var(--btn-secondary);
    border-color: rgba(255, 255, 255, 0.12);
    transform: translateY(-1px);
  }

  .filter-toggle-btn svg {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
  }

  .filters-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: var(--space-md);
  }

  .filter-input,
  .filter-select {
    width: 100%;
  }

  .reset-btn {
    max-width: 100px;
  }

  .empty-state {
    text-align: center;
    color: var(--text-secondary);
    padding: var(--space-3xl) !important;
  }

  .pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-xl);
    margin-top: var(--space-xl);
  }

  .pagination-info {
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .sortable {
    cursor: pointer;
    user-select: none;
    position: relative;
    transition: all 0.2s ease;
    font-weight: 700 !important;
    color: var(--text-primary) !important;
  }

  .sortable:hover {
    background: rgba(var(--glass-tint), 0.08);
    color: var(--text-primary);
  }

  .sortable:active {
    background: rgba(var(--glass-tint), 0.12);
  }

  .th-content {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    justify-content: flex-start;
  }

  @media (max-width: 768px) {
    .filters-section {
      display: flex;
      flex-direction: column;
    }

    .filter-toggle-btn {
      display: flex;
      align-self: flex-end;
    }

    .filter-toggle-btn.open {
      padding: var(--space-md);
      margin-bottom: var(--space-md);
    }

    .filters-grid {
      grid-template-columns: 1fr;
      max-height: 0;
      overflow: hidden;
      opacity: 0;
      margin-bottom: 0;
      padding: 2px;
      transform: translateY(-10px);
      transition:
        max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1),
        opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1),
        transform 0.3s cubic-bezier(0.4, 0, 0.2, 1),
        margin-bottom 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .filters-grid.open {
      max-height: 1000px;
      opacity: 1;
      transform: translateY(0);
    }

    .pagination {
      gap: var(--space-md);
    }
  }
</style>
