<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { onMount } from "svelte";
  import { _ } from "svelte-i18n";
  import LoadingSpinner from "../../admin/components/LoadingSpinner.svelte";
  import Modal from "../../admin/components/Modal.svelte";
  import {
    getUserSystemPrompt,
    updateUserSystemPrompt,
    deleteUserSystemPrompt,
    submitPromptFeedback,
  } from "../../api/userPrompt.js";
  import type { UserSystemPrompt } from "../../api/userPrompt.js";
  import { ApiError } from "../../api/client.js";
  import { toast } from "../../components/Toaster.svelte";

  /** The mockup's "150 / 2000 characters" counter. */
  const MAX_CHARS = 2000;

  let loading = $state(true);
  let saving = $state(false);
  let resetting = $state(false);
  let prompt = $state<UserSystemPrompt | null>(null);
  let editorText = $state("");
  let originalText = $state("");
  let showPreview = $state(false);
  let showResetModal = $state(false);

  // Feedback state
  let feedbackRating = $state<number | null>(null);
  let feedbackComment = $state("");
  let submittingFeedback = $state(false);

  let textareaRef = $state<HTMLTextAreaElement | null>(null);

  const hasChanges = $derived(editorText !== originalText);
  const charCount = $derived(editorText.length);

  const previewText = $derived(() => {
    if (!editorText.trim()) return "";
    let text = editorText;
    if (prompt?.variables) {
      for (const variable of prompt.variables) {
        text = text.replaceAll(
          `{{${variable}}}`,
          `<span class="variable-highlight">{{${variable}}}</span>`,
        );
      }
    }
    return text;
  });

  async function loadPrompt() {
    loading = true;
    try {
      prompt = await getUserSystemPrompt();
      editorText = prompt.prompt_text ?? "";
      originalText = editorText;
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.description || $_("userPromptSettings.failedToLoad")
          : $_("userPromptSettings.failedToLoad");
      toast.error(message);
    } finally {
      loading = false;
    }
  }

  async function handleSave() {
    if (!hasChanges || !prompt) return;
    saving = true;
    try {
      const result = await updateUserSystemPrompt({
        custom_prompt_text: editorText,
        is_active: true,
        prompt_id: prompt.prompt_id,
      });
      prompt = result;
      originalText = editorText;
      toast.success($_("userPromptSettings.messages.saved"));
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.description || $_("userPromptSettings.messages.failedToSave")
          : $_("userPromptSettings.messages.failedToSave");
      toast.error(message);
    } finally {
      saving = false;
    }
  }

  async function handleReset() {
    resetting = true;
    try {
      await deleteUserSystemPrompt();
      showResetModal = false;
      toast.success($_("userPromptSettings.messages.reset"));
      await loadPrompt();
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.description || $_("userPromptSettings.messages.failedToReset")
          : $_("userPromptSettings.messages.failedToReset");
      toast.error(message);
    } finally {
      resetting = false;
    }
  }

  function insertVariable(variable: string) {
    const insertion = `{{${variable}}}`;
    if (textareaRef) {
      const start = textareaRef.selectionStart;
      const end = textareaRef.selectionEnd;
      editorText = editorText.substring(0, start) + insertion + editorText.substring(end);
      // Restore cursor after insertion
      requestAnimationFrame(() => {
        if (textareaRef) {
          const newPos = start + insertion.length;
          textareaRef.selectionStart = newPos;
          textareaRef.selectionEnd = newPos;
          textareaRef.focus();
        }
      });
    } else {
      editorText += insertion;
    }
    toast.success($_("userPromptSettings.variables.copied"));
  }

  async function handleFeedbackSubmit() {
    if (feedbackRating === null) {
      toast.error($_("userPromptSettings.feedback.ratingRequired"));
      return;
    }
    if (!prompt) return;
    submittingFeedback = true;
    try {
      await submitPromptFeedback({
        prompt_id: prompt.prompt_id,
        rating: feedbackRating,
        comment: feedbackComment,
      });
      toast.success($_("userPromptSettings.feedback.submitted"));
      feedbackRating = null;
      feedbackComment = "";
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.description || $_("userPromptSettings.feedback.failedToSubmit")
          : $_("userPromptSettings.feedback.failedToSubmit");
      toast.error(message);
    } finally {
      submittingFeedback = false;
    }
  }

  function getSourceLabel(source: string): string {
    return $_(`userPromptSettings.source.${source}`) || source;
  }

  onMount(() => {
    loadPrompt();
  });
</script>

<div class="prompt-panel">
  {#if loading}
    <LoadingSpinner size="md" text={$_("userPromptSettings.loading")} />
  {:else if prompt}
    <!-- ".card" — System prompt -->
    <section class="card">
      <div class="card-header-row">
        <div class="card-title-block">
          <span class="card-title">{$_("userPromptSettings.editor.title")}</span>
          <span class="default-pill default-pill--{prompt.source}">
            {getSourceLabel(prompt.source)}
          </span>
        </div>

        <!-- ".preview-toggle" -->
        <div class="preview-toggle" role="group" aria-label={$_("userPromptSettings.editor.preview")}>
          <button
            class="pv-btn"
            type="button"
            aria-pressed={!showPreview}
            onclick={() => (showPreview = false)}
          >
            {$_("userPromptSettings.editor.edit")}
          </button>
          <button
            class="pv-btn"
            type="button"
            aria-pressed={showPreview}
            onclick={() => (showPreview = true)}
          >
            {$_("userPromptSettings.editor.preview")}
          </button>
        </div>
      </div>

      <span class="card-desc">{$_("userPromptSettings.editor.description")}</span>

      <!-- ".variables-row" -->
      {#if prompt.variables && prompt.variables.length > 0}
        <div class="variables-row">
          <span class="variables-label">{$_("userPromptSettings.variables.label")}</span>
          {#each prompt.variables as variable (variable)}
            <button
              class="var-chip"
              type="button"
              onclick={() => insertVariable(variable)}
              title={$_("userPromptSettings.variables.insertHint")}
            >
              {`{{${variable}}}`}
            </button>
          {/each}
        </div>
      {/if}

      <!-- ".prompt-textarea" -->
      {#if showPreview}
        <div class="prompt-textarea prompt-textarea--preview">
          {#if previewText()}
            <!-- eslint-disable-next-line svelte/no-at-html-tags -->
            {@html previewText()}
          {:else}
            <span class="preview-empty">{$_("userPromptSettings.editor.previewEmpty")}</span>
          {/if}
        </div>
      {:else}
        <textarea
          bind:this={textareaRef}
          bind:value={editorText}
          class="prompt-textarea"
          placeholder={$_("userPromptSettings.editor.placeholder")}
          maxlength={MAX_CHARS}
          rows="7"
        ></textarea>
      {/if}

      <!-- ".textarea-footer" -->
      <div class="textarea-footer">
        <span class="textarea-hint">{$_("userPromptSettings.editor.hint")}</span>
        <span class="char-count">
          {$_("userPromptSettings.editor.charCountMax", {
            values: { count: charCount, max: MAX_CHARS },
          })}
        </span>
      </div>

      <div class="card-actions">
        <button class="cta-btn" type="button" onclick={handleSave} disabled={!hasChanges || saving}>
          {#if saving}
            <span class="btn-spinner"></span>
            {$_("userPromptSettings.actions.saving")}
          {:else}
            {$_("userPromptSettings.actions.save")}
          {/if}
        </button>
        {#if prompt.source === "user_custom"}
          <button
            class="ghost-btn ghost-btn--danger"
            type="button"
            onclick={() => (showResetModal = true)}
            disabled={resetting}
          >
            {$_("userPromptSettings.actions.resetToDefault")}
          </button>
        {/if}
      </div>
    </section>

    <!-- ".card" — Prompt feedback -->
    <section class="card">
      <span class="card-title">{$_("userPromptSettings.feedback.title")}</span>
      <span class="card-desc">{$_("userPromptSettings.feedback.subtitle")}</span>

      <!-- ".rating-buttons" -->
      <div class="rating-buttons">
        <button
          class="rating-btn"
          type="button"
          aria-pressed={feedbackRating === 1}
          onclick={() => (feedbackRating = feedbackRating === 1 ? null : 1)}
          title={$_("userPromptSettings.feedback.thumbsUp")}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path
              d="M6.75 7.9v7.6h6.9c.75 0 1.4-.5 1.55-1.25l1.15-5.65c.15-.85-.5-1.65-1.4-1.65h-3.4l.5-2.9c.15-.85-.5-1.65-1.4-1.65-.5 0-1 .25-1.3.75L6.75 7.9z"
              stroke="currentColor"
              stroke-width="1.2"
              fill="none"
              stroke-linejoin="round"
            />
            <path
              d="M2.25 7.9h3.35v7.6H2.25z"
              stroke="currentColor"
              stroke-width="1.2"
              fill="none"
            />
          </svg>
          {$_("userPromptSettings.feedback.accurate")}
        </button>
        <button
          class="rating-btn"
          type="button"
          aria-pressed={feedbackRating === -1}
          onclick={() => (feedbackRating = feedbackRating === -1 ? null : -1)}
          title={$_("userPromptSettings.feedback.thumbsDown")}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path
              d="M11.25 10.1V2.5h-6.9c-.75 0-1.4.5-1.55 1.25L1.65 9.4c-.15.85.5 1.65 1.4 1.65h3.4l-.5 2.9c-.15.85.5 1.65 1.4 1.65.5 0 1-.25 1.3-.75l2.6-4.75z"
              stroke="currentColor"
              stroke-width="1.2"
              fill="none"
              stroke-linejoin="round"
            />
            <path
              d="M15.75 10.1h-3.35V2.5h3.35z"
              stroke="currentColor"
              stroke-width="1.2"
              fill="none"
            />
          </svg>
          {$_("userPromptSettings.feedback.needsTuning")}
        </button>
      </div>

      <!-- ".feedback-textarea" -->
      <textarea
        class="feedback-textarea"
        bind:value={feedbackComment}
        placeholder={$_("userPromptSettings.feedback.commentPlaceholder")}
        rows="3"
      ></textarea>

      <div class="card-actions">
        <button
          class="cta-btn"
          type="button"
          onclick={handleFeedbackSubmit}
          disabled={feedbackRating === null || submittingFeedback}
        >
          {#if submittingFeedback}
            <span class="btn-spinner"></span>
            {$_("userPromptSettings.feedback.submitting")}
          {:else}
            {$_("userPromptSettings.feedback.submit")}
          {/if}
        </button>
      </div>
    </section>
  {/if}
</div>

<!-- Reset Confirmation Modal -->
<Modal
  isOpen={showResetModal}
  title={$_("userPromptSettings.actions.resetConfirmTitle")}
  onclose={() => (showResetModal = false)}
>
  <div class="reset-modal-body">
    <p class="reset-modal-message">{$_("userPromptSettings.actions.resetConfirmMessage")}</p>
    <div class="reset-modal-actions">
      <button class="btn btn--ghost" onclick={() => (showResetModal = false)} disabled={resetting}>
        {$_("userPromptSettings.actions.cancel")}
      </button>
      <button class="btn btn--danger" onclick={handleReset} disabled={resetting}>
        {#if resetting}
          <span class="btn-spinner"></span>
          {$_("userPromptSettings.actions.resetting")}
        {:else}
          {$_("userPromptSettings.actions.resetConfirmButton")}
        {/if}
      </button>
    </div>
  </div>
</Modal>

<style>
  /* ===== user-settings.html, Prompt Settings panel. Colours come from the
     --us-* block UserSettings.svelte declares on ".us-page". ===== */

  /* app.css paints every bare control as a glass pill; every control here is
     flat. Kept as bare selectors so the class rules below out-rank the reset. */
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

  button:focus-visible,
  textarea:focus-visible {
    outline: 2px solid var(--us-cta);
    outline-offset: 2px;
  }

  textarea {
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
    color: inherit;
    transition: none;
    resize: vertical;
  }

  textarea:focus {
    background: transparent;
    box-shadow: none;
  }

  .prompt-panel {
    display: flex;
    flex-direction: column;
    gap: 32px;
    align-self: stretch;
  }

  /* ---------------- ".card" ---------------- */
  .card {
    border-radius: 12px;
    background: var(--us-surface);
    box-shadow:
      inset 0 0 0 1px var(--us-border),
      var(--us-card-shadow);
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 24px;
    align-self: stretch;
  }

  .card-header-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
  }

  .card-title-block {
    display: flex;
    gap: 12px;
    align-items: center;
    flex-wrap: wrap;
  }

  .card-title {
    font-size: 16px;
    font-weight: 700;
    color: var(--us-title);
  }

  .card-desc {
    font-size: 13px;
    font-weight: 400;
    line-height: 1.4;
    color: var(--us-body);
  }

  /* ---------------- ".default-pill" ---------------- */
  .default-pill {
    border-radius: 4px;
    background: var(--us-track);
    padding: 3px 8px;
    font-size: 11px;
    font-weight: 600;
    color: var(--us-body);
    white-space: nowrap;
  }

  .default-pill--user_custom {
    background: var(--us-mint);
    color: var(--us-ok);
  }

  .default-pill--department_default {
    background: var(--us-tint);
    color: var(--us-accent);
  }

  /* ---------------- ".preview-toggle" ---------------- */
  .preview-toggle {
    border-radius: 6px;
    background: var(--us-track);
    display: flex;
    gap: 2px;
    padding: 3px;
    flex-shrink: 0;
  }

  .pv-btn {
    border-radius: 4px;
    padding: 4px 10px;
    font-size: 12px;
    font-weight: 600;
    color: var(--us-body);
    transition:
      background-color 120ms ease,
      box-shadow 120ms ease,
      color 120ms ease;
  }

  .pv-btn[aria-pressed="true"] {
    background: var(--us-surface);
    box-shadow: var(--us-card-shadow);
    color: var(--us-tab-active);
  }

  /* ---------------- ".variables-row" ---------------- */
  .variables-row {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }

  .variables-label {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.5px;
    color: var(--us-muted);
    text-transform: uppercase;
  }

  .var-chip {
    border-radius: 6px;
    background: var(--us-tint);
    padding: 4px 8px;
    font-family: var(--us-mono);
    font-size: 11px;
    font-weight: 700;
    color: var(--us-accent);
    transition: background-color 120ms ease;
  }

  .var-chip:hover {
    background: var(--gx-org-track-hover);
  }

  /* ---------------- ".prompt-textarea" ---------------- */
  .prompt-textarea {
    min-height: 160px;
    border-radius: 8px;
    background: var(--us-field-bg);
    box-shadow: inset 0 0 0 1px var(--us-border);
    padding: 16px;
    font-size: 14px;
    line-height: 1.5;
    color: var(--us-title);
    outline: none;
    white-space: pre-wrap;
    align-self: stretch;
    width: 100%;
  }

  .prompt-textarea:focus {
    background: var(--us-field-bg);
    box-shadow: inset 0 0 0 1.5px var(--us-cta);
  }

  .prompt-textarea::placeholder {
    color: var(--us-muted);
    opacity: 1;
  }

  .prompt-textarea--preview {
    overflow-y: auto;
    max-height: 420px;
    word-break: break-word;
  }

  .prompt-textarea--preview :global(.variable-highlight) {
    border-radius: 4px;
    background: var(--us-tint);
    padding: 1px 4px;
    font-family: var(--us-mono);
    font-size: 12px;
    font-weight: 700;
    color: var(--us-accent);
  }

  .preview-empty {
    color: var(--us-muted);
  }

  /* ---------------- ".textarea-footer" ---------------- */
  .textarea-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    align-self: stretch;
    flex-wrap: wrap;
  }

  .textarea-hint {
    font-size: 12px;
    font-weight: 400;
    color: var(--us-muted);
  }

  .char-count {
    font-size: 12px;
    font-weight: 600;
    color: var(--us-body);
  }

  /* ---------------- ".rating-buttons" ---------------- */
  .rating-buttons {
    display: flex;
    gap: 12px;
    align-self: stretch;
    flex-wrap: wrap;
  }

  .rating-btn {
    height: 42px;
    border-radius: 8px;
    background: var(--us-surface);
    box-shadow: inset 0 0 0 1px var(--us-border);
    display: flex;
    gap: 8px;
    padding: 0 12px;
    align-items: center;
    font-size: 14px;
    font-weight: 600;
    color: var(--us-body);
    transition:
      box-shadow 120ms ease,
      background-color 120ms ease,
      color 120ms ease;
  }

  .rating-btn:hover {
    background: var(--us-field-bg);
  }

  .rating-btn[aria-pressed="true"] {
    box-shadow: inset 0 0 0 1.5px var(--us-cta);
    background: var(--us-tint);
    color: var(--us-accent);
  }

  .rating-btn svg {
    display: block;
    flex-shrink: 0;
  }

  /* ---------------- ".feedback-textarea" ---------------- */
  .feedback-textarea {
    min-height: 80px;
    border-radius: 8px;
    background: var(--us-surface);
    box-shadow: inset 0 0 0 1px var(--us-border);
    padding: 16px;
    font-size: 14px;
    line-height: 1.5;
    color: var(--us-title);
    outline: none;
    align-self: stretch;
  }

  .feedback-textarea:focus {
    background: var(--us-surface);
    box-shadow: inset 0 0 0 1.5px var(--us-cta);
  }

  .feedback-textarea::placeholder {
    color: var(--us-muted);
    opacity: 1;
  }

  /* ---------------- ".disabled-btn" / the enabled CTA ---------------- */
  .card-actions {
    display: flex;
    gap: 12px;
    align-items: center;
    flex-wrap: wrap;
  }

  .cta-btn,
  .ghost-btn {
    height: 37px;
    border-radius: 6px;
    display: inline-flex;
    gap: 8px;
    padding: 0 16px;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: 600;
    white-space: nowrap;
    flex-shrink: 0;
    transition:
      background-color 120ms ease,
      color 120ms ease;
  }

  .cta-btn {
    background: var(--us-cta);
    color: #fff;
  }

  .cta-btn:hover:not(:disabled) {
    background: var(--us-cta-hover);
  }

  .cta-btn:disabled {
    background: var(--us-border);
    opacity: 0.6;
    color: var(--us-muted);
    cursor: default;
  }

  .ghost-btn {
    background: var(--us-field-bg);
    box-shadow: inset 0 0 0 1px var(--us-border);
    color: var(--us-body);
  }

  .ghost-btn--danger {
    color: var(--us-danger);
  }

  .ghost-btn--danger:hover:not(:disabled) {
    background: var(--us-danger-bg);
  }

  .ghost-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* ---------------- reset dialog (app dialog styling) ---------------- */
  .reset-modal-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .reset-modal-message {
    margin: 0;
    color: var(--text-secondary);
    line-height: 1.6;
  }

  .reset-modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-sm);
  }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-sm) var(--space-lg);
    border: none;
    border-radius: var(--radius-md);
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
  }

  .btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn--ghost {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: var(--text-secondary);
  }

  .btn--ghost:hover:not(:disabled) {
    background: rgba(var(--glass-tint), 0.05);
    color: var(--text-primary);
  }

  .btn--danger {
    background: rgba(239, 68, 68, 0.15);
    color: #f87171;
    border: 1px solid rgba(239, 68, 68, 0.3);
  }

  .btn--danger:hover:not(:disabled) {
    background: rgba(239, 68, 68, 0.25);
  }

  .btn-spinner {
    display: inline-block;
    width: 0.875rem;
    height: 0.875rem;
    border: 2px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    animation: btn-spin 0.7s linear infinite;
  }

  @keyframes btn-spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
