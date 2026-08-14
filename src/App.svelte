<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { onMount, onDestroy, untrack } from 'svelte';
  import { Router, Route, navigate } from 'svelte-routing';
  import { Sidebar, MobileHeader } from './lib/components/layout/index.js';
  import Toaster from './lib/components/Toaster.svelte';
  import Login from './lib/features/auth/components/Login.svelte';
  import AuthCallback from './lib/features/auth/components/AuthCallback.svelte';
  import MainAreaRoutes from '$lib/bundles/MainAreaRoutes.svelte';
  import { loadNamespacesForRoute } from '$lib/i18n/index.js';
  import { initAuth, getAuthState, logout, permissionsStore } from './lib/features/auth/index.js';
  import {
    dismissStreamToast,
    fetchNotificationFeed,
    getNotificationsState,
    startNotificationsStream,
    stopNotificationsStream,
  } from './lib/features/notifications/index.js';
  import { NOTIFICATIONS_STREAM_TOAST_ID, toast } from '$lib/components/Toaster.svelte';
  import { GlobalTopBar, DemoGate, DemoWelcome, demoView } from '$lib/features/demo/index.js';
  import { PERMISSIONS } from '$lib/features/auth/permissions.js';
  import { _ } from 'svelte-i18n';

  let sidebarCollapsed = $state(false);
  let currentPath = $state(window.location.pathname);

  const authState = getAuthState();
  const notifState = getNotificationsState();

  $effect(() => {
    const uid = authState.user?.id;
    if (uid == null || uid === '') return;
    void fetchNotificationFeed();
    startNotificationsStream();

    return () => {
      stopNotificationsStream();
    };
  });

  function isAdminView(): boolean {
    return currentPath.startsWith('/admin');
  }

  // Handle stream toast
  $effect(() => {
    const n = notifState.streamToast;

    // Avoid subscribing this effect to toaster's internal module state.
    untrack(() => {
      if (n == null) {
        toast.remove(NOTIFICATIONS_STREAM_TOAST_ID);
        return;
      }

      const description = n.body?.trim() ? n.body : undefined;
      toast.custom(n.title, 'blank', {
        id: NOTIFICATIONS_STREAM_TOAST_ID,
        duration: 5000,
        description,
        streamAlert: true,
        onClick: () => {
          dismissStreamToast();
          navigate(isAdminView() ? '/admin/alerts' : '/alerts');
        },
        onDismiss: () => dismissStreamToast(),
      });
    });
  });

  function isAuthCallback(): boolean {
    // Match only /auth/{provider}/callback pattern
    return /^\/auth\/[^/]+\/callback$/.test(currentPath);
  }

  function isAdminLogin(): boolean {
    return currentPath === '/admin';
  }

  // The interactive demo entry gate lives at /demo only — not at the root — so a
  // plain visit to '/' shows the normal login, and the demo is opt-in by URL.
  function isDemoEntry(): boolean {
    return demoView.enabled && currentPath === '/demo';
  }

  function isMobile() {
    return window.innerWidth <= 768;
  }

  function handleResize() {
    if (isMobile()) {
      sidebarCollapsed = true;
    }
  }

  // Keep currentPath in sync with client navigation (Link / navigate), not only back/forward.
  $effect(() => {
    const updatePath = () => {
      currentPath = window.location.pathname;
    };

    window.addEventListener('popstate', updatePath);

    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function (...args: Parameters<History['pushState']>) {
      originalPushState.apply(this, args);
      updatePath();
    };

    history.replaceState = function (...args: Parameters<History['replaceState']>) {
      originalReplaceState.apply(this, args);
      updatePath();
    };

    return () => {
      window.removeEventListener('popstate', updatePath);
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
    };
  });

  // Preload i18n namespaces when the route changes
  $effect(() => {
    // Subscribe to currentPath so this fires on every navigation
    const path = currentPath;
    loadNamespacesForRoute(path);
  });

  onMount(() => {
    initAuth();
    permissionsStore.init();
    sidebarCollapsed = isMobile();
    window.addEventListener('resize', handleResize);
  });

  async function handleLogout() {
    await logout();
    // In the demo build the real OAuth login (Google/Azure) is non-functional, so a
    // signed-out demo visitor would hit a dead end there. Send them back to the demo
    // entry gate (/demo) they came through instead, so they can re-enter the demo.
    if (demoView.enabled) {
      navigate('/demo', { replace: true });
    }
  }

  function handleLoginSuccess() {
    // Demo entry lives at /demo; there is no /demo app route, so once the demo
    // session is authenticated move to the app root. (No-op for normal login.)
    if (currentPath === '/demo') {
      navigate('/', { replace: true });
    }
  }

  // Safety net for a manual visit to /demo while already signed in (no such app
  // route) — bounce to the app root so the main area isn't blank.
  $effect(() => {
    if (authState.isAuthenticated && currentPath === '/demo') {
      navigate('/', { replace: true });
    }
  });

  // Demo exit (spec §1): tear down the session on the backend, then return to grengin.com.
  function handleDemoExit(): boolean {
    // logout() POSTs /auth/logout then clears local auth. Navigate only once it settles,
    // and return false so GlobalTopBar skips its immediate navigation (which would abort
    // the in-flight teardown request). This uses the onExit async-teardown seam by design.
    void logout().finally(() => {
      window.location.href = 'https://grengin.com';
    });
    return false;
  }

  // Toggle the demo layout offset so the fixed top bar doesn't overlap the app.
  $effect(() => {
    const active = demoView.enabled && authState.isAuthenticated;
    document.body.classList.toggle('demo-active', active);
    return () => document.body.classList.remove('demo-active');
  });

  // Is the current admin route visible to the effective permissions? Mirrors the
  // Sidebar's per-section gating so we can detect a now-forbidden page.
  function isAdminPathAllowed(path: string): boolean {
    const p = permissionsStore;
    if (path.startsWith('/admin/overview')) return p.isPermissionGlobal(PERMISSIONS.analytics.view);
    if (path.startsWith('/admin/analytics')) return p.hasPermission(PERMISSIONS.analytics.view);
    if (path.startsWith('/admin/prompt-effectiveness')) return p.hasPermission(PERMISSIONS.analytics.view);
    if (path.startsWith('/admin/audit-logs')) return p.hasPermission(PERMISSIONS.auditLogs.view) || p.hasAnyPermissions();
    if (path.startsWith('/admin/departments') || path.startsWith('/admin/organization'))
      return p.canViewUsers() || p.hasPermission(PERMISSIONS.departments.view);
    if (path.startsWith('/admin/ai-engines')) return p.canViewAiEngines();
    if (path.startsWith('/admin/mcp-servers')) return p.hasPermission(PERMISSIONS.mcpServers.view);
    if (path.startsWith('/admin/access-control')) return p.hasPermission(PERMISSIONS.roles.view);
    if (path.startsWith('/admin/skills')) return p.hasPermission(PERMISSIONS.roles.view);
    if (path.startsWith('/admin/prompt-library')) return p.hasPermission(PERMISSIONS.roles.view);
    if (path.startsWith('/admin/settings')) return p.canViewSsoProviders();
    return true; // '/admin' root + unknown paths: handled by landing redirect below
  }

  // Selection-based routing (spec §1 "View as"): when the viewing role changes,
  // if the current admin page is no longer permitted, route to a page the role
  // CAN see — its admin landing, or chat if it has no Control Hub access — so we
  // never leave the visitor staring at a 403. Reads permissions, so it re-runs
  // after the viewing role updates the store.
  $effect(() => {
    if (!demoView.enabled) return;
    void demoView.roleId; // subscribe to role selection
    if (!permissionsStore.hasFetched) return;
    const path = currentPath;
    if (!path.startsWith('/admin')) return;
    if (isAdminPathAllowed(path)) return;
    const landing = permissionsStore.getAdminLandingPath();
    navigate(landing === '/forbidden' ? '/' : landing, { replace: true });
  });

  onDestroy(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', handleResize);
    }
  });

  // Redirect to first available admin page
  $effect(() => {
    if (
      authState.isAuthenticated &&
      currentPath === '/admin' &&
      permissionsStore.hasFetched &&
      !permissionsStore.isLoading
    ) {
      const nextPath = permissionsStore.getAdminLandingPath();
      if (nextPath !== currentPath) {
        navigate(nextPath, { replace: true });
      }
    }
  });

  function handleSidebarToggle(collapsed: boolean) {
    sidebarCollapsed = collapsed;
  }

  function toggleSidebarFromMain(event: Event) {
    event.stopPropagation();
    sidebarCollapsed = !sidebarCollapsed;
  }

  function handleMainContentClick(event: Event) {
    const target = event.target as HTMLElement;
    const isInteractiveElement =
      target.tagName === 'BUTTON' ||
      target.tagName === 'INPUT' ||
      target.tagName === 'SELECT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'A' ||
      target.closest('button') ||
      target.closest('a');

    if (isMobile() && !sidebarCollapsed && !isInteractiveElement) {
      sidebarCollapsed = true;
    }
  }
</script>

<Toaster />
<Router>
  {#if isAuthCallback()}
    <!-- Always show callback route, regardless of auth state -->
    <div class="callback-wrapper">
      <Route path="/auth/:provider/callback"><AuthCallback /></Route>
    </div>
  {:else if isAdminLogin() && !authState.isAuthenticated}
    <!-- Admin login route -->
    <Login modes={['admin']} onLoginSuccess={handleLoginSuccess} />
  {:else if authState.isLoading}
    <div class="loading-screen">
      <div class="loading-spinner"></div>
    </div>
  {:else if !authState.isAuthenticated}
    {#if isDemoEntry()}
      <DemoGate onLoginSuccess={handleLoginSuccess} />
    {:else}
      <Login onLoginSuccess={handleLoginSuccess} />
    {/if}
  {:else}
    {#if demoView.enabled}
      <GlobalTopBar onExit={handleDemoExit} />
      <DemoWelcome />
    {/if}
    <Sidebar
      isCollapsed={sidebarCollapsed}
      onsidebarToggle={handleSidebarToggle}
      user={authState.user}
      onlogout={handleLogout}
    />

    {#if !sidebarCollapsed}
      <div
        class="mobile-overlay"
        role="button"
        tabindex="-1"
        aria-label={$_('app.closeSidebar')}
        onclick={handleMainContentClick}
        onkeydown={(e) => e.key === 'Escape' && handleMainContentClick(e)}
      ></div>
    {/if}

    <main class="main-content" class:collapsed={sidebarCollapsed} class:demo-offset={demoView.enabled}>
      <MobileHeader sidebarCollapsed={sidebarCollapsed} onToggleMenu={toggleSidebarFromMain} />

      <div class="main-content-body">
<MainAreaRoutes />
      </div>
    </main>
  {/if}
</Router>

<style>
  /* Demo mode: push the fixed layout below the persistent GlobalTopBar (46px). */
  :global(body.demo-active) {
    --demo-bar-h: 46px;
  }
  :global(body.demo-active .sidebar) {
    top: var(--demo-bar-h);
    height: calc(100vh - var(--demo-bar-h));
    height: calc(100dvh - var(--demo-bar-h));
  }
  .main-content.demo-offset {
    padding-top: var(--demo-bar-h, 0);
  }
  @media (max-width: 768px) {
    .main-content.demo-offset {
      height: calc(100dvh - var(--demo-bar-h, 0px));
    }
  }

  .callback-wrapper {
    background: var(--bg-primary);
    min-height: 100vh;
  }

  .loading-screen {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-primary);
  }

  .loading-spinner {
    width: 2.5rem;
    height: 2.5rem;
    border: 3px solid rgba(var(--brand-rgb), 0.2);
    border-top-color: var(--brand);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .main-content {
    margin-inline-start: 280px;
    min-height: 100vh;
    background: var(--bg-primary);
    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    width: calc(100vw - 280px);
    max-width: calc(100vw - 280px);
    overflow-x: hidden;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
  }

  .main-content.collapsed {
    margin-inline-start: 80px;
    width: calc(100vw - 80px);
    max-width: calc(100vw - 80px);
  }

  .main-content-body {
    flex: 1;
    overflow-y: auto;
  }

  .mobile-overlay {
    display: none;
    position: fixed;
    top: 0;
    inset-inline-start: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(6px);
    z-index: 500;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.3s ease;
  }

  @media (max-width: 768px) {
    .mobile-overlay {
      display: block;
      opacity: 1;
      pointer-events: all;
      z-index: 500;
    }

    .main-content {
      margin-inline-start: 0;
      width: 100vw;
      max-width: 100vw;
      height: 100dvh;
    }

    .main-content.collapsed {
      margin-inline-start: 0;
      width: 100vw;
      max-width: 100vw;
    }

    .main-content-body {
      overflow: hidden;
    }
  }

  @media (max-width: 480px) {
    .mobile-overlay {
      background: rgba(0, 0, 0, 0.4);
      backdrop-filter: blur(8px);
    }

    .main-content {
      margin-inline-start: 0;
      width: 100vw;
      max-width: 100vw;
    }

    .main-content.collapsed {
      margin-inline-start: 0;
      width: 100vw;
      max-width: 100vw;
    }
  }
</style>
