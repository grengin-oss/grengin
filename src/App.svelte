<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { onMount, onDestroy, untrack } from "svelte";
  import { Router, Route, navigate } from "svelte-routing";
  import { Sidebar, MobileHeader } from "./lib/components/layout/index.js";
  import Toaster from "./lib/components/Toaster.svelte";
  import Login from "./lib/features/auth/components/Login.svelte";
  import AuthCallback from "./lib/features/auth/components/AuthCallback.svelte";
  import MainAreaRoutes from "$lib/bundles/MainAreaRoutes.svelte";
  import { loadNamespacesForRoute } from "$lib/i18n/index.js";
  import {
    initAuth,
    getAuthState,
    logout,
    permissionsStore,
  } from "./lib/features/auth/index.js";
  import {
    dismissStreamToast,
    fetchNotificationFeed,
    getNotificationsState,
    startNotificationsStream,
    stopNotificationsStream,
  } from "./lib/features/notifications/index.js";
  import {
    NOTIFICATIONS_STREAM_TOAST_ID,
    toast,
  } from "$lib/components/Toaster.svelte";
  import { _ } from "svelte-i18n";

  let sidebarCollapsed = $state(false);
  let currentPath = $state(window.location.pathname);

  const authState = getAuthState();
  const notifState = getNotificationsState();

  $effect(() => {
    const uid = authState.user?.id;
    if (uid == null || uid === "") return;
    void fetchNotificationFeed();
    startNotificationsStream();

    return () => {
      stopNotificationsStream();
    };
  });

  function isAdminView(): boolean {
    return currentPath.startsWith("/admin");
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
      toast.custom(n.title, "blank", {
        id: NOTIFICATIONS_STREAM_TOAST_ID,
        duration: 5000,
        description,
        streamAlert: true,
        onClick: () => {
          dismissStreamToast();
          navigate(isAdminView() ? "/admin/alerts" : "/alerts");
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
    return currentPath === "/admin";
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

    window.addEventListener("popstate", updatePath);

    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function (...args: Parameters<History["pushState"]>) {
      originalPushState.apply(this, args);
      updatePath();
    };

    history.replaceState = function (
      ...args: Parameters<History["replaceState"]>
    ) {
      originalReplaceState.apply(this, args);
      updatePath();
    };

    return () => {
      window.removeEventListener("popstate", updatePath);
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
    window.addEventListener("resize", handleResize);
  });

  async function handleLogout() {
    await logout();
  }

  function handleLoginSuccess() {
    // Auth state is already updated by setAuth
  }

  onDestroy(() => {
    if (typeof window !== "undefined") {
      window.removeEventListener("resize", handleResize);
    }
  });

  // Redirect to first available admin page
  $effect(() => {
    if (
      authState.isAuthenticated &&
      currentPath === "/admin" &&
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
      target.tagName === "BUTTON" ||
      target.tagName === "INPUT" ||
      target.tagName === "SELECT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "A" ||
      target.closest("button") ||
      target.closest("a");

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
    <Login modes={["admin"]} onLoginSuccess={handleLoginSuccess} />
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
        aria-label={$_("app.closeSidebar")}
        onclick={handleMainContentClick}
        onkeydown={(e) => e.key === "Escape" && handleMainContentClick(e)}
      ></div>
    {/if}

    <main class="main-content" class:collapsed={sidebarCollapsed}>
      <MobileHeader {sidebarCollapsed} onToggleMenu={toggleSidebarFromMain} />

      <!-- <TopBar user={authState.user} onlogout={handleLogout} /> -->

      <div class="main-content-body">
        <MainAreaRoutes />
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
    /* flush against the sidebar, matching the Figma screen frame */
    margin-inline-start: 272px;
    min-height: 100vh;
    background: var(--gx-page);
    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    width: calc(100vw - 272px);
    max-width: calc(100vw - 272px);
    overflow-x: hidden;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
  }

  .main-content.collapsed {
    margin-inline-start: 60px;
    width: calc(100vw - 60px);
    max-width: calc(100vw - 60px);
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
