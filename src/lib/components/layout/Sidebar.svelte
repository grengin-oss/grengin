<script lang="ts">
  import { Link } from "svelte-routing";
  import { _ } from 'svelte-i18n';
  import type { User } from "../../types/auth";
  import { listConversations, deleteConversation, archiveConversation, renameConversation } from '../../api/chatApi.js';
  import { ApiError } from '../../api/client';
  import { getLocalizedError } from '../../utils/errorLocalization';
  import grenginLogo from '../../../assets/grengin-logo.svg';
  import { toast } from '../Toaster.svelte';
  import { permissionsStore } from '../../features/auth/index.js';
  import { PERMISSIONS } from '../../features/auth/permissions.js';
  import { tick } from 'svelte';

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
  let activeChatMenu = $state<string | null>(null);
  let showDeleteConfirmation = $state(false);
  let selectedChatId = $state<string | null>(null);
  let initializingConversation = $state(false);
  let chatToDelete = $state<string | null>(null);
  let deletingChat = $state(false);

  // Detect if we're in admin view
  let currentPath = $state(window.location.pathname);
  let isAdminView = $derived(currentPath.startsWith('/admin'));
  let hasAdminPermissions = $derived(permissionsStore.hasAnyPermissions());
  let canViewAnalytics = $derived(
    permissionsStore.hasPermission(PERMISSIONS.analytics.view)
  );
  let canViewOverview = $derived(
    permissionsStore.isPermissionGlobal(PERMISSIONS.analytics.view)
  );
  let canViewDepartments = $derived(
    permissionsStore.hasPermission(PERMISSIONS.departments.view)
  );
  let canViewUsers = $derived(permissionsStore.canViewUsers());
  let canViewAiEngines = $derived(permissionsStore.canViewAiEngines());
  let canViewRoles = $derived(
    permissionsStore.hasPermission(PERMISSIONS.roles.view)
  );
  let canViewSettings = $derived(permissionsStore.canViewSsoProviders());
  
  // Update currentPath on navigation
  $effect(() => {
    const updatePath = () => {
      currentPath = window.location.pathname;
    };

    // Listen for browser back/forward
    window.addEventListener('popstate', updatePath);

    // Listen for pushState/replaceState (used by svelte-routing Link)
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function(...args) {
      originalPushState.apply(this, args);
      updatePath();
    };

    history.replaceState = function(...args) {
      originalReplaceState.apply(this, args);
      updatePath();
    };

    return () => {
      window.removeEventListener('popstate', updatePath);
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
    };
  });

  let menuItems = $derived([
    {
      id: 'chat',
      label: $_('sidebar.newChat'),
      icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>'
    },
  ]);

  // Admin menu structure with section headers
  interface AdminMenuItem {
    id: string;
    path?: string;
    label: string;
    icon?: string;
    type: 'section-header' | 'item';
  }

  const analyticsMenuItem: AdminMenuItem = {
    id: 'usage-analytics',
    path: '/admin/analytics',
    label: $_('sidebar.usageAnalytics'),
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"></path><path d="M18 17V9"></path><path d="M13 17V5"></path><path d="M8 17v-3"></path></svg>',
    type: 'item',
  };
  const overviewMenuItem: AdminMenuItem = {
    id: 'overview',
    path: '/admin/overview',
    label: $_('sidebar.overview'),
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>',
    type: 'item',
  };
  const departmentsMenuItem: AdminMenuItem = {
    id: 'departments',
    path: '/admin/departments',
    label: $_('admin.departments.title'),
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>',
    type: 'item',
  };
  const usersMenuItem: AdminMenuItem = {
    id: 'users',
    path: '/admin/users',
    label: $_('sidebar.users'),
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>',
    type: 'item',
  };
  const aiEnginesMenuItem: AdminMenuItem = {
    id: 'ai-engines',
    path: '/admin/ai-engines',
    label: $_('sidebar.aiEngines'),
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"></path><path d="M2 17l10 5 10-5"></path><path d="M2 12l10 5 10-5"></path></svg>',
    type: 'item',
  };
  const manageSectionItem: AdminMenuItem = {
    id: 'section-manage',
    label: $_('sidebar.sectionManage'),
    type: 'section-header',
  };
  const configureSectionItem: AdminMenuItem = {
    id: 'section-configure',
    label: $_('sidebar.sectionConfigure'),
    type: 'section-header',
  };
  const settingsSectionItem: AdminMenuItem = {
    id: 'settings',
    path: '/admin/settings',
    label: $_('sidebar.settings'),
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M12 8a4 4 0 0 1 4 4a4 4 0 0 1-4 4a4 4 0 0 1-4-4a4 4 0 0 1 4-4m0 2a2 2 0 0 0-2 2a2 2 0 0 0 2 2a2 2 0 0 0 2-2a2 2 0 0 0-2-2m-2 12c-.25 0-.46-.18-.5-.42l-.37-2.65c-.63-.25-1.17-.59-1.69-.99l-2.49 1.01c-.22.08-.49 0-.61-.22l-2-3.46a.493.493 0 0 1 .12-.64l2.11-1.66L4.5 12l.07-1l-2.11-1.63a.493.493 0 0 1-.12-.64l2-3.46c.12-.22.39-.31.61-.22l2.49 1c.52-.39 1.06-.73 1.69-.98l.37-2.65c.04-.24.25-.42.5-.42h4c.25 0 .46.18.5.42l.37 2.65c.63.25 1.17.59 1.69.98l2.49-1c.22-.09.49 0 .61.22l2 3.46c.13.22.07.49-.12.64L19.43 11l.07 1l-.07 1l2.11 1.63c.19.15.25.42.12.64l-2 3.46c-.12.22-.39.31-.61.22l-2.49-1c-.52.39-1.06.73-1.69.98l-.37 2.65c-.04.24-.25.42-.5.42zm1.25-18l-.37 2.61c-1.2.25-2.26.89-3.03 1.78L5.44 7.35l-.75 1.3L6.8 10.2a5.55 5.55 0 0 0 0 3.6l-2.12 1.56l.75 1.3l2.43-1.04c.77.88 1.82 1.52 3.01 1.76l.37 2.62h1.52l.37-2.61c1.19-.25 2.24-.89 3.01-1.77l2.43 1.04l.75-1.3l-2.12-1.55c.4-1.17.4-2.44 0-3.61l2.11-1.55l-.75-1.3l-2.41 1.04a5.42 5.42 0 0 0-3.03-1.77L12.75 4z"/></svg>',
    type: 'item',
  };
  const accessControlMenuItem: AdminMenuItem = {
    id: 'access-control',
    path: '/admin/access-control',
    label: $_('sidebar.accessControl'),
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>',
    type: 'item',
  };

  function isMenuItem(value: AdminMenuItem | null): value is AdminMenuItem {
    return value !== null;
  }

  let manageItems = $derived<AdminMenuItem[]>(
    [
      canViewUsers ? usersMenuItem : null,
      canViewDepartments ? departmentsMenuItem : null,
      canViewAiEngines ? aiEnginesMenuItem : null,
      canViewAnalytics ? analyticsMenuItem : null,
    ].filter(isMenuItem),
  );

  let configureItems = $derived<AdminMenuItem[]>(
    [canViewRoles ? accessControlMenuItem : null].filter(isMenuItem),
  );

  let adminMenuItems = $derived<AdminMenuItem[]>([
    // Overview dashboard (standalone at top)
    ...(canViewOverview ? [overviewMenuItem] : []),
    // MANAGE section
    ...(manageItems.length ? [manageSectionItem, ...manageItems] : []),
    // CONFIGURE section
    ...(configureItems.length
      ? [configureSectionItem, ...configureItems]
      : []),
    // SETTINGS section
    ...(canViewSettings ? [settingsSectionItem] : []),
  ]);

  let activeItem = $state('chat');

  // Chat data from API
  let chatHistory = $state<any[]>([]);
  let loadingChats = $state(false);
  let loadingMoreChats = $state(false);
  let searchQuery = $state('');
  let searchFocused = $state(false);
  const CHAT_PAGE_LIMIT = 20;
  let chatOffset = $state(0);
  let chatHasMore = $state(true);
  let chatTotal = $state<number | null>(null);
  let chatContainerElement = $state<HTMLElement | null>(null);
  let renameChatId = $state<string | null>(null);
  let renameTitle = $state('');
  let renamingChat = $state(false);
  let renameInputElement = $state<HTMLInputElement | null>(null);

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
    if(initializingConversation) return;
    
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

  async function openRenameDialog(chat: any) {
    renameChatId = chat.id;
    renameTitle = chat.title;
    activeChatMenu = null;
    await tick();
    renameInputElement?.focus();
  }

  function cancelRename() {
    renameChatId = null;
    renameTitle = '';
  }

  async function confirmRenameChat() {
    if (!renameChatId) return;
    const trimmedTitle = renameTitle.trim();
    if (!trimmedTitle) {
      toast.error($_('sidebar.emptyChatTitle'));
      return;
    }

    renamingChat = true;
    try {
      const existingChat = chatHistory.find(chat => chat.id === renameChatId);
      const archivedState = existingChat?.archived ?? false;
      await renameConversation(renameChatId, { title: trimmedTitle, archived: archivedState });
      chatHistory = chatHistory.map(chat =>
        chat.id === renameChatId ? { ...chat, title: trimmedTitle } : chat
      );
      toast.success(
        $_('sidebar.chatRenamed', {
          values: { title: trimmedTitle },
        })
      );
      cancelRename();
    } catch (error) {
      const errorMessage = error instanceof ApiError
        ? getLocalizedError(error, 'description', $_) || $_('sidebar.renameChatError')
        : $_('sidebar.renameChatError');
      toast.error(errorMessage);
    } finally {
      renamingChat = false;
    }
  }

  async function confirmDeleteChat() {
    if (chatToDelete) {
      deletingChat = true;
      try {
        await deleteConversation(chatToDelete);
        const deletedChat = chatHistory.find(chat => chat.id === chatToDelete);
        chatHistory = chatHistory.filter(chat => chat.id !== chatToDelete);
        chatOffset = chatHistory.length;
        if (chatTotal !== null) {
          chatTotal = Math.max(0, chatTotal - 1);
          chatHasMore = chatOffset < chatTotal;
        }
        showDeleteConfirmation = false;

        // Clear selection if deleted chat was selected
        if (selectedChatId === chatToDelete) {
          selectedChatId = null;
          const chatTitle = deletedChat?.title || $_('sidebar.chat');
          toast.success($_('sidebar.chatDeleted', { values: { title: `"${chatTitle}"` } }));
          // Navigate to fresh chat after deletion
          window.history.pushState({}, '', window.location.pathname);
          onnavigate?.('chat');
          collapseSidebarOnMobile();
        }

        chatToDelete = null;
      } catch (error) {
        console.error('Failed to delete conversation:', error);
        const errorMessage = error instanceof ApiError 
          ? getLocalizedError(error, 'description', $_) || $_('sidebar.deleteChatError')
          : $_('sidebar.deleteChatError');
        toast.error(errorMessage);
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
      chatOffset = chatHistory.length;
      if (chatTotal !== null) {
        chatTotal = Math.max(0, chatTotal - 1);
        chatHasMore = chatOffset < chatTotal;
      }
      toast.success($_('sidebar.chatArchived', { values: { title: `"${title}"` } }));
      
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
      const errorMessage = error instanceof ApiError 
        ? getLocalizedError(error, 'description', $_) || $_('sidebar.archiveChatError')
        : $_('sidebar.archiveChatError');
      toast.error(errorMessage);
    }
  }

  async function fetchChats({ reset = false } = {}) {
    try {
      const trimmedSearchQuery = searchQuery.trim();

      if (reset) {
        // show loading spinner if the chat history is empty
        if (chatHistory.length === 0) {
          loadingChats = true;
        }
        chatOffset = 0;
        chatTotal = null;
      } else {
        loadingMoreChats = true;
      }

      chatHasMore = false;
      const offset = reset ? 0 : chatOffset;
      const response = await listConversations({ offset, limit: CHAT_PAGE_LIMIT, search: trimmedSearchQuery});

      // if the search query has changed, ignore the response
      if (searchQuery.trim() !== trimmedSearchQuery) {
        return;
      }
      
      const responseChats = Array.isArray(response) ? response : response?.conversations ?? [];
      const total = !Array.isArray(response) && typeof response?.total === 'number' ? response.total : null;

      const mappedChats = responseChats.map((chat: any) => ({
        id: chat.id,
        title: chat.title || $_('sidebar.untitledChat'),
        archived: chat.archived,
        createdAt: chat.created_at,
        lastMessageAt: chat.last_message_at,
        totalTokens: chat.total_tokens
      }));

      if (reset) {
        chatHistory = mappedChats;
      } else if (mappedChats.length > 0) {
        const existingIds = new Set(chatHistory.map(chat => chat.id));
        chatHistory = [...chatHistory, ...mappedChats.filter(chat => !existingIds.has(chat.id))];
      }

      chatOffset = offset + mappedChats.length;
      if (total !== null) {
        chatTotal = total;
        chatHasMore = chatOffset < total;
      } else {
        chatHasMore = mappedChats.length === CHAT_PAGE_LIMIT;
      }
    } catch (error) {
      console.error('Failed to fetch chats:', error);
    } finally {
      loadingChats = false;
      loadingMoreChats = false;
      await tick();
      ensureChatListFilled();
    }
  }

  function loadMoreChats() {
    if (loadingMoreChats || loadingChats || !chatHasMore) return;
    fetchChats({ reset: false });
  }

  function ensureChatListFilled() {
    if (
      !chatContainerElement ||
      !chatHasMore ||
      loadingChats ||
      loadingMoreChats
    ) {
      return;
    }

    const isScrollable =
      chatContainerElement.scrollHeight > chatContainerElement.clientHeight;
    if (!isScrollable) {
      loadMoreChats();
    }
  }

  function handleChatListScroll(event: Event) {
    const target = event.currentTarget as HTMLElement | null;
    if (!target) return;
    const nearBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - 160;
    if (nearBottom) {
      loadMoreChats();
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
    updateSelectedChatFromUrl();

    // Listen for chat history refresh events
    const handleRefreshChatHistory = () => {
      initializingConversation = false;
      fetchChats({ reset: true });
      updateSelectedChatFromUrl();
    };

    // Listen for URL changes (popstate for back/forward navigation)
    const handlePopState = () => {
      updateSelectedChatFromUrl();
    };

    // Listen for starting new conversation events
    function handleInitializingConversation() {
      initializingConversation = true;
    }

    window.addEventListener('refreshChatHistory', handleRefreshChatHistory);
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('initializingConversation', handleInitializingConversation);

    return () => {
      window.removeEventListener('refreshChatHistory', handleRefreshChatHistory);
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('initializingConversation', handleInitializingConversation);
    };
  });

  // Listen for search query changes
  $effect(() => {
    // call the fetchChats function when the search query changes
    searchQuery;

    const searchTimeout = setTimeout(() => {  
      fetchChats({ reset: true });
    }, 200);

    return () => {
      clearTimeout(searchTimeout);
    };
  });
</script>

<svelte:window onclick={handleClickOutside} onresize={handleResize} />

<aside class="sidebar" class:collapsed={isCollapsed}>
  <div class="sidebar-elevated-top">
    <div class="sidebar-header">
    <div class="sidebar-brand">
      {#if !isCollapsed}
        <img src={grenginLogo} alt="Grengin" class="brand-logo" />
        <div class="spacer"></div>
        <button
          class="burger-btn"
          onclick={toggleSidebar}
          aria-label={$_('sidebar.toggleSidebar')}
          title={$_('sidebar.toggleSidebar')}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" data-rtl-flip="" class="icon max-md:hidden"><path d="M6.83496 3.99992C6.38353 4.00411 6.01421 4.0122 5.69824 4.03801C5.31232 4.06954 5.03904 4.12266 4.82227 4.20012L4.62207 4.28606C4.18264 4.50996 3.81498 4.85035 3.55859 5.26848L3.45605 5.45207C3.33013 5.69922 3.25006 6.01354 3.20801 6.52824C3.16533 7.05065 3.16504 7.71885 3.16504 8.66301V11.3271C3.16504 12.2712 3.16533 12.9394 3.20801 13.4618C3.25006 13.9766 3.33013 14.2909 3.45605 14.538L3.55859 14.7216C3.81498 15.1397 4.18266 15.4801 4.62207 15.704L4.82227 15.79C5.03904 15.8674 5.31234 15.9205 5.69824 15.9521C6.01398 15.9779 6.383 15.986 6.83398 15.9902L6.83496 3.99992ZM18.165 11.3271C18.165 12.2493 18.1653 12.9811 18.1172 13.5702C18.0745 14.0924 17.9916 14.5472 17.8125 14.9648L17.7295 15.1415C17.394 15.8 16.8834 16.3511 16.2568 16.7353L15.9814 16.8896C15.5157 17.1268 15.0069 17.2285 14.4102 17.2773C13.821 17.3254 13.0893 17.3251 12.167 17.3251H7.83301C6.91071 17.3251 6.17898 17.3254 5.58984 17.2773C5.06757 17.2346 4.61294 17.1508 4.19531 16.9716L4.01855 16.8896C3.36014 16.5541 2.80898 16.0434 2.4248 15.4169L2.27051 15.1415C2.03328 14.6758 1.93158 14.167 1.88281 13.5702C1.83468 12.9811 1.83496 12.2493 1.83496 11.3271V8.66301C1.83496 7.74072 1.83468 7.00898 1.88281 6.41985C1.93157 5.82309 2.03329 5.31432 2.27051 4.84856L2.4248 4.57317C2.80898 3.94666 3.36012 3.436 4.01855 3.10051L4.19531 3.0175C4.61285 2.83843 5.06771 2.75548 5.58984 2.71281C6.17898 2.66468 6.91071 2.66496 7.83301 2.66496H12.167C13.0893 2.66496 13.821 2.66468 14.4102 2.71281C15.0069 2.76157 15.5157 2.86329 15.9814 3.10051L16.2568 3.25481C16.8833 3.63898 17.394 4.19012 17.7295 4.84856L17.8125 5.02531C17.9916 5.44285 18.0745 5.89771 18.1172 6.41985C18.1653 7.00898 18.165 7.74072 18.165 8.66301V11.3271ZM8.16406 15.995H12.167C13.1112 15.995 13.7794 15.9947 14.3018 15.9521C14.8164 15.91 15.1308 15.8299 15.3779 15.704L15.5615 15.6015C15.9797 15.3451 16.32 14.9774 16.5439 14.538L16.6299 14.3378C16.7074 14.121 16.7605 13.8478 16.792 13.4618C16.8347 12.9394 16.835 12.2712 16.835 11.3271V8.66301C16.835 7.71885 16.8347 7.05065 16.792 6.52824C16.7605 6.14232 16.7073 5.86904 16.6299 5.65227L16.5439 5.45207C16.32 5.01264 15.9796 4.64498 15.5615 4.3886L15.3779 4.28606C15.1308 4.16013 14.8165 4.08006 14.3018 4.03801C13.7794 3.99533 13.1112 3.99504 12.167 3.99504H8.16406C8.16407 3.99667 8.16504 3.99829 8.16504 3.99992L8.16406 15.995Z"></path></svg>
        </button>
        {:else}
        <div class="collapsed-logo-container">
          <button
            class="logo-btn"
            onclick={toggleSidebar}
            aria-label={$_('sidebar.toggleSidebar')}
            title={$_('sidebar.toggleSidebar')}
          >
            <img src="/grengin-icon.svg" alt="Grengin" class="logo-icon" />
          </button>
          <button
            class="expand-btn"
            onclick={toggleSidebar}
            aria-label={$_('sidebar.expandSidebar')}
            title={$_('sidebar.expandSidebar')}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
              <path d="M6.83496 3.99992C6.38353 4.00411 6.01421 4.0122 5.69824 4.03801C5.31232 4.06954 5.03904 4.12266 4.82227 4.20012L4.62207 4.28606C4.18264 4.50996 3.81498 4.85035 3.55859 5.26848L3.45605 5.45207C3.33013 5.69922 3.25006 6.01354 3.20801 6.52824C3.16533 7.05065 3.16504 7.71885 3.16504 8.66301V11.3271C3.16504 12.2712 3.16533 12.9394 3.20801 13.4618C3.25006 13.9766 3.33013 14.2909 3.45605 14.538L3.55859 14.7216C3.81498 15.1397 4.18266 15.4801 4.62207 15.704L4.82227 15.79C5.03904 15.8674 5.31234 15.9205 5.69824 15.9521C6.01398 15.9779 6.383 15.986 6.83398 15.9902L6.83496 3.99992ZM18.165 11.3271C18.165 12.2493 18.1653 12.9811 18.1172 13.5702C18.0745 14.0924 17.9916 14.5472 17.8125 14.9648L17.7295 15.1415C17.394 15.8 16.8834 16.3511 16.2568 16.7353L15.9814 16.8896C15.5157 17.1268 15.0069 17.2285 14.4102 17.2773C13.821 17.3254 13.0893 17.3251 12.167 17.3251H7.83301C6.91071 17.3251 6.17898 17.3254 5.58984 17.2773C5.06757 17.2346 4.61294 17.1508 4.19531 16.9716L4.01855 16.8896C3.36014 16.5541 2.80898 16.0434 2.4248 15.4169L2.27051 15.1415C2.03328 14.6758 1.93158 14.167 1.88281 13.5702C1.83468 12.9811 1.83496 12.2493 1.83496 11.3271V8.66301C1.83496 7.74072 1.83468 7.00898 1.88281 6.41985C1.93157 5.82309 2.03329 5.31432 2.27051 4.84856L2.4248 4.57317C2.80898 3.94666 3.36012 3.436 4.01855 3.10051L4.19531 3.0175C4.61285 2.83843 5.06771 2.75548 5.58984 2.71281C6.17898 2.66468 6.91071 2.66496 7.83301 2.66496H12.167C13.0893 2.66496 13.821 2.66468 14.4102 2.71281C15.0069 2.76157 15.5157 2.86329 15.9814 3.10051L16.2568 3.25481C16.8833 3.63898 17.394 4.19012 17.7295 4.84856L17.8125 5.02531C17.9916 5.44285 18.0745 5.89771 18.1172 6.41985C18.1653 7.00898 18.165 7.74072 18.165 8.66301V11.3271ZM8.16406 15.995H12.167C13.1112 15.995 13.7794 15.9947 14.3018 15.9521C14.8164 15.91 15.1308 15.8299 15.3779 15.704L15.5615 15.6015C15.9797 15.3451 16.32 14.9774 16.5439 14.538L16.6299 14.3378C16.7074 14.121 16.7605 13.8478 16.792 13.4618C16.8347 12.9394 16.835 12.2712 16.835 11.3271V8.66301C16.835 7.71885 16.8347 7.05065 16.792 6.52824C16.7605 6.14232 16.7073 5.86904 16.6299 5.65227L16.5439 5.45207C16.32 5.01264 15.9796 4.64498 15.5615 4.3886L15.3779 4.28606C15.1308 4.16013 14.8165 4.08006 14.3018 4.03801C13.7794 3.99533 13.1112 3.99504 12.167 3.99504H8.16406C8.16407 3.99667 8.16504 3.99829 8.16504 3.99992L8.16406 15.995Z"></path>
            </svg>
          </button>
        </div>
      {/if}
    </div>
  </div>

  <!-- Admin Header with back button -->
  {#if isAdminView}
    <div class="admin-sidebar-header">
      <div class="header-top">
        <button
          class="back-btn"
          onclick={() => window.location.href = '/'}
          title={$_('sidebar.backToChat')}
          aria-label={$_('sidebar.backToChat')}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12,19 5,12 12,5"></polyline>
          </svg>
        </button>
        {#if !isCollapsed}
          <h1 class="admin-title">{$_('sidebar.adminPanel')}</h1>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Sidebar Navigation -->
  {#if isAdminView}
    <nav class="sidebar-nav admin-sidebar-nav">
      {#each adminMenuItems as item}
        {#if item.type === 'section-header'}
          {#if !isCollapsed}
            <div class="section-header">
              <span>{item.label}</span>
            </div>
          {:else}
            <div class="section-divider"></div>
          {/if}
        {:else if item.path}
          <Link to={item.path}>
            <button
              class="sidebar-item"
              class:active={currentPath === item.path || currentPath.startsWith(item.path + '/')}
              title={item.label}
            >
              {#if item.icon}
                <span class="sidebar-icon">{@html item.icon}</span>
              {/if}
              <span class="sidebar-label">{item.label}</span>
            </button>
          </Link>
        {/if}
      {/each}
    </nav>
  {:else}
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

      <!-- Inline Search (non-scrollable) -->
      {#if !isCollapsed}
        <div class="chat-search-wrapper" class:expanded={searchQuery.length > 0 || searchFocused}>
          <div class="chat-search-container">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="search-icon">
              <circle cx="11" cy="11" r="8"/>
              <path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              type="text"
              placeholder={$_('sidebar.searchPlaceholder')}
              bind:value={searchQuery}
              class="chat-search-input"
              onkeydown={(event: KeyboardEvent) => {
                if (event.key === 'Escape') {
                  clearSearch();
                }
              }}
              onfocus={() => searchFocused = true}
              onblur={() => searchFocused = false}
              title={$_('sidebar.searchTitle')}
            />
            {#if searchQuery}
              <button class="clear-search-btn" onclick={clearSearch} aria-label={$_('sidebar.clearSearch')} title={$_('sidebar.clearSearch')}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            {/if}
          </div>
        </div>
      {/if}

    </nav>
  {/if}
  </div>

  <!-- Divider between elevated top and scrollable content -->
  {#if !isCollapsed}
    <div class="sidebar-divider"></div>
  {/if}

  <!-- Chat List Header (non-scrollable, but below the elevated area) -->
  {#if !isCollapsed && !isAdminView}
    <div class="chat-section-title">
      <span>
        {$_('sidebar.chats')}
        {#if chatTotal}
          ({chatTotal})
        {/if}
      </span>
    </div>
  {/if}

  <!-- Chat List Section (scrollable) -->
  {#if !isCollapsed && !isAdminView}
    <div class="chat-list-section" bind:this={chatContainerElement} onscroll={handleChatListScroll}>
      <div class="chat-list">
        {#if loadingChats}
          <div class="chat-loading">
            <div class="loading-spinner-small"></div>
            <span>{$_('sidebar.loadingChats')}</span>
          </div>
        {:else if chatHistory.length === 0}
          <div class="chat-empty">
            <span>{$_('sidebar.noChatsYet')}</span>
          </div>
        {:else if chatHistory.length === 0 && searchQuery}
          <div class="no-results">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/>
              <path d="m21 21-4.35-4.35"/>
            </svg>
            <span>{$_('sidebar.noChatsFound')}</span>
          </div>
        {:else}
          {#each chatHistory as chat (chat.id)}
            <div class="chat-item">
              {#if renameChatId === chat.id}
                <div class="chat-rename-form">
                  <input
                    class="chat-rename-input"
                    type="text"
                    bind:value={renameTitle}
                    bind:this={renameInputElement}
                    aria-label={$_('sidebar.renamePlaceholder')}
                    placeholder={$_('sidebar.renamePlaceholder')}
                    disabled={renamingChat}
                    onkeydown={(event: KeyboardEvent) => {
                      if (event.key === 'Escape') {
                        cancelRename();
                      } else if (event.key === 'Enter') {
                        confirmRenameChat();
                      }
                    }}
                    onblur={() => {
                      if (!renamingChat) {
                        cancelRename();
                      }
                    }}
                  />
                </div>
              {:else}
                <button
                  class="menu-item chat-item-btn"
                  class:selected={selectedChatId === chat.id}
                  onclick={() => selectChat(chat.id)}
                  title={chat.title}
                >
                  <span class="chat-item-title">{chat.title}</span>
                </button>
              {/if}
              <button
                class="chat-item-menu"
                onclick={(e) => {
                  e.stopPropagation();
                  if (renameChatId === chat.id) return;
                  toggleChatMenu(chat.id);
                }}
                title={$_('sidebar.chatOptions')}
                aria-expanded={activeChatMenu === chat.id}
                disabled={renameChatId === chat.id}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="1"></circle>
                  <circle cx="12" cy="5" r="1"></circle>
                  <circle cx="12" cy="19" r="1"></circle>
                </svg>
              </button>
              {#if activeChatMenu === chat.id && renameChatId !== chat.id}
                <div class="chat-dropdown" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="menu" tabindex="-1">
                  <button class="menu-item" onclick={() => openRenameDialog(chat)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M4 17.25V21h3.75L17.81 10.94l-3.75-3.75L4 17.25z"></path>
                      <path d="M20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z"></path>
                    </svg>
                    {$_('sidebar.rename')}
                  </button>
                  <button class="menu-item menu-item--danger" onclick={() => deleteChat(chat.id)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="3,6 5,6 21,6"></polyline>
                      <path d="m19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"></path>
                    </svg>
                    {$_('sidebar.delete')}
                  </button>
                  <button class="menu-item" onclick={() => archiveChat(chat.id, chat.title)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                    </svg>
                    {$_('sidebar.archive')}
                  </button>
                </div>
              {/if}
            </div>
          {/each}
          {#if loadingMoreChats && chatHistory.length > 0}
            <div class="chat-loading chat-loading-more">
              <div class="loading-spinner-small"></div>
              <span>{$_('sidebar.loadingChats')}</span>
            </div>
          {/if}
        {/if}
      </div>
    </div>
  {/if}

  <div class="sidebar-elevated-bottom">
    <div class="sidebar-footer">
      <div class="user-menu-container" bind:this={userMenuElement}>
        <button
          class="user-menu-trigger sidebar-item"
          onclick={toggleUserMenu}
          title={$_('sidebar.userMenu')}
        >
          <div class="user-avatar">
            <div class="user-initials" style="background-color: {getUserColor()};">
              {getUserInitials()}
            </div>
          </div>
          {#if !isCollapsed}
            <div class="user-info">
              <span class="user-name">{user?.name || $_('sidebar.user')}</span>
            </div>
            <svg class="dropdown-arrow" class:rotated={showUserMenu} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6,15 12,9 18,15"/>
            </svg>
          {/if}
        </button>
      </div>
    </div>
  </div>
</aside>


{#if showUserMenu}
  <div class="user-menu-dropdown">
    <button class="menu-item">
      <span class="user-menu-icon">⚙️</span>
      <span>{$_('sidebar.settings')}</span>
    </button>
    {#if hasAdminPermissions}
      <a href="/admin" class="menu-item">
        <span class="menu-item-icon">🔒</span>
        <span class="menu-item-label">{$_('sidebar.admin')}</span>
      </a>
    {/if}
    <button class="menu-item menu-item--danger" onclick={handleLogout}>
      <svg class="user-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
        <polyline points="16,17 21,12 16,7"/>
        <line x1="21" y1="12" x2="9" y2="12"/>
      </svg>
      <span>{$_('sidebar.signOut')}</span>
    </button>
  </div>
{/if}

<!-- Delete Confirmation Dialog -->
{#if showDeleteConfirmation}
  <div class="confirmation-overlay" role="dialog" aria-modal="true" aria-labelledby="delete-title">
    <div class="confirmation-dialog">
      <div class="confirmation-header">
        <h3 id="delete-title">{$_('sidebar.deleteChat')}</h3>
        <button class="close-btn" onclick={cancelDeleteChat} aria-label={$_('sidebar.close')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="confirmation-content">
        <p>{$_('sidebar.deleteChatConfirm')}</p>
      </div>
      <div class="confirmation-actions">
        <button class="cancel-btn" onclick={cancelDeleteChat} disabled={deletingChat}>
          {$_('sidebar.cancel')}
        </button>
        <button class="delete-btn" onclick={confirmDeleteChat} disabled={deletingChat}>
          {#if deletingChat}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spinner">
              <circle cx="12" cy="12" r="10" opacity="0.25"></circle>
              <path d="M12 2a10 10 0 0 1 10 10" opacity="0.75"></path>
            </svg> &nbsp;
            {$_('sidebar.deleting')}
          {:else}
            {$_('sidebar.delete')}
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  /* ===== Sidebar Container (Layer 1 - floats above main content) ===== */
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

    /* Liquid Glass Layer 1 - Primary navigation surface */
    background: var(--bg-primary);
    border-right: 1px solid var(--glass-stroke-dark);
    box-shadow: var(--glass-shadow-dark);
  }

  .sidebar.collapsed {
    width: 72px;
  }

  /* Hide sidebar scrollbar - only chat-list-section should scroll */
  .sidebar::-webkit-scrollbar {
    display: none;
  }

  .sidebar {
    scrollbar-width: none; /* Firefox */
    -ms-overflow-style: none; /* IE/Edge */
  }

  /* ===== Elevated Sections (Liquid Glass Layer 2 - floats above sidebar content) ===== */
  .sidebar-elevated-top,
  .sidebar-elevated-bottom {
    position: relative;
    z-index: 2;

    /* Liquid Glass Layer 2 - Subtle elevation using glass background */
    background: var(--glass-bg-light);
  }

  .sidebar-elevated-top {
    /* Soft downward shadow with highlight edge */
    box-shadow:
      0 4px 16px -8px rgba(0, 0, 0, 0.15),
      var(--glass-highlight);
  }

  .sidebar-elevated-bottom {
    margin-top: auto;
    /* Soft upward shadow with highlight edge */
    box-shadow:
      0 -4px 16px -8px rgba(0, 0, 0, 0.15),
      inset 0 1px 0 rgba(255, 255, 255, 0.08);
  }

  .sidebar-divider {
    display: none;
  }

  /* ===== Sidebar Header ===== */
  .sidebar-header {
    padding: var(--space-lg) var(--space-lg);
  }

  .collapsed .sidebar-header {
    padding: var(--space-lg) var(--space-sm);
  }

  /* ===== Admin Sidebar Header ===== */
  .admin-sidebar-header {
    padding: 1rem 1rem 0 1rem;
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
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 2px 8px rgba(0, 0, 0, 0.08);
    flex-shrink: 0;
  }

  .back-btn:hover {
    background: rgba(var(--glass-tint), 0.12);
    border-color: var(--link-color);
    color: var(--link-color);
    transform: translateY(-1px);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.15), 0 4px 16px rgba(0, 0, 0, 0.12);
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

  .admin-sidebar-nav {
    flex: 1;
  }

  .admin-sidebar-nav a {
    text-decoration: none;
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
    background: var(--btn-tertiary);
    border-radius: var(--radius-full);
    color: var(--text-secondary);
    cursor: pointer;
    opacity: 0;
    transition: all 0.25s ease;
    z-index: 10;
    box-shadow: none;
    backdrop-filter: none;
  }

  .collapsed-logo-container:hover .logo-btn {
    opacity: 0;
  }

  .collapsed-logo-container:hover .expand-btn {
    opacity: 1;
  }

  .expand-btn:hover {
    background: var(--btn-quaternary);
    color: var(--brand);
    transform: scale(1.05);
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
    background: var(--btn-tertiary);
    border-radius: var(--radius-full);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    flex-shrink: 0;
    box-shadow: none;
    backdrop-filter: none;
  }

  .burger-btn:hover {
    background: var(--btn-quaternary);
    color: var(--brand);
    transform: scale(1.05);
  }

  .burger-btn:active {
    transform: scale(0.95);
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
    background: transparent;
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: none;
    backdrop-filter: none;
  }

  .logo-btn:hover {
    background: var(--btn-tertiary);
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
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: left;
    border-radius: 0;
    box-shadow: none;
    backdrop-filter: none;
  }

  .sidebar-item:hover {
    background: var(--btn-tertiary);
    color: var(--text-primary);
    font-weight: 500;
    border-radius: var(--radius-md);
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

  .chat-list-section {
    scrollbar-width: thin; /* Firefox */
    scrollbar-color: transparent transparent; /* Firefox - hidden by default */
  }

  .chat-list-section:hover {
    scrollbar-color: var(--glass-stroke-light) transparent; /* Firefox - show on hover */
  }

  .chat-list-section::-webkit-scrollbar {
    width: 4px;
  }

  .chat-list-section::-webkit-scrollbar-track {
    background: transparent;
  }

  .chat-list-section::-webkit-scrollbar-thumb {
    background: transparent;
    border-radius: 2px;
    transition: background 0.2s ease;
  }

  .chat-list-section:hover::-webkit-scrollbar-thumb {
    background: var(--glass-stroke-light);
  }

  .chat-section-title {
    padding: var(--space-sm) var(--space-md);
    margin-top: var(--space-sm);
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

  .chat-rename-form {
    flex: 1;
    padding-right: 35px;
  }

  .chat-rename-input {
    width: 100%;
    padding: var(--space-sm);
    border: 1px solid var(--glass-stroke-dark);
    border-radius: var(--radius-sm);
    background: var(--btn-secondary);
    color: var(--text-primary);
    font-size: 0.85rem;
  }

  .chat-rename-input:focus {
    border-color: var(--brand);
    outline: none;
    box-shadow: inset -1px -1px 0 rgba(255, 255, 255, 0.2), inset 1px 1px 8px rgba(0, 0, 0, 0.2);
    background: var(--bg-primary);
  }

  .chat-loading-more {
    justify-content: center;
    padding: var(--space-xs) 0 var(--space-md);
  }

  .chat-item {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .chat-item-btn {
    flex: 1;
    min-width: 0;
    color: var(--text-secondary);
  }

  .chat-item-title {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding-right: var(--space-sm);
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
    border-radius: var(--radius-full);
    opacity: 0;
    pointer-events: none;
    transition: all 0.2s ease;
    box-shadow: none;
    backdrop-filter: none;
    right: 0px;
  }

  .chat-item:hover .chat-item-menu,
  .chat-item-menu[aria-expanded="true"] {
    opacity: 1;
    pointer-events: auto;
  }

  .chat-item-menu:hover {
    background: var(--btn-quaternary);
    color: var(--brand);
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


  .chat-empty {
    padding: var(--space-xl) var(--space-md);
    text-align: center;
    color: var(--text-secondary);
    font-size: 0.8125rem;
  }

  /* ===== Sidebar Footer ===== */
  .sidebar-footer {
    padding: var(--space-sm) var(--space-lg);
  }

  .collapsed .sidebar-footer {
    padding: var(--space-sm);
  }

  .user-menu-container {
    position: relative;
  }

  .user-menu-trigger {
    width: 100%;
    padding: 0;
    background: transparent;
    border-radius: var(--radius-md);
    justify-content: flex-start;
    gap: var(--space-md);
  }

  .user-menu-trigger:hover {
    background: transparent;
  }

  .collapsed .user-menu-trigger {
    justify-content: center;
    padding: 0;
  }

  .user-avatar {
    width: 28px;
    height: 28px;
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
    font-size: 0.6875rem;
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
    bottom: 3rem;
    left: var(--space-lg);
    min-width: 200px;
    background: color-mix(in oklab, var(--bg-primary) 85%, var(--btn-secondary));
    backdrop-filter: blur(calc(var(--glass-blur) * 1.5)) saturate(1.5);
    -webkit-backdrop-filter: blur(calc(var(--glass-blur) * 1.5)) saturate(1.5);
    border: 1px solid var(--glass-stroke-light);
    border-radius: var(--radius-lg);
    box-shadow:
      0 0 0 1px var(--glass-edge-glow),
      0 4px 12px rgba(0, 0, 0, 0.15),
      0 12px 28px rgba(0, 0, 0, 0.2),
      0 20px 48px rgba(0, 0, 0, 0.15),
      var(--glass-highlight),
      inset 0 0 20px rgba(255, 255, 255, 0.02);
    padding: var(--space-sm);
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

  .user-menu-icon {
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  /* ===== Inline Search ===== */
  .chat-search-wrapper {
    padding: 0 var(--space-md);
    margin-top: var(--space-sm);
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

  /* ===== Section Headers ===== */
  .section-header {
    padding: var(--space-lg) var(--space-lg) var(--space-sm) var(--space-lg);
    margin-top: var(--space-sm);
  }

  .section-header:first-child {
    margin-top: 0;
    padding-top: var(--space-sm);
  }

  .section-header span {
    font-size: 0.6875rem;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .section-divider {
    height: 1px;
    background: var(--glass-stroke-dark);
    margin: var(--space-md) var(--space-md);
  }

  .section-divider:first-child {
    display: none;
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
