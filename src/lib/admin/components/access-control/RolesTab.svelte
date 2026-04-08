<script lang="ts">
  import type { Role } from "../../../api/admin/roles.js";
  import type { Permission } from "../../../api/admin/permissions.js";
  import type { User } from "../../types.js";
  import LoadingSpinner from "../LoadingSpinner.svelte";
  import AdminPanelCard from "../AdminPanelCard.svelte";
  import AdminEmptyState from "../AdminEmptyState.svelte";
  import Modal from "../Modal.svelte";
  import RoleFormModal from "./RoleFormModal.svelte";
  import DepartmentScopingModal from "./DepartmentScopingModal.svelte";
  import { toast } from "../../../components/Toaster.svelte";
  import { ApiError } from "../../../api/client.js";
  import { getLocalizedError } from "../../../utils/errorLocalization.js";
  import { _ } from "svelte-i18n";
  import { tick } from "svelte";
  import { getUsers } from "../../../api/admin/users.js";
  import * as rolesApi from "../../../api/admin/roles.js";
  import { formatAction, formatDomain } from "./permissionGroups";
  import { permissionsStore } from "../../../features/auth/index.js";

  interface Props {
    roles: Role[];
    permissions: Permission[];
    loading: boolean;
    onRolesChange: () => void;
  }

  let { roles, permissions, loading, onRolesChange }: Props = $props();
  const canManageRoles = $derived(permissionsStore.canManageRoles());
  const canAssignRoles = $derived(permissionsStore.canAssignRoles());

  const sortedRoles = $derived(
    [...roles].sort((a, b) => {
      if (a.is_system === b.is_system) return 0;
      return a.is_system ? 1 : -1;
    }),
  );

  let roleFormOpen = $state<"add" | Role | null>(null);
  let roleToDelete = $state<Role | null>(null);
  let deletingRole = $state(false);

  // Collapsible sections per role: users and permissions (both collapsed by default)
  let expandedUsersSections = $state<Record<string, boolean>>({});
  let expandedPermsSections = $state<Record<string, boolean>>({});

  const PAGE_SIZE = 10;

  // Per-role state
  let roleUsers = $state<Record<string, User[]>>({});
  let roleUsersTotal = $state<Record<string, number>>({});
  let roleUsersPage = $state<Record<string, number>>({});
  let showAddUserSearch = $state<string | null>(null);
  let addUserSearchQuery = $state("");
  let addUserSearchResults = $state<User[]>([]);
  let addUserSearching = $state(false);
  let addingUserId = $state<string | null>(null);
  let userToRemove = $state<{ user: User; roleId: string } | null>(null);
  let removingUser = $state(false);
  let roleUsersLoading = $state<Record<string, boolean>>({});
  let searchTimeout: number | undefined;
  let searchInputRef = $state<HTMLInputElement | null>(null);
  let departmentScopingContext = $state<{ role: Role; user: User } | null>(
    null,
  );

  async function loadRoleUsers(roleId: string, page = 1) {
    if (roleUsersLoading[roleId]) return;
    roleUsersLoading = { ...roleUsersLoading, [roleId]: true };
    roleUsersPage = { ...roleUsersPage, [roleId]: page };
    try {
      const offset = (page - 1) * PAGE_SIZE;
      const response = await getUsers({
        role_id: roleId,
        limit: PAGE_SIZE,
        offset,
        sort: "updated_at",
        ascending: false,
      });
      roleUsers = { ...roleUsers, [roleId]: response.users };
      roleUsersTotal = { ...roleUsersTotal, [roleId]: response.total };
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? getLocalizedError(err, "description", $_)
          : (err as Error).message;
      toast.error(msg || $_("admin.accessControl.failedToLoadUsers"));
      roleUsers = { ...roleUsers, [roleId]: [] };
      roleUsersTotal = { ...roleUsersTotal, [roleId]: 0 };
    } finally {
      roleUsersLoading = { ...roleUsersLoading, [roleId]: false };
    }
  }

  function getRoleTotalPages(roleId: string): number {
    const total = roleUsersTotal[roleId] ?? 0;
    return Math.max(1, Math.ceil(total / PAGE_SIZE));
  }

  function getRolePermissionsByDomain(role: Role): Record<string, string[]> {
    const byDomain: Record<string, string[]> = {};
    for (const key of role.permissions) {
      const [domain, action] = key.split(":");
      if (domain && action) {
        if (!byDomain[domain]) byDomain[domain] = [];
        byDomain[domain].push(action);
      }
    }
    return byDomain;
  }

  function isSuperAdmin(role: Role): boolean {
    return role.name === "Super Admin";
  }

  function canEditRole(role: Role): boolean {
    return !isSuperAdmin(role) && !role.is_system;
  }

  function canDeleteRole(role: Role): boolean {
    return !isSuperAdmin(role) && !role.is_system;
  }

  function openEditRole(role: Role) {
    if (!canManageRoles) return;
    roleFormOpen = role;
  }

  // Load role users when users section is expanded
  $effect(() => {
    const sections = expandedUsersSections;
    for (const r of sortedRoles) {
      if ((sections[r.id] ?? false) && !(r.id in roleUsers)) {
        loadRoleUsers(r.id, 1);
      }
    }
  });

  function toggleUsersSection(roleId: string, e: Event) {
    e.stopPropagation();
    const wasExpanded = expandedUsersSections[roleId] ?? false;
    expandedUsersSections = {
      ...expandedUsersSections,
      [roleId]: !wasExpanded,
    };
    if (wasExpanded && showAddUserSearch === roleId) {
      resetAddUserSearch();
    }
  }

  function togglePermsSection(roleId: string, e: Event) {
    e.stopPropagation();
    expandedPermsSections = {
      ...expandedPermsSections,
      [roleId]: !(expandedPermsSections[roleId] ?? false),
    };
  }

  function isUsersExpanded(roleId: string): boolean {
    return expandedUsersSections[roleId] ?? false;
  }

  function isPermsExpanded(roleId: string): boolean {
    return expandedPermsSections[roleId] ?? false;
  }

  function toggleAddUserSearch(roleId: string) {
    if (!canAssignRoles) return;
    if (showAddUserSearch === roleId) {
      resetAddUserSearch();
    } else {
      showAddUserSearch = roleId;
      addUserSearchQuery = "";
      addUserSearchResults = [];
      tick().then(() => searchInputRef?.focus());
    }
  }

  function openAddUser(roleId: string) {
    if (!canAssignRoles) return;
    expandedUsersSections = { ...expandedUsersSections, [roleId]: true };
    toggleAddUserSearch(roleId);
  }

  function resetAddUserSearch() {
    showAddUserSearch = null;
    addUserSearchQuery = "";
    addUserSearchResults = [];
    addingUserId = null;
    tick().then(() => searchInputRef?.blur());
  }

  function handleAddUserSearchInput(e: Event) {
    const target = e.target as HTMLInputElement;
    addUserSearchQuery = target.value;

    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }

    searchTimeout = setTimeout(() => {
      searchAddUser(addUserSearchQuery);
    }, 300);
  }

  function handleAddUserSearchKeydown(event: KeyboardEvent, roleId: string) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    toggleAddUserSearch(roleId);
  }

  async function searchAddUser(query: string) {
    const roleId = showAddUserSearch;
    if (!roleId || !query.trim()) {
      addUserSearchResults = [];
      return;
    }

    addUserSearching = true;
    try {
      const response = await getUsers({
        search: query,
        limit: 10,
        status: "active",
        sort: "updated_at",
        ascending: false,
      });
      const currentIds = (roleUsers[roleId] ?? []).map((u) => u.id);
      addUserSearchResults = response.users.filter(
        (u) => !currentIds.includes(u.id),
      );
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? getLocalizedError(err, "description", $_)
          : (err as Error).message;
      toast.error(msg || $_("admin.accessControl.failedToSearchUsers"));
      addUserSearchResults = [];
    } finally {
      addUserSearching = false;
    }
  }

  async function handleAddUser(user: User) {
    if (!canAssignRoles) return;
    const roleId = showAddUserSearch;
    if (!roleId) return;

    addingUserId = user.id;
    try {
      await rolesApi.addRoleToUser(user.id, { role_id: roleId });
      toast.success($_("admin.accessControl.userAdded"));
      resetAddUserSearch();
      const currentPage = roleUsersPage[roleId] ?? 1;
      await loadRoleUsers(roleId, currentPage);
      onRolesChange();
    } catch (err) {
      addingUserId = null;
      const msg =
        err instanceof ApiError
          ? getLocalizedError(err, "description", $_)
          : (err as Error).message;
      toast.error(msg || $_("admin.accessControl.failedToAddUser"));
    }
  }

  function confirmRemoveUser(user: User, roleId: string) {
    if (!canAssignRoles) return;
    userToRemove = { user, roleId };
  }

  function closeRemoveModal() {
    userToRemove = null;
  }

  async function handleRemoveUser() {
    if (!userToRemove) return;
    const { user, roleId } = userToRemove;
    removingUser = true;
    try {
      const { assignments } = await rolesApi.getUserRoleAssignments(user.id);
      const roleAssignments = assignments.filter((a) => a.role_id === roleId);
      if (roleAssignments.length === 0) {
        toast.error($_("admin.accessControl.failedToRemoveUser"));
        return;
      }
      await Promise.all(
        roleAssignments.map((assignment) =>
          rolesApi.removeRoleFromUser(user.id, assignment.id),
        ),
      );
      userToRemove = null;
      const currentPage = roleUsersPage[roleId] ?? 1;
      await loadRoleUsers(roleId, currentPage);
      toast.success($_("admin.accessControl.userRemoved"));
      onRolesChange();
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? getLocalizedError(err, "description", $_)
          : (err as Error).message;
      toast.error(msg || $_("admin.accessControl.failedToRemoveUser"));
    } finally {
      removingUser = false;
    }
  }

  function openDepartmentModal(role: Role, user: User) {
    if (!canAssignRoles) return;
    departmentScopingContext = { role, user };
  }

  function closeDepartmentModal() {
    departmentScopingContext = null;
  }

  async function handleDepartmentScopingUpdate() {
    const context = departmentScopingContext;
    if (!context) return;
    const roleId = context.role.id;
    const currentPage = roleUsersPage[roleId] ?? 1;
    await loadRoleUsers(roleId, currentPage);
    onRolesChange();
  }

  function handleRoleFormSuccess() {
    onRolesChange();
    roleFormOpen = null;
  }

  async function handleDeleteRole() {
    if (!canManageRoles) return;
    if (!roleToDelete) return;
    deletingRole = true;
    try {
      await rolesApi.deleteRole(roleToDelete.id);
      toast.success($_("admin.accessControl.roleDeleted"));
      roleToDelete = null;
      onRolesChange();
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? getLocalizedError(err, "description", $_)
          : (err as Error).message;
      toast.error(msg || $_("admin.accessControl.failedToDeleteRole"));
    } finally {
      deletingRole = false;
    }
  }
</script>

{#if loading}
  <LoadingSpinner text={$_("admin.accessControl.loadingRoles")} />
{:else if roles.length === 0}
  <AdminEmptyState
    title={$_("admin.accessControl.noRolesTitle")}
    message={$_("admin.accessControl.noRolesMessage")}
  />
{:else}
  <div class="roles-tab">
    {#if canManageRoles}
      <div class="roles-header">
        <button
          class="btn-add-role btn-primary"
          onclick={() => (roleFormOpen = "add")}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M7 3v8M3 7h8"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
            />
          </svg>
          {$_("admin.accessControl.addRoleButton")}
        </button>
      </div>
    {/if}

    <div class="roles-list">
      {#each sortedRoles as role (role.id)}
        <AdminPanelCard
          class={showAddUserSearch === role.id ? "dropdown-open" : ""}
        >
          <div class="role-header">
            <span class="role-name">
              {role.name}
              {#if role.is_system}
                <span class="system-badge">
                  ({$_("admin.accessControl.systemRoleLabel")})
                </span>
              {/if}
            </span>
            <span class="user-count">
              {$_("admin.accessControl.userCountLabel", {
                values: { count: role.user_count ?? 0 },
              })}
            </span>
            <div class="role-actions">
              {#if canAssignRoles}
                <button
                  type="button"
                  class="btn-role-action btn-add"
                  onclick={() => openAddUser(role.id)}
                  title={$_("admin.accessControl.addUser")}
                  aria-label={$_("admin.accessControl.addUser")}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                    aria-hidden="true"
                  >
                    <path d="M8 3v10M3 8h10" stroke-linecap="round" />
                  </svg>
                  <span class="btn-role-action-label">{$_("admin.accessControl.addUser")}</span>
                </button>
              {/if}
              {#if canManageRoles && canEditRole(role)}
                <button
                  type="button"
                  class="btn-role-action"
                  onclick={() => openEditRole(role)}
                  title={$_("admin.accessControl.editRole")}
                  aria-label={$_("admin.accessControl.editRole")}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                    aria-hidden="true"
                  >
                    <path
                      d="M11.5 2.5a1.5 1.5 0 0 1 2.12 2.12L5 11.25v2.25h2.25l6.62-6.62a1.5 1.5 0 0 0-2.12-2.12L5.25 11"
                    />
                  </svg>
                  <span class="btn-role-action-label">{$_("common.edit")}</span>
                </button>
              {/if}
              {#if canManageRoles && canDeleteRole(role)}
                <button
                  type="button"
                  class="btn-role-action btn-delete"
                  onclick={() => (roleToDelete = role)}
                  title={$_("admin.accessControl.deleteRole")}
                  aria-label={$_("admin.accessControl.deleteRole")}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                    aria-hidden="true"
                  >
                    <path
                      d="M2 4h12M5 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1m2 0v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4h10z"
                    />
                    <path d="M6 7v4M10 7v4" />
                  </svg>
                  <span class="btn-role-action-label">{$_("common.delete")}</span>
                </button>
              {/if}
            </div>
          </div>

          <div class="role-content">
            <div class="collapsible-section">
              <div class="collapsible-header">
                <button
                  class="collapsible-toggle"
                  onclick={(e) => toggleUsersSection(role.id, e)}
                  aria-expanded={isUsersExpanded(role.id)}
                >
                  <span class="collapsible-icon" aria-hidden="true">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path
                        d="M4.5 3L8 6L4.5 9"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    </svg>
                  </span>
                  <span class="collapsible-label"
                    >{$_("admin.accessControl.usersWithRole")}</span
                  >
                  <span class="collapsible-badge">{role.user_count ?? 0}</span>
                </button>
              </div>
              {#if isUsersExpanded(role.id)}
                <div class="collapsible-body">
                  {#if showAddUserSearch === role.id}
                    <div class="user-search-wrapper">
                      <div class="user-search-box">
                        <svg
                          class="search-icon"
                          width="18"
                          height="18"
                          viewBox="0 0 18 18"
                          fill="none"
                        >
                          <circle
                            cx="8"
                            cy="8"
                            r="5.5"
                            stroke="currentColor"
                            stroke-width="1.5"
                          />
                          <path
                            d="M12 12L16 16"
                            stroke="currentColor"
                            stroke-width="1.5"
                            stroke-linecap="round"
                          />
                        </svg>
                        <input
                          type="text"
                          class="user-search-input"
                          placeholder={$_(
                            "admin.accessControl.searchUsersToAdd",
                          )}
                          bind:value={addUserSearchQuery}
                          bind:this={searchInputRef}
                          oninput={handleAddUserSearchInput}
                          onkeydown={(event) =>
                            handleAddUserSearchKeydown(event, role.id)}
                        />
                        <button
                          class="search-close-btn"
                          onclick={() => toggleAddUserSearch(role.id)}
                          aria-label={$_("admin.accessControl.closeSearch")}
                        >
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 16 16"
                            fill="none"
                          >
                            <path
                              d="M12 4L4 12M4 4L12 12"
                              stroke="currentColor"
                              stroke-width="1.5"
                              stroke-linecap="round"
                            />
                          </svg>
                        </button>
                      </div>

                      {#if addUserSearching}
                        <div class="user-search-dropdown">
                          <div class="search-loading"><LoadingSpinner /></div>
                        </div>
                      {:else if addUserSearchQuery && addUserSearchResults.length > 0}
                        <div class="user-search-dropdown">
                          {#each addUserSearchResults as user (user.id)}
                            <button
                              class="search-result-item"
                              onclick={() => handleAddUser(user)}
                              disabled={addingUserId !== null}
                            >
                              <span class="user-avatar" aria-hidden="true"
                                >{user.name?.charAt(0) ??
                                  user.email?.charAt(0) ??
                                  "?"}</span
                              >
                              <div class="user-info">
                                <span class="user-name"
                                  >{user.name || user.email}</span
                                >
                                <span class="user-email">{user.email}</span>
                              </div>
                              {#if addingUserId === user.id}
                                <div class="adding-spinner">
                                  <LoadingSpinner />
                                </div>
                              {:else}
                                <div class="add-button">
                                  <svg
                                    width="16"
                                    height="16"
                                    viewBox="0 0 16 16"
                                    fill="none"
                                  >
                                    <path
                                      d="M8 3V13M3 8H13"
                                      stroke="currentColor"
                                      stroke-width="2"
                                      stroke-linecap="round"
                                    />
                                  </svg>
                                </div>
                              {/if}
                            </button>
                          {/each}
                        </div>
                      {:else if addUserSearchQuery && addUserSearchResults.length === 0 && !addUserSearching}
                        <div class="user-search-dropdown">
                          <div class="no-results">
                            <p>{$_("admin.accessControl.noUsersFound")}</p>
                          </div>
                        </div>
                      {/if}
                    </div>
                  {/if}

                  {#if roleUsersLoading[role.id] && (roleUsers[role.id] ?? []).length === 0}
                    <div class="users-loading">
                      <LoadingSpinner />
                      <p>{$_("admin.accessControl.loadingUsers")}</p>
                    </div>
                  {:else if (roleUsers[role.id] ?? []).length === 0}
                    <div class="users-empty">
                      <p>{$_("admin.accessControl.noUsersInRole")}</p>
                    </div>
                  {:else}
                    <ul class="users-list" role="list">
                      {#each roleUsers[role.id] ?? [] as user (user.id)}
                        <li class="user-item">
                          <div class="user-info">
                            <span class="user-name-row">
                              <span class="user-name"
                                >{user.name || user.email}</span
                              >
                              {#if user.status && user.status !== "active"}
                                <span class="status-capsule"
                                  >{$_("admin.common.deactivated")}</span
                                >
                              {/if}
                            </span>
                            <span class="user-email">{user.email}</span>
                          </div>
                          {#if canAssignRoles}
                            <div class="user-actions">
                              <button
                                class="btn-edit-departments"
                                onclick={() => openDepartmentModal(role, user)}
                              >
                                {$_("admin.accessControl.manageScoping")}
                              </button>
                              <button
                                class="btn-remove-user"
                                onclick={(e) => {
                                  e.stopPropagation();
                                  confirmRemoveUser(user, role.id);
                                }}
                              >
                                {$_("admin.accessControl.removeUser")}
                              </button>
                            </div>
                          {/if}
                        </li>
                      {/each}
                    </ul>
                    {#if (roleUsersTotal[role.id] ?? 0) > PAGE_SIZE}
                      <div class="users-pagination">
                        <button
                          class="btn-pagination"
                          onclick={(e) => {
                            e.stopPropagation();
                            loadRoleUsers(
                              role.id,
                              (roleUsersPage[role.id] ?? 1) - 1,
                            );
                          }}
                          disabled={(roleUsersPage[role.id] ?? 1) <= 1 ||
                            roleUsersLoading[role.id]}
                        >
                          {$_("admin.common.previous")}
                        </button>
                        <span class="pagination-info">
                          {$_("admin.common.pageInfo", {
                            values: {
                              current: roleUsersPage[role.id] ?? 1,
                              total: getRoleTotalPages(role.id),
                              count: roleUsersTotal[role.id] ?? 0,
                            },
                          })}
                        </span>
                        <button
                          class="btn-pagination"
                          onclick={(e) => {
                            e.stopPropagation();
                            loadRoleUsers(
                              role.id,
                              (roleUsersPage[role.id] ?? 1) + 1,
                            );
                          }}
                          disabled={(roleUsersPage[role.id] ?? 1) >=
                            getRoleTotalPages(role.id) ||
                            roleUsersLoading[role.id]}
                        >
                          {$_("admin.common.next")}
                        </button>
                      </div>
                    {/if}
                  {/if}
                </div>
              {/if}
            </div>

            <div class="collapsible-section">
              <div class="collapsible-header">
                <button
                  class="collapsible-toggle"
                  onclick={(e) => togglePermsSection(role.id, e)}
                  aria-expanded={isPermsExpanded(role.id)}
                >
                  <span class="collapsible-icon" aria-hidden="true">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path
                        d="M4.5 3L8 6L4.5 9"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    </svg>
                  </span>
                  <span class="collapsible-label"
                    >{$_("admin.accessControl.permissionsInRole")}</span
                  >
                  <span class="collapsible-badge"
                    >{role.permissions.length}</span
                  >
                </button>
              </div>
              {#if isPermsExpanded(role.id)}
                <div class="collapsible-body permissions-body">
                  {#if role.permissions.length === 0}
                    <p class="permissions-empty">
                      {$_("admin.accessControl.noPermissionsInRole")}
                    </p>
                  {:else}
                    <div class="permissions-grid">
                      {#each Object.entries(getRolePermissionsByDomain(role)) as [domain, actions]}
                        <div class="perm-domain-block">
                          <span class="perm-domain-name"
                            >{formatDomain(domain)}</span
                          >
                          <div class="perm-chips">
                            {#each actions as action}
                              <span class="perm-chip"
                                >{formatAction(action)}</span
                              >
                            {/each}
                          </div>
                        </div>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/if}
            </div>
          </div>
        </AdminPanelCard>
      {/each}
    </div>
  </div>
{/if}

{#if roleFormOpen}
  <RoleFormModal
    role={roleFormOpen === "add" ? null : roleFormOpen}
    {permissions}
    onclose={() => (roleFormOpen = null)}
    onSuccess={handleRoleFormSuccess}
  />
{/if}

{#if roleToDelete}
  <Modal
    isOpen={!!roleToDelete}
    onclose={() => (roleToDelete = null)}
    title={$_("admin.accessControl.deleteRoleConfirmTitle")}
  >
    <div class="remove-confirm">
      <p>
        {$_("admin.accessControl.deleteRoleConfirmMessage", {
          values: { name: roleToDelete.name },
        })}
      </p>
      <p class="warning">
        {$_("admin.accessControl.deleteRoleConfirmWarning")}
      </p>
      <div class="modal-actions">
        <button
          class="btn-secondary"
          onclick={() => (roleToDelete = null)}
          disabled={deletingRole}>{$_("common.cancel")}</button
        >
        <button
          class="btn-danger"
          onclick={handleDeleteRole}
          disabled={deletingRole}
        >
          {#if deletingRole}
            <span class="btn-loading">
              <LoadingSpinner size="sm" />
              {$_("admin.accessControl.deleting")}
            </span>
          {:else}
            {$_("common.delete")}
          {/if}
        </button>
      </div>
    </div>
  </Modal>
{/if}

{#if userToRemove}
  <Modal
    isOpen={!!userToRemove}
    onclose={closeRemoveModal}
    title={$_("admin.accessControl.removeUserConfirmTitle")}
  >
    <div class="remove-confirm">
      <p>
        {$_("admin.accessControl.removeUserConfirmMessage", {
          values: { name: userToRemove.user.name || userToRemove.user.email },
        })}
      </p>
      <p class="warning">
        {$_("admin.accessControl.removeUserConfirmWarning")}
      </p>
      <div class="modal-actions">
        <button
          class="btn-secondary"
          onclick={closeRemoveModal}
          disabled={removingUser}>{$_("common.cancel")}</button
        >
        <button
          class="btn-danger"
          onclick={handleRemoveUser}
          disabled={removingUser}
        >
          {#if removingUser}
            <span class="btn-loading">
              <LoadingSpinner size="sm" />
              {$_("admin.common.removing")}
            </span>
          {:else}
            {$_("admin.accessControl.removeUser")}
          {/if}
        </button>
      </div>
    </div>
  </Modal>
{/if}

<DepartmentScopingModal
  role={departmentScopingContext?.role ?? null}
  user={departmentScopingContext?.user ?? null}
  isOpen={!!departmentScopingContext}
  onclose={closeDepartmentModal}
  onUpdate={handleDepartmentScopingUpdate}
/>

<style>
  .roles-tab {
    width: 100%;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-xl);
  }

  .roles-header {
    display: flex;
    justify-content: flex-end;
  }

  .btn-add-role {
    display: inline-flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-lg);
    font-size: 0.875rem;
  }

  .roles-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .role-header {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    width: 100%;
    padding: var(--space-md) var(--space-lg);
    font-size: 0.9375rem;
  }

  .role-actions {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    margin-left: auto;
  }

  .btn-role-action {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-xs) var(--space-sm);
    font-size: 0.8125rem;
    font-weight: 500;
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: var(--radius-md);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn-role-action:hover {
    background: rgba(255, 255, 255, 0.06);
    color: var(--text-primary);
    border-color: rgba(255, 255, 255, 0.18);
  }

  .btn-role-action.btn-add:hover {
    background: rgba(var(--brand-green-rgb), 0.1);
    color: var(--brand-green);
    border-color: rgba(var(--brand-green-rgb), 0.3);
  }

  .btn-role-action.btn-delete:hover {
    background: rgba(var(--brand-red-rgb), 0.1);
    color: var(--brand-red);
    border-color: rgba(var(--brand-red-rgb), 0.3);
  }

  @media (max-width: 640px) {
    .btn-role-action-label {
      display: none;
    }

    .btn-role-action {
      gap: 0;
      padding: var(--space-xs);
      justify-content: center;
    }
  }

  .role-name {
    font-weight: 600;
    color: var(--text-primary);
    flex: 1;
  }

  .system-badge {
    font-size: 0.6875rem;
    font-weight: 600;
    padding: 0.2rem 0.2rem;
    border-radius: var(--radius-md);
    background: rgba(var(--glass-tint), 0.08);
    color: var(--text-secondary);
    border: 1px solid rgba(255, 255, 255, 0.06);
  }

  .user-count {
    font-size: 0.8125rem;
    color: var(--text-secondary);
    font-weight: 500;
  }

  .role-content {
    padding-top: var(--space-lg);
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .collapsible-section {
    background: var(--surface-subtle, rgba(255, 255, 255, 0.03));
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: var(--radius-xl);
    overflow: visible;
  }

  .collapsible-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-md);
    padding: var(--space-md) var(--space-lg);
  }

  .collapsible-toggle {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    flex: 1;
    padding: 0.5rem;
    background: transparent;
    border: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
    text-align: left;
    transition: background 0.2s ease;
    border-radius: var(--radius-md);
  }

  .collapsible-toggle:hover {
    background: rgba(255, 255, 255, 0.04);
  }

  .collapsible-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    color: var(--text-secondary);
    transition: transform 0.2s ease;
    flex-shrink: 0;
  }

  .collapsible-toggle[aria-expanded="true"] .collapsible-icon {
    transform: rotate(90deg);
  }

  .collapsible-label {
    flex: 1;
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .collapsible-badge {
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.2rem 0.5rem;
    border-radius: var(--radius-full);
    background: rgba(var(--glass-tint), 0.12);
    color: var(--text-secondary);
  }

  .collapsible-body {
    padding: 0 var(--space-lg) var(--space-lg);
    padding-left: calc(var(--space-lg) + 20px + var(--space-md));
  }

  .permissions-body {
    padding-top: 0;
  }

  .permissions-empty {
    font-size: 0.875rem;
    color: var(--text-secondary);
    margin: 0;
    padding: var(--space-md) 0;
  }

  .permissions-grid {
    display: flex;
    flex-wrap: wrap;
    flex-direction: row;
    gap: var(--space-md);
    padding: var(--space-md) 0;
  }

  .perm-domain-block {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    padding: var(--space-lg);
    min-width: 140px;
    background: var(--button-bg, rgba(255, 255, 255, 0.02));
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-xl);
    box-shadow:
      0 2px 8px rgba(0, 0, 0, 0.12),
      0 1px 2px rgba(0, 0, 0, 0.08);
    border-left: 3px solid color-mix(in oklab, var(--brand) 40%, transparent);
  }

  .perm-domain-name {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .perm-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
  }

  .perm-chip {
    font-size: 0.75rem;
    font-weight: 500;
    padding: 0.3rem 0.6rem;
    border-radius: var(--radius-md);
    background: rgba(var(--brand-rgb), 0.1);
    color: var(--brand);
    border: 1px solid rgba(var(--brand-rgb), 0.18);
  }

  .user-search-wrapper {
    position: relative;
    margin-bottom: var(--space-lg);
  }

  .user-search-box {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-sm) var(--space-md);
    background: var(--glass-bg-dark);
    border: 1px solid var(--glass-stroke-dark);
    border-radius: var(--radius-md);
    transition: all 0.2s ease;
  }

  .user-search-box:focus-within {
    border-color: var(--brand);
    box-shadow: 0 0 0 2px color-mix(in oklab, var(--brand) 15%, transparent);
  }

  .search-icon {
    color: var(--text-secondary);
    flex-shrink: 0;
  }

  .user-search-box:focus-within .search-icon {
    color: var(--brand);
  }

  .user-search-input {
    flex: 1;
    padding: 0.5rem;
    border: none;
    background: transparent;
    font-size: 0.875rem;
    color: var(--text-primary);
    outline: none;
    box-shadow: none;
  }

  .user-search-input::placeholder {
    color: var(--text-secondary);
  }

  .search-close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-xs);
    background: transparent;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition: all 0.2s ease;
  }

  .search-close-btn:hover {
    background: color-mix(in oklab, var(--brand-red) 15%, transparent);
    color: var(--brand-red);
  }

  .roles-list :global(.admin-panel-card.dropdown-open) {
    position: relative;
    z-index: 20;
  }

  .user-search-dropdown {
    position: absolute;
    top: calc(100% + var(--space-xs));
    left: 0;
    right: 0;
    max-height: 320px;
    overflow-y: auto;
    background: var(--glass-bg-dark);
    border: 1px solid var(--glass-stroke-dark);
    border-radius: var(--radius-md);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
    z-index: 1000;
  }

  .search-result-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-sm) var(--space-md);
    border: none;
    background: transparent;
    text-align: left;
    cursor: pointer;
    font: inherit;
    color: inherit;
    transition: background 0.2s ease;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  .search-result-item:last-child {
    border-bottom: none;
  }

  .search-result-item:hover:not(:disabled) {
    background: rgba(var(--glass-tint), 0.06);
  }

  .search-result-item:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .search-result-item .user-avatar {
    width: 32px;
    height: 32px;
    font-size: 0.8125rem;
  }

  .search-result-item .user-info {
    flex: 1;
    min-width: 0;
  }

  .add-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    background: var(--brand);
    border-radius: 50%;
    color: white;
    flex-shrink: 0;
  }

  .no-results {
    padding: var(--space-xl);
    text-align: center;
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .no-results p {
    margin: 0;
  }

  .search-loading {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: var(--space-xl);
  }

  .adding-spinner {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .users-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-xl);
  }

  .users-loading p {
    margin: 0;
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .users-empty {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: var(--space-xl);
  }

  .users-empty p {
    margin: 0;
    color: var(--text-secondary);
    font-size: 0.875rem;
    font-style: italic;
  }

  .users-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .users-pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-lg);
    margin-top: var(--space-lg);
    padding-top: var(--space-md);
    border-top: 1px solid var(--glass-stroke-dark);
  }

  .btn-pagination {
    padding: var(--space-sm) var(--space-md);
    font-size: 0.8125rem;
    font-weight: 600;
    background: var(--button-bg);
    border: 1px solid var(--glass-stroke-dark);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn-pagination:hover:not(:disabled) {
    background: var(--btn-secondary);
    border-color: rgba(255, 255, 255, 0.12);
  }

  .btn-pagination:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .pagination-info {
    font-size: 0.8125rem;
    color: var(--text-secondary);
  }

  .user-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-lg);
    padding: var(--space-md) var(--space-lg);
    background: var(--glass-bg-dark);
    border: 1px solid var(--glass-stroke-dark);
    border-radius: var(--radius-md);
    transition:
      border-color 0.2s ease,
      box-shadow 0.2s ease;
  }

  .user-item:hover {
    border-color: rgba(255, 255, 255, 0.12);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  }

  .user-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
    flex: 1;
  }

  .user-name {
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .user-name-row {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    flex-wrap: wrap;
  }

  .user-email {
    font-size: 0.8125rem;
    color: var(--text-secondary);
  }

  .status-capsule {
    display: inline-flex;
    padding: 0.15rem 0.5rem;
    border-radius: var(--radius-full);
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    background: rgba(var(--brand-red-rgb), 0.15);
    color: var(--brand-red);
  }

  .btn-remove-user {
    padding: var(--space-sm) var(--space-md);
    background: transparent;
    border: 1px solid var(--brand-red);
    border-radius: var(--radius-md);
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--brand-red);
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .btn-remove-user:hover:not(:disabled) {
    background: var(--brand-red);
    color: white;
  }

  .btn-remove-user:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .user-actions {
    display: flex;
    gap: var(--space-sm);
    flex-wrap: wrap;
    justify-content: flex-end;
    align-items: center;
  }

  .btn-edit-departments {
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--radius-md);
    border: 1px solid rgba(var(--brand-rgb), 0.35);
    background: transparent;
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--brand);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn-edit-departments:hover:not(:disabled) {
    background: var(--brand);
    color: white;
  }

  .remove-confirm {
    padding: var(--space-md);
  }

  .remove-confirm p {
    margin: 0 0 var(--space-sm) 0;
    color: var(--text-primary);
  }

  .remove-confirm .warning {
    color: var(--brand-red);
    font-size: 0.875rem;
  }

  .modal-actions {
    display: flex;
    gap: var(--space-md);
    justify-content: flex-end;
    margin-top: var(--space-lg);
  }

  .btn-secondary {
    padding: var(--space-sm) var(--space-lg);
    background: var(--button-bg);
    border: 1px solid var(--button-border);
    border-radius: var(--radius-sm);
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-primary);
    cursor: pointer;
  }

  .btn-secondary:hover {
    background: var(--btn-secondary);
  }

  .btn-danger {
    padding: var(--space-sm) var(--space-lg);
    background: var(--brand-red);
    border: none;
    border-radius: var(--radius-sm);
    font-size: 0.875rem;
    font-weight: 500;
    color: white;
    cursor: pointer;
  }

  .btn-danger:hover {
    background: color-mix(in oklab, var(--brand-red) 90%, black);
  }

  .btn-loading {
    display: inline-flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .btn-loading :global(.loading-spinner) {
    flex-direction: row;
    padding: 0;
    gap: var(--space-sm);
  }
</style>
