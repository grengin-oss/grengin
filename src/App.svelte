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
  import { onNativeOAuthCallbackPath } from './lib/features/auth/nativeDeepLink.js';
  import {
    dismissStreamToast,
    fetchNotificationFeed,
    getNotificationsState,
    startNotificationsStream,
    stopNotificationsStream,
  } from './lib/features/notifications/index.js';
  import { NOTIFICATIONS_STREAM_TOAST_ID, toast } from '$lib/components/Toaster.svelte';
  import { _ } from 'svelte-i18n';

  let sidebarCollapsed = $state(false);
  let currentPath = $state(window.location.pathname);
  let showSplash = $state(true);
  let splashTimer: ReturnType<typeof setTimeout> | null = null;
  let nativeDeepLinkCleanup: (() => void) | null = null;
  let swipeStartX = 0;
  let swipeStartY = 0;
  let isSwipeTracking = false;
  let closeSwipeStartX = 0;
  let closeSwipeStartY = 0;
  let isCloseSwipeTracking = false;
  let lastLayoutIsMobile = false;
  let didWarmUserStartup = false;
  let shouldShowSplash = $derived(showSplash && !isAuthCallback());

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
    // Match /auth/{provider}/callback and /auth/{provider}/mobile/callback patterns
    return /^\/auth\/[^/]+\/(?:mobile\/)?callback$/.test(currentPath);
  }

  function isAdminLogin(): boolean {
    return currentPath === '/admin';
  }

  function isMobile() {
    const coarsePointer =
      window.matchMedia('(hover: none), (pointer: coarse)').matches ||
      navigator.maxTouchPoints > 0;
    const shortSide = Math.min(window.innerWidth, window.innerHeight);

    return window.innerWidth <= 768 || (coarsePointer && shortSide <= 600);
  }

  function isInteractiveTarget(target: HTMLElement | null): boolean {
    if (target == null) return false;

    return (
      target.tagName === 'BUTTON' ||
      target.tagName === 'INPUT' ||
      target.tagName === 'SELECT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'A' ||
      target.isContentEditable ||
      target.closest('button') != null ||
      target.closest('a') != null ||
      target.closest('input') != null ||
      target.closest('select') != null ||
      target.closest('textarea') != null ||
      target.closest('[role="button"]') != null
    );
  }

  function syncCurrentPath(): void {
    currentPath = window.location.pathname;
  }

  function updateViewportCssVars(): void {
    const visualViewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const visualViewportTopOffset = window.visualViewport?.offsetTop ?? 0;
    const keyboardInset = Math.max(
      0,
      Math.round(window.innerHeight - visualViewportHeight - visualViewportTopOffset)
    );

    document.documentElement.style.setProperty(
      '--app-viewport-height',
      `${Math.round(visualViewportHeight)}px`
    );
    document.documentElement.style.setProperty('--app-keyboard-inset', `${keyboardInset}px`);
  }

  function updateAppLayoutAttribute(isMobileLayout = isMobile()): void {
    document.documentElement.dataset.appLayout = isMobileLayout ? 'mobile' : 'desktop';
  }

  function handleVisibilityChange(): void {
    if (document.visibilityState !== 'visible') return;
    syncCurrentPath();
    updateViewportCssVars();
    updateAppLayoutAttribute();
  }

  function handleResize() {
    const nextIsMobile = isMobile();
    updateAppLayoutAttribute(nextIsMobile);

    if (nextIsMobile !== lastLayoutIsMobile) {
      sidebarCollapsed = nextIsMobile;
      lastLayoutIsMobile = nextIsMobile;
    }

    updateViewportCssVars();
  }

  function handleOrientationChange(): void {
    updateViewportCssVars();
    window.setTimeout(handleResize, 120);
  }

  function handleNativeOAuthCallbackPath(path: string): void {
    currentPath = path.split(/[?#]/, 1)[0] || '/';
    showSplash = false;
  }

  function warmUserStartup(): void {
    if (didWarmUserStartup || authState.isLoading || !authState.isAuthenticated) {
      return;
    }

    if (isAuthCallback() || isAdminView()) {
      return;
    }

    didWarmUserStartup = true;

    void import('$lib/bundles/user-chunk').catch((error) => {
      console.debug('Failed to warm user bundle:', error);
    });

    void import('$lib/api/chatApi').then(({ listConversations }) => {
      void listConversations({ offset: 0, limit: 20 }).catch((error) => {
        console.debug('Failed to warm chat history:', error);
      });
    });
  }

  function handleSwipeStart(event: TouchEvent): void {
    if (!isMobile() || !sidebarCollapsed || event.touches.length !== 1) {
      return;
    }

    const touch = event.touches[0];
    const target = event.target as HTMLElement | null;

    if (touch.clientX > 28 || isInteractiveTarget(target)) {
      return;
    }

    swipeStartX = touch.clientX;
    swipeStartY = touch.clientY;
    isSwipeTracking = true;
  }

  function handleSwipeMove(event: TouchEvent): void {
    if (!isSwipeTracking || event.touches.length !== 1) {
      return;
    }

    const touch = event.touches[0];
    const deltaX = touch.clientX - swipeStartX;
    const deltaY = Math.abs(touch.clientY - swipeStartY);

    if (deltaY > 42) {
      isSwipeTracking = false;
      return;
    }

    if (deltaX >= 70) {
      sidebarCollapsed = false;
      isSwipeTracking = false;
    }
  }

  function handleSwipeEnd(): void {
    isSwipeTracking = false;
  }

  function handleCloseSwipeStart(event: TouchEvent): void {
    if (!isMobile() || sidebarCollapsed || event.touches.length !== 1) {
      return;
    }

    const touch = event.touches[0];
    closeSwipeStartX = touch.clientX;
    closeSwipeStartY = touch.clientY;
    isCloseSwipeTracking = true;
  }

  function handleCloseSwipeMove(event: TouchEvent): void {
    if (!isCloseSwipeTracking || event.touches.length !== 1) {
      return;
    }

    const touch = event.touches[0];
    const deltaX = touch.clientX - closeSwipeStartX;
    const deltaY = Math.abs(touch.clientY - closeSwipeStartY);

    if (deltaY > 42) {
      isCloseSwipeTracking = false;
      return;
    }

    if (deltaX <= -70) {
      sidebarCollapsed = true;
      isCloseSwipeTracking = false;
    }
  }

  function handleCloseSwipeEnd(): void {
    isCloseSwipeTracking = false;
  }

  // Keep currentPath in sync with client navigation (Link / navigate), not only back/forward.
  $effect(() => {
    window.addEventListener('popstate', syncCurrentPath);

    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function (...args: Parameters<History['pushState']>) {
      originalPushState.apply(this, args);
      syncCurrentPath();
    };

    history.replaceState = function (...args: Parameters<History['replaceState']>) {
      originalReplaceState.apply(this, args);
      syncCurrentPath();
    };

    return () => {
      window.removeEventListener('popstate', syncCurrentPath);
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
    };
  });

  // Preload i18n namespaces when the route changes
  $effect(() => {
    // Subscribe to currentPath so this fires on every navigation
    const path = currentPath;
    loadNamespacesForRoute(path);
    warmUserStartup();
  });

  onMount(() => {
    initAuth();
    permissionsStore.init();
    lastLayoutIsMobile = isMobile();
    updateAppLayoutAttribute(lastLayoutIsMobile);
    sidebarCollapsed = lastLayoutIsMobile;
    updateViewportCssVars();
    splashTimer = setTimeout(() => {
      showSplash = false;
    }, 1100);
    // Replays a callback that resolved before this component mounted, so a deep
    // link that arrived during startup is not lost to mount ordering.
    nativeDeepLinkCleanup = onNativeOAuthCallbackPath(handleNativeOAuthCallbackPath);

    const visualViewport = window.visualViewport;
    visualViewport?.addEventListener('resize', updateViewportCssVars);
    visualViewport?.addEventListener('scroll', updateViewportCssVars);

    window.addEventListener('orientationchange', handleOrientationChange);
    window.addEventListener('focus', syncCurrentPath);
    window.addEventListener('resize', handleResize);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      visualViewport?.removeEventListener('resize', updateViewportCssVars);
      visualViewport?.removeEventListener('scroll', updateViewportCssVars);

      window.removeEventListener('orientationchange', handleOrientationChange);
      window.removeEventListener('focus', syncCurrentPath);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  });

  async function handleLogout() {
    await logout();
  }

  function handleLoginSuccess() {
    // Auth state is already updated by setAuth
  }

  onDestroy(() => {
    if (splashTimer != null) {
      clearTimeout(splashTimer);
    }

    nativeDeepLinkCleanup?.();
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

  function closeSidebarFromOutside(event: Event) {
    event.stopPropagation();
    if (isMobile() && !sidebarCollapsed) {
      sidebarCollapsed = true;
    }
  }

  function handleMainContentClick(event: Event) {
    const target = event.target as HTMLElement;
    if (isMobile() && !sidebarCollapsed && !isInteractiveTarget(target)) {
      sidebarCollapsed = true;
    }
  }
</script>

<Toaster />
{#if shouldShowSplash}
  <div class="splash-screen" role="status" aria-label="Grengin loading">
    <img class="splash-logo" src="/grengin-icon.svg" alt="" />
    <div class="splash-title">Grengin</div>
    <div class="splash-progress" aria-hidden="true"></div>
  </div>
{:else}
  <Router>
  {#if isAuthCallback()}
    <!-- Always show callback route, regardless of auth state -->
    <div class="callback-wrapper">
      <Route path="/auth/:provider/callback"><AuthCallback /></Route>
      <Route path="/auth/:provider/mobile/callback"><AuthCallback /></Route>
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
        onclick={closeSidebarFromOutside}
        onpointerdown={closeSidebarFromOutside}
        onkeydown={(e) => e.key === 'Escape' && closeSidebarFromOutside(e)}
        ontouchstart={handleCloseSwipeStart}
        ontouchmove={handleCloseSwipeMove}
        ontouchend={handleCloseSwipeEnd}
        ontouchcancel={handleCloseSwipeEnd}
      ></div>
    {/if}

    <main
      class="main-content"
      class:collapsed={sidebarCollapsed}
      ontouchstart={handleSwipeStart}
      ontouchmove={handleSwipeMove}
      ontouchend={handleSwipeEnd}
      ontouchcancel={handleSwipeEnd}
    >
      <MobileHeader sidebarCollapsed={sidebarCollapsed} onToggleMenu={toggleSidebarFromMain} />

      <div class="main-content-body">
        <MainAreaRoutes />
      </div>
    </main>
  {/if}
  </Router>
{/if}

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

  .splash-screen {
    position: fixed;
    inset: 0;
    z-index: 10000;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-lg);
    background:
      radial-gradient(circle at center, rgba(var(--brand-green-accent-rgb), 0.14), transparent 34rem),
      var(--bg-primary);
    color: var(--text-primary);
    padding:
      var(--app-safe-area-top)
      var(--app-safe-area-right)
      var(--app-safe-area-bottom)
      var(--app-safe-area-left);
    pointer-events: none;
  }

  .splash-logo {
    width: clamp(5rem, 18vw, 8rem);
    height: clamp(5rem, 18vw, 8rem);
    display: block;
    object-fit: contain;
    filter: drop-shadow(0 1.25rem 2.5rem rgba(0, 0, 0, 0.24));
  }

  .splash-title {
    color: var(--text-primary);
    font-size: 1.35rem;
    font-weight: 800;
  }

  .splash-progress {
    width: 9rem;
    height: 0.25rem;
    overflow: hidden;
    border-radius: var(--radius-full);
    background: color-mix(in oklab, var(--surface-border) 75%, transparent);
  }

  .splash-progress::before {
    content: '';
    display: block;
    width: 45%;
    height: 100%;
    border-radius: inherit;
    background: var(--brand-green-accent);
    animation: splash-progress 0.9s ease-in-out infinite;
  }

  @keyframes splash-progress {
    0% {
      transform: translateX(-110%);
    }
    100% {
      transform: translateX(230%);
    }
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
    min-height: 0;
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
    z-index: 900;
    opacity: 0;
    pointer-events: none;
    transition:
      opacity 0.34s cubic-bezier(0.22, 1, 0.36, 1),
      backdrop-filter 0.34s cubic-bezier(0.22, 1, 0.36, 1);
  }

  @media (max-width: 768px) {
    .mobile-overlay {
      display: block;
      opacity: 1;
      pointer-events: all;
      z-index: 900;
    }

    .main-content {
      margin-inline-start: 0;
      width: 100vw;
      max-width: 100vw;
      height: calc(
        var(--app-viewport-height, 100dvh) - var(--app-safe-area-top) - var(--app-safe-area-bottom)
      );
      min-height: calc(
        var(--app-viewport-height, 100dvh) - var(--app-safe-area-top) - var(--app-safe-area-bottom)
      );
      padding-top: var(--app-safe-area-top);
      padding-right: var(--app-safe-area-right);
      padding-bottom: var(--app-safe-area-bottom);
      padding-left: var(--app-safe-area-left);
      overflow: hidden;
    }

    .main-content.collapsed {
      margin-inline-start: 0;
      width: 100vw;
      max-width: 100vw;
    }

    .main-content-body {
      overflow: hidden;
      min-height: 0;
    }
  }

  :global(html[data-app-layout='mobile']) .mobile-overlay {
    display: block;
    opacity: 1;
    pointer-events: all;
    z-index: 900;
  }

  :global(html[data-app-layout='mobile']) .main-content {
    margin-inline-start: 0;
    width: 100vw;
    max-width: 100vw;
    height: calc(
      var(--app-viewport-height, 100dvh) - var(--app-safe-area-top) - var(--app-safe-area-bottom)
    );
    min-height: calc(
      var(--app-viewport-height, 100dvh) - var(--app-safe-area-top) - var(--app-safe-area-bottom)
    );
    padding-top: var(--app-safe-area-top);
    padding-right: var(--app-safe-area-right);
    padding-bottom: var(--app-safe-area-bottom);
    padding-left: var(--app-safe-area-left);
    overflow: hidden;
  }

  :global(html[data-app-layout='mobile']) .main-content.collapsed {
    margin-inline-start: 0;
    width: 100vw;
    max-width: 100vw;
  }

  :global(html[data-app-layout='mobile']) .main-content-body {
    overflow: hidden;
    min-height: 0;
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
