<script lang="ts">
  import type { RolePrompt } from "../../../api/admin/rolePrompts.js";
  import Modal from "../Modal.svelte";
  import { _ } from "svelte-i18n";
  import { copyToClipboard } from "../../../utils/markdown.js";

  interface Props {
    isOpen: boolean;
    onClose: () => void;
    prompt: RolePrompt | null;
  }

  let { isOpen = $bindable(), onClose, prompt }: Props = $props();

  let sampleValues = $state<Record<string, string>>({});
  let copiedRendered = $state(false);
  let initializedPrompts = $state<Set<string>>(new Set());

  $effect(() => {
    if (isOpen && prompt) {
      const promptId = prompt.id || prompt.name;
      if (!initializedPrompts.has(promptId)) {
        sampleValues = Object.fromEntries(
          prompt.variables.map(v => [v, ""])
        );
        initializedPrompts = new Set(initializedPrompts).add(promptId);
      }
    }
  });

  let renderedPrompt = $derived(() => {
    if (!prompt) return "";
    let text = prompt.prompt_text;
    for (const [key, value] of Object.entries(sampleValues)) {
      const replacement = value || `{{${key}}}`;
      text = text.replace(new RegExp(`{{${key}}}`, 'g'), replacement);
    }
    return text;
  });

  async function handleCopyRendered() {
    const success = await copyToClipboard(renderedPrompt());
    if (success) {
      copiedRendered = true;
      setTimeout(() => {
        copiedRendered = false;
      }, 2000);
    }
  }
</script>

<Modal bind:isOpen onclose={() => { isOpen = false; onClose(); }} title={$_('admin.promptLibrary.previewPrompt')}>
  {#if prompt}
    <div class="preview-container">
      <div class="preview-meta">
        <div class="meta-row">
          <span class="meta-label">{$_('admin.promptLibrary.preview.name')}</span>
          <span class="meta-value">{prompt.name}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">{$_('admin.promptLibrary.preview.type')}</span>
          <span class="pill--xs {prompt.is_system ? 'system-pill' : 'user-pill'}">
            {prompt.is_system ? $_('admin.promptLibrary.systemType') : $_('admin.promptLibrary.userType')}
          </span>
        </div>
      </div>

      {#if prompt.variables.length > 0}
        <div class="sample-section">
          <h4>{$_('admin.promptLibrary.preview.sampleValues')}</h4>
          <p class="sample-hint">
            {$_('admin.promptLibrary.preview.sampleHint')}
          </p>
          <div class="sample-inputs">
            {#each prompt.variables as variable}
              <div class="sample-field">
                <label for="sample-{variable}">
                  <code>{`{{${variable}}}`}</code>
                </label>
                <input
                  id="sample-{variable}"
                  type="text"
                  bind:value={sampleValues[variable]}
                  placeholder={$_('admin.promptLibrary.preview.samplePlaceholder')}
                />
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <div class="rendered-section">
        <div class="rendered-header">
          <h4>{$_('admin.promptLibrary.preview.renderedOutput')}</h4>
          <button
            class="copy-button"
            onclick={handleCopyRendered}
            title={$_('chat.message.copy')}
          >
            {#if copiedRendered}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"></polyline>
                <polyline points="16 4 17 4 21 4"></polyline>
                <line x1="21" y1="12" x2="21" y2="20"></line>
                <line x1="17" y1="20" x2="21" y2="20"></line>
                <line x1="16" y1="16" x2="21" y2="16"></line>
              </svg>
              <span>Copied!</span>
            {:else}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              <span>Copy</span>
            {/if}
          </button>
        </div>
        <div class="rendered-text">
          {renderedPrompt()}
        </div>
      </div>
    </div>
  {/if}
</Modal>

<style>
  .preview-container {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .preview-meta {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px 16px;
    background: var(--surface-subtle);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-border);
  }

  .meta-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .meta-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    min-width: 60px;
  }

  .meta-value {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-primary);
  }

  .system-pill,
  .user-pill {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: var(--radius-full);
    font-size: 11px;
    font-weight: 600;
  }

  .system-pill {
    background: color-mix(in oklab, var(--brand) 15%, var(--button-bg));
    color: var(--brand);
    border: 1px solid color-mix(in oklab, var(--brand) 25%, transparent);
  }

  .user-pill {
    background: color-mix(in oklab, var(--brand-green) 15%, var(--button-bg));
    color: var(--brand-green);
    border: 1px solid color-mix(in oklab, var(--brand-green) 25%, transparent);
  }

  .sample-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .sample-section h4 {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
  }

  .sample-hint {
    font-size: 12px;
    color: var(--text-secondary);
    margin: 0;
  }

  .sample-inputs {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .sample-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .sample-field label {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-secondary);
  }

  .sample-field label code {
    font-size: 12px;
    padding: 1px 4px;
    background: color-mix(in oklab, var(--brand) 10%, var(--button-bg));
    border-radius: 4px;
    color: var(--brand);
  }

  .sample-field input {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--button-border);
    border-radius: var(--radius-sm);
    font-size: 13px;
    color: var(--text-primary);
    background: var(--button-bg);
    transition: border-color 0.2s;
  }

  .sample-field input:focus {
    outline: none;
    border-color: var(--brand);
    background: var(--btn-secondary);
  }

  .rendered-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .rendered-section h4 {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
  }

  .rendered-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .rendered-header h4 {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
  }

  .copy-button {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding: 6px 10px;
    background: var(--button-bg);
    border: 1px solid var(--button-border);
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .copy-button:hover {
    background: var(--btn-secondary);
    border-color: var(--brand);
    color: var(--brand);
    transform: translateY(-1px);
  }

  .copy-button:active {
    transform: translateY(0);
  }

  .copy-button svg {
    flex-shrink: 0;
  }

  .rendered-text {
    padding: 16px;
    background: var(--surface-card);
    border: 1px solid var(--surface-border);
    border-radius: var(--radius-md);
    font-size: 14px;
    line-height: 1.7;
    color: var(--text-primary);
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 300px;
    overflow-y: auto;
  }
</style>
