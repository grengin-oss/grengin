<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

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
    /** ".layout-toggles" choice, owned by the page. */
    view?: "list" | "grid";
    /** Lets a card switch the page back to the list view. */
    onViewChange?: (view: "list" | "grid") => void;
    onRolesChange: () => void;
  }

  let {
    roles,
    permissions,
    loading,
    view = "list",
    onViewChange,
    onRolesChange,
  }: Props = $props();

  /**
   * ".role-card__footer" — the design puts "Manage scoping" here, but scoping is
   * per user-role assignment (DepartmentScopingModal needs BOTH a role and a
   * user) and a card has no single user. So the card opens that role in the list
   * view, where every user row carries its own scoping control.
   */
  function manageScopingFromCard(role: Role) {
    if (!canAssignRoles) return;
    expandedRoles = { ...expandedRoles, [role.id]: true };
    onViewChange?.("list");
  }

  /**
   * The design puts "Add New Roles" in the page header, but this component still
   * owns the modal and its state — so the header drives it through here.
   */
  export function openAddRole() {
    roleFormOpen = "add";
  }
  const canManageRoles = $derived(permissionsStore.canManageRoles());
  const canAssignRoles = $derived(permissionsStore.canAssignRoles());

  const sortedRoles = $derived(
    [...roles].sort((a, b) => {
      if (a.is_system === b.is_system) return 0;
      return a.is_system ? 1 : -1;
    }),
  );

  // ".roles-search" — the grid view carries its own search in the design.
  let gridQuery = $state("");
  const gridRoles = $derived.by(() => {
    const q = gridQuery.trim().toLowerCase();
    if (!q) return sortedRoles;
    return sortedRoles.filter((role) => role.name.toLowerCase().includes(q));
  });

  let roleFormOpen = $state<"add" | Role | null>(null);
  let roleToDelete = $state<Role | null>(null);
  let deletingRole = $state(false);

  // ".role-panel[data-open]" — the design gives each role ONE accordion that
  // reveals its users and its permissions together, so a single map drives both.
  let expandedRoles = $state<Record<string, boolean>>({});

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

  function roleInitials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  /**
   * The design gives each role a differently tinted avatar. Derive the tint from
   * the role id so it is stable across renders, reloads and reorders rather than
   * shifting with list position.
   */
  const AVATAR_TINT_COUNT = 5;
  function roleTint(roleId: string): number {
    let hash = 0;
    for (let i = 0; i < roleId.length; i += 1) {
      hash = (hash * 31 + roleId.charCodeAt(i)) >>> 0;
    }
    return hash % AVATAR_TINT_COUNT;
  }

  /**
   * ".avatars-stack" — the card shows real faces, so the grid needs a page of
   * users per role. The accordion loads them lazily on expand; in grid view every
   * visible card needs them at once, so fetch the ones not already cached.
   */
  const AVATAR_LIMIT = 3;
  $effect(() => {
    if (view !== "grid") return;
    for (const role of gridRoles) {
      if ((role.user_count ?? 0) > 0 && !(role.id in roleUsers)) {
        loadRoleUsers(role.id, 1);
      }
    }
  });

  /** ".role-card__tags" — the domains a role touches, deduped and ordered. */
  const GRID_TAG_LIMIT = 2;
  function roleDomains(role: Role): string[] {
    return Object.keys(getRolePermissionsByDomain(role));
  }

  /**
   * ".perm-card-more" — the design caps the permission cards and closes the row
   * with a "+ N MORE" chip. Here that chip is a real toggle so the rest is
   * reachable, and it collapses again.
   */
  const PERM_CARD_LIMIT = 4;
  let expandedPermCards = $state<Record<string, boolean>>({});

  function togglePermCards(roleId: string) {
    expandedPermCards = {
      ...expandedPermCards,
      [roleId]: !(expandedPermCards[roleId] ?? false),
    };
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

  /**
   * A system role IS editable: RoleFormModal already has dedicated branches for
   * one — it locks the name input and shows the systemRoleNameLocked hint — which
   * only makes sense if such a role can be opened there. Its permissions are the
   * editable part. Super Admin stays excluded: stripping permissions from it can
   * lock every administrator out of this page.
   */
  function canEditRole(role: Role): boolean {
    return !isSuperAdmin(role);
  }

  /**
   * Delete is offered on system roles too. Super Admin remains the one exception:
   * it is the only role granting roles:manage, so removing it locks every
   * administrator out of this page for good. If the backend refuses a particular
   * deletion, handleDeleteRole surfaces the server's own message.
   */
  function canDeleteRole(role: Role): boolean {
    return !isSuperAdmin(role);
  }

  function openEditRole(role: Role) {
    if (!canManageRoles) return;
    roleFormOpen = role;
  }

  // Load role users when users section is expanded
  $effect(() => {
    const sections = expandedRoles;
    for (const r of sortedRoles) {
      if ((sections[r.id] ?? false) && !(r.id in roleUsers)) {
        loadRoleUsers(r.id, 1);
      }
    }
  });

  function toggleRole(roleId: string, e: Event) {
    e.stopPropagation();
    const wasExpanded = expandedRoles[roleId] ?? false;
    expandedRoles = {
      ...expandedRoles,
      [roleId]: !wasExpanded,
    };
    if (wasExpanded && showAddUserSearch === roleId) {
      resetAddUserSearch();
    }
  }

  function isRoleExpanded(roleId: string): boolean {
    return expandedRoles[roleId] ?? false;
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
    expandedRoles = { ...expandedRoles, [roleId]: true };
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

{#snippet roleBadge(role: Role)}
  <span
    class="badge"
    class:badge--system={role.is_system}
    class:badge--custom={!role.is_system}
  >
    {role.is_system
      ? $_("admin.accessControl.systemRoleLabel")
      : $_("admin.accessControl.customRoleLabel")}
  </span>
{/snippet}

<!--
  The role's own controls. The design's head only draws "+ Add user", but edit and
  delete must not disappear with the restyle — they keep their existing gates and
  sit alongside it as labelled icon buttons.
-->
{#snippet roleControls(role: Role)}
  {#if canAssignRoles}
    <button
      class="add-user-btn"
      type="button"
      onclick={(e) => {
        e.stopPropagation();
        openAddUser(role.id);
      }}
      title={$_("admin.accessControl.addUser")}
    >
      + {$_("admin.accessControl.addUser")}
    </button>
  {/if}
  {@render roleEditControls(role)}
{/snippet}

{#snippet roleEditControls(role: Role)}
  {#if canManageRoles && canEditRole(role)}
    <button
      class="icon-btn icon-btn--labeled"
      type="button"
      onclick={(e) => {
        e.stopPropagation();
        openEditRole(role);
      }}
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
      <span>{$_("common.edit")}</span>
    </button>
  {/if}
  {#if canManageRoles && canDeleteRole(role)}
    <button
      class="icon-btn icon-btn--labeled icon-btn--danger"
      type="button"
      onclick={(e) => {
        e.stopPropagation();
        roleToDelete = role;
      }}
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
      <span>{$_("common.delete")}</span>
    </button>
  {/if}
{/snippet}

<!-- ".users-section" — the add-user search, the rows, and real pagination. -->
{#snippet usersSection(role: Role)}
  <div class="users-section">
    <span class="section-label">{$_("admin.accessControl.usersWithRole")}</span>

    {#if showAddUserSearch === role.id}
      <div class="user-search-wrapper">
        <div class="user-search-box">
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
              r="4.5"
              stroke="currentColor"
              stroke-width="1.3"
            />
            <path d="m13 13-2.5-2.5" stroke="currentColor" stroke-width="1.3" />
          </svg>
          <input
            type="text"
            class="user-search-input"
            placeholder={$_("admin.accessControl.searchUsersToAdd")}
            bind:value={addUserSearchQuery}
            bind:this={searchInputRef}
            oninput={handleAddUserSearchInput}
            onkeydown={(event) => handleAddUserSearchKeydown(event, role.id)}
          />
          <button
            class="search-close-btn"
            type="button"
            onclick={() => toggleAddUserSearch(role.id)}
            aria-label={$_("admin.accessControl.closeSearch")}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
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
                type="button"
                onclick={() => handleAddUser(user)}
                disabled={addingUserId !== null}
              >
                <span class="avatar-round" aria-hidden="true"
                  >{roleInitials(user.name || user.email || "?")}</span
                >
                <span class="search-result-text">
                  <span class="user-row-mini__name"
                    >{user.name || user.email}</span
                  >
                  <span class="user-row-mini__email">{user.email}</span>
                </span>
                {#if addingUserId === user.id}
                  <span class="adding-spinner"><LoadingSpinner /></span>
                {:else}
                  <span class="add-glyph" aria-hidden="true">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path
                        d="M8 3V13M3 8H13"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                      />
                    </svg>
                  </span>
                {/if}
              </button>
            {/each}
          </div>
        {:else if addUserSearchQuery && addUserSearchResults.length === 0}
          <div class="user-search-dropdown">
            <div class="no-results">
              {$_("admin.accessControl.noUsersFound")}
            </div>
          </div>
        {/if}
      </div>
    {/if}

    {#if roleUsersLoading[role.id] && (roleUsers[role.id] ?? []).length === 0}
      <div class="section-state"><LoadingSpinner /></div>
    {:else if (roleUsers[role.id] ?? []).length === 0}
      <div class="section-state">{$_("admin.accessControl.noUsersInRole")}</div>
    {:else}
      {#each roleUsers[role.id] ?? [] as user (user.id)}
        <div class="user-row-mini">
          <div class="user-row-mini__left">
            <span class="avatar-round" aria-hidden="true"
              >{roleInitials(user.name || user.email || "?")}</span
            >
            <div class="user-row-mini__text">
              <div class="user-row-mini__name">
                {user.name || user.email}
                {#if user.status && user.status !== "active"}
                  <span class="status-capsule"
                    >{$_("admin.common.deactivated")}</span
                  >
                {/if}
              </div>
              <div class="user-row-mini__email">{user.email}</div>
            </div>
          </div>
          {#if canAssignRoles}
            <div class="user-row-mini__actions">
              <button
                class="link-btn"
                type="button"
                onclick={() => openDepartmentModal(role, user)}
              >
                {$_("admin.accessControl.manageScoping")}
              </button>
              <button
                class="link-btn link-btn--danger"
                type="button"
                onclick={(e) => {
                  e.stopPropagation();
                  confirmRemoveUser(user, role.id);
                }}
              >
                {$_("admin.accessControl.removeUser")}
              </button>
            </div>
          {/if}
        </div>
      {/each}

      <!--
        The design shows a single "Show N more" link, but this list is genuinely
        paginated by the API, so both directions stay reachable.
      -->
      {#if (roleUsersTotal[role.id] ?? 0) > PAGE_SIZE}
        <div class="users-pagination">
          <button
            class="link-btn"
            type="button"
            onclick={(e) => {
              e.stopPropagation();
              loadRoleUsers(role.id, (roleUsersPage[role.id] ?? 1) - 1);
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
            class="link-btn"
            type="button"
            onclick={(e) => {
              e.stopPropagation();
              loadRoleUsers(role.id, (roleUsersPage[role.id] ?? 1) + 1);
            }}
            disabled={(roleUsersPage[role.id] ?? 1) >=
              getRoleTotalPages(role.id) || roleUsersLoading[role.id]}
          >
            {$_("admin.common.next")}
          </button>
        </div>
      {/if}
    {/if}
  </div>
{/snippet}

<!-- ".perms-section" — one ".perm-card" per domain, listing that domain's actions. -->
{#snippet permsSection(role: Role)}
  <div class="perms-section">
    <span class="section-label"
      >{$_("admin.accessControl.permissionsInRole")}</span
    >
    {#if role.permissions.length === 0}
      <div class="section-state">
        {$_("admin.accessControl.noPermissionsInRole")}
      </div>
    {:else}
      {@const entries = Object.entries(getRolePermissionsByDomain(role))}
      {@const showAll = expandedPermCards[role.id] ?? false}
      {@const shown = showAll ? entries : entries.slice(0, PERM_CARD_LIMIT)}
      <div class="perm-row-wrap">
        {#each shown as [domain, actions] (domain)}
          <div class="perm-card">
            <span class="perm-card__cat">{formatDomain(domain)}</span>
            <span class="perm-card__actions">
              {actions.map((action) => formatAction(action)).join("  ")}
            </span>
          </div>
        {/each}
        {#if entries.length > PERM_CARD_LIMIT}
          <button
            class="perm-card-more"
            type="button"
            onclick={() => togglePermCards(role.id)}
            aria-expanded={showAll}
          >
            {showAll
              ? $_("admin.accessControl.showLess")
              : $_("admin.accessControl.morePermissions", {
                  values: { count: entries.length - PERM_CARD_LIMIT },
                })}
          </button>
        {/if}
      </div>
    {/if}
  </div>
{/snippet}

{#if loading}
  <LoadingSpinner text={$_("admin.accessControl.loadingRoles")} />
{:else if roles.length === 0}
  <AdminEmptyState
    title={$_("admin.accessControl.noRolesTitle")}
    message={$_("admin.accessControl.noRolesMessage")}
  />
{:else if view === "list"}
  <!-- ".roles-list": an accordion per role -->
  <div class="roles-list">
    {#each sortedRoles as role (role.id)}
      {@const open = isRoleExpanded(role.id)}
      <div class="role-panel" class:role-panel--open={open}>
        <div class="role-panel__head">
          <div class="role-panel__left">
            <button
              class="chev-btn"
              type="button"
              onclick={(e) => toggleRole(role.id, e)}
              aria-expanded={open}
              aria-label={role.name}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M4 6l4 4 4-4"
                  stroke="currentColor"
                  stroke-width="1.4"
                  fill="none"
                />
              </svg>
            </button>
            <span
              class="avatar-round role-panel-avatar"
              data-tint={roleTint(role.id)}
              aria-hidden="true">{roleInitials(role.name)}</span
            >
            <span class="role-name">{role.name}</span>
            {@render roleBadge(role)}
          </div>
          <div class="role-panel__right">
            <div class="stat">
              <span class="stat__value">{role.user_count ?? 0}</span>
              <span class="stat__label"
                >{$_("admin.accessControl.usersStatLabel")}</span
              >
            </div>
            <div class="stat">
              <span class="stat__value">{role.permissions.length}</span>
              <span class="stat__label"
                >{$_("admin.accessControl.permissionsLabel")}</span
              >
            </div>
            {@render roleControls(role)}
          </div>
        </div>

        {#if open}
          <div class="role-panel__body">
            {@render usersSection(role)}
            {@render permsSection(role)}
          </div>
        {/if}
      </div>
    {/each}
  </div>
{:else}
  <!-- ".roles-grid-wrap": a card per role, with its own search -->
  <div class="roles-grid-wrap">
    <div class="search-row roles-search">
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
          r="4.5"
          stroke="currentColor"
          stroke-width="1.3"
        />
        <path d="m13 13-2.5-2.5" stroke="currentColor" stroke-width="1.3" />
      </svg>
      <input
        type="text"
        bind:value={gridQuery}
        placeholder={$_("admin.accessControl.searchRoles")}
        aria-label={$_("admin.accessControl.searchRoles")}
      />
    </div>

    {#if gridRoles.length === 0}
      <AdminEmptyState
        title={$_("admin.accessControl.noRolesTitle")}
        message={$_("admin.accessControl.noSearchResults", {
          values: { query: gridQuery.trim() },
        })}
      />
    {:else}
      <div class="roles-grid">
        {#each gridRoles as role (role.id)}
          {@const domains = roleDomains(role)}
          <div class="role-card">
            <div class="role-card__top">
              <div class="role-card__title-row">
                <div class="role-card__title-left">
                  <span
                    class="avatar-round"
                    data-tint={roleTint(role.id)}
                    aria-hidden="true">{roleInitials(role.name)}</span
                  >
                  <span class="role-card__name">{role.name}</span>
                </div>
                {@render roleBadge(role)}
              </div>
              <!--
                Figma 355:29939 — a caption under the title. The design's own
                copy is the role type ("Custom role"), which is the only
                description the API actually carries, so that is what it shows.
              -->
              <span class="role-card__desc">
                {role.is_system
                  ? $_("admin.accessControl.systemRoleLabel")
                  : $_("admin.accessControl.customRoleLabel")}
              </span>
              <div class="role-card__stats">
                <div class="stat stat--left">
                  <span class="stat__value">{role.user_count ?? 0}</span>
                  <span class="stat__label"
                    >{$_("admin.accessControl.usersStatLabel")}</span
                  >
                </div>
                <div class="stat stat--left">
                  <span class="stat__value">{role.permissions.length}</span>
                  <span class="stat__label"
                    >{$_("admin.accessControl.permissionsLabel")}</span
                  >
                </div>
              </div>
              <div class="role-card__tags">
                {#each domains.slice(0, GRID_TAG_LIMIT) as domain (domain)}
                  <span class="tag-green">{formatDomain(domain)}</span>
                {/each}
                {#if domains.length > GRID_TAG_LIMIT}
                  <span class="tag-more"
                    >{$_("admin.accessControl.morePermissions", {
                      values: { count: domains.length - GRID_TAG_LIMIT },
                    })}</span
                  >
                {/if}
              </div>
            </div>
            <div class="role-card__footer">
              {#if (role.user_count ?? 0) === 0}
                <span class="role-card__no-users"
                  >{$_("admin.accessControl.noUsersAssigned")}</span
                >
              {:else}
                {@const loaded = roleUsers[role.id] ?? []}
                {@const faces = loaded.slice(0, AVATAR_LIMIT)}
                {@const overflow = (role.user_count ?? 0) - faces.length}
                <div
                  class="avatars-stack"
                  title={$_("admin.accessControl.userCountLabel", {
                    values: { count: role.user_count ?? 0 },
                  })}
                >
                  {#each faces as user (user.id)}
                    <span class="avatar-round" aria-hidden="true"
                      >{roleInitials(user.name || user.email || "?")}</span
                    >
                  {/each}
                  {#if overflow > 0}
                    <span
                      class="avatar-round avatar-round--overflow"
                      aria-hidden="true">+{overflow}</span
                    >
                  {/if}
                  <span class="sr-only"
                    >{$_("admin.accessControl.userCountLabel", {
                      values: { count: role.user_count ?? 0 },
                    })}</span
                  >
                </div>
              {/if}
              <div class="role-card__actions">
                {#if canAssignRoles}
                  <button
                    class="link-btn"
                    type="button"
                    onclick={() => manageScopingFromCard(role)}
                    disabled={(role.user_count ?? 0) === 0}
                    title={(role.user_count ?? 0) === 0
                      ? $_("admin.accessControl.noUsersAssigned")
                      : $_("admin.accessControl.manageScoping")}
                  >
                    {$_("admin.accessControl.manageScoping")}
                  </button>
                {/if}
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
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
  /* ==========================================================================
     Roles tab — access-control.html. Every colour comes from a --gx-* token so
     the page follows light/dark like the rest of the admin area; the design's
     own palette is light-only.
     ========================================================================== */

  /* Same app.css bare-<button> glass chrome as the modal: clear it on the plain
     text/icon buttons so they don't each sit in a stray rounded pill. Buttons
     that set their own box-shadow (.icon-btn, .add-user-btn, .perm-card-more)
     already replace it and only need the blur cleared. */
  .link-btn,
  .chev-btn,
  .search-close-btn,
  .search-result-item {
    box-shadow: none;
    border-radius: 0;
  }

  .link-btn,
  .chev-btn,
  .search-close-btn,
  .search-result-item,
  .icon-btn,
  .add-user-btn,
  .perm-card-more {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  /* ---- shared: avatars, badges, stats ---- */
  .avatar-round {
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    font-family: var(--gx-font);
    font-weight: 700;
    width: 28px;
    height: 28px;
    font-size: 11px;
    background: var(--gx-org-track);
    color: var(--gx-slate-900);
  }

  /* Deterministic per-role tint (see roleTint) so a role keeps its colour. */
  .avatar-round[data-tint="0"] {
    background: var(--gx-ac-green-bg);
    color: var(--gx-org-brand-alt);
  }
  .avatar-round[data-tint="1"] {
    background: var(--gx-blue-soft);
    color: var(--gx-ac-system-fg);
  }
  .avatar-round[data-tint="2"] {
    background: var(--gx-ac-custom-bg);
    color: var(--gx-ok-text);
  }
  .avatar-round[data-tint="3"] {
    background: var(--gx-ac-card-avatar-bg);
    color: var(--gx-ac-card-avatar-fg);
  }
  .avatar-round[data-tint="4"] {
    background: var(--gx-ac-dept-bg);
    color: var(--gx-ac-dept-fg);
  }

  .badge {
    border-radius: 4px;
    padding: 4px 8px;
    font-family: var(--gx-font);
    font-weight: 600;
    font-size: 12px;
    line-height: 100%;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .badge--custom {
    background: var(--gx-ac-custom-bg);
    color: var(--gx-ok-text);
  }

  .badge--system {
    background: var(--gx-blue-soft);
    color: var(--gx-ac-system-fg);
  }

  .stat {
    display: flex;
    flex-direction: column;
    gap: 2px;
    align-items: center;
    flex-shrink: 0;
  }

  .stat--left {
    align-items: flex-start;
  }

  .stat__value {
    font-family: var(--gx-font);
    font-weight: 700;
    font-size: 16px;
    line-height: 100%;
    color: var(--gx-slate-900);
    white-space: nowrap;
  }

  .stat__label {
    font-family: var(--gx-font);
    /* Figma type style "UI/XSmall Semi": Inter SemiBold 10. */
    font-weight: 600;
    font-size: 10px;
    line-height: 100%;
    letter-spacing: 0.5px;
    color: var(--gx-org-slate-350);
    text-transform: uppercase;
    white-space: nowrap;
  }

  .section-label {
    font-family: var(--gx-font);
    font-weight: 700;
    font-size: 11px;
    line-height: 100%;
    letter-spacing: 0.5px;
    color: var(--gx-slate-400);
    text-transform: uppercase;
  }

  .section-state {
    font-family: var(--gx-font);
    font-size: 13px;
    color: var(--gx-slate-500);
    padding: 4px 0;
  }

  /* ---- ".roles-list": accordion view ---- */
  .roles-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    align-items: flex-start;
    align-self: stretch;
    width: 100%;
    min-width: 0;
  }

  .role-panel {
    border-radius: 12px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 16px;
    align-items: flex-start;
    align-self: stretch;
    box-sizing: border-box;
    min-width: 0;
  }

  .role-panel__head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    align-self: stretch;
    gap: 16px;
    flex-wrap: wrap;
  }

  .role-panel__left {
    display: flex;
    gap: 16px;
    align-items: center;
    min-width: 0;
  }

  .chev-btn {
    width: 16px;
    height: 16px;
    padding: 0;
    border: none;
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--gx-slate-400);
    flex-shrink: 0;
    cursor: pointer;
    /* Closed is the rotated state, so the glyph points at the row it opens. */
    transform: rotate(-90deg);
    transition: transform 150ms ease;
  }

  .role-panel--open .chev-btn {
    transform: rotate(0deg);
  }

  .chev-btn:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
    border-radius: 4px;
  }

  .role-panel-avatar {
    width: 28px;
    height: 28px;
    font-size: 11px;
  }

  .role-name {
    font-family: var(--gx-font);
    font-weight: 600;
    font-size: 16px;
    line-height: 100%;
    color: var(--gx-slate-900);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .role-panel__right {
    display: flex;
    gap: 24px;
    align-items: center;
    flex-wrap: wrap;
  }

  .add-user-btn {
    height: 32px;
    border: none;
    border-radius: 8px;
    background: transparent;
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    display: flex;
    padding: 8px 12px;
    align-items: center;
    font-family: var(--gx-font);
    font-weight: 600;
    font-size: 13px;
    color: var(--gx-slate-900);
    white-space: nowrap;
    cursor: pointer;
    transition: background-color 120ms ease;
  }

  .add-user-btn:hover {
    background: var(--gx-org-track);
  }

  .icon-btn {
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 8px;
    background: transparent;
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--gx-slate-500);
    cursor: pointer;
    flex-shrink: 0;
    transition:
      background-color 120ms ease,
      color 120ms ease;
  }

  .icon-btn:hover {
    background: var(--gx-org-track);
    color: var(--gx-slate-900);
  }

  /* Edit/delete carry their label next to the glyph, so they size to content
     instead of the 32px icon-only square. */
  .icon-btn--labeled {
    width: auto;
    gap: 6px;
    padding: 8px 12px;
    font-family: var(--gx-font);
    font-weight: 600;
    font-size: 13px;
    color: var(--gx-slate-900);
    white-space: nowrap;
  }

  .icon-btn--danger:hover {
    background: var(--gx-danger-soft);
    color: var(--gx-danger);
  }

  .add-user-btn:focus-visible,
  .icon-btn:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
  }

  /* Without an explicit size these collapse to width:0 as flex items and the
     button renders empty. */
  .add-user-btn svg,
  .icon-btn svg {
    width: 16px;
    height: 16px;
    display: block;
    flex-shrink: 0;
  }

  .role-panel__body {
    display: flex;
    flex-direction: column;
    gap: 16px;
    align-items: flex-start;
    align-self: stretch;
    min-width: 0;
  }

  .users-section,
  .perms-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-items: flex-start;
    align-self: stretch;
    min-width: 0;
  }

  /* ---- ".user-row-mini" ---- */
  .user-row-mini {
    border-radius: 8px;
    background: var(--gx-page);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    display: flex;
    padding: 8px 12px;
    justify-content: space-between;
    align-items: center;
    align-self: stretch;
    gap: 12px;
    box-sizing: border-box;
    min-width: 0;
  }

  .user-row-mini__left {
    display: flex;
    gap: 12px;
    align-items: center;
    min-width: 0;
  }

  .user-row-mini__text {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .user-row-mini__name {
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: var(--gx-font);
    font-weight: 600;
    font-size: 13px;
    line-height: 100%;
    color: var(--gx-slate-900);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .user-row-mini__email {
    font-family: var(--gx-font);
    font-weight: 400;
    font-size: 11px;
    line-height: 100%;
    color: var(--gx-slate-500);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .status-capsule {
    border-radius: 100px;
    background: var(--gx-hair);
    padding: 2px 6px;
    font-size: 10px;
    font-weight: 600;
    color: var(--gx-slate-500);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .user-row-mini__actions {
    display: flex;
    gap: 16px;
    align-items: center;
    flex-shrink: 0;
  }

  .link-btn {
    border: none;
    background: transparent;
    padding: 0;
    font-family: var(--gx-font);
    font-weight: 600;
    font-size: 13px;
    line-height: 100%;
    color: var(--gx-ac-link);
    white-space: nowrap;
    cursor: pointer;
  }

  .link-btn:hover:not(:disabled) {
    text-decoration: underline;
  }

  .link-btn:disabled {
    color: var(--gx-slate-400);
    cursor: not-allowed;
  }

  .link-btn--danger {
    color: var(--gx-danger);
  }

  .link-btn:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
    border-radius: 4px;
  }

  .users-pagination {
    display: flex;
    align-items: center;
    gap: 16px;
    align-self: stretch;
    padding-top: 2px;
  }

  .pagination-info {
    font-family: var(--gx-font);
    font-size: 12px;
    color: var(--gx-slate-500);
  }

  /* ---- add-user search ---- */
  .user-search-wrapper {
    position: relative;
    align-self: stretch;
    min-width: 0;
  }

  .user-search-box {
    height: 37px;
    border-radius: 8px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    display: flex;
    gap: 10px;
    padding: 10px 14px;
    align-items: center;
    color: var(--gx-slate-400);
    box-sizing: border-box;
  }

  .user-search-box:focus-within {
    box-shadow: inset 0 0 0 1px var(--gx-org-primary-500);
  }

  .user-search-input {
    flex-grow: 1;
    min-width: 0;
    /* app.css styles every bare <input> as a full glass field — padding, its own
       radius, a fill, an inset shadow and a focus ring. Inside a search row the
       container IS the field, so all of that has to be neutralised or the input
       draws a second pill inside the first. */
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
    font-size: 14px;
    line-height: 100%;
    color: var(--gx-slate-900);
  }

  .user-search-input:focus {
    box-shadow: none;
    background: transparent;
  }

  .user-search-input::placeholder {
    color: var(--gx-slate-400);
    opacity: 1;
  }

  .search-close-btn {
    border: none;
    background: transparent;
    padding: 0;
    display: flex;
    align-items: center;
    color: var(--gx-slate-400);
    cursor: pointer;
    flex-shrink: 0;
  }

  .search-close-btn:hover {
    color: var(--gx-slate-900);
  }

  .user-search-dropdown {
    position: absolute;
    inset-inline: 0;
    top: calc(100% + 6px);
    z-index: 20;
    max-height: 260px;
    overflow-y: auto;
    border-radius: 10px;
    background: var(--gx-card);
    box-shadow:
      inset 0 0 0 1px var(--gx-hair),
      0 8px 24px 0 rgba(15, 23, 42, 0.1);
    display: flex;
    flex-direction: column;
    padding: 6px;
  }

  .search-result-item {
    display: flex;
    align-items: center;
    /* app.css centres every button's content; this is a left-aligned row. */
    justify-content: flex-start;
    gap: 12px;
    width: 100%;
    padding: 8px;
    border: none;
    border-radius: 8px;
    background: transparent;
    cursor: pointer;
    text-align: start;
    transition: background-color 120ms ease;
  }

  .search-result-item:hover:not(:disabled) {
    background: var(--gx-org-track);
  }

  .search-result-item:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .search-result-text {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    flex-grow: 1;
  }

  .add-glyph,
  .adding-spinner {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--gx-org-primary-500);
    flex-shrink: 0;
  }

  .search-loading,
  .no-results {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 12px;
    font-family: var(--gx-font);
    font-size: 13px;
    color: var(--gx-slate-500);
  }

  /* ---- ".perm-card" ---- */
  .perm-row-wrap {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: flex-start;
    align-self: stretch;
  }

  .perm-card {
    border-radius: 8px;
    background: var(--gx-page);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px;
    align-items: flex-start;
    flex-shrink: 0;
  }

  .perm-card__cat {
    font-family: var(--gx-font);
    font-weight: 700;
    font-size: 11px;
    letter-spacing: 0.5px;
    color: var(--gx-slate-400);
    text-transform: uppercase;
  }

  /* ".perm-card-more" — a real toggle, sized to sit in the card row. */
  .perm-card-more {
    border: none;
    border-radius: 8px;
    background: var(--gx-page);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    display: flex;
    padding: 12px;
    align-items: center;
    font-family: var(--gx-font);
    font-weight: 700;
    font-size: 11px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    color: var(--gx-slate-400);
    flex-shrink: 0;
    cursor: pointer;
    transition:
      background-color 120ms ease,
      color 120ms ease;
  }

  .perm-card-more:hover {
    background: var(--gx-org-track);
    color: var(--gx-slate-900);
  }

  .perm-card-more:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
  }

  .perm-card__actions {
    font-family: var(--gx-font);
    font-weight: 600;
    font-size: 13px;
    color: var(--gx-ac-link);
    white-space: pre-wrap;
  }

  /* ---- ".roles-grid-wrap": card view ---- */
  .roles-grid-wrap {
    display: flex;
    flex-direction: column;
    gap: 20px;
    align-items: flex-start;
    align-self: stretch;
    width: 100%;
    min-width: 0;
  }

  .search-row {
    height: 37px;
    border-radius: 8px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    display: flex;
    gap: 10px;
    padding: 10px 14px;
    align-items: center;
    flex-shrink: 0;
    color: var(--gx-slate-400);
    box-sizing: border-box;
  }

  .search-row:focus-within {
    box-shadow: inset 0 0 0 1px var(--gx-org-primary-500);
  }

  .search-row input {
    flex-grow: 1;
    min-width: 0;
    /* app.css styles every bare <input> as a full glass field — padding, its own
       radius, a fill, an inset shadow and a focus ring. Inside a search row the
       container IS the field, so all of that has to be neutralised or the input
       draws a second pill inside the first. */
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
    font-size: 14px;
    line-height: 100%;
    color: var(--gx-slate-900);
  }

  .search-row input:focus {
    box-shadow: none;
    background: transparent;
  }

  .search-row input::placeholder {
    color: var(--gx-slate-400);
    opacity: 1;
  }

  .roles-search {
    width: 280px;
    max-width: 100%;
    align-self: flex-start;
  }

  /* The mockup fakes its rows with three hard-coded ".roles-grid" divs of three
     cards each. With a live role list the count is arbitrary, and a wrapping
     flex row makes `flex-grow` stretch a lone card on the last line across the
     full width. auto-fit keeps every card one column wide however many there
     are, leaving the short last row part-empty instead. */
  .roles-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 24px;
    align-items: stretch;
    align-self: stretch;
    width: 100%;
    min-width: 0;
  }

  .role-card {
    border-radius: 16px;
    background: var(--gx-card);
    /* Figma: border 1px inside Primary/50 (#EFF4FC) = --gx-ring-soft, which also
       has a dark-mode value; the literal hex would stay light-only. */
    border: 1px solid var(--gx-ring-soft);
    display: flex;
    flex-direction: column;
    padding: 20px;
    justify-content: space-between;
    transition:
      border-color 120ms ease,
      box-shadow 120ms ease;
    align-items: flex-start;
    min-width: 0;
    box-sizing: border-box;
  }

  .role-card__top {
    display: flex;
    flex-direction: column;
    gap: 12px;
    align-items: flex-start;
    align-self: stretch;
    min-width: 0;
  }

  .role-card__title-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    align-self: stretch;
    gap: 10px;
  }

  .role-card__title-left {
    display: flex;
    gap: 10px;
    align-items: center;
    min-width: 0;
  }

  .role-card__name {
    font-family: var(--gx-font);
    font-weight: 700;
    font-size: 16px;
    color: var(--gx-ac-card-avatar-fg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Figma 355:29939 — caption under the title, "UI/Caption Regular" (Inter 12)
     in Primary/400. */
  .role-card__desc {
    font-family: var(--gx-font);
    font-weight: 400;
    font-size: 12px;
    line-height: 15px;
    color: var(--gx-ac-link-soft);
    align-self: stretch;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .role-card__stats {
    display: flex;
    gap: 24px;
  }

  .role-card__stats .stat__value {
    color: var(--gx-ac-card-avatar-fg);
  }

  .role-card__tags {
    display: flex;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;
  }

  .tag-green {
    border-radius: 6px;
    /* Figma: Secondary/50 #F1F8F4 = --gx-org-brand-alt-tint. */
    background: var(--gx-org-brand-alt-tint);
    padding: 4px 8px;
    font-family: var(--gx-font);
    font-weight: 600;
    font-size: 11px;
    color: var(--gx-org-brand-alt);
    white-space: nowrap;
  }

  .tag-more {
    font-family: var(--gx-font);
    font-weight: 600;
    font-size: 11px;
    color: var(--gx-ac-link-soft);
    white-space: nowrap;
  }

  .role-card:hover {
    border-color: var(--gx-org-primary-100);
    box-shadow: 0 4px 12px 0 rgba(15, 23, 42, 0.08);
  }

  .role-card__footer {
    min-height: 36px;
    border-top: 1px solid var(--gx-ring-soft);
    display: flex;
    justify-content: space-between;
    align-items: center;
    align-self: stretch;
    gap: 10px;
    padding-top: 12px;
    margin-top: 12px;
    flex-wrap: wrap;
  }

  /* ".avatars-stack" — overlapping faces, each ringed in the card colour so the
     overlap reads as depth rather than a smudge. */
  .avatars-stack {
    display: flex;
    align-items: center;
  }

  .avatars-stack .avatar-round {
    width: 24px;
    height: 24px;
    font-size: 9px;
    background: var(--gx-org-primary-500);
    color: #fff;
    box-shadow: inset 0 0 0 1.5px var(--gx-card);
    margin-inline-start: -6px;
  }

  .avatars-stack .avatar-round:first-child {
    margin-inline-start: 0;
  }

  .avatars-stack .avatar-round--overflow {
    background: var(--gx-slate-400);
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .role-card__no-users {
    font-family: var(--gx-font);
    font-weight: 400;
    font-size: 12px;
    color: var(--gx-org-slate-350);
  }

  .role-card__actions {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }

  /* ---- confirm modals: unchanged from before the restyle ---- */
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

  @media (max-width: 768px) {
    .role-panel__head {
      align-items: flex-start;
    }

    .role-panel__right {
      gap: 16px;
      width: 100%;
      justify-content: flex-start;
    }

    .user-row-mini {
      flex-direction: column;
      align-items: flex-start;
      gap: 10px;
    }

    .user-row-mini__actions {
      width: 100%;
    }

    .roles-grid {
      gap: 16px;
    }
  }

  /* Small phones: the role header is a single nowrap row (chevron, name,
     badges, counts). At 320px the name — the one thing that identifies the
     row — gets squeezed to a few characters. Let the row wrap so the name
     keeps a full line and the badges drop underneath it. */
  @media (max-width: 480px) {
    .role-panel__left {
      flex-wrap: wrap;
      gap: 8px 10px;
    }

    /* Name keeps the first line next to the chevron; the badges and counts
       wrap onto the line below rather than competing for the same row. */
    .role-name {
      flex: 1 1 auto;
      min-width: 140px;
    }
  }
</style>
