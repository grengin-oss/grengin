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
    prefetchConversation,
    type ChatSemanticResult,
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

  let menuItems = $derived([
    {
      id: 'chat',
      label: $_('sidebar.newChat'),
      icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>',
    },
  ]);

  let chatHistory = $state<any[]>([]);
  let normalChatSnapshot = $state<any[]>([]);
  let normalChatSnapshotTotal = $state<number | null>(null);
  let loadingChats = $state(false);
  let loadingMoreChats = $state(false);
  let searchQuery = $state('');
  let searchFocused = $state(false);
  let semanticSearchEnabled = $state(false);
  const CHAT_PAGE_LIMIT = 20;
  const TITLE_SEARCH_DEBOUNCE_MS = 250;
  const SEMANTIC_SEARCH_DEBOUNCE_MS = 650;
  const MIN_SEMANTIC_SEARCH_CHARS = 3;
  let chatOffset = $state(0);
  let chatHasMore = $state(true);
  let chatTotal = $state<number | null>(null);
  let chatContainerElement = $state<HTMLElement | null>(null);
  let renameChatId = $state<string | null>(null);
  let renameTitle = $state('');
  let renamingChat = $state(false);
  let renameInputElement = $state<HTMLInputElement | null>(null);
  let normalizedSearchQuery = $derived(normalizeSearchQuery(searchQuery));
  let effectiveSearchMode = $derived(getEffectiveSearchMode(normalizedSearchQuery));
  let canUseSemanticSearch = $derived(normalizedSearchQuery.length >= MIN_SEMANTIC_SEARCH_CHARS);
  let didRequestInitialChats = false;
  let activeFetchController: AbortController | null = null;
  let fetchRequestSerial = 0;

  function handleItemClick(itemId: string) {
    if (itemId === 'chat') {
      selectedChatId = null;
      navigate('/');
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('focusChatInput'));
      }, 50);

      onCollapseSidebar();
      return;
    }

    onCollapseSidebar();
  }

  function toggleChatMenu(chatId: string) {
    activeChatMenu = activeChatMenu === chatId ? null : chatId;
  }

  function selectChat(chatId: string) {
    if (initializingConversation) return;

    if (selectedChatId === chatId && currentPath === '/') {
      activeChatMenu = null;
      onCollapseSidebar();
      return;
    }

    selectedChatId = chatId;
    navigate(`/?chatId=${chatId}`);
    activeChatMenu = null;
    onCollapseSidebar();
  }

  function warmChat(chatId: string) {
    prefetchConversation(chatId);
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

  function normalizeSearchQuery(value: string): string {
    return value.trim().replace(/\s+/g, ' ');
  }

  function getEffectiveSearchMode(query: string): 'none' | 'title' | 'semantic' {
    if (!query) return 'none';
    if (semanticSearchEnabled && query.length >= MIN_SEMANTIC_SEARCH_CHARS) {
      return 'semantic';
    }
    return 'title';
  }

  function getSearchSignature(query = normalizeSearchQuery(searchQuery)): string {
    return `${query}:${getEffectiveSearchMode(query)}`;
  }

  function isAbortError(error: unknown): boolean {
    return error instanceof Error && error.name === 'AbortError';
  }

  function abortActiveChatFetch() {
    fetchRequestSerial += 1;
    activeFetchController?.abort();
    activeFetchController = null;
    loadingChats = false;
    loadingMoreChats = false;
  }

  function restoreNormalChatSnapshot() {
    chatHistory = normalChatSnapshot;
    chatTotal = normalChatSnapshotTotal;
    chatOffset = normalChatSnapshot.length;
    chatHasMore =
      normalChatSnapshotTotal !== null
        ? chatOffset < normalChatSnapshotTotal
        : normalChatSnapshot.length === CHAT_PAGE_LIMIT;
  }

  function clearSearch() {
    abortActiveChatFetch();
    searchQuery = '';
    searchFocused = false;
    activeChatMenu = null;
    restoreNormalChatSnapshot();
  }

  function setSearchMode(mode: 'title' | 'semantic') {
    if (mode === 'semantic' && !canUseSemanticSearch) {
      return;
    }
    abortActiveChatFetch();
    semanticSearchEnabled = mode === 'semantic';
  }

  function getSemanticScore(result: ChatSemanticResult | null | undefined): number | null {
    if (!result || typeof result.distance !== 'number') return null;
    return Math.max(0, Math.min(100, Math.round((1 - result.distance) * 100)));
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

  async function fetchChats({ reset = false } = {}) {
    const trimmedSearchQuery = normalizedSearchQuery;
    const usingSemanticSearch = effectiveSearchMode === 'semantic';
    const requestSignature = getSearchSignature(trimmedSearchQuery);
    const requestId = fetchRequestSerial + 1;
    const controller = new AbortController();

    fetchRequestSerial = requestId;
    activeFetchController?.abort();
    activeFetchController = controller;

    try {
      if (reset) {
        loadingChats = true;
        loadingMoreChats = false;
        chatOffset = 0;
        chatTotal = null;
        if (trimmedSearchQuery) {
          chatHistory = [];
        }
      } else {
        loadingMoreChats = true;
      }

      chatHasMore = false;
      const offset = reset ? 0 : chatOffset;
      const response = await listConversations({
        offset,
        limit: CHAT_PAGE_LIMIT,
        search: trimmedSearchQuery,
        semantic: usingSemanticSearch,
        signal: controller.signal,
      });

      if (
        controller.signal.aborted ||
        requestId !== fetchRequestSerial ||
        getSearchSignature() !== requestSignature
      ) {
        return;
      }

      const responseChats = Array.isArray(response) ? response : response?.conversations ?? [];
      const total = !Array.isArray(response) && typeof response?.total === 'number' ? response.total : null;
      const semanticResults = !Array.isArray(response) ? response?.semantic_results || {} : {};

      const mappedChats = responseChats.map((chat: any) => ({
        id: chat.id,
        title: chat.title || $_('sidebar.untitledChat'),
        archived: chat.archived,
        createdAt: chat.created_at,
        lastMessageAt: chat.last_message_at,
        totalTokens: chat.total_tokens,
        semanticResult: semanticResults?.[chat.id] || null,
      }));

      if (reset) {
        chatHistory = mappedChats;
      } else if (mappedChats.length > 0) {
        const existingIds = new Set(chatHistory.map((chat) => chat.id));
        chatHistory = [...chatHistory, ...mappedChats.filter((chat) => !existingIds.has(chat.id))];
      }

      chatOffset = offset + mappedChats.length;
      if (!trimmedSearchQuery && reset) {
        normalChatSnapshot = mappedChats;
        normalChatSnapshotTotal = total;
      }
      if (total !== null) {
        chatTotal = total;
        chatHasMore = chatOffset < total;
      } else {
        chatHasMore = mappedChats.length === CHAT_PAGE_LIMIT;
      }
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) {
        return;
      }
      console.error('Failed to fetch chats:', error);
    } finally {
      if (requestId === fetchRequestSerial) {
        if (activeFetchController === controller) {
          activeFetchController = null;
        }
        loadingChats = false;
        loadingMoreChats = false;
        await tick();
        ensureChatListFilled();
      }
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
    if (effectiveSearchMode === 'semantic') {
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
    normalizedSearchQuery;
    effectiveSearchMode;

    let debounceMs = 80;
    if (!didRequestInitialChats && !normalizedSearchQuery) {
      debounceMs = 0;
    } else if (effectiveSearchMode === 'semantic') {
      debounceMs = SEMANTIC_SEARCH_DEBOUNCE_MS;
    } else if (normalizedSearchQuery) {
      debounceMs = TITLE_SEARCH_DEBOUNCE_MS;
    }

    const searchTimeout = setTimeout(() => {
      didRequestInitialChats = true;
      fetchChats({ reset: true });
    }, debounceMs);

    return () => {
      clearTimeout(searchTimeout);
    };
  });
</script>

<svelte:window onclick={handleWindowClick} />

<nav class="sidebar-nav">
  {#each menuItems as item}
    <button class="sidebar-item" onclick={() => handleItemClick(item.id)} aria-label={item.label} title={item.label}>
      <span class="sidebar-icon" aria-hidden="true">{@html item.icon}</span>
      <span class="sidebar-label">{item.label}</span>
    </button>
  {/each}

  {#if !isCollapsed}
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
          class="chat-search-input"
          aria-label={$_('sidebar.searchTitle')}
          title={$_('sidebar.searchTitle')}
          onkeydown={(event: KeyboardEvent) => {
            if (event.key === 'Escape') {
              clearSearch();
            }
          }}
          onfocus={() => (searchFocused = true)}
          onblur={() => (searchFocused = false)}
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
      {#if normalizedSearchQuery}
        <div class="search-mode-toggle" role="group" aria-label={$_('sidebar.searchModeLabel')}>
          <button
            type="button"
            class:active={effectiveSearchMode !== 'semantic'}
            onclick={() => setSearchMode('title')}
            aria-pressed={effectiveSearchMode !== 'semantic'}
            title={$_('sidebar.searchModeTitle')}
          >
            {$_('sidebar.searchModeTitle')}
          </button>
          <button
            type="button"
            class:active={effectiveSearchMode === 'semantic'}
            onclick={() => setSearchMode('semantic')}
            aria-pressed={effectiveSearchMode === 'semantic'}
            disabled={!canUseSemanticSearch}
            title={$_('sidebar.searchModeSemantic')}
          >
            {$_('sidebar.searchModeSemantic')}
          </button>
        </div>
      {/if}
    </div>
  {/if}
</nav>

{#if !isCollapsed}
  <div class="sidebar-divider"></div>
{/if}

{#if !isCollapsed}
  <div class="chat-section-title">
    <span>
      {$_('sidebar.chats')}
      {#if chatTotal}
        ({chatTotal})
      {/if}
    </span>
  </div>
{/if}

{#if !isCollapsed}
  <div class="chat-list-section" bind:this={chatContainerElement} onscroll={handleChatListScroll}>
    <div class="chat-list">
      {#if loadingChats}
        <div class="chat-loading">
          <div class="loading-spinner-small"></div>
          <span>{$_('sidebar.loadingChats')}</span>
        </div>
      {:else if chatHistory.length === 0 && normalizedSearchQuery}
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
                onpointerenter={() => warmChat(chat.id)}
                onfocus={() => warmChat(chat.id)}
                ontouchstart={() => warmChat(chat.id)}
                aria-current={selectedChatId === chat.id ? 'page' : undefined}
                title={chat.semanticResult?.snippet ? `${chat.title}\n${chat.semanticResult.snippet}` : chat.title}
              >
                <span class="chat-item-content">
                  <span class="chat-item-title-row">
                    <span class="chat-item-title">{chat.title}</span>
                    {#if chat.semanticResult?.snippet}
                      <span class="semantic-badge">
                        {$_('sidebar.searchModeSemantic')}
                        {#if getSemanticScore(chat.semanticResult) !== null}
                          {getSemanticScore(chat.semanticResult)}%
                        {/if}
                      </span>
                    {/if}
                  </span>
                  {#if chat.semanticResult?.snippet}
                    <span class="chat-semantic-snippet">{chat.semanticResult.snippet}</span>
                  {/if}
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
  /* Mirror sidebar nav item styles (scoped to this component; collapsed via parent aside) */
  .sidebar-nav {
    flex: 0;
    padding: var(--space-md) var(--space-sm);
  }

  :global(aside.sidebar.collapsed) .sidebar-nav {
    padding: var(--space-md) var(--space-xs);
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
    transition:
      background-color 0.14s ease,
      color 0.14s ease,
      font-weight 0.14s ease;
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
    transition:
      opacity 0.2s ease,
      width 0.2s ease;
  }

  :global(aside.sidebar.collapsed) .sidebar-label {
    opacity: 0;
    width: 0;
    overflow: hidden;
  }

  :global(aside.sidebar.collapsed) .sidebar-item {
    justify-content: center;
    padding: var(--space-md);
  }

  /* ===== Chat List Section ===== */
  .chat-list-section {
    overflow-y: auto;
    padding: 0 var(--space-sm);
    margin-bottom: var(--space-sm);
    flex: 1;
    min-height: 0;
    contain: content;
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
    contain: layout paint;
  }

  .chat-item-btn {
    flex: 1;
    min-width: 0;
    color: var(--text-secondary);
    align-items: flex-start;
    padding-right: 1.8rem;
    transition:
      background-color 0.12s ease,
      color 0.12s ease,
      font-weight 0.12s ease;
  }

  .chat-item-content {
    display: flex;
    flex-direction: column;
    gap: 0.18rem;
    min-width: 0;
    width: 100%;
  }

  .chat-item-title-row {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    min-width: 0;
    width: 100%;
  }

  .chat-item-title {
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .semantic-badge {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    max-width: 6.5rem;
    padding: 0.08rem 0.34rem;
    border-radius: var(--radius-full);
    background: color-mix(in oklab, var(--brand) 12%, transparent);
    color: var(--brand);
    font-size: 0.625rem;
    font-weight: 650;
    line-height: 1.25;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .chat-semantic-snippet {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    color: var(--text-tertiary);
    font-size: 0.72rem;
    font-weight: 400;
    line-height: 1.35;
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
    transition:
      opacity 0.12s ease,
      color 0.12s ease,
      background-color 0.12s ease;
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
    padding: var(--space-xl) var(--space-md);
    text-align: center;
    color: var(--text-secondary);
    font-size: 0.8125rem;
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

  .search-mode-toggle {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2px;
    margin-top: var(--space-xs);
    padding: 2px;
    border: 1px solid var(--glass-stroke-dark);
    border-radius: var(--radius-md);
    background: var(--btn-secondary);
  }

  .search-mode-toggle button {
    min-width: 0;
    height: 1.65rem;
    border: none;
    border-radius: calc(var(--radius-md) - 2px);
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 0.72rem;
    font-weight: 600;
    transition:
      background-color 0.14s ease,
      color 0.14s ease,
      box-shadow 0.14s ease;
  }

  .search-mode-toggle button.active {
    background: var(--bg-primary);
    color: var(--text-primary);
    box-shadow: var(--glass-edge-glow);
  }

  .search-mode-toggle button:hover {
    color: var(--text-primary);
  }

  .search-mode-toggle button:disabled {
    cursor: not-allowed;
    color: var(--text-tertiary);
    opacity: 0.5;
  }

  .search-mode-toggle button:disabled:hover {
    color: var(--text-tertiary);
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
