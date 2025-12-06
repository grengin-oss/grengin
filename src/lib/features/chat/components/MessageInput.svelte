<script lang="ts">
  import { onMount } from 'svelte';

  interface MessageInputProps {
    onSend: (message: string) => void;
    disabled?: boolean;
    placeholder?: string;
    rows?: number;
    selectedModel?: string;
    onRemoveModel?: () => void;
  }

  let { onSend, disabled = false, placeholder = 'Type a message...', rows = 1, selectedModel, onRemoveModel }: MessageInputProps = $props();
  
  let textarea: HTMLTextAreaElement;
  let message = $state('');
  let rowsState = $state(rows);
  const maxRows = 10;
  const minRows = 1;

  function adjustHeight() {
    if (!textarea) return;
    
    // Reset height to auto to get the correct scrollHeight
    textarea.style.height = 'auto';
    
    // Calculate the number of rows based on scrollHeight
    const lineHeight = parseInt(getComputedStyle(textarea).lineHeight);
    const newRows = Math.min(
      Math.max(Math.ceil(textarea.scrollHeight / lineHeight), minRows),
      maxRows
    );
    
    rows = newRows;
    textarea.style.height = `${textarea.scrollHeight}px`;
  }

  function handleInput() {
    adjustHeight();
  }

  function handleKeyDown(event: KeyboardEvent) {
    // Send on Enter (without Shift), allow Shift+Enter for new line
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
    // Allow Shift+Enter to create a new line (default behavior)
  }

  function handleSend() {
    const trimmed = message.trim();
    if (trimmed && !disabled) {
      onSend(trimmed);
      message = '';
      rows = minRows;
      if (textarea) {
        textarea.style.height = 'auto';
      }
    }
  }

  onMount(() => {
    adjustHeight();
  });
</script>

<div class="message-input-container">
  <div class="input-wrapper">
    <div class="input-content">
      <textarea
        bind:this={textarea}
        bind:value={message}
        oninput={handleInput}
        onkeydown={handleKeyDown}
        {placeholder}
        {disabled}
        {rows}
        class="message-textarea"
        aria-label="Message input"
      ></textarea>
      
      <div class="input-actions">
        <div class="input-left">
          <button class="icon-button" aria-label="Attach file" title="Attach file">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
            </svg>
          </button>
          <button class="icon-button" aria-label="Add link" title="Add link">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
            </svg>
          </button>
          <div class="model-tile">
            <span class="model-name">{selectedModel || 'Baichuan-M2'}</span>
            <button class="remove-model" onclick={onRemoveModel} title="Remove model">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>
        
        <div class="input-right">
          <button class="icon-button" aria-label="Voice input" title="Voice input">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
              <line x1="12" y1="19" x2="12" y2="23"></line>
              <line x1="8" y1="23" x2="16" y2="23"></line>
            </svg>
          </button>
          <button 
            class="send-button" 
            onclick={handleSend}
            disabled={disabled || !message.trim()}
            aria-label="Send message"
            title="Send message (Enter)"
          >
            {#if disabled}
              <svg class="spinner" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10" opacity="0.25"></circle>
                <path d="M12 2a10 10 0 0 1 10 10" opacity="0.75"></path>
              </svg>
            {:else}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="19" x2="12" y2="5"></line>
                <polyline points="5 12 12 5 19 12"></polyline>
              </svg>
            {/if}
          </button>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .message-input-container {
    width: 100%;
    max-width: 900px;
    margin: 0 auto;
  }

  .input-wrapper {
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 1.5rem;
    transition: all 0.2s ease;
  }

  .input-wrapper:focus-within {
    border-color: #d1d5db;
  }

  .input-content {
    padding: 1rem 1.25rem;
  }

  .message-textarea {
    width: 100%;
    min-height: 24px;
    max-height: 200px;
    padding: 0.5rem 0;
    margin-bottom: 0.75rem;
    background: transparent;
    border: none;
    outline: none;
    box-shadow: none;
    color: #374151;
    font-size: 0.9375rem;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    line-height: 1.5;
    resize: none;
    overflow-y: auto;
    scrollbar-width: none;
  }

  .message-textarea::-webkit-scrollbar {
    display: none;
  }

  .message-textarea::placeholder {
    color: #9ca3af;
  }

  .message-textarea:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .input-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .input-left,
  .input-right {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .model-tile {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    background: #e5e7eb;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    color: #374151;
  }

  .model-name {
    font-weight: 500;
  }

  .remove-model {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    padding: 0;
    border: none;
    background: transparent;
    color: #6b7280;
    cursor: pointer;
    border-radius: 50%;
    transition: all 0.15s ease;
  }

  .remove-model:hover {
    background: #d1d5db;
    color: #374151;
  }

  .icon-button {
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    padding: 0;
    border: none;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s ease;
    background: transparent;
    color: #6b7280;
  }

  .icon-button:hover {
    background: #e5e7eb;
    color: #374151;
  }

  .icon-button:active {
    background: #d1d5db;
  }

  .send-button {
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    padding: 0;
    border: none;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s ease;
    background: #e5e7eb;
    color: #6b7280;
  }

  .send-button:not(:disabled) {
    background: #000000;
    color: #ffffff;
  }

  .send-button:hover:not(:disabled) {
    background: #1a1a1a;
    color: #ffffff;
  }

  .send-button:active:not(:disabled) {
    background: #333333;
  }

  .send-button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    color: #6b7280;
  }

  .spinner {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  @media (max-width: 768px) {
    .message-input-container {
      max-width: 100%;
    }

    .input-wrapper {
      padding: 0.5rem 0.875rem;
    }

    .icon-button,
    .send-button {
      width: 28px;
      height: 28px;
    }
  }

  @media (max-width: 480px) {
    .input-wrapper {
      padding: 0.5rem 0.75rem;
    }

    .message-textarea {
      padding: 0.375rem 0.5rem;
      font-size: 0.9375rem;
    }

    .icon-button,
    .send-button {
      width: 26px;
      height: 26px;
    }
  }
</style>
