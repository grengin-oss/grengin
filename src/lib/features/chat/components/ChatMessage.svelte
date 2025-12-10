<script lang="ts">
  import type { ChatMessage } from '../../../types/chat';
  import { renderMarkdown, copyToClipboard } from '../../../utils/markdown';
  import { onMount, onDestroy, tick } from 'svelte';
  import 'highlight.js/styles/github-dark.css';
  import type { ProviderInfo } from '../../../api/models';
  import {
    speechSynthesisSupported,
    subscribeTTSState,
    toggleSpeaking,
    stopSpeaking,
    type TTSState,
  } from '../../../utils/tts';

  interface Props {
    message: ChatMessage;
    onEdit?: (id: string, newContent: string) => void;
    selectedModelInfo?: ProviderInfo;
  }

  let { message, onEdit, selectedModelInfo }: Props = $props();
  let isEditing = $state(false);
  let editContent = $state(message.content);
  let showActions = $state(false);
  let messageContainer: HTMLDivElement;
  let editTextarea: HTMLTextAreaElement;

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

  function handleTTSToggle() {
    toggleSpeaking(message.id, message.content);
  }

  function handleTTSStop() {
    stopSpeaking();
  }

  const renderedContent = $derived(
    message.role === 'assistant' ? renderMarkdown(message.content) : message.content
  );

  // Toggle actions visibility on tap (for touch devices)
  function handleMessageTap(e: MouseEvent) {
    // Don't toggle if clicking on action buttons or links
    const target = e.target as HTMLElement;
    if (target.closest('.message-actions') || target.closest('a') || target.closest('button')) {
      return;
    }
    showActions = !showActions;
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

  async function copyMessageContent() {
    const success = await copyToClipboard(message.content);
    if (success) {
      copySuccess = true;
      setTimeout(() => {
        copySuccess = false;
      }, 2000);
    }
  }

  onMount(() => {
    // Add copy buttons to code blocks after render
    if (messageContainer && message.role === 'assistant') {
      const codeBlocks = messageContainer.querySelectorAll('pre');
      codeBlocks.forEach((pre, index) => {
        if (!pre.querySelector('.copy-code-btn')) {
          const code = pre.querySelector('code');
          if (code) {
            const button = document.createElement('button');
            button.className = 'copy-code-btn';
            button.innerHTML = `
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              <span>Copy</span>
            `;
            button.onclick = async () => {
              const codeText = code.textContent || '';
              const success = await copyToClipboard(codeText);
              if (success) {
                button.innerHTML = `
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                  <span>Copied!</span>
                `;
                setTimeout(() => {
                  button.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                    <span>Copy</span>
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
  });
</script>

<div
  class="message"
  class:user={message.role === 'user'}
  class:assistant={message.role !== 'user'}
  class:streaming={message.isStreaming}
  class:actions-visible={showActions}
  bind:this={messageContainer}
  onclick={handleMessageTap}
>
  <!-- Avatar only for assistant messages -->
  {#if message.role !== 'user'}
    <div class="message-avatar">
      <div class="model-avatar">
        {@html selectedModelInfo?.icon}
      </div>
    </div>
  {/if}

  <div class="message-content">
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
                class="action-btn"
                class:success={copySuccess}
                onclick={copyMessageContent}
                title="Copy content"
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
          </div>
        </div>
      <!-- {/if} end of edit mode conditional -->
    {:else}
      <div class="assistant-message">
        {#if !message.isStreaming}
          <div class="message-actions" class:tts-active={isActive}>
            <!-- TTS Toggle Button -->
            {#if speechSynthesisSupported}
              <button
                class="action-btn"
                class:active={isActive}
                onclick={handleTTSToggle}
                title={isSpeaking ? 'Pause' : isPaused ? 'Resume' : 'Listen'}
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
                  class="action-btn stop-btn"
                  onclick={handleTTSStop}
                  title="Stop"
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
              title="Copy content"
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
        </div>
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

<style>
  .message {
    display: flex;
    gap: var(--space-md);
    align-items: flex-start;
    max-width: 80%;
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
    border-bottom-right-radius: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
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
    padding-left: var(--space-2xl);
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

  .assistant-message :global(pre) {
    position: relative;
    margin: var(--space-md) 0;
    padding: var(--space-xl);
    background: color-mix(in oklab, var(--glass-bg-dark) 25%, var(--btn-tertiary));
    border-radius: var(--radius-md);
    overflow-x: auto;
    box-shadow: var(--glass-edge-glow), inset 0 1px 2px rgba(0, 0, 0, 0.04);
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
    padding-left: var(--space-xl);
    border-left: 3px solid var(--brand);
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
    width: 100%;
    border-collapse: collapse;
    margin: var(--space-md) 0;
  }

  .assistant-message :global(th),
  .assistant-message :global(td) {
    padding: var(--space-sm) var(--space-md);
    border: 1px solid var(--glass-stroke-dark);
    text-align: left;
  }

  .assistant-message :global(th) {
    background: color-mix(in oklab, var(--glass-bg-dark) 40%, var(--btn-secondary));
    font-weight: 600;
  }

  .streaming .assistant-message::after {
    content: '▊';
    animation: blink 1s infinite;
    margin-left: 2px;
  }

  @keyframes blink {
    0%, 50% { opacity: 1; }
    51%, 100% { opacity: 0; }
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
    right: var(--space-md);
    z-index: 10;
    display: flex;
    flex-direction: row;
    gap: 0.375rem;
    opacity: 0;
    transform: scale(0.9);
    transition: all 0.2s ease;
  }

  /* Desktop: show on hover */
  .user-message:hover .message-actions,
  .assistant-message:hover .message-actions {
    opacity: 1;
    transform: scale(1);
  }

  /* Mobile: show on tap via actions-visible class */
  .message.actions-visible .user-message .message-actions,
  .message.actions-visible .assistant-message .message-actions {
    opacity: 1;
    transform: scale(1);
  }

  /* Action button - glass style */
  .action-btn {
    background: rgba(var(--glass-tint), 0.2);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border: 1px solid color-mix(in oklab, white 15%, transparent);
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

  .action-btn:hover:not(:disabled) {
    background: rgba(var(--glass-tint), 0.3);
    color: var(--text-primary);
    border-color: color-mix(in oklab, white 25%, transparent);
    transform: scale(1.05);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .action-btn:active:not(:disabled) {
    transform: scale(0.95);
  }

  /* High contrast action button for user messages (dark background) */
  .user-message .action-btn {
    background: rgba(255, 255, 255, 0.25);
    border-color: rgba(255, 255, 255, 0.4);
    color: white;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  }

  .user-message .action-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.4);
    color: white;
    border-color: rgba(255, 255, 255, 0.6);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  }

  /* Success state for action buttons */
  .action-btn.success {
    background: rgba(var(--brand-green-rgb), 0.2);
    color: var(--brand-green);
    border-color: color-mix(in oklab, var(--brand-green) 25%, transparent);
  }

  .user-message .action-btn.success {
    background: rgba(255, 255, 255, 0.35);
    color: white;
    border-color: rgba(255, 255, 255, 0.5);
  }

  /* TTS active state - always visible when speaking */
  .message-actions.tts-active {
    opacity: 1;
    transform: scale(1);
  }

  /* Active TTS button */
  .action-btn.active {
    background: rgba(var(--brand-rgb), 0.2);
    color: var(--brand);
    border-color: color-mix(in oklab, var(--brand) 30%, transparent);
  }

  .action-btn.active:hover:not(:disabled) {
    background: rgba(var(--brand-rgb), 0.3);
    color: var(--brand);
    border-color: color-mix(in oklab, var(--brand) 40%, transparent);
  }

  /* Stop button styling */
  .action-btn.stop-btn {
    background: rgba(var(--brand-red-rgb, 220, 38, 38), 0.15);
    color: var(--brand-red, #dc2626);
    border-color: color-mix(in oklab, var(--brand-red, #dc2626) 25%, transparent);
  }

  .action-btn.stop-btn:hover:not(:disabled) {
    background: rgba(var(--brand-red-rgb, 220, 38, 38), 0.25);
    color: var(--brand-red, #dc2626);
    border-color: color-mix(in oklab, var(--brand-red, #dc2626) 35%, transparent);
  }

  .edit-container {
    width: 100%;
    max-width: 80%;
  }

  .edit-textarea {
    width: 100%;
    min-height: 60px;
    padding: var(--space-lg) var(--space-xl);
    background: var(--brand);
    color: white;
    border: 2px solid var(--brand-hover);
    border-radius: var(--radius-lg);
    font-size: 1rem;
    font-family: inherit;
    line-height: 1.6;
    resize: none;
    overflow: hidden;
  }

  .edit-textarea:focus {
    outline: none;
    border-color: var(--brand-ring);
    box-shadow: 0 0 0 3px rgba(var(--brand-rgb), 0.15);
  }

  .edit-actions {
    display: flex;
    gap: var(--space-sm);
    margin-top: var(--space-sm);
    justify-content: flex-end;
  }

  .btn-save,
  .btn-cancel {
    padding: var(--space-sm) var(--space-lg);
    border-radius: var(--radius-md);
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn-save {
    background: var(--brand-green);
    color: white;
    border: none;
  }

  .btn-save:hover {
    background: color-mix(in oklab, var(--brand-green) 88%, white);
    transform: translateY(-1px);
  }

  .btn-cancel {
    background: transparent;
    color: var(--text-secondary);
    border: 1px solid var(--glass-stroke-dark);
  }

  .btn-cancel:hover {
    background: var(--btn-tertiary);
    border-color: var(--glass-stroke-light);
  }

  /* Copy button for code blocks */
  :global(.copy-code-btn) {
    position: absolute;
    top: var(--space-sm);
    right: var(--space-sm);
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

    .edit-container {
      max-width: 100%;
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
  }
</style>
