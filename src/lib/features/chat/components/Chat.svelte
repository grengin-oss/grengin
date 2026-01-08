<script lang="ts">
  import { onMount, tick } from 'svelte';
  import ChatMessage from './ChatMessage.svelte';
  import MessageInput from './MessageInput.svelte';
  import TypingIndicator from './TypingIndicator.svelte';
  import type { ChatMessage as ChatMessageType } from '../../../types/chat';
  import { sendMessage, getConversation, type UploadedFile } from '../../../api/chatApi';
  import type { ProviderInfo, ModelInfo } from '../../../api/models';
  import { getModels } from '../../../api/models';
  import { _ } from 'svelte-i18n';
  import { ApiError } from '../../../api/client';
  import { getLocalizedError } from '../../../utils/errorLocalization';

  let messages = $state<ChatMessageType[]>([]);
  let isLoading = $state(false);
  let isTyping = $state(false);
  let error = $state<ApiError | null>(null);
  let conversationId = $state<string | null>(null);
  // Track if we're still loading the initial conversation
  let isLoadingConversation = $state(typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('chatId'));
  let messagesContainer: HTMLDivElement;
  let messageInput: MessageInput;
  let currentStreamingMessage = $state<ChatMessageType | null>(null);
  let selectedModel = $state('gpt-5.2');
  let selectedProvider = $state('openai');
  let selectedModelInfo = $state<ProviderInfo | undefined>(undefined);

  // Models state
  let providers = $state<ProviderInfo[]>([]);
  let loadingModels = $state(true);
  let modelsError = $state<string | null>(null);

  async function loadModels() {
    loadingModels = true;
    modelsError = null;
    try {
      const response = await getModels();
      providers = response.providers;
    } catch (error) {
      console.error('Failed to load models:', error);
      modelsError = $_('chat.errors.failedToLoadModels');
    } finally {
      loadingModels = false;
    }
  }

  // Listen for URL changes
  function handleUrlChange() {
    const urlParams = new URLSearchParams(window.location.search);
    const chatId = urlParams.get('chatId');
    
    
    if (chatId !== conversationId) {
      loadConversationFromUrl();
    }
  }

  // Update URL with conversation ID
  function updateUrlWithConversationId(id: string) {
    const url = new URL(window.location.href);
    url.searchParams.set('chatId', id);
    window.history.pushState({}, '', url.toString());
  }

  // Handle model selection
  function selectModel(provider: ProviderInfo, model: ModelInfo) {
    selectedProvider = provider.key;
    selectedModel = model.key;
    selectedModelInfo = provider;
  }

  // Handle model removal
  function handleRemoveModel() {
    selectedModel = '';
    selectedProvider = '';
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

  async function handleSendMessage(content: string, uploadedFiles?: UploadedFile[], webSearch?: boolean) {
    if (isLoading) return;

    error = null;
    isLoading = true;

    // Add user message
    const userMessage: ChatMessageType = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
      files: uploadedFiles?.map(file => ({
        id: file.id,
        name: file.name,
        size: file.size,
        type: file.type
      })) || []
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
      model: selectedModel,
    };

    let messageAddedToArray = $state(false);

    try {
      await sendMessage({
        message: content,
        conversationId: conversationId || undefined,
        provider: selectedProvider,
        modelName: selectedModel,
        uploadedFiles: uploadedFiles,
        webSearch: webSearch,

        onStart: (data) => {
          
          // Update conversation ID and URL
          const newConversationId = data.conversation_id;
          if (newConversationId && newConversationId !== conversationId) {
            conversationId = newConversationId;
            updateUrlWithConversationId(newConversationId);
          }
          
          // Refresh sidebar chat history when conversation starts
          window.dispatchEvent(new CustomEvent('refreshChatHistory'));
          
          isTyping = false;
          if (currentStreamingMessage) {
            messages = [...messages, currentStreamingMessage];
            messageAddedToArray = true;
          }
          scrollToBottom();
        },
        onToken: (token) => {
          if (currentStreamingMessage) {
            // Add message to array on first token if not already added
            if (!messageAddedToArray && token.trim()) {
              messages = [...messages, currentStreamingMessage];
              messageAddedToArray = true;
              console.log('Messages after adding on token:', messages.length);
            }
            
            // Create a new message object with updated content
            currentStreamingMessage = {
              ...currentStreamingMessage,
              content: currentStreamingMessage.content + token
            };
            console.log('Updated content:', currentStreamingMessage.content);
            // Update the message in the array
            messages = messages.map(m => 
              m.id === currentStreamingMessage?.id ? currentStreamingMessage : m
            );
            const updatedMessage = messages.find(m => m.id === currentStreamingMessage?.id);
            console.log('Message in array:', updatedMessage?.content);
            console.log('Messages array length:', messages.length);
            scrollToBottom();
          }
        },
        onTitle: (title) => {
          console.log('Conversation title:', title);
        },
        onDone: (data) => {
          console.log('Stream completed:', data);
          if (currentStreamingMessage) {
            currentStreamingMessage.isStreaming = false;
            messages = messages.map(m =>
              m.id === currentStreamingMessage?.id ? { ...currentStreamingMessage } : m
            );
            console.log('Final message content:', currentStreamingMessage.content);
          }
          currentStreamingMessage = null;
          isLoading = false;
          isTyping = false;
          // Refocus input after streaming completes
          messageInput?.focus();
        },
        onError: (errorMessage) => {
          // Store the error - it should be an ApiError instance
          const apiError = errorMessage instanceof ApiError 
            ? errorMessage 
            : new ApiError(500, errorMessage instanceof Error ? errorMessage.message : String(errorMessage));
          
          error = apiError;
          isTyping = false;
          if (currentStreamingMessage) {
            currentStreamingMessage.error = getLocalizedError(apiError, 'description', $_) || apiError.description;
            currentStreamingMessage.isStreaming = false;
            messages = messages.map(m =>
              m.id === currentStreamingMessage?.id ? { ...currentStreamingMessage } : m
            );
          }
          currentStreamingMessage = null;
          isLoading = false;
          // Refocus input after error
          messageInput?.focus();
        },
      });
    } catch (err) {
      // Convert all errors to ApiError for consistent handling
      const apiError = err instanceof ApiError 
        ? err 
        : new ApiError(500, err instanceof Error ? err.message : $_('chat.errors.failedToSendMessage'));
      
      error = apiError;
      isTyping = false;
      isLoading = false;
      currentStreamingMessage = null;
      // Refocus input after exception
      messageInput?.focus();
    }
  }

  function handleEditMessage(id: string, newContent: string) {
    messages = messages.map(msg => 
      msg.id === id ? { ...msg, content: newContent } : msg
    );
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
        isLoadingConversation = true;
        isLoading = true;
        error = null;

        const conversation = await getConversation(chatId);
        conversationId = chatId;

        // Convert messages to ChatMessageType format
        messages = (conversation.messages || []).map((msg: any) => ({
          id: msg.id,
          role: msg.role,
          content: msg.parts.text || '',
          timestamp: msg.created_at || new Date().toISOString(),
          model: msg.model,
          usage: msg.usage,
          files: msg.parts.files || []
        }));

        // Extract model and provider from conversation
        // Use last message model if messages exist, otherwise use conversation model
        let modelToUse = conversation.model;
        if (conversation.messages && conversation.messages.length > 0) {
          const lastMessage = conversation.messages[conversation.messages.length - 1];
          if (lastMessage.model) {
            modelToUse = lastMessage.model;
          }
        }
        
        if (modelToUse) {
          selectedModel = modelToUse;
          // Find the provider that contains this model
          const providerWithModel = providers.find(p => 
            p.models.some(m => m.key === modelToUse || m.name === modelToUse)
          );
          
          if (providerWithModel) {
            selectedProvider = providerWithModel.key;
            selectedModelInfo = providerWithModel;
          } else {
            // Fallback to default provider
            selectedProvider = 'openai';
            selectedModelInfo = providers.find(p => p.key === 'openai') || providers[0];
          }
        }

        scrollToBottom(false);
      } catch (err) {
        // Convert all errors to ApiError for consistent handling
        const apiError = err instanceof ApiError 
          ? err 
          : new ApiError(500, err instanceof Error ? err.message : $_('chat.errors.failedToLoadConversation'));
        
        error = apiError;
        console.error('Failed to load conversation:', err);
        messages = []; // Clear messages on error
      } finally {
        isLoading = false;
        isLoadingConversation = false;
      }
    } else {
      // No chatId in URL, clear everything
      console.log('No chatId in URL, clearing everything');
      conversationId = null;
      messages = [];
      error = null;
      isLoadingConversation = false;
      // Set default model and provider
      selectedModel = 'gpt-5.2';
      selectedProvider = 'openai';
      selectedModelInfo = providers.find(p => p.key === 'openai') || providers[0];
    }
  }

  // Focus the chat input when requested (e.g., when "New Chat" is clicked)
  function handleFocusChatInput() {
    messageInput?.focus();
  }

  onMount(() => {
    scrollToBottom(false);
    loadConversationFromUrl();
    loadModels();

    // Focus the chat input if nothing else is focused
    if (!document.activeElement || document.activeElement === document.body) {
      messageInput?.focus();
    }

    // Listen for URL changes (when using history.pushState)
    window.addEventListener('popstate', handleUrlChange);

    // Listen for focus chat input event (from Sidebar "New Chat" button)
    window.addEventListener('focusChatInput', handleFocusChatInput);

    // Also listen for custom pushstate events
    const originalPushState = history.pushState;
    history.pushState = function(...args) {
      originalPushState.apply(history, args);
      setTimeout(handleUrlChange, 0); // Small delay to ensure URL is updated
    };

    return () => {
      window.removeEventListener('popstate', handleUrlChange);
      window.removeEventListener('focusChatInput', handleFocusChatInput);
      history.pushState = originalPushState;
    };
  });
</script>

{#if isLoadingConversation}
  <!-- Loading state: wait until we know if there are messages -->
  <div class="chat-container chat-container--loading"></div>
{:else if messages.length === 0}
  <!-- Empty state: centered layout with input included -->
  <div class="chat-container chat-container--empty">
    <div class="empty-state-container">
      <div class="empty-icon-wrapper">
        <div class="empty-icon">
          <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
        </div>
      </div>
      <div class="empty-content">
        <h3>{$_('chat.emptyState.title')}</h3>
        <p>{$_('chat.emptyState.description')}</p>
      </div>
      <div class="empty-state-input">
        <MessageInput
          bind:this={messageInput}
          onSend={handleSendMessage}
          disabled={isLoading}
          placeholder={$_('chat.messageInput.placeholderWithModel', { values: { model: selectedModel } })}
          {selectedModel}
          {selectedProvider}
          onRemoveModel={handleRemoveModel}
          onModelSelect={selectModel}
          {providers}
          {loadingModels}
          {modelsError}
        />
        <p class="ai-disclaimer">{$_('chat.emptyState.aiDisclaimer')}</p>
      </div>
    </div>

    {#if error && !currentStreamingMessage}
      <div class="error-banner error-banner--centered">
        <div class="error-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        </div>
        <div class="error-content">
          <span class="error-title">
            {getLocalizedError(error, 'description', $_) || $_('error.fallback.description')}
          </span>
          {#if getLocalizedError(error, 'solution', $_)}
            <span class="error-message">
              {getLocalizedError(error, 'solution', $_)}
            </span>
          {/if}
        </div>
        <button class="dismiss-btn" onclick={() => error = null} aria-label={$_('chat.errors.dismissError')} title={$_('chat.errors.dismissError')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    {/if}
  </div>
{:else}
  <!-- Active chat: bottom-anchored input -->
  <div class="chat-container">
    <div class="messages-container" bind:this={messagesContainer}>
      <div class="messages-inner">
        {#each messages as message (message.id)}
          <ChatMessage
            {message}
            onEdit={handleEditMessage}
            selectedModelInfo={selectedModelInfo}
            providers={providers}
          />
        {/each}

        {#if isTyping}
          <TypingIndicator />
        {/if}

        {#if error && !currentStreamingMessage}
          <div class="error-banner">
            <div class="error-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
            </div>
            <div class="error-content">
              <span class="error-title">
                {getLocalizedError(error, 'description', $_) || $_('error.fallback.description')}
              </span>
              {#if getLocalizedError(error, 'solution', $_)}
                <span class="error-message">
                  {getLocalizedError(error, 'solution', $_)}
                </span>
              {/if}
            </div>
            <button class="dismiss-btn" onclick={() => error = null} aria-label={$_('chat.errors.dismissError')} title={$_('chat.errors.dismissError')}>
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
        bind:this={messageInput}
        onSend={handleSendMessage}
        disabled={isLoading}
        placeholder={$_('chat.messageInput.placeholderWithModel', { values: { model: selectedModel } })}
        {selectedModel}
        {selectedProvider}
        onRemoveModel={handleRemoveModel}
        onModelSelect={selectModel}
        {providers}
        {loadingModels}
        {modelsError}
      />
      <p class="ai-disclaimer">{$_('chat.emptyState.aiDisclaimer')}</p>
    </div>
  </div>
{/if}

<style>
  .chat-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100%;
    background: var(--bg-primary);
  }

  .chat-container--loading {
    display: flex;
  }

  .messages-container {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    scroll-behavior: smooth;
    position: relative;
  }

  .messages-inner {
    /* Dynamic max-width: 90ch for readability, clamped between 600px and 65vw */
    max-width: clamp(600px, 90ch, 65vw);
    margin: 0 auto;
    width: 100%;
    padding: var(--space-2xl);
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .chat-container--empty {
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
  }

  .empty-state-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 2rem;
    gap: 1.5rem;
    width: 100%;
    max-width: 600px;
  }

  .empty-state-input {
    width: 100%;
    max-width: 100%;
  }

  .ai-disclaimer {
    margin: 0.5rem 0 0 0;
    font-size: 0.75rem;
    color: var(--text-tertiary, rgba(128, 128, 128, 0.6));
    text-align: center;
  }

  .input-container .ai-disclaimer {
    margin: 0.5rem 0 -0.5rem 0;
  }

  .error-banner--centered {
    position: absolute;
    bottom: 2rem;
    left: 50%;
    transform: translateX(-50%);
    max-width: 500px;
    width: calc(100% - 2rem);
  }

  .empty-icon-wrapper {
    position: relative;
  }

  .empty-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 120px;
    height: 120px;
    background: linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%);
    border-radius: 24px;
    color: var(--text-secondary);
    position: relative;
    animation: float 3s ease-in-out infinite;
  }

  @keyframes float {
    0%, 100% { transform: translateY(0px); }
    50% { transform: translateY(-10px); }
  }

  .empty-content h3 {
    margin: 0 0 0.5rem 0;
    font-size: 1.75rem;
    font-weight: 700;
    color: var(--text-primary);
    background: linear-gradient(135deg, var(--text-primary) 0%, #8b5cf6 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .empty-content p {
    margin: 0;
    font-size: 1rem;
    color: var(--text-secondary);
    max-width: 480px;
    line-height: 1.6;
  }

  .error-banner {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem 1.25rem;
    margin: 1rem 0;
    background: linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(239, 68, 68, 0.05) 100%);
    border: 1px solid rgba(239, 68, 68, 0.2);
    border-radius: 12px;
    color: #ef4444;
    backdrop-filter: blur(10px);
    animation: slideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;
    overflow: hidden;
  }

  .error-banner::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: linear-gradient(90deg, #ef4444 0%, #f87171 100%);
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

  .error-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: rgba(239, 68, 68, 0.1);
    border-radius: 8px;
    flex-shrink: 0;
  }

  .error-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .error-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: #ef4444;
  }

  .error-message {
    font-size: 0.875rem;
    color: rgba(239, 68, 68, 0.8);
    line-height: 1.5;
  }

  .dismiss-btn {
    padding: 0.5rem;
    background: transparent;
    border: none;
    color: rgba(239, 68, 68, 0.6);
    cursor: pointer;
    border-radius: 8px;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .dismiss-btn:hover {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
    transform: scale(1.1);
  }

  .input-container {
    flex-shrink: 0;
    padding: 1.25rem 1.5rem;
    background: var(--bg-primary);
    position: relative;
    max-width: clamp(600px, 90ch, 65vw);
    margin: 0 auto;
    width: 100%;
  }

  /* Custom scrollbar */
  .messages-container::-webkit-scrollbar {
    width: 8px;
  }

  .messages-container::-webkit-scrollbar-track {
    background: transparent;
  }

  .messages-container::-webkit-scrollbar-thumb {
    background: var(--glass-stroke-light);
    border-radius: 4px;
    transition: background 0.2s ease;
  }

  .messages-container::-webkit-scrollbar-thumb:hover {
    background: var(--text-secondary);
  }

  @media (max-width: 768px) {
    .chat-container {
      height: 100%;
    }

    .messages-inner {
      padding: var(--space-md);
    }

    .messages-container {
      min-height: 0;
    }

    .empty-state-container {
      padding: 1.5rem 1rem;
      gap: 1rem;
    }

    .empty-icon {
      width: 100px;
      height: 100px;
    }

    .empty-content h3 {
      font-size: 1.5rem;
    }

    .input-container {
      padding: 0.75rem 1rem;
      max-width: 100%;
    }

    .ai-disclaimer {
      margin: 0.25rem 0 0 0;
      font-size: 0.75rem;
    }

    .input-container .ai-disclaimer {
      margin: 0.25rem 0 -0.25rem 0;
    }
  }

  @media (max-width: 480px) {
    .empty-icon {
      width: 80px;
      height: 80px;
    }

    .empty-content h3 {
      font-size: 1.25rem;
    }

    .empty-content p {
      font-size: 0.875rem;
    }
  }
</style>
