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
      editorText =
        editorText.substring(0, start) +
        insertion +
        editorText.substring(end);
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

<div class="prompt-settings-container">
  {#if loading}
    <LoadingSpinner size="md" text={$_("userPromptSettings.loading")} />
  {:else if prompt}
    <!-- Active Prompt Info -->
    <section class="section-card">
      <div class="section-header">
        <h2 class="section-title">{$_("userPromptSettings.activePrompt")}</h2>
        <span
          class="source-badge"
          class:source-badge--custom={prompt.source === "user_custom"}
          class:source-badge--department={prompt.source === "department_default"}
          class:source-badge--system={prompt.source === "system_default"}
        >
          {getSourceLabel(prompt.source)}
        </span>
      </div>
      <div class="active-prompt-text">{prompt.prompt_text || "—"}</div>
    </section>

    <!-- Variables Helper -->
    {#if prompt.variables && prompt.variables.length > 0}
      <section class="section-card">
        <div class="section-header">
          <h2 class="section-title">{$_("userPromptSettings.variables.title")}</h2>
        </div>
        <p class="section-hint">{$_("userPromptSettings.variables.insertHint")}</p>
        <div class="variables-list">
          {#each prompt.variables as variable}
            <button
              type="button"
              class="variable-chip"
              onclick={() => insertVariable(variable)}
              title={`Insert {{${variable}}}`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="4 17 10 11 4 5"></polyline>
                <line x1="12" y1="19" x2="20" y2="19"></line>
              </svg>
              {`{{${variable}}}`}
            </button>
          {/each}
        </div>
      </section>
    {/if}

    <!-- Custom Prompt Editor -->
    <section class="section-card">
      <div class="section-header">
        <h2 class="section-title">{$_("userPromptSettings.editor.title")}</h2>
        <div class="editor-toggle">
          <button
            class="toggle-btn"
            class:toggle-btn--active={!showPreview}
            onclick={() => (showPreview = false)}
          >
            {$_("userPromptSettings.editor.edit")}
          </button>
          <button
            class="toggle-btn"
            class:toggle-btn--active={showPreview}
            onclick={() => (showPreview = true)}
          >
            {$_("userPromptSettings.editor.preview")}
          </button>
        </div>
      </div>

      {#if showPreview}
        <div class="preview-area">
          {#if previewText()}
            <div class="preview-content">{@html previewText()}</div>
          {:else}
            <p class="preview-empty">{$_("userPromptSettings.editor.previewEmpty")}</p>
          {/if}
        </div>
      {:else}
        <div class="editor-area">
          <textarea
            bind:this={textareaRef}
            bind:value={editorText}
            class="prompt-textarea"
            placeholder={$_("userPromptSettings.editor.placeholder")}
            rows="10"
          ></textarea>
          <div class="editor-footer">
            <span class="char-count">{$_("userPromptSettings.editor.charCount", { values: { count: charCount } })}</span>
          </div>
        </div>
      {/if}

      <div class="editor-actions">
        <button
          class="btn btn--primary"
          onclick={handleSave}
          disabled={!hasChanges || saving}
        >
          {#if saving}
            <span class="btn-spinner"></span>
            {$_("userPromptSettings.actions.saving")}
          {:else}
            {$_("userPromptSettings.actions.save")}
          {/if}
        </button>
        {#if prompt.source === "user_custom"}
          <button
            class="btn btn--ghost btn--danger"
            onclick={() => (showResetModal = true)}
            disabled={resetting}
          >
            {$_("userPromptSettings.actions.resetToDefault")}
          </button>
        {/if}
      </div>
    </section>

    <!-- Feedback Section -->
    <section class="section-card">
      <div class="section-header">
        <h2 class="section-title">{$_("userPromptSettings.feedback.title")}</h2>
      </div>
      <p class="section-hint">{$_("userPromptSettings.feedback.subtitle")}</p>

      <div class="feedback-rating">
        <button
          type="button"
          class="rating-btn"
          class:rating-btn--active={feedbackRating === 1}
          onclick={() => (feedbackRating = feedbackRating === 1 ? null : 1)}
          aria-label={$_("userPromptSettings.feedback.thumbsUp")}
          title={$_("userPromptSettings.feedback.thumbsUp")}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill={feedbackRating === 1 ? "currentColor" : "none"} stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path>
          </svg>
        </button>
        <button
          type="button"
          class="rating-btn rating-btn--down"
          class:rating-btn--active={feedbackRating === -1}
          onclick={() => (feedbackRating = feedbackRating === -1 ? null : -1)}
          aria-label={$_("userPromptSettings.feedback.thumbsDown")}
          title={$_("userPromptSettings.feedback.thumbsDown")}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill={feedbackRating === -1 ? "currentColor" : "none"} stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"></path>
          </svg>
        </button>
      </div>

      <textarea
        class="feedback-textarea"
        bind:value={feedbackComment}
        placeholder={$_("userPromptSettings.feedback.commentPlaceholder")}
        rows="3"
      ></textarea>

      <div class="feedback-actions">
        <button
          class="btn btn--primary"
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
      <button
        class="btn btn--ghost"
        onclick={() => (showResetModal = false)}
        disabled={resetting}
      >
        {$_("userPromptSettings.actions.cancel")}
      </button>
      <button
        class="btn btn--danger"
        onclick={handleReset}
        disabled={resetting}
      >
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
  .prompt-settings-container {
    padding: var(--space-lg);
    display: flex;
    flex-direction: column;
    gap: var(--space-xl);
  }

  /* Section Card */
  .section-card {
    background: rgba(var(--glass-tint), 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-lg);
    padding: var(--space-xl);
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-md);
    margin-bottom: var(--space-md);
  }

  .section-title {
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
  }

  .section-hint {
    font-size: 0.8125rem;
    color: var(--text-secondary);
    margin: 0 0 var(--space-md) 0;
  }

  /* Source Badge */
  .source-badge {
    display: inline-flex;
    align-items: center;
    padding: var(--space-2xs) var(--space-sm);
    border-radius: var(--radius-full);
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .source-badge--custom {
    background: rgba(99, 102, 241, 0.15);
    color: #818cf8;
  }

  .source-badge--department {
    background: rgba(234, 179, 8, 0.15);
    color: #fbbf24;
  }

  .source-badge--system {
    background: rgba(107, 114, 128, 0.15);
    color: #9ca3af;
  }

  /* Active prompt text */
  .active-prompt-text {
    font-size: 0.875rem;
    color: var(--text-secondary);
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 200px;
    overflow-y: auto;
    padding: var(--space-md);
    background: rgba(var(--glass-tint), 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: var(--radius-md);
  }

  /* Variables */
  .variables-list {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
  }

  .variable-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2xs);
    padding: var(--space-xs) var(--space-md);
    background: rgba(var(--glass-tint), 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: var(--radius-full);
    font-size: 0.8125rem;
    font-family: 'SF Mono', 'Fira Code', monospace;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .variable-chip:hover {
    background: rgba(99, 102, 241, 0.15);
    border-color: rgba(99, 102, 241, 0.3);
    color: #818cf8;
  }

  /* Editor Toggle */
  .editor-toggle {
    display: flex;
    gap: var(--space-2xs);
    padding: var(--space-2xs);
    background: rgba(var(--glass-tint), 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: var(--radius-md);
  }

  .toggle-btn {
    padding: var(--space-xs) var(--space-md);
    border: none;
    border-radius: var(--radius-sm);
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-secondary);
    background: transparent;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .toggle-btn:hover:not(.toggle-btn--active) {
    color: var(--text-primary);
    background: rgba(var(--glass-tint), 0.05);
  }

  .toggle-btn--active {
    color: var(--text-primary);
    background: rgba(var(--glass-tint), 0.1);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
  }

  /* Editor Area */
  .editor-area {
    display: flex;
    flex-direction: column;
  }

  .prompt-textarea {
    width: 100%;
    min-height: 200px;
    padding: var(--space-md);
    background: rgba(var(--glass-tint), 0.03);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: 0.875rem;
    font-family: 'SF Mono', 'Fira Code', monospace;
    line-height: 1.6;
    resize: vertical;
    transition: border-color 0.2s ease;
    outline: none;
    box-sizing: border-box;
  }

  .prompt-textarea:focus {
    border-color: rgba(99, 102, 241, 0.5);
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
  }

  .prompt-textarea::placeholder {
    color: var(--text-secondary);
    opacity: 0.5;
  }

  .editor-footer {
    display: flex;
    justify-content: flex-end;
    padding: var(--space-xs) 0;
  }

  .char-count {
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  /* Preview Area */
  .preview-area {
    padding: var(--space-md);
    background: rgba(var(--glass-tint), 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: var(--radius-md);
    min-height: 200px;
  }

  .preview-content {
    font-size: 0.875rem;
    color: var(--text-primary);
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .preview-empty {
    font-size: 0.875rem;
    color: var(--text-secondary);
    font-style: italic;
    margin: 0;
  }

  :global(.variable-highlight) {
    background: rgba(99, 102, 241, 0.2);
    color: #818cf8;
    padding: 1px 4px;
    border-radius: 3px;
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-weight: 600;
  }

  /* Editor Actions */
  .editor-actions {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    margin-top: var(--space-lg);
  }

  /* Buttons */
  .btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-sm) var(--space-xl);
    border: none;
    border-radius: var(--radius-md);
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn--primary {
    background: var(--brand, #4079c5);
    color: white;
  }

  .btn--primary:hover:not(:disabled) {
    filter: brightness(1.1);
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

  .btn--ghost.btn--danger {
    background: transparent;
    border: 1px solid rgba(239, 68, 68, 0.2);
    color: #f87171;
  }

  .btn--ghost.btn--danger:hover:not(:disabled) {
    background: rgba(239, 68, 68, 0.1);
  }

  .btn-spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: currentColor;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* Feedback */
  .feedback-rating {
    display: flex;
    align-items: center;
    gap: var(--space-lg);
    margin-bottom: var(--space-md);
  }

  .rating-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 52px;
    height: 52px;
    border: 2px solid rgba(255, 255, 255, 0.1);
    border-radius: var(--radius-lg);
    background: rgba(var(--glass-tint), 0.03);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .rating-btn:hover {
    border-color: rgba(34, 197, 94, 0.4);
    color: #22c55e;
    background: rgba(34, 197, 94, 0.08);
  }

  .rating-btn--active {
    border-color: rgba(34, 197, 94, 0.6);
    color: #22c55e;
    background: rgba(34, 197, 94, 0.12);
    box-shadow: 0 0 12px rgba(34, 197, 94, 0.15);
  }

  .rating-btn--down:hover {
    border-color: rgba(239, 68, 68, 0.4);
    color: #ef4444;
    background: rgba(239, 68, 68, 0.08);
  }

  .rating-btn--down.rating-btn--active {
    border-color: rgba(239, 68, 68, 0.6);
    color: #ef4444;
    background: rgba(239, 68, 68, 0.12);
    box-shadow: 0 0 12px rgba(239, 68, 68, 0.15);
  }

  .feedback-textarea {
    width: 100%;
    padding: var(--space-md);
    background: rgba(var(--glass-tint), 0.03);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: 0.875rem;
    line-height: 1.5;
    resize: vertical;
    transition: border-color 0.2s ease;
    outline: none;
    box-sizing: border-box;
  }

  .feedback-textarea:focus {
    border-color: rgba(99, 102, 241, 0.5);
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
  }

  .feedback-textarea::placeholder {
    color: var(--text-secondary);
    opacity: 0.5;
  }

  .feedback-actions {
    display: flex;
    margin-top: var(--space-md);
  }

  /* Reset Modal */
  .reset-modal-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-xl);
  }

  .reset-modal-message {
    font-size: 0.9375rem;
    color: var(--text-secondary);
    line-height: 1.6;
    margin: 0;
  }

  .reset-modal-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-md);
  }

  /* Responsive */
  @media (max-width: 768px) {
    .prompt-settings-container {
      padding: var(--space-md);
      gap: var(--space-lg);
    }

    .section-card {
      padding: var(--space-lg);
    }

    .section-header {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-sm);
    }

    .editor-actions {
      flex-direction: column;
      align-items: stretch;
    }

    .editor-actions .btn {
      justify-content: center;
    }

    .feedback-rating {
      gap: var(--space-md);
    }

    .rating-btn {
      width: 48px;
      height: 48px;
    }

    .reset-modal-actions {
      flex-direction: column-reverse;
      align-items: stretch;
    }

    .reset-modal-actions .btn {
      justify-content: center;
    }
  }
</style>
