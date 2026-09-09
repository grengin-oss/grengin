<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import type { RolePrompt } from "../../../api/admin/rolePrompts.js";
  import Modal from "../Modal.svelte";
  import { _ } from "svelte-i18n";
  import { copyToClipboard } from "../../../utils/markdown.js";

  interface Props {
    isOpen: boolean;
    onClose: () => void;
    prompt: RolePrompt | null;
    /** Resolved name for the prompt's role, shown beside the type pill. */
    roleName?: string;
  }

  let { isOpen = $bindable(), onClose, prompt, roleName }: Props = $props();

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

<!-- The dialog wears prompts.html's ".pr-modal" skin, like the create form. -->
<Modal
  bind:isOpen
  onclose={() => { isOpen = false; onClose(); }}
  title={$_('admin.promptLibrary.previewPrompt')}
  subtitle={prompt?.name}
  variant="prompts"
>
  {#snippet headerIcon()}
    <span class="pr-header-icon" aria-hidden="true">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M1.5 10S4.5 4 10 4s8.5 6 8.5 6-3 6-8.5 6-8.5-6-8.5-6z" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linejoin="round" />
        <circle cx="10" cy="10" r="2.3" stroke="currentColor" stroke-width="1.3" />
      </svg>
    </span>
  {/snippet}

  {#if prompt}
    <!-- ".pr-field" — what this prompt is. -->
    <div class="pr-field">
      <div class="pr-label-row">
        <span class="pr-label">{$_('admin.promptLibrary.preview.name')}</span>
      </div>
      <div class="meta-row">
        <span class="meta-value">{prompt.name}</span>
        <span class="badge-pill badge-role">
          {roleName || $_('admin.promptLibrary.unknown')}
        </span>
        <span class="badge-pill badge-type">
          {prompt.is_system
            ? $_('admin.promptLibrary.systemType')
            : $_('admin.promptLibrary.userType')}
        </span>
      </div>
    </div>

    {#if prompt.variables.length > 0}
      <div class="pr-field">
        <div class="pr-label-row">
          <span class="pr-label">{$_('admin.promptLibrary.preview.sampleValues')}</span>
        </div>
        <span class="pr-hint">{$_('admin.promptLibrary.preview.sampleHint')}</span>
        <div class="sample-inputs">
          {#each prompt.variables as variable (variable)}
            <div class="sample-field">
              <label class="sample-label" for="sample-{variable}">
                {`{{${variable}}}`}
              </label>
              <div class="pr-input">
                <input
                  id="sample-{variable}"
                  type="text"
                  bind:value={sampleValues[variable]}
                  placeholder={$_('admin.promptLibrary.preview.samplePlaceholder')}
                />
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <div class="pr-field">
      <div class="pr-prompt-label-row">
        <div class="pr-label-row">
          <span class="pr-label">{$_('admin.promptLibrary.preview.renderedOutput')}</span>
        </div>
        <button
          class="copy-button"
          type="button"
          onclick={handleCopyRendered}
          title={$_('admin.promptLibrary.preview.copy')}
        >
          {#if copiedRendered}
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M2.5 7.5 5.5 10.5 11.5 4" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linejoin="round" />
            </svg>
            <span>{$_('admin.promptLibrary.preview.copied')}</span>
          {:else}
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <rect x="3" y="3" width="8" height="8" rx="1" stroke="currentColor" stroke-width="1.1" />
              <path d="M5.5 3V2a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-1" stroke="currentColor" stroke-width="1.1" fill="none" />
            </svg>
            <span>{$_('admin.promptLibrary.preview.copy')}</span>
          {/if}
        </button>
      </div>
      <div class="rendered-text">{renderedPrompt()}</div>
    </div>
  {/if}
</Modal>

<style>
  /* app.css paints every bare control as a glass pill; each rule below paints
     its own flat skin instead. */
  button {
    padding: 0;
    border: 0;
    border-radius: 0;
    background: none;
    box-shadow: none;
    color: inherit;
    font: inherit;
    line-height: normal;
    text-align: start;
    white-space: nowrap;
    cursor: pointer;
    transition: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  button:hover,
  button:active {
    transform: none;
    box-shadow: none;
    background: none;
  }

  input {
    width: 100%;
    padding: 0;
    border: 0;
    border-radius: 0;
    outline: none;
    background: transparent;
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    font-family: var(--gx-font);
  }

  input:focus {
    background: transparent;
    box-shadow: none;
  }

  .pr-header-icon {
    width: 40px;
    height: 40px;
    border-radius: 12px;
    background: var(--gx-org-kpi-icon-bg);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--gx-tools-badge);
    flex-shrink: 0;
  }

  .pr-field {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-self: stretch;
  }

  .pr-label-row {
    display: flex;
    gap: 4px;
    align-items: center;
  }

  .pr-label {
    font-weight: 600;
    font-size: 13px;
    line-height: 100%;
    color: var(--gx-slate-900);
  }

  .pr-prompt-label-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    align-self: stretch;
    gap: 12px;
    flex-wrap: wrap;
  }

  .pr-hint {
    font-weight: 400;
    font-size: 12px;
    line-height: 1.4;
    color: var(--gx-slate-500);
  }

  .pr-input {
    height: 41px;
    border-radius: 10px;
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    padding: 0 16px;
    display: flex;
    align-items: center;
    background: var(--gx-card);
    box-sizing: border-box;
    transition: box-shadow 120ms ease;
  }

  .pr-input:focus-within {
    box-shadow: inset 0 0 0 1.5px var(--gx-tx-chip-icon-fg);
  }

  .pr-input input {
    font-weight: 400;
    font-size: 14px;
    line-height: 100%;
    color: var(--gx-slate-900);
  }

  .pr-input input::placeholder {
    color: var(--gx-slate-500);
    opacity: 1;
  }

  .meta-row {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }

  .meta-value {
    font-weight: 600;
    font-size: 15px;
    line-height: 100%;
    color: var(--gx-an-strong);
  }

  .badge-pill {
    border-radius: 999px;
    padding: 4px 10px;
    font-weight: 600;
    font-size: 12px;
    line-height: 100%;
    display: inline-flex;
    white-space: nowrap;
  }

  .badge-role {
    background: var(--gx-an-insight-bg);
    color: var(--gx-an-chip-fg);
  }

  .badge-type {
    background: var(--gx-blue-soft);
    color: var(--gx-ac-system-fg);
  }

  .sample-inputs {
    display: flex;
    flex-direction: column;
    gap: 12px;
    align-self: stretch;
  }

  .sample-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .sample-label {
    font-family: var(--gx-mono, ui-monospace, "SF Mono", Menlo, monospace);
    font-weight: 500;
    font-size: 12px;
    line-height: 100%;
    color: var(--gx-tx-chip-icon-fg);
  }

  .copy-button {
    height: 30px;
    border-radius: 8px;
    box-shadow: inset 0 0 0 1px var(--gx-ac-slate-300);
    padding: 0 12px;
    display: flex;
    gap: 6px;
    align-items: center;
    font-weight: 600;
    font-size: 12px;
    line-height: 100%;
    color: var(--gx-ac-slate-600);
    flex-shrink: 0;
    transition: background-color 120ms ease;
  }

  .copy-button:hover {
    background: var(--gx-page);
  }

  .copy-button:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
  }

  .copy-button svg {
    display: block;
    flex-shrink: 0;
  }

  /* The rendered prompt reads as code, like ".pr-textarea" in the form. */
  .rendered-text {
    border-radius: 10px;
    background: var(--gx-org-table-row-hover);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    padding: 16px;
    font-family: var(--gx-mono, ui-monospace, "SF Mono", Menlo, monospace);
    font-weight: 400;
    font-size: 13px;
    line-height: 1.5;
    color: var(--gx-an-strong);
    white-space: pre-wrap;
    overflow-wrap: break-word;
    align-self: stretch;
  }
</style>
