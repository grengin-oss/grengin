<script lang="ts">
  import { onMount, tick } from 'svelte';
  import ChatMessage from './ChatMessage.svelte';
  import MessageInput from './MessageInput.svelte';
  import TypingIndicator from './TypingIndicator.svelte';
  import type { ChatMessage as ChatMessageType } from '../../../types/chat';
  import { sendMessage, getConversation } from '../../../api/chatApi';
  import { getModels, type ProviderInfo, type ModelInfo } from '../../../api/models';

  let messages = $state<ChatMessageType[]>([]);
  let isLoading = $state(false);
  let isTyping = $state(false);
  let error = $state<string | null>(null);
  let conversationId = $state<string | null>(null);
  let messagesContainer: HTMLDivElement;
  let currentStreamingMessage = $state<ChatMessageType | null>(null);
  let dropdownOpen = $state(false);
  let selectedModel = $state('Baichuan-M2');
  let selectedProvider = $state('anthropic');
  let providers = $state<ProviderInfo[]>([]);
  let loadingModels = $state(true);
  let modelsError = $state<string | null>(null);

  // Listen for URL changes
  function handleUrlChange() {
    const urlParams = new URLSearchParams(window.location.search);
    const chatId = urlParams.get('chatId');
    
    console.log('URL change detected:', {
      currentConversationId: conversationId,
      newChatId: chatId,
      shouldReload: chatId !== conversationId
    });
    
    if (chatId !== conversationId) {
      loadConversationFromUrl();
    }
  }

  // Handle model selection
  function selectModel(provider: ProviderInfo, model: ModelInfo) {
    selectedProvider = provider.key;
    selectedModel = model.name;
    dropdownOpen = false;
  }

  // Handle model removal
  function handleRemoveModel() {
    selectedModel = '';
    selectedProvider = '';
  }

  // Load models from API
  async function loadModels() {
    try {
      loadingModels = true;
      modelsError = null;
      const data = await getModels();
      providers = data.providers;
      
      // Set default model if none selected
      if (!selectedModel && providers.length > 0 && providers[0].models.length > 0) {
        selectedProvider = providers[0].key;
        selectedModel = providers[0].models[0].name;
      }
    } catch (error) {
      modelsError = error instanceof Error ? error.message : 'Failed to load models';
      console.error('Failed to load models:', error);
    } finally {
      loadingModels = false;
    }
  }

  // Auto-scroll to bottom when new messages arrive
  async function scrollToBottom(smooth = true) {
    await tick();
    if (messagesContainer) {
      messagesContainer.scrollTo({
        top: messagesContainer.scrollHeight,
        behavior: smooth ? 'auto' : 'auto',
      });
    }
  }

  async function handleSendMessage(content: string) {
    if (isLoading) return;

    error = null;
    isLoading = true;

    // Add user message
    const userMessage: ChatMessageType = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };
    messages = [...messages, userMessage];
    await scrollToBottom();

    // Show typing indicator
    isTyping = true;

    // Prepare streaming message
    currentStreamingMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      isStreaming: true,
    };

    try {
      await sendMessage({
        message: content,
        conversationId: conversationId || undefined,
        onStart: (data) => {
          conversationId = data.conversation_id;
          isTyping = false;
          if (currentStreamingMessage) {
            messages = [...messages, currentStreamingMessage];
          }
          scrollToBottom();
        },
        onToken: (token) => {
          if (currentStreamingMessage) {
            currentStreamingMessage.content += token;
            // Update the message in the array
            messages = messages.map(m => 
              m.id === currentStreamingMessage?.id ? { ...currentStreamingMessage } : m
            );
            scrollToBottom();
          }
        },
        onTitle: (title) => {
          console.log('Conversation title:', title);
        },
        onDone: (data) => {
          if (currentStreamingMessage) {
            currentStreamingMessage.isStreaming = false;
            messages = messages.map(m => 
              m.id === currentStreamingMessage?.id ? { ...currentStreamingMessage } : m
            );
          }
          currentStreamingMessage = null;
          isLoading = false;
          isTyping = false;
        },
        onError: (errorMessage) => {
          error = errorMessage;
          isTyping = false;
          if (currentStreamingMessage) {
            currentStreamingMessage.error = errorMessage;
            currentStreamingMessage.isStreaming = false;
            messages = messages.map(m => 
              m.id === currentStreamingMessage?.id ? { ...currentStreamingMessage } : m
            );
          }
          currentStreamingMessage = null;
          isLoading = false;
        },
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send message';
      error = errorMessage;
      isTyping = false;
      isLoading = false;
      currentStreamingMessage = null;
    }
  }

  function handleEditMessage(id: string, newContent: string) {
    messages = messages.map(msg => 
      msg.id === id ? { ...msg, content: newContent } : msg
    );
  }

  function handleDeleteMessage(id: string) {
    messages = messages.filter(msg => msg.id !== id);
  }

  async function loadConversationFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const chatId = urlParams.get('chatId');
    
    console.log('Loading conversation:', {
      chatId,
      currentMessagesCount: messages.length,
      currentConversationId: conversationId
    });
    
    if (chatId) {
      try {
        isLoading = true;
        // Clear previous messages immediately
        console.log('Clearing previous messages...');
        messages = [];
        error = null;
        
        const conversation = await getConversation(chatId);
        conversationId = chatId;
        
        console.log('Loaded conversation:', {
          conversationId: conversation.id,
          messagesCount: conversation.messages.length
        });
        
        // Convert messages to ChatMessageType format
        messages = conversation.messages.map((msg: any) => ({
          id: msg.id,
          role: msg.role,
          content: msg.parts.text || '',
          timestamp: new Date(msg.created_at),
          model: msg.model,
          usage: msg.usage
        }));
        
        console.log('Set new messages:', messages.length);
        scrollToBottom(false);
      } catch (err) {
        error = 'Failed to load conversation';
        console.error('Failed to load conversation:', err);
        messages = []; // Clear messages on error too
      } finally {
        isLoading = false;
      }
    } else {
      // No chatId in URL, clear everything
      console.log('No chatId in URL, clearing everything');
      conversationId = null;
      messages = [];
      error = null;
    }
  }

  onMount(() => {
    scrollToBottom(false);
    loadModels();
    loadConversationFromUrl();
    
    // Listen for URL changes (when using history.pushState)
    window.addEventListener('popstate', handleUrlChange);
    
    // Also listen for custom pushstate events
    const originalPushState = history.pushState;
    history.pushState = function(...args) {
      originalPushState.apply(history, args);
      setTimeout(handleUrlChange, 0); // Small delay to ensure URL is updated
    };
    
    return () => {
      window.removeEventListener('popstate', handleUrlChange);
      history.pushState = originalPushState;
    };
  });
</script>

<div class="chat-container">
  <div class="chat-header">
    <div class="header-left">
      <div class="header-title">
        <div class="dropdown">
          <button class="dropdown-button" onclick={() => dropdownOpen = !dropdownOpen}>
            <div class="model-logo">
              {@html selectedProvider ? providers.find(p => p.key === selectedProvider)?.icon || '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7L12 12L22 7L12 2Z"></path><path d="M2 17L12 22L22 17"></path><path d="M2 12L12 17L22 12"></path></svg>' : '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7L12 12L22 7L12 2Z"></path><path d="M2 17L12 22L22 17"></path><path d="M2 12L12 17L22 12"></path></svg>'}
            </div>
            <h2>{selectedModel}</h2>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="dropdown-arrow">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
          {#if dropdownOpen}
            <div class="dropdown-menu">
              {#if loadingModels}
                <div class="dropdown-loading">
                  <div class="loading-spinner"></div>
                  Loading models...
                </div>
              {:else if modelsError}
                <div class="dropdown-error">
                  {modelsError}
                </div>
              {:else}
                {#each providers as provider}
                  <div class="provider-item">
                    <div 
                      class="provider-row"
                      role="button"
                      tabindex="0"
                      onmouseenter={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const submenu = document.getElementById(`submenu-${provider.key}`);
                        if (submenu) {
                          submenu.style.left = `${rect.right + 4}px`;
                          submenu.style.top = `${rect.top}px`;
                          submenu.style.display = 'block';
                        }
                      }}
                      onmouseleave={(e) => {
                        const submenu = document.getElementById(`submenu-${provider.key}`);
                        if (submenu) {
                          submenu.style.display = 'none';
                        }
                      }}
                    >
                      <div class="provider-icon">
                        {@html provider.icon}
                      </div>
                      <span class="provider-label">{provider.name}</span>
                      <svg class="chevron-right" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="9 18 15 12 9 6"></polyline>
                      </svg>
                    </div>
                  </div>
                {/each}
              {/if}
            </div>
            
            <!-- Submenus outside dropdown -->
            {#each providers as provider}
              <div 
                id={`submenu-${provider.key}`}
                class="models-submenu-external"
                onmouseenter={(e) => {
                  e.currentTarget.style.display = 'block';
                }}
                onmouseleave={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              >
                {#each provider.models as model}
                  <button class="submenu-item" onclick={() => selectModel(provider, model)}>
                    <div class="submenu-item-info">
                      <span class="submenu-item-name">{model.name}</span>
                      {#if model.context_window}
                        <span class="submenu-item-details">{model.context_window.toLocaleString()} context</span>
                      {/if}
                    </div>
                  </button>
                  
                  <!-- Versions if available -->
                  {#if model.versions && model.versions.length > 0}
                    {#each model.versions as version}
                      <button class="submenu-item version-item" onclick={() => selectModel(provider, version)}>
                        <div class="submenu-item-info">
                          <span class="submenu-item-name">{version.name}</span>
                          {#if version.context_window}
                            <span class="submenu-item-details">{version.context_window.toLocaleString()} context</span>
                          {/if}
                        </div>
                      </button>
                    {/each}
                  {/if}
                {/each}
              </div>
            {/each}
          {/if}
        </div>
      </div>
    </div>
    <div class="header-actions">
      <button class="header-btn" title="New Chat">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="9" y1="9" x2="15" y2="15"></line>
          <line x1="15" y1="9" x2="9" y2="15"></line>
        </svg>
      </button>
      <button class="header-btn" title="Add">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="16"></line>
          <line x1="8" y1="12" x2="16" y2="12"></line>
        </svg>
      </button>
      <button class="header-btn" title="Refresh">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="23 4 23 10 17 10"></polyline>
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
        </svg>
      </button>
    </div>
  </div>

  <div class="messages-container" bind:this={messagesContainer}>
    <div class="messages-inner">
      {#if messages.length === 0}
        <div class="empty-state">
          <div class="empty-icon">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
          </div>
          <h3>Start a conversation</h3>
          <p>Send a message to begin chatting with the AI assistant</p>
        </div>
      {:else}
        {#each messages as message (message.id)}
          <ChatMessage {message} onEdit={handleEditMessage} onDelete={handleDeleteMessage} />
        {/each}
        
        {#if isTyping}
          <TypingIndicator />
        {/if}
      {/if}

      {#if error && !currentStreamingMessage}
        <div class="error-banner">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <span>{error}</span>
          <button class="dismiss-btn" onclick={() => error = null} aria-label="Dismiss error" title="Dismiss error">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      {/if}
    </div>
  </div>

  <div class="input-container">
    <MessageInput 
      onSend={handleSendMessage} 
      disabled={isLoading}
      placeholder={`Message ${selectedModel}`}
      {selectedModel}
      onRemoveModel={handleRemoveModel}
    />
  </div>
</div>

<style>
  .chat-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100%;
    background: var(--bg-primary);
  }

  .chat-header {
    flex-shrink: 0;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    background: var(--bg-primary);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .dropdown {
    position: relative;
  }

  .dropdown-button {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.625rem 1rem;
     border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 0.75rem;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    backdrop-filter: blur(10px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .model-logo {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 10px;
    color: white;
    box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
    transition: all 0.3s ease;
  }

  .dropdown-button:hover .model-logo {
    transform: scale(1.05);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
  }

  .dropdown-button:hover {
    border-color: rgba(255, 255, 255, 0.2);
    transform: translateY(-1px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  }

  .dropdown-button:active {
    transform: translateY(0);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .dropdown-button h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .dropdown-arrow {
    color: var(--text-secondary);
    transition: transform 0.2s ease;
  }

  .dropdown-button:hover .dropdown-arrow {
    color: var(--text-primary);
  }

  .dropdown-menu {
    position: absolute;
    top: calc(100% + 0.5rem);
    left: 0;
    background: rgba(255, 255, 255, 0.98);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 0.75rem;
    box-shadow: 
      0 4px 24px rgba(0, 0, 0, 0.12),
      0 1px 2px rgba(0, 0, 0, 0.08);
    width: 240px;
    max-height: 480px;
    overflow-y: auto;
    z-index: 1000;
    animation: slideDown 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    transform-origin: top left;
  }

  /* Custom Scrollbar */
  .dropdown-menu::-webkit-scrollbar {
    width: 6px;
  }

  .dropdown-menu::-webkit-scrollbar-track {
    background: transparent;
  }

  .dropdown-menu::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.1);
    border-radius: 3px;
  }

  .dropdown-menu::-webkit-scrollbar-thumb:hover {
    background: rgba(0, 0, 0, 0.2);
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: scale(0.95) translateY(-10px);
    }
    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }

  .dropdown-loading,
  .dropdown-error {
    padding: 1.5rem;
    text-align: center;
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .dropdown-error {
    color: var(--brand-red);
  }

  .loading-spinner {
    width: 20px;
    height: 20px;
    border: 2px solid rgba(255, 255, 255, 0.1);
    border-top: 2px solid var(--text-secondary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto 0.5rem;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  /* Provider Item */
  .provider-item {
    position: relative;
  }

  .provider-item:last-child {
    border-bottom: none;
  }

  .provider-item:hover {
    z-index: 1002;
  }

  .provider-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.625rem 1rem;
    cursor: pointer;
    transition: all 0.15s ease;
    color: #1a1a1a;
  }

  .provider-row:hover {
    background: rgba(0, 0, 0, 0.04);
  }

  .provider-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    flex-shrink: 0;
  }

  .provider-label {
    flex: 1;
    font-size: 0.875rem;
    font-weight: 400;
    color: #1a1a1a;
  }

  .chevron-right {
    width: 16px;
    height: 16px;
    color: #8e8e8e;
    transition: all 0.15s ease;
    flex-shrink: 0;
  }

  .provider-row:hover .chevron-right {
    color: #1a1a1a;
  }

  /* External Models Submenu - Fixed Position */
  .models-submenu-external {
    position: fixed;
    width: 280px;
    max-height: 480px;
    overflow-y: auto;
    background: rgba(255, 255, 255, 0.98);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 0.75rem;
    box-shadow: 
      0 4px 24px rgba(0, 0, 0, 0.12),
      0 1px 2px rgba(0, 0, 0, 0.08);
    display: none;
    z-index: 1004;
  }

  /* Custom Scrollbar for Submenu */
  .models-submenu-external::-webkit-scrollbar {
    width: 5px;
  }

  .models-submenu-external::-webkit-scrollbar-track {
    background: transparent;
  }

  .models-submenu-external::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.1);
    border-radius: 3px;
  }

  .models-submenu-external::-webkit-scrollbar-thumb:hover {
    background: rgba(0, 0, 0, 0.2);
  }

  /* Submenu Items */
  .submenu-item {
    display: flex;
    align-items: center;
    gap: 0;
    padding: 0.5rem 1rem;
    width: 100%;
    border: none;
    background: #fff;
    color: #1a1a1a;
    text-align: left;
    cursor: pointer;
    transition: all 0.15s ease;
    font-size: 0.875rem;
    box-shadow: none;
  }

  .submenu-item:hover {
    background: rgba(0, 0, 0, 0.04);
  }

  .submenu-item.version-item {
    padding-left: 2.5rem;
    font-size: 0.8125rem;
    color: #666;
  }

  .submenu-item.version-item:hover {
    background: rgba(0, 0, 0, 0.04);
    color: #1a1a1a;
  }

  .submenu-item-icon {
    display: none;
  }

  .submenu-item-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .submenu-item-name {
    font-size: 0.875rem;
    font-weight: 400;
    color: #1a1a1a;
  }

  .submenu-item.version-item .submenu-item-name {
    font-size: 0.8125rem;
    font-weight: 400;
    color: #666;
  }

  .submenu-item:hover .submenu-item-name {
    color: #1a1a1a;
  }

  .submenu-item-details {
    font-size: 0.75rem;
    color: #8e8e8e;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .header-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    padding: 0;
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .header-btn:hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.2);
    color: var(--text-primary);
  }

  .messages-container {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: var(--space-2xl) var(--space-3xl);
    scroll-behavior: smooth;
  }

  .messages-inner {
    max-width: 1200px;
    margin: 0 auto;
    width: 100%;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 400px;
    text-align: center;
    padding: var(--space-3xl);
  }

  .empty-icon {
    margin-bottom: var(--space-2xl);
    color: var(--text-secondary);
    opacity: 0.5;
  }

  .empty-state h3 {
    margin: 0 0 var(--space-md) 0;
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .empty-state p {
    margin: 0;
    font-size: 1rem;
    color: var(--text-secondary);
    max-width: 400px;
  }

  .error-banner {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-lg) var(--space-xl);
    margin: var(--space-xl) 0;
    background: var(--danger-surface);
    color: var(--brand-red);
    border-radius: var(--radius-lg);
    border: 1px solid rgba(223, 0, 12, 0.2);
    box-shadow: 0 4px 12px rgba(223, 0, 12, 0.1);
    animation: slideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .error-banner span {
    flex: 1;
    font-size: 0.875rem;
    font-weight: 500;
  }

  .dismiss-btn {
    padding: var(--space-xs);
    background: transparent;
    border: none;
    color: var(--brand-red);
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .dismiss-btn:hover {
    background: rgba(223, 0, 12, 0.1);
    transform: scale(1.1);
  }

  .input-container {
    flex-shrink: 0;
    padding: 1rem 1.5rem;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    background: var(--bg-primary);
  }

  /* Custom scrollbar */
  .messages-container::-webkit-scrollbar {
    width: 8px;
  }

  .messages-container::-webkit-scrollbar-track {
    background: transparent;
  }

  .messages-container::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 4px;
  }

  .messages-container::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  @media (max-width: 768px) {
    .chat-header {
      padding: var(--space-xl) var(--space-2xl);
    }

    .chat-header h2 {
      font-size: 1.5rem;
    }

    .messages-container {
      padding: var(--space-xl) var(--space-lg);
    }

    .input-container {
      padding: var(--space-xl) var(--space-lg);
    }

    .empty-state {
      min-height: 300px;
      padding: var(--space-2xl);
    }
  }

  @media (max-width: 480px) {
    .chat-header {
      padding: var(--space-lg) var(--space-xl);
    }

    .chat-header h2 {
      font-size: 1.25rem;
    }

    .messages-container {
      padding: var(--space-lg) var(--space-md);
    }

    .input-container {
      padding: var(--space-lg) var(--space-md);
    }

    .empty-state h3 {
      font-size: 1.25rem;
    }

    .empty-state p {
      font-size: 0.875rem;
    }
  }
</style>
