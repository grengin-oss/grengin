<script lang="ts">
  import { _ } from "svelte-i18n";
  import { createMySkill, updateMySkill, fileToKnowledgeAttachment } from "../../../api/skills.js";
  import { createAdminSkill, updateAdminSkill } from "../../../api/admin/skills.js";
  import type { SkillResponse } from "../../../types/skill.js";
  import { MAX_IMPORT_BYTES, toKebabCase } from "../../../types/skill.js";
  import { ApiError } from "../../../api/client.js";
  import { toast } from "../../../components/Toaster.svelte";

  /** Which catalog the imported skill lands in — drives the API. */
  type SkillScope = "user" | "admin";

  interface Props {
    open: boolean;
    /** "user" → /me/skills; "admin" → /admin/skills. */
    scope?: SkillScope;
    /** Existing skills in the same catalog — used to detect name collisions. */
    existingSkills?: SkillResponse[];
    onclose?: () => void;
    onimported?: (skill: SkillResponse) => void;
  }

  let { open, scope = "user", existingSkills = [], onclose, onimported }: Props = $props();

  const isAdmin = $derived(scope === "admin");
  const ACCEPT = ".md,.zip";

  let file = $state<File | null>(null);
  let fileError = $state<string | null>(null);
  let dragging = $state(false);
  let importing = $state(false);
  /** Set when the derived name collides with an existing skill. */
  let conflict = $state<SkillResponse | null>(null);

  let fileInput: HTMLInputElement | null = $state(null);

  // The skill name/identifier is derived from the uploaded file name — the
  // import flow asks for nothing but the file itself.
  const derivedName = $derived.by(() => {
    if (!file) return "";
    return toKebabCase(file.name.replace(/\.(md|zip)$/i, "")) || "imported-skill";
  });
  const canImport = $derived(!!file && !fileError && !importing);

  $effect(() => {
    if (!open) reset();
  });

  function reset() {
    file = null;
    fileError = null;
    dragging = false;
    importing = false;
    conflict = null;
    if (fileInput) fileInput.value = "";
  }

  function humanSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function validateAndSet(candidate: File | null | undefined) {
    if (!candidate) return;
    fileError = null;
    conflict = null;
    const okType = /\.(md|zip)$/i.test(candidate.name);
    if (!okType) {
      fileError = $_("userSkills.import.errors.type");
      file = null;
      return;
    }
    if (candidate.size === 0) {
      fileError = $_("userSkills.import.errors.empty");
      file = null;
      return;
    }
    if (candidate.size > MAX_IMPORT_BYTES) {
      fileError = $_("userSkills.import.errors.size", {
        values: { max: humanSize(MAX_IMPORT_BYTES) },
      });
      file = null;
      return;
    }
    file = candidate;
  }

  function onFilePick(e: Event) {
    const input = e.target as HTMLInputElement;
    validateAndSet(input.files?.[0]);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    dragging = false;
    validateAndSet(e.dataTransfer?.files?.[0]);
  }

  function findCollision(): SkillResponse | null {
    const slug = derivedName;
    return (
      existingSkills.find(
        (s) => !s.is_builtin && (s.identifier === slug || toKebabCase(s.name) === slug),
      ) ?? null
    );
  }

  async function handleImport() {
    if (!canImport || !file) return;
    // Detect a name collision and defer to the Replace / Skip prompt.
    const existing = findCollision();
    if (existing && !conflict) {
      conflict = existing;
      return;
    }
    await doImport(conflict);
  }

  async function doImport(replaceTarget: SkillResponse | null) {
    if (!file) return;
    importing = true;
    try {
      const knowledge_attachment = await fileToKnowledgeAttachment(file);
      const skillName = derivedName;
      let result: SkillResponse;
      if (replaceTarget) {
        result = isAdmin
          ? await updateAdminSkill(replaceTarget.id, { name: skillName, knowledge_attachment })
          : await updateMySkill(replaceTarget.id, { name: skillName, knowledge_attachment });
        toast.success($_("userSkills.import.replaced"));
      } else {
        result = isAdmin
          ? await createAdminSkill({ identifier: skillName, name: skillName, knowledge_attachment })
          : await createMySkill({ name: skillName, knowledge_attachment });
        toast.success($_("userSkills.import.imported"));
      }
      onimported?.(result);
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.description || $_("userSkills.import.failed")
          : $_("userSkills.import.failed");
      toast.error(message);
    } finally {
      importing = false;
      conflict = null;
    }
  }

  function handleBackdropKey(e: KeyboardEvent) {
    if (e.key === "Escape") onclose?.();
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="backdrop" onclick={() => onclose?.()} onkeydown={handleBackdropKey} role="presentation"></div>

  <div class="modal" role="dialog" aria-modal="true" aria-label={$_("userSkills.import.title")}>
    <header class="modal__header">
      <div>
        <h2 class="modal__title">{$_("userSkills.import.title")}</h2>
        <p class="modal__subtitle">{$_("userSkills.import.subtitle")}</p>
      </div>
      <button class="icon-btn" aria-label={$_("userSkills.import.close")} onclick={() => onclose?.()}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 6 6 18M6 6l12 12"></path>
        </svg>
      </button>
    </header>

    <div class="modal__body">
      {#if conflict}
        <!-- Per-skill Replace / Skip conflict prompt -->
        <div class="conflict">
          <div class="conflict__icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"></path>
            </svg>
          </div>
          <h3 class="conflict__title">{$_("userSkills.import.conflictTitle")}</h3>
          <p class="conflict__message">
            {$_("userSkills.import.conflictMessage", { values: { name: derivedName } })}
          </p>
        </div>
      {:else}
        <!-- Dropzone -->
        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
        <div
          class="dropzone"
          class:dropzone--active={dragging}
          class:dropzone--error={!!fileError}
          role="button"
          tabindex="0"
          onclick={() => fileInput?.click()}
          onkeydown={(e) => (e.key === "Enter" || e.key === " ") && fileInput?.click()}
          ondragover={(e) => { e.preventDefault(); dragging = true; }}
          ondragleave={() => (dragging = false)}
          ondrop={onDrop}
        >
          <input
            bind:this={fileInput}
            class="sr-only"
            type="file"
            accept={ACCEPT}
            onchange={onFilePick}
          />
          {#if file}
            <div class="file-chip">
              <span class="file-chip__icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><path d="M14 2v6h6"></path>
                </svg>
              </span>
              <span class="file-chip__meta">
                <span class="file-chip__name">{file.name}</span>
                <span class="file-chip__size">{humanSize(file.size)}</span>
              </span>
              <button
                class="file-chip__remove"
                aria-label={$_("userSkills.import.remove")}
                onclick={(e) => { e.stopPropagation(); reset(); }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M18 6 6 18M6 6l12 12"></path>
                </svg>
              </button>
            </div>
          {:else}
            <svg class="dropzone__glyph" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><path d="M17 8l-5-5-5 5"></path><path d="M12 3v12"></path>
            </svg>
            <p class="dropzone__title">{$_("userSkills.import.dropTitle")}</p>
            <p class="dropzone__hint">{$_("userSkills.import.dropHint")}</p>
          {/if}
        </div>
        {#if fileError}
          <span class="field__error">{fileError}</span>
        {/if}

        {#if file}
          <p class="derived-name">
            {$_("userSkills.import.willImportAs")}
            <code>{derivedName}</code>
          </p>
        {/if}

        <p class="import-note">{$_("userSkills.import.assetsNote")}</p>
      {/if}
    </div>

    <footer class="modal__footer">
      {#if conflict}
        <button class="btn btn--ghost" onclick={() => (conflict = null)} disabled={importing}>
          {$_("userSkills.import.skip")}
        </button>
        <button class="btn btn--primary" onclick={() => doImport(conflict)} disabled={importing}>
          {#if importing}<span class="btn-spinner"></span>{/if}
          {$_("userSkills.import.replace")}
        </button>
      {:else}
        <button class="btn btn--ghost" onclick={() => onclose?.()} disabled={importing}>
          {$_("userSkills.import.cancel")}
        </button>
        <button class="btn btn--primary" onclick={handleImport} disabled={!canImport}>
          {#if importing}
            <span class="btn-spinner"></span>
            {$_("userSkills.import.importing")}
          {:else}
            {$_("userSkills.import.importBtn")}
          {/if}
        </button>
      {/if}
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

  .modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(500px, calc(100vw - 32px));
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

  .modal__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-md);
    padding: var(--space-xl);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .modal__title {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .modal__subtitle {
    margin: 4px 0 0;
    font-size: 0.8125rem;
    color: var(--text-secondary);
  }

  .modal__body {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-xl);
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .modal__footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-md);
    padding: var(--space-lg) var(--space-xl);
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  .dropzone {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-2xs);
    min-height: 170px;
    padding: var(--space-xl);
    text-align: center;
    background: rgba(var(--glass-tint), 0.03);
    border: 1.5px dashed rgba(255, 255, 255, 0.18);
    border-radius: var(--radius-lg);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .dropzone:hover,
  .dropzone--active {
    border-color: rgba(99, 102, 241, 0.6);
    background: rgba(99, 102, 241, 0.06);
  }

  .dropzone--error {
    border-color: rgba(248, 113, 113, 0.6);
  }

  .dropzone__glyph { color: var(--text-secondary); opacity: 0.7; }

  .dropzone__title {
    margin: var(--space-2xs) 0 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .dropzone__hint {
    margin: 0;
    font-size: 0.75rem;
  }

  .file-chip {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    width: 100%;
    padding: var(--space-sm) var(--space-md);
    background: rgba(var(--glass-tint), 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: var(--radius-md);
  }

  .file-chip__icon {
    flex-shrink: 0;
    color: #a5b4fc;
    display: flex;
  }

  .file-chip__meta {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    text-align: left;
  }

  .file-chip__name {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-chip__size {
    font-size: 0.7rem;
    color: var(--text-secondary);
  }

  .file-chip__remove {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
  }

  .file-chip__remove:hover {
    background: rgba(var(--glass-tint), 0.1);
    color: var(--text-primary);
  }

  .derived-name {
    margin: 0;
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .derived-name code {
    font-family: "SF Mono", "Fira Code", monospace;
    font-size: 0.75rem;
    color: var(--text-primary);
    background: rgba(var(--glass-tint), 0.08);
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    padding: 1px 6px;
    border-radius: 5px;
  }

  .import-note {
    margin: 0;
    font-size: 0.75rem;
    line-height: 1.5;
    color: var(--text-secondary);
  }

  .field__error {
    font-size: 0.75rem;
    color: #f87171;
    line-height: 1.4;
  }

  .conflict {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: var(--space-sm);
    padding: var(--space-md) 0;
  }

  .conflict__icon {
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-md);
    background: rgba(245, 158, 11, 0.14);
    color: #fbbf24;
  }

  .conflict__title {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .conflict__message {
    margin: 0;
    font-size: 0.8125rem;
    line-height: 1.55;
    color: var(--text-secondary);
    max-width: 380px;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

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

  .btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .btn--primary { background: var(--brand, #4079c5); color: #fff; }
  .btn--primary:hover:not(:disabled) { filter: brightness(1.1); }

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

  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
  @keyframes pop {
    from { opacity: 0; transform: translate(-50%, -48%) scale(0.97); }
    to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  }
</style>
