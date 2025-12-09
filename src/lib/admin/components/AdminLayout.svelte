<script lang="ts">
  import { navigate, useLocation } from 'svelte-routing';

  interface Props {
    children?: any;
  }

  let { children }: Props = $props();
  
  const location = useLocation();

  const navItems: Array<{
    id: string;
    path: string;
    label: string;
    icon: string;
    subItems?: Array<{ id: string; path: string; label: string }>;
  }> = [
    // {
    //   id: 'dashboard',
    //   path: '/admin/dashboard',
    //   label: 'Dashboard',
    //   icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>',
    // },
    {
      id: 'users',
      path: '/admin/users',
      label: 'User Management',
      icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>',
    },
    // {
    //   id: 'usage',
    //   path: '/admin/usage',
    //   label: 'Usage & Analytics',
    //   icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="20" x2="12" y2="10"></line><line x1="18" y1="20" x2="18" y2="4"></line><line x1="6" y1="20" x2="6" y2="16"></line></svg>',
    // },
    {
      id: 'settings',
      path: '/admin/settings#sso-providers',
      label: 'Settings',
      icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M12 1v6m0 6v6m-6-6h6m6 0h-6M4.93 4.93l4.24 4.24m5.66 5.66l4.24 4.24M4.93 19.07l4.24-4.24m5.66-5.66l4.24-4.24"></path></svg>',
    },
    {
      id: 'audit-log',
      path: '/admin/audit-log',
      label: 'Audit Log',
      icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14,2 14,8 20,8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10,9 9,9 8,9"></polyline></svg>',
    },
  ];

  let expandedItems = $state<Set<string>>(new Set(['settings']));

  // Derive active page from current location
  const activePage = $derived($location.pathname);

  function handleNavigate(path: string) {
    navigate(path);
  }

  function toggleExpand(itemId: string) {
    if (expandedItems.has(itemId)) {
      expandedItems.delete(itemId);
    } else {
      expandedItems.add(itemId);
    }
    expandedItems = new Set(expandedItems);
  }
</script>

<div class="admin-layout">
  <aside class="admin-sidebar">
    <div class="admin-sidebar-header">
      <div class="header-top">
        <button 
          class="back-btn"
          onclick={() => window.location.href = '/'}
          title="Back to Chat"
          aria-label="Back to Chat"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12,19 5,12 12,5"></polyline>
          </svg>
        </button>
        <h1 class="admin-title">Admin Panel</h1>
      </div>
    </div>
    
    <nav class="admin-nav" aria-label="Admin navigation">
      {#each navItems as item}
        <div class="nav-item-wrapper">
          {#if item.subItems}
            <button
              class="nav-item"
              onclick={() => toggleExpand(item.id)}
            >
              <span class="nav-icon">{@html item.icon}</span>
              <span class="nav-label">{item.label}</span>
              <svg 
                class="nav-chevron {expandedItems.has(item.id) ? 'expanded' : ''}"
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                stroke-width="2"
              >
                <polyline points="9,18 15,12 9,6"/>
              </svg>
            </button>

            {#if expandedItems.has(item.id)}
              <div class="nav-subitems">
                {#each item.subItems as subItem}
                  <button
                    class="nav-subitem"
                    class:active={activePage === subItem.path}
                    onclick={() => handleNavigate(subItem.path)}
                  >
                    {subItem.label}
                  </button>
                {/each}
              </div>
            {/if}
          {:else}
            <button
              class="nav-item"
              class:active={activePage === item.path}
              onclick={() => handleNavigate(item.path)}
            >
              <span class="nav-icon">{@html item.icon}</span>
              <span class="nav-label">{item.label}</span>
            </button>
          {/if}
        </div>
      {/each}
    </nav>
  </aside>

  <main class="admin-main">
    {@render children?.()}
  </main>
</div>

<style>
  .admin-layout {
    display: flex;
    background: var(--bg-primary);
    width: 100%;
    height: 100vh;
  }

  .admin-sidebar {
    width: 280px;
    background: var(--bg-primary);
    border-right: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 2px 0 24px rgba(0, 0, 0, 0.12);
    display: flex;
    flex-direction: column;
    top: 0;
    bottom: 0;
    z-index: 900;
    transition: left 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    overflow-y: auto;
  }

  .admin-sidebar-header {
    padding: var(--space-3xl) var(--space-xl);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
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
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.08),
      0 2px 8px rgba(0, 0, 0, 0.08);
    flex-shrink: 0;
  }

  .back-btn:hover {
    background: rgba(var(--glass-tint), 0.12);
    border-color: var(--link-color);
    color: var(--link-color);
    transform: translateY(-1px);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.15),
      0 4px 16px rgba(0, 0, 0, 0.12);
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

  .admin-nav {
    flex: 1;
    padding: var(--space-lg) 0;
  }

  .nav-item-wrapper {
    margin-bottom: var(--space-xs);
  }

  .nav-item {
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
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    text-align: left;
    border-radius: var(--radius-md);
    text-decoration: none;
    margin-bottom: var(--space-sm);
  }

  .nav-item:hover {
    background: rgba(var(--glass-tint), 0.06);
    backdrop-filter: blur(0.75rem);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: var(--link-color);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.08),
      0 2px 8px rgba(0, 0, 0, 0.06);
  }

  .nav-item.active {
    background: rgba(var(--glass-tint), 0.12);
    backdrop-filter: blur(1rem);
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: var(--link-color);
    font-weight: 700;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.15),
      0 4px 16px rgba(0, 0, 0, 0.1);
  }

  .nav-item.active:hover {
    background: rgba(var(--glass-tint), 0.15);
    border-color: var(--link-hover);
    color: var(--link-hover);
  }

  .nav-icon {
    font-size: 1.125rem;
    height: 1.75rem;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .nav-label {
    flex: 1;
    white-space: nowrap;
  }

  .nav-chevron {
    width: 1rem;
    height: 1rem;
    transition: transform 0.2s ease;
  }

  .nav-chevron.expanded {
    transform: rotate(90deg);
  }

  .nav-subitems {
    padding-left: var(--space-3xl);
    margin-top: var(--space-xs);
  }

  .nav-subitem {
    width: calc(100% - var(--space-2xl));
    margin: 0 var(--space-md) var(--space-xs) var(--space-md);
    display: block;
    padding: var(--space-sm) var(--space-lg);
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    text-align: left;
    border-radius: var(--radius-md);
  }

  .nav-subitem:hover {
    background: rgba(var(--glass-tint), 0.06);
    backdrop-filter: blur(0.75rem);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: var(--link-color);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.08),
      0 2px 8px rgba(0, 0, 0, 0.06);
  }

  .nav-subitem.active {
    background: rgba(var(--glass-tint), 0.12);
    backdrop-filter: blur(1rem);
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: var(--link-color);
    font-weight: 700;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.15),
      0 4px 16px rgba(0, 0, 0, 0.1);
  }

  .admin-main {
    flex: 1;
    padding: var(--space-3xl);
    overflow-y: auto;
    margin-left: 0px;
    min-height: 100vh;
    background: var(--bg-primary);
  }

  @media (max-width: 1280px) {
    .admin-sidebar {
      left: 80px;
    }

    .admin-main {
      margin-left: 360px;
    }
  }

  @media (max-width: 1024px) {
    .admin-sidebar {
      position: fixed;
      left: -280px;
      z-index: 1000;
      transition: left 0.3s ease;
    }

    .admin-main {
      margin-left: 0;
      width: 100%;
    }
  }

  @media (max-width: 768px) {
    .admin-sidebar {
      left: -100%;
    }

    .admin-main {
      padding: var(--space-xl);
      margin-left: 0;
    }
  }
</style>

