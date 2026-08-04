<script lang="ts">
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

<div class="organization-page">
  <div class="page-content">
    <div class="org-page-header">
      <div class="org-page-header-top">
        <div class="org-page-header-text">
          <h1 class="org-page-title">{$_('admin.departments.organization')}</h1>
          <p class="org-page-subtitle">{$_('admin.organization.subtitle')}</p>
        </div>
        <div class="org-page-header-actions">
          {#if showCreateDepartmentButton}
            <button type="button" class="btn-primary" onclick={openPrimaryAction}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M8 3V13M3 8H13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
              {$_('admin.departments.createDepartment')}
            </button>
          {:else if showCreateUserButton}
            <button
              type="button"
              class="btn-primary"
              onclick={openPrimaryAction}
              aria-label={$_('admin.users.createUserButton')}
            >
              + {$_('admin.users.createUserButton')}
            </button>
          {/if}
        </div>
      </div>
    </div>

    {#if tabs.length > 1}
      <AdminTabs
        {tabs}
        {defaultTab}
        tabListLabel={$_('admin.tabListLabels.organization')}
        bind:currentTab
      />
    {/if}

    {#if canViewDepartments}
      <div
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
        role="tabpanel"
        id="users-panel"
        aria-labelledby="tab-users"
        hidden={currentTab !== 'users'}
      >
        <UsersTab bind:showCreateModal={showUsersCreate} onAssignTeam={requestAssign} />
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
  .organization-page {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--bg-primary);
  }

  .page-content {
    flex: 1;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    padding: 24px;
  }

  .org-page-header {
    margin-bottom: 8px;
  }

  .org-page-header-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
  }

  .org-page-header-text {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .org-page-title {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0;
    letter-spacing: -0.02em;
  }

  .org-page-subtitle {
    font-size: 0.875rem;
    color: var(--text-secondary);
    margin: 0;
  }

  .org-page-header-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }

  @media (max-width: 1024px) {
    .page-content {
      padding: 16px;
    }

    .org-page-header-top {
      flex-direction: column;
      gap: 12px;
    }

    .org-page-header-actions {
      width: 100%;
    }
  }
</style>
