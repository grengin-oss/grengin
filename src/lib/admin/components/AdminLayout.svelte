<script lang="ts">
  interface Props {
    children?: any;
    onnavigate?: (page: string) => void;
  }

  let { children, onnavigate }: Props = $props();

  const navItems: Array<{
    id: string;
    label: string;
    icon: string;
    subItems?: Array<{ id: string; label: string }>;
  }> = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: '📊',
    },
    {
      id: 'users',
      label: 'User Management',
      icon: '👥',
    },
    {
      id: 'usage',
      label: 'Usage & Analytics',
      icon: '📈',
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: '⚙️',
    },
    {
      id: 'audit-log',
      label: 'Audit Log',
      icon: '📝',
    },
  ];

  let activePage = $state<string>('dashboard');
  let expandedItems = $state<Set<string>>(new Set(['settings']));

  function handleNavigate(pageId: string) {
    activePage = pageId;
    onnavigate?.(pageId);
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
      <h1 class="admin-title">Admin Panel</h1>
    </div>
    
    <nav class="admin-nav" aria-label="Admin navigation">
      {#each navItems as item}
        <div class="nav-item-wrapper">
          {#if item.subItems}
            <button
              class="nav-item"
              onclick={() => toggleExpand(item.id)}
            >
              <span class="nav-icon">{item.icon}</span>
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
                    class:active={activePage === subItem.id}
                    onclick={() => handleNavigate(subItem.id)}
                  >
                    {subItem.label}
                  </button>
                {/each}
              </div>
            {/if}
          {:else}
            <button
              class="nav-item"
              class:active={activePage === item.id}
              onclick={() => handleNavigate(item.id)}
            >
              <span class="nav-icon">{item.icon}</span>
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
    background: rgba(var(--glass-tint), 0.02);
    border-right: 1px solid rgba(255, 255, 255, 0.08);
    display: flex;
    flex-direction: column;
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
  }

  .admin-sidebar-header {
    padding: var(--space-3xl) var(--space-xl);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .admin-title {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0;
    letter-spacing: -0.02em;
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
    padding: var(--space-md) var(--space-lg);
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.9375rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: left;
    border-radius: var(--radius-md);
    text-decoration: none;
  }

  .nav-item:hover {
    background: rgba(var(--glass-tint), 0.06);
    color: var(--text-primary);
  }

  .nav-item.active {
    background: rgba(var(--brand-rgb), 0.12);
    color: var(--brand);
    font-weight: 600;
  }

  .nav-icon {
    font-size: 1.125rem;
    width: 1.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .nav-label {
    flex: 1;
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
    color: var(--text-secondary);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: left;
    border-radius: var(--radius-sm);
  }

  .nav-subitem:hover {
    background: rgba(var(--glass-tint), 0.06);
    color: var(--text-primary);
  }

  .nav-subitem.active {
    background: rgba(var(--brand-rgb), 0.08);
    color: var(--brand);
    font-weight: 600;
  }

  .admin-main {
    flex: 1;
    padding: var(--space-3xl);
    overflow-y: auto;
    margin-left: 280px;
  }

  @media (max-width: 1024px) {
    .admin-sidebar {
      position: fixed;
      left: -280px;
      z-index: 1000;
      transition: left 0.3s ease;
    }

    .admin-main {
      width: 100%;
    }
  }

  @media (max-width: 768px) {
    .admin-main {
      padding: var(--space-xl);
    }
  }
</style>

