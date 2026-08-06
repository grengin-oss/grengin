<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { onMount } from "svelte";
  import { _ } from "svelte-i18n";
  import { createMySkill, updateMySkill } from "../../../api/skills.js";
  import { createAdminSkill, updateAdminSkill } from "../../../api/admin/skills.js";
  import { getMcpServers } from "../../../api/integrations.js";
  import { getDepartmentsTree } from "../../../api/admin/departments.js";
  import type { McpServer } from "../../../types/integrations.js";
  import type { Department } from "../../../admin/types.js";
  import type { SkillResponse, SkillToolsConfig } from "../../../types/skill.js";
  import { isKebabCase, toKebabCase, emptyToolsConfig } from "../../../types/skill.js";
  import { ApiError } from "../../../api/client.js";
  import { renderMarkdown } from "../../../utils/markdown.js";
  import { toast } from "../../../components/Toaster.svelte";

  /** Which catalog the skill belongs to — drives the API and the visible fields. */
  type SkillScope = "user" | "admin";

  interface Props {
    open: boolean;
    /** Existing skill to edit, or null when creating. */
    skill?: SkillResponse | null;
    /** "user" → /me/skills; "admin" → /admin/skills (adds identifier + department). */
    scope?: SkillScope;
    onclose?: () => void;
    onsaved?: (skill: SkillResponse) => void;
  }

  let { open, skill = null, scope = "user", onclose, onsaved }: Props = $props();

  const AVATAR_CHOICES = ["✨", "🎨", "🔍", "📊", "🧪", "🧠", "⚡", "📝", "🛠️", "🌐", "🤖", "📚"];

  let name = $state("");
  let identifier = $state("");
  let departmentId = $state("");
  let description = $state("");
  let avatar = $state("");
  let instructions = $state("");
  let webSearch = $state(false);
  let selectedServerIds = $state<string[]>([]);
  /** Markdown editor view: "code" (raw) or "preview" (rendered). */
  let instructionsView = $state<"code" | "preview">("code");
  /** Whether the user has interacted with a field (drives inline errors). */
  let touched = $state({ name: false, identifier: false, description: false, instructions: false });

  let mcpServers = $state<McpServer[]>([]);
  let loadingServers = $state(false);
  /** Flattened department tree (admin scope) — for the department dropdown. */
  let departments = $state<Department[]>([]);
  let loadingDepartments = $state(false);
  let saving = $state(false);

  const isEditing = $derived(!!skill);
  const isAdmin = $derived(scope === "admin");

  // --- Client-side validation (immediate, before hitting the backend) ---
  // Creating only asks for identity (name + description); the full field set —
  // instructions, avatar, web search, tool grants — is revealed on edit.
  const nameError = $derived.by(() => {
    const v = name.trim();
    if (v.length === 0) return $_("userSkills.editor.errors.nameRequired");
    if (!isAdmin && !isKebabCase(v)) return $_("userSkills.editor.errors.nameKebab");
    return null;
  });
  const identifierError = $derived.by(() => {
    if (!isAdmin || isEditing) return null;
    const v = identifier.trim();
    if (v.length === 0) return $_("userSkills.editor.errors.identifierRequired");
    if (!isKebabCase(v)) return $_("userSkills.editor.errors.identifierKebab");
    return null;
  });
  const descriptionError = $derived(
    description.trim().length === 0 ? $_("userSkills.editor.errors.descriptionRequired") : null,
  );
  // Instructions are required when writing a new skill on the app.
  const instructionsError = $derived(
    !isEditing && instructions.trim().length === 0
      ? $_("userSkills.editor.errors.instructionsRequired")
      : null,
  );
  const isValid = $derived(!nameError && !identifierError && !descriptionError && !instructionsError);
  const canSave = $derived(isValid && !saving);

  const previewHtml = $derived(instructions.trim() ? renderMarkdown(instructions) : "");

  // Reset the form whenever the panel opens or the target skill changes.
  $effect(() => {
    if (open) {
      name = skill?.name ?? "";
      identifier = skill?.identifier ?? "";
      departmentId = skill?.department_id ?? "";
      description = skill?.description ?? "";
      avatar = skill?.avatar ?? "";
      instructions = skill?.instructions ?? "";
      webSearch = skill?.tools_config?.web_search ?? false;
      selectedServerIds = [...(skill?.tools_config?.mcp_server_ids ?? [])];
      instructionsView = "code";
      touched = { name: false, identifier: false, description: false, instructions: false };
    }
  });

  async function loadServers() {
    loadingServers = true;
    try {
      const res = await getMcpServers();
      mcpServers = res.servers ?? [];
    } catch {
      mcpServers = [];
    } finally {
      loadingServers = false;
    }
  }

  /** Flatten the department tree into a depth-tagged list for the dropdown. */
  function flattenDepartments(nodes: Department[], depth = 0): Department[] {
    let out: Department[] = [];
    for (const node of nodes) {
      out.push({ ...node, depth });
      if (node.children && node.children.length > 0) {
        out = out.concat(flattenDepartments(node.children, depth + 1));
      }
    }
    return out;
  }

  async function loadDepartments() {
    loadingDepartments = true;
    try {
      const res = await getDepartmentsTree();
      departments = flattenDepartments(res.tree ?? []);
    } catch {
      departments = [];
    } finally {
      loadingDepartments = false;
    }
  }

  onMount(() => {
    loadServers();
    // The department dropdown is only shown for admin skills.
    if (scope === "admin") loadDepartments();
  });

  function toggleServer(id: string) {
    selectedServerIds = selectedServerIds.includes(id)
      ? selectedServerIds.filter((s) => s !== id)
      : [...selectedServerIds, id];
  }

  // Admin only: auto-suggest an identifier slug from the name while creating.
  function onNameInput() {
    if (isAdmin && !isEditing && (!identifier || identifier === toKebabCase(name.slice(0, -1)))) {
      identifier = toKebabCase(name);
    }
  }

  function handleBackdropKey(e: KeyboardEvent) {
    if (e.key === "Escape") onclose?.();
  }

  async function handleSave() {
    if (!canSave) {
      // Surface any pending inline errors if the user jumps straight to save.
      touched = { name: true, identifier: true, description: true, instructions: true };
      return;
    }
    saving = true;

    const tools_config: SkillToolsConfig = {
      web_search: webSearch,
      mcp_server_ids: selectedServerIds,
    };

    try {
      let result: SkillResponse;
      if (isAdmin) {
        if (isEditing && skill) {
          result = await updateAdminSkill(skill.id, {
            name: name.trim(),
            description: description.trim() || null,
            avatar: avatar || null,
            department_id: departmentId.trim() || null,
            instructions: instructions.trim() || null,
            tools_config,
          });
          toast.success($_("userSkills.editor.updated"));
        } else {
          result = await createAdminSkill({
            identifier: identifier.trim(),
            name: name.trim(),
            description: description.trim() || null,
            instructions: instructions.trim() || null,
          });
          toast.success($_("userSkills.editor.created"));
        }
      } else if (isEditing && skill) {
        result = await updateMySkill(skill.id, {
          name: name.trim(),
          description: description.trim() || null,
          avatar: avatar || null,
          instructions: instructions.trim() || null,
          tools_config,
        });
        toast.success($_("userSkills.editor.updated"));
      } else {
        result = await createMySkill({
          name: name.trim(),
          description: description.trim() || null,
          instructions: instructions.trim() || null,
        });
        toast.success($_("userSkills.editor.created"));
      }
      onsaved?.(result);
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.description || $_("userSkills.editor.saveFailed")
          : $_("userSkills.editor.saveFailed");
      toast.error(message);
    } finally {
      saving = false;
    }
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="backdrop" onclick={() => onclose?.()} onkeydown={handleBackdropKey} role="presentation"></div>

  <div class="panel" role="dialog" aria-modal="true" aria-label={$_("userSkills.editor.title")}>
    <header class="panel__header">
      <div>
        <h2 class="panel__title">
          {isEditing ? $_("userSkills.editor.editTitle") : $_("userSkills.editor.createTitle")}
        </h2>
        <p class="panel__subtitle">{$_("userSkills.editor.subtitle")}</p>
      </div>
      <button class="icon-btn" aria-label={$_("userSkills.editor.close")} onclick={() => onclose?.()}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 6 6 18M6 6l12 12"></path>
        </svg>
      </button>
    </header>

    <div class="panel__body">
      <label class="field">
        <span class="field__label">
          {$_("userSkills.editor.name")} <span class="req">*</span>
        </span>
        {#if !isAdmin}
          <span class="field__hint">{$_("userSkills.editor.nameHint")}</span>
        {/if}
        <input
          class="input"
          class:input--error={touched.name && nameError}
          type="text"
          bind:value={name}
          oninput={onNameInput}
          onblur={() => (touched.name = true)}
          maxlength={isAdmin ? 80 : 60}
          autocapitalize={isAdmin ? "on" : "off"}
          autocorrect="off"
          spellcheck="false"
          aria-invalid={touched.name && !!nameError}
          placeholder={$_("userSkills.editor.namePlaceholder")}
        />
        {#if touched.name && nameError}
          <span class="field__error">{nameError}</span>
        {/if}
      </label>

      {#if isAdmin}
        <label class="field">
          <span class="field__label">
            {$_("userSkills.editor.identifier")} <span class="req">*</span>
          </span>
          <span class="field__hint">{$_("userSkills.editor.identifierHint")}</span>
          <input
            class="input mono"
            class:input--error={touched.identifier && identifierError}
            type="text"
            bind:value={identifier}
            onblur={() => (touched.identifier = true)}
            disabled={isEditing}
            maxlength="40"
            autocapitalize="off"
            autocorrect="off"
            spellcheck="false"
            placeholder="research-assistant"
          />
          {#if touched.identifier && identifierError}
            <span class="field__error">{identifierError}</span>
          {/if}
        </label>
      {/if}

      <label class="field">
        <span class="field__label">
          {$_("userSkills.editor.description")} <span class="req">*</span>
        </span>
        <input
          class="input"
          class:input--error={touched.description && descriptionError}
          type="text"
          bind:value={description}
          onblur={() => (touched.description = true)}
          maxlength="160"
          aria-invalid={touched.description && !!descriptionError}
          placeholder={$_("userSkills.editor.descriptionPlaceholder")}
        />
        {#if touched.description && descriptionError}
          <span class="field__error">{descriptionError}</span>
        {/if}
      </label>

      {#if isAdmin && isEditing}
        <div class="field">
          <span class="field__label">{$_("userSkills.editor.department")}</span>
          <span class="field__hint">{$_("userSkills.editor.departmentHint")}</span>
          {#if loadingDepartments}
            <p class="muted">{$_("userSkills.editor.loadingDepartments")}</p>
          {:else}
            <select class="input select" bind:value={departmentId}>
              <option value="">{$_("userSkills.editor.departmentNone")}</option>
              {#each departments as dept (dept.id)}
                <option value={dept.id}>
                  {"    ".repeat(dept.depth)}{dept.name}
                </option>
              {/each}
            </select>
          {/if}
        </div>
      {/if}

      <!-- Markdown instructions (with Preview / Code toggle) — shown on create too -->
      <div class="field">
        <div class="field__head">
          <span class="field__label">
            {$_("userSkills.editor.instructions")} <span class="req">*</span>
          </span>
          <div class="view-toggle" role="tablist" aria-label={$_("userSkills.editor.instructions")}>
            <button
              type="button"
              class="view-toggle__btn"
              class:view-toggle__btn--active={instructionsView === "code"}
              role="tab"
              aria-selected={instructionsView === "code"}
              onclick={() => (instructionsView = "code")}
            >
              {$_("userSkills.editor.code")}
            </button>
            <button
              type="button"
              class="view-toggle__btn"
              class:view-toggle__btn--active={instructionsView === "preview"}
              role="tab"
              aria-selected={instructionsView === "preview"}
              onclick={() => (instructionsView = "preview")}
            >
              {$_("userSkills.editor.preview")}
            </button>
          </div>
        </div>
        <span class="field__hint">{$_("userSkills.editor.instructionsHint")}</span>

        {#if instructionsView === "code"}
          <textarea
            class="input textarea"
            class:input--error={touched.instructions && instructionsError}
            bind:value={instructions}
            onblur={() => (touched.instructions = true)}
            rows="10"
            aria-invalid={touched.instructions && !!instructionsError}
            placeholder={$_("userSkills.editor.instructionsPlaceholder")}
          ></textarea>
        {:else if previewHtml}
          <!-- eslint-disable-next-line svelte/no-at-html-tags -->
          <div class="md-preview">{@html previewHtml}</div>
        {:else}
          <div class="md-preview md-preview--empty">{$_("userSkills.editor.previewEmpty")}</div>
        {/if}

        {#if touched.instructions && instructionsError}
          <span class="field__error">{instructionsError}</span>
        {/if}
      </div>

      <!-- Avatar, web search and tool grants are configured on edit. -->
      {#if isEditing}
        <div class="field">
          <span class="field__label">{$_("userSkills.editor.avatar")}</span>
          <div class="avatar-picker">
            {#each AVATAR_CHOICES as choice}
              <button
                type="button"
                class="avatar-option"
                class:avatar-option--active={avatar === choice}
                onclick={() => (avatar = avatar === choice ? "" : choice)}
              >
                {choice}
              </button>
            {/each}
          </div>
        </div>

        <!-- Web search toggle -->
        <div class="toggle-row">
          <div>
            <span class="field__label">{$_("userSkills.editor.webSearch")}</span>
            <span class="field__hint">{$_("userSkills.editor.webSearchHint")}</span>
          </div>
          <button
            type="button"
            class="switch"
            class:switch--on={webSearch}
            role="switch"
            aria-checked={webSearch}
            aria-label={$_("userSkills.editor.webSearch")}
            onclick={() => (webSearch = !webSearch)}
          >
            <span class="switch__thumb"></span>
          </button>
        </div>

        <!-- Tool grants -->
        <div class="field">
          <span class="field__label">{$_("userSkills.editor.toolGrants")}</span>
          <span class="field__hint">{$_("userSkills.editor.toolGrantsHint")}</span>

          {#if loadingServers}
            <p class="muted">{$_("userSkills.editor.loadingServers")}</p>
          {:else if mcpServers.length === 0}
            <p class="muted">{$_("userSkills.editor.noServers")}</p>
          {:else}
            <div class="server-list">
              {#each mcpServers as server (server.id)}
                {@const selected = selectedServerIds.includes(server.id)}
                <button
                  type="button"
                  class="server-option"
                  class:server-option--active={selected}
                  onclick={() => toggleServer(server.id)}
                >
                  <span class="server-check" class:server-check--on={selected}>
                    {#if selected}
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M20 6 9 17l-5-5"></path>
                      </svg>
                    {/if}
                  </span>
                  <span class="server-meta">
                    <span class="server-name">{server.name}</span>
                    {#if server.description}
                      <span class="server-desc">{server.description}</span>
                    {/if}
                  </span>
                  <span class="server-count">
                    {$_("userSkills.editor.toolCount", { values: { count: server.tools?.length ?? 0 } })}
                  </span>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <footer class="panel__footer">
      <button class="btn btn--ghost" onclick={() => onclose?.()} disabled={saving}>
        {$_("userSkills.editor.cancel")}
      </button>
      <button class="btn btn--primary" onclick={handleSave} disabled={!canSave}>
        {#if saving}
          <span class="btn-spinner"></span>
          {$_("userSkills.editor.saving")}
        {:else}
          {isEditing ? $_("userSkills.editor.save") : $_("userSkills.editor.create")}
        {/if}
      </button>
    </footer>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(2px);
    z-index: 900;
    animation: fade 0.18s ease;
  }

  .panel {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(560px, calc(100vw - 32px));
    max-height: calc(100vh - 48px);
    display: flex;
    flex-direction: column;
    background: var(--bg-primary, #14161c);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: var(--radius-lg);
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5);
    z-index: 901;
    animation: pop 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .panel__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-md);
    padding: var(--space-xl);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .panel__title {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .panel__subtitle {
    margin: 4px 0 0;
    font-size: 0.8125rem;
    color: var(--text-secondary);
  }

  .panel__body {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-xl);
    display: flex;
    flex-direction: column;
    gap: var(--space-xl);
  }

  .panel__footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-md);
    padding: var(--space-lg) var(--space-xl);
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .field__label {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .field__hint {
    font-size: 0.75rem;
    color: var(--text-secondary);
    line-height: 1.45;
  }

  .field__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-md);
  }

  .field__error {
    font-size: 0.75rem;
    color: #f87171;
    line-height: 1.4;
  }

  .req {
    color: #f87171;
  }

  .input {
    width: 100%;
    padding: var(--space-sm) var(--space-md);
    background: rgba(var(--glass-tint), 0.04);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: 0.875rem;
    font-family: inherit;
    outline: none;
    box-sizing: border-box;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }

  .input:focus {
    border-color: rgba(99, 102, 241, 0.5);
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
  }

  .input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .input--error {
    border-color: rgba(248, 113, 113, 0.6) !important;
    box-shadow: 0 0 0 3px rgba(248, 113, 113, 0.12) !important;
  }

  .mono {
    font-family: "SF Mono", "Fira Code", monospace;
  }

  .select {
    cursor: pointer;
    appearance: none;
    -webkit-appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right var(--space-md) center;
    padding-right: calc(var(--space-md) * 2 + 16px);
  }

  .select option {
    background: var(--bg-primary, #14161c);
    color: var(--text-primary);
  }

  .textarea {
    resize: vertical;
    line-height: 1.6;
    font-family: "SF Mono", "Fira Code", monospace;
  }

  .input::placeholder {
    color: var(--text-secondary);
    opacity: 0.5;
  }

  /* Preview / Code toggle */
  .view-toggle {
    display: inline-flex;
    gap: 2px;
    padding: 2px;
    background: rgba(var(--glass-tint), 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: var(--radius-sm);
  }

  .view-toggle__btn {
    padding: 3px var(--space-sm);
    border: none;
    border-radius: calc(var(--radius-sm) - 2px);
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .view-toggle__btn--active {
    background: var(--brand, #4079c5);
    color: #fff;
  }

  .md-preview {
    min-height: 220px;
    max-height: 420px;
    overflow-y: auto;
    padding: var(--space-md);
    background: rgba(var(--glass-tint), 0.04);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: var(--radius-md);
    font-size: 0.875rem;
    line-height: 1.6;
    color: var(--text-primary);
    word-break: break-word;
  }

  .md-preview :global(h1),
  .md-preview :global(h2),
  .md-preview :global(h3) {
    margin: 0.6em 0 0.3em;
    line-height: 1.3;
  }

  .md-preview :global(p) {
    margin: 0 0 0.7em;
  }

  .md-preview :global(ul),
  .md-preview :global(ol) {
    margin: 0 0 0.7em;
    padding-left: 1.4em;
  }

  .md-preview :global(pre) {
    overflow-x: auto;
    padding: var(--space-sm);
    border-radius: var(--radius-sm);
    background: rgba(0, 0, 0, 0.25);
  }

  .md-preview :global(code) {
    font-family: "SF Mono", "Fira Code", monospace;
    font-size: 0.8125rem;
  }

  .md-preview--empty {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
    font-style: italic;
  }

  .avatar-picker {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
  }

  .avatar-option {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.2rem;
    border-radius: var(--radius-md);
    background: rgba(var(--glass-tint), 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .avatar-option:hover {
    background: rgba(var(--glass-tint), 0.1);
  }

  .avatar-option--active {
    border-color: rgba(99, 102, 241, 0.6);
    background: rgba(99, 102, 241, 0.16);
    box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15);
  }

  .toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-lg);
    padding: var(--space-md);
    background: rgba(var(--glass-tint), 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-md);
  }

  .toggle-row .field__label {
    display: block;
  }

  .toggle-row .field__hint {
    margin-top: 2px;
  }

  .muted {
    font-size: 0.8125rem;
    color: var(--text-secondary);
    font-style: italic;
    margin: var(--space-xs) 0 0;
  }

  .server-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    margin-top: var(--space-2xs);
  }

  .server-option {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-sm) var(--space-md);
    background: rgba(var(--glass-tint), 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-md);
    cursor: pointer;
    text-align: left;
    transition: all 0.15s ease;
  }

  .server-option:hover {
    border-color: rgba(255, 255, 255, 0.18);
  }

  .server-option--active {
    border-color: rgba(99, 102, 241, 0.5);
    background: rgba(99, 102, 241, 0.08);
  }

  .server-check {
    flex-shrink: 0;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    border: 1.5px solid rgba(255, 255, 255, 0.25);
    color: #fff;
  }

  .server-check--on {
    background: var(--brand, #4079c5);
    border-color: var(--brand, #4079c5);
  }

  .server-meta {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .server-name {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .server-desc {
    font-size: 0.7rem;
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .server-count {
    flex-shrink: 0;
    font-size: 0.7rem;
    color: var(--text-secondary);
  }

  /* Switch */
  .switch {
    flex-shrink: 0;
    position: relative;
    width: 40px;
    height: 23px;
    padding: 0;
    border: none;
    border-radius: var(--radius-full);
    background: rgba(255, 255, 255, 0.16);
    cursor: pointer;
    transition: background 0.2s ease;
  }

  .switch--on {
    background: var(--brand, #4079c5);
  }

  .switch__thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 19px;
    height: 19px;
    border-radius: 50%;
    background: #fff;
    transition: transform 0.2s ease;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  }

  .switch--on .switch__thumb {
    transform: translateX(17px);
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
    color: #fff;
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

  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .icon-btn:hover {
    background: rgba(var(--glass-tint), 0.08);
    color: var(--text-primary);
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
    to { transform: rotate(360deg); }
  }

  @keyframes fade {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes pop {
    from { opacity: 0; transform: translate(-50%, -48%) scale(0.97); }
    to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  }
</style>
