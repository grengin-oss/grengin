<script lang="ts">
  import type { User } from '$lib/types/auth';
  import { listConversations, searchConversations } from '../../api/chatApi.js';

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
  let showChatMenu = $state(false);
  let activeChatMenu = $state<string | null>(null);

  const menuItems = [
    { 
      id: 'chat', 
      label: 'New Chat',
      icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>'
    },
    { 
      id: 'search', 
      label: 'Search Chats',
      icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path></svg>'
    },
    
  ];

  let activeItem = $state('chat');

  // Chat data from API
  let chatHistory = $state<any[]>([]);
  let loadingChats = $state(false);
  let showSearchPopup = $state(false);
  let searchQuery = $state('');
  let searchResults = $state<any[]>([]);
  let searching = $state(false);

  function handleItemClick(itemId: string) {
    activeItem = itemId;
    
    if (itemId === 'search') {
      showSearchPopup = true;
      return;
    }
    
    if (itemId === 'chat') {
      // Remove chatId from URL and open fresh chat
      window.history.pushState({}, '', window.location.pathname);
      onnavigate?.(itemId);
      return;
    }
    
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

  function toggleChatMenu(chatId: string) {
    activeChatMenu = activeChatMenu === chatId ? null : chatId;
  }

  function selectChat(chatId: string) {
    console.log('Selected chat:', chatId);
    // Navigate to chat with chatId parameter
    window.history.pushState({}, '', `?chatId=${chatId}`);
    onnavigate?.(`chat-${chatId}`);
    activeChatMenu = null;
  }

  function deleteChat(chatId: string) {
    chatHistory = chatHistory.filter(chat => chat.id !== chatId);
    activeChatMenu = null;
  }

  async function handleSearch() {
    if (!searchQuery.trim()) {
      searchResults = [];
      return;
    }

    try {
      searching = true;
      searchResults = await searchConversations(searchQuery);
    } catch (error) {
      console.error('Search failed:', error);
      searchResults = [];
    } finally {
      searching = false;
    }
  }

  function closeSearchPopup() {
    showSearchPopup = false;
    searchQuery = '';
    searchResults = [];
  }

  function selectSearchResult(chatId: string) {
    closeSearchPopup();
    // Navigate to chat with chatId parameter
    window.history.pushState({}, '', `?chatId=${chatId}`);
    onnavigate?.(`chat-${chatId}`);
  }

  async function fetchChats() {
    try {
      loadingChats = true;
      const chats = await listConversations();
      chatHistory = chats.map((chat: any) => ({
        id: chat.id,
        title: chat.title || 'Untitled Chat',
        archived: chat.archived,
        createdAt: chat.createdAt,
        lastMessageAt: chat.lastMessageAt,
        totalTokens: chat.totalTokens
      }));
    } catch (error) {
      console.error('Failed to fetch chats:', error);
    } finally {
      loadingChats = false;
    }
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

  function handleAdminClick() {
    closeUserMenu();
    window.location.href = '/admin';
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

  // Fetch chats on component mount
  $effect(() => {
    fetchChats();
  });

  $effect(() => {
    console.log('user', user);
  });
</script>

<svelte:window onclick={handleClickOutside} onresize={handleResize} />

<aside class="sidebar" class:collapsed={isCollapsed}>
  <div class="sidebar-header">
    <div class="sidebar-brand">
      {#if !isCollapsed}
        <img src="/grengin-icon.svg" alt="Grengin" class="logo-icon" />
        <div class="spacer"></div>
        <button
          class="burger-btn"
          onclick={toggleSidebar}
          aria-label="Toggle sidebar"
          title="Toggle sidebar"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" data-rtl-flip="" class="icon max-md:hidden"><path d="M6.83496 3.99992C6.38353 4.00411 6.01421 4.0122 5.69824 4.03801C5.31232 4.06954 5.03904 4.12266 4.82227 4.20012L4.62207 4.28606C4.18264 4.50996 3.81498 4.85035 3.55859 5.26848L3.45605 5.45207C3.33013 5.69922 3.25006 6.01354 3.20801 6.52824C3.16533 7.05065 3.16504 7.71885 3.16504 8.66301V11.3271C3.16504 12.2712 3.16533 12.9394 3.20801 13.4618C3.25006 13.9766 3.33013 14.2909 3.45605 14.538L3.55859 14.7216C3.81498 15.1397 4.18266 15.4801 4.62207 15.704L4.82227 15.79C5.03904 15.8674 5.31234 15.9205 5.69824 15.9521C6.01398 15.9779 6.383 15.986 6.83398 15.9902L6.83496 3.99992ZM18.165 11.3271C18.165 12.2493 18.1653 12.9811 18.1172 13.5702C18.0745 14.0924 17.9916 14.5472 17.8125 14.9648L17.7295 15.1415C17.394 15.8 16.8834 16.3511 16.2568 16.7353L15.9814 16.8896C15.5157 17.1268 15.0069 17.2285 14.4102 17.2773C13.821 17.3254 13.0893 17.3251 12.167 17.3251H7.83301C6.91071 17.3251 6.17898 17.3254 5.58984 17.2773C5.06757 17.2346 4.61294 17.1508 4.19531 16.9716L4.01855 16.8896C3.36014 16.5541 2.80898 16.0434 2.4248 15.4169L2.27051 15.1415C2.03328 14.6758 1.93158 14.167 1.88281 13.5702C1.83468 12.9811 1.83496 12.2493 1.83496 11.3271V8.66301C1.83496 7.74072 1.83468 7.00898 1.88281 6.41985C1.93157 5.82309 2.03329 5.31432 2.27051 4.84856L2.4248 4.57317C2.80898 3.94666 3.36012 3.436 4.01855 3.10051L4.19531 3.0175C4.61285 2.83843 5.06771 2.75548 5.58984 2.71281C6.17898 2.66468 6.91071 2.66496 7.83301 2.66496H12.167C13.0893 2.66496 13.821 2.66468 14.4102 2.71281C15.0069 2.76157 15.5157 2.86329 15.9814 3.10051L16.2568 3.25481C16.8833 3.63898 17.394 4.19012 17.7295 4.84856L17.8125 5.02531C17.9916 5.44285 18.0745 5.89771 18.1172 6.41985C18.1653 7.00898 18.165 7.74072 18.165 8.66301V11.3271ZM8.16406 15.995H12.167C13.1112 15.995 13.7794 15.9947 14.3018 15.9521C14.8164 15.91 15.1308 15.8299 15.3779 15.704L15.5615 15.6015C15.9797 15.3451 16.32 14.9774 16.5439 14.538L16.6299 14.3378C16.7074 14.121 16.7605 13.8478 16.792 13.4618C16.8347 12.9394 16.835 12.2712 16.835 11.3271V8.66301C16.835 7.71885 16.8347 7.05065 16.792 6.52824C16.7605 6.14232 16.7073 5.86904 16.6299 5.65227L16.5439 5.45207C16.32 5.01264 15.9796 4.64498 15.5615 4.3886L15.3779 4.28606C15.1308 4.16013 14.8165 4.08006 14.3018 4.03801C13.7794 3.99533 13.1112 3.99504 12.167 3.99504H8.16406C8.16407 3.99667 8.16504 3.99829 8.16504 3.99992L8.16406 15.995Z"></path></svg>
        </button>
        {:else}
        <div class="collapsed-logo-container">
          <button
            class="logo-btn"
            onclick={toggleSidebar}
            aria-label="Toggle sidebar"
            title="Toggle sidebar"
          >
            <img src="/grengin-icon.svg" alt="Grengin" class="logo-icon" />
          </button>
          <button
            class="expand-btn"
            onclick={toggleSidebar}
            aria-label="Expand sidebar"
            title="Expand sidebar"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
              <path d="M6.83496 3.99992C6.38353 4.00411 6.01421 4.0122 5.69824 4.03801C5.31232 4.06954 5.03904 4.12266 4.82227 4.20012L4.62207 4.28606C4.18264 4.50996 3.81498 4.85035 3.55859 5.26848L3.45605 5.45207C3.33013 5.69922 3.25006 6.01354 3.20801 6.52824C3.16533 7.05065 3.16504 7.71885 3.16504 8.66301V11.3271C3.16504 12.2712 3.16533 12.9394 3.20801 13.4618C3.25006 13.9766 3.33013 14.2909 3.45605 14.538L3.55859 14.7216C3.81498 15.1397 4.18266 15.4801 4.62207 15.704L4.82227 15.79C5.03904 15.8674 5.31234 15.9205 5.69824 15.9521C6.01398 15.9779 6.383 15.986 6.83398 15.9902L6.83496 3.99992ZM18.165 11.3271C18.165 12.2493 18.1653 12.9811 18.1172 13.5702C18.0745 14.0924 17.9916 14.5472 17.8125 14.9648L17.7295 15.1415C17.394 15.8 16.8834 16.3511 16.2568 16.7353L15.9814 16.8896C15.5157 17.1268 15.0069 17.2285 14.4102 17.2773C13.821 17.3254 13.0893 17.3251 12.167 17.3251H7.83301C6.91071 17.3251 6.17898 17.3254 5.58984 17.2773C5.06757 17.2346 4.61294 17.1508 4.19531 16.9716L4.01855 16.8896C3.36014 16.5541 2.80898 16.0434 2.4248 15.4169L2.27051 15.1415C2.03328 14.6758 1.93158 14.167 1.88281 13.5702C1.83468 12.9811 1.83496 12.2493 1.83496 11.3271V8.66301C1.83496 7.74072 1.83468 7.00898 1.88281 6.41985C1.93157 5.82309 2.03329 5.31432 2.27051 4.84856L2.4248 4.57317C2.80898 3.94666 3.36012 3.436 4.01855 3.10051L4.19531 3.0175C4.61285 2.83843 5.06771 2.75548 5.58984 2.71281C6.17898 2.66468 6.91071 2.66496 7.83301 2.66496H12.167C13.0893 2.66496 13.821 2.66468 14.4102 2.71281C15.0069 2.76157 15.5157 2.86329 15.9814 3.10051L16.2568 3.25481C16.8833 3.63898 17.394 4.19012 17.7295 4.84856L17.8125 5.02531C17.9916 5.44285 18.0745 5.89771 18.1172 6.41985C18.1653 7.00898 18.165 7.74072 18.165 8.66301V11.3271ZM8.16406 15.995H12.167C13.1112 15.995 13.7794 15.9947 14.3018 15.9521C14.8164 15.91 15.1308 15.8299 15.3779 15.704L15.5615 15.6015C15.9797 15.3451 16.32 14.9774 16.5439 14.538L16.6299 14.3378C16.7074 14.121 16.7605 13.8478 16.792 13.4618C16.8347 12.9394 16.835 12.2712 16.835 11.3271V8.66301C16.835 7.71885 16.8347 7.05065 16.792 6.52824C16.7605 6.14232 16.7073 5.86904 16.6299 5.65227L16.5439 5.45207C16.32 5.01264 15.9796 4.64498 15.5615 4.3886L15.3779 4.28606C15.1308 4.16013 14.8165 4.08006 14.3018 4.03801C13.7794 3.99533 13.1112 3.99504 12.167 3.99504H8.16406C8.16407 3.99667 8.16504 3.99829 8.16504 3.99992L8.16406 15.995Z"></path>
            </svg>
          </button>
        </div>
      {/if}
    </div>
  </div>

  <nav class="sidebar-nav">
    {#each menuItems as item}
      <button
        class="sidebar-item"
        onclick={() => handleItemClick(item.id)}
        title={item.label}
      >
        <span class="sidebar-icon">{@html item.icon}</span>
        <span class="sidebar-label">{item.label}</span>
      </button>
    {/each}
  </nav>

  <!-- Chat List Section -->
  {#if !isCollapsed}
    <div class="chat-list-section">
      <div class="chat-section-title">
        <span>Chats</span>
      </div>
      <div class="chat-list">
        {#if loadingChats}
          <div class="chat-loading">
            <span>Loading chats...</span>
          </div>
        {:else if chatHistory.length === 0}
          <div class="chat-empty">
            <span>No chats yet</span>
          </div>
        {:else}
          {#each chatHistory as chat (chat.id)}
            <div class="chat-item">
              <button class="chat-item-btn" onclick={() => selectChat(chat.id)} title={chat.title}>
                <span class="chat-item-title">{chat.title}</span>
              </button>
              <button class="chat-item-menu" onclick={() => toggleChatMenu(chat.id)} title="Chat options">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="1"></circle>
                  <circle cx="12" cy="5" r="1"></circle>
                  <circle cx="12" cy="19" r="1"></circle>
                </svg>
              </button>
              {#if activeChatMenu === chat.id}
                <div class="chat-dropdown">
                  <button class="chat-dropdown-item" onclick={() => deleteChat(chat.id)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="3,6 5,6 21,6"></polyline>
                      <path d="m19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"></path>
                    </svg>
                    Delete
                  </button>
                </div>
              {/if}
            </div>
          {/each}
        {/if}
      </div>
    </div>
  {/if}

  <div class="sidebar-footer">
    <div class="user-menu-container" bind:this={userMenuElement}>
      <button
        class="user-menu-trigger sidebar-item"
        onclick={toggleUserMenu}
        title="User menu"
      >
        <div class="user-avatar">
          <div class="user-initials" style="background-color: {getUserColor()};">
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
    {#if user?.super_admin}
      <button class="user-menu-item admin-item" onclick={handleAdminClick}>
        <svg class="menu-item-icon admin-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
        <span class="menu-item-label">Admin Dashboard</span>
      </button>
    {/if}
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

<!-- Search Popup -->
{#if showSearchPopup}
  <div class="search-overlay" onclick={closeSearchPopup}>
    <div class="search-popup" onclick={(e) => e.stopPropagation()}>
      <div class="search-header">
        <h3>Search Chats</h3>
        <button class="close-btn" onclick={closeSearchPopup}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="search-input-container">
        <input
          type="text"
          class="search-input"
          placeholder="Search conversations..."
          bind:value={searchQuery}
          oninput={handleSearch}
        />
        {#if searching}
          <div class="search-spinner"></div>
        {/if}
      </div>
      <div class="search-results">
        {#if searching}
          <div class="search-loading">Searching...</div>
        {:else if searchResults.length === 0 && searchQuery}
          <div class="search-empty">No conversations found</div>
        {:else if searchResults.length > 0}
          {#each searchResults as result}
            <button class="search-result-item" onclick={() => selectSearchResult(result.id)}>
              <div class="result-title">{result.title || 'Untitled Chat'}</div>
              <div class="result-date">{result.created_at ? new Date(result.created_at).toLocaleDateString() : 'No date'}</div>
            </button>
          {/each}
        {/if}
      </div>
    </div>
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
    padding: var(--space-xl) var(--space-xl);
    border-bottom: 1px solid #eaeaea;
    margin-bottom: 1px;
  }

  .collapsed .sidebar-header {
    padding: var(--space-2xl) 0;
  }

  .sidebar-brand {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
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
    width: 32px;
    height: 32px;
    padding: 0;
    border: none;
    background: rgba(var(--glass-tint), 0.9);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 50%;
    color: var(--text-primary);
    cursor: pointer;
    opacity: 0;
    transition: all 0.2s ease;
    z-index: 10;
  }

  .collapsed-logo-container:hover .logo-btn {
    opacity: 0;
  }

  .collapsed-logo-container:hover .expand-btn {
    opacity: 1;
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
    width: 32px;
    height: 32px;
    object-fit: contain;
    transition: all 0.3s ease;
  }

  .logo-btn:hover .logo-icon {
    filter: brightness(1.2) drop-shadow(0 0 8px rgba(var(--brand-rgb), 0.4));
  }

  .sidebar-nav {
    flex: 0;
    padding: var(--space-lg) 0 var(--space-sm) 0;
  }

  .sidebar-item {
    width: 100%;
    margin: 0;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 0.75rem;
    padding: 0.625rem 1rem;
    border: none;
    color: var(--text-secondary);
    background: #fff;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: left;
    border-radius: 0;
    margin-bottom: 0.125rem;
    box-shadow: none;
  }

  .sidebar-item:hover {
    background: transparent;
    color: var(--text-primary);
  }

  .sidebar-item.active {
    background: transparent;
    color: #667eea;
    font-weight: 500;
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
    border-top: 1px solid #eaeaea;
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
    border-radius: 50%;
    color: var(--bg-primary);
    text-transform: uppercase;
    padding: 0.25rem;
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

  .user-menu-item.admin-item:hover {
    background: rgba(var(--brand-rgb), 0.12);
    color: var(--brand);
  }

  .user-menu-item.logout-item:hover {
    background: rgba(255, 82, 82, 0.12);
    color: #ff5252;
  }

  .admin-icon {
    width: 1.125rem;
    height: 1.125rem;
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

  /* Chat List Styles */
  .chat-list-section {
    flex: 1;
    overflow-y: auto;
    padding: 0 var(--space-md);
    margin-top: 0;
    margin-bottom: var(--space-md);
  }

  .chat-section-title {
    padding: 0.5rem 0.75rem;
    margin-bottom: 0.5rem;
  }

  .chat-section-title span {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .chat-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .chat-item {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: flex-start;
  }

  .chat-item-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    padding: 0.625rem 0.75rem;
    border: none;
    background: #fff;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: 0;
    margin: 0;
    transition: all 0.2s ease;
    text-align: left;
    font-size: 0.875rem;
    box-shadow: none;
  }

  .chat-item-btn:hover {
    background: transparent;
    color: var(--text-primary);
  }

  .chat-item-title {
    font-size: 0.875rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 180px;
  }

  .chat-item-menu {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: 4px;
    margin-right: 0.5rem;
    opacity: 0;
    transition: all 0.2s ease;
  }

  .chat-item:hover .chat-item-menu {
    opacity: 1;
  }

  .chat-item-menu:hover {
    background: rgba(255, 255, 255, 0.1);
    color: var(--text-primary);
  }

  .chat-dropdown {
    position: absolute;
    top: 100%;
    right: 0.5rem;
    margin-top: 0.25rem;
    background: var(--bg-primary);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 0.5rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 1000;
    min-width: 120px;
  }

  .chat-dropdown-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: none;
    background: transparent;
    color: var(--text-primary);
    cursor: pointer;
    font-size: 0.875rem;
    transition: background-color 0.15s ease;
  }

  .chat-dropdown-item:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .chat-loading,
  .chat-empty {
    padding: 1rem 0.75rem;
    text-align: center;
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  /* Search Popup Styles */
  .search-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 2000;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fadeIn 0.2s ease;
  }

  .search-popup {
    background: var(--bg-primary);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
    width: 90%;
    max-width: 500px;
    max-height: 80vh;
    overflow: hidden;
    animation: slideUp 0.3s ease;
  }

  .search-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.5rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .search-header h3 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .close-btn {
    background: transparent;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    padding: 0.5rem;
    border-radius: 6px;
    transition: all 0.2s ease;
  }

  .close-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: var(--text-primary);
  }

  .search-input-container {
    position: relative;
    padding: 1rem 1.5rem;
  }

  .search-input {
    width: 100%;
    padding: 0.75rem 1rem;
    background: var(--bg-secondary);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    color: var(--text-primary);
    font-size: 0.875rem;
    outline: none;
    transition: all 0.2s ease;
  }

  .search-input:focus {
    border-color: var(--brand-primary);
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
  }

  .search-input::placeholder {
    color: var(--text-secondary);
  }

  .search-spinner {
    position: absolute;
    right: 2rem;
    top: 1.5rem;
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255, 255, 255, 0.1);
    border-top: 2px solid var(--brand-primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  .search-results {
    max-height: 400px;
    overflow-y: auto;
  }

  .search-loading,
  .search-empty {
    padding: 2rem 1.5rem;
    text-align: center;
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .search-result-item {
    width: 100%;
    padding: 1rem 1.5rem;
    background: transparent;
    border: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    color: var(--text-primary);
    text-align: left !important;
    cursor: pointer;
    transition: background-color 0.2s ease;
    display: block;
  }

  .search-result-item:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .search-result-item:last-child {
    border-bottom: none;
  }

  .result-title {
    font-size: 0.875rem;
    font-weight: 500;
    margin-bottom: 0.25rem;
    text-align: left !important;
    display: block;
  }

  .result-date {
    font-size: 0.75rem;
    color: var(--text-secondary);
    text-align: left !important;
    display: block;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }
</style>
