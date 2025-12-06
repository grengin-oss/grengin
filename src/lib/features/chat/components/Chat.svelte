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
                  <div class="provider-section">
                    <div class="provider-header">
                      {@html provider.icon}
                      <span class="provider-name">{provider.name}</span>
                    </div>
                    {#each provider.models as model}
                      <div class="model-item">
                        <button class="dropdown-item" onclick={() => selectModel(provider, model)}>
                          <div class="dropdown-item-logo">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                              <path d="M12 2L2 7L12 12L22 7L12 2Z"></path>
                              <path d="M2 17L12 22L22 17"></path>
                              <path d="M2 12L12 17L22 12"></path>
                            </svg>
                          </div>
                          <div class="model-info">
                            <span class="model-name">{model.name}</span>
                            {#if model.context_window}
                              <span class="model-details">{model.context_window.toLocaleString()} context</span>
                            {/if}
                          </div>
                        </button>
                        {#if model.versions && model.versions.length > 0}
                          <div class="model-versions">
                            {#each model.versions as version}
                              <button class="dropdown-item version-item" onclick={() => selectModel(provider, version)}>
                                <div class="version-info">
                                  <span class="version-name">{version.name}</span>
                                  {#if version.context_window}
                                    <span class="version-details">{version.context_window.toLocaleString()} context</span>
                                  {/if}
                                </div>
                              </button>
                            {/each}
                          </div>
                        {/if}
                      </div>
                    {/each}
                  </div>
                {/each}
              {/if}
            </div>
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
    padding: 0.25rem 0.5rem;
    background: transparent;
    border: none;
    border-radius: 0.5rem;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .model-logo {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 8px;
    color: white;
  }

  .dropdown-button:hover {
    background: rgba(255, 255, 255, 0.05);
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
    top: 100%;
    left: 0;
    margin-top: 0.5rem;
    background: var(--bg-primary);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 0.75rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    min-width: 280px;
    max-width: 400px;
    max-height: 400px;
    overflow-y: auto;
    z-index: 1000;
  }

  .dropdown-loading,
  .dropdown-error {
    padding: 1rem;
    text-align: center;
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .dropdown-error {
    color: var(--brand-red);
  }

  .loading-spinner {
    width: 16px;
    height: 16px;
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

  .provider-section {
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }

  .provider-section:last-child {
    border-bottom: none;
  }

  .provider-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: rgba(255, 255, 255, 0.02);
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }

  .provider-name {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .model-item {
    position: relative;
  }

  .model-versions {
    background: rgba(0, 0, 0, 0.2);
    border-left: 2px solid rgba(255, 255, 255, 0.1);
  }

  .version-item {
    padding-left: 2.5rem;
    background: rgba(0, 0, 0, 0.1);
  }

  .version-item:hover {
    background: rgba(255, 255, 255, 0.03);
  }

  .model-info {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .model-name {
    font-size: 0.9375rem;
    font-weight: 500;
  }

  .model-details {
    font-size: 0.75rem;
    color: var(--text-secondary);
    opacity: 0.8;
  }

  .version-info {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .version-name {
    font-size: 0.875rem;
    font-weight: 400;
  }

  .version-details {
    font-size: 0.7rem;
    color: var(--text-secondary);
    opacity: 0.7;
  }

  .dropdown-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    color: var(--text-primary);
    text-decoration: none;
    font-size: 0.9375rem;
    transition: background-color 0.15s ease;
  }

  .dropdown-item:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .dropdown-item:first-child {
    border-radius: 0.75rem 0.75rem 0 0;
  }

  .dropdown-item:last-child {
    border-radius: 0 0 0.75rem 0.75rem;
  }

  .dropdown-item-logo {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    color: var(--text-secondary);
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
