<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { navigate } from 'svelte-routing';
  import { _ } from 'svelte-i18n';
  import { tick } from 'svelte';
  import Modal from '$lib/admin/components/Modal.svelte';
  import {
    listConversations,
    deleteConversation,
    archiveConversation,
    renameConversation,
    pinConversation,
  } from '../../api/chatApi.js';
  import { ApiError } from '../../api/client';
  import { getLocalizedError } from '../../utils/errorLocalization';
  import { toast } from '../Toaster.svelte';

  interface Props {
    isCollapsed: boolean;
    currentPath: string;
    onCollapseSidebar: () => void;
  }

  let { isCollapsed, currentPath, onCollapseSidebar }: Props = $props();

  let activeChatMenu = $state<string | null>(null);
  let showDeleteConfirmation = $state(false);
  let selectedChatId = $state<string | null>(null);
  let initializingConversation = $state(false);
  let chatToDelete = $state<string | null>(null);
  let deletingChat = $state(false);
  let showPinned = $state(true);

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
  let searchOpen = $state(false);
  let searchInputElement = $state<HTMLInputElement | null>(null);

  let pinnedChats = $derived(chatHistory.filter((chat) => chat.pinned));
  let unpinnedChats = $derived(chatHistory.filter((chat) => !chat.pinned));

  // Group the unpinned chat list into time buckets (Today / Yesterday / This Week /
  // Earlier) to match the "Recent" section in the design. Chats arrive newest
  // first from the API, so within each bucket the order is preserved.
  function startOfToday(): number {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  let chatGroups = $derived.by(() => {
    const todayStart = startOfToday();
    const yesterdayStart = todayStart - 86_400_000;
    const weekStart = todayStart - 6 * 86_400_000;

    const buckets: Record<string, any[]> = {
      today: [],
      yesterday: [],
      week: [],
      earlier: [],
    };

    for (const chat of unpinnedChats) {
      const raw = chat.lastMessageAt || chat.createdAt;
      const t = raw ? new Date(raw).getTime() : 0;
      if (Number.isNaN(t) || t === 0) buckets.earlier.push(chat);
      else if (t >= todayStart) buckets.today.push(chat);
      else if (t >= yesterdayStart) buckets.yesterday.push(chat);
      else if (t >= weekStart) buckets.week.push(chat);
      else buckets.earlier.push(chat);
    }

    const labels: Record<string, string> = {
      today: $_('sidebar.today'),
      yesterday: $_('sidebar.yesterday'),
      week: $_('sidebar.thisWeek'),
      earlier: $_('sidebar.earlier'),
    };

    return (['today', 'yesterday', 'week', 'earlier'] as const)
      .filter((key) => buckets[key].length > 0)
      .map((key) => ({ key, label: labels[key], chats: buckets[key] }));
  });

  function goToRecent() {
    navigate('/');
    onCollapseSidebar();
  }

  function toggleChatMenu(chatId: string) {
    activeChatMenu = activeChatMenu === chatId ? null : chatId;
  }

  function selectChat(chatId: string) {
    if (initializingConversation) return;

    selectedChatId = chatId;
    navigate(`/?chatId=${chatId}`);
    activeChatMenu = null;
    onCollapseSidebar();
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
      const existingChat = chatHistory.find((chat) => chat.id === renameChatId);
      const archivedState = existingChat?.archived ?? false;
      await renameConversation(renameChatId, { title: trimmedTitle, archived: archivedState });
      chatHistory = chatHistory.map((chat) =>
        chat.id === renameChatId ? { ...chat, title: trimmedTitle } : chat,
      );
      toast.success(
        $_('sidebar.chatRenamed', {
          values: { title: trimmedTitle },
        }),
      );
      cancelRename();
    } catch (error) {
      const errorMessage =
        error instanceof ApiError
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
        const deletedChat = chatHistory.find((chat) => chat.id === chatToDelete);
        chatHistory = chatHistory.filter((chat) => chat.id !== chatToDelete);
        chatOffset = chatHistory.length;
        if (chatTotal !== null) {
          chatTotal = Math.max(0, chatTotal - 1);
          chatHasMore = chatOffset < chatTotal;
        }
        showDeleteConfirmation = false;

        if (selectedChatId === chatToDelete) {
          selectedChatId = null;
          const chatTitle = deletedChat?.title || $_('sidebar.chat');
          toast.success($_('sidebar.chatDeleted', { values: { title: `"${chatTitle}"` } }));
          navigate('/');
          onCollapseSidebar();
        }

        chatToDelete = null;
      } catch (error) {
        console.error('Failed to delete conversation:', error);
        const errorMessage =
          error instanceof ApiError
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
    searchOpen = false;
  }

  function archiveChat(chatId: string, title: string) {
    archiveChatAction(chatId, title);
    activeChatMenu = null;
  }

  async function archiveChatAction(chatId: string, title: string) {
    try {
      await archiveConversation(chatId, title);
      chatHistory = chatHistory.filter((chat) => chat.id !== chatId);
      chatOffset = chatHistory.length;
      if (chatTotal !== null) {
        chatTotal = Math.max(0, chatTotal - 1);
        chatHasMore = chatOffset < chatTotal;
      }
      toast.success($_('sidebar.chatArchived', { values: { title: `"${title}"` } }));

      if (selectedChatId === chatId) {
        selectedChatId = null;
        navigate('/');
        onCollapseSidebar();
      }
    } catch (error) {
      console.error('Failed to archive conversation:', error);
      const errorMessage =
        error instanceof ApiError
          ? getLocalizedError(error, 'description', $_) || $_('sidebar.archiveChatError')
          : $_('sidebar.archiveChatError');
      toast.error(errorMessage);
    }
  }

  async function togglePinChat(chat: any) {
    const newPinned = !chat.pinned;
    const prevPinned = chat.pinned;
    activeChatMenu = null;

    // Optimistically update
    chatHistory = chatHistory.map((c) =>
      c.id === chat.id ? { ...c, pinned: newPinned } : c,
    );

    try {
      await pinConversation(chat.id, newPinned, chat.title, chat.archived ?? false);
      toast.success(
        newPinned
          ? $_('sidebar.chatPinned', { values: { title: `"${chat.title}"` } })
          : $_('sidebar.chatUnpinned', { values: { title: `"${chat.title}"` } }),
      );
    } catch (error) {
      // Rollback
      chatHistory = chatHistory.map((c) =>
        c.id === chat.id ? { ...c, pinned: prevPinned } : c,
      );
      const errorMessage =
        error instanceof ApiError
          ? getLocalizedError(error, 'description', $_) || (newPinned ? $_('sidebar.pinChatError') : $_('sidebar.unpinChatError'))
          : (newPinned ? $_('sidebar.pinChatError') : $_('sidebar.unpinChatError'));
      toast.error(errorMessage);
    }
  }

  async function fetchChats({ reset = false } = {}) {
    try {
      const trimmedSearchQuery = searchQuery.trim();

      if (reset) {
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
      const response = await listConversations({
        offset,
        limit: CHAT_PAGE_LIMIT,
        search: trimmedSearchQuery,
      });

      if (searchQuery.trim() !== trimmedSearchQuery) {
        return;
      }

      const responseChats = Array.isArray(response) ? response : response?.conversations ?? [];
      const total = !Array.isArray(response) && typeof response?.total === 'number' ? response.total : null;

      const mappedChats = responseChats.map((chat: any) => ({
        id: chat.id,
        title: chat.title || $_('sidebar.untitledChat'),
        archived: chat.archived,
        pinned: Boolean(chat.pinned),
        createdAt: chat.created_at,
        lastMessageAt: chat.last_message_at,
        totalTokens: chat.total_tokens,
      }));

      if (reset) {
        chatHistory = mappedChats;
      } else if (mappedChats.length > 0) {
        const existingIds = new Set(chatHistory.map((chat) => chat.id));
        chatHistory = [...chatHistory, ...mappedChats.filter((chat) => !existingIds.has(chat.id))];
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
    if (!chatContainerElement || !chatHasMore || loadingChats || loadingMoreChats) {
      return;
    }

    const isScrollable = chatContainerElement.scrollHeight > chatContainerElement.clientHeight;
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

  // The design draws one scrollbar for the whole section stack, so paging is
  // driven by the sidebar's scroll container rather than a nested list box.
  $effect(() => {
    const scroller = chatContainerElement?.closest('.sb-scroll') as HTMLElement | null;
    if (!scroller) return;
    scroller.addEventListener('scroll', handleChatListScroll);
    return () => scroller.removeEventListener('scroll', handleChatListScroll);
  });

  function handleWindowClick() {
    if (activeChatMenu) {
      activeChatMenu = null;
    }
  }

  function updateSelectedChatFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const chatId = params.get('chatId');
    selectedChatId = currentPath === '/' ? chatId : null;
  }

  $effect(() => {
    currentPath;
    void updateSelectedChatFromUrl();
  });

  // Broadcast the selected conversation's title so the chat view can mirror it in
  // the browser tab. Re-runs when the selection or the list changes, so renames
  // and the server-generated title of a brand-new chat propagate automatically.
  // Skip the placeholder title so the tab keeps the value the chat view already
  // resolved from the conversation detail.
  $effect(() => {
    const id = selectedChatId;
    if (!id) return;
    const selected = chatHistory.find((chat) => chat.id === id);
    const title = selected?.title;
    if (title && title !== $_('sidebar.untitledChat')) {
      window.dispatchEvent(
        new CustomEvent('conversationTitleChanged', { detail: { id, title } }),
      );
    }
  });

  $effect(() => {
    updateSelectedChatFromUrl();

    const handleRefreshChatHistory = () => {
      initializingConversation = false;
      fetchChats({ reset: true });
      updateSelectedChatFromUrl();
    };

    const handlePopState = () => {
      updateSelectedChatFromUrl();
    };

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

  $effect(() => {
    searchQuery;

    const searchTimeout = setTimeout(() => {
      fetchChats({ reset: true });
    }, 200);

    return () => {
      clearTimeout(searchTimeout);
    };
  });

  // The search box is revealed on demand from the sidebar header's search
  // button, which broadcasts this event.
  $effect(() => {
    const handleFocusSearch = async () => {
      searchOpen = true;
      await tick();
      searchInputElement?.focus();
    };
    window.addEventListener('focusChatSearch', handleFocusSearch);
    return () => {
      window.removeEventListener('focusChatSearch', handleFocusSearch);
    };
  });
</script>

<svelte:window onclick={handleWindowClick} />

{#if isCollapsed}
  <div class="collapsed-recent">
    <button
      class="rail-btn"
      class:active={currentPath === '/'}
      onclick={goToRecent}
      title={$_('sidebar.recent')}
      aria-label={$_('sidebar.recent')}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12,6 12,12 16,14" />
      </svg>
    </button>
  </div>
{:else}
  <!--
    Figma "Section - Pinned" (sidebar.html): PROJECTS / SHARED WITH ME /
    PINNED / RECENT are SIBLING sections, and PINNED sits above RECENT — it
    is not a child of it.
  -->
  {#if pinnedChats.length > 0 && !searchQuery}
    <section class="sb-section pinned-section" data-open={showPinned}>
      <button
        class="section-header"
        type="button"
        onclick={() => (showPinned = !showPinned)}
        aria-expanded={showPinned}
        aria-label={$_('sidebar.pinned')}
      >
        <span class="section-header__left section-header__left--tight">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M 5.305 5.195 L 5.254 4.446 L 5.305 5.195 Z M 6.165 4.57 L 5.469 4.29 L 6.165 4.57 Z M 2.303 7.125 L 1.822 7.7 L 2.303 7.125 Z M 2.876 5.359 L 2.927 6.108 L 2.876 5.359 Z M 4.499 9.697 L 3.772 9.514 L 4.499 9.697 Z M 4.171 8.685 L 3.69 9.261 L 4.171 8.685 Z M 5.407 13.148 L 5.008 12.513 L 5.407 13.148 Z M 11.829 8.685 L 12.31 9.261 L 11.829 8.685 Z M 11.501 9.697 L 10.774 9.88 L 11.501 9.697 Z M 13.697 7.125 L 13.217 6.549 L 13.697 7.125 Z M 9.835 4.57 L 10.531 4.29 L 9.835 4.57 Z M 8.928 2.311 L 9.624 2.031 L 8.928 2.311 Z M 8.928 2.311 L 8.232 2.59 L 9.139 4.849 L 9.835 4.57 L 10.531 4.29 L 9.624 2.031 L 8.928 2.311 Z M 10.695 5.195 L 10.645 5.943 L 13.073 6.108 L 13.124 5.359 L 13.175 4.611 L 10.746 4.446 L 10.695 5.195 Z M 13.697 7.125 L 13.217 6.549 L 11.349 8.11 L 11.829 8.685 L 12.31 9.261 L 14.178 7.7 L 13.697 7.125 Z M 11.501 9.697 L 10.774 9.88 L 11.367 12.24 L 12.095 12.057 L 12.822 11.874 L 12.228 9.514 L 11.501 9.697 Z M 10.593 13.148 L 10.992 12.513 L 8.93 11.219 L 8.532 11.854 L 8.133 12.489 L 10.194 13.783 L 10.593 13.148 Z M 7.468 11.854 L 7.07 11.219 L 5.008 12.513 L 5.407 13.148 L 5.806 13.783 L 7.867 12.489 L 7.468 11.854 Z M 3.905 12.057 L 4.633 12.24 L 5.226 9.88 L 4.499 9.697 L 3.772 9.514 L 3.178 11.874 L 3.905 12.057 Z M 4.171 8.685 L 4.651 8.11 L 2.783 6.549 L 2.303 7.125 L 1.822 7.7 L 3.69 9.261 L 4.171 8.685 Z M 2.876 5.359 L 2.927 6.108 L 5.355 5.943 L 5.305 5.195 L 5.254 4.446 L 2.825 4.611 L 2.876 5.359 Z M 6.165 4.57 L 6.861 4.849 L 7.768 2.59 L 7.072 2.311 L 6.376 2.031 L 5.469 4.29 L 6.165 4.57 Z M 5.305 5.195 L 5.355 5.943 C 6.026 5.898 6.611 5.473 6.861 4.849 L 6.165 4.57 L 5.469 4.29 C 5.433 4.379 5.35 4.44 5.254 4.446 L 5.305 5.195 Z M 2.303 7.125 L 2.783 6.549 C 2.61 6.404 2.702 6.123 2.927 6.108 L 2.876 5.359 L 2.825 4.611 C 1.251 4.718 0.611 6.689 1.822 7.7 L 2.303 7.125 Z M 4.499 9.697 L 5.226 9.88 C 5.39 9.228 5.167 8.54 4.651 8.11 L 4.171 8.685 L 3.69 9.261 C 3.763 9.322 3.795 9.421 3.772 9.514 L 4.499 9.697 Z M 5.407 13.148 L 5.008 12.513 C 4.817 12.633 4.578 12.459 4.633 12.24 L 3.905 12.057 L 3.178 11.874 C 2.793 13.404 4.47 14.622 5.806 13.783 L 5.407 13.148 Z M 8.532 11.854 L 8.93 11.219 C 8.362 10.861 7.638 10.861 7.07 11.219 L 7.468 11.854 L 7.867 12.489 C 7.948 12.438 8.052 12.438 8.133 12.489 L 8.532 11.854 Z M 12.095 12.057 L 11.367 12.24 C 11.422 12.459 11.183 12.633 10.992 12.513 L 10.593 13.148 L 10.194 13.783 C 11.53 14.622 13.207 13.404 12.822 11.874 L 12.095 12.057 Z M 11.829 8.685 L 11.349 8.11 C 10.833 8.54 10.61 9.228 10.774 9.88 L 11.501 9.697 L 12.228 9.514 C 12.205 9.421 12.237 9.322 12.31 9.261 L 11.829 8.685 Z M 13.124 5.359 L 13.073 6.108 C 13.298 6.123 13.39 6.404 13.217 6.549 L 13.697 7.125 L 14.178 7.7 C 15.389 6.689 14.749 4.718 13.175 4.611 L 13.124 5.359 Z M 9.835 4.57 L 9.139 4.849 C 9.389 5.473 9.974 5.898 10.645 5.943 L 10.695 5.195 L 10.746 4.446 C 10.65 4.44 10.567 4.379 10.531 4.29 L 9.835 4.57 Z M 8.928 2.311 L 9.624 2.031 C 9.036 0.568 6.964 0.568 6.376 2.031 L 7.072 2.311 L 7.768 2.59 C 7.852 2.381 8.148 2.381 8.232 2.59 L 8.928 2.311 Z" fill="currentColor" fill-rule="nonzero" />
          </svg>
          <span class="section-label">{$_('sidebar.pinned')}</span>
        </span>
        <svg class="chev" class:collapsed={!showPinned} width="5" height="2.500" viewBox="0 0 5 2.500" fill="none" aria-hidden="true">
          <path d="M 0.707 -0.707 C 0.317 -1.098 -0.317 -1.098 -0.707 -0.707 C -1.098 -0.317 -1.098 0.317 -0.707 0.707 L 0 0 L 0.707 -0.707 Z M 2.5 2.5 L 1.793 3.207 L 2.5 3.914 L 3.207 3.207 L 2.5 2.5 Z M 5.707 0.707 C 6.098 0.317 6.098 -0.317 5.707 -0.707 C 5.317 -1.098 4.683 -1.098 4.293 -0.707 L 5 0 L 5.707 0.707 Z M 0 0 L -0.707 0.707 L 1.793 3.207 L 2.5 2.5 L 3.207 1.793 L 0.707 -0.707 L 0 0 Z M 2.5 2.5 L 3.207 3.207 L 5.707 0.707 L 5 0 L 4.293 -0.707 L 1.793 1.793 L 2.5 2.5 Z" fill="currentColor" fill-rule="nonzero" />
        </svg>
      </button>
      {#if showPinned}
        <div class="sb-list">
          {#each pinnedChats as chat (chat.id)}
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
                  class="pinned-row"
                  class:pinned-row--current={selectedChatId === chat.id}
                  onclick={() => selectChat(chat.id)}
                  title={chat.title}
                >
                  <span class="row__main">
                    <span class="row__icon" aria-hidden="true">
                      <svg width="11" height="11" viewBox="0 0 10.834 10.290" fill="none">
                        <path d="M 2.615 8.667 L 2.615 7.917 L 2.615 7.917 L 2.615 8.667 Z M 1.849 8.984 L 2.38 9.514 L 2.38 9.514 L 1.849 8.984 Z M 0.657 10.177 L 1.187 10.707 L 1.187 10.707 L 0.657 10.177 Z M 0 9.905 L -0.75 9.905 L -0.75 9.905 L 0 9.905 Z M 1.083 0 L 1.083 -0.75 L 1.083 0 Z M 9.751 0 L 9.751 -0.75 L 9.751 0 Z M 10.834 7.583 L 10.084 7.583 C 10.084 7.672 10.049 7.757 9.987 7.819 L 10.517 8.349 L 11.047 8.88 C 11.391 8.536 11.584 8.07 11.584 7.583 L 10.834 7.583 Z M 10.517 8.349 L 9.987 7.819 C 9.924 7.882 9.839 7.917 9.751 7.917 L 9.751 8.667 L 9.751 9.417 C 10.237 9.417 10.703 9.224 11.047 8.88 L 10.517 8.349 Z M 9.751 8.667 L 9.751 7.917 L 2.615 7.917 L 2.615 8.667 L 2.615 9.417 L 9.751 9.417 L 9.751 8.667 Z M 2.615 8.667 L 2.615 7.917 C 2.129 7.917 1.663 8.11 1.319 8.454 L 1.849 8.984 L 2.38 9.514 C 2.442 9.452 2.527 9.417 2.616 9.417 L 2.615 8.667 Z M 1.849 8.984 L 1.319 8.454 L 0.126 9.647 L 0.657 10.177 L 1.187 10.707 L 2.38 9.514 L 1.849 8.984 Z M 0.657 10.177 L 0.126 9.646 C 0.177 9.595 0.242 9.561 0.313 9.547 L 0.46 10.282 L 0.606 11.018 C 0.826 10.974 1.028 10.866 1.187 10.707 L 0.657 10.177 Z M 0.46 10.282 L 0.313 9.547 C 0.384 9.532 0.458 9.54 0.524 9.567 L 0.237 10.26 L -0.05 10.953 C 0.158 11.039 0.386 11.061 0.606 11.018 L 0.46 10.282 Z M 0.237 10.26 L 0.524 9.567 C 0.591 9.595 0.648 9.642 0.688 9.702 L 0.065 10.119 L -0.559 10.535 C -0.434 10.722 -0.257 10.867 -0.05 10.953 L 0.237 10.26 Z M 0.065 10.119 L 0.688 9.702 C 0.729 9.762 0.75 9.833 0.75 9.905 L 0 9.905 L -0.75 9.905 C -0.75 10.129 -0.683 10.349 -0.559 10.535 L 0.065 10.119 Z M 0 9.905 L 0.75 9.905 L 0.75 1.083 L 0 1.083 L -0.75 1.083 L -0.75 9.905 L 0 9.905 Z M 0 1.083 L 0.75 1.083 C 0.75 0.995 0.785 0.91 0.848 0.848 L 0.317 0.317 L -0.213 -0.213 C -0.557 0.131 -0.75 0.597 -0.75 1.083 L 0 1.083 Z M 0.317 0.317 L 0.848 0.848 C 0.91 0.785 0.995 0.75 1.083 0.75 L 1.083 0 L 1.083 -0.75 C 0.597 -0.75 0.131 -0.557 -0.213 -0.213 L 0.317 0.317 Z M 1.083 0 L 1.083 0.75 L 9.751 0.75 L 9.751 0 L 9.751 -0.75 L 1.083 -0.75 L 1.083 0 Z M 9.751 0 L 9.751 0.75 C 9.839 0.75 9.924 0.785 9.987 0.848 L 10.517 0.317 L 11.047 -0.213 C 10.703 -0.557 10.237 -0.75 9.751 -0.75 L 9.751 0 Z M 10.517 0.317 L 9.987 0.848 C 10.049 0.91 10.084 0.995 10.084 1.083 L 10.834 1.083 L 11.584 1.083 C 11.584 0.597 11.391 0.131 11.047 -0.213 L 10.517 0.317 Z M 10.834 1.083 L 10.084 1.083 L 10.084 7.583 L 10.834 7.583 L 11.584 7.583 L 11.584 1.083 L 10.834 1.083 Z" fill="currentColor" fill-rule="nonzero" />
                      </svg>
                    </span>
                    <span class="row__label">{chat.title}</span>
                  </span>
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
                aria-label={$_('sidebar.chatOptions')}
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
                <div
                  class="chat-dropdown"
                  onclick={(e) => e.stopPropagation()}
                  onkeydown={(e) => e.stopPropagation()}
                  role="menu"
                  tabindex="-1"
                >
                  <button class="menu-item" onclick={() => togglePinChat(chat)} aria-label={$_('sidebar.unpin')} title={$_('sidebar.unpin')}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <line x1="2" y1="2" x2="22" y2="22"></line>
                      <path d="M12 17v5"></path>
                      <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17h12"></path>
                      <path d="M15 9.34V4a1 1 0 0 0-1-1H10a1 1 0 0 0-1 1v1.34"></path>
                    </svg>
                    {$_('sidebar.unpin')}
                  </button>
                  <button class="menu-item" onclick={() => openRenameDialog(chat)} aria-label={$_('sidebar.rename')} title={$_('sidebar.rename')}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                      <path d="M4 17.25V21h3.75L17.81 10.94l-3.75-3.75L4 17.25z"></path>
                      <path
                        d="M20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z"
                      ></path>
                    </svg>
                    {$_('sidebar.rename')}
                  </button>
                  <button class="menu-item menu-item--danger" onclick={() => deleteChat(chat.id)} aria-label={$_('sidebar.delete')} title={$_('sidebar.delete')}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                      <polyline points="3,6 5,6 21,6"></polyline>
                      <path d="m19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"></path>
                    </svg>
                    {$_('sidebar.delete')}
                  </button>
                  <button class="menu-item" onclick={() => archiveChat(chat.id, chat.title)} aria-label={$_('sidebar.archive')} title={$_('sidebar.archive')}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                    </svg>
                    {$_('sidebar.archive')}
                  </button>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </section>
  {/if}

  <!-- Figma "Section - Recent": header + day groups in one section stack -->
  <div class="recent-section">
    <div class="recent-header">
      <span class="section-icon" aria-hidden="true">
        <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5.99997 2.99973V5.99997L8.00013 7.00005M11.0004 5.99997C11.0004 8.76162 8.76162 11.0004 5.99997 11.0004C3.23833 11.0004 0.999573 8.76162 0.999573 5.99997C0.999573 3.23833 3.23833 0.999573 5.99997 0.999573C8.76162 0.999573 11.0004 3.23833 11.0004 5.99997Z" />
        </svg>
      </span>
      <span class="recent-title">{$_('sidebar.recent')}</span>
    </div>

    {#if searchOpen || searchQuery}
      <div class="chat-search-wrapper" class:expanded={searchQuery.length > 0 || searchFocused}>
        <div class="chat-search-container">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="search-icon"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder={$_('sidebar.searchPlaceholder')}
            bind:value={searchQuery}
            bind:this={searchInputElement}
            class="chat-search-input"
            aria-label={$_('sidebar.searchTitle')}
            title={$_('sidebar.searchTitle')}
            onkeydown={(event: KeyboardEvent) => {
              if (event.key === 'Escape') {
                clearSearch();
              }
            }}
            onfocus={() => (searchFocused = true)}
            onblur={() => {
              searchFocused = false;
              if (!searchQuery) searchOpen = false;
            }}
          />
          {#if searchQuery}
            <button
              class="clear-search-btn"
              onclick={clearSearch}
              aria-label={$_('sidebar.clearSearch')}
              title={$_('sidebar.clearSearch')}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          {/if}
        </div>
      </div>
    {/if}
    <div class="chat-list-section" bind:this={chatContainerElement}>
      <div class="chat-list">
        {#if loadingChats}
          <div class="chat-loading">
            <div class="loading-spinner-small"></div>
            <span>{$_('sidebar.loadingChats')}</span>
          </div>
        {:else if chatHistory.length === 0 && searchQuery}
          <div class="no-results">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <span>{$_('sidebar.noChatsFound')}</span>
          </div>
        {:else if chatHistory.length === 0}
          <div class="chat-empty">
            <span>{$_('sidebar.noChatsYet')}</span>
          </div>
        {:else}
          {#each chatGroups as group (group.key)}
            <div class="chat-time-group">
              <p class="chat-time-label">{group.label}</p>
              {#each group.chats as chat (chat.id)}
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
                      <span class="chat-status-dot" aria-hidden="true"></span>
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
                    aria-label={$_('sidebar.chatOptions')}
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
                    <div
                      class="chat-dropdown"
                      onclick={(e) => e.stopPropagation()}
                      onkeydown={(e) => e.stopPropagation()}
                      role="menu"
                      tabindex="-1"
                    >
                      <button class="menu-item" onclick={() => togglePinChat(chat)} aria-label={chat.pinned ? $_('sidebar.unpin') : $_('sidebar.pin')} title={chat.pinned ? $_('sidebar.unpin') : $_('sidebar.pin')}>
                        {#if chat.pinned}
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <line x1="2" y1="2" x2="22" y2="22"></line>
                            <path d="M12 17v5"></path>
                            <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17h12"></path>
                            <path d="M15 9.34V4a1 1 0 0 0-1-1H10a1 1 0 0 0-1 1v1.34"></path>
                          </svg>
                          {$_('sidebar.unpin')}
                        {:else}
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <path d="M12 17v5"></path>
                            <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17h14a2 2 0 0 0 1.89-1.76l-1.78-.9A2 2 0 0 1 15 12.5V4a1 1 0 0 0-1-1H10a1 1 0 0 0-1 1v6.76"></path>
                          </svg>
                          {$_('sidebar.pin')}
                        {/if}
                      </button>
                      <button class="menu-item" onclick={() => openRenameDialog(chat)} aria-label={$_('sidebar.rename')} title={$_('sidebar.rename')}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                          <path d="M4 17.25V21h3.75L17.81 10.94l-3.75-3.75L4 17.25z"></path>
                          <path
                            d="M20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z"
                          ></path>
                        </svg>
                        {$_('sidebar.rename')}
                      </button>
                      <button class="menu-item menu-item--danger" onclick={() => deleteChat(chat.id)} aria-label={$_('sidebar.delete')} title={$_('sidebar.delete')}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                          <polyline points="3,6 5,6 21,6"></polyline>
                          <path d="m19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"></path>
                        </svg>
                        {$_('sidebar.delete')}
                      </button>
                      <button class="menu-item" onclick={() => archiveChat(chat.id, chat.title)} aria-label={$_('sidebar.archive')} title={$_('sidebar.archive')}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                        </svg>
                        {$_('sidebar.archive')}
                      </button>
                    </div>
                  {/if}
                </div>
              {/each}
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
  </div>
{/if}

{#if showDeleteConfirmation}
  <Modal 
    isOpen={showDeleteConfirmation} 
    title={$_('sidebar.deleteChat')} 
    onclose={cancelDeleteChat}
  >
    {#snippet children()}
      <div class="confirmation-content">
        <p>{$_('sidebar.deleteChatConfirm')}</p>
      </div>
      <div class="confirmation-actions">
        <button class="cancel-btn" onclick={cancelDeleteChat} disabled={deletingChat} aria-label={$_('sidebar.cancel')}>
          {$_('sidebar.cancel')}
        </button>
        <button class="delete-btn" onclick={confirmDeleteChat} disabled={deletingChat} aria-label={deletingChat ? $_('sidebar.deleting') : $_('sidebar.delete')}>
          {#if deletingChat}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spinner" aria-hidden="true">
              <circle cx="12" cy="12" r="10" opacity="0.25"></circle>
              <path d="M12 2a10 10 0 0 1 10 10" opacity="0.75"></path>
            </svg> &nbsp;
            {$_('sidebar.deleting')}
          {:else}
            {$_('sidebar.delete')}
          {/if}
        </button>
      </div>
    {/snippet}
  </Modal>
{/if}

<style>
  /* ===== Collapsed rail (Recent) ===== */
  .collapsed-recent {
    display: flex;
    justify-content: center;
  }

  .rail-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--gx-slate);
    cursor: pointer;
    border-radius: 8px;
    overflow: hidden;
    flex-shrink: 0;
    transition: background-color 120ms ease;
    box-shadow: none;
    backdrop-filter: none;
  }

  .rail-btn:hover {
    background: var(--gx-fill-soft);
    color: var(--gx-slate);
    transform: none;
    box-shadow: none;
  }

  .rail-btn:active {
    background: var(--gx-line);
    transform: none;
  }

  .rail-btn.active {
    background: var(--gx-blue-soft);
    color: var(--gx-blue);
  }

  .rail-btn:focus-visible {
    outline: 2px solid var(--gx-blue);
    outline-offset: 2px;
  }

  /* ===== Pinned Section (Figma / sidebar.html) ===== */
  .sb-section {
    display: flex;
    flex-direction: column;
    gap: 4px;
    align-self: stretch;
  }

  .pinned-section {
    margin-bottom: 2px;
  }

  .section-header {
    display: flex;
    height: 24px;
    justify-content: space-between;
    align-items: center;
    align-self: stretch;
    width: 100%;
    padding: 0;
    border: none;
    background: transparent;
    cursor: pointer;
    color: var(--gx-dim);
    transition: color 120ms ease;
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .section-header:hover {
    color: var(--gx-muted);
    transform: none;
    box-shadow: none;
  }

  .section-header:focus-visible {
    outline: 2px solid var(--gx-blue);
    outline-offset: 1px;
  }

  .section-header__left {
    display: flex;
    gap: 6px;
    align-items: center;
    color: inherit;
  }

  .section-header__left--tight {
    gap: 6px;
  }

  .section-label {
    font-size: 10px;
    font-weight: 700;
    line-height: 14px;
    letter-spacing: 0;
    color: inherit;
    white-space: nowrap;
    text-transform: uppercase;
  }

  .chev {
    transition: transform 140ms ease;
    color: var(--gx-dim);
    flex-shrink: 0;
  }

  .chev.collapsed {
    transform: rotate(-90deg);
  }

  .sb-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    align-self: stretch;
  }

  /* Pinned rows (Figma / sidebar.html: 30px tall, 6px radius, 6/8 padding, 8px gap) */
  .pinned-row {
    height: 30px;
    border-radius: 6px;
    display: flex;
    padding: 6px 8px;
    justify-content: space-between;
    align-items: center;
    align-self: stretch;
    width: 100%;
    gap: 8px;
    border: none;
    background: transparent;
    cursor: pointer;
    text-align: start;
    transition: background-color 120ms ease;
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .pinned-row:hover {
    background: var(--gx-fill-soft);
    transform: none;
    box-shadow: none;
  }

  .pinned-row:focus-visible {
    outline: 2px solid var(--gx-blue);
    outline-offset: -2px;
  }

  .pinned-row--current {
    background: var(--gx-blue-soft);
  }

  .pinned-row--current:hover {
    background: var(--gx-blue-soft-hover);
  }

  .pinned-row--current .row__icon,
  .pinned-row--current .row__label {
    color: var(--gx-blue);
  }

  .pinned-row--current .row__label {
    font-weight: 600;
  }

  .row__main {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-grow: 1;
    min-width: 0;
  }

  .row__icon {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--gx-dim);
  }

  .row__label {
    flex-grow: 1;
    min-width: 0;
    font-size: 12px;
    font-weight: 500;
    line-height: 16px;
    color: var(--gx-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding-inline-end: 18px;
  }

  /* ===== Recent section (Figma: 24px header, 4px gap to the list) ===== */
  .recent-section {
    display: flex;
    flex-direction: column;
    gap: 4px;
    align-self: stretch;
  }

  .recent-header {
    display: flex;
    height: 24px;
    align-items: center;
    gap: 6px;
    align-self: stretch;
    color: var(--gx-dim);
  }

  /* The box has to match the glyph it holds (14px): at 12px the svg was
     squeezed by flex-shrink and the icon rendered smaller and out of square
     than the design's section icons. */
  .section-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    color: currentcolor;
  }

  .recent-title {
    font-size: 10px;
    font-weight: 700;
    line-height: 14px;
    letter-spacing: 0;
    text-transform: uppercase;
    white-space: nowrap;
    color: currentcolor;
  }

  /* ===== Day groups (TODAY / YESTERDAY / THIS WEEK / EARLIER) ===== */
  .chat-time-group {
    display: flex;
    flex-direction: column;
    gap: 2px;
    align-self: stretch;
  }

  .chat-time-label {
    font-size: 10px;
    font-weight: 700;
    line-height: 14px;
    letter-spacing: 0;
    text-transform: uppercase;
    color: var(--gx-dim);
    padding: 6px 8px 2px;
    margin: 0;
  }

  .chat-status-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--gx-green-dot);
    flex-shrink: 0;
  }

  /* ===== Chat list ===== */
  /* The sidebar's .sb-scroll owns the scrollbar, so this box just stacks. */
  .chat-list-section {
    align-self: stretch;
  }

  .chat-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    align-self: stretch;
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
    box-shadow:
      inset -1px -1px 0 rgba(255, 255, 255, 0.2),
      inset 1px 1px 8px rgba(0, 0, 0, 0.2);
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

  /* Figma chat row: 28px tall, 6px radius, 8px gap, 6/8 padding */
  .chat-item-btn {
    flex: 1;
    min-width: 0;
    display: flex;
    height: 28px;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border: none;
    background: transparent;
    color: var(--gx-muted);
    font-size: 12px;
    line-height: 16px;
    cursor: pointer;
    text-align: start;
    border-radius: 6px;
    transition: background-color 120ms ease;
    box-shadow: none;
    backdrop-filter: none;
  }

  .chat-item-btn:hover {
    background: var(--gx-fill-soft);
    color: var(--gx-muted);
    transform: none;
    box-shadow: none;
  }

  .chat-item-btn:focus-visible {
    outline: 2px solid var(--gx-blue);
    outline-offset: -2px;
  }

  /* the current chat: soft fill + stronger label, as drawn in the design */
  .chat-item-btn.selected {
    background: var(--gx-fill-soft);
    color: var(--gx-ink);
  }

  .chat-item-btn.selected .chat-item-title {
    font-weight: 600;
    color: var(--gx-ink);
  }

  .chat-item-title {
    flex-grow: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 12px;
    font-weight: 500;
    line-height: 16px;
    padding-inline-end: 18px;
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
  .chat-item-menu[aria-expanded='true'],
  .chat-item-menu:focus-visible {
    opacity: 1;
    pointer-events: auto;
  }

  .chat-item-menu:hover,
  .chat-item-menu:focus-visible {
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
    padding: 12px 8px;
    text-align: center;
    color: var(--gx-dim);
    font-size: 12px;
    line-height: 16px;
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
    z-index: 1;
    display: block;
    color: var(--text-secondary);
    opacity: 0.75;
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
    padding: 16px 8px;
    color: var(--gx-dim);
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
    padding: 16px 8px;
    text-align: center;
    color: var(--gx-dim);
    font-size: 12px;
    justify-content: center;
  }

  /* ===== Confirmation Dialog Actions (with Modal component) ===== */
  .confirmation-content {
    padding: 0;
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

  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }
</style>
