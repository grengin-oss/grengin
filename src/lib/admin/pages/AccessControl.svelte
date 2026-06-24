<script lang="ts">
  import { _ } from "svelte-i18n";
  import PageHeader from "../components/PageHeader.svelte";
  import AdminTabs from "../components/AdminTabs.svelte";
  import PermissionsTab from "../components/access-control/PermissionsTab.svelte";
  import RolesTab from "../components/access-control/RolesTab.svelte";
  import {
    getPermissions,
    type Permission,
  } from "../../api/admin/permissions.js";
  import { getRoles, type Role } from "../../api/admin/roles.js";
  import { ApiError } from "../../api/client.js";
  import { getLocalizedError } from "../../utils/errorLocalization.js";
  import { toast } from "../../components/Toaster.svelte";

  // Tab configuration
  type TabId = "roles" | "permissions";

  interface TabConfig {
    id: TabId;
    label: string;
    ariaLabel: string;
  }

  let TABS = $derived<TabConfig[]>([
    {
      id: "roles",
      label: $_("admin.accessControl.tabs.roles"),
      ariaLabel: "Roles management",
    },
    {
      id: "permissions",
      label: $_("admin.accessControl.tabs.permissions"),
      ariaLabel: "Permissions management",
    },
  ]);

  const DEFAULT_TAB: TabId = "roles";
  // State
  let currentTab = $state<TabId>(DEFAULT_TAB);
  let rolesPanelRef = $state<HTMLDivElement | null>(null);
  let permissionsPanelRef = $state<HTMLDivElement | null>(null);

  // Permissions state (fetched when permissions or roles tab is shown - roles need it for Add Role)
  let permissionsLoading = $state(false);
  let permissions = $state<Permission[]>([]);
  let permissionsFetched = $state(false);

  // Roles state (fetched when roles tab is shown)
  let rolesLoading = $state(false);
  let roles = $state<Role[]>([]);
  let rolesFetched = $state(false);

  async function fetchPermissions() {
    permissionsLoading = true;
    try {
      const res = await getPermissions();
      permissions = res.permissions;
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? getLocalizedError(err, "description", $_)
          : (err as Error).message;
      toast.error(
        msg || $_("admin.accessControl.failedToLoadPermissions"),
      );
    } finally {
      permissionsLoading = false;
      permissionsFetched = true;
    }
  }

  async function fetchRoles() {
    rolesLoading = true;
    try {
      const res = await getRoles();
      roles = res.roles;
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? getLocalizedError(err, "description", $_)
          : (err as Error).message;
      toast.error(msg || $_("admin.accessControl.failedToLoadRoles"));
    } finally {
      rolesLoading = false;
      rolesFetched = true;
    }
  }

  $effect(() => {
    if (
      currentTab === "permissions" &&
      !permissionsFetched &&
      !permissionsLoading
    ) {
      fetchPermissions();
    }
  });

  $effect(() => {
    if (currentTab === "roles" && !rolesFetched && !rolesLoading) {
      fetchRoles();
    }
    if (currentTab === "roles" && !permissionsFetched && !permissionsLoading) {
      fetchPermissions();
    }
  });

  let prevTab = $state<string | null>(null);

  $effect(() => {
    if (prevTab !== null && currentTab !== prevTab) {
      const activePanel =
        currentTab === "roles" ? rolesPanelRef : permissionsPanelRef;
      activePanel?.focus();
    }
    prevTab = currentTab;
  });

</script>

<div class="access-control-container">
  <PageHeader
    title={$_("admin.accessControl.title")}
    subtitle={$_("admin.accessControl.subtitle")}
  />

  <AdminTabs
    tabs={TABS}
    defaultTab={DEFAULT_TAB}
    tabListLabel={$_("admin.tabListLabels.accessControl")}
    bind:currentTab
  />

  <!-- Tab panels (stable ids improve screen reader tab/panel mapping) -->
  <div
    class="access-control-content"
    role="tabpanel"
    id="roles-panel"
    aria-labelledby="tab-roles"
    tabindex={currentTab === "roles" ? -1 : undefined}
    hidden={currentTab !== "roles"}
    bind:this={rolesPanelRef}
  >
    <RolesTab
      {roles}
      {permissions}
      loading={rolesLoading}
      onRolesChange={fetchRoles}
    />
  </div>
  <div
    class="access-control-content"
    role="tabpanel"
    id="permissions-panel"
    aria-labelledby="tab-permissions"
    tabindex={currentTab === "permissions" ? -1 : undefined}
    hidden={currentTab !== "permissions"}
    bind:this={permissionsPanelRef}
  >
    <PermissionsTab {permissions} loading={permissionsLoading} />
  </div>
</div>

<style>
  .access-control-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    background: var(--bg-primary);
    padding: var(--space-3xl);
    overflow-y: auto;
  }

  .access-control-content {
    padding: var(--space-sm);
    border-radius: var(--radius-lg);
    outline: none;
    min-height: 200px;
  }

  .access-control-content:focus-visible {
    outline: 2px solid var(--brand-ring);
    outline-offset: 2px;
  }

  @media (max-width: 768px) {
    .access-control-container {
      padding: var(--space-xl);
    }
  }

  @media (max-width: 480px) {
    .access-control-container {
      padding: var(--space-lg);
    }
  }
</style>
