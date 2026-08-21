<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { Link, navigate } from "svelte-routing";
  import { _ } from "svelte-i18n";
  import type { User } from "../../types/auth";
  import grenginLogo from "../../../assets/grengin-logo.svg";
  import { permissionsStore } from "../../features/auth/index.js";
  import { PERMISSIONS } from "../../features/auth/permissions.js";
  import { getNotificationsState } from "../../features/notifications/index.js";
  import AlertsPopover from "../../features/notifications/AlertsPopover.svelte";
  import SidebarSearchModal from "./SidebarSearchModal.svelte";

  interface Props {
    isCollapsed?: boolean;
    onsidebarToggle?: (collapsed: boolean) => void;
    user?: User | null;
    onlogout?: () => void;
  }

  let {
    isCollapsed = $bindable(false),
    onsidebarToggle,
    user = null,
    onlogout,
  }: Props = $props();

  // Auto-collapse sidebar on mobile after navigation actions
  function collapseSidebarOnMobile() {
    if (window.innerWidth <= 768) {
      isCollapsed = true;
      onsidebarToggle?.(isCollapsed);
    }
  }

  let showUserMenu = $state(false);
  let userMenuElement: HTMLElement;
  let userCollapsed = $state(false);
  let showSearchModal = $state(false);

  function openSearchModal() {
    showSearchModal = true;
  }

  const notifState = getNotificationsState();
  let showAlertsPopover = $state(false);
  let alertsAnchorChat = $state.raw<HTMLElement | undefined>(undefined);

  // Detect if we're in admin view
  let currentPath = $state(window.location.pathname);
  let isAdminView = $derived(currentPath.startsWith("/admin"));
  let hasAdminPermissions = $derived(permissionsStore.hasAnyPermissions());
  let canViewAnalytics = $derived(
    permissionsStore.hasPermission(PERMISSIONS.analytics.view),
  );
  let canViewOverview = $derived(
    permissionsStore.isPermissionGlobal(PERMISSIONS.analytics.view),
  );
  let canViewDepartments = $derived(
    permissionsStore.hasPermission(PERMISSIONS.departments.view),
  );
  let canViewUsers = $derived(permissionsStore.canViewUsers());
  let canViewAiEngines = $derived(permissionsStore.canViewAiEngines());
  let canViewRoles = $derived(
    permissionsStore.hasPermission(PERMISSIONS.roles.view),
  );
  let canViewSettings = $derived(permissionsStore.canViewSsoProviders());
  let canViewMcpServers = $derived(
    permissionsStore.hasPermission(PERMISSIONS.mcpServers.view),
  );
  let canViewAuditLogs = $derived(
    permissionsStore.hasPermission(PERMISSIONS.auditLogs.view),
  );

  // Update currentPath on navigation
  $effect(() => {
    const updatePath = () => {
      currentPath = window.location.pathname;
    };

    // Listen for browser back/forward
    window.addEventListener("popstate", updatePath);

    // Listen for pushState/replaceState (used by svelte-routing Link)
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function (...args) {
      originalPushState.apply(this, args);
      updatePath();
    };

    history.replaceState = function (...args) {
      originalReplaceState.apply(this, args);
      updatePath();
    };

    return () => {
      window.removeEventListener("popstate", updatePath);
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
    };
  });

  // Admin menu structure with section headers
  interface AdminMenuItem {
    id: string;
    path?: string;
    label: string;
    icon?: string;
    type: "section-header" | "item";
  }

  const analyticsMenuItem: AdminMenuItem = {
    id: "usage-analytics",
    path: "/admin/analytics",
    label: $_("sidebar.usageAnalytics"),
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"></path><path d="M18 17V9"></path><path d="M13 17V5"></path><path d="M8 17v-3"></path></svg>',
    type: "item",
  };
  const overviewMenuItem: AdminMenuItem = {
    id: "overview",
    path: "/admin/overview",
    label: $_("sidebar.overview"),
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>',
    type: "item",
  };
  const organizationMenuItem: AdminMenuItem = {
    id: "organization",
    path: "/admin/departments",
    label: $_("sidebar.organization"),
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle></svg>',
    type: "item",
  };
  const aiEnginesMenuItem: AdminMenuItem = {
    id: "ai-engines",
    path: "/admin/ai-engines",
    label: $_("sidebar.aiEngines"),
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"></path><path d="M2 17l10 5 10-5"></path><path d="M2 12l10 5 10-5"></path></svg>',
    type: "item",
  };
  const manageSectionItem: AdminMenuItem = {
    id: "section-manage",
    label: $_("sidebar.sectionManage"),
    type: "section-header",
  };
  const configureSectionItem: AdminMenuItem = {
    id: "section-configure",
    label: $_("sidebar.sectionConfigure"),
    type: "section-header",
  };
  const monitorSectionItem: AdminMenuItem = {
    id: "section-monitor",
    label: $_("sidebar.sectionMonitor"),
    type: "section-header",
  };
  const settingsSectionItem: AdminMenuItem = {
    id: "settings",
    path: "/admin/settings",
    label: $_("sidebar.settings"),
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M12 8a4 4 0 0 1 4 4a4 4 0 0 1-4 4a4 4 0 0 1-4-4a4 4 0 0 1 4-4m0 2a2 2 0 0 0-2 2a2 2 0 0 0 2 2a2 2 0 0 0 2-2a2 2 0 0 0-2-2m-2 12c-.25 0-.46-.18-.5-.42l-.37-2.65c-.63-.25-1.17-.59-1.69-.99l-2.49 1.01c-.22.08-.49 0-.61-.22l-2-3.46a.493.493 0 0 1 .12-.64l2.11-1.66L4.5 12l.07-1l-2.11-1.63a.493.493 0 0 1-.12-.64l2-3.46c.12-.22.39-.31.61-.22l2.49 1c.52-.39 1.06-.73 1.69-.98l.37-2.65c.04-.24.25-.42.5-.42h4c.25 0 .46.18.5.42l.37 2.65c.63.25 1.17.59 1.69.98l2.49-1c.22-.09.49 0 .61.22l2 3.46c.13.22.07.49-.12.64L19.43 11l.07 1l-.07 1l2.11 1.63c.19.15.25.42.12.64l-2 3.46c-.12.22-.39.31-.61.22l-2.49-1c-.52.39-1.06.73-1.69.98l-.37 2.65c-.04.24-.25.42-.5.42zm1.25-18l-.37 2.61c-1.2.25-2.26.89-3.03 1.78L5.44 7.35l-.75 1.3L6.8 10.2a5.55 5.55 0 0 0 0 3.6l-2.12 1.56l.75 1.3l2.43-1.04c.77.88 1.82 1.52 3.01 1.76l.37 2.62h1.52l.37-2.61c1.19-.25 2.24-.89 3.01-1.77l2.43 1.04l.75-1.3l-2.12-1.55c.4-1.17.4-2.44 0-3.61l2.11-1.55l-.75-1.3l-2.41 1.04a5.42 5.42 0 0 0-3.03-1.77L12.75 4z"/></svg>',
    type: "item",
  };
  const accessControlMenuItem: AdminMenuItem = {
    id: "access-control",
    path: "/admin/access-control",
    label: $_("sidebar.accessControl"),
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>',
    type: "item",
  };
  const connectorsMenuItem: AdminMenuItem = {
    id: "connectors",
    path: "/admin/mcp-servers",
    label: $_("sidebar.connectors"),
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13.828 10.172a4 4 0 0 0-5.656 0l-4 4a4 4 0 1 0 5.656 5.656l1.102-1.101"/><path d="M10.172 13.828a4 4 0 0 0 5.656 0l4-4a4 4 0 0 0-5.656-5.656l-1.1 1.1"/></svg>',
    type: "item",
  };
  const skillsMenuItem: AdminMenuItem = {
    id: "skills",
    path: "/admin/skills",
    label: $_("sidebar.skills"),
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.4 5.5L20 8l-4 4 1 6-5-3-5 3 1-6-4-4 5.6-.5z"/></svg>',
    type: "item",
  };
  const promptLibraryMenuItem: AdminMenuItem = {
    id: "prompt-library",
    path: "/admin/prompt-library",
    label: $_("sidebar.promptLibrary"),
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
    type: "item",
  };
  const promptEffectivenessMenuItem: AdminMenuItem = {
    id: "prompt-effectiveness",
    path: "/admin/prompt-effectiveness",
    label: $_("sidebar.promptEffectiveness"),
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>',
    type: "item",
  };
  const auditLogsMenuItem: AdminMenuItem = {
    id: "audit-logs",
    path: "/admin/audit-logs",
    label: $_("sidebar.auditLogs"),
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
    type: "item",
  };
  function isMenuItem(value: AdminMenuItem | null): value is AdminMenuItem {
    return value !== null;
  }

  let manageItems = $derived<AdminMenuItem[]>(
    [
      canViewUsers || canViewDepartments ? organizationMenuItem : null,
      canViewAiEngines ? aiEnginesMenuItem : null,
      canViewMcpServers ? connectorsMenuItem : null,
    ].filter(isMenuItem),
  );

  let monitorItems = $derived<AdminMenuItem[]>(
    [
      canViewAnalytics ? analyticsMenuItem : null,
      canViewAnalytics ? promptEffectivenessMenuItem : null,
      canViewAuditLogs || hasAdminPermissions ? auditLogsMenuItem : null,
    ].filter(isMenuItem),
  );

  let configureItems = $derived<AdminMenuItem[]>(
    [
      canViewRoles ? accessControlMenuItem : null,
      canViewRoles ? skillsMenuItem : null,
      canViewRoles ? promptLibraryMenuItem : null,
    ].filter(isMenuItem),
  );

  let adminMenuItems = $derived<AdminMenuItem[]>([
    // Overview dashboard (standalone at top)
    ...(canViewOverview ? [overviewMenuItem] : []),
    // MONITOR section
    ...(monitorItems.length ? [monitorSectionItem, ...monitorItems] : []),
    // MANAGE section
    ...(manageItems.length ? [manageSectionItem, ...manageItems] : []),
    // CONFIGURE section
    ...(configureItems.length ? [configureSectionItem, ...configureItems] : []),
    // SETTINGS section
    ...(canViewSettings ? [settingsSectionItem] : []),
  ]);

  let adminSectionIds = $derived(
    adminMenuItems.filter((i) => i.type === "section-header").map((i) => i.id),
  );

  // The rail draws categories as rules, not labels: the standalone Overview item
  // shares the first block with the first category's items, and every later
  // category opens a new block behind a divider (the second one is the wide rule).
  let adminRailGroups = $derived.by(() => {
    const groups: AdminMenuItem[][] = [[]];
    let seenSection = false;
    for (const item of adminMenuItems) {
      if (item.type === "section-header") {
        if (seenSection) groups.push([]);
        seenSection = true;
        continue;
      }
      groups[groups.length - 1].push(item);
    }
    return groups.filter((g) => g.length > 0);
  });

  function toggleSidebar() {
    isCollapsed = !isCollapsed;
    userCollapsed = isCollapsed;
    onsidebarToggle?.(isCollapsed);
  }

  // Start a new chat (mirrors the chat section's "New chat" action) so the
  // prominent button can live in the sidebar shell, above the sections.
  function startNewChat() {
    navigate("/");
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("focusChatInput"));
    }, 50);
    collapseSidebarOnMobile();
  }

  let railMenuElement = $state.raw<HTMLElement | undefined>(undefined);

  function toggleUserMenu() {
    showUserMenu = !showUserMenu;
  }

  function handleUserMenuNavigate() {
    closeUserMenu();
    collapseSidebarOnMobile();
  }

  function handleUserMenuKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      closeUserMenu();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const scope = (event.currentTarget as HTMLElement) ?? undefined;
    const items = Array.from(
      scope?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
    if (!items.length) return;
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next =
      event.key === "ArrowDown"
        ? (at + 1) % items.length
        : (at - 1 + items.length) % items.length;
    items[next]?.focus();
  }

  function closeUserMenu() {
    showUserMenu = false;
  }

  function handleClickOutside(event: MouseEvent) {
    if (showUserMenu) {
      const target = event.target as Node;
      const inside =
        userMenuElement?.contains(target) || railMenuElement?.contains(target);
      if (!inside) closeUserMenu();
    }
    if (showAlertsPopover) {
      const t = event.target as Node | null;
      if (!alertsAnchorChat?.contains(t)) {
        showAlertsPopover = false;
      }
    }
  }

  function toggleAlertsPopover() {
    showAlertsPopover = !showAlertsPopover;
  }

  function goToAlertsPage() {
    showAlertsPopover = false;
    navigate(isAdminView ? "/admin/alerts" : "/alerts");
    collapseSidebarOnMobile();
  }

  function getUserInitials(): string {
    if (!user?.name) return "U";
    const parts = user.name.split(" ").filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0]?.substring(0, 2).toUpperCase() || "U";
  }

  function handleLogout() {
    closeUserMenu();
    onlogout?.();
  }

  function handleResize() {
    if (window.innerWidth > 1024 && isCollapsed && !userCollapsed) {
      isCollapsed = false;
      onsidebarToggle?.(isCollapsed);
    } else if (window.innerWidth <= 1024 && !isCollapsed && !userCollapsed) {
      isCollapsed = true;
      onsidebarToggle?.(isCollapsed);
    }
  }

  function handleAdminMenuItemClick(path: string | undefined) {
    if (!path) return;

    navigate(path);
    collapseSidebarOnMobile();
  }
</script>

<svelte:window
  onclick={handleClickOutside}
  onresize={handleResize}
  onkeydown={(e) => {
    if (e.key === "Escape" && showUserMenu) {
      closeUserMenu();
    }
    // Cmd/Ctrl+K toggles the search palette from anywhere in the app.
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      showSearchModal = !showSearchModal;
    }
  }}
/>

{#snippet userMenuItems()}
  <Link
    to="/settings"
    class="us-item"
    onclick={handleUserMenuNavigate}
    role="menuitem"
    aria-label={$_("sidebar.settings")}
    title={$_("sidebar.settings")}
  >
    <span class="us-item__icon" aria-hidden="true">
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <circle cx="12" cy="12" r="3" />
        <path
          d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6 1.65 1.65 0 0 0 10 3.09V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
        />
      </svg>
    </span>
    <span class="us-item__label">{$_("sidebar.settings")}</span>
  </Link>
  {#if hasAdminPermissions}
    <span class="us-rule" aria-hidden="true"></span>
    <Link
      to="/admin"
      class="us-item"
      onclick={handleUserMenuNavigate}
      role="menuitem"
      aria-label={$_("sidebar.admin")}
      title={$_("sidebar.admin")}
    >
      <span class="us-item__icon" aria-hidden="true">
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      </span>
      <span class="us-item__label">{$_("sidebar.admin")}</span>
    </Link>
  {/if}
  <span class="us-rule" aria-hidden="true"></span>
  <button
    class="us-item us-item--danger"
    role="menuitem"
    onclick={handleLogout}
    aria-label={$_("sidebar.signOut")}
    title={$_("sidebar.signOut")}
  >
    <span class="us-item__icon" aria-hidden="true">
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16,17 21,12 16,7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </svg>
    </span>
    <span class="us-item__label">{$_("sidebar.signOut")}</span>
  </button>
{/snippet}

<aside
  class="sidebar"
  class:collapsed={isCollapsed}
  class:admin={isAdminView}
  aria-label={$_("sidebar.navigation") || "Main navigation"}
>
  {#snippet navItem(item: AdminMenuItem)}
    {#if item.path}
      {@const active =
        currentPath === item.path || currentPath.startsWith(item.path + "/")}
      <button
        type="button"
        class="ch-item"
        class:ch-item--active={active}
        onclick={() => handleAdminMenuItemClick(item.path)}
        title={item.label}
        aria-current={active ? "page" : undefined}
        aria-label={item.label}
      >
        {#if item.icon}
          <span class="ch-item__icon" aria-hidden="true">{@html item.icon}</span
          >
        {/if}
        <span class="ch-item__label">{item.label}</span>
      </button>
    {/if}
  {/snippet}

  {#snippet panelIcon()}
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      aria-hidden="true"
    >
      <path
        d="M10 2V14M6.66667 6L4.66667 8L6.66667 10M12.6667 2H3.33333C2.59695 2 2 2.59695 2 3.33333V12.6667C2 13.403 2.59695 14 3.33333 14H12.6667C13.403 14 14 13.403 14 12.6667V3.33333C14 2.59695 13.403 2 12.6667 2Z"
      />
    </svg>
  {/snippet}

  {#snippet searchIcon()}
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      aria-hidden="true"
    >
      <path
        d="M14 14L11.1067 11.1067M12.6666 7.33327C12.6666 10.2788 10.2788 12.6666 7.33327 12.6666C4.38775 12.6666 1.99994 10.2788 1.99994 7.33327C1.99994 4.38775 4.38775 1.99994 7.33327 1.99994C10.2788 1.99994 12.6666 4.38775 12.6666 7.33327Z"
      />
    </svg>
  {/snippet}

  {#snippet backChevron()}
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
    >
      <path
        d="M6.0004 2.4996L2.5 6L6.0004 9.5004M2.5 6H9.5008"
        stroke="#427AC6"
        stroke-width="2"
        stroke-linecap="round"
      />
    </svg>
  {/snippet}

  {#snippet alertsUi()}
    <button
      type="button"
      class="alerts-btn"
      class:action-btn={!isCollapsed}
      class:rail-btn={isCollapsed}
      class:alerts-btn-active={showAlertsPopover}
      onclick={(e) => {
        e.stopPropagation();
        toggleAlertsPopover();
      }}
      aria-expanded={showAlertsPopover}
      aria-label={$_("sidebar.openAlerts")}
      title={$_("sidebar.openAlerts")}
    >
      <svg
        class="alerts-bell-icon"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path
          d="M7.625 11.875C7.625 9.18261 9.80761 7 12.5 7C15.1924 7 17.375 9.18261 17.375 11.875V14.4561C17.375 14.6098 17.4225 14.7598 17.511 14.8854L17.8904 15.4243C18.3569 16.0868 17.8831 17 17.0728 17H7.92722C7.11692 17 6.64306 16.0868 7.10959 15.4243L7.48902 14.8854C7.57751 14.7598 7.625 14.6098 7.625 14.4561V11.875Z"
        />
        <path
          d="M10 17H15C15 18.1046 14.1046 19 13 19H12C10.8954 19 10 18.1046 10 17Z"
        />
        <path
          d="M15 8V7.5C15 6.11929 13.8807 5 12.5 5C11.1193 5 10 6.11929 10 7.5V8"
        />
      </svg>
      {#if notifState.unreadCount > 0}
        <span class="alerts-badge"
          >{notifState.unreadCount > 99 ? "99+" : notifState.unreadCount}</span
        >
      {/if}
    </button>
  {/snippet}

  <AlertsPopover
    open={showAlertsPopover}
    anchorEl={alertsAnchorChat}
    align={isCollapsed ? "center" : "start"}
    onClose={() => {
      showAlertsPopover = false;
    }}
    onNavigate={goToAlertsPage}
  />

  <SidebarSearchModal
    open={showSearchModal}
    onClose={() => {
      showSearchModal = false;
    }}
  />

  {#if isAdminView}
    <!-- Control Hub — Figma "control-hub-sidebar" (153:14055) -->
    <div class="ch-body" class:ch-body--rail={isCollapsed}>
      {#if !isCollapsed}
        <div class="ch-logo-row">
          <img src={grenginLogo} alt="Grengin" class="ch-logo" />
          <span class="ch-actions">
            <div class="notifications-anchor" bind:this={alertsAnchorChat}>
              {@render alertsUi()}
            </div>
            <button
              class="ch-action-btn ch-action-btn--flip"
              onclick={toggleSidebar}
              aria-label={$_("sidebar.toggleSidebar")}
              title={$_("sidebar.toggleSidebar")}
            >
              {@render panelIcon()}
            </button>
          </span>
        </div>
        <button
          class="ch-module"
          onclick={() => handleAdminMenuItemClick("/")}
          title={$_("sidebar.backToChat")}
        >
          <span class="ch-module__back" aria-hidden="true">
            {@render backChevron()}
          </span>
          <span class="ch-module__label">{$_("sidebar.adminPanel")}</span>
        </button>
      {:else}
        <div class="ch-logo-btn">
          <img src="/grengin-icon.svg" alt="Grengin" class="ch-logo-mark" />
        </div>
        <div class="ch-rail-spacer" aria-hidden="true"></div>
        <button
          class="ch-back-sm"
          onclick={() => handleAdminMenuItemClick("/")}
          aria-label={$_("sidebar.backToChat")}
          title={$_("sidebar.backToChat")}
        >
          {@render backChevron()}
        </button>
        <button
          class="ch-rail-btn"
          onclick={toggleSidebar}
          aria-label={$_("sidebar.expandSidebar")}
          title={$_("sidebar.expandSidebar")}
        >
          {@render panelIcon()}
        </button>
        <div
          class="notifications-anchor notifications-anchor-collapsed"
          bind:this={alertsAnchorChat}
        >
          {@render alertsUi()}
        </div>
      {/if}

      <nav
        class="ch-nav"
        class:ch-nav--rail={isCollapsed}
        aria-label={$_("sidebar.adminNavigation") || "Admin navigation"}
      >
        {#if isCollapsed}
          {#each adminRailGroups as group, groupIndex}
            {#if groupIndex > 0}
              <div class="ch-divider-wrap" aria-hidden="true">
                <span class="ch-divider" class:ch-divider--wide={groupIndex > 1}
                ></span>
              </div>
            {/if}
            <div class="ch-group" class:ch-group--tight={groupIndex === 0}>
              {#each group as item (item.id)}
                {@render navItem(item)}
              {/each}
            </div>
          {/each}
        {:else}
          {#each adminMenuItems as item (item.id)}
            {#if item.type === "section-header"}
              <span
                class="ch-category"
                class:ch-category--gap={adminSectionIds.indexOf(item.id) > 0}
                id="nav-section-{item.id}">{item.label}</span
              >
            {:else}
              {@render navItem(item)}
            {/if}
          {/each}
        {/if}
      </nav>
      {#if isCollapsed}
        <div class="ch-rail-grow" aria-hidden="true"></div>
      {/if}
    </div>
  {:else}
    <div class="sb-header" class:sb-header--rail={isCollapsed}>
      {#if !isCollapsed}
        <div class="brand-header">
          <img src={grenginLogo} alt="Grengin" class="logo" />
          <div class="header-actions">
            <button
              class="action-btn"
              onclick={openSearchModal}
              aria-label={$_("sidebar.searchTitle")}
              title={$_("sidebar.searchTitle")}
            >
              {@render searchIcon()}
            </button>
            <div class="notifications-anchor" bind:this={alertsAnchorChat}>
              {@render alertsUi()}
            </div>
            <button
              class="action-btn action-btn--flip"
              onclick={toggleSidebar}
              aria-label={$_("sidebar.toggleSidebar")}
              title={$_("sidebar.toggleSidebar")}
            >
              {@render panelIcon()}
            </button>
          </div>
        </div>
        <button
          class="new-chat"
          onclick={startNewChat}
          title={$_("sidebar.newChat")}
        >
          <span class="new-chat__left">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M7 12H17M12 7V17" />
            </svg>
            <span class="new-chat__label">{$_("sidebar.newChat")}</span>
          </span>
        </button>
      {:else}
        <div class="rail-btn rail-btn--logo">
          <img src="/grengin-icon.svg" alt="Grengin" class="logo-mark" />
        </div>
        <div class="rail-spacer" aria-hidden="true"></div>
        <button
          class="rail-btn"
          onclick={toggleSidebar}
          aria-label={$_("sidebar.expandSidebar")}
          title={$_("sidebar.expandSidebar")}
        >
          {@render panelIcon()}
        </button>
        <button
          class="rail-btn"
          onclick={openSearchModal}
          aria-label={$_("sidebar.searchTitle")}
          title={$_("sidebar.searchTitle")}
        >
          {@render searchIcon()}
        </button>
        <button
          class="rail-btn rail-plus"
          onclick={startNewChat}
          aria-label={$_("sidebar.newChat")}
          title={$_("sidebar.newChat")}
        ></button>
        <div
          class="notifications-anchor notifications-anchor-collapsed"
          bind:this={alertsAnchorChat}
        >
          {@render alertsUi()}
        </div>
        <div class="divider-wrap" aria-hidden="true">
          <span class="divider"></span>
        </div>
      {/if}
    </div>

    <div class="sb-scroll" class:sb-scroll--rail={isCollapsed}>
      <div class="sb-sections">
        {#await import("$lib/bundles/user-chunk")}
          <div class="sidebar-chat-pending" aria-busy="true">
            <div class="sidebar-chat-pending-spinner"></div>
          </div>
        {:then mod}
          {@const SidebarChatSection = mod.SidebarChatSection}
          {@const SidebarProjectsSection = mod.SidebarProjectsSection}
          <SidebarProjectsSection
            {isCollapsed}
            {currentPath}
            onCollapseSidebar={collapseSidebarOnMobile}
          />
          <SidebarChatSection
            {isCollapsed}
            {currentPath}
            onCollapseSidebar={collapseSidebarOnMobile}
          />
        {/await}
      </div>
    </div>
  {/if}

  <!-- user-settings-section — Figma 159:14534 (State=Default / State=Expanded).
       The menu is part of the component and opens upward, in flow above the row. -->
  <div
    class="sidebar-footer"
    class:sidebar-footer--rail={isCollapsed}
    class:expanded={showUserMenu}
    bind:this={userMenuElement}
  >
    {#if !isCollapsed}
      <div
        class="us-menu"
        role="menu"
        aria-label={$_("sidebar.userMenu") || "User menu"}
        aria-hidden={!showUserMenu}
        onkeydown={handleUserMenuKeydown}
      >
        {@render userMenuItems()}
      </div>
    {/if}

    <button
      class="user-row"
      class:user-row--rail={isCollapsed}
      onclick={toggleUserMenu}
      aria-label={$_("sidebar.userMenu")}
      aria-expanded={showUserMenu}
      title={user?.name || $_("sidebar.userMenu")}
    >
      <span class="user-info">
        <span class="avatar-lg">{getUserInitials()}</span>
        {#if !isCollapsed}
          <span class="user-text">
            <span class="user-name">{user?.name || $_("sidebar.user")}</span>
            {#if user?.email}
              <span class="user-plan">{user.email}</span>
            {/if}
          </span>
        {/if}
      </span>
      {#if !isCollapsed}
        <span class="us-chevron" aria-hidden="true">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polyline points="6,15 12,9 18,15" />
          </svg>
        </span>
      {/if}
    </button>
  </div>
</aside>

<!-- The 60px rail is too narrow to hold the 272px menu and the shell clips its
     overflow, so there the same menu is anchored beside the rail instead. -->
{#if isCollapsed && showUserMenu}
  <div class="us-menu us-menu--rail" bind:this={railMenuElement}>
    <div
      class="us-menu__inner"
      role="menu"
      aria-label={$_("sidebar.userMenu") || "User menu"}
      onkeydown={handleUserMenuKeydown}
    >
      {@render userMenuItems()}
    </div>
  </div>
{/if}

<style>
  /* ===== Sidebar Container (Layer 1 - floats above main content) ===== */
  /* ===== Sidebar Container =====
     Figma "Sidebar" (153:14270): State=Expanded 272px, State=Collapsed 60px. */
  .sidebar {
    position: fixed;
    inset-inline-start: 0;
    top: 0;
    width: 272px;
    height: 100vh;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: flex-start;
    z-index: 1000;
    overflow: hidden;
    font-family: var(--gx-font);
    background: var(--gx-surface);
    border-inline-end: 1px solid var(--gx-line-soft);
    transition:
      width 0.3s cubic-bezier(0.4, 0, 0.2, 1),
      transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .sidebar.collapsed {
    width: 60px;
    align-items: center;
    gap: 4px;
    padding: 20px 0;
    background: var(--gx-surface-rail);
    border: 1px solid var(--gx-line);
    border-radius: 0 18px 18px 0;
  }

  /* Control Hub uses the plain white surface and the cooler hairline */
  .sidebar.admin {
    border-inline-end: 1px solid var(--gx-hair);
  }

  .sidebar.admin.collapsed {
    background: var(--gx-surface);
    border: none;
    border-inline-end: 1px solid var(--gx-line);
  }
  .sidebar-chat-pending {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 8rem;
  }

  .sidebar-chat-pending-spinner {
    width: 1.75rem;
    height: 1.75rem;
    border: 2px solid rgba(var(--brand-rgb), 0.2);
    border-top-color: var(--brand);
    border-radius: 50%;
    animation: sidebar-chat-spin 0.8s linear infinite;
  }

  @keyframes sidebar-chat-spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* Hide sidebar scrollbar - only chat-list-section should scroll */
  .sidebar::-webkit-scrollbar {
    display: none;
  }

  .sidebar {
    scrollbar-width: none; /* Firefox */
    -ms-overflow-style: none; /* IE/Edge */
  }

  /* ===== Header (Figma: 112px tall, 20/16/12 padding, 12px gap) ===== */
  .sb-header {
    display: flex;
    flex-direction: column;
    gap: 12px;
    align-self: stretch;
    flex-shrink: 0;
    padding: 20px 16px 12px;
    overflow: hidden;
  }

  .sb-header--rail {
    align-self: auto;
    align-items: center;
    gap: 4px;
    padding: 0;
    overflow: visible;
  }

  /* ===== Scrollable section stack (Figma: 8/16/16 padding, 16px gap) ===== */
  .sb-scroll {
    display: flex;
    flex-direction: column;
    gap: 16px;
    align-items: flex-start;
    align-self: stretch;
    flex-grow: 1;
    min-height: 0;
    padding: 8px 16px 16px;
    overflow-y: auto;
    scrollbar-width: none;
  }

  .sb-scroll::-webkit-scrollbar {
    display: none;
  }

  .sb-scroll--rail {
    width: 100%;
    align-self: auto;
    align-items: center;
    gap: 4px;
    padding: 0;
  }

  .sb-sections {
    display: flex;
    flex-direction: column;
    gap: 20px;
    align-self: stretch;
  }

  .sb-scroll--rail .sb-sections {
    align-self: auto;
    align-items: center;
    gap: 4px;
  }

  /* ===== Control Hub (Figma "control-hub-sidebar" 153:14055) ===== */
  .ch-body {
    display: flex;
    flex-direction: column;
    align-self: stretch;
    flex-grow: 1;
    min-height: 0;
    padding: 20px 16px 0;
    overflow-y: auto;
    scrollbar-width: none;
  }

  .ch-body::-webkit-scrollbar {
    display: none;
  }

  .ch-body--rail {
    align-self: auto;
    align-items: center;
    gap: 4px;
    padding: 0;
    overflow: visible;
  }

  .ch-logo-row {
    display: flex;
    height: 59px;
    padding: 0 4px 28px;
    justify-content: space-between;
    align-items: center;
    align-self: stretch;
    flex-shrink: 0;
  }

  .ch-logo {
    width: 108px;
    height: 24px;
    object-fit: contain;
    object-position: left center;
    flex-shrink: 0;
  }

  .ch-actions {
    display: flex;
    gap: 1px;
    align-items: center;
  }

  .ch-action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--gx-muted);
    cursor: pointer;
    flex-shrink: 0;
    box-shadow: none;
    backdrop-filter: none;
    transition: background-color 120ms ease;
  }

  .ch-action-btn:hover {
    background: var(--gx-fill-soft);
    color: var(--gx-muted);
    transform: none;
    box-shadow: none;
  }

  .ch-action-btn:focus-visible {
    outline: 2px solid var(--gx-nav-accent);
    outline-offset: 2px;
  }

  .ch-action-btn--flip,
  .ch-action-btn--flip:hover,
  .ch-action-btn--flip:active {
    transform: scaleX(-1);
  }

  /* module pill: back affordance + the module's own name */
  .ch-module {
    display: flex;
    width: 100%;
    height: 44px;
    gap: 10px;
    padding: 10px;
    justify-content: flex-start;
    align-items: center;
    flex-shrink: 0;
    border: none;
    border-radius: 8px;
    background: var(--gx-module-bg);
    cursor: pointer;
    box-shadow: none;
    backdrop-filter: none;
    transition: background-color 120ms ease;
  }

  .ch-module:hover {
    background: var(--gx-module-bg-hover);
    transform: none;
    box-shadow: none;
  }

  .ch-module:focus-visible {
    outline: 2px solid var(--gx-nav-accent);
    outline-offset: 2px;
  }

  .ch-module__back,
  .ch-back-sm {
    display: flex;
    width: 24px;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    border: none;
    border-radius: 6px;
    background: var(--gx-surface);
    color: var(--gx-nav-accent);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    backdrop-filter: none;
  }

  .ch-module__back {
    align-self: stretch;
  }

  .ch-back-sm {
    height: 24px;
    /* the global button base sets 10px/20px padding, which would collapse the
       24px box to zero content width and swallow the chevron */
    padding: 0;
    cursor: pointer;
    transition: background-color 120ms ease;
  }

  .ch-back-sm:hover {
    background: var(--gx-module-bg);
    color: var(--gx-nav-accent);
    transform: none;
    box-shadow: inset 0 0 0 1px var(--gx-hair);
  }

  .ch-back-sm:focus-visible {
    outline: 2px solid var(--gx-nav-accent);
    outline-offset: 2px;
  }

  .ch-module__back svg,
  .ch-back-sm svg {
    display: block;
    width: 12px;
    height: 12px;
  }

  .ch-module__label {
    font-size: 15px;
    font-weight: 600;
    line-height: 20px;
    color: var(--gx-nav-accent);
    white-space: nowrap;
  }

  .ch-logo-btn {
    display: flex;
    width: 40px;
    height: 40px;
    border-radius: 8px;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .ch-logo-mark {
    width: 28px;
    height: 28px;
    border-radius: 6px;
    object-fit: contain;
    flex-shrink: 0;
  }

  .ch-rail-spacer {
    height: 12px;
    align-self: stretch;
    flex-shrink: 0;
  }

  .ch-rail-grow {
    flex-grow: 1;
    align-self: stretch;
  }

  /* ===== Brand row (Figma: 28px tall, logo 108x24, 4px action gap) ===== */
  .brand-header {
    display: flex;
    height: 28px;
    align-items: center;
    justify-content: space-between;
    align-self: stretch;
  }

  .logo {
    width: 108px;
    height: 24px;
    object-fit: contain;
    object-position: left center;
    flex-shrink: 0;
  }

  .header-actions {
    display: flex;
    gap: 4px;
    align-items: center;
  }

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--gx-muted);
    cursor: pointer;
    flex-shrink: 0;
    box-shadow: none;
    backdrop-filter: none;
    transition: background-color 120ms ease;
  }

  .action-btn:hover {
    background: var(--gx-fill-soft);
    color: var(--gx-muted);
    transform: none;
    box-shadow: none;
  }

  .action-btn:active {
    background: var(--gx-line);
    transform: none;
  }

  .action-btn:focus-visible {
    outline: 2px solid var(--gx-blue);
    outline-offset: 2px;
  }

  /* the panel glyph is mirrored so the caret points the way the panel moves */
  .action-btn--flip,
  .action-btn--flip:hover,
  .action-btn--flip:active {
    transform: scaleX(-1);
  }

  .logo-mark {
    width: 28px;
    height: 28px;
    border-radius: 6px;
    object-fit: contain;
    flex-shrink: 0;
  }

  .rail-btn--logo {
    cursor: default;
  }

  .rail-spacer {
    height: 12px;
    align-self: stretch;
    flex-shrink: 0;
  }

  .divider-wrap {
    display: flex;
    height: 16px;
    align-items: center;
    justify-content: center;
    align-self: stretch;
    flex-shrink: 0;
  }

  .divider {
    width: 24px;
    height: 1px;
    background: var(--gx-line);
  }

  .notifications-anchor {
    position: relative;
    display: flex;
    flex-shrink: 0;
  }

  .notifications-anchor-collapsed {
    justify-content: center;
  }
  .alerts-btn {
    position: relative;
  }

  .alerts-btn-active {
    background: var(--gx-fill-soft);
    color: var(--gx-ink);
  }

  .alerts-bell-icon {
    display: block;
  }

  .alerts-badge {
    position: absolute;
    top: -2px;
    inset-inline-end: -2px;
    min-width: 15px;
    height: 15px;
    padding: 0 3px;
    border-radius: var(--radius-full);
    background: var(--gx-amber-dot);
    color: #fff;
    font-size: 9px;
    font-weight: 700;
    line-height: 15px;
    text-align: center;
    box-shadow: 0 0 0 2px var(--gx-surface);
  }

  .collapsed .alerts-badge {
    box-shadow: 0 0 0 2px var(--gx-surface-rail);
  }

  /* ===== Control Hub navigation ===== */
  .ch-nav {
    display: flex;
    flex-direction: column;
    align-self: stretch;
    gap: 2px;
    padding-top: 12px;
  }

  .ch-nav--rail {
    align-self: auto;
    align-items: center;
    gap: 4px;
    padding-top: 0;
    width: 100%;
  }

  .ch-category {
    padding: 12px 8px 4px;
    font-size: 10px;
    font-weight: 700;
    line-height: 14px;
    letter-spacing: 0;
    text-transform: uppercase;
    color: var(--gx-category);
    white-space: nowrap;
  }

  .ch-category--gap {
    padding-top: 16px;
  }

  /* nav row: 36px tall, 8px radius, 24px icon box, 12px label */
  .ch-item {
    display: flex;
    width: 100%;
    height: 36px;
    gap: 4px;
    padding: 9px 10px;
    justify-content: flex-start;
    align-items: center;
    flex-shrink: 0;
    border: none;
    border-radius: 8px;
    background: transparent;
    cursor: pointer;
    text-align: start;
    box-shadow: none;
    backdrop-filter: none;
    transition: background-color 120ms ease;
  }

  .ch-item:hover {
    background: var(--gx-nav-hover);
    transform: none;
    box-shadow: none;
  }

  .ch-item:focus-visible {
    outline: 2px solid var(--gx-nav-accent);
    outline-offset: -2px;
  }

  .ch-item--active {
    background: var(--gx-nav-active-bg);
  }

  .ch-item--active:hover {
    background: var(--gx-nav-active-bg-hover);
  }

  .ch-item__icon {
    display: flex;
    width: 24px;
    height: 24px;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--gx-nav-text);
  }

  .ch-item__icon :global(svg) {
    display: block;
    width: 18px;
    height: 18px;
  }

  .ch-item__label {
    flex-grow: 1;
    min-width: 0;
    font-size: 12px;
    font-weight: 500;
    line-height: 16px;
    color: var(--gx-nav-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ch-item--active .ch-item__icon,
  .ch-item--active .ch-item__label {
    color: var(--gx-nav-active-fg);
  }

  /* rail variant: icon-only 40px buttons, categories become rules */
  .ch-nav--rail .ch-item {
    width: 40px;
    height: 40px;
    padding: 0;
    justify-content: center;
    gap: 0;
  }

  .ch-nav--rail .ch-item__label {
    display: none;
  }

  .ch-group {
    display: flex;
    flex-direction: column;
    width: 40px;
    gap: 8px;
    align-items: center;
    flex-shrink: 0;
  }

  .ch-group--tight {
    gap: 4px;
  }

  .ch-divider-wrap {
    display: flex;
    height: 16px;
    align-items: center;
    justify-content: center;
    align-self: stretch;
    flex-shrink: 0;
  }

  .ch-divider {
    width: 24px;
    height: 1px;
    background: var(--gx-line);
  }

  .ch-divider--wide {
    width: 32px;
    background: var(--gx-hair);
  }

  /* ===== user-settings-section (Figma 159:14534) =====
     State=Default is the 56px profile row; State=Expanded stacks the menu
     above it, so the footer is the component and the menu opens upward. */
  .sidebar-footer {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    align-self: stretch;
    flex-shrink: 0;
  }

  .sidebar-footer--rail {
    width: 100%;
    align-self: auto;
  }

  .user-row {
    display: flex;
    width: 100%;
    height: 56px;
    gap: 8px;
    padding: 12px;
    justify-content: space-between;
    align-items: center;
    flex-shrink: 0;
    border: 1px solid var(--gx-line);
    border-radius: 4px 4px 0 0;
    background: var(--gx-surface);
    cursor: pointer;
    box-shadow: none;
    backdrop-filter: none;
    transition: background-color 120ms ease;
  }

  .user-row:hover {
    background: var(--gx-surface-rail);
    transform: none;
    box-shadow: none;
  }

  .expanded .user-row {
    border-top-width: 0;
    border-radius: 0;
  }

  .user-row:focus-visible {
    outline: 2px solid var(--gx-blue);
    outline-offset: -2px;
  }

  /* rail variant: the 48px hit area from State=Collapsed, no hairline */
  .user-row--rail {
    height: 48px;
    padding: 0;
    justify-content: center;
    border: 0;
    border-radius: 24px;
    background: transparent;
  }

  .user-info {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-grow: 1;
    min-width: 0;
  }

  .user-row--rail .user-info {
    flex-grow: 0;
    justify-content: center;
  }

  .avatar-lg {
    display: flex;
    width: 32px;
    height: 32px;
    border-radius: 16px;
    background: var(--gx-avatar);
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    font-size: 11px;
    font-weight: 700;
    line-height: 1;
    color: #fff;
  }

  .user-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex-grow: 1;
    min-width: 0;
    text-align: start;
  }

  .user-name {
    font-size: 13px;
    font-weight: 600;
    line-height: 1;
    color: var(--gx-ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .user-plan {
    font-size: 11px;
    font-weight: 400;
    line-height: 1;
    color: var(--gx-dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ===== "New chat" (Figma: 40px, 8px radius, soft fill) ===== */
  .new-chat {
    display: flex;
    height: 40px;
    padding: 10px 12px;
    justify-content: space-between;
    align-items: center;
    align-self: stretch;
    flex-shrink: 0;
    border: none;
    border-radius: 8px;
    background: var(--gx-module-bg);
    cursor: pointer;
    box-shadow: none;
    backdrop-filter: none;
    transition: background-color 120ms ease;
  }

  .new-chat:hover {
    background: var(--gx-module-bg);
    transform: none;
    box-shadow: none;
  }

  .new-chat:focus-visible {
    outline: 2px solid var(--gx-blue);
    outline-offset: 2px;
  }

  .new-chat__left {
    display: flex;
    gap: 2px;
    align-items: center;
    color: var(--gx-nav-accent);
  }

  .new-chat__label {
    font-size: 15px;
    font-weight: 600;
    line-height: 20px;
    color: var(--gx-nav-accent);
    white-space: nowrap;
  }

  /* ===== Collapsed rail icon buttons (Figma: 40px, 8px radius) ===== */
  .rail-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    padding: 0;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--gx-muted);
    cursor: pointer;
    flex-shrink: 0;
    overflow: hidden;
    box-shadow: none;
    backdrop-filter: none;
    transition: background-color 120ms ease;
  }

  .rail-btn:hover {
    background: var(--gx-fill-soft);
    color: var(--gx-muted);
    transform: none;
    box-shadow: none;
  }

  .rail-btn:active {
    background: var(--gx-line);
    transform: none;
  }

  .rail-btn:focus-visible {
    outline: 2px solid var(--gx-blue);
    outline-offset: 2px;
  }

  /* the rail's "new chat" is drawn as a bare plus in the design */
  .rail-plus {
    position: relative;
  }

  .rail-plus::before,
  .rail-plus::after {
    content: "";
    position: absolute;
    border-radius: 1px;
    background: var(--gx-slate);
  }

  .rail-plus::before {
    left: 13px;
    top: 19.25px;
    width: 14px;
    height: 1.5px;
  }

  .rail-plus::after {
    left: 19.25px;
    top: 13px;
    width: 1.5px;
    height: 14px;
  }

  .us-chevron {
    display: flex;
    width: 20px;
    height: 20px;
    border-radius: 4px;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--gx-dim);
    transition: transform 160ms ease;
  }

  .expanded .us-chevron {
    transform: rotate(180deg);
  }

  /* the menu: collapsed by default, grown in place when expanded */
  .us-menu {
    display: flex;
    flex-direction: column;
    gap: 2px;
    align-self: stretch;
    padding: 0 8px;
    border: 1px solid var(--gx-menu-line);
    border-width: 0 1px;
    border-radius: 8px 8px 0 0;
    background: var(--gx-surface-rail);
    overflow: hidden;
    max-height: 0;
    opacity: 0;
    transition:
      max-height 160ms ease,
      opacity 120ms ease,
      padding 160ms ease;
  }

  .expanded .us-menu {
    max-height: 132px;
    opacity: 1;
    padding: 4px 8px 12px;
    border-width: 1px;
  }

  /* `Link` renders its <a> outside this component, so it never receives the
     scope class — these rules are :global, kept tight under .us-menu. */
  .us-menu :global(.us-item) {
    display: flex;
    height: 36px;
    width: 100%;
    gap: 10px;
    padding: 8px 10px;
    justify-content: flex-start;
    align-items: center;
    align-self: stretch;
    flex-shrink: 0;
    border: 0;
    border-radius: 6px;
    background: none;
    color: inherit;
    text-align: start;
    text-decoration: none;
    cursor: pointer;
    box-shadow: none;
    backdrop-filter: none;
    transition: background-color 120ms ease;
  }

  .us-menu :global(.us-item:hover) {
    background: var(--gx-fill-soft);
    transform: none;
    box-shadow: none;
  }

  .us-menu :global(.us-item:focus-visible) {
    outline: 2px solid var(--gx-blue);
    outline-offset: -2px;
  }

  .us-menu :global(.us-item__icon) {
    display: flex;
    width: 20px;
    height: 20px;
    border-radius: 5px;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    background: var(--gx-fill-soft);
    color: var(--gx-muted);
  }

  .us-menu :global(.us-item__label) {
    flex-grow: 1;
    min-width: 0;
    font-size: 13px;
    font-weight: 500;
    line-height: 1;
    color: var(--gx-ink);
  }

  .us-menu :global(.us-rule) {
    height: 1px;
    align-self: stretch;
    flex-shrink: 0;
    background: var(--gx-rule);
  }

  .us-menu :global(.us-item--danger:hover) {
    background: var(--gx-danger-soft);
  }

  .us-menu :global(.us-item--danger .us-item__icon) {
    background: var(--gx-danger-soft);
    color: var(--gx-danger);
  }

  .us-menu :global(.us-item--danger .us-item__label) {
    font-weight: 600;
    color: var(--gx-danger);
  }

  /* rail variant: same menu, anchored beside the 60px rail */
  .us-menu--rail {
    position: fixed;
    inset-inline-start: 68px;
    bottom: 16px;
    z-index: 1001;
    width: 232px;
    max-height: none;
    opacity: 1;
    padding: 0;
    border: 0;
    border-radius: 8px;
    background: transparent;
    overflow: visible;
    animation: us-menu-in 140ms ease;
  }

  .us-menu__inner {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 4px 8px 8px;
    border: 1px solid var(--gx-menu-line);
    border-radius: 8px;
    background: var(--gx-surface-rail);
    box-shadow: 0 12px 24px 0 rgba(0, 0, 0, 0.08);
  }

  @keyframes us-menu-in {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
  }

  /* ===== Mobile Responsiveness ===== */
  @media (prefers-reduced-motion: reduce) {
    * {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }

    .sidebar {
      transition: none;
    }

    .action-btn,
    .rail-btn,
    .new-chat,
    .ch-action-btn,
    .ch-back-sm,
    .ch-module,
    .ch-item,
    .user-row,
    :global(.us-item) {
      transition:
        background-color 0.15s ease,
        color 0.15s ease;
    }
  }

  @media (max-width: 768px) {
    .sidebar {
      width: 280px;
      box-shadow: 4px 0 32px rgba(0, 0, 0, 0.25);
    }

    .sidebar.collapsed {
      transform: translateX(-100%);
      width: 280px;
      padding: 0;
      border: none;
      border-radius: 0;
      align-items: flex-start;
      background: var(--gx-surface);
    }

    /* Mobile notifications live in App's mobile header */
    .alerts-btn {
      display: none;
    }
  }

  @media (max-width: 480px) {
    .sidebar {
      width: 85vw;
      max-width: 320px;
      box-shadow: 4px 0 40px rgba(0, 0, 0, 0.3);
    }

    .sidebar.collapsed {
      transform: translateX(-100%);
      width: 85vw;
      max-width: 320px;
      padding: 0;
      border: none;
      border-radius: 0;
      align-items: flex-start;
      background: var(--gx-surface);
    }
  }

  @media (prefers-contrast: more) {
    .ch-item {
      border: 1px solid transparent;
    }

    .ch-item:focus-visible {
      border: 1px solid var(--gx-nav-accent);
    }

    :global(.us-item) {
      border: 1px solid transparent;
    }

    :global(.us-item:focus-visible) {
      border: 1px solid var(--gx-blue);
    }
  }
</style>
