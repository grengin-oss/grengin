<script lang="ts">
  import { onMount } from "svelte";
  import { usersStore } from "../../stores/index.js";
  import AdminTableCard from "../AdminTableCard.svelte";
  import LoadingSpinner from "../LoadingSpinner.svelte";
  import Modal from "../Modal.svelte";
  import { toast } from "../../../components/Toaster.svelte";
  import { ApiError } from "../../../api/client.js";
  import { getLocalizedError } from "../../../utils/errorLocalization.js";
  import type { User, Department } from "../../types.js";
  import UserRow from "../UserRow.svelte";
  import SortIcon from "../SortIcon.svelte";
  import AddMemberModal from "../AddMemberModal.svelte";
  import * as departmentsApi from "../../../api/admin/departments.js";
  import { _ } from "svelte-i18n";
  import { formatNumber } from "../../../utils/format.js";

  interface Props {
    // undefined = all users, null = unassigned users (no department), string = specific department
    departmentFilter?: string | null;
    // When provided, enables department mode with add/remove member actions
    department?: Department;
  }

  let { departmentFilter = undefined, department = undefined }: Props = $props();

  const isDepartmentMode = $derived(department != null);

  let isCreateModalOpen = $state(false);
  let isEditModalOpen = $state(false);
  let selectedUser = $state<User | null>(null);
  let searchQuery = $state("");
  let filterRole = $state("");
  let filterStatus = $state("");
  let debounceTimeout: number | null = null;
  let filtersOpen = $state(false);

  // Department mode state
  let showAddMember = $state(false);
  let selectedMembers = $state<Set<string>>(new Set());

  // Form state
  let formData = $state({
    email: "",
    name: "",
    role: "user",
    department: "",
  });

  let formErrors = $state<Record<string, string>>({});
  let isSubmitting = $state(false);

  // Track previous filter to detect changes
  let prevDepartmentFilter = $state<string | null | undefined>(undefined);
  let initialized = $state(false);

  // Apply department filter on mount and when prop changes
  $effect(() => {
    // Read the prop to track it
    const currentFilter = departmentFilter;

    // Only apply filters if prop actually changed or on first run
    if (!initialized || currentFilter !== prevDepartmentFilter) {
      prevDepartmentFilter = currentFilter;
      initialized = true;

      // Apply the filter
      const deptValue = currentFilter === undefined ? ""
        : currentFilter === null ? "__unassigned__"
        : currentFilter;

      usersStore.setFilters({
        search: searchQuery,
        role: filterRole,
        status: filterStatus,
        department: deptValue,
      });
    }
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
    if (departmentFilter === undefined) {
      usersStore.setFilters({
        search: searchQuery,
        role: filterRole,
        status: filterStatus,
        department: "",
      });
    } else if (departmentFilter === null) {
      usersStore.setFilters({
        search: searchQuery,
        role: filterRole,
        status: filterStatus,
        department: "__unassigned__",
      });
    } else {
      usersStore.setFilters({
        search: searchQuery,
        role: filterRole,
        status: filterStatus,
        department: departmentFilter,
      });
    }
  }

  function applyFiltersDebounced() {
    if (debounceTimeout) clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      applyFilters();
    }, 500);
  }

  function clearFilters() {
    searchQuery = "";
    filterRole = "";
    filterStatus = "";
    applyFilters();
  }

  function openCreateModal() {
    formData = { email: "", name: "", role: "user", department: departmentFilter || "" };
    formErrors = {};
    isCreateModalOpen = true;
  }

  function openEditModal(user: User) {
    selectedUser = user;
    formData = {
      email: user.email,
      name: user.name || "",
      role: user.role || "user",
      department: user.department || "",
    };
    formErrors = {};
    isEditModalOpen = true;
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
      await usersStore.create(formData);
      isCreateModalOpen = false;
      formData = { email: "", name: "", role: "user", department: "" };
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
      await usersStore.update(selectedUser.id, formData);
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

  const currentPage = $derived(
    Math.floor(usersStore.offset / usersStore.limit),
  );
  const totalPages = $derived(Math.ceil(usersStore.total / usersStore.limit));

  // Department mode: member selection
  function toggleMemberSelection(userId: string) {
    const newSet = new Set(selectedMembers);
    if (newSet.has(userId)) {
      newSet.delete(userId);
    } else {
      newSet.add(userId);
    }
    selectedMembers = newSet;
  }

  function toggleSelectAll() {
    if (selectedMembers.size === usersStore.users.length && usersStore.users.length > 0) {
      selectedMembers = new Set();
    } else {
      selectedMembers = new Set(usersStore.users.map(u => u.id));
    }
  }

  async function handleRemoveMembers() {
    if (!department || selectedMembers.size === 0) return;

    const confirmed = confirm($_('admin.departments.selectMembers'));
    if (!confirmed) return;

    try {
      await departmentsApi.removeDepartmentMembers(department.id, Array.from(selectedMembers));
      const count = selectedMembers.size;
      toast.success($_('admin.departments.membersRemoved', { values: { count } }));
      selectedMembers = new Set();
      await usersStore.fetchUsers();
    } catch (error) {
      const errorMessage = error instanceof ApiError
        ? getLocalizedError(error, 'description', $_)
        : $_('admin.departments.failedToRemoveMember');
      toast.error(errorMessage);
    }
  }

  async function handleMembersAdded() {
    selectedMembers = new Set();
    await usersStore.fetchUsers();
  }

  // Title based on filter
  const panelTitle = $derived(() => {
    if (isDepartmentMode && department) {
      return $_('admin.departments.members');
    } else if (departmentFilter === undefined) {
      return $_('admin.organization.allUsers');
    } else if (departmentFilter === null) {
      return $_('admin.organization.unassignedUsers');
    }
    return $_('admin.users.userManagement');
  });

  const panelSubtitle = $derived(() => {
    if (isDepartmentMode && department) {
      return $_('admin.users.manageUsersAndRoles');
    } else if (departmentFilter === undefined) {
      return $_('admin.organization.allUsersDescription');
    } else if (departmentFilter === null) {
      return $_('admin.organization.unassignedUsersDescription');
    }
    return $_('admin.users.manageUsersAndRoles');
  });

  // Column count for empty state colspan
  const columnCount = $derived(() => {
    let count = 6; // name, email, role, status, created, actions
    if (departmentFilter === undefined) count++; // department column
    if (isDepartmentMode) count++; // checkbox column
    return count;
  });
</script>

<div class="users-panel">
  <div class="panel-header">
    <div class="header-content">
      <div class="header-titles">
        <h2>{panelTitle()}</h2>
        <p class="subtitle">{panelSubtitle()}</p>
      </div>
      <div class="header-actions">
        {#if isDepartmentMode}
          {#if selectedMembers.size > 0}
            <button class="btn-danger" onclick={handleRemoveMembers}>
              {$_('admin.departments.removeMembers')} ({selectedMembers.size})
            </button>
          {/if}
          <button class="btn-primary" onclick={() => showAddMember = true}>
            + {$_('admin.departments.addMembers')}
          </button>
        {:else}
          <button class="btn-primary" onclick={openCreateModal}>
            + {$_('admin.users.createUserButton')}
          </button>
        {/if}
      </div>
    </div>
  </div>

  <div class="panel-content">
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
          placeholder={$_('admin.users.searchByName')}
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
          <option value="superadmin">{$_('admin.common.superAdmin')}</option>
          <option value="admin">{$_('admin.common.admin')}</option>
          <option value="user">{$_('admin.common.user')}</option>
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
      <AdminTableCard minWidth="800px">
        <table class="admin-table users-table">
          <thead>
            <tr>
              {#if isDepartmentMode}
                <th class="checkbox-col">
                  <input
                    type="checkbox"
                    checked={selectedMembers.size === usersStore.users.length && usersStore.users.length > 0}
                    onchange={toggleSelectAll}
                  />
                </th>
              {/if}
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
              {#if departmentFilter === undefined}
                <th>{$_('admin.common.department')}</th>
              {/if}
              <th>{$_('admin.common.status')}</th>
              <th class="sortable" onclick={() => handleSort('created_at')}>
                <span class="th-content">
                  {$_('admin.common.created')}
                  <SortIcon sort="created_at" currentSort={usersStore.sort} ascending={usersStore.ascending} />
                </span>
              </th>
              <th>{$_('admin.common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {#each usersStore.users as user (user.id)}
              <UserRow
                {user}
                {toggleUserStatus}
                {openEditModal}
                showDepartment={departmentFilter === undefined}
                selectable={isDepartmentMode}
                selected={selectedMembers.has(user.id)}
                onSelectChange={toggleMemberSelection}
              />
            {:else}
              <tr>
                <td colspan={String(columnCount())} class="empty-state">{$_('admin.users.noUsersFound')}</td>
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
  </div>

  <!-- Create Modal -->
  <Modal
    isOpen={isCreateModalOpen}
    title={$_('admin.users.createNewUser')}
    onclose={() => (isCreateModalOpen = false)}
  >
    {#snippet children()}
      <form
        onsubmit={(e) => {
          e.preventDefault();
          handleCreate();
        }}
        class="user-form"
      >
        <div class="form-group">
          <label for="create-email">{$_('admin.common.email')} <span class="required">*</span></label
          >
          <input
            id="create-email"
            type="email"
            bind:value={formData.email}
            placeholder="user@example.com"
            required
            class:error={formErrors.email}
          />
          {#if formErrors.email}
            <span class="error-text">{formErrors.email}</span>
          {/if}
        </div>

        <div class="form-group">
          <label for="create-name">{$_('admin.common.name')}</label>
          <input
            id="create-name"
            type="text"
            bind:value={formData.name}
            placeholder={$_('admin.users.namePlaceholder')}
          />
        </div>

        <div class="form-group">
          <label for="create-role">{$_('admin.common.role')}</label>
          <select id="create-role" bind:value={formData.role}>
            <option value="user">{$_('admin.common.user')}</option>
            <option value="admin">{$_('admin.common.admin')}</option>
          </select>
        </div>

        <div class="form-group">
          <label for="create-department">{$_('admin.common.department')}</label>
          <input
            id="create-department"
            type="text"
            bind:value={formData.department}
            placeholder={$_('admin.users.departmentPlaceholder')}
          />
        </div>

        <div class="form-actions">
          <button
            type="button"
            class="btn"
            onclick={() => (isCreateModalOpen = false)}
          >
            {$_('common.cancel')}
          </button>
          <button type="submit" class="btn-primary" disabled={isSubmitting}>
            {isSubmitting ? $_('admin.common.creating') : $_('admin.users.createUser')}
          </button>
        </div>
      </form>
    {/snippet}
  </Modal>

  <!-- Edit Modal -->
  <Modal
    isOpen={isEditModalOpen}
    title={$_('admin.users.editUser')}
    onclose={() => (isEditModalOpen = false)}
  >
    {#snippet children()}
      <form
        onsubmit={(e) => {
          e.preventDefault();
          handleUpdate();
        }}
        class="user-form"
      >
        <div class="form-group">
          <label for="edit-email">{$_('admin.common.email')}</label>
          <input
            id="edit-email"
            type="email"
            bind:value={formData.email}
            disabled
          />
        </div>

        <div class="form-group">
          <label for="edit-name">{$_('admin.common.name')}</label>
          <input
            id="edit-name"
            type="text"
            bind:value={formData.name}
            placeholder={$_('admin.users.namePlaceholder')}
          />
        </div>

        <div class="form-group">
          <label for="edit-role">{$_('admin.common.role')}</label>
          <select id="edit-role" bind:value={formData.role}>
            <option value="user">{$_('admin.common.user')}</option>
            <option value="admin">{$_('admin.common.admin')}</option>
          </select>
        </div>

        <div class="form-group">
          <label for="edit-department">{$_('admin.common.department')}</label>
          <input
            id="edit-department"
            type="text"
            bind:value={formData.department}
            placeholder={$_('admin.users.departmentPlaceholder')}
          />
        </div>

        <div class="form-actions">
          <button
            type="button"
            class="btn"
            onclick={() => (isEditModalOpen = false)}
          >
            {$_('common.cancel')}
          </button>
          <button type="submit" class="btn-primary" disabled={isSubmitting}>
            {isSubmitting ? $_('admin.common.updating') : $_('admin.users.updateUser')}
          </button>
        </div>
      </form>
    {/snippet}
  </Modal>

  <!-- Add Member Modal (department mode) -->
  {#if showAddMember && department}
    <AddMemberModal
      departmentId={department.id}
      onclose={() => showAddMember = false}
      onSuccess={handleMembersAdded}
    />
  {/if}
</div>

<style>
  .users-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    background: transparent;
    overflow: hidden;
  }

  .panel-header {
    padding: 20px;
    border-bottom: 1px solid var(--glass-stroke-dark);
  }

  .header-content {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
  }

  .header-actions {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-shrink: 0;
  }

  .header-titles h2 {
    font-size: 20px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 4px 0;
  }

  .subtitle {
    color: var(--text-secondary);
    font-size: 14px;
    margin: 0;
  }

  .panel-content {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
  }

  .filters-section {
    padding: var(--space-lg);
    margin-bottom: var(--space-lg);
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
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: var(--space-md);
  }

  .filter-input,
  .filter-select {
    width: 100%;
  }

  .reset-btn {
    max-width: 100px;
  }

  .checkbox-col {
    width: 40px;
    text-align: center;
  }

  .checkbox-col input[type="checkbox"] {
    cursor: pointer;
    width: 16px;
    height: 16px;
  }

  .btn-danger {
    padding: 8px 16px;
    background: var(--brand-red);
    border: none;
    border-radius: var(--radius-sm);
    font-size: 14px;
    font-weight: 500;
    color: white;
    cursor: pointer;
    transition: background 0.2s;
  }

  .btn-danger:hover {
    background: color-mix(in oklab, var(--brand-red) 90%, black);
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

  .form-group label {
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
