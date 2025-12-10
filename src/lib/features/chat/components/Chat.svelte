<script lang="ts">
  import { onMount, tick } from 'svelte';
  import ChatMessage from './ChatMessage.svelte';
  import MessageInput from './MessageInput.svelte';
  import TypingIndicator from './TypingIndicator.svelte';
  import type { ChatMessage as ChatMessageType } from '../../../types/chat';
  import { sendMessage, getConversation } from '../../../api/chatApi';
  import type { ProviderInfo, ModelInfo } from '../../../api/models';
  import { getAuthState } from '../../../features/auth/index.js';

  let messages = $state<ChatMessageType[]>([]);
  let isLoading = $state(false);
  let isTyping = $state(false);
  let error = $state<string | null>(null);
  let conversationId = $state<string | null>(null);
  let messagesContainer: HTMLDivElement;
  let currentStreamingMessage = $state<ChatMessageType | null>(null);
  let selectedModel = $state('gpt-5.1');
  let selectedProvider = $state('openai');
  let selectedModelInfo = $state<ProviderInfo | undefined>({
    key: 'openai',
    name: 'OpenAI',
    icon: '<svg width="20" height="20" viewBox="0 0 41 41" fill="none" xmlns="http://www.w3.org/2000/svg" stroke-width="1.5" class="text-text-primary shrink-0 icon-md"><path d="M37.5324 16.8707C37.9808 15.5241 38.1363 14.0974 37.9886 12.6859C37.8409 11.2744 37.3934 9.91076 36.676 8.68622C35.6126 6.83404 33.9882 5.3676 32.0373 4.4985C30.0864 3.62941 27.9098 3.40259 25.8215 3.85078C24.8796 2.7893 23.7219 1.94125 22.4257 1.36341C21.1295 0.785575 19.7249 0.491269 18.3058 0.500197C16.1708 0.495044 14.0893 1.16803 12.3614 2.42214C10.6335 3.67624 9.34853 5.44666 8.6917 7.47815C7.30085 7.76286 5.98686 8.3414 4.8377 9.17505C3.68854 10.0087 2.73073 11.0782 2.02839 12.312C0.956464 14.1591 0.498905 16.2988 0.721698 18.4228C0.944492 20.5467 1.83612 22.5449 3.268 24.1293C2.81966 25.4759 2.66413 26.9026 2.81182 28.3141C2.95951 29.7256 3.40701 31.0892 4.12437 32.3138C5.18791 34.1659 6.8123 35.6322 8.76321 36.5013C10.7141 37.3704 12.8907 37.5973 14.9789 37.1492C15.9208 38.2107 17.0786 39.0587 18.3747 39.6366C19.6709 40.2144 21.0755 40.5087 22.4946 40.4998C24.6307 40.5054 26.7133 39.8321 28.4418 38.5772C30.1704 37.3223 31.4556 35.5506 32.1119 33.5179C33.5027 33.2332 34.8167 32.6547 35.9659 31.821C37.115 30.9874 38.0728 29.9178 38.7752 28.684C39.8458 26.8371 40.3023 24.6979 40.0789 22.5748C39.8556 20.4517 38.9639 18.4544 37.5324 16.8707ZM22.4978 37.8849C20.7443 37.8874 19.0459 37.2733 17.6994 36.1501C17.7601 36.117 17.8666 36.0586 17.936 36.0161L25.9004 31.4156C26.1003 31.3019 26.2663 31.137 26.3813 30.9378C26.4964 30.7386 26.5563 30.5124 26.5549 30.2825V19.0542L29.9213 20.998C29.9389 21.0068 29.9541 21.0198 29.9656 21.0359C29.977 21.052 29.9842 21.0707 29.9867 21.0902V30.3889C29.9842 32.375 29.1946 34.2791 27.7909 35.6841C26.3872 37.0892 24.4838 37.8806 22.4978 37.8849ZM6.39227 31.0064C5.51397 29.4888 5.19742 27.7107 5.49804 25.9832C5.55718 26.0187 5.66048 26.0818 5.73461 26.1244L13.699 30.7248C13.8975 30.8408 14.1233 30.902 14.3532 30.902C14.583 30.902 14.8088 30.8408 15.0073 30.7248L24.731 25.1103V28.9979C24.7321 29.0177 24.7283 29.0376 24.7199 29.0556C24.7115 29.0736 24.6988 29.0893 24.6829 29.1012L16.6317 33.7497C14.9096 34.7416 12.8643 35.0097 10.9447 34.4954C9.02506 33.9811 7.38785 32.7263 6.39227 31.0064ZM4.29707 13.6194C5.17156 12.0998 6.55279 10.9364 8.19885 10.3327C8.19885 10.4013 8.19491 10.5228 8.19491 10.6071V19.808C8.19351 20.0378 8.25334 20.2638 8.36823 20.4629C8.48312 20.6619 8.64893 20.8267 8.84863 20.9404L18.5723 26.5542L15.206 28.4979C15.1894 28.5089 15.1703 28.5155 15.1505 28.5173C15.1307 28.5191 15.1107 28.516 15.0924 28.5082L7.04046 23.8557C5.32135 22.8601 4.06716 21.2235 3.55289 19.3046C3.03862 17.3858 3.30624 15.3413 4.29707 13.6194ZM31.955 20.0556L22.2312 14.4411L25.5976 12.4981C25.6142 12.4872 25.6333 12.4805 25.6531 12.4787C25.6729 12.4769 25.6928 12.4801 25.7111 12.4879L33.7631 17.1364C34.9967 17.849 36.0017 18.8982 36.6606 20.1613C37.3194 21.4244 37.6047 22.849 37.4832 24.2684C37.3617 25.6878 36.8382 27.0432 35.9743 28.1759C35.1103 29.3086 33.9415 30.1717 32.6047 30.6641C32.6047 30.5947 32.6047 30.4733 32.6047 30.3889V21.188C32.6066 20.9586 32.5474 20.7328 32.4332 20.5338C32.319 20.3348 32.154 20.1698 31.955 20.0556ZM35.3055 15.0128C35.2464 14.9765 35.1431 14.9142 35.069 14.8717L27.1045 10.2712C26.906 10.1554 26.6803 10.0943 26.4504 10.0943C26.2206 10.0943 25.9948 10.1554 25.7963 10.2712L16.0726 15.8858V11.9982C16.0715 11.9783 16.0753 11.9585 16.0837 11.9405C16.0921 11.9225 16.1048 11.9068 16.1207 11.8949L24.1719 7.25025C25.4053 6.53903 26.8158 6.19376 28.2383 6.25482C29.6608 6.31589 31.0364 6.78077 32.2044 7.59508C33.3723 8.40939 34.2842 9.53945 34.8334 10.8531C35.3826 12.1667 35.5464 13.6095 35.3055 15.0128ZM14.2424 21.9419L10.8752 19.9981C10.8576 19.9893 10.8423 19.9763 10.8309 19.9602C10.8195 19.9441 10.8122 19.9254 10.8098 19.9058V10.6071C10.8107 9.18295 11.2173 7.78848 11.9819 6.58696C12.7466 5.38544 13.8377 4.42659 15.1275 3.82264C16.4173 3.21869 17.8524 2.99464 19.2649 3.1767C20.6775 3.35876 22.0089 3.93941 23.1034 4.85067C23.0427 4.88379 22.937 4.94215 22.8668 4.98473L14.9024 9.58517C14.7025 9.69878 14.5366 9.86356 14.4215 10.0626C14.3065 10.2616 14.2466 10.4877 14.2479 10.7175L14.2424 21.9419ZM16.071 17.9991L20.4018 15.4978L24.7325 17.9975V22.9985L20.4018 25.4983L16.071 22.9985V17.9991Z" fill="currentColor"></path></svg>',
    models: [
      {
        key: 'gpt-5.1',
        name: 'gpt-5.1',
        context_window: 128000,
        max_output_tokens: 4096,
        supports_streaming: true,
        supports_tools: true,
        supports_vision: false,
        pricing: { input: 0.03, output: 0.06 },
      },
      {
        key: 'gpt-3.5-turbo',
        name: 'gpt-3.5-turbo',
        context_window: 16385,
        max_output_tokens: 4096,
        supports_streaming: true,
        supports_tools: true,
        supports_vision: false,
        pricing: { input: 0.0005, output: 0.0015 },
      },
    ],
  });
  const authState = getAuthState();

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
    selectedModel = model.name;
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

  async function handleSendMessage(content: string, files?: File[]) {
    if (isLoading) return;

    error = null;
    isLoading = true;

    // Add user message
    const userMessage: ChatMessageType = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
      files: files?.map(file => ({
        id: crypto.randomUUID(),
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
    };

    let messageAddedToArray = $state(false);

    try {
      await sendMessage({
        message: content,
        conversationId: conversationId || undefined,
        provider: selectedProvider,
        modelName: selectedModel,
        files: files,

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
          timestamp: msg.created_at ? new Date(msg.created_at) : new Date(),
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
  <div class="messages-container" bind:this={messagesContainer}>
    <div class="messages-inner">
      {#if messages.length === 0}
        <div class="empty-state">
          <div class="empty-icon-wrapper">
            <div class="empty-icon">
              <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
            </div>
          </div>
          <div class="empty-content">
            <h3>Start a conversation</h3>
            <p>Send a message to begin chatting with the AI assistant. Try asking about anything!</p>
          </div>
        </div>
      {:else}
        {#each messages as message (message.id)}
          <ChatMessage 
            {message} 
            onEdit={handleEditMessage} 
            onDelete={handleDeleteMessage}
            user={authState.user}
            selectedModelInfo={selectedModelInfo}
          />
        {/each}
        
        {#if isTyping}
          <TypingIndicator />
        {/if}
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
            <span class="error-title">Something went wrong</span>
            <span class="error-message">{error}</span>
          </div>
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
      {selectedProvider}
      onRemoveModel={handleRemoveModel}
      onModelSelect={selectModel}
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

  .messages-container {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    scroll-behavior: smooth;
    position: relative;
  }

  .messages-inner {
    max-width: 900px;
    margin: 0 auto;
    width: 100%;
    padding: 1rem 0rem;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 500px;
    text-align: center;
    padding: 3rem 2rem;
    position: relative;
  }

  .empty-icon-wrapper {
    position: relative;
    margin-bottom: 2rem;
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
    margin: 0 0 0.75rem 0;
    font-size: 1.75rem;
    font-weight: 700;
    color: var(--text-primary);
    background: linear-gradient(135deg, var(--text-primary) 0%, #8b5cf6 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .empty-content p {
    margin: 0 0 2rem 0;
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
    border-top: 1px solid var(--glass-stroke-dark);
    background: var(--bg-primary);
    position: relative;
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
    .messages-inner {
      padding: 1.5rem 1rem;
    }

    .empty-state {
      min-height: 400px;
      padding: 2rem 1rem;
    }

    .empty-icon {
      width: 100px;
      height: 100px;
    }

    .empty-content h3 {
      font-size: 1.5rem;
    }

    .input-container {
      padding: 1rem;
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
