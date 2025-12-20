<script lang="ts">
  import type { User } from "../../types/auth";
  import { listConversations, deleteConversation, archiveConversation } from '../../api/chatApi.js';
  import grenginLogo from '../../../assets/grengin-logo.svg';
  import { toast } from '../Toaster.svelte';

  interface Props {
    isCollapsed?: boolean;
    onsidebarToggle?: (collapsed: boolean) => void;
    onnavigate?: (itemId: string) => void;
    user?: User | null;
    onlogout?: () => void;
  }

  let { isCollapsed = $bindable(false), onsidebarToggle, onnavigate, user = null, onlogout }: Props = $props();

  // Auto-collapse sidebar on mobile after navigation actions
  function collapseSidebarOnMobile() {
    if (window.innerWidth <= 768) {
      isCollapsed = true;
      onsidebarToggle?.(isCollapsed);
    }
  }

  let showUserMenu = $state(false);
  let userMenuElement: HTMLElement;
  let userCollapsed = $state(false);
  let showChatMenu = $state(false);
  let activeChatMenu = $state<string | null>(null);
  let showDeleteConfirmation = $state(false);
  let selectedChatId = $state<string | null>(null);
  let chatToDelete = $state<string | null>(null);
  let deletingChat = $state(false);

  const menuItems = [
    {
      id: 'chat',
      label: 'New Chat',
      icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>'
    },
  ];

  let activeItem = $state('chat');

  // Chat data from API
  let chatHistory = $state<any[]>([]);
  let loadingChats = $state(false);
  let searchQuery = $state('');
  let searchFocused = $state(false);

  // Filtered chats based on search query
  let filteredChats = $derived(
    searchQuery.trim()
      ? chatHistory.filter(chat =>
          chat.title.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : chatHistory
  );

  function handleItemClick(itemId: string) {
    activeItem = itemId;

    if (itemId === 'chat') {
      // Remove chatId from URL and open fresh chat
      selectedChatId = null;
      window.history.pushState({}, '', window.location.pathname);
      onnavigate?.(itemId);
      // Focus the chat input after a short delay to allow state to settle
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('focusChatInput'));
      }, 50);
      
      collapseSidebarOnMobile();
      return;
    }

    onnavigate?.(itemId);
    collapseSidebarOnMobile();
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
    selectedChatId = chatId;
    // Navigate to chat with chatId parameter
    window.history.pushState({}, '', `?chatId=${chatId}`);
    onnavigate?.(`chat-${chatId}`);
    activeChatMenu = null;
    collapseSidebarOnMobile();
  }

  function deleteChat(chatId: string) {
    chatToDelete = chatId;
    showDeleteConfirmation = true;
    activeChatMenu = null;
  }

  async function confirmDeleteChat() {
    if (chatToDelete) {
      deletingChat = true;
      try {
        await deleteConversation(chatToDelete);
        const deletedChat = chatHistory.find(chat => chat.id === chatToDelete);
        chatHistory = chatHistory.filter(chat => chat.id !== chatToDelete);
        showDeleteConfirmation = false;

        // Clear selection if deleted chat was selected
        if (selectedChatId === chatToDelete) {
          selectedChatId = null;
          toast.success(`"${deletedChat?.title || 'Chat'}" deleted successfully`);
          // Navigate to fresh chat after deletion
          window.history.pushState({}, '', window.location.pathname);
          onnavigate?.('chat');
          collapseSidebarOnMobile();
        }

        chatToDelete = null;
      } catch (error) {
        console.error('Failed to delete conversation:', error);
        toast.error('Failed to delete chat');
        // You might want to show an error message here
      } finally {
        deletingChat = false;
      }
    }
  }

  function cancelDeleteChat() {
    showDeleteConfirmation = false;
    chatToDelete = null;
  }

  function clearSearch() {
    searchQuery = '';
    searchFocused = false;
  }

  function archiveChat(chatId: string, title: string) {
    archiveChatAction(chatId, title);
    activeChatMenu = null;
  }

  async function archiveChatAction(chatId: string, title: string) {
    try {
      await archiveConversation(chatId, title);
      chatHistory = chatHistory.filter(chat => chat.id !== chatId);
      toast.success(`"${title}" archived successfully`);
      
      // Clear selection if archived chat was selected
      if (selectedChatId === chatId) {
        selectedChatId = null;
        // Navigate to fresh chat after archiving
        window.history.pushState({}, '', window.location.pathname);
        onnavigate?.('chat');
        collapseSidebarOnMobile();
      }
    } catch (error) {
      console.error('Failed to archive conversation:', error);
      toast.error('Failed to archive chat');
    }
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
    if (activeChatMenu) {
      activeChatMenu = null;
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

  // Initialize selected chat from URL and listen for changes
  function updateSelectedChatFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const chatId = params.get('chatId');
    selectedChatId = chatId;
  }

  // Fetch chats on component mount
  $effect(() => {
    fetchChats();
    updateSelectedChatFromUrl();

    // Listen for chat history refresh events
    const handleRefresh = () => {
      console.log('Refreshing chat history in sidebar');
      fetchChats();
    };

    // Listen for URL changes (popstate for back/forward navigation)
    const handlePopState = () => {
      updateSelectedChatFromUrl();
    };

    window.addEventListener('refreshChatHistory', handleRefresh);
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('refreshChatHistory', handleRefresh);
      window.removeEventListener('popstate', handlePopState);
    };
  });
</script>

<svelte:window onclick={handleClickOutside} onresize={handleResize} />

<aside class="sidebar" class:collapsed={isCollapsed}>
  <div class="sidebar-header">
    <div class="sidebar-brand">
      {#if !isCollapsed}
        <img src={grenginLogo} alt="Grengin" class="brand-logo" />
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
      <!-- Inline Search -->
      <div class="chat-search-wrapper" class:expanded={searchQuery.length > 0 || searchFocused}>
        <div class="chat-search-container">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="search-icon">
            <circle cx="11" cy="11" r="8"/>
            <path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            type="text"
            placeholder="Search..."
            bind:value={searchQuery}
            class="chat-search-input"
            onfocus={() => searchFocused = true}
            onblur={() => searchFocused = false}
            title="Search through your chat conversations"
          />
          {#if searchQuery}
            <button class="clear-search-btn" onclick={clearSearch} aria-label="Clear search" title="Clear search">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          {/if}
        </div>
      </div>

      <!-- Chat List Header -->
      <div class="chat-section-title">
        <span>Chats {#if chatHistory.length > 0}({filteredChats.length}){/if}</span>
      </div>

      <div class="chat-list">
        {#if loadingChats}
          <div class="chat-loading">
            <div class="loading-spinner-small"></div>
            <span>Loading chats...</span>
          </div>
        {:else if chatHistory.length === 0}
          <div class="chat-empty">
            <span>No chats yet</span>
          </div>
        {:else if filteredChats.length === 0 && searchQuery}
          <div class="no-results">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/>
              <path d="m21 21-4.35-4.35"/>
            </svg>
            <span>No chats found</span>
          </div>
        {:else}
          {#each filteredChats as chat (chat.id)}
            <div class="chat-item">
              <button class="chat-item-btn" class:selected={selectedChatId === chat.id} onclick={() => selectChat(chat.id)} title={chat.title}>
                <span class="chat-item-title">{chat.title}</span>
              </button>
              <button class="chat-item-menu" onclick={(e) => { e.stopPropagation(); toggleChatMenu(chat.id); }} title="Chat options" aria-expanded={activeChatMenu === chat.id}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="1"></circle>
                  <circle cx="12" cy="5" r="1"></circle>
                  <circle cx="12" cy="19" r="1"></circle>
                </svg>
              </button>
              {#if activeChatMenu === chat.id}
                <div class="chat-dropdown" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="menu" tabindex="-1">
                  <button class="chat-dropdown-item" onclick={() => deleteChat(chat.id)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="3,6 5,6 21,6"></polyline>
                      <path d="m19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"></path>
                    </svg>
                    Delete
                  </button>
                  <button class="chat-dropdown-item" onclick={() => archiveChat(chat.id, chat.title)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                    </svg>
                    Archive
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

<!-- Delete Confirmation Dialog -->
{#if showDeleteConfirmation}
  <div class="confirmation-overlay" role="dialog" aria-modal="true" aria-labelledby="delete-title">
    <div class="confirmation-dialog">
      <div class="confirmation-header">
        <h3 id="delete-title">Delete Chat</h3>
        <button class="close-btn" onclick={cancelDeleteChat} aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="confirmation-content">
        <p>Are you sure you want to delete this chat? This action cannot be undone.</p>
      </div>
      <div class="confirmation-actions">
        <button class="cancel-btn" onclick={cancelDeleteChat} disabled={deletingChat}>
          Cancel
        </button>
        <button class="delete-btn" onclick={confirmDeleteChat} disabled={deletingChat}>
          {#if deletingChat}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spinner">
              <circle cx="12" cy="12" r="10" opacity="0.25"></circle>
              <path d="M12 2a10 10 0 0 1 10 10" opacity="0.75"></path>
            </svg> &nbsp;
            Deleting...
          {:else}
            Delete
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  /* ===== Sidebar Container ===== */
  .sidebar {
    position: fixed;
    left: 0;
    top: 0;
    width: 260px;
    height: 100vh;
    display: flex;
    flex-direction: column;
    z-index: 1000;
    overflow-y: auto;
    overflow-x: hidden;
    transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    background: var(--bg-primary);
    border-right: 1px solid var(--glass-stroke-dark);
    box-shadow: 2px 0 20px rgba(0, 0, 0, 0.15);
  }

  .sidebar.collapsed {
    width: 72px;
  }

  /* Custom scrollbar */
  .sidebar::-webkit-scrollbar {
    width: 4px;
  }

  .sidebar::-webkit-scrollbar-track {
    background: transparent;
  }

  .sidebar::-webkit-scrollbar-thumb {
    background: var(--glass-stroke-light);
    border-radius: 2px;
  }

  .sidebar::-webkit-scrollbar-thumb:hover {
    background: var(--text-secondary);
  }

  /* ===== Sidebar Header ===== */
  .sidebar-header {
    padding: var(--space-lg) var(--space-lg);
  }

  .collapsed .sidebar-header {
    padding: var(--space-lg) var(--space-sm);
  }

  .sidebar-brand {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    gap: var(--space-md);
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
    width: 36px;
    height: 36px;
    padding: 0;
    border: none;
    background: var(--btn-secondary);
    border: 1px solid var(--glass-stroke-dark);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    cursor: pointer;
    opacity: 0;
    transition: all 0.25s ease;
    z-index: 10;
  }

  .collapsed-logo-container:hover .logo-btn {
    opacity: 0;
  }

  .collapsed-logo-container:hover .expand-btn {
    opacity: 1;
  }

  .expand-btn:hover {
    background: var(--btn-tertiary);
    border-color: var(--brand);
    color: var(--brand);
  }

  /* Burger button - toggle sidebar */
  .burger-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    padding: 0;
    border: none;
    background: var(--btn-secondary);
    border: 1px solid var(--glass-stroke-dark);
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    flex-shrink: 0;
  }

  .burger-btn:hover {
    background: var(--btn-tertiary);
    border-color: var(--brand);
    color: var(--brand);
    transform: translateY(-1px);
  }

  .burger-btn:active {
    transform: translateY(0);
  }

  /* Logo */
  .logo-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 44px;
    padding: var(--space-sm);
    border: none;
    background: var(--btn-secondary);
    border: 1px solid var(--glass-stroke-dark);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .logo-btn:hover {
    background: var(--btn-tertiary);
    border-color: var(--brand);
    transform: scale(1.02);
  }

  .logo-btn:active {
    transform: scale(0.98);
  }

  .logo-icon {
    width: 28px;
    height: 28px;
    object-fit: contain;
    transition: all 0.25s ease;
  }

  .logo-btn:hover .logo-icon {
    filter: brightness(1.1);
  }

  .brand-logo {
    height: 28px;
    width: auto;
    object-fit: contain;
  }

  /* ===== Sidebar Navigation ===== */
  .sidebar-nav {
    flex: 0;
    padding: var(--space-md) var(--space-sm);
  }

  .sidebar-item {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: var(--space-md);
    padding: var(--space-md) var(--space-lg);
    margin-bottom: 2px;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: left;
    border-radius: var(--radius-md);
  }

  .sidebar-item:hover {
    background: var(--btn-secondary);
    color: var(--text-primary);
  }

  .sidebar-item.active {
    background: var(--glass-tint-primary);
    color: var(--brand);
    font-weight: 600;
  }

  .sidebar-icon {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .sidebar-label {
    font-weight: 500;
    white-space: nowrap;
    transition: opacity 0.2s ease, width 0.2s ease;
  }

  .collapsed .sidebar-label {
    opacity: 0;
    width: 0;
    overflow: hidden;
  }

  .collapsed .sidebar-item {
    justify-content: center;
    padding: var(--space-md);
  }

  .collapsed .sidebar-nav {
    padding: var(--space-md) var(--space-xs);
  }

  /* ===== Chat List Section ===== */
  .chat-list-section {
    flex: 1;
    overflow-y: auto;
    padding: 0 var(--space-sm);
    margin-bottom: var(--space-sm);
  }

  .chat-list-section::-webkit-scrollbar {
    width: 4px;
  }

  .chat-list-section::-webkit-scrollbar-track {
    background: transparent;
  }

  .chat-list-section::-webkit-scrollbar-thumb {
    background: var(--glass-stroke-light);
    border-radius: 2px;
  }

  .chat-section-title {
    padding: var(--space-sm) var(--space-md);
    margin-bottom: var(--space-xs);
  }

  .chat-section-title span {
    font-size: 0.6875rem;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .chat-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .chat-item {
    position: relative;
    display: flex;
    align-items: center;
  }

  .chat-item-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    padding: var(--space-sm) var(--space-md);
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition: all 0.2s ease;
    text-align: left;
    font-size: 0.8125rem;
    min-width: 0;
  }

  .chat-item-btn:hover {
    background: var(--btn-secondary);
    color: var(--text-primary);
  }

  .chat-item-btn.selected {
    background: var(--glass-tint-primary);
    color: var(--brand);
    font-weight: 500;
  }

  .chat-item-btn.selected:hover {
    background: var(--glass-tint-primary);
  }

  .chat-item-title {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .chat-item-menu {
    position: absolute;
    right: var(--space-md);
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
    border-radius: var(--radius-sm);
    opacity: 0;
    pointer-events: none;
    transition: all 0.2s ease;
  }

  .chat-item:hover .chat-item-menu,
  .chat-item-menu[aria-expanded="true"] {
    opacity: 1;
    pointer-events: auto;
  }

  .chat-item-menu:hover {
    background: var(--btn-tertiary);
    color: var(--text-primary);
  }

  .chat-dropdown {
    position: absolute;
    top: 100%;
    right: var(--space-sm);
    margin-top: var(--space-xs);
    background: var(--bg-primary);
    border: 1px solid var(--glass-stroke-dark);
    border-radius: var(--radius-md);
    box-shadow: var(--glass-shadow-emphasis);
    z-index: 1000;
    min-width: 120px;
    animation: slideUp 0.15s ease;
  }

  .chat-dropdown-item {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    width: 100%;
    padding: var(--space-sm) var(--space-md);
    border: none;
    background: transparent;
    color: var(--text-primary);
    cursor: pointer;
    font-size: 0.8125rem;
    transition: all 0.15s ease;
    border-radius: var(--radius-sm);
  }

  .chat-dropdown-item:hover {
    background: var(--btn-tertiary);
    color: var(--brand-red);
  }

  .chat-empty {
    padding: var(--space-xl) var(--space-md);
    text-align: center;
    color: var(--text-secondary);
    font-size: 0.8125rem;
  }

  /* ===== Sidebar Footer ===== */
  .sidebar-footer {
    padding: var(--space-sm);
    margin-top: auto;
  }

  .user-menu-container {
    position: relative;
  }

  .user-menu-trigger {
    width: 100%;
    padding: var(--space-sm) var(--space-md);
    background: transparent;
    border-radius: var(--radius-md);
    justify-content: flex-start;
    gap: var(--space-md);
  }

  .user-menu-trigger:hover {
    background: var(--btn-secondary);
  }

  .collapsed .user-menu-trigger {
    justify-content: center;
    padding: var(--space-sm);
  }

  .user-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .user-initials {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.75rem;
    font-weight: 600;
    color: white;
    text-transform: uppercase;
  }

  .user-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    min-width: 0;
  }

  .collapsed .user-info {
    display: none;
  }

  .user-name {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .dropdown-arrow {
    width: 16px;
    height: 16px;
    color: var(--text-secondary);
    transition: transform 0.25s ease;
    flex-shrink: 0;
  }

  .collapsed .dropdown-arrow {
    display: none;
  }

  .dropdown-arrow.rotated {
    transform: rotate(180deg);
  }

  /* ===== User Menu Dropdown ===== */
  .user-menu-dropdown {
    position: fixed;
    bottom: 4rem;
    left: var(--space-md);
    min-width: 200px;
    background: var(--bg-primary);
    border: 1px solid var(--glass-stroke-dark);
    border-radius: var(--radius-md);
    box-shadow: var(--glass-shadow-emphasis);
    overflow: hidden;
    animation: slideUpFade 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    z-index: 10001;
  }

  @keyframes slideUpFade {
    from {
      opacity: 0;
      transform: translateY(8px);
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
    padding: var(--space-md) var(--space-lg);
    background: transparent;
    border: none;
    color: var(--text-secondary);
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: left;
  }

  .user-menu-item:hover {
    background: var(--btn-secondary);
    color: var(--text-primary);
  }

  .user-menu-item.logout-item:hover {
    background: var(--danger-surface);
    color: var(--brand-red);
  }

  .menu-item-icon {
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .logout-icon {
    width: 18px;
    height: 18px;
  }

  .menu-item-label {
    font-weight: 500;
  }

  /* ===== Inline Search ===== */
  .chat-search-wrapper {
    padding: 0 var(--space-sm);
    margin-bottom: var(--space-sm);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .chat-search-wrapper.expanded {
    transform: scale(1.01);
  }

  .chat-search-container {
    position: relative;
    display: flex;
    align-items: center;
    height: 2rem;
    background: var(--btn-secondary);
    border: 1px solid var(--glass-stroke-dark);
    border-radius: var(--radius-md);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .chat-search-wrapper.expanded .chat-search-container {
    border-color: var(--glass-stroke-dark);
    box-shadow: var(--glass-shadow-light);
  }

  .chat-search-container .search-icon {
    position: absolute;
    left: var(--space-sm);
    color: var(--text-secondary);
    opacity: 0.6;
    transition: all 0.2s ease;
    pointer-events: none;
  }

  .chat-search-wrapper.expanded .search-icon {
    color: var(--text-primary);
    opacity: 1;
  }

  .chat-search-input {
    width: 100%;
    height: 100%;
    padding: 0 var(--space-sm) 0 2rem;
    background: transparent;
    border: none;
    color: var(--text-primary);
    font-size: 0.8rem;
    outline: none;
    transition: all 0.2s ease;
  }

  .chat-search-input::placeholder {
    color: var(--text-secondary);
    opacity: 0.6;
  }

  .clear-search-btn {
    position: absolute;
    right: var(--space-xs);
    padding: var(--space-xs);
    background: transparent;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .clear-search-btn:hover {
    color: var(--text-primary);
    background: var(--btn-tertiary);
  }

  .no-results {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-xl) var(--space-md);
    color: var(--text-secondary);
    opacity: 0.7;
    text-align: center;
  }

  .no-results span {
    font-size: 0.8rem;
  }

  .loading-spinner-small {
    width: 14px;
    height: 14px;
    border: 2px solid var(--glass-stroke-dark);
    border-top: 2px solid var(--brand);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  .chat-loading {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-xl) var(--space-md);
    text-align: center;
    color: var(--text-secondary);
    font-size: 0.8125rem;
    justify-content: center;
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition: all 0.15s ease;
  }

  .close-btn:hover {
    background: var(--btn-tertiary);
    color: var(--text-primary);
  }

  /* ===== Confirmation Dialog ===== */
  .confirmation-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    backdrop-filter: blur(4px);
    animation: fadeIn 0.2s ease;
  }

  .confirmation-dialog {
    background: var(--bg-primary);
    border: 1px solid var(--glass-stroke-dark);
    border-radius: var(--radius-lg);
    box-shadow: var(--glass-shadow-emphasis);
    width: 90%;
    max-width: 400px;
    overflow: hidden;
    animation: slideUp 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .confirmation-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-lg) var(--space-xl);
    border-bottom: 1px solid var(--glass-stroke-dark);
  }

  .confirmation-header h3 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .confirmation-content {
    padding: var(--space-lg) var(--space-xl);
  }

  .confirmation-content p {
    margin: 0;
    color: var(--text-secondary);
    font-size: 0.875rem;
    line-height: 1.6;
  }

  .confirmation-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-md);
    padding: var(--space-lg) var(--space-xl);
    border-top: 1px solid var(--glass-stroke-dark);
  }

  .cancel-btn {
    padding: var(--space-sm) var(--space-xl);
    border: 1px solid var(--glass-stroke-dark);
    background: transparent;
    color: var(--text-primary);
    border-radius: var(--radius-md);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .cancel-btn:hover {
    background: var(--btn-secondary);
    border-color: var(--glass-stroke-light);
  }

  .cancel-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .delete-btn {
    padding: var(--space-sm) var(--space-xl);
    border: none;
    background: var(--brand-red);
    color: white;
    border-radius: var(--radius-md);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .delete-btn:hover {
    background: color-mix(in oklab, var(--brand-red) 85%, black);
  }

  .delete-btn:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .spinner {
    animation: spin 1s linear infinite;
  }

  /* ===== Animations ===== */
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(16px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  /* ===== Mobile Responsiveness ===== */
  @media (max-width: 768px) {
    .sidebar {
      width: 280px;
      box-shadow: 4px 0 32px rgba(0, 0, 0, 0.25);
    }

    .sidebar.collapsed {
      transform: translateX(-100%);
      width: 280px;
    }

    .user-menu-dropdown {
      left: var(--space-md);
    }
  }

  @media (max-width: 480px) {
    .sidebar {
      width: 85vw;
      max-width: 320px;
      box-shadow: 4px 0 40px rgba(0, 0, 0, 0.3);
    }

    .sidebar.collapsed {
      transform: translateX(-100%);
      width: 85vw;
      max-width: 320px;
    }
  }
</style>
