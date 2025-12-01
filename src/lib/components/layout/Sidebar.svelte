<script lang="ts">
  import type { components } from '../../types/api.js';

  type User = components['schemas']['User'];

  interface Props {
    isCollapsed?: boolean;
    onsidebarToggle?: (collapsed: boolean) => void;
    onnavigate?: (itemId: string) => void;
    user?: User | null;
    onlogout?: () => void;
  }

  let { isCollapsed = $bindable(false), onsidebarToggle, onnavigate, user = null, onlogout }: Props = $props();

  let showUserMenu = $state(false);
  let userMenuElement: HTMLElement;
  let userCollapsed = $state(false);

  const menuItems = [
    { id: 'chat', label: 'Chat', icon: '💬' },
  ];

  let activeItem = $state('chat');

  function handleItemClick(itemId: string) {
    activeItem = itemId;
    onnavigate?.(itemId);

    // Auto-collapse on mobile after navigation
    if (window.innerWidth <= 768) {
      isCollapsed = true;
      onsidebarToggle?.(isCollapsed);
    }
  }

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
  }

  function getUserInitials(): string {
    if (!user?.name) return 'U';
    const parts = user.name.split(' ').filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0]?.substring(0, 2).toUpperCase() || 'U';
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
</script>

<svelte:window onclick={handleClickOutside} onresize={handleResize} />

<aside class="sidebar" class:collapsed={isCollapsed}>
  <div class="sidebar-header">
    <div class="sidebar-brand">
      {#if !isCollapsed}
        <button
          class="burger-btn"
          onclick={toggleSidebar}
          aria-label="Toggle sidebar"
          title="Toggle sidebar"
        >
          <svg class="burger-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>
        <img src="/src/assets/grengin-logo.svg" alt="Grengin" class="brand-logo" />
      {:else}
        <button
          class="logo-btn"
          onclick={toggleSidebar}
          aria-label="Toggle sidebar"
          title="Toggle sidebar"
        >
          <img src="/grengin-icon.svg" alt="Grengin" class="logo-icon" />
        </button>
      {/if}
    </div>
  </div>

  <nav class="sidebar-nav">
    {#each menuItems as item}
      <button
        class="sidebar-item {activeItem === item.id ? 'active' : ''}"
        onclick={() => handleItemClick(item.id)}
        title={item.label}
      >
        <span class="sidebar-icon">{item.icon}</span>
        <span class="sidebar-label">{item.label}</span>
      </button>
    {/each}
  </nav>

  <div class="sidebar-footer">
    <div class="user-menu-container" bind:this={userMenuElement}>
      <button
        class="user-menu-trigger sidebar-item"
        onclick={toggleUserMenu}
        title="User menu"
      >
        <div class="user-avatar">
          <div class="user-initials">
            {getUserInitials()}
          </div>
        </div>
        {#if !isCollapsed}
          <div class="user-info">
            <span class="user-name">{user?.name || 'User'}</span>
          </div>
          <svg class="dropdown-arrow" class:rotated={showUserMenu} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6,15 12,9 18,15"/>
          </svg>
        {/if}
      </button>
    </div>
  </div>
</aside>

{#if showUserMenu}
  <div class="user-menu-dropdown">
    <button class="user-menu-item">
      <span class="menu-item-icon">⚙️</span>
      <span class="menu-item-label">Settings</span>
    </button>
    <button class="user-menu-item logout-item" onclick={handleLogout}>
      <svg class="menu-item-icon logout-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
        <polyline points="16,17 21,12 16,7"/>
        <line x1="21" y1="12" x2="9" y2="12"/>
      </svg>
      <span class="menu-item-label">Sign out</span>
    </button>
  </div>
{/if}

<style>
  .sidebar {
    position: fixed;
    left: 0;
    top: 0;
    width: 280px;
    height: 100vh;
    display: flex;
    flex-direction: column;
    z-index: 1000;
    overflow-y: auto;
    transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1), transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    background: var(--bg-primary);
    border-right: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 2px 0 24px rgba(0, 0, 0, 0.12);
  }

  .sidebar.collapsed {
    width: 80px;
  }

  .sidebar-header {
    padding: var(--space-3xl) var(--space-xl);
  }

  .collapsed .sidebar-header {
    padding: var(--space-2xl) 0;
  }

  .sidebar-brand {
    display: flex;
    align-items: center;
    gap: var(--space-lg);
  }

  .collapsed .sidebar-brand {
    flex-direction: column;
    gap: var(--space-sm);
    align-items: center;
    justify-content: center;
  }

  /* Burger button - shown when sidebar is expanded */
  .burger-btn {
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
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.08),
      0 2px 8px rgba(0, 0, 0, 0.08);
    flex-shrink: 0;
  }

  .burger-btn:hover {
    background: rgba(var(--glass-tint), 0.12);
    border-color: var(--link-color);
    color: var(--link-color);
    transform: translateY(-1px);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.15),
      0 4px 16px rgba(0, 0, 0, 0.12);
  }

  .burger-btn:active {
    transform: translateY(0);
  }

  .burger-icon {
    width: 1.5rem;
    height: 1.5rem;
  }

  /* Brand logo - shown when sidebar is expanded */
  .brand-logo {
    height: 1.8rem;
    width: auto;
    max-width: 100%;
    object-fit: contain;
  }

  /* Logo button - shown when sidebar is collapsed */
  .logo-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: calc(100% - 1.5rem);
    margin: 0 0.75rem;
    height: 3rem;
    padding: 0.75rem;
    border: none;
    background: rgba(var(--glass-tint), 0.06);
    backdrop-filter: blur(0.75rem);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.08),
      0 2px 8px rgba(0, 0, 0, 0.08);
  }

  .logo-btn:hover {
    background: rgba(var(--glass-tint), 0.12);
    border-color: var(--link-color);
    transform: translateY(-2px) scale(1.02);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.15),
      0 6px 20px rgba(0, 0, 0, 0.15);
  }

  .logo-btn:active {
    transform: translateY(0) scale(0.98);
  }

  .logo-icon {
    width: 100%;
    height: 100%;
    object-fit: contain;
    transition: all 0.3s ease;
  }

  .logo-btn:hover .logo-icon {
    filter: brightness(1.2) drop-shadow(0 0 8px rgba(var(--brand-rgb), 0.4));
  }

  .sidebar-nav {
    flex: 1;
    padding: var(--space-lg) 0;
  }

  .sidebar-item {
    width: calc(100% - var(--space-2xl));
    margin: 0 var(--space-md);
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-sm) var(--space-lg);
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-size: 0.9375rem;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    text-align: left;
    border-radius: var(--radius-md);
    margin-bottom: var(--space-sm);
  }

  .sidebar-item:hover {
    background: rgba(var(--glass-tint), 0.06);
    backdrop-filter: blur(0.75rem);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: var(--link-color);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.08),
      0 2px 8px rgba(0, 0, 0, 0.06);
  }

  .sidebar-item.active {
    background: rgba(var(--glass-tint), 0.12);
    backdrop-filter: blur(1rem);
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: var(--link-color);
    font-weight: 700;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.15),
      0 4px 16px rgba(0, 0, 0, 0.1);
  }

  .sidebar-item.active:hover {
    background: rgba(var(--glass-tint), 0.15);
    border-color: var(--link-hover);
    color: var(--link-hover);
  }

  .sidebar-icon {
    font-size: 1.125rem;
    height: 1.75rem;
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .sidebar-label {
    font-weight: 600;
    white-space: nowrap;
    transition: opacity 0.3s ease;
  }

  .collapsed .sidebar-label {
    opacity: 0;
    pointer-events: none;
    position: absolute;
    width: 0;
  }

  .collapsed .sidebar-item {
    justify-content: center;
    padding: var(--space-sm);
    width: calc(100% - 1.5rem);
    margin: 0 0.75rem;
  }

  .sidebar-footer {
    padding: var(--space-sm) 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .user-menu-container {
    position: relative;
  }

  .user-menu-trigger {
    padding: var(--space-sm) var(--space-lg);
    margin: 0 var(--space-md);
    width: calc(100% - var(--space-2xl));
    background: transparent;
    border-radius: var(--radius-md);
    justify-content: flex-start;
    gap: var(--space-md);
  }

  .collapsed .user-menu-trigger {
    justify-content: center;
    padding: var(--space-sm);
  }

  .user-avatar {
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 50%;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(var(--glass-tint), 0.1);
    flex-shrink: 0;
  }

  .user-initials {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--text-secondary);
    text-transform: uppercase;
  }

  .user-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.125rem;
    min-width: 0;
  }

  .user-name {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .dropdown-arrow {
    width: 1.125rem;
    height: 1.125rem;
    color: var(--text-secondary);
    transition: transform 0.3s ease;
    flex-shrink: 0;
  }

  .dropdown-arrow.rotated {
    transform: rotate(180deg);
  }

  .user-menu-dropdown {
    position: fixed;
    bottom: 3.5rem;
    left: var(--space-md);
    min-width: 180px;
    background: rgba(var(--glass-tint), 0.06);
    backdrop-filter: blur(1.5rem);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-sm);
    box-shadow:
      0 8px 24px rgba(0, 0, 0, 0.12);
    overflow: hidden;
    animation: slideUpFade 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    z-index: 10001;
  }

  @keyframes slideUpFade {
    from {
      opacity: 0;
      transform: translateY(0.5rem);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .user-menu-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-sm) var(--space-lg);
    background: transparent;
    border: none;
    color: var(--text-secondary);
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.25s ease;
    text-align: left;
  }

  .user-menu-item:hover {
    background: rgba(var(--glass-tint), 0.08);
    color: var(--link-color);
  }

  .user-menu-item.logout-item:hover {
    background: rgba(255, 82, 82, 0.12);
    color: #ff5252;
  }

  .menu-item-icon {
    height: 1.25rem;
    width: 1.25rem;
    display: flex;
    align-items: center;
    flex-shrink: 0;
    font-size: 0.875rem;
  }

  .menu-item-label {
    font-weight: 500;
  }

  /* Mobile responsiveness */
  @media (max-width: 768px) {
    .sidebar {
      width: 300px;
      background: var(--bg-primary);
      box-shadow: 4px 0 32px rgba(0, 0, 0, 0.2);
      border-right: 1px solid rgba(255, 255, 255, 0.12);
    }

    .sidebar.collapsed {
      transform: translateX(-100%);
      width: 300px;
    }

    .user-menu-dropdown {
      left: var(--space-md);
    }
  }

  @media (max-width: 480px) {
    .sidebar {
      width: 85vw;
      max-width: 340px;
      background: var(--bg-primary);
      box-shadow: 4px 0 40px rgba(0, 0, 0, 0.25);
      border-right: 1px solid rgba(255, 255, 255, 0.15);
    }

    .sidebar.collapsed {
      transform: translateX(-100%);
      width: 85vw;
      max-width: 340px;
    }

    .user-menu-dropdown {
      left: var(--space-md);
    }
  }
</style>
