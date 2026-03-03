<script lang="ts">
  import { onMount } from "svelte";
  import { _ } from "svelte-i18n";
  import PageHeader from "../components/PageHeader.svelte";
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
  let availableTabIds = $derived(TABS.map((t) => t.id));

  // State
  let currentTab = $state<TabId>(DEFAULT_TAB);

  // URL utilities
  function getTabFromQuery(): TabId {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get("tab");

    if (!tabParam) return DEFAULT_TAB;

    const normalized = tabParam.toLowerCase() as TabId;
    return availableTabIds.includes(normalized) ? normalized : DEFAULT_TAB;
  }

  function syncQueryToUrl(tab: TabId, replace = false): void {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);

    if (replace) {
      history.replaceState(null, "", url.toString());
    } else {
      history.pushState(null, "", url.toString());
    }
  }

  // Event handlers
  function handleTabClick(tab: TabId): void {
    if (currentTab === tab) return;
    currentTab = tab;
    syncQueryToUrl(tab);
  }

  function handleKeydown(event: KeyboardEvent, tab: TabId): void {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleTabClick(tab);
    }
  }

  function handlePopState(): void {
    currentTab = getTabFromQuery();
  }

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

  // Initialize on mount
  onMount(() => {
    const initialTab = getTabFromQuery();
    currentTab = initialTab;

    if (!window.location.search.includes("tab=")) {
      syncQueryToUrl(initialTab, true);
    }

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  });
</script>

<div class="access-control-container">
  <PageHeader
    title={$_("admin.accessControl.title")}
    subtitle={$_("admin.accessControl.subtitle")}
  />

  <!-- Tab navigation -->
  <div class="tabs" role="tablist" aria-label="Access Control tabs">
    {#each TABS as tab (tab.id)}
      <button
        class="tab"
        class:tab--active={currentTab === tab.id}
        role="tab"
        aria-selected={currentTab === tab.id}
        aria-controls={`${tab.id}-panel`}
        aria-label={tab.ariaLabel}
        tabindex={currentTab === tab.id ? 0 : -1}
        onclick={() => handleTabClick(tab.id)}
        onkeydown={(e) => handleKeydown(e, tab.id)}
      >
        {tab.label}
      </button>
    {/each}
  </div>

  <!-- Tab content -->
  <div
    class="access-control-content"
    role="tabpanel"
    id={`${currentTab}-panel`}
    aria-labelledby={currentTab}
    tabindex="0"
  >
    {#if currentTab === "roles"}
      <RolesTab
        {roles}
        {permissions}
        loading={rolesLoading}
        onRolesChange={fetchRoles}
      />
    {:else if currentTab === "permissions"}
      <PermissionsTab {permissions} loading={permissionsLoading} />
    {/if}
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
  }

  .access-control-content {
    padding: var(--space-sm);
    background: rgba(var(--glass-tint), 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-lg);
    outline: none;
    min-height: 200px;
  }

  @media (max-width: 768px) {
    .access-control-container {
      padding: var(--space-xl);
    }

    .tabs {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: thin;
    }

    .tab {
      white-space: nowrap;
    }
  }

  @media (max-width: 480px) {
    .access-control-container {
      padding: var(--space-lg);
    }

    .tab {
      padding: var(--space-sm) var(--space-md);
      font-size: 0.875rem;
    }
  }
</style>
