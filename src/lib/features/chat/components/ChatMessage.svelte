<script lang="ts">
  import type { ChatMessage, McpAuthRequest } from '../../../types/chat';
  import type { ToolResult } from '../../../types/toolCall';
  import { renderMarkdown, copyToClipboard } from '../../../utils/markdown';
  import { onMount, onDestroy, tick } from 'svelte';
  import type { ProviderInfo } from '../../../api/models';

  let isDarkMode = $state(false);

  function syncThemeState() {
    isDarkMode = document.documentElement.classList.contains('dark')
      || window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function getIconForTheme(provider?: ProviderInfo): string | undefined {
    if (!provider) return undefined;
    return isDarkMode ? (provider.icon_dark || provider.icon) : provider.icon;
  }

  // Highlight.js themes are imported statically in app.css and gated by
  // prefers-color-scheme media queries, so we only need to keep isDarkMode
  // in sync for provider-icon swapping below.
  onMount(() => {
    syncThemeState();
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', syncThemeState);
    return () => mediaQuery.removeEventListener('change', syncThemeState);
  });
  import {
    speechSynthesisSupported,
    subscribeTTSState,
    toggleSpeaking,
    stopSpeaking,
    type TTSState,
  } from '../../../utils/tts';
  import { downloadFile } from '../../../api/fileApi';
  import { _ } from 'svelte-i18n';
  import { get } from 'svelte/store';
  import WebSearch from './WebSearch.svelte';
  import ToolCallTimeline from './ToolCallTimeline.svelte';
  import McpOAuthPrompt from './McpOAuthPrompt.svelte';

  interface Props {
    message: ChatMessage & { files?: Array<{ id: string; name?: string; type?: string }> };
    onEdit?: (id: string, newContent: string) => void;
    selectedModelInfo?: ProviderInfo;
    providers?: ProviderInfo[];
    onMcpAuthConnected?: (serverId: string) => void;
    onMcpAuthError?: (serverId: string, error: string) => void;
    onMcpAuthStatusChange?: (serverId: string, status: McpAuthRequest['status']) => void;
  }

  let { message, onEdit, selectedModelInfo, providers, onMcpAuthConnected, onMcpAuthError, onMcpAuthStatusChange }: Props = $props();
  let isEditing = $state(false);
  let editContent = $state(message.content);
  let showActions = $state(false);
  let messageContainer: HTMLDivElement;
  let editTextarea: HTMLTextAreaElement | undefined;

  // TTS state
  let ttsState = $state<TTSState>({
    messageId: null,
    isSpeaking: false,
    isPaused: false,
    utterance: null,
  });
  let unsubscribeTTS: (() => void) | null = null;

  const isSpeaking = $derived(
    ttsState.messageId === message.id && ttsState.isSpeaking && !ttsState.isPaused
  );
  const isPaused = $derived(
    ttsState.messageId === message.id && ttsState.isSpeaking && ttsState.isPaused
  );
  const isActive = $derived(ttsState.messageId === message.id && ttsState.isSpeaking);

  // Find the provider that matches the message's model
  const messageProvider = $derived(
    providers?.find(provider =>
      provider.models.some(model =>
        model.key === message.model || model.key === message.model
      )
    )
  );

  function handleTTSToggle() {
    toggleSpeaking(message.id, message.content);
  }

  function handleTTSStop() {
    stopSpeaking();
  }

  let renderedContent = $state('');
  let isRenderingMarkdown = $state(false);

  // Async markdown rendering with copy button addition
  $effect(() => {
    const render = async () => {
      if (message.role === 'assistant') {
        isRenderingMarkdown = true;
        try {
          renderedContent = await renderMarkdown(message.content);
          // Add copy buttons after content is rendered
          await tick();
          addCopyButtonsToCodeBlocks();
        } catch {
          renderedContent = `<p>${message.content}</p>`;
        } finally {
          isRenderingMarkdown = false;
        }
      } else {
        renderedContent = message.content;
      }
    };
    
    render();
  });

  // Toggle actions visibility on tap (for touch devices)
  function handleMessageTap(e: MouseEvent) {
    // Don't toggle if clicking on action buttons or links
    const target = e.target as HTMLElement;
    if (target.closest('.message-actions') || target.closest('a') || target.closest('button')) {
      return;
    }
    showActions = !showActions;
  }

  function handleMessageKeydown(e: KeyboardEvent) {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      showActions = !showActions;
    }
  }

  // Close actions when clicking outside (for touch devices)
  function handleClickOutside(e: MouseEvent) {
    if (messageContainer && !messageContainer.contains(e.target as Node)) {
      showActions = false;
    }
  }

  onMount(() => {
    document.addEventListener('click', handleClickOutside);

    // Subscribe to TTS state changes
    if (speechSynthesisSupported) {
      unsubscribeTTS = subscribeTTSState((newState) => {
        ttsState = newState;
      });
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  });

  onDestroy(() => {
    // Clean up TTS subscription
    if (unsubscribeTTS) {
      unsubscribeTTS();
    }
    // Stop TTS if this message was speaking
    if (ttsState.messageId === message.id && ttsState.isSpeaking) {
      stopSpeaking();
    }
  });

  function startEdit() {
    if (message.role !== 'user' || message.isStreaming) return;
    isEditing = true;
    editContent = message.content;
    tick().then(() => {
      if (editTextarea) {
        editTextarea.focus();
        editTextarea.style.height = 'auto';
        editTextarea.style.height = editTextarea.scrollHeight + 'px';
      }
    });
  }

  function cancelEdit() {
    isEditing = false;
    editContent = message.content;
  }

  function saveEdit() {
    if (editContent.trim() && onEdit) {
      onEdit(message.id, editContent.trim());
      isEditing = false;
    }
  }

  let copySuccess = $state(false);

  // File blob URLs state
  let fileBlobUrls = $state<Map<string, string>>(new Map());
  let fileLoadingStates = $state<Map<string, boolean>>(new Map());

  // Image preview modal state
  let previewImage = $state<{ url: string; name: string } | null>(null);

  function openImagePreview(blobUrl: string, fileName: string) {
    previewImage = { url: blobUrl, name: fileName };
  }

  function closeImagePreview() {
    previewImage = null;
  }

  async function handleFileClick(fileId: string, fileName: string) {
    try {
      // Download file with authentication
      const blobUrl = await downloadFile(fileId);
      if (blobUrl) {
        // Open blob URL in new tab
        window.open(blobUrl, '_blank');
      } else {
        console.error('Failed to download file');
      }
    } catch (err) {
      console.error('Error downloading file:', err);
    }
  }

  // Derived image count for dynamic grid sizing
  const imageFiles = $derived(message.files?.filter(f => f.type?.startsWith('image/')) ?? []);
  const imageCount = $derived(imageFiles.length);
  const nonImageFiles = $derived(message.files?.filter(f => !f.type?.startsWith('image/')) ?? []);

  // Compute grid-template-columns dynamically (repeat() needs a real integer, not var())
  // Fixed-size columns so every image is identical; parent shrinks via fit-content
  const gridColumns = $derived.by(() => {
    const imgs = imageCount;
    const cols = Math.min(imgs || 1, 3);
    return `repeat(${cols}, var(--img-size))`;
  });

  // Helper functions for file handling
  function isImage(type?: string): boolean {
    return type?.startsWith('image/') || false;
  }

  function getFileIcon(type?: string): string {
    if (!type) return '📎';
    if (type.startsWith('image/')) return '🖼️';
    if (type.startsWith('video/')) return '🎥';
    if (type.startsWith('audio/')) return '🎵';
    if (type.includes('pdf')) return '📄';
    if (type.includes('text')) return '📝';
    if (type.includes('zip') || type.includes('archive')) return '📦';
    if (type.includes('word') || type.includes('doc')) return '📝';
    if (type.includes('excel') || type.includes('sheet')) return '📊';
    if (type.includes('powerpoint') || type.includes('presentation')) return '📊';
    return '📎';
  }

  function formatFileSize(bytes?: number): string {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  // Load file binary data only for image files
  let loadedFileIds = new Set<string>();

  $effect(() => {
    const files = message.files;
    
    if (files && files.length > 0) {
      files.forEach((file) => {
        // Only fetch blob URLs for images and if not already loaded
        if (isImage(file.type) && !loadedFileIds.has(file.id)) {
          loadedFileIds.add(file.id);
          
          // Set loading state immediately
          fileLoadingStates.set(file.id, true);
          fileLoadingStates = new Map(fileLoadingStates);

          // Load image asynchronously without blocking
          downloadFile(file.id).then((blobUrl) => {
            if (blobUrl) {
              fileBlobUrls.set(file.id, blobUrl);
              fileBlobUrls = new Map(fileBlobUrls);
            }
            // Clear loading state
            fileLoadingStates.set(file.id, false);
            fileLoadingStates = new Map(fileLoadingStates);
          }).catch((err) => {
            console.error('Failed to load image:', err);
            fileLoadingStates.set(file.id, false);
            fileLoadingStates = new Map(fileLoadingStates);
          });
        }
      });
    }

    // Cleanup blob URLs when component unmounts
    return () => {
      fileBlobUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  });

  // Function to add copy buttons to code blocks
  function addCopyButtonsToCodeBlocks() {
    if (messageContainer && message.role === 'assistant') {
      const codeBlocks = messageContainer.querySelectorAll('pre');
      codeBlocks.forEach((pre, index) => {
        if (!pre.querySelector('.copy-code-btn')) {
          const code = pre.querySelector('code');
          if (code) {
            const button = document.createElement('button');
            button.className = 'copy-code-btn';
            const copyText = get(_)('chat.message.copy');
            const copiedText = get(_)('chat.message.copied');
            button.innerHTML = `
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="m5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              <span>${copyText}</span>
            `;
            button.onclick = async () => {
              const codeText = code.textContent || '';
              const success = await copyToClipboard(codeText);
              if (success) {
                button.innerHTML = `
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20,6 9,17 4,12"></polyline>
                  </svg>
                  <span>${copiedText}</span>
                `;
                setTimeout(() => {
                  button.innerHTML = `
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                      <path d="m5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                  `;
                }, 2000);
              }
            };
            pre.style.position = 'relative';
            pre.appendChild(button);
          }
        }
      });
    }
  }

  async function copyMessageContent() {
    const success = await copyToClipboard(message.content);
    if (success) {
      copySuccess = true;
      setTimeout(() => {
        copySuccess = false;
      }, 2000);
    }
  }
</script>

<div
  class="message"
  class:user={message.role === 'user'}
  class:assistant={message.role !== 'user'}
  class:streaming={message.isStreaming}
  class:actions-visible={showActions}
  class:has-images={message.role === 'user' && imageCount > 0}
  bind:this={messageContainer}
  onclick={handleMessageTap}
  onkeydown={handleMessageKeydown}
  role="button"
  tabindex="-1"
  aria-pressed={showActions}
>
  <!-- Avatar only for assistant messages -->
  {#if message.role !== 'user'}
    <div class="message-avatar">
      <div class="model-avatar">
        {#if messageProvider?.icon}
          <img src={getIconForTheme(messageProvider)} alt="" class="provider-icon-img" />
        {/if}
      </div>
    </div>
  {/if}

  <div class="message-content">
    <!-- Tool calls display (if any) -->
    {#if message.mergedWebSearch}
      <div class="tool-calls-container">
        <WebSearch mergedWebSearch={message.mergedWebSearch}/>
      </div>
    {/if}

    <!-- MCP tool call timeline (non-web-search tools) -->
    {#if message.toolCalls && message.toolCalls.some(tc => tc.kind !== 'web_search')}
      <div class="tool-calls-container">
        <ToolCallTimeline
          toolCalls={message.toolCalls}
          toolResults={message.toolsResults as ToolResult[] || []}
        />
      </div>
    {/if}

    {#if message.role === 'user'}
      <!-- Edit mode UI hidden for now
      {#if isEditing}
        <div class="edit-container">
          <textarea
            bind:this={editTextarea}
            bind:value={editContent}
            class="edit-textarea"
            oninput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = 'auto';
              target.style.height = target.scrollHeight + 'px';
            }}
            onkeydown={(e) => {
              if (e.key === 'Escape') cancelEdit();
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                saveEdit();
              }
            }}
          ></textarea>
          <div class="edit-actions">
            <button class="btn-save" onclick={saveEdit}>Save</button>
            <button class="btn-cancel" onclick={cancelEdit}>Cancel</button>
          </div>
        </div>
      {:else}
      -->
        <div class="user-message">
          {#if !message.isStreaming}
            <div class="message-actions">
              <button
                class="action-btn user-copy-btn"
                class:success={copySuccess}
                onclick={copyMessageContent}
                title={$_('chat.message.copyContent')}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  {#if copySuccess}
                    <polyline points="20,6 9,17 4,12"></polyline>
                  {:else}
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  {/if}
                </svg>
              </button>
              <!-- Edit button hidden for now
              <button class="action-btn" onclick={startEdit} title="Edit message">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </button>
              -->
            </div>
          {/if}
          <div class="message-body">
            <p>{message.content}</p>
            {#if message.files && message.files.length > 0}
              <div class="message-files">
                {#each message.files as file}
                  {#if isImage(file.type)}
                    {#if fileLoadingStates.get(file.id)}
                      <div class="image-loader">
                        <div class="spinner"></div>
                        <div class="loader-text">{$_('chat.message.loadingImage')}</div>
                      </div>
                    {:else if fileBlobUrls.has(file.id)}
                      {@const blobUrl = fileBlobUrls.get(file.id)}
                      {#if blobUrl}
                        <button 
                          class="message-image-btn"
                          onclick={() => openImagePreview(blobUrl, file.name || $_('chat.message.imageAlt'))}
                          aria-label={file.name || $_('chat.message.imageAlt')}
                          title={file.name || $_('chat.message.imageAlt')}
                        >
                          <img 
                            src={blobUrl} 
                            alt={file.name || $_('chat.message.imageAlt')} 
                            class="message-image"
                          />
                        </button>
                      {/if}
                    {/if}
                  {:else}
                    <button 
                      class="file-box"
                      onclick={() => handleFileClick(file.id, file.name || $_('chat.message.fileFallback'))}
                      aria-label={file.name || $_('chat.message.fileFallback')}
                      title={file.name || $_('chat.message.fileFallback')}
                    >
                      <div class="file-icon-large">{getFileIcon(file.type)}</div>
                      <div class="file-info">
                        <div class="file-name">{file.name || $_('chat.message.fileFallback')}</div>
                        {#if file.type}
                          <div class="file-type">{file.type}</div>
                        {/if}
                      </div>
                    </button>
                  {/if}
                {/each}
              </div>
            {/if}
          </div>
        </div>
      <!-- {/if} end of edit mode conditional -->
    {:else if message.content || (message.files && message.files.length > 0)}
      <div class="assistant-message">
        {#if !message.isStreaming}
          <div class="message-actions" class:tts-active={isActive}>
            <!-- TTS Toggle Button -->
            {#if speechSynthesisSupported}
              <button
                class="action-btn"
                onclick={handleTTSToggle}
                aria-label={isSpeaking ? $_('chat.message.pause') : isPaused ? $_('chat.message.resume') : $_('chat.message.listen')}
                title={isSpeaking ? $_('chat.message.pause') : isPaused ? $_('chat.message.resume') : $_('chat.message.listen')}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  {#if isSpeaking}
                    <!-- Pause icon -->
                    <rect x="6" y="4" width="4" height="16"></rect>
                    <rect x="14" y="4" width="4" height="16"></rect>
                  {:else if isPaused}
                    <!-- Play icon -->
                    <polygon points="5,3 19,12 5,21"></polygon>
                  {:else}
                    <!-- Speaker icon -->
                    <polygon points="11,5 6,9 2,9 2,15 6,15 11,19"></polygon>
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
                  {/if}
                </svg>
              </button>
              <!-- Stop Button (only shown when active) -->
              {#if isActive}
                <button
                  class="action-btn"
                  onclick={handleTTSStop}
                  aria-label={$_('chat.message.stop')}
                  title={$_('chat.message.stop')}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="4" y="4" width="16" height="16" rx="2"></rect>
                  </svg>
                </button>
              {/if}
            {/if}
            <!-- Copy Button -->
            <button
              class="action-btn"
              class:success={copySuccess}
              onclick={copyMessageContent}
              aria-label={$_('chat.message.copyContent')}
              title={$_('chat.message.copyContent')}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                {#if copySuccess}
                  <polyline points="20,6 9,17 4,12"></polyline>
                {:else}
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                {/if}
              </svg>
            </button>
          </div>
        {/if}
        <div class="message-body">
          {@html renderedContent}
          {#if message.files && message.files.length > 0}
            <div
              class="message-files"
              style:grid-template-columns={gridColumns}
            >
              {#each message.files as file}
                {#if isImage(file.type)}
                  {#if fileLoadingStates.get(file.id)}
                    <div class="image-loader">
                      <div class="spinner"></div>
                      <div class="loader-text">{$_('chat.message.loadingImage')}</div>
                    </div>
                  {:else if fileBlobUrls.has(file.id)}
                    {@const blobUrl = fileBlobUrls.get(file.id)}
                    {#if blobUrl}
                      <button 
                        class="message-image-btn"
                        onclick={() => openImagePreview(blobUrl, file.name || $_('chat.message.imageAlt'))}
                        aria-label={file.name || $_('chat.message.imageAlt')}
                        title={file.name || $_('chat.message.imageAlt')}
                      >
                        <img 
                          src={blobUrl} 
                          alt={file.name || $_('chat.message.imageAlt')} 
                          class="message-image"
                        />
                      </button>
                    {/if}
                  {/if}
                {:else}
                  <button 
                    class="file-box"
                    onclick={() => handleFileClick(file.id, file.name || $_('chat.message.fileFallback'))}
                    aria-label={file.name || $_('chat.message.fileFallback')}
                    title={file.name || $_('chat.message.fileFallback')}
                  >
                    <div class="file-icon-large">{getFileIcon(file.type)}</div>
                    <div class="file-info">
                      <div class="file-name">{file.name || $_('chat.message.fileFallback')}</div>
                      {#if file.type}
                        <div class="file-type">{file.type}</div>
                      {/if}
                    </div>
                  </button>
                {/if}
              {/each}
            </div>
          {/if}
        </div>
      </div>
    {/if}

    {#if message.mcpAuthRequests && message.mcpAuthRequests.length > 0}
      <div class="mcp-auth-container">
        {#each message.mcpAuthRequests as authRequest (authRequest.server_id)}
          <McpOAuthPrompt
            {authRequest}
            onConnected={(serverId) => onMcpAuthConnected?.(serverId)}
            onError={(serverId, err) => onMcpAuthError?.(serverId, err)}
            onStatusChange={(serverId, status) => onMcpAuthStatusChange?.(serverId, status)}
          />
        {/each}
      </div>
    {/if}

    {#if message.error}
      <div class="error-message">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <span>{message.error}</span>
      </div>
    {/if}
  </div>
</div>

<!-- Image Preview Modal -->
{#if previewImage}
  <div 
    class="modal-backdrop" 
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    aria-label={$_('chat.message.imagePreview') || 'Image preview'}
    onclick={closeImagePreview}
    onkeydown={(e) => {
      if (e.key === 'Escape') closeImagePreview();
    }}
  >
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div 
      class="modal-content" 
      role="document"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.key === 'Escape' && closeImagePreview()}
    >
      <button class="modal-close" onclick={closeImagePreview} aria-label={$_('chat.message.closePreview')}>
        ✕
      </button>
      <img src={previewImage.url} alt={previewImage.name} class="preview-image" />
      <div class="preview-filename">{previewImage.name}</div>
    </div>
  </div>
{/if}

<style>
  .message {
    display: flex;
    gap: var(--space-md);
    align-items: flex-start;
    max-width: 90%;
    animation: fadeInUp 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(var(--space-md));
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .message.user {
    flex-direction: row-reverse;
    align-self: flex-end;
    max-width: 75%;
  }

  .message.user.has-images {
    max-width: 90%;
  }

  .message.assistant {
    align-self: flex-start;
  }

  /* Avatar container */
  .message-avatar {
    flex-shrink: 0;
    width: var(--space-3xl);
    height: var(--space-3xl);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .model-avatar {
    border-radius: 50%;
    background: rgba(var(--glass-tint), 0.15);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    padding: var(--space-sm);
    flex-shrink: 0;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.2),
      0 2px 8px rgba(0, 0, 0, 0.08);
    transition: all 0.25s ease;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .model-avatar:hover {
    transform: translateY(-1px);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.3),
      0 8px 24px rgba(0, 0, 0, 0.15),
      0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .model-avatar :global(svg) {
    width: var(--space-2xl);
    height: var(--space-2xl);
    display: block;
  }

  .model-avatar .provider-icon-img {
    width: var(--space-2xl);
    height: var(--space-2xl);
    display: block;
    object-fit: contain;
  }

  .message-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    flex: 1;
    min-width: 0;
  }

  /* User message bubble - brand gradient with glass shine */
  .user-message {
    position: relative;
    background: linear-gradient(135deg, var(--brand) 0%, var(--brand-hover) 100%);
    color: white;
    border-radius: var(--glass-radius);
    /* Logical corner so the "tail" stays on the inline-end edge under RTL. */
    border-end-end-radius: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    width: fit-content;
    max-width: 100%;
    margin-inline-start: auto;
    box-shadow:
      0 2px 12px rgba(var(--brand-rgb), 0.25),
      0 1px 2px rgba(var(--brand-rgb), 0.15),
      inset 0 1px 0 rgba(255, 255, 255, 0.2);
    transition: all 0.25s ease;
  }

  .user-message:hover {
    transform: translateY(-1px);
    box-shadow:
      0 8px 32px rgba(var(--brand-rgb), 0.4),
      0 2px 6px rgba(var(--brand-rgb), 0.25),
      inset 0 1px 0 rgba(255, 255, 255, 0.3);
  }

  .user-message p {
    margin: 0;
    line-height: 1.6;
    white-space: pre-wrap;
    word-wrap: break-word;
  }

  .user-message p:empty {
    display: none;
  }

  /* Assistant message bubble - frosted glass effect */
  .assistant-message {
    position: relative;
    background: rgba(var(--glass-tint), 0.12);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    color: var(--text-primary);
    border-radius: var(--glass-radius);
    border-bottom-left-radius: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.15),
      0 2px 12px rgba(0, 0, 0, 0.06),
      0 1px 2px rgba(0, 0, 0, 0.04);
    transition: all 0.25s ease;
  }

  .assistant-message:hover {
    background: rgba(var(--glass-tint), 0.18);
    transform: translateY(-1px);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.2),
      0 4px 20px rgba(0, 0, 0, 0.1),
      0 2px 4px rgba(0, 0, 0, 0.06);
  }

  @media (prefers-color-scheme: dark) {
    .assistant-message {
      background: rgba(var(--glass-tint), 0.08);
    }

    .assistant-message:hover {
      background: rgba(var(--glass-tint), 0.12);
    }
  }

  .assistant-message :global(p) {
    margin: 0 0 var(--space-md) 0;
    line-height: 1.6;
  }

  .assistant-message :global(p:last-child) {
    margin-bottom: 0;
  }

  .assistant-message :global(h1),
  .assistant-message :global(h2),
  .assistant-message :global(h3),
  .assistant-message :global(h4),
  .assistant-message :global(h5),
  .assistant-message :global(h6) {
    margin: var(--space-lg) 0 var(--space-md) 0;
  }

  .assistant-message :global(h1:first-child),
  .assistant-message :global(h2:first-child),
  .assistant-message :global(h3:first-child),
  .assistant-message :global(h4:first-child),
  .assistant-message :global(h5:first-child),
  .assistant-message :global(h6:first-child) {
    margin-top: 0;
  }

  .assistant-message :global(ul),
  .assistant-message :global(ol) {
    margin: var(--space-md) 0;
    padding-inline-start: var(--space-2xl);
  }

  .assistant-message :global(li) {
    margin: var(--space-sm) 0;
    line-height: 1.6;
  }

  .assistant-message :global(code) {
    font-family: 'SF Mono', Monaco, Menlo, 'Ubuntu Mono', monospace;
    font-size: 0.875em;
    background: color-mix(in oklab, var(--glass-bg-dark) 30%, var(--btn-tertiary));
    padding: var(--space-xs) var(--space-sm);
    border-radius: var(--radius-sm);
  }

  @media (prefers-color-scheme: light) {
    .assistant-message :global(code) {
      background: #e2e8f0;
    }
  }

  .assistant-message :global(pre) {
    position: relative;
    margin: var(--space-md) 0;
    padding: var(--space-xl);
    border-radius: var(--radius-md);
    overflow-x: auto;
  }

  .assistant-message :global(pre code) {
    background: transparent;
    padding: 0;
    border-radius: 0;
    font-size: 0.875rem;
    line-height: 1.6;
  }

  .assistant-message :global(blockquote) {
    margin: var(--space-md) 0;
    padding-inline-start: var(--space-xl);
    border-inline-start: 3px solid var(--brand);
    color: var(--text-secondary);
    font-style: italic;
  }

  .assistant-message :global(a) {
    color: var(--link-color);
    text-decoration: underline;
    transition: color 0.2s ease;
  }

  .assistant-message :global(a:hover) {
    color: var(--link-hover);
  }

  .assistant-message :global(table) {
    border-collapse: collapse;
    margin: var(--space-md) 0;
    width: max-content;
  }

  .assistant-message :global(th),
  .assistant-message :global(td) {
    padding: var(--space-sm) var(--space-md);
    border: 1px solid var(--glass-stroke-dark);
    text-align: start;
    word-wrap: break-word;
    overflow-wrap: break-word;
    white-space: normal;
    max-width: max(300px, 30vw);
  }

  /* Single column tables: allow full width */
  .assistant-message :global(th:only-child),
  .assistant-message :global(td:only-child) {
    max-width: none;
  }

  .assistant-message :global(th) {
    background: color-mix(in oklab, var(--glass-bg-dark) 40%, var(--btn-secondary));
    font-weight: 600;
  }

  .streaming .assistant-message::after {
    content: '▊';
    animation: blink 1s infinite;
    margin-inline-start: 2px;
  }

  @keyframes blink {
    0%, 50% { opacity: 1; }
    51%, 100% { opacity: 0; }
  }

  .mcp-auth-container {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    margin-top: var(--space-md);
  }

  .error-message {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin-top: var(--space-md);
    padding: var(--space-md) var(--space-lg);
    background: var(--danger-surface);
    color: var(--brand-red);
    border-radius: var(--radius-md);
    font-size: 0.875rem;
  }

  .message-actions {
    position: absolute;
    top: var(--space-sm);
    inset-inline-end: var(--space-md);
    z-index: 10;
    display: flex;
    flex-direction: row;
    gap: 0.375rem;
    opacity: 0;
    transform: scale(0.9);
    transition: all 0.2s ease;
    pointer-events: none;
  }

  /* Desktop: show on hover */
  .user-message:hover .message-actions,
  .assistant-message:hover .message-actions {
    opacity: 1;
    transform: scale(1);
    pointer-events: auto;
  }

  /* Keyboard: show on focus-within */
  .user-message .message-actions:focus-within,
  .assistant-message .message-actions:focus-within {
    opacity: 1;
    transform: scale(1);
    pointer-events: auto;
  }

  /* Mobile: show on tap via actions-visible class */
  .message.actions-visible .user-message .message-actions,
  .message.actions-visible .assistant-message .message-actions {
    opacity: 1;
    transform: scale(1);
    pointer-events: auto;
  }

  /* Action button - glass style */
  .action-btn {
    background: var(--btn-secondary);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border: 1px solid var(--glass-stroke-dark);
    border-radius: 0.375rem;
    padding: 0.375rem;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .action-btn:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }

  .action-btn:hover:not(:disabled) {
    background: var(--brand);
    color: white;
    border-color: var(--brand);
    transform: scale(1.05);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .action-btn:active:not(:disabled) {
    transform: scale(0.95);
  }

  /* User bubble copy button needs stronger contrast than the bubble fill */
  .user-message .action-btn.user-copy-btn {
    background: rgba(17, 24, 39, 0.45);
    border-color: rgba(255, 255, 255, 0.35);
    color: rgba(255, 255, 255, 0.98);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.28);
  }

  .user-message .action-btn.user-copy-btn:hover:not(:disabled) {
    background: rgba(17, 24, 39, 0.62);
    border-color: rgba(255, 255, 255, 0.52);
    color: white;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.32);
  }

  /* Success state for action buttons */
  .action-btn.success {
    background: rgba(var(--brand-green-rgb), 0.2);
    color: var(--brand-green);
    border-color: color-mix(in oklab, var(--brand-green) 25%, transparent);
  }

  .user-message .action-btn.user-copy-btn.success {
    background: rgba(var(--brand-green-rgb, 34, 197, 94), 0.32);
    border-color: rgba(var(--brand-green-rgb, 34, 197, 94), 0.65);
    color: #f0fdf4;
  }

  /* TTS active state - always visible when speaking */
  .message-actions.tts-active {
    opacity: 1;
    transform: scale(1);
  }

  /* Copy button for code blocks */
  :global(.copy-code-btn) {
    position: absolute;
    top: var(--space-sm);
    inset-inline-end: var(--space-sm);
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-xs) var(--space-sm);
    background: var(--btn-secondary);
    border: 1px solid var(--glass-stroke-dark);
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    opacity: 0;
  }

  :global(pre:hover .copy-code-btn) {
    opacity: 1;
  }

  :global(.copy-code-btn:hover) {
    background: var(--btn-tertiary);
    border-color: var(--brand);
    color: var(--brand);
    transform: translateY(-1px);
  }

  :global(.copy-code-btn svg) {
    flex-shrink: 0;
  }

  @media (max-width: 768px) {
    .message {
      max-width: 92%;
      gap: var(--space-sm);
      /* Add cursor pointer to indicate tappability */
      cursor: pointer;
    }

    .message-avatar {
      display: none;
    }

    /* On mobile, disable hover and only show via tap (actions-visible class) */
    .user-message:hover .message-actions,
    .assistant-message:hover .message-actions {
      opacity: 0;
      transform: scale(0.9);
    }

    .message.actions-visible .user-message .message-actions,
    .message.actions-visible .assistant-message .message-actions {
      opacity: 1;
      transform: scale(1);
    }

    :global(.copy-code-btn span) {
      display: none;
    }

    .action-btn {
      padding: 0.25rem;
    }
  }

  @media (max-width: 480px) {
    .message {
      max-width: 95%;
      gap: var(--space-xs);
    }

    .action-btn {
      padding: 0.2rem;
    }
  }

  .message-body {
    width: 100%;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  /* ── Standardized Image Grid System ── */
  .message-files {
    --img-size: 160px;
    display: grid;
    /* grid-template-columns is set dynamically via inline style */
    gap: var(--space-sm);
    margin-top: var(--space-md);
    width: fit-content;
    max-width: 100%;
  }

  .message-image-btn {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    display: block;
    width: var(--img-size);
    height: var(--img-size);
    border-radius: var(--radius-md);
    overflow: hidden;
    flex-shrink: 0;
  }

  .message-image-btn:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }

  .message-image {
    width: var(--img-size);
    height: var(--img-size);
    object-fit: cover;
    border-radius: var(--radius-md);
    display: block;
    transition: transform 0.2s ease, filter 0.2s ease;
  }

  .message-image:hover {
    transform: scale(1.03);
    filter: brightness(1.05);
  }

  .user-message .message-image {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }

  .assistant-message .message-image {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  /* ── User message: dynamic flex-wrap image grid ── */
  .user-message .message-files {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    margin-top: var(--space-sm);
    width: fit-content;
    max-width: 100%;
    margin-inline-start: auto;
  }

  .user-message .message-image-btn {
    width: clamp(3.5rem, 8vw, 5.5rem);
    height: clamp(3.5rem, 8vw, 5.5rem);
    border-radius: var(--radius-sm);
    overflow: hidden;
    flex: 0 0 auto;
  }

  .user-message .message-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: var(--radius-sm);
  }

  .user-message .image-loader {
    width: clamp(3.5rem, 8vw, 5.5rem);
    height: clamp(3.5rem, 8vw, 5.5rem);
    aspect-ratio: auto;
    overflow: hidden;
    padding: 0.25rem;
    gap: 0.15rem;
  }

  .user-message .image-loader .spinner {
    width: 1.25rem;
    height: 1.25rem;
    border-width: 2px;
  }

  .user-message .image-loader .loader-text {
    font-size: 0.5rem;
    line-height: 1;
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }

  /* Responsive grid breakpoints */
  @media (max-width: 768px) {
    .message-files { --img-size: 120px; }
    .user-message .message-image-btn,
    .user-message .image-loader {
      width: clamp(3rem, 12vw, 4.5rem);
      height: clamp(3rem, 12vw, 4.5rem);
    }
  }

  @media (max-width: 480px) {
    .message-files { --img-size: 100px; }
    .user-message .message-image-btn,
    .user-message .image-loader {
      width: clamp(2.5rem, 15vw, 3.5rem);
      height: clamp(2.5rem, 15vw, 3.5rem);
    }
  }

  .file-box {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-md);
    border-radius: var(--radius-md);
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    max-width: 300px;
    transition: all 0.2s ease;
    cursor: pointer;
    color: inherit;
    font-family: inherit;
    font-size: inherit;
  }

  .file-box:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }

  .file-box:hover {
    background: rgba(255, 255, 255, 0.08);
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .file-icon-large {
    font-size: 32px;
    flex-shrink: 0;
  }

  .file-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .file-name {
    font-weight: 500;
    font-size: 14px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-type {
    font-size: 12px;
    opacity: 0.7;
    font-family: monospace;
  }

  .user-message .file-box {
    background: rgba(255, 255, 255, 0.15);
    border-color: rgba(255, 255, 255, 0.2);
  }

  .user-message .file-box:hover {
    background: rgba(255, 255, 255, 0.25);
  }

  .assistant-message .file-box {
    background: rgba(0, 0, 0, 0.03);
    border-color: rgba(0, 0, 0, 0.08);
  }

  .assistant-message .file-box:hover {
    background: rgba(0, 0, 0, 0.05);
  }

  .image-loader {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-sm);
    background: rgba(255, 255, 255, 0.03);
    border-radius: var(--radius-md);
    aspect-ratio: 1 / 1;
    width: 100%;
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid rgba(255, 255, 255, 0.1);
    border-top-color: rgba(255, 255, 255, 0.6);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .loader-text {
    font-size: 13px;
    opacity: 0.6;
  }

  .user-message .image-loader {
    background: rgba(255, 255, 255, 0.1);
  }

  .user-message .spinner {
    border-color: rgba(255, 255, 255, 0.2);
    border-top-color: rgba(255, 255, 255, 0.8);
  }

  .assistant-message .image-loader {
    background: rgba(0, 0, 0, 0.02);
  }

  .assistant-message .spinner {
    border-color: rgba(0, 0, 0, 0.1);
    border-top-color: rgba(0, 0, 0, 0.4);
  }

  /* Image Preview Modal */
  .modal-backdrop {
    position: fixed;
    top: 0;
    inset-inline: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.9);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    padding: var(--space-xl);
    animation: fadeIn 0.2s ease;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .modal-content {
    position: relative;
    max-width: 90vw;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-md);
  }

  .modal-close {
    position: fixed;
    top: 20px;
    inset-inline-end: 20px;
    background: rgba(255, 255, 255, 0.15);
    border: none;
    border-radius: 50%;
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s;
    z-index: 10000;
    color: white;
    font-size: 28px;
    font-weight: 300;
    line-height: 1;
  }

  .modal-close:hover {
    background: rgba(255, 255, 255, 0.3);
    transform: scale(1.1);
  }

  .preview-image {
    max-width: 100%;
    max-height: calc(90vh - 60px);
    object-fit: contain;
    border-radius: var(--radius-md);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  }

  .preview-filename {
    color: white;
    font-size: 14px;
    text-align: center;
    padding: var(--space-sm) var(--space-md);
    background: rgba(0, 0, 0, 0.5);
    border-radius: var(--radius-md);
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-box {
    cursor: pointer;
  }

  .tool-calls-container {
    max-width: 100%;
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    margin-bottom: var(--space-sm);
  }

  @media (max-width: 768px) {
    .tool-calls-container {
      max-width: 92%;
    }
  }

  @media (max-width: 480px) {
    .tool-calls-container {
      max-width: 95%;
    }
  }
</style>
