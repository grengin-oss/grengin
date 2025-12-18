<script lang="ts">
  import { onMount } from "svelte";
  import { usersStore } from "../stores/index.js";
  import AdminTableCard from "../components/AdminTableCard.svelte";
  import PageHeader from "../components/PageHeader.svelte";
  import LoadingSpinner from "../components/LoadingSpinner.svelte";
  import Modal from "../components/Modal.svelte";
  import { toast } from "../../components/Toaster.svelte";
  import type { User } from "../types.js";

  let isCreateModalOpen = $state(false);
  let isEditModalOpen = $state(false);
  let selectedUser = $state<User | null>(null);
  let searchQuery = $state("");
  let filterRole = $state("");
  let filterStatus = $state("active");
  let filterDepartment = $state("");

  // Form state
  let formData = $state({
    email: "",
    name: "",
    role: "user",
    department: "",
  });

  let formErrors = $state<Record<string, string>>({});
  let isSubmitting = $state(false);

  onMount(() => {
    usersStore.fetch();
  });

  // Handle errors with toast
  $effect(() => {
    if (usersStore.error) {
      toast.error(usersStore.error);
      usersStore.clearError();
    }
  });

  function applyFilters() {
    usersStore.setFilters({
      search: searchQuery,
      role: filterRole,
      status: filterStatus,
      department: filterDepartment,
    });
  }

  function clearFilters() {
    searchQuery = "";
    filterRole = "";
    filterStatus = "active";
    filterDepartment = "";
    usersStore.setFilters({
      search: "",
      role: "",
      status: "active",
      department: "",
    });
  }

  function openCreateModal() {
    formData = { email: "", name: "", role: "user", department: "" };
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
      formErrors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      formErrors.email = "Invalid email format";
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
      toast.success("User created successfully");
    } catch (err: any) {
      toast.error(err.detail?.message || "Failed to create user");
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
      toast.success("User updated successfully");
    } catch (err: any) {
      toast.error(err.message || "Failed to update user");
    } finally {
      isSubmitting = false;
    }
  }

  async function toggleUserStatus(user: User) {
    const newStatus = user.status === 'active' ? 'deactivated' : 'active';
    
    try {
      await usersStore.updateStatus(user.id, newStatus);
      toast.success(`User ${newStatus === 'active' ? 'activated' : 'deactivated'} successfully`);
    } catch (err: any) {
      toast.error(err.detail?.message || 'Failed to update user status');
    }
  }

  function handlePageChange(page: number) {
    usersStore.setPage(page);
  }

  const currentPage = $derived(
    Math.floor(usersStore.offset / usersStore.limit),
  );
  const totalPages = $derived(Math.ceil(usersStore.total / usersStore.limit));
</script>

<div class="users-container">
  <PageHeader title="User Management" subtitle="Manage users and their roles">
    {#snippet children()}
      <button class="btn-primary" onclick={openCreateModal}>
        + Create User
      </button>
    {/snippet}
  </PageHeader>

  <!-- Filters -->
  <div class="filters-section">
    <div class="filters-grid">
      <input
        type="text"
        placeholder="Search by name..."
        bind:value={searchQuery}
        onkeyup={(e) => e.key === "Enter" && applyFilters()}
        class="filter-input"
      />
      <select bind:value={filterRole} class="filter-select">
        <option value="">All Roles</option>
        <option value="admin">Admin</option>
        <option value="user">User</option>
      </select>
      <select bind:value={filterStatus} class="filter-select">
        <option value="">All Statuses</option>
        <option value="active">Active</option>
        <option value="deactivated">Deactivated</option>
      </select>
      <input
        type="text"
        placeholder="Department"
        bind:value={filterDepartment}
        onkeyup={(e) => e.key === "Enter" && applyFilters()}
        class="filter-input"
      />
    </div>
    <div class="filters-actions">
      <button class="btn-primary" onclick={applyFilters}>Apply Filters</button>
      <button class="btn" onclick={clearFilters}>Clear</button>
    </div>
  </div>

  {#if usersStore.isLoading}
    <LoadingSpinner size="lg" text="Loading users..." />
  {:else}
    <!-- Users Table -->
    <AdminTableCard minWidth="960px">
      <table class="admin-table users-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Department</th>
            <th>Status</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each usersStore.users as user (user.id)}
            <tr>
              <td>{user.name || "-"}</td>
              <td>{user.email}</td>
              <td>
                <span class="role-badge {user.role}">
                  {user.role || "user"}
                </span>
              </td>
              <td>{user.department || "-"}</td>
              <td>
                {#if !user.is_super_admin}
                  <label class="status-switch">
                    <input
                      type="checkbox"
                      checked={user.status === 'active'}
                      onchange={() => toggleUserStatus(user)}
                    />
                    <span class="status-slider"></span>
                    <span class="status-label">
                      {user.status === 'active' ? 'Active' : 'Deactivated'}
                    </span>
                  </label>
                {:else}
                  <span class="status-badge active">Active</span>
                {/if}
              </td>
              <td
                >{user.created_at
                  ? new Date(user.created_at).toLocaleDateString()
                  : "-"}</td
              >
              <td>
                <div class="actions">
                  <button
                    class="action-btn edit"
                    onclick={() => openEditModal(user)}
                    title="Edit user"
                  >
                    ✏️
                  </button>
                </div>
              </td>
            </tr>
          {:else}
            <tr>
              <td colspan="7" class="empty-state">No users found</td>
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
          Previous
        </button>
        <span class="pagination-info">
          Page {currentPage + 1} of {totalPages}
        </span>
        <button
          class="btn"
          onclick={() => handlePageChange(currentPage + 1)}
          disabled={currentPage >= totalPages - 1}
        >
          Next
        </button>
      </div>
    {/if}
  {/if}

  <!-- Create Modal -->
  <Modal
    isOpen={isCreateModalOpen}
    title="Create New User"
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
          <label for="create-email">Email <span class="required">*</span></label
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
          <label for="create-name">Name</label>
          <input
            id="create-name"
            type="text"
            bind:value={formData.name}
            placeholder="John Doe"
          />
        </div>

        <div class="form-group">
          <label for="create-role">Role</label>
          <select id="create-role" bind:value={formData.role}>
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </div>

        <div class="form-group">
          <label for="create-department">Department</label>
          <input
            id="create-department"
            type="text"
            bind:value={formData.department}
            placeholder="Engineering"
          />
        </div>

        <div class="form-actions">
          <button
            type="button"
            class="btn"
            onclick={() => (isCreateModalOpen = false)}
          >
            Cancel
          </button>
          <button type="submit" class="btn-primary" disabled={isSubmitting}>
            {isSubmitting ? "Creating..." : "Create User"}
          </button>
        </div>
      </form>
    {/snippet}
  </Modal>

  <!-- Edit Modal -->
  <Modal
    isOpen={isEditModalOpen}
    title="Edit User"
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
          <label for="edit-email">Email</label>
          <input
            id="edit-email"
            type="email"
            bind:value={formData.email}
            disabled
          />
        </div>

        <div class="form-group">
          <label for="edit-name">Name</label>
          <input
            id="edit-name"
            type="text"
            bind:value={formData.name}
            placeholder="John Doe"
          />
        </div>

        <div class="form-group">
          <label for="edit-role">Role</label>
          <select id="edit-role" bind:value={formData.role}>
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </div>

        <div class="form-group">
          <label for="edit-department">Department</label>
          <input
            id="edit-department"
            type="text"
            bind:value={formData.department}
            placeholder="Engineering"
          />
        </div>

        <div class="form-actions">
          <button
            type="button"
            class="btn"
            onclick={() => (isEditModalOpen = false)}
          >
            Cancel
          </button>
          <button type="submit" class="btn-primary" disabled={isSubmitting}>
            {isSubmitting ? "Updating..." : "Update User"}
          </button>
        </div>
      </form>
    {/snippet}
  </Modal>

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
    background: rgba(var(--glass-tint), 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-lg);
    margin-bottom: var(--space-xl);
  }

  .filters-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--space-md);
    margin-bottom: var(--space-lg);
  }

  .filter-input,
  .filter-select {
    width: 100%;
  }

  .filters-actions {
    display: flex;
    gap: var(--space-md);
  }

  .role-badge,
  .status-badge {
    display: inline-block;
    padding: var(--space-xs) var(--space-sm);
    border-radius: var(--radius-sm);
    font-size: 0.8125rem;
    font-weight: 600;
    text-transform: uppercase;
  }

  .role-badge.admin {
    background: rgba(var(--brand-rgb), 0.15);
    color: var(--brand);
  }

  .role-badge.user {
    background: rgba(var(--glass-tint), 0.1);
    color: var(--text-secondary);
  }

  .status-badge.active {
    background: rgba(var(--brand-green-rgb), 0.15);
    color: var(--brand-green);
  }

  .status-badge.deactivated {
    background: rgba(var(--brand-red-rgb), 0.15);
    color: var(--brand-red);
  }

  .actions {
    display: flex;
    gap: var(--space-sm);
  }

  .action-btn {
    padding: var(--space-xs) var(--space-sm);
    border: none;
    background: transparent;
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition: all 0.2s ease;
    font-size: 1rem;
  }

  .action-btn:hover {
    background: rgba(var(--glass-tint), 0.08);
    transform: scale(1.1);
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

  /* Status Switch */
  .status-switch {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    cursor: pointer;
    position: relative;
  }

  .status-switch input[type="checkbox"] {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }

  .status-slider {
    position: relative;
    display: inline-block;
    width: 44px;
    height: 24px;
    background: rgba(143, 143, 143, 0.2);
    border-radius: 24px;
    transition: all 0.3s ease;
    flex-shrink: 0;
  }

  .status-slider::before {
    content: '';
    position: absolute;
    height: 18px;
    width: 18px;
    left: 3px;
    top: 3px;
    background: var(--brand-red);
    border-radius: 50%;
    transition: all 0.3s ease;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .status-switch input:checked + .status-slider::before {
    background: var(--brand-green);
    transform: translateX(20px);
  }

  .status-label {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text-secondary);
    min-width: 90px;
  }

  .status-switch:hover .status-slider {
    opacity: 0.9;
  }

  @media (max-width: 768px) {
    .filters-grid {
      grid-template-columns: 1fr;
    }

    .filters-actions {
      flex-direction: column;
    }

    .pagination {
      flex-direction: column;
      gap: var(--space-md);
    }

    .confirm-actions {
      flex-direction: column;
    }
  }
</style>

