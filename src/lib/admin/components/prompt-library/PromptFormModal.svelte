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
  let formErrors = $state<Record<string, string>>({});
  let isSubmitting = $state(false);

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
    const v = newVariable.trim();
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

  // Extract variables from prompt text ({{variable_name}} pattern)
  let detectedVariables = $derived(
    [...formData.prompt_text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]),
  );
</script>

<Modal
  {isOpen}
  onclose={onClose}
  title={mode === "create" ? $_('admin.promptLibrary.createPrompt') : $_('admin.promptLibrary.editPrompt')}
>
  <form
    class="prompt-form"
    onsubmit={(e) => {
      e.preventDefault();
      handleSubmit();
    }}
  >
    <div class="form-group">
      <label for="prompt-name">
        {$_('admin.promptLibrary.form.name')} <span class="required">*</span>
      </label>
      <input
        id="prompt-name"
        type="text"
        bind:value={formData.name}
        placeholder={$_('admin.promptLibrary.form.namePlaceholder')}
        class:error={formErrors.name}
        disabled={isSubmitting}
        bind:this={nameInput}
      />
      {#if formErrors.name}
        <span class="error-message">{formErrors.name}</span>
      {/if}
    </div>

    <div class="form-group">
      <label for="prompt-role">
        {$_('admin.promptLibrary.form.role')} <span class="required">*</span>
      </label>
      <select
        id="prompt-role"
        bind:value={formData.role_id}
        disabled={isSubmitting}
        class:error={formErrors.role_id}
      >
        <option value="" disabled>{$_('admin.promptLibrary.form.selectRole')}</option>
        {#each roles as role}
          <option value={role.id}>{role.name}</option>
        {/each}
      </select>
      {#if formErrors.role_id}
        <span class="error-message">{formErrors.role_id}</span>
      {/if}
    </div>

    <div class="form-group">
      <label for="prompt-text">
        {$_('admin.promptLibrary.form.promptText')} <span class="required">*</span>
      </label>
      <textarea
        id="prompt-text"
        bind:value={formData.prompt_text}
        placeholder={$_('admin.promptLibrary.form.promptTextPlaceholder')}
        rows="6"
        disabled={isSubmitting}
        class:error={formErrors.prompt_text}
      ></textarea>
      {#if formErrors.prompt_text}
        <span class="error-message">{formErrors.prompt_text}</span>
      {/if}
      {#if detectedVariables.length > 0}
        <div class="detected-vars">
          <span class="detected-label">{$_('admin.promptLibrary.form.detectedVariables')}</span>
          {#each detectedVariables as v}
            <span class="var-chip detected">{`{{${v}}}`}</span>
          {/each}
        </div>
      {/if}
    </div>

    <div class="form-group">
      <label for="new-variable-input">{$_('admin.promptLibrary.form.variables')}</label>
      <div class="variable-input-row">
        <input
          id="new-variable-input"
          type="text"
          bind:value={newVariable}
          placeholder={$_('admin.promptLibrary.form.addVariablePlaceholder')}
          onkeydown={handleVariableKeydown}
          disabled={isSubmitting}
        />
        <button
          type="button"
          class="btn-add-var"
          onclick={addVariable}
          disabled={isSubmitting || !newVariable.trim()}
        >
          {$_('admin.promptLibrary.form.addVariable')}
        </button>
      </div>
      {#if formErrors.variable}
        <span class="error-message">{formErrors.variable}</span>
      {/if}
      {#if formData.variables.length > 0}
        <div class="variables-list">
          {#each formData.variables as variable, i}
            <span class="var-chip">
              {variable}
              <button
                type="button"
                class="remove-var"
                onclick={() => removeVariable(i)}
                disabled={isSubmitting}
                aria-label={`Remove ${variable}`}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </span>
          {/each}
        </div>
      {/if}
      <span class="help-text">{$_('admin.promptLibrary.form.variablesHelp')}</span>
    </div>

    <div class="form-group">
      <label class="checkbox-label">
        <input
          type="checkbox"
          bind:checked={formData.is_system}
          disabled={isSubmitting}
        />
        <span>{$_('admin.promptLibrary.form.systemPrompt')}</span>
      </label>
      <span class="help-text">{$_('admin.promptLibrary.form.systemPromptHelp')}</span>
    </div>

    <div class="form-actions">
      <button
        type="button"
        class="btn-secondary"
        onclick={onClose}
        disabled={isSubmitting}
      >
        {$_('common.cancel')}
      </button>
      <button type="submit" class="btn-primary" disabled={isSubmitting}>
        {isSubmitting
          ? mode === "create"
            ? $_('admin.promptLibrary.form.creating')
            : $_('admin.promptLibrary.form.saving')
          : mode === "create"
            ? $_('admin.promptLibrary.form.createButton')
            : $_('admin.promptLibrary.form.saveButton')}
      </button>
    </div>
  </form>
</Modal>

<style>
  .prompt-form {
    padding: 4px;
  }

  .form-group {
    margin-bottom: 20px;
  }

  .form-group label {
    display: block;
    font-size: 14px;
    font-weight: 500;
    color: var(--text-primary);
    margin-bottom: 6px;
  }

  .required {
    color: #ef4444;
  }

  .form-group input[type="text"],
  .form-group textarea,
  .form-group select {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--button-border);
    border-radius: var(--radius-sm);
    font-size: 14px;
    color: var(--text-primary);
    background: var(--button-bg);
    transition: border-color 0.2s;
    font-family: inherit;
  }

  .form-group textarea {
    resize: vertical;
    min-height: 120px;
    line-height: 1.6;
  }

  .form-group input[type="text"]:focus,
  .form-group textarea:focus,
  .form-group select:focus {
    outline: none;
    border-color: var(--brand);
    background: var(--btn-secondary);
  }

  .form-group input.error,
  .form-group textarea.error,
  .form-group select.error {
    border-color: var(--brand-red);
  }

  .form-group input:disabled,
  .form-group textarea:disabled,
  .form-group select:disabled {
    background-color: var(--btn-quaternary);
    cursor: not-allowed;
    opacity: 0.6;
  }

  .error-message {
    display: block;
    margin-top: 4px;
    font-size: 12px;
    color: var(--brand-red);
  }

  .help-text {
    display: block;
    margin-top: 6px;
    font-size: 12px;
    color: var(--text-secondary);
  }

  .variable-input-row {
    display: flex;
    gap: 8px;
  }

  .variable-input-row input {
    flex: 1;
  }

  .btn-add-var {
    padding: 10px 16px;
    background: var(--btn-secondary);
    border: 1px solid var(--button-border);
    border-radius: var(--radius-sm);
    font-size: 13px;
    font-weight: 500;
    color: var(--brand);
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
  }

  .btn-add-var:hover:not(:disabled) {
    background: var(--btn-tertiary);
    border-color: var(--brand);
  }

  .btn-add-var:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .variables-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 10px;
  }

  .var-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    background: color-mix(in oklab, var(--brand) 12%, var(--button-bg));
    border: 1px solid color-mix(in oklab, var(--brand) 25%, transparent);
    border-radius: var(--radius-full);
    font-size: 12px;
    font-weight: 500;
    color: var(--brand);
  }

  .var-chip.detected {
    background: color-mix(
      in oklab,
      var(--brand-green) 12%,
      var(--button-bg)
    );
    border-color: color-mix(in oklab, var(--brand-green) 25%, transparent);
    color: var(--brand-green);
  }

  .detected-vars {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin-top: 8px;
  }

  .detected-label {
    font-size: 12px;
    color: var(--text-secondary);
  }

  .remove-var {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--brand);
    cursor: pointer;
    border-radius: 50%;
    transition: all 0.15s;
  }

  .remove-var:hover {
    background: rgba(var(--brand-red-rgb), 0.15);
    color: var(--brand-red);
    transform: none;
    box-shadow: none;
  }

  .checkbox-label {
    display: flex !important;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }

  .checkbox-label input[type="checkbox"] {
    width: 16px;
    height: 16px;
    accent-color: var(--brand);
    cursor: pointer;
  }

  .checkbox-label span {
    font-size: 14px;
    color: var(--text-primary);
  }

  .form-actions {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
    margin-top: 24px;
    padding-top: 20px;
    border-top: 1px solid var(--glass-stroke-dark);
  }

  .btn-secondary {
    padding: 10px 20px;
    background: var(--button-bg);
    border: 1px solid var(--button-border);
    border-radius: var(--radius-sm);
    font-size: 14px;
    font-weight: 500;
    color: var(--text-primary);
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--btn-secondary);
    border-color: var(--glass-stroke-light);
  }

  .btn-secondary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-primary {
    padding: 10px 20px;
    background: var(--brand);
    border: none;
    border-radius: var(--radius-sm);
    font-size: 14px;
    font-weight: 500;
    color: white;
    cursor: pointer;
    transition: background 0.2s;
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--brand-hover);
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
