<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import Sidebar from './lib/Sidebar.svelte';
  import Chat from './lib/Chat.svelte';
  import Admin from './lib/admin/Admin.svelte';

  let sidebarCollapsed = $state(false);
  let currentPage = $state('chat');
  
  // TODO: Get this from actual user auth state
  let isAdmin = $state(true);
  let showingSidebar = $state(true); // Hide sidebar when in admin

  function isMobile() {
    return window.innerWidth <= 768;
  }

  function handleResize() {
    if (isMobile()) {
      sidebarCollapsed = true;
    }
  }

  onMount(() => {
    sidebarCollapsed = isMobile();
    window.addEventListener('resize', handleResize);
  });

  onDestroy(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', handleResize);
    }
  });

  function handleSidebarToggle(collapsed: boolean) {
    sidebarCollapsed = collapsed;
  }

  function handleNavigate(itemId: string) {
    currentPage = itemId;
    
    // Hide main sidebar when entering admin
    if (itemId === 'admin') {
      showingSidebar = false;
    } else {
      showingSidebar = true;
    }
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

{#if showingSidebar}
  <Sidebar 
    isCollapsed={sidebarCollapsed} 
    onsidebarToggle={handleSidebarToggle} 
    onnavigate={handleNavigate}
    isAdmin={isAdmin}
  />
{/if}

{#if !sidebarCollapsed && showingSidebar}
  <div
    class="mobile-overlay"
    role="button"
    tabindex="-1"
    aria-label="Close sidebar"
    onclick={handleMainContentClick}
    onkeydown={(e) => e.key === 'Escape' && handleMainContentClick(e)}
  ></div>
{/if}

<main class="main-content" class:collapsed={sidebarCollapsed} class:no-sidebar={!showingSidebar}>
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
    {#if currentPage === 'chat'}
      <Chat />
    {:else}
      <Admin />
    {/if}
  </div>
</main>

<style>
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

  .main-content.no-sidebar {
    margin-left: 0;
    width: 100vw;
    max-width: 100vw;
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
