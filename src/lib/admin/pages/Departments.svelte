<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { onMount } from "svelte";
  import { _ } from "svelte-i18n";
  import AdminTabs from "../components/AdminTabs.svelte";
  import TeamsTab from "../components/organization/TeamsTab.svelte";
  import UsersTab from "../components/organization/UsersTab.svelte";
  import AssignTeamModal from "../components/organization/AssignTeamModal.svelte";
  import { departmentsStore, usersStore } from "../stores/index.js";
  import type { User } from "../types.js";
  import { toast } from "../../components/Toaster.svelte";
  import { ApiError } from "../../api/client.js";
  import { getLocalizedError } from "../../utils/errorLocalization.js";
  import { permissionsStore } from "$lib/features/auth/index.js";
  import { PERMISSIONS } from "$lib/features/auth/permissions.js";
  import { getRoles, type Role } from "$lib/api/admin/roles.js";

  /**
   * Feature flag — hides the Unassigned node in the Teams tab. Default on.
   * See ENGG-388 acceptance criteria (Teams tab).
   */
  const SHOW_UNASSIGNED_NODE = true;

  type TabId = "teams" | "users";

  const deptStore = $derived($departmentsStore);
  const canViewDepartments = $derived(
    permissionsStore.hasPermission(PERMISSIONS.departments.view),
  );
  const canViewUsers = $derived(permissionsStore.canViewUsers());
  const canManageDepartments = $derived(permissionsStore.canManageDepartments());
  const canManageUsers = $derived(permissionsStore.canManageUsers());

  const tabs = $derived(
    [
      canViewDepartments
        ? { id: "teams", label: $_("admin.organization.teams") }
        : null,
      canViewUsers ? { id: "users", label: $_("admin.organization.users") } : null,
    ].filter((t): t is { id: TabId; label: string } => t !== null),
  );

  const defaultTab = $derived<TabId>(canViewDepartments ? "teams" : "users");
  let currentTab = $state<TabId>("teams");

  // Keep currentTab pointing at a tab the admin can actually see. This covers
  // the single-permission cases (e.g. departments-only or users-only), where
  // the tab strip is hidden and AdminTabs never runs to correct the value.
  $effect(() => {
    if (tabs.length > 0 && !tabs.some((t) => t.id === currentTab)) {
      currentTab = defaultTab;
    }
  });

  // Contextual create-modal signals, driven by the single header primary button.
  let showTeamsCreate = $state(false);
  let showUsersCreate = $state(false);

  // Shared team picker.
  let assignTarget = $state<User | null>(null);
  let isAssigning = $state(false);

  // ---- Users toolbar (lives in the header controls row per the design) ----
  let roles = $state<Role[]>([]);
  let searchQuery = $state("");
  let filterRole = $state("");
  let filterStatus = $state("");
  let searchDebounce: ReturnType<typeof setTimeout> | null = null;

  onMount(() => {
    if (canViewUsers) loadRoles();
    return () => {
      if (searchDebounce) clearTimeout(searchDebounce);
    };
  });

  async function loadRoles() {
    try {
      const res = await getRoles();
      roles = res.roles;
    } catch (err: any) {
      const message =
        err instanceof ApiError
          ? getLocalizedError(err, "description", $_)
          : err?.message;
      toast.error(message || $_("admin.accessControl.failedToLoadRoles"));
    }
  }

  function applyFilters() {
    usersStore.setFilters({
      search: searchQuery,
      role_id: filterRole,
      status: filterStatus,
    });
  }

  function applyFiltersDebounced() {
    if (searchDebounce) clearTimeout(searchDebounce);
    searchDebounce = setTimeout(applyFilters, 500);
  }

  function resetFilters() {
    searchQuery = "";
    filterRole = "";
    filterStatus = "";
    if (searchDebounce) clearTimeout(searchDebounce);
    applyFilters();
  }

  function openPrimaryAction() {
    if (currentTab === "teams") {
      showTeamsCreate = true;
    } else {
      showUsersCreate = true;
    }
  }

  const showCreateDepartmentButton = $derived(
    currentTab === "teams" && canManageDepartments,
  );
  const showCreateUserButton = $derived(currentTab === "users" && canManageUsers);

  function requestAssign(user: User) {
    assignTarget = user;
  }

  async function handleAssignConfirm(departmentId: string) {
    if (!assignTarget) return;
    isAssigning = true;
    try {
      await usersStore.assignDepartment(assignTarget.id, departmentId);
      // Refresh tree/member counts so both tabs stay consistent.
      await Promise.all([
        departmentsStore.fetchDepartmentsTree(),
        departmentsStore.fetchAdministeredDepartments(),
      ]);
      toast.success($_("admin.organization.assignSuccess"));
      assignTarget = null;
    } catch (err: any) {
      const message =
        err instanceof ApiError
          ? getLocalizedError(err, "description", $_)
          : err?.message;
      toast.error(message || $_("admin.organization.assignError"));
    } finally {
      isAssigning = false;
    }
  }
</script>

<div class="org-page">
  <div class="org-main">
    <div class="page-header">
      <div class="header-text">
        <span class="page-title">{$_('admin.departments.organization')}</span>
        <span class="page-sub">{$_('admin.organization.subtitle')}</span>
      </div>
      {#if showCreateDepartmentButton}
        <button type="button" class="cta" onclick={openPrimaryAction}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M8 3V13M3 8H13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
          <span class="cta__label">{$_('admin.departments.createDepartment')}</span>
        </button>
      {:else if showCreateUserButton}
        <button type="button" class="cta cta--users" onclick={openPrimaryAction}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M8 3V13M3 8H13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
          <span class="cta__label">{$_('admin.users.createUserButton')}</span>
        </button>
      {/if}
    </div>

    <div class="controls-row">
      {#if tabs.length > 1}
        <AdminTabs
          {tabs}
          {defaultTab}
          variant="segmented"
          tabListLabel={$_('admin.tabListLabels.organization')}
          bind:currentTab
        />
      {:else}
        <span></span>
      {/if}

      {#if canViewUsers && currentTab === 'users'}
        <div class="filters">
          <label class="search-input">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="7" cy="7" r="4.75" stroke="currentColor" stroke-width="1.5"/>
              <path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            <input
              type="text"
              placeholder={$_('admin.organization.searchUsersPlaceholder')}
              aria-label={$_('admin.organization.searchUsersPlaceholder')}
              autocomplete="off"
              bind:value={searchQuery}
              oninput={applyFiltersDebounced}
            />
          </label>

          <div class="select">
            <select
              bind:value={filterRole}
              onchange={applyFilters}
              aria-label={$_('admin.common.role')}
            >
              <option value="">{$_('admin.common.allRoles')}</option>
              {#each roles as role (role.id)}
                <option value={role.id}>{role.name}</option>
              {/each}
            </select>
            <svg width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true">
              <path d="M1 1L5 5L9 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>

          <div class="select">
            <select
              bind:value={filterStatus}
              onchange={applyFilters}
              aria-label={$_('admin.common.status')}
            >
              <option value="">{$_('admin.common.allStatuses')}</option>
              <option value="active">{$_('admin.common.active')}</option>
              <option value="deactivated">{$_('admin.common.deactivated')}</option>
            </select>
            <svg width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true">
              <path d="M1 1L5 5L9 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>

          <button type="button" class="btn-secondary" onclick={resetFilters}>
            {$_('admin.users.reset')}
          </button>
        </div>
      {/if}
    </div>

    {#if canViewDepartments}
      <div
        class="panel-wrap"
        role="tabpanel"
        id="teams-panel"
        aria-labelledby="tab-teams"
        hidden={currentTab !== 'teams'}
      >
        <TeamsTab
          bind:showCreateModal={showTeamsCreate}
          showUnassignedNode={SHOW_UNASSIGNED_NODE}
          onAssignTeam={requestAssign}
        />
      </div>
    {/if}

    {#if canViewUsers}
      <div
        class="panel-wrap"
        role="tabpanel"
        id="users-panel"
        aria-labelledby="tab-users"
        hidden={currentTab !== 'users'}
      >
        <UsersTab
          bind:showCreateModal={showUsersCreate}
          onAssignTeam={requestAssign}
          {roles}
        />
      </div>
    {/if}
  </div>
</div>

<AssignTeamModal
  isOpen={!!assignTarget}
  user={assignTarget}
  departments={deptStore.administeredDepartments}
  isSubmitting={isAssigning}
  onConfirm={handleAssignConfirm}
  onClose={() => (assignTarget = null)}
/>

<style>
  /* app.css gives every button backdrop-filter: blur(); on the flat
     Organization surfaces that repaints the 1px hairlines behind them
     (the tab-row ring, the tree's branch rails), so switch it off. */
  button {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  /* The app shell (.main-content-body) owns scrolling; this page just flows. */
  .org-page {
    min-height: 100%;
    background: var(--gx-page);
    font-family: var(--gx-font);
  }

  .org-main {
    display: flex;
    flex-direction: column;
    gap: 28px;
    padding: 32px;
    align-items: flex-start;
  }

  /* ---------------- page header ---------------- */
  .page-header {
    position: relative;
    min-height: 55px;
    display: flex;
    gap: 4px;
    align-items: center;
    align-self: stretch;
    flex-shrink: 0;
  }

  .header-text {
    display: flex;
    flex-direction: column;
    gap: 4px;
    justify-content: center;
    flex-grow: 1;
    min-width: 0;
  }

  .page-title {
    font-weight: 700;
    font-size: 28px;
    line-height: 100%;
    color: var(--gx-org-ink);
  }

  .page-sub {
    font-weight: 400;
    font-size: 14px;
    line-height: 100%;
    color: var(--gx-slate-500);
  }

  .cta {
    height: 37px;
    border: 0;
    border-radius: 8px;
    background: var(--gx-org-brand);
    display: flex;
    gap: 8px;
    padding: 10px 16px;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: #fff;
    cursor: pointer;
    box-shadow: none;
    transition: background-color 120ms ease;
  }

  .cta:hover {
    background: var(--gx-org-brand-hover);
    transform: none;
  }

  .cta:focus-visible {
    outline: 2px solid var(--gx-org-brand-alt);
    outline-offset: 2px;
  }

  .cta--users {
    background: var(--gx-org-brand);
  }

  .cta--users:hover {
    background: var(--gx-org-brand-alt);
  }

  .cta__label {
    font-weight: 600;
    font-size: 14px;
    line-height: 100%;
    color: #fff;
    white-space: nowrap;
  }

  /* ---------------- controls row ---------------- */
  .controls-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    align-self: stretch;
    flex-shrink: 0;
    min-height: 36px;
    gap: 16px;
    flex-wrap: wrap;
  }

  .filters {
    display: flex;
    gap: 12px;
    align-items: center;
    flex-wrap: wrap;
  }

  .search-input {
    width: 340px;
    max-width: 100%;
    height: 32px;
    border-radius: 8px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    display: flex;
    gap: 8px;
    padding: 8px 12px;
    align-items: center;
    color: var(--gx-slate-500);
    flex-shrink: 1;
    min-width: 180px;
  }

  .search-input:focus-within {
    box-shadow: inset 0 0 0 1px var(--gx-org-brand-alt);
  }

  .search-input input {
    flex-grow: 1;
    min-width: 0;
    width: 100%;
    height: auto;
    border: 0;
    outline: none;
    padding: 0;
    background: transparent;
    font-family: inherit;
    font-weight: 400;
    font-size: 13px;
    line-height: 100%;
    color: var(--gx-slate-900);
    box-shadow: none;
  }

  .search-input input::placeholder {
    color: var(--gx-slate-400);
  }

  .select {
    position: relative;
    height: 32px;
    border-radius: 8px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    display: flex;
    align-items: center;
    flex-shrink: 0;
    color: var(--gx-slate-500);
    transition: background-color 120ms ease;
  }

  .select:hover {
    background: var(--gx-org-track);
  }

  .select select {
    appearance: none;
    -webkit-appearance: none;
    height: 32px;
    min-width: 0;
    width: auto;
    border: 0;
    outline: none;
    background: transparent;
    padding: 8px 32px 8px 12px;
    font-family: inherit;
    font-weight: 400;
    font-size: 13px;
    line-height: 100%;
    color: var(--gx-slate-500);
    cursor: pointer;
    box-shadow: none;
  }

  .select svg {
    position: absolute;
    right: 12px;
    pointer-events: none;
  }

  .btn-secondary {
    height: 35px;
    border: 0;
    border-radius: 8px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    padding: 0 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    font-family: inherit;
    font-weight: 600;
    font-size: 13px;
    color: var(--gx-slate-500);
    white-space: nowrap;
    cursor: pointer;
    transition: background-color 120ms ease;
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--gx-org-track);
    transform: none;
  }

  .btn-secondary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-secondary:focus-visible {
    outline: 2px solid var(--gx-org-brand-alt);
    outline-offset: 2px;
  }

  .panel-wrap {
    align-self: stretch;
    flex-grow: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .panel-wrap[hidden] {
    display: none;
  }

  @media (max-width: 1024px) {
    .org-main {
      padding: 20px 16px;
      gap: 20px;
    }

    .page-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 12px;
    }

    .page-title {
      font-size: 22px;
    }

    .controls-row {
      align-items: flex-start;
    }

    .filters {
      width: 100%;
    }

    .search-input {
      width: 100%;
    }
  }
</style>
