<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Router, Route } from 'svelte-routing';
  import { Sidebar } from './lib/components/layout/index.js';
  import Login from './lib/features/auth/components/Login.svelte';
  import Chat from './lib/features/chat/components/Chat.svelte';
  import AuthCallback from './lib/features/auth/components/AuthCallback.svelte';
  import { initAuth, getAuthState, logout } from './lib/features/auth/index.js';

  let sidebarCollapsed = $state(false);
  let currentPath = $state(window.location.pathname);

  const authState = getAuthState();

  function isAuthCallback(): boolean {
    return currentPath.startsWith('/auth/callback');
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

<Router>
  {#if isAuthCallback()}
    <!-- Always show callback route, regardless of auth state -->
    <div class="callback-wrapper">
      <Route path="/auth/callback"><AuthCallback /></Route>
    </div>
  {:else if isAdminLogin() && !authState.isAuthenticated}
    <!-- Admin login route -->
    <Login mode="admin" onLoginSuccess={handleLoginSuccess} />
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
        aria-label="Close sidebar"
        onclick={handleMainContentClick}
        onkeydown={(e) => e.key === 'Escape' && handleMainContentClick(e)}
      ></div>
    {/if}

    <main class="main-content" class:collapsed={sidebarCollapsed}>
      <div class="mobile-header">
        <button
          class="mobile-logo-btn"
          onclick={toggleSidebarFromMain}
          aria-label={sidebarCollapsed ? 'Open sidebar' : 'Close sidebar'}
          title={sidebarCollapsed ? 'Open sidebar' : 'Close sidebar'}
        >
          <img src="/grengin-icon.svg" alt="Grengin" class="mobile-logo-icon" />
        </button>
        <div class="mobile-header-content">
          <h1 class="header-title">Grengin</h1>
        </div>
      </div>

      <div class="main-content-body">
        <Route path="/"><Chat /></Route>
        <Route path="/chat"><Chat /></Route>
        <Route path="/chat/:id"><Chat /></Route>
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

  .mobile-header {
    display: none;
    align-items: center;
    padding: var(--space-xl);
    background: var(--bg-primary);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
    z-index: 10;
  }

  .mobile-header-content {
    flex: 1;
    margin-left: var(--space-lg);
  }

  .header-title {
    font-size: 1.5rem;
    font-weight: 700;
    margin: 0;
    color: var(--text-primary);
    letter-spacing: -0.02em;
  }

  .mobile-logo-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 3rem;
    height: 3rem;
    padding: var(--space-sm);
    border: none;
    background: rgba(var(--glass-tint), 0.06);
    backdrop-filter: blur(0.75rem);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.08),
      0 2px 8px rgba(0, 0, 0, 0.06);
    flex-shrink: 0;
  }

  .mobile-logo-btn:hover {
    background: rgba(var(--glass-tint), 0.12);
    border-color: var(--link-color);
    transform: translateY(-2px) scale(1.02);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.15),
      0 6px 20px rgba(0, 0, 0, 0.12);
  }

  .mobile-logo-btn:active {
    transform: translateY(0) scale(0.98);
  }

  .mobile-logo-icon {
    width: 100%;
    height: 100%;
    object-fit: contain;
    transition: all 0.3s ease;
  }

  .mobile-logo-btn:hover .mobile-logo-icon {
    filter: brightness(1.2) drop-shadow(0 0 8px rgba(var(--brand-rgb), 0.4));
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
    .mobile-header {
      display: flex;
    }

    .mobile-overlay {
      display: block;
      opacity: 1;
      pointer-events: all;
      z-index: 500;
    }

    .main-content {
      margin-left: 300px;
      width: calc(100vw - 300px);
      max-width: calc(100vw - 300px);
    }

    .main-content.collapsed {
      margin-left: 0;
      width: 100vw;
      max-width: 100vw;
    }
  }

  @media (max-width: 480px) {
    .mobile-header {
      padding: var(--space-lg);
    }

    .mobile-logo-btn {
      width: 2.75rem;
      height: 2.75rem;
      padding: var(--space-sm);
    }

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
