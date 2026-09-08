<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

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
  import { permissionsStore } from "../../features/auth/index.js";
  import { setPageTitle } from "../../utils/pageTitle";

  $effect(() => {
    setPageTitle($_("admin.accessControl.title"));
  });

  // The design lifts "Add New Roles" out of the tab body and into the page
  // header, so the gate that used to live on RolesTab's own button has to be
  // evaluated here too. RolesTab still owns the modal.
  const canManageRoles = $derived(permissionsStore.canManageRoles());

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

  // ".layout-toggles" — the design keeps a separate list/grid choice per tab.
  type ViewMode = "list" | "grid";
  let rolesView = $state<ViewMode>("list");
  let permissionsView = $state<ViewMode>("list");
  const currentView = $derived(
    currentTab === "roles" ? rolesView : permissionsView,
  );

  function setView(view: ViewMode) {
    if (currentTab === "roles") rolesView = view;
    else permissionsView = view;
  }

  // Lets the header CTA drive the modal that RolesTab owns.
  let rolesTab = $state<RolesTab | null>(null);

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

  // ".count-label" — declared after the row state it reads.
  const countLabel = $derived(
    currentTab === "roles"
      ? $_("admin.accessControl.roleCount", { values: { count: roles.length } })
      : $_("admin.accessControl.permissionCount", {
          values: { count: permissions.length },
        }),
  );

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
      toast.error(msg || $_("admin.accessControl.failedToLoadPermissions"));
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
  >
    {#if canManageRoles}
      <button class="cta" type="button" onclick={() => rolesTab?.openAddRole()}>
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          aria-hidden="true"
        >
          <path d="M7 2v10M2 7h10" stroke="currentColor" stroke-width="1.6" />
        </svg>
        <span class="cta__label">{$_("admin.accessControl.addRoleButton")}</span
        >
      </button>
    {/if}
  </PageHeader>

  <!-- ".tabs-container": the segmented switcher on the left, the row count and
       the list/grid choice on the right. -->
  <div class="tabs-container">
    <AdminTabs
      tabs={TABS}
      defaultTab={DEFAULT_TAB}
      tabListLabel={$_("admin.tabListLabels.accessControl")}
      variant="segmented"
      bind:currentTab
    />

    <div class="right-actions">
      <span class="count-label">{countLabel}</span>
      <div
        class="layout-toggles"
        role="group"
        aria-label={$_("admin.accessControl.viewModeLabel")}
      >
        <button
          class="view-toggle"
          type="button"
          aria-pressed={currentView === "grid"}
          onclick={() => setView("grid")}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            aria-hidden="true"
          >
            <rect
              x="1.75"
              y="1.75"
              width="4.5"
              height="4.5"
              rx="1"
              stroke="currentColor"
              stroke-width="1.1"
            />
            <rect
              x="7.75"
              y="1.75"
              width="4.5"
              height="4.5"
              rx="1"
              stroke="currentColor"
              stroke-width="1.1"
            />
            <rect
              x="1.75"
              y="7.75"
              width="4.5"
              height="4.5"
              rx="1"
              stroke="currentColor"
              stroke-width="1.1"
            />
            <rect
              x="7.75"
              y="7.75"
              width="4.5"
              height="4.5"
              rx="1"
              stroke="currentColor"
              stroke-width="1.1"
            />
          </svg>
          <span>{$_("admin.accessControl.viewGrid")}</span>
        </button>
        <button
          class="view-toggle"
          type="button"
          aria-pressed={currentView === "list"}
          onclick={() => setView("list")}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M1.75 3h10.5M1.75 7h10.5M1.75 11h10.5"
              stroke="currentColor"
              stroke-width="1.1"
            />
          </svg>
          <span>{$_("admin.accessControl.viewList")}</span>
        </button>
      </div>
    </div>
  </div>

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
      bind:this={rolesTab}
      {roles}
      {permissions}
      loading={rolesLoading}
      view={rolesView}
      onViewChange={(next) => (rolesView = next)}
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
    <PermissionsTab
      {permissions}
      loading={permissionsLoading}
      view={permissionsView}
    />
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

  /* ".cta" — the design's 37px primary action in the page header. */
  .cta {
    height: 37px;
    display: flex;
    gap: 8px;
    padding: 10px 16px;
    align-items: center;
    border: none;
    border-radius: 8px;
    background: var(--gx-org-primary-500);
    color: #fff;
    cursor: pointer;
    transition: background-color 120ms ease;
  }

  .cta:hover {
    background: var(--gx-ac-cta-hover);
  }

  .cta:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
  }

  .cta svg {
    display: block;
    flex-shrink: 0;
  }

  .cta__label {
    font-family: var(--gx-font);
    font-weight: 600;
    font-size: 14px;
    line-height: 100%;
    white-space: nowrap;
  }

  /* ".tabs-container" */
  .tabs-container {
    /* Active tab ink: #427AC6. Custom properties cross the component boundary,
       so this recolours only THIS page's tabs — the other four pages using
       AdminTabs keep the default slate. */
    --admin-tab-active-fg: var(--gx-org-primary-500);
    display: flex;
    justify-content: space-between;
    align-items: center;
    align-self: stretch;
    gap: 16px;
    flex-shrink: 0;
    margin-bottom: 20px;
  }

  .right-actions {
    display: flex;
    gap: 16px;
    align-items: center;
    flex-shrink: 0;
  }

  .count-label {
    font-family: var(--gx-font);
    font-weight: 400;
    font-size: 13px;
    line-height: 100%;
    color: var(--gx-slate-500);
    white-space: nowrap;
  }

  /* Same segmented control as the Roles/Permissions tabs: identical track and
     pill metrics (AdminTabs' .tabs--segmented) so the two read as one family. */
  .layout-toggles {
    height: 36px;
    border-radius: 8px;
    background: var(--gx-org-track);
    display: flex;
    gap: 4px;
    padding: 4px;
    flex-shrink: 0;
    box-sizing: border-box;
  }

  .view-toggle {
    height: 28px;
    border: none;
    border-radius: 6px;
    background: none;
    box-shadow: none;
    display: flex;
    gap: 6px;
    padding: 6px 16px;
    align-items: center;
    color: var(--gx-slate-500);
    font-family: var(--gx-font);
    font-weight: 600;
    font-size: 13px;
    line-height: 100%;
    white-space: nowrap;
    cursor: pointer;
    box-sizing: border-box;
    transition:
      background-color 120ms ease,
      color 120ms ease;
  }

  .view-toggle svg {
    display: block;
    flex-shrink: 0;
  }

  /* Active pill matches the tabs exactly, including the ink: both read
     --admin-tab-active-fg, declared once on .tabs-container below, so there is a
     single source for the blue. The icon inherits it via currentColor. */
  .view-toggle[aria-pressed="true"] {
    background: var(--gx-card);
    box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.0314);
    color: var(--admin-tab-active-fg);
  }

  .view-toggle:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 1px;
  }

  /* The toggles are a refinement, not the only way to read the page — stack the
     row instead of letting it overflow on small screens. */
  @media (max-width: 768px) {
    .tabs-container {
      flex-direction: column;
      align-items: flex-start;
      gap: 12px;
    }

    .right-actions {
      width: 100%;
      justify-content: space-between;
    }
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
