<script lang="ts">
  import type { ChatMessage } from '../../../types/chat';
  import { renderMarkdown, copyToClipboard } from '../../../utils/markdown';
  import { onMount, tick } from 'svelte';
  import 'highlight.js/styles/github-dark.css';
  import type { ProviderInfo } from '../../../api/models';

  interface Props {
    message: ChatMessage;
    onEdit?: (id: string, newContent: string) => void;
    onDelete?: (id: string) => void;
    user?: { name?: string } | null;
    selectedModelInfo?:ProviderInfo;
  }

  let { message, onEdit, onDelete, user, selectedModelInfo }: Props = $props();
  let isEditing = $state(false);
  let editContent = $state(message.content);
  let showActions = $state(false);
  let messageContainer: HTMLDivElement;
  let editTextarea: HTMLTextAreaElement;

  const renderedContent = $derived(
    message.role === 'assistant' ? renderMarkdown(message.content) : message.content
  );

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

  function getModelDisplayName(): string {
    if (!selectedModelInfo) return 'Assistant';
    // Remove common prefixes and make more readable
    const cleanModel = selectedModelInfo.name.replace(/^(gpt-|claude-|anthropic-)/i, '');
    return cleanModel.charAt(0).toUpperCase() + cleanModel.slice(1);
  }

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

  function handleDelete() {
    if (onDelete && confirm('Are you sure you want to delete this message?')) {
      onDelete(message.id);
    }
  }

  async function copyMessageContent() {
    const success = await copyToClipboard(message.content);
    if (success) {
      // Show brief feedback
      showActions = false;
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
  class:assistant={message.role === 'assistant'} 
  class:streaming={message.isStreaming}
  bind:this={messageContainer}
  onmouseenter={() => !message.isStreaming && (showActions = true)}
  onmouseleave={() => (showActions = false)}
>
  <div class="message-content">
    {#if message.role === 'user'}
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
        <div class="user-message">
          <div class="message-header">
            <div class="user-info">
              <div class="user-avatar">
                <div class="user-initials" style="background-color: {getUserColor()};">
                  {getUserInitials()}
                </div>
              </div>
              <span class="user-name">{user?.name || 'You'}</span>
            </div>
          </div>
          <div class="message-body">
            <p>{message.content}</p>
          </div>
        </div>
      {/if}
    {:else}
      <div class="assistant-message">
        <div class="message-header">
          <div class="model-info">
            <div class="model-avatar">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path>
              </svg>
            </div>
            <span class="model-name">{getModelDisplayName()}</span>
          </div>
        </div>
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

  <div class="message-footer">
    <div class="footer-left">
      
      {#if !isEditing && !message.isStreaming}
        <div class="message-actions">
          {#if message.role === 'user'}
            <button class="action-btn" onclick={startEdit} title="Edit message">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
          {/if}
          <button class="action-btn" onclick={copyMessageContent} title="Copy message">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>
          <button class="action-btn delete-btn" onclick={handleDelete} title="Delete message">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .message {
    display: flex;
    flex-direction: column;
    margin-bottom: var(--space-3xl);
    animation: slideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .message.user {
    align-items: flex-end;
  }

  .message.assistant {
    align-items: flex-start;
  }

  .message-content {
    width: 100%;
    max-width: 100%;
    margin-left: var(--space-sm);
  }

  .user-message {
    color: var(--text-primary);
    padding: var(--space-lg) var(--space-xl);
  }

  .user-message p {
    margin: 0;
    line-height: 1.6;
    white-space: pre-wrap;
    word-wrap: break-word;
  }

  .assistant-message {
    color: var(--text-primary);
    padding: var(--space-lg) var(--space-xl);
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
    padding: 0.25rem 0.5rem;
    border-radius: 0.5rem;
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
    border: 1px solid rgba(255, 255, 255, 0.1);
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

  .message-footer {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    margin-top: var(--space-sm);
    padding: 0 var(--space-sm);
    margin-left: var(--space-3xl);
  }

  .message.user .message-footer {
    justify-content: flex-start;
    align-self: stretch;
  }

  .footer-left {
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }

  .message-actions {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    opacity: 1;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .timestamp {
    font-size: 0.75rem;
    color: var(--text-secondary);
    opacity: 0.7;
  }

  .action-btn {
    padding: var(--space-xs);
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .action-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: var(--brand);
    color: var(--brand);
    transform: translateY(-1px);
  }

  .action-btn.delete-btn:hover {
    border-color: var(--brand-red);
    color: var(--brand-red);
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
    border: 1px solid rgba(255, 255, 255, 0.2);
  }

  .btn-cancel:hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.3);
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
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
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
    background: rgba(255, 255, 255, 0.1);
    border-color: var(--brand);
    color: var(--brand);
    transform: translateY(-1px);
  }

  :global(.copy-code-btn svg) {
    flex-shrink: 0;
  }

  @media (max-width: 768px) {
    .message-content {
      max-width: 90%;
    }

    .assistant-message,
    .user-message {
      padding: var(--space-md) var(--space-lg);
    }

    .edit-container {
      max-width: 90%;
    }

    .message-actions {
      opacity: 1;
    }

    :global(.copy-code-btn) {
      opacity: 1;
    }

    :global(.copy-code-btn span) {
      display: none;
    }

    .action-btn {
      padding: var(--space-sm);
    }
  }

  @media (max-width: 480px) {
    .message-content {
      max-width: 95%;
    }

    .edit-container {
      max-width: 95%;
    }

    .message-footer {
      flex-wrap: wrap;
    }

    .message-actions {
      width: 100%;
      justify-content: flex-end;
      margin-top: var(--space-xs);
    }
  }

  /* Message Header Styles */
  .message-header {
    display: flex;
    align-items: center;
    margin-bottom: var(--space-sm);
  }

  .user-info,
  .model-info {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .user-avatar,
  .model-avatar {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .user-avatar {
    background: var(--btn-secondary);
  }

  .model-avatar {
    background: var(--btn-secondary);
    color: var(--text-secondary);
  }

  .user-initials {
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.75rem;
    font-weight: 500;
    color: white;
    padding: 0.25rem;
  }

  .user-name,
  .model-name {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-secondary);
  }

  .message-body {
    width: 100%;
    padding-left: var(--space-2xl);
  }
</style>
