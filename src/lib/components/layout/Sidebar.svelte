<script lang="ts">
  import { Link, navigate } from "svelte-routing";
  import { _ } from 'svelte-i18n';
  import type { User } from "../../types/auth";
  import grenginLogo from '../../../assets/grengin-logo.svg';
  import { permissionsStore } from '../../features/auth/index.js';
  import { PERMISSIONS } from '../../features/auth/permissions.js';
  import { getNotificationsState } from '../../features/notifications/index.js';
  import AlertsPopover from '../../features/notifications/AlertsPopover.svelte';

  interface Props {
    isCollapsed?: boolean;
    onsidebarToggle?: (collapsed: boolean) => void;
    user?: User | null;
    onlogout?: () => void;
  }

  let { isCollapsed = $bindable(false), onsidebarToggle, user = null, onlogout }: Props = $props();

  // Auto-collapse sidebar on mobile after navigation actions
  function collapseSidebarOnMobile() {
    if (isMobileShell()) {
      isCollapsed = true;
      onsidebarToggle?.(isCollapsed);
    }
  }

  let showUserMenu = $state(false);
  let userMenuElement: HTMLElement;
  let userCollapsed = $state(false);
  let closeSwipeStartX = 0;
  let closeSwipeStartY = 0;
  let isCloseSwipeTracking = false;
  let lastResponsiveCompact = typeof window !== 'undefined' ? isResponsiveCompact() : false;

  const notifState = getNotificationsState();
  let showAlertsPopover = $state(false);
  let alertsAnchorChat = $state.raw<HTMLElement | undefined>(undefined);

  // Detect if we're in admin view
  let currentPath = $state(window.location.pathname);
  let isAdminView = $derived(currentPath.startsWith('/admin'));
  let hasAdminPermissions = $derived(permissionsStore.hasAnyPermissions());
  let canViewAnalytics = $derived(
    permissionsStore.hasPermission(PERMISSIONS.analytics.view)
  );
  let canViewOverview = $derived(
    permissionsStore.isPermissionGlobal(PERMISSIONS.analytics.view)
  );
  let canViewDepartments = $derived(
    permissionsStore.hasPermission(PERMISSIONS.departments.view)
  );
  let canViewUsers = $derived(permissionsStore.canViewUsers());
  let canViewAiEngines = $derived(permissionsStore.canViewAiEngines());
  let canViewRoles = $derived(
    permissionsStore.hasPermission(PERMISSIONS.roles.view)
  );
  let canViewSettings = $derived(permissionsStore.canViewSsoProviders());
  let canViewMcpServers = $derived(
    permissionsStore.hasPermission(PERMISSIONS.mcpServers.view)
  );
  let canViewAuditLogs = $derived(
    permissionsStore.hasPermission(PERMISSIONS.auditLogs.view)
  );
  
  // Update currentPath on navigation
  $effect(() => {
    const updatePath = () => {
      currentPath = window.location.pathname;
    };

    // Listen for browser back/forward
    window.addEventListener('popstate', updatePath);

    // Listen for pushState/replaceState (used by svelte-routing Link)
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function(...args) {
      originalPushState.apply(this, args);
      updatePath();
    };

    history.replaceState = function(...args) {
      originalReplaceState.apply(this, args);
      updatePath();
    };

    return () => {
      window.removeEventListener('popstate', updatePath);
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
    type: 'section-header' | 'item';
  }

  const analyticsMenuItem: AdminMenuItem = {
    id: 'usage-analytics',
    path: '/admin/analytics',
    label: $_('sidebar.usageAnalytics'),
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"></path><path d="M18 17V9"></path><path d="M13 17V5"></path><path d="M8 17v-3"></path></svg>',
    type: 'item',
  };
  const overviewMenuItem: AdminMenuItem = {
    id: 'overview',
    path: '/admin/overview',
    label: $_('sidebar.overview'),
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>',
    type: 'item',
  };
  const organizationMenuItem: AdminMenuItem = {
    id: 'organization',
    path: '/admin/departments',
    label: $_('sidebar.organization'),
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle></svg>',
    type: 'item',
  };
  const aiEnginesMenuItem: AdminMenuItem = {
    id: 'ai-engines',
    path: '/admin/ai-engines',
    label: $_('sidebar.aiEngines'),
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"></path><path d="M2 17l10 5 10-5"></path><path d="M2 12l10 5 10-5"></path></svg>',
    type: 'item',
  };
  const manageSectionItem: AdminMenuItem = {
    id: 'section-manage',
    label: $_('sidebar.sectionManage'),
    type: 'section-header',
  };
  const configureSectionItem: AdminMenuItem = {
    id: 'section-configure',
    label: $_('sidebar.sectionConfigure'),
    type: 'section-header',
  };
  const monitorSectionItem: AdminMenuItem = {
    id: 'section-monitor',
    label: $_('sidebar.sectionMonitor'),
    type: 'section-header',
  };
  const settingsSectionItem: AdminMenuItem = {
    id: 'settings',
    path: '/admin/settings',
    label: $_('sidebar.settings'),
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M12 8a4 4 0 0 1 4 4a4 4 0 0 1-4 4a4 4 0 0 1-4-4a4 4 0 0 1 4-4m0 2a2 2 0 0 0-2 2a2 2 0 0 0 2 2a2 2 0 0 0 2-2a2 2 0 0 0-2-2m-2 12c-.25 0-.46-.18-.5-.42l-.37-2.65c-.63-.25-1.17-.59-1.69-.99l-2.49 1.01c-.22.08-.49 0-.61-.22l-2-3.46a.493.493 0 0 1 .12-.64l2.11-1.66L4.5 12l.07-1l-2.11-1.63a.493.493 0 0 1-.12-.64l2-3.46c.12-.22.39-.31.61-.22l2.49 1c.52-.39 1.06-.73 1.69-.98l.37-2.65c.04-.24.25-.42.5-.42h4c.25 0 .46.18.5.42l.37 2.65c.63.25 1.17.59 1.69.98l2.49-1c.22-.09.49 0 .61.22l2 3.46c.13.22.07.49-.12.64L19.43 11l.07 1l-.07 1l2.11 1.63c.19.15.25.42.12.64l-2 3.46c-.12.22-.39.31-.61.22l-2.49-1c-.52.39-1.06.73-1.69.98l-.37 2.65c-.04.24-.25.42-.5.42zm1.25-18l-.37 2.61c-1.2.25-2.26.89-3.03 1.78L5.44 7.35l-.75 1.3L6.8 10.2a5.55 5.55 0 0 0 0 3.6l-2.12 1.56l.75 1.3l2.43-1.04c.77.88 1.82 1.52 3.01 1.76l.37 2.62h1.52l.37-2.61c1.19-.25 2.24-.89 3.01-1.77l2.43 1.04l.75-1.3l-2.12-1.55c.4-1.17.4-2.44 0-3.61l2.11-1.55l-.75-1.3l-2.41 1.04a5.42 5.42 0 0 0-3.03-1.77L12.75 4z"/></svg>',
    type: 'item',
  };
  const accessControlMenuItem: AdminMenuItem = {
    id: 'access-control',
    path: '/admin/access-control',
    label: $_('sidebar.accessControl'),
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>',
    type: 'item',
  };
  const connectorsMenuItem: AdminMenuItem = {
    id: 'connectors',
    path: '/admin/mcp-servers',
    label: $_('sidebar.connectors'),
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13.828 10.172a4 4 0 0 0-5.656 0l-4 4a4 4 0 1 0 5.656 5.656l1.102-1.101"/><path d="M10.172 13.828a4 4 0 0 0 5.656 0l4-4a4 4 0 0 0-5.656-5.656l-1.1 1.1"/></svg>',
    type: 'item',
  };
  const promptLibraryMenuItem: AdminMenuItem = {
    id: 'prompt-library',
    path: '/admin/prompt-library',
    label: $_('sidebar.promptLibrary'),
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
    type: 'item',
  };
  const promptEffectivenessMenuItem: AdminMenuItem = {
    id: 'prompt-effectiveness',
    path: '/admin/prompt-effectiveness',
    label: $_('sidebar.promptEffectiveness'),
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>',
    type: 'item',
  };
  const auditLogsMenuItem: AdminMenuItem = {
    id: 'audit-logs',
    path: '/admin/audit-logs',
    label: $_('sidebar.auditLogs'),
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
    type: 'item',
  };
  function isMenuItem(value: AdminMenuItem | null): value is AdminMenuItem {
    return value !== null;
  }

  let manageItems = $derived<AdminMenuItem[]>(
    [
      (canViewUsers || canViewDepartments) ? organizationMenuItem : null,
      canViewAiEngines ? aiEnginesMenuItem : null,
      canViewMcpServers ? connectorsMenuItem : null,
    ].filter(isMenuItem),
  );

  let monitorItems = $derived<AdminMenuItem[]>(
    [
      canViewAnalytics ? analyticsMenuItem : null,
      canViewAnalytics ? promptEffectivenessMenuItem : null,
      (canViewAuditLogs || hasAdminPermissions) ? auditLogsMenuItem : null,
    ].filter(isMenuItem),
  );

  let configureItems = $derived<AdminMenuItem[]>(
    [
      canViewRoles ? accessControlMenuItem : null,
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
    ...(configureItems.length
      ? [configureSectionItem, ...configureItems]
      : []),
    // SETTINGS section
    ...(canViewSettings ? [settingsSectionItem] : []),
  ]);

  function toggleSidebar() {
    isCollapsed = !isCollapsed;
    userCollapsed = isCollapsed;
    onsidebarToggle?.(isCollapsed);
  }

  function toggleUserMenu() {
    showUserMenu = !showUserMenu;
  }

  function closeUserMenu() {
    showUserMenu = false;
  }

  function handleClickOutside(event: MouseEvent) {
    if (showUserMenu && userMenuElement && !userMenuElement.contains(event.target as Node)) {
      closeUserMenu();
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
    navigate(isAdminView ? '/admin/alerts' : '/alerts');
    collapseSidebarOnMobile();
  }

  function getUserInitials(): string {
    if (!user?.name) return 'U';
    const parts = user.name.split(' ').filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0]?.substring(0, 2).toUpperCase() || 'U';
  }

  function getUserColor(): string {
    const colors = [
      '#667eea', '#f56565', '#48bb78', '#ed8936', 
      '#9f7aea', '#38b2ac', '#ed64a6', '#4299e1'
    ];
    if (!user?.name) return colors[0];
    let hash = 0;
    for (let i = 0; i < user.name.length; i++) {
      hash = user.name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  function handleLogout() {
    closeUserMenu();
    onlogout?.();
  }

  function isMobileShell(): boolean {
    const coarsePointer =
      window.matchMedia('(hover: none), (pointer: coarse)').matches ||
      navigator.maxTouchPoints > 0;
    const shortSide = Math.min(window.innerWidth, window.innerHeight);

    return window.innerWidth <= 768 || (coarsePointer && shortSide <= 600);
  }

  function isResponsiveCompact(): boolean {
    return window.innerWidth <= 1024 || isMobileShell();
  }

  function handleResize() {
    const nextResponsiveCompact = isResponsiveCompact();

    if (nextResponsiveCompact === lastResponsiveCompact) {
      return;
    }

    lastResponsiveCompact = nextResponsiveCompact;

    if (!nextResponsiveCompact && isCollapsed && !userCollapsed) {
      isCollapsed = false;
      onsidebarToggle?.(isCollapsed);
    } else if (nextResponsiveCompact && !isCollapsed && !userCollapsed) {
      isCollapsed = true;
      onsidebarToggle?.(isCollapsed);
    }
  }

  function handleAdminMenuItemClick(path: string | undefined) {
    if (!path) return;

    navigate(path);
    collapseSidebarOnMobile();
  }

  function handleSidebarTouchStart(event: TouchEvent): void {
    if (window.innerWidth > 768 || isCollapsed || event.touches.length !== 1) {
      return;
    }

    const touch = event.touches[0];
    closeSwipeStartX = touch.clientX;
    closeSwipeStartY = touch.clientY;
    isCloseSwipeTracking = true;
  }

  function handleSidebarTouchMove(event: TouchEvent): void {
    if (!isCloseSwipeTracking || event.touches.length !== 1) {
      return;
    }

    const touch = event.touches[0];
    const deltaX = touch.clientX - closeSwipeStartX;
    const deltaY = Math.abs(touch.clientY - closeSwipeStartY);

    if (deltaY > 48) {
      isCloseSwipeTracking = false;
      return;
    }

    if (deltaX <= -72) {
      isCollapsed = true;
      onsidebarToggle?.(isCollapsed);
      isCloseSwipeTracking = false;
    }
  }

  function handleSidebarTouchEnd(): void {
    isCloseSwipeTracking = false;
  }

</script>

<svelte:window onclick={handleClickOutside} onresize={handleResize} onkeydown={(e) => {
  if (e.key === 'Escape' && showUserMenu) {
    closeUserMenu();
  }
}} />

<aside
  class="sidebar"
  class:collapsed={isCollapsed}
  aria-label={$_('sidebar.navigation') || 'Main navigation'}
  ontouchstart={handleSidebarTouchStart}
  ontouchmove={handleSidebarTouchMove}
  ontouchend={handleSidebarTouchEnd}
  ontouchcancel={handleSidebarTouchEnd}
>
  {#snippet alertsUi()}
    <button
      type="button"
      class="alerts-btn burger-btn"
      class:alerts-btn-active={showAlertsPopover}
      onclick={(e) => {
        e.stopPropagation();
        toggleAlertsPopover();
      }}
      aria-expanded={showAlertsPopover}
      aria-label={$_('sidebar.openAlerts')}
      title={$_('sidebar.openAlerts')}
    >
      <svg
        class="alerts-bell-icon"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      {#if notifState.unreadCount > 0}
        <span class="alerts-badge">{notifState.unreadCount > 99 ? '99+' : notifState.unreadCount}</span>
      {/if}
    </button>
  {/snippet}

  <AlertsPopover
    open={showAlertsPopover}
    anchorEl={alertsAnchorChat}
    align={isCollapsed ? 'center' : 'start'}
    onClose={() => {
      showAlertsPopover = false;
    }}
    onNavigate={goToAlertsPage}
  />

  <div class="sidebar-elevated-top">
    <div class="sidebar-header">
      <div class="sidebar-brand">
        {#if !isCollapsed}
          <img src={grenginLogo} alt="Grengin" class="brand-logo" />
          <div class="spacer"></div>
          <div class="notifications-anchor brand-row-actions" bind:this={alertsAnchorChat}>
            {@render alertsUi()}
          </div>
          <button
            type="button"
            class="burger-btn"
            onclick={toggleSidebar}
            aria-expanded={!isCollapsed}
            aria-label={$_('sidebar.toggleSidebar')}
            title={$_('sidebar.toggleSidebar')}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" data-rtl-flip="" class="icon max-md:hidden"><path d="M6.83496 3.99992C6.38353 4.00411 6.01421 4.0122 5.69824 4.03801C5.31232 4.06954 5.03904 4.12266 4.82227 4.20012L4.62207 4.28606C4.18264 4.50996 3.81498 4.85035 3.55859 5.26848L3.45605 5.45207C3.33013 5.69922 3.25006 6.01354 3.20801 6.52824C3.16533 7.05065 3.16504 7.71885 3.16504 8.66301V11.3271C3.16504 12.2712 3.16533 12.9394 3.20801 13.4618C3.25006 13.9766 3.33013 14.2909 3.45605 14.538L3.55859 14.7216C3.81498 15.1397 4.18266 15.4801 4.62207 15.704L4.82227 15.79C5.03904 15.8674 5.31234 15.9205 5.69824 15.9521C6.01398 15.9779 6.383 15.986 6.83398 15.9902L6.83496 3.99992ZM18.165 11.3271C18.165 12.2493 18.1653 12.9811 18.1172 13.5702C18.0745 14.0924 17.9916 14.5472 17.8125 14.9648L17.7295 15.1415C17.394 15.8 16.8834 16.3511 16.2568 16.7353L15.9814 16.8896C15.5157 17.1268 15.0069 17.2285 14.4102 17.2773C13.821 17.3254 13.0893 17.3251 12.167 17.3251H7.83301C6.91071 17.3251 6.17898 17.3254 5.58984 17.2773C5.06757 17.2346 4.61294 17.1508 4.19531 16.9716L4.01855 16.8896C3.36014 16.5541 2.80898 16.0434 2.4248 15.4169L2.27051 15.1415C2.03328 14.6758 1.93158 14.167 1.88281 13.5702C1.83468 12.9811 1.83496 12.2493 1.83496 11.3271V8.66301C1.83496 7.74072 1.83468 7.00898 1.88281 6.41985C1.93157 5.82309 2.03329 5.31432 2.27051 4.84856L2.4248 4.57317C2.80898 3.94666 3.36012 3.436 4.01855 3.10051L4.19531 3.0175C4.61285 2.83843 5.06771 2.75548 5.58984 2.71281C6.17898 2.66468 6.91071 2.66496 7.83301 2.66496H12.167C13.0893 2.66496 13.821 2.66468 14.4102 2.71281C15.0069 2.76157 15.5157 2.86329 15.9814 3.10051L16.2568 3.25481C16.8833 3.63898 17.394 4.19012 17.7295 4.84856L17.8125 5.02531C17.9916 5.44285 18.0745 5.89771 18.1172 6.41985C18.1653 7.00898 18.165 7.74072 18.165 8.66301V11.3271ZM8.16406 15.995H12.167C13.1112 15.995 13.7794 15.9947 14.3018 15.9521C14.8164 15.91 15.1308 15.8299 15.3779 15.704L15.5615 15.6015C15.9797 15.3451 16.32 14.9774 16.5439 14.538L16.6299 14.3378C16.7074 14.121 16.7605 13.8478 16.792 13.4618C16.8347 12.9394 16.835 12.2712 16.835 11.3271V8.66301C16.835 7.71885 16.8347 7.05065 16.792 6.52824C16.7605 6.14232 16.7073 5.86904 16.6299 5.65227L16.5439 5.45207C16.32 5.01264 15.9796 4.64498 15.5615 4.3886L15.3779 4.28606C15.1308 4.16013 14.8165 4.08006 14.3018 4.03801C13.7794 3.99533 13.1112 3.99504 12.167 3.99504H8.16406C8.16407 3.99667 8.16504 3.99829 8.16504 3.99992L8.16406 15.995Z"></path></svg>
          </button>
        {:else}
          <div class="collapsed-logo-container">
            <button
              type="button"
              class="logo-btn"
              onclick={toggleSidebar}
              aria-label={$_('sidebar.toggleSidebar')}
              title={$_('sidebar.toggleSidebar')}
            >
              <img src="/grengin-icon.svg" alt="Grengin" class="logo-icon" />
            </button>
            <button
              type="button"
              class="expand-btn"
              onclick={toggleSidebar}
              aria-expanded={!isCollapsed}
              aria-label={$_('sidebar.expandSidebar')}
              title={$_('sidebar.expandSidebar')}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                <path d="M6.83496 3.99992C6.38353 4.00411 6.01421 4.0122 5.69824 4.03801C5.31232 4.06954 5.03904 4.12266 4.82227 4.20012L4.62207 4.28606C4.18264 4.50996 3.81498 4.85035 3.55859 5.26848L3.45605 5.45207C3.33013 5.69922 3.25006 6.01354 3.20801 6.52824C3.16533 7.05065 3.16504 7.71885 3.16504 8.66301V11.3271C3.16504 12.2712 3.16533 12.9394 3.20801 13.4618C3.25006 13.9766 3.33013 14.2909 3.45605 14.538L3.55859 14.7216C3.81498 15.1397 4.18266 15.4801 4.62207 15.704L4.82227 15.79C5.03904 15.8674 5.31234 15.9205 5.69824 15.9521C6.01398 15.9779 6.383 15.986 6.83398 15.9902L6.83496 3.99992ZM18.165 11.3271C18.165 12.2493 18.1653 12.9811 18.1172 13.5702C18.0745 14.0924 17.9916 14.5472 17.8125 14.9648L17.7295 15.1415C17.394 15.8 16.8834 16.3511 16.2568 16.7353L15.9814 16.8896C15.5157 17.1268 15.0069 17.2285 14.4102 17.2773C13.821 17.3254 13.0893 17.3251 12.167 17.3251H7.83301C6.91071 17.3251 6.17898 17.3254 5.58984 17.2773C5.06757 17.2346 4.61294 17.1508 4.19531 16.9716L4.01855 16.8896C3.36014 16.5541 2.80898 16.0434 2.4248 15.4169L2.27051 15.1415C2.03328 14.6758 1.93158 14.167 1.88281 13.5702C1.83468 12.9811 1.83496 12.2493 1.83496 11.3271V8.66301C1.83496 7.74072 1.83468 7.00898 1.88281 6.41985C1.93157 5.82309 2.03329 5.31432 2.27051 4.84856L2.4248 4.57317C2.80898 3.94666 3.36012 3.436 4.01855 3.10051L4.19531 3.0175C4.61285 2.83843 5.06771 2.75548 5.58984 2.71281C6.17898 2.66468 6.91071 2.66496 7.83301 2.66496H12.167C13.0893 2.66496 13.821 2.66468 14.4102 2.71281C15.0069 2.76157 15.5157 2.86329 15.9814 3.10051L16.2568 3.25481C16.8833 3.63898 17.394 4.19012 17.7295 4.84856L17.8125 5.02531C17.9916 5.44285 18.0745 5.89771 18.1172 6.41985C18.1653 7.00898 18.165 7.74072 18.165 8.66301V11.3271ZM8.16406 15.995H12.167C13.1112 15.995 13.7794 15.9947 14.3018 15.9521C14.8164 15.91 15.1308 15.8299 15.3779 15.704L15.5615 15.6015C15.9797 15.3451 16.32 14.9774 16.5439 14.538L16.6299 14.3378C16.7074 14.121 16.7605 13.8478 16.792 13.4618C16.8347 12.9394 16.835 12.2712 16.835 11.3271V8.66301C16.835 7.71885 16.8347 7.05065 16.792 6.52824C16.7605 6.14232 16.7073 5.86904 16.6299 5.65227L16.5439 5.45207C16.32 5.01264 15.9796 4.64498 15.5615 4.3886L15.3779 4.28606C15.1308 4.16013 14.8165 4.08006 14.3018 4.03801C13.7794 3.99533 13.1112 3.99504 12.167 3.99504H8.16406C8.16407 3.99667 8.16504 3.99829 8.16504 3.99992L8.16406 15.995Z"></path>
              </svg>
            </button>
          </div>
          <div class="notifications-anchor notifications-anchor-collapsed" bind:this={alertsAnchorChat}>
            {@render alertsUi()}
          </div>
        {/if}
      </div>
    </div>
  </div>

  {#if isAdminView}
    <div class="admin-sidebar-header">
      <div class="header-top">
        <button
          class="back-btn"
          onclick={() => handleAdminMenuItemClick('/')}
          title={$_('sidebar.backToChat')}
          aria-label={$_('sidebar.backToChat')}
        >
          <svg data-rtl-flip width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12,19 5,12 12,5"></polyline>
          </svg>
        </button>
        {#if !isCollapsed}
          <h1 class="admin-title">{$_('sidebar.adminPanel')}</h1>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Sidebar Navigation -->
  {#if isAdminView}
    <nav class="sidebar-nav admin-sidebar-nav" aria-label={$_('sidebar.adminNavigation') || 'Admin navigation'}>
      {#each adminMenuItems as item}
        {#if item.type === 'section-header'}
          {#if !isCollapsed}
            <h2 class="section-header" id="nav-section-{item.id}">
              <span>{item.label}</span>
            </h2>
          {:else}
            <div class="section-divider" aria-hidden="true"></div>
          {/if}
        {:else if item.path}
          <button 
            type="button"
            class="sidebar-item"
            class:active={currentPath === item.path || currentPath.startsWith(item.path + '/')}
            onclick={() => handleAdminMenuItemClick(item.path)}
            title={item.label}
            aria-current={currentPath === item.path || currentPath.startsWith(item.path + '/') ? 'page' : undefined}
            aria-label={item.label}
          >
            {#if item.icon}
              <span class="sidebar-icon" aria-hidden="true">{@html item.icon}</span>
            {/if}
            <span class="sidebar-label">{item.label}</span>
          </button>
        {/if}
      {/each}
    </nav>
    {#if !isCollapsed}
      <div class="sidebar-divider" aria-hidden="true"></div>
    {/if}
  {:else}
    {#await import('$lib/bundles/user-chunk')}
      <div class="sidebar-chat-pending" aria-busy="true">
        <div class="sidebar-chat-pending-spinner"></div>
      </div>
    {:then mod}
      {@const SidebarChatSection = mod.SidebarChatSection}
      <SidebarChatSection
        {isCollapsed}
        currentPath={currentPath}
        onCollapseSidebar={collapseSidebarOnMobile}
      />
    {/await}
  {/if}

  <div class="sidebar-elevated-bottom">
    <div class="sidebar-footer">
      <div class="user-menu-container" bind:this={userMenuElement}>
        <button
          class="user-menu-trigger sidebar-item"
          onclick={toggleUserMenu}
          aria-label={$_('sidebar.userMenu')}
          aria-expanded={showUserMenu}
          title={$_('sidebar.userMenu')}
        >
          <div class="user-avatar">
            <div class="user-initials" style="background-color: {getUserColor()};">
              {getUserInitials()}
            </div>
          </div>
          {#if !isCollapsed}
            <div class="user-info">
              <span class="user-name">{user?.name || $_('sidebar.user')}</span>
            </div>
            <svg class="dropdown-arrow" class:rotated={showUserMenu} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <polyline points="6,15 12,9 18,15"/>
            </svg>
          {/if}
        </button>
      </div>
    </div>
  </div>
</aside>


{#if showUserMenu}
  <div class="user-menu-dropdown" role="menu" aria-label={$_('sidebar.userMenu') || 'User menu'} aria-hidden={!showUserMenu} tabindex="-1" onkeydown={(e) => {
    if (e.key === 'Escape') {
      closeUserMenu();
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const items = Array.from(document.querySelectorAll('.user-menu-dropdown [role="menuitem"]'));
      const focusedIndex = items.findIndex(item => item === document.activeElement);
      const nextIndex = e.key === 'ArrowDown' ? (focusedIndex + 1) % items.length : (focusedIndex - 1 + items.length) % items.length;
      (items[nextIndex] as HTMLElement)?.focus();
    }
  }}>
    <Link to="/settings" class="menu-item" onclick={collapseSidebarOnMobile} role="menuitem" aria-label={$_('sidebar.settings')} title={$_('sidebar.settings')}>
      <span class="user-menu-icon" aria-hidden="true">⚙️</span>
      <span>{$_('sidebar.settings')}</span>
    </Link>
    {#if hasAdminPermissions}
      <Link to="/admin" class="menu-item" role="menuitem" aria-label={$_('sidebar.admin')} onclick={collapseSidebarOnMobile}>
        <span class="menu-item-icon" aria-hidden="true">🔒</span>
        <span class="menu-item-label">{$_('sidebar.admin')}</span>
      </Link>
    {/if}
    <button class="menu-item menu-item--danger" role="menuitem" onclick={handleLogout} aria-label={$_('sidebar.signOut')} title={$_('sidebar.signOut')}>
      <svg class="user-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
        <polyline points="16,17 21,12 16,7"/>
        <line x1="21" y1="12" x2="9" y2="12"/>
      </svg>
      <span>{$_('sidebar.signOut')}</span>
    </button>
  </div>
{/if}

<style>
  /* ===== Sidebar Container (Layer 1 - floats above main content) ===== */
  .sidebar {
    position: fixed;
    inset-inline-start: 0;
    top: 0;
    width: 260px;
    height: 100vh;
    display: flex;
    flex-direction: column;
    z-index: 1000;
    overflow-y: auto;
    overflow-x: hidden;
    transform: translate3d(0, 0, 0);
    transition:
      width 0.3s cubic-bezier(0.4, 0, 0.2, 1),
      transform 0.38s cubic-bezier(0.22, 1, 0.36, 1),
      box-shadow 0.38s cubic-bezier(0.22, 1, 0.36, 1);
    will-change: transform;
    backface-visibility: hidden;

    /* Liquid Glass Layer 1 - Primary navigation surface */
    background: var(--bg-primary);
    border-inline-end: 1px solid var(--glass-stroke-dark);
    box-shadow: var(--glass-shadow-dark);
  }

  .sidebar.collapsed {
    width: 72px;
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

  /* ===== Elevated Sections (Liquid Glass Layer 2 - floats above sidebar content) ===== */
  .sidebar-elevated-top,
  .sidebar-elevated-bottom {
    position: relative;
    z-index: 2;

    /* Liquid Glass Layer 2 - Subtle elevation using glass background */
    background: var(--glass-bg-light);
  }

  .sidebar-elevated-top {
    /* Soft downward shadow with highlight edge */
    box-shadow:
      0 4px 16px -8px rgba(0, 0, 0, 0.15),
      var(--glass-highlight);
  }

  .sidebar-elevated-bottom {
    margin-top: auto;
    /* Soft upward shadow with highlight edge */
    box-shadow:
      0 -4px 16px -8px rgba(0, 0, 0, 0.15),
      inset 0 1px 0 rgba(255, 255, 255, 0.08);
  }

  .sidebar-divider {
    display: none;
  }

  /* ===== Sidebar Header ===== */
  .sidebar-header {
    padding: var(--space-lg) var(--space-lg);
  }

  .collapsed .sidebar-header {
    padding: var(--space-lg) var(--space-sm);
  }

  /* ===== Admin Sidebar Header ===== */
  .admin-sidebar-header {
    padding: 1rem 1rem 0 1rem;
  }

  .header-top {
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }

  .back-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    padding: 0;
    border: none;
    background: rgba(var(--glass-tint), 0.06);
    backdrop-filter: blur(0.75rem);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: var(--radius-sm);
    color: var(--text-primary);
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 2px 8px rgba(0, 0, 0, 0.08);
    flex-shrink: 0;
  }

  .back-btn:hover {
    background: rgba(var(--glass-tint), 0.12);
    border-color: var(--link-color);
    color: var(--link-color);
    transform: translateY(-1px);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.15), 0 4px 16px rgba(0, 0, 0, 0.12);
  }

  .back-btn:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }

  .back-btn:active {
    transform: translateY(0);
  }

  .admin-title {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0;
    letter-spacing: -0.02em;
    flex: 1;
  }

  .admin-sidebar-nav {
    flex: 1;
  }

  .sidebar-brand {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    gap: var(--space-md);
  }

  .spacer {
    flex: 1;
  }

  .collapsed .sidebar-brand {
    flex-direction: column;
    gap: var(--space-sm);
    align-items: center;
    justify-content: center;
  }

  .collapsed-logo-container {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
  }

  .expand-btn {
    position: absolute;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    padding: 0;
    border: none;
    background: var(--btn-tertiary);
    border-radius: var(--radius-full);
    color: var(--text-secondary);
    cursor: pointer;
    opacity: 0;
    transition: all 0.25s ease;
    z-index: 10;
    box-shadow: none;
    backdrop-filter: none;
  }

  .collapsed-logo-container:hover .logo-btn {
    opacity: 0;
  }

  .collapsed-logo-container:hover .expand-btn {
    opacity: 1;
  }

  .expand-btn:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
    opacity: 1;
  }

  .expand-btn:hover {
    background: var(--btn-quaternary);
    color: var(--brand);
    transform: scale(1.05);
  }

  /* Burger button - toggle sidebar */
  .burger-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    padding: 0;
    border: none;
    background: var(--btn-tertiary);
    border-radius: var(--radius-full);
    color: var(--text-secondary);
    cursor: pointer;
    transition:
      background-color 0.18s ease,
      color 0.18s ease,
      transform 0.18s ease;
    flex-shrink: 0;
    box-shadow: none;
    backdrop-filter: none;
  }

  @media (hover: hover) and (pointer: fine) {
    .burger-btn:hover {
      background: var(--btn-quaternary);
      color: var(--brand);
      transform: scale(1.05);
    }
  }

  .burger-btn:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }

  .burger-btn:active {
    transform: scale(0.95);
  }

  /* Logo */
  .logo-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 44px;
    padding: var(--space-sm);
    border: none;
    background: transparent;
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: none;
    backdrop-filter: none;
  }

  .logo-btn:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }

  .logo-btn:hover {
    background: var(--btn-tertiary);
    transform: scale(1.02);
  }

  .logo-btn:active {
    transform: scale(0.98);
  }

  .logo-icon {
    width: 28px;
    height: 28px;
    object-fit: contain;
    transition: all 0.25s ease;
  }

  .logo-btn:hover .logo-icon {
    filter: brightness(1.1);
  }

  .brand-logo {
    height: 28px;
    width: auto;
    object-fit: contain;
  }

  .notifications-anchor {
    position: relative;
    flex-shrink: 0;
  }

  /* Bell sits with the sidebar toggle on the right, like the legacy header */
  .brand-row-actions {
    display: flex;
    align-items: center;
  }

  .notifications-anchor-collapsed {
    display: flex;
    justify-content: center;
    width: 100%;
  }

  .alerts-btn {
    position: relative;
  }

  .alerts-btn-active {
    background: var(--btn-quaternary);
    color: var(--brand);
  }

  .alerts-bell-icon {
    display: block;
  }

  .alerts-badge {
    position: absolute;
    top: -2px;
    inset-inline-end: -2px;
    min-width: 1.125rem;
    height: 1.125rem;
    padding: 0 4px;
    border-radius: var(--radius-full);
    background: var(--brand);
    color: var(--bg-primary);
    font-size: 0.625rem;
    font-weight: 700;
    line-height: 1.125rem;
    text-align: center;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
  }

  /* ===== Sidebar Navigation ===== */
  .sidebar-nav {
    flex: 0;
    padding: var(--space-md) var(--space-sm);
  }

  .sidebar-item {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: var(--space-md);
    padding: var(--space-md) var(--space-lg);
    margin-bottom: 2px;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: start;
    border-radius: 0;
    box-shadow: none;
    backdrop-filter: none;
    text-decoration: none;
  }

  .sidebar-item:hover {
    background: var(--btn-tertiary);
    color: var(--text-primary);
    font-weight: 500;
    border-radius: var(--radius-md);
  }

  .sidebar-item:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: -2px;
    border-radius: var(--radius-md);
    background: var(--btn-tertiary);
  }

  .sidebar-item.active {
    background: var(--glass-tint-primary);
    color: var(--brand);
    font-weight: 600;
  }

  .sidebar-item.active:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: -2px;
  }

  .sidebar-icon {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .sidebar-label {
    font-weight: 500;
    white-space: nowrap;
    transition: opacity 0.2s ease, width 0.2s ease;
  }

  .collapsed .sidebar-label {
    opacity: 0;
    width: 0;
    overflow: hidden;
  }

  .collapsed .sidebar-item {
    justify-content: center;
    padding: var(--space-md);
  }

  .collapsed .sidebar-nav {
    padding: var(--space-md) var(--space-xs);
  }

  /* ===== Sidebar Footer ===== */
  .sidebar-footer {
    padding: var(--space-sm) var(--space-lg);
  }

  .collapsed .sidebar-footer {
    padding: var(--space-sm);
  }

  .user-menu-container {
    position: relative;
  }

  .user-menu-trigger {
    width: 100%;
    padding: 0;
    background: transparent;
    border-radius: var(--radius-md);
    justify-content: flex-start;
    gap: var(--space-md);
  }

  .user-menu-trigger:hover {
    background: transparent;
  }

  .user-menu-trigger:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: -2px;
    background: var(--btn-tertiary);
    border-radius: var(--radius-md);
  }

  .collapsed .user-menu-trigger {
    justify-content: center;
    padding: 0;
  }

  .user-avatar {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .user-initials {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.6875rem;
    font-weight: 600;
    color: white;
    text-transform: uppercase;
  }

  .user-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    min-width: 0;
  }

  .collapsed .user-info {
    display: none;
  }

  .user-name {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .dropdown-arrow {
    width: 16px;
    height: 16px;
    color: var(--text-secondary);
    transition: transform 0.25s ease;
    flex-shrink: 0;
  }

  .collapsed .dropdown-arrow {
    display: none;
  }

  .dropdown-arrow.rotated {
    transform: rotate(180deg);
  }

  /* ===== User Menu Dropdown ===== */
  .user-menu-dropdown {
    position: fixed;
    bottom: 3rem;
    inset-inline-start: var(--space-lg);
    min-width: 200px;
    background: color-mix(in oklab, var(--bg-primary) 85%, var(--btn-secondary));
    backdrop-filter: blur(calc(var(--glass-blur) * 1.5)) saturate(1.5);
    -webkit-backdrop-filter: blur(calc(var(--glass-blur) * 1.5)) saturate(1.5);
    border: 1px solid var(--glass-stroke-light);
    border-radius: var(--radius-lg);
    box-shadow:
      0 0 0 1px var(--glass-edge-glow),
      0 4px 12px rgba(0, 0, 0, 0.15),
      0 12px 28px rgba(0, 0, 0, 0.2),
      0 20px 48px rgba(0, 0, 0, 0.15),
      var(--glass-highlight),
      inset 0 0 20px rgba(255, 255, 255, 0.02);
    padding: var(--space-sm);
    overflow: hidden;
    animation: slideUpFade 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    z-index: 10001;
  }

  .menu-item {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    width: 100%;
    padding: var(--space-md) var(--space-lg);
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s ease;
    border-radius: var(--radius-md);
    text-align: start;
  }

  .menu-item:hover {
    background: rgba(var(--glass-tint), 0.08);
    color: var(--text-primary);
  }

  .menu-item:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: -2px;
    background: rgba(var(--glass-tint), 0.12);
  }

  .menu-item--danger {
    color: var(--color-danger, #ef4444);
  }

  .menu-item--danger:hover {
    background: rgba(239, 68, 68, 0.1);
  }

  .menu-item--danger:focus-visible {
    outline-color: var(--color-danger, #ef4444);
  }

  @keyframes slideUpFade {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .user-menu-icon {
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  /* ===== Section Headers ===== */
  .section-header {
    font-size: 0.875rem;
    font-weight: 700;
    padding: var(--space-lg) var(--space-lg) var(--space-sm) var(--space-lg);
    margin-top: var(--space-sm);
    margin-bottom: 0;
    color: var(--text-secondary);
  }

  .section-header:first-child {
    margin-top: 0;
    padding-top: var(--space-sm);
  }

  .section-header span {
    font-size: 0.6875rem;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .section-divider {
    height: 1px;
    background: var(--glass-stroke-dark);
    margin: var(--space-md) var(--space-md);
  }

  .section-divider:first-child {
    display: none;
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

    .burger-btn,
    .logo-btn,
    .expand-btn,
    .back-btn,
    .sidebar-item,
    .user-menu-trigger,
    .menu-item {
      transition: background-color 0.15s ease, color 0.15s ease;
    }
  }

  @media (max-width: 768px) {
    .sidebar {
      width: 280px;
      box-shadow: 4px 0 32px rgba(0, 0, 0, 0.25);
      transition:
        transform 0.38s cubic-bezier(0.22, 1, 0.36, 1),
        box-shadow 0.38s cubic-bezier(0.22, 1, 0.36, 1);
    }

    .sidebar.collapsed {
      transform: translate3d(-100%, 0, 0);
      width: 280px;
      box-shadow: none;
    }

    .user-menu-dropdown {
      inset-inline-start: var(--space-md);
    }

    /* Mobile notifications live in App's mobile header */
    .alerts-btn {
      display: none;
    }
  }

  :global(html[data-app-layout='mobile']) .sidebar {
    width: 280px;
    box-shadow: 4px 0 32px rgba(0, 0, 0, 0.25);
    transition:
      transform 0.38s cubic-bezier(0.22, 1, 0.36, 1),
      box-shadow 0.38s cubic-bezier(0.22, 1, 0.36, 1);
  }

  :global(html[data-app-layout='mobile']) .sidebar.collapsed {
    transform: translate3d(-100%, 0, 0);
    width: 280px;
    box-shadow: none;
  }

  :global(html[data-app-layout='mobile']) .user-menu-dropdown {
    inset-inline-start: var(--space-md);
  }

  :global(html[data-app-layout='mobile']) .alerts-btn {
    display: none;
  }

  @media (max-width: 480px) {
    .sidebar {
      width: 85vw;
      max-width: 320px;
      box-shadow: 4px 0 40px rgba(0, 0, 0, 0.3);
    }

    .sidebar.collapsed {
      transform: translate3d(-100%, 0, 0);
      width: 85vw;
      max-width: 320px;
    }
  }

  @media (prefers-contrast: more) {
    .sidebar-item {
      border: 1px solid transparent;
    }

    .sidebar-item:focus-visible {
      border: 1px solid var(--brand);
    }

    .menu-item {
      border: 1px solid transparent;
    }

    .menu-item:focus-visible {
      border: 1px solid var(--brand);
    }
  }
</style>
