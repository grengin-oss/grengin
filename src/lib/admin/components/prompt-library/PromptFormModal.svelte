<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import type { RolePrompt, CreateRolePromptPayload } from "../../../api/admin/rolePrompts.js";
  import type { Role } from "../../../api/admin/roles.js";
  import Modal from "../Modal.svelte";
  import { tick } from "svelte";
  import { _ } from "svelte-i18n";

  interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: CreateRolePromptPayload) => Promise<void>;
    prompt?: RolePrompt | null;
    roles: Role[];
    mode: "create" | "edit";
  }

  let {
    isOpen,
    onClose,
    onSubmit,
    prompt = null,
    roles,
    mode,
  }: Props = $props();

  let formData = $state({
    name: "",
    prompt_text: "",
    role_id: "",
    is_system: false,
    variables: [] as string[],
  });

  let newVariable = $state("");
  let nameInput = $state<HTMLInputElement | null>(null);
  let promptTextarea = $state<HTMLTextAreaElement | null>(null);
  let formErrors = $state<Record<string, string>>({});
  let isSubmitting = $state(false);

  /** ".pr-btn-create" is inert until name and prompt text both carry a value. */
  let canSubmit = $derived(
    Boolean(formData.name.trim()) &&
      Boolean(formData.prompt_text.trim()) &&
      Boolean(formData.role_id) &&
      !isSubmitting,
  );

  $effect(() => {
    if (isOpen) {
      if (mode === "edit" && prompt) {
        formData = {
          name: prompt.name,
          prompt_text: prompt.prompt_text,
          role_id: prompt.role_id,
          is_system: prompt.is_system,
          variables: [...prompt.variables],
        };
      } else {
        formData = {
          name: "",
          prompt_text: "",
          role_id: roles.length > 0 ? roles[0].id : "",
          is_system: false,
          variables: [],
        };
      }
      newVariable = "";
      formErrors = {};
      tick().then(() => {
        nameInput?.focus({ preventScroll: true });
      });
    }
  });

  function addVariable() {
    const v = newVariable.trim().replace(/\s+/g, "_");
    if (!v) return;
    if (formData.variables.includes(v)) {
      formErrors = { ...formErrors, variable: $_('admin.promptLibrary.form.variableExists') };
      return;
    }
    formData.variables = [...formData.variables, v];
    newVariable = "";
    formErrors = { ...formErrors, variable: "" };
  }

  function removeVariable(index: number) {
    formData.variables = formData.variables.filter((_, i) => i !== index);
  }

  function handleVariableKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      addVariable();
    }
  }

  /** Design: clicking a chip drops "{{name}}" in at the caret. */
  function insertVariable(name: string) {
    const token = `{{${name}}}`;
    const el = promptTextarea;
    if (!el) {
      formData.prompt_text += token;
      return;
    }
    const start = el.selectionStart ?? formData.prompt_text.length;
    const end = el.selectionEnd ?? start;
    const text = formData.prompt_text;
    formData.prompt_text = text.slice(0, start) + token + text.slice(end);
    const caret = start + token.length;
    tick().then(() => {
      el.focus({ preventScroll: true });
      el.setSelectionRange(caret, caret);
    });
  }

  function validateForm(): boolean {
    formErrors = {};

    if (!formData.name.trim()) {
      formErrors.name = $_('admin.promptLibrary.form.nameRequired');
    }

    if (!formData.prompt_text.trim()) {
      formErrors.prompt_text = $_('admin.promptLibrary.form.promptTextRequired');
    }

    if (!formData.role_id) {
      formErrors.role_id = $_('admin.promptLibrary.form.roleRequired');
    }

    return Object.keys(formErrors).filter((k) => formErrors[k]).length === 0;
  }

  async function handleSubmit() {
    if (!validateForm()) return;

    isSubmitting = true;
    try {
      await onSubmit({
        name: formData.name.trim(),
        prompt_text: formData.prompt_text.trim(),
        role_id: formData.role_id,
        is_system: formData.is_system,
        variables: formData.variables,
      });
      onClose();
    } catch (error) {
      console.error("Failed to submit prompt:", error);
    } finally {
      isSubmitting = false;
    }
  }
</script>

<!-- ===== prompts.html ".pr-modal", transcribed ===== -->
<Modal
  {isOpen}
  onclose={onClose}
  title={mode === "create"
    ? $_('admin.promptLibrary.createPrompt')
    : $_('admin.promptLibrary.editPrompt')}
  subtitle={mode === "create"
    ? $_('admin.promptLibrary.form.createSubtitle')
    : $_('admin.promptLibrary.form.editSubtitle')}
  variant="prompts"
>
  {#snippet headerIcon()}
    <span class="pr-header-icon" aria-hidden="true">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M5 2h7l4 4v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linejoin="round" />
        <path d="M12 2v4h4" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linejoin="round" />
      </svg>
    </span>
  {/snippet}

  <!-- ".pr-field" — Name -->
  <div class="pr-field">
    <div class="pr-label-row">
      <label class="pr-label" for="prompt-name">
        {$_('admin.promptLibrary.form.name')}
      </label>
      <span class="pr-req-dot" aria-hidden="true"></span>
    </div>
    <div class="pr-input" class:pr-input--error={formErrors.name}>
      <input
        id="prompt-name"
        type="text"
        bind:value={formData.name}
        bind:this={nameInput}
        placeholder={$_('admin.promptLibrary.form.namePlaceholder')}
        disabled={isSubmitting}
      />
    </div>
    {#if formErrors.name}
      <span class="pr-error">{formErrors.name}</span>
    {/if}
  </div>

  <!-- ".pr-field" — Role -->
  <div class="pr-field">
    <div class="pr-label-row">
      <label class="pr-label" for="prompt-role">
        {$_('admin.promptLibrary.form.role')}
      </label>
      <span class="pr-req-dot" aria-hidden="true"></span>
    </div>
    <div class="pr-select" class:pr-input--error={formErrors.role_id}>
      <select id="prompt-role" bind:value={formData.role_id} disabled={isSubmitting}>
        <option value="" disabled>{$_('admin.promptLibrary.form.selectRole')}</option>
        {#each roles as role (role.id)}
          <option value={role.id}>{role.name}</option>
        {/each}
      </select>
      <svg width="8" height="4" viewBox="0 0 8 4" fill="none" aria-hidden="true">
        <path d="M0 0l4 4 4-4" stroke="currentColor" stroke-width="1.2" />
      </svg>
    </div>
    {#if formErrors.role_id}
      <span class="pr-error">{formErrors.role_id}</span>
    {/if}
  </div>

  <!-- ".pr-field" — Prompt text -->
  <div class="pr-field">
    <div class="pr-prompt-label-row">
      <div class="pr-label-row">
        <label class="pr-label" for="prompt-text">
          {$_('admin.promptLibrary.form.promptText')}
        </label>
        <span class="pr-req-dot" aria-hidden="true"></span>
      </div>
      <span class="pr-hint-italic">{$_('admin.promptLibrary.form.insertHint')}</span>
    </div>
    <textarea
      id="prompt-text"
      class="pr-textarea"
      class:pr-input--error={formErrors.prompt_text}
      bind:value={formData.prompt_text}
      bind:this={promptTextarea}
      placeholder={$_('admin.promptLibrary.form.promptTextPlaceholder')}
      disabled={isSubmitting}
    ></textarea>
    {#if formErrors.prompt_text}
      <span class="pr-error">{formErrors.prompt_text}</span>
    {/if}
    <span class="pr-hint">{$_('admin.promptLibrary.form.cursorHint')}</span>
  </div>

  <!-- ".pr-field" — Variables -->
  <div class="pr-field">
    <div class="pr-label-row">
      <label class="pr-label" for="new-variable-input">
        {$_('admin.promptLibrary.form.variables')}
      </label>
    </div>
    <div class="var-add-row">
      <div class="var-input">
        <input
          id="new-variable-input"
          type="text"
          bind:value={newVariable}
          placeholder={$_('admin.promptLibrary.form.addVariablePlaceholder')}
          onkeydown={handleVariableKeydown}
          disabled={isSubmitting}
        />
      </div>
      <button
        class="btn-add-var"
        type="button"
        onclick={addVariable}
        disabled={isSubmitting || !newVariable.trim()}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M8 2v12M2 8h12" stroke="currentColor" stroke-width="1.3" />
        </svg>
        <span>{$_('admin.promptLibrary.form.addVariable')}</span>
      </button>
    </div>
    {#if formErrors.variable}
      <span class="pr-error">{formErrors.variable}</span>
    {/if}
    {#if formData.variables.length > 0}
      <div class="var-list">
        {#each formData.variables as variable, i (variable)}
          <span class="var-chip-modal">
            <button
              class="var-chip-insert"
              type="button"
              onclick={() => insertVariable(variable)}
              disabled={isSubmitting}
              title={$_('admin.promptLibrary.form.insertVariable')}
            >
              {`{{${variable}}}`}
            </button>
            <button
              class="var-chip-remove"
              type="button"
              onclick={() => removeVariable(i)}
              disabled={isSubmitting}
              aria-label={$_('admin.promptLibrary.form.removeVariable')}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                <path d="M2 2l6 6M8 2 2 8" stroke="currentColor" stroke-width="1.3" />
              </svg>
            </button>
          </span>
        {/each}
      </div>
    {/if}
    <span class="var-ref-hint">{$_('admin.promptLibrary.form.variablesRef')}</span>
    {#if formData.variables.length === 0}
      <span class="pr-hint-italic">{$_('admin.promptLibrary.form.noVariables')}</span>
    {/if}
  </div>

  <!-- ".system-prompt-card" -->
  <div class="system-prompt-card">
    <button
      class="sys-toggle"
      type="button"
      role="switch"
      aria-checked={formData.is_system}
      aria-labelledby="sys-toggle-title"
      data-on={formData.is_system}
      onclick={() => (formData.is_system = !formData.is_system)}
      disabled={isSubmitting}
    >
      <span class="sys-toggle-knob"></span>
    </button>
    <div class="sys-toggle-details">
      <span class="sys-toggle-title" id="sys-toggle-title">
        {$_('admin.promptLibrary.form.systemPrompt')}
      </span>
      <span class="sys-toggle-desc">
        {$_('admin.promptLibrary.form.systemPromptHelp')}
      </span>
    </div>
  </div>

  {#snippet footer()}
    <button
      class="pr-btn-cancel"
      type="button"
      onclick={onClose}
      disabled={isSubmitting}
    >
      {$_('common.cancel')}
    </button>
    <button
      class="pr-btn-create"
      type="button"
      data-enabled={canSubmit}
      disabled={!canSubmit}
      onclick={handleSubmit}
    >
      {isSubmitting
        ? mode === "create"
          ? $_('admin.promptLibrary.form.creating')
          : $_('admin.promptLibrary.form.saving')
        : mode === "create"
          ? $_('admin.promptLibrary.form.createButton')
          : $_('admin.promptLibrary.form.saveButton')}
    </button>
  {/snippet}
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

  button:disabled {
    cursor: not-allowed;
  }

  input,
  select,
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
  }

  input:focus,
  select:focus,
  textarea:focus {
    background: transparent;
    box-shadow: none;
  }

  /* ".pr-header-icon" */
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

  /* ".pr-field" */
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

  .pr-req-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--gx-danger);
    flex-shrink: 0;
  }

  .pr-input,
  .pr-select {
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

  .pr-input:focus-within,
  .pr-select:focus-within {
    box-shadow: inset 0 0 0 1.5px var(--gx-tx-chip-icon-fg);
  }

  .pr-input input,
  .pr-select select {
    font-weight: 400;
    font-size: 14px;
    line-height: 100%;
    color: var(--gx-slate-900);
  }

  .pr-input input::placeholder {
    color: var(--gx-slate-500);
    opacity: 1;
  }

  /* The design draws its own chevron. */
  .pr-select {
    position: relative;
    padding-inline-end: 36px;
    color: var(--gx-ac-slate-600);
  }

  .pr-select select,
  .pr-select select:focus {
    appearance: none;
    -webkit-appearance: none;
    height: 100%;
    cursor: pointer;
  }

  .pr-select > svg {
    position: absolute;
    inset-inline-end: 16px;
    pointer-events: none;
    display: block;
  }

  .pr-prompt-label-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    align-self: stretch;
    gap: 12px;
    flex-wrap: wrap;
  }

  .pr-hint-italic {
    font-weight: 400;
    font-style: italic;
    font-size: 12px;
    line-height: 1.4;
    color: var(--gx-slate-500);
  }

  .pr-textarea {
    min-height: 140px;
    border-radius: 10px;
    background: var(--gx-org-table-row-hover);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    padding: 16px;
    font-family: var(--gx-mono, ui-monospace, "SF Mono", Menlo, monospace);
    font-weight: 400;
    font-size: 13px;
    line-height: 1.5;
    color: var(--gx-an-strong);
    align-self: stretch;
    resize: vertical;
    box-sizing: border-box;
  }

  .pr-textarea:focus {
    background: var(--gx-org-table-row-hover);
    box-shadow: inset 0 0 0 1.5px var(--gx-tx-chip-icon-fg);
  }

  .pr-textarea::placeholder {
    color: var(--gx-slate-500);
    opacity: 1;
  }

  .pr-input--error,
  .pr-textarea.pr-input--error {
    box-shadow: inset 0 0 0 1.5px var(--gx-danger);
  }

  .pr-hint {
    font-weight: 400;
    font-size: 12px;
    line-height: 1.4;
    color: var(--gx-slate-500);
  }

  .pr-error {
    font-weight: 500;
    font-size: 12px;
    line-height: 1.4;
    color: var(--gx-danger);
  }

  /* ".var-add-row" */
  .var-add-row {
    display: flex;
    gap: 12px;
    align-self: stretch;
  }

  .var-input {
    flex-grow: 1;
    min-width: 0;
    height: 37px;
    border-radius: 10px;
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    padding: 0 16px;
    display: flex;
    align-items: center;
    box-sizing: border-box;
    transition: box-shadow 120ms ease;
  }

  .var-input:focus-within {
    box-shadow: inset 0 0 0 1.5px var(--gx-tx-chip-icon-fg);
  }

  .var-input input {
    flex-grow: 1;
    min-width: 0;
    font-size: 14px;
    line-height: 100%;
    color: var(--gx-slate-900);
  }

  .var-input input::placeholder {
    color: var(--gx-slate-500);
    opacity: 1;
  }

  .btn-add-var {
    height: 37px;
    border-radius: 10px;
    box-shadow: inset 0 0 0 1px var(--gx-ac-slate-300);
    padding: 0 16px;
    display: flex;
    gap: 6px;
    align-items: center;
    font-weight: 600;
    font-size: 14px;
    line-height: 100%;
    color: var(--gx-ac-slate-600);
    flex-shrink: 0;
    transition: background-color 120ms ease;
  }

  .btn-add-var:hover:not(:disabled) {
    background: var(--gx-page);
  }

  .btn-add-var:disabled {
    opacity: 0.5;
  }

  .btn-add-var:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
  }

  .btn-add-var svg {
    display: block;
    flex-shrink: 0;
  }

  /* ".var-list" — every chip inserts itself into the prompt; the × drops it. */
  .var-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .var-chip-modal {
    border-radius: 999px;
    background: var(--gx-blue-soft);
    padding: 4px 6px 4px 10px;
    display: flex;
    gap: 6px;
    align-items: center;
    font-family: var(--gx-mono, ui-monospace, "SF Mono", Menlo, monospace);
    font-weight: 500;
    font-size: 12px;
    line-height: 100%;
    color: var(--gx-tx-chip-icon-fg);
  }

  .var-chip-insert {
    font-family: inherit;
    font-weight: inherit;
    font-size: inherit;
    line-height: inherit;
    color: inherit;
  }

  .var-chip-remove {
    color: inherit;
    display: flex;
    align-items: center;
    opacity: 0.6;
  }

  .var-chip-remove:hover:not(:disabled) {
    opacity: 1;
  }

  .var-chip-insert:focus-visible,
  .var-chip-remove:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
    border-radius: 4px;
  }

  .var-ref-hint {
    font-family: var(--gx-mono, ui-monospace, "SF Mono", Menlo, monospace);
    font-weight: 400;
    font-size: 11px;
    line-height: 1.4;
    color: var(--gx-slate-500);
  }

  /* ".system-prompt-card" */
  .system-prompt-card {
    border-radius: 14px;
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    display: flex;
    gap: 16px;
    padding: 16px 18px;
    align-items: center;
    align-self: stretch;
  }

  .sys-toggle {
    width: 44px;
    height: 24px;
    border-radius: 12px;
    background: var(--gx-hair);
    display: flex;
    padding: 2px;
    align-items: center;
    flex-shrink: 0;
    box-sizing: border-box;
    transition: background-color 120ms ease;
  }

  .sys-toggle[data-on="true"] {
    background: var(--gx-org-primary-500);
    justify-content: flex-end;
  }

  .sys-toggle:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
  }

  .sys-toggle-knob {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 2px 4px 0 rgba(0, 0, 0, 0.0784);
    flex-shrink: 0;
  }

  .sys-toggle-details {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex-grow: 1;
    min-width: 0;
  }

  .sys-toggle-title {
    font-weight: 700;
    font-size: 14px;
    line-height: 100%;
    color: var(--gx-slate-900);
  }

  .sys-toggle-desc {
    font-weight: 400;
    font-size: 13px;
    line-height: 1.4;
    color: var(--gx-ac-slate-600);
  }

  /* ".pr-footer" actions */
  .pr-btn-cancel,
  .pr-btn-create {
    height: 39px;
    border-radius: 10px;
    padding: 0 18px;
    display: flex;
    align-items: center;
    font-weight: 600;
    font-size: 14px;
    line-height: 100%;
    flex-shrink: 0;
    transition:
      background-color 120ms ease,
      filter 120ms ease;
  }

  .pr-btn-cancel {
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    color: var(--gx-ac-slate-600);
  }

  .pr-btn-cancel:hover:not(:disabled) {
    background: var(--gx-page);
  }

  .pr-btn-cancel:disabled {
    opacity: 0.5;
  }

  .pr-btn-create[data-enabled="false"] {
    background: var(--gx-hair);
    color: var(--gx-slate-400);
  }

  .pr-btn-create[data-enabled="true"] {
    background: linear-gradient(
      180deg,
      rgb(74, 125, 212) 0%,
      rgb(59, 103, 189) 100%
    );
    box-shadow: 0 4px 12px 0 rgba(59, 103, 189, 0.251);
    color: #fff;
  }

  .pr-btn-create[data-enabled="true"]:hover {
    filter: brightness(1.05);
    box-shadow: 0 4px 12px 0 rgba(59, 103, 189, 0.251);
  }

  .pr-btn-cancel:focus-visible,
  .pr-btn-create:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
  }
</style>
