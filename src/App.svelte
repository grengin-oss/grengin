<script lang="ts">
  import { onMount, onDestroy, untrack } from 'svelte';
  import { Router, Route, navigate } from 'svelte-routing';
  import { Sidebar, MobileHeader } from './lib/components/layout/index.js';
  import Toaster from './lib/components/Toaster.svelte';
  import Login from './lib/features/auth/components/Login.svelte';
  import Chat from './lib/features/chat/components/Chat.svelte';
  import AuthCallback from './lib/features/auth/components/AuthCallback.svelte';
  import { initAuth, getAuthState, logout, permissionsStore } from './lib/features/auth/index.js';
  import { PERMISSIONS } from './lib/features/auth/permissions.js';
  import {
    dismissStreamToast,
    fetchNotificationFeed,
    getNotificationsState,
    startNotificationsStream,
    stopNotificationsStream,
  } from './lib/features/notifications/index.js';
  import { NOTIFICATIONS_STREAM_TOAST_ID, toast } from '$lib/components/Toaster.svelte';
  import Users from './lib/admin/pages/Users.svelte';
  import AIEngines from './lib/admin/pages/AIEngines.svelte';
  import Analytics from './lib/admin/pages/Analytics.svelte';
  import Forbidden from './lib/components/Forbidden.svelte';
  import PermissionGuard from './lib/components/PermissionGuard.svelte';
  import Departments from './lib/admin/pages/Departments.svelte';
  import Settings from '$lib/admin/pages/Settings.svelte';
  import Overview from '$lib/admin/pages/Overview.svelte';
  import AlertsPage from '$lib/features/notifications/AlertsPage.svelte';
  import AccessControl from '$lib/admin/pages/AccessControl.svelte';
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

  function isMobile() {
    return window.innerWidth <= 768;
  }

  function handleResize() {
    if (isMobile()) {
      sidebarCollapsed = true;
    }
  }

  onMount(() => {
    initAuth();
    permissionsStore.init();
    sidebarCollapsed = isMobile();
    window.addEventListener('resize', handleResize);

    // Update currentPath on navigation
    const handlePopState = () => {
      currentPath = window.location.pathname;
    };
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  });

  async function handleLogout() {
    await logout();
  }

  function handleLoginSuccess() {
    // Auth state is already updated by setAuth
  }

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
    <Login onLoginSuccess={handleLoginSuccess} />
  {:else}
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

    <main class="main-content" class:collapsed={sidebarCollapsed}>
      <MobileHeader sidebarCollapsed={sidebarCollapsed} onToggleMenu={toggleSidebarFromMain} />

      <div class="main-content-body">
        <Route path="/"><Chat /></Route>
        <Route path="/chat"><Chat /></Route>
        <Route path="/chat/:id"><Chat /></Route>
        <Route path="/alerts"><AlertsPage /></Route>
        <Route path="/admin/alerts"><AlertsPage /></Route>
        <Route path="/admin/overview">
          <PermissionGuard permission={PERMISSIONS.analytics.view} requireGlobal={true}>
            {#snippet children()}
              <Overview />
            {/snippet}
          </PermissionGuard>
        </Route>
        <Route path="/admin/users">
          <PermissionGuard permission={PERMISSIONS.users.view}>
            {#snippet children()}
              <Users />
            {/snippet}
          </PermissionGuard>
        </Route>
        <Route path="/admin/departments">
          <PermissionGuard permission={PERMISSIONS.departments.view}>
            {#snippet children()}
              <Departments />
            {/snippet}
          </PermissionGuard>
        </Route>
        <Route path="/admin/access-control">
          <PermissionGuard permission={PERMISSIONS.roles.view}>
            {#snippet children()}
              <AccessControl />
            {/snippet}
          </PermissionGuard>
        </Route>
        <Route path="/admin/settings">
          <PermissionGuard permission={PERMISSIONS.ssoProviders.view}>
            {#snippet children()}
              <Settings />
            {/snippet}
          </PermissionGuard>
        </Route>
        <Route path="/admin/ai-engines">
          <PermissionGuard permission={PERMISSIONS.aiPlatform.view}>
            {#snippet children()}
              <AIEngines />
            {/snippet}
          </PermissionGuard>
        </Route>
        <Route path="/admin/analytics" primary={false}>
          <PermissionGuard permission={PERMISSIONS.analytics.view}>
            {#snippet children()}
              <Analytics />
            {/snippet}
          </PermissionGuard>
        </Route>
        <Route path="/forbidden"><Forbidden /></Route>
      </div>
    </main>
  {/if}
</Router>

<style>
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
    margin-left: 280px;
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
    margin-left: 80px;
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
    left: 0;
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
      margin-left: 0;
      width: 100vw;
      max-width: 100vw;
      height: 100dvh;
    }

    .main-content.collapsed {
      margin-left: 0;
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
      margin-left: 0;
      width: 100vw;
      max-width: 100vw;
    }

    .main-content.collapsed {
      margin-left: 0;
      width: 100vw;
      max-width: 100vw;
    }
  }
</style>
