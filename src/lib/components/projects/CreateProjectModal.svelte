<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { _ } from 'svelte-i18n';
  import Modal from '$lib/admin/components/Modal.svelte';
  import { createProject, updateProject } from '../../api/projectsApi';
  import type { Project, CreateProjectPayload, ProjectCategory } from '../../types/project';
  import { toast } from '../Toaster.svelte';

  const categoryColors: Record<ProjectCategory, { bg: string, text: string, border: string }> = {
    research: { bg: 'rgba(59, 130, 246, 0.12)', text: '#3b82f6', border: 'rgba(59, 130, 246, 0.3)' },
    planning: { bg: 'rgba(249, 115, 22, 0.12)', text: '#f97316', border: 'rgba(249, 115, 22, 0.3)' },
    code: { bg: 'rgba(139, 92, 246, 0.12)', text: '#8b5cf6', border: 'rgba(139, 92, 246, 0.3)' },
    meetings: { bg: 'rgba(16, 185, 129, 0.12)', text: '#10b981', border: 'rgba(16, 185, 129, 0.3)' },
    onboarding: { bg: 'rgba(99, 102, 241, 0.12)', text: '#6366f1', border: 'rgba(99, 102, 241, 0.3)' },
    brainstorms: { bg: 'rgba(236, 72, 153, 0.12)', text: '#ec4899', border: 'rgba(236, 72, 153, 0.3)' },
    writing: { bg: 'rgba(234, 179, 8, 0.12)', text: '#eab308', border: 'rgba(234, 179, 8, 0.3)' },
    design: { bg: 'rgba(6, 182, 212, 0.12)', text: '#06b6d4', border: 'rgba(6, 182, 212, 0.3)' },
  };

  interface Props {
    isOpen: boolean;
    onclose: () => void;
    onCreated: (project: Project) => void;
    editProject?: Project | null;
  }

  let { isOpen = $bindable(), onclose, onCreated, editProject = null }: Props = $props();

  let name = $state('');
  let description = $state('');
  let selectedCategory = $state<ProjectCategory>('research');
  let visibility = $state<'private' | 'team'>('private');
  let saving = $state(false);
  let nameInputEl = $state<HTMLInputElement | null>(null);

  interface CategoryOption {
    id: ProjectCategory;
    labelKey: string;
    emoji: string;
  }

  const categories: CategoryOption[] = [
    { id: 'research', labelKey: 'sidebar.catResearch', emoji: '🔍' },
    { id: 'planning', labelKey: 'sidebar.catPlanning', emoji: '📋' },
    { id: 'code', labelKey: 'sidebar.catCode', emoji: '{ }' },
    { id: 'meetings', labelKey: 'sidebar.catMeetings', emoji: '📅' },
    { id: 'onboarding', labelKey: 'sidebar.catOnboarding', emoji: '💼' },
    { id: 'brainstorms', labelKey: 'sidebar.catBrainstorms', emoji: '🧠' },
    { id: 'writing', labelKey: 'sidebar.catWriting', emoji: '✏️' },
    { id: 'design', labelKey: 'sidebar.catDesign', emoji: '🎨' },
  ];

  let lastAutoName = $state('');

  function selectCategory(cat: CategoryOption) {
    selectedCategory = cat.id;
    const label = $_(cat.labelKey);
    if (!name.trim() || name === lastAutoName) {
      name = label;
      lastAutoName = label;
    }
    nameInputEl?.focus();
  }

  $effect(() => {
    if (isOpen) {
      if (editProject) {
        name = editProject.name;
        description = editProject.description;
        selectedCategory = editProject.category;
        visibility = editProject.visibility;
      } else {
        name = '';
        description = '';
        selectedCategory = 'research';
        visibility = 'private';
        lastAutoName = '';
      }
    }
  });

  async function handleSubmit() {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    saving = true;
    try {
      if (editProject) {
        const updated = await updateProject(editProject.id, {
          name: trimmedName,
          description: description.trim(),
          category: selectedCategory,
          visibility,
        });
        toast.success($_('sidebar.projectUpdated', { values: { name: trimmedName } }));
        onCreated(updated);
      } else {
        const payload: CreateProjectPayload = {
          name: trimmedName,
          description: description.trim(),
          category: selectedCategory,
          visibility,
        };
        const project = await createProject(payload);
        toast.success($_('sidebar.projectCreated', { values: { name: trimmedName } }));
        onCreated(project);
      }
      onclose();
    } catch {
      toast.error(editProject ? $_('sidebar.updateProjectError') : $_('sidebar.createProjectError'));
    } finally {
      saving = false;
    }
  }

  let isValid = $derived(name.trim().length > 0);
</script>

<!--
  The dialog wears the redesigned family the Configure, Delete and
  Add-to-project dialogs use: a 6px gradient rule, a tile beside a
  title-and-subtitle heading, 14px sentence-case labels over hairline-ringed
  controls, and a pinned footer whose actions sit on the end edge.
-->
<Modal
  {isOpen}
  title={editProject ? $_('sidebar.editProject') : $_('sidebar.newProject')}
  subtitle={editProject ? editProject.name : $_('sidebar.newProjectSubtitle')}
  {onclose}
  variant="access-control"
>
  {#snippet headerIcon()}
    <span class="cp-tile" aria-hidden="true">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      </svg>
    </span>
  {/snippet}

  <form
    class="project-form"
    id="create-project-form"
    onsubmit={(e) => {
      e.preventDefault();
      handleSubmit();
    }}
  >
    <div class="form-group">
      <label class="form-label form-label--required" for="project-name"
        >{$_('sidebar.projectName')}</label
      >
      <div class="input-wrap">
        <input
          id="project-name"
          type="text"
          placeholder={$_('sidebar.projectNamePlaceholder')}
          bind:value={name}
          bind:this={nameInputEl}
          maxlength="100"
        />
      </div>
    </div>

    <div class="form-group">
      <!-- The chips had no label and no grouping semantics: a screen reader
           announced eight unrelated buttons with no sense of a single choice. -->
      <span class="form-label" id="project-category-label"
        >{$_('sidebar.projectCategory')}</span
      >
      <div
        class="category-chips"
        role="radiogroup"
        aria-labelledby="project-category-label"
      >
        {#each categories as cat (cat.id)}
          {@const colors = categoryColors[cat.id]}
          <button
            type="button"
            role="radio"
            aria-checked={selectedCategory === cat.id}
            class="category-chip"
            class:selected={selectedCategory === cat.id}
            style:--chip-bg-selected={colors.bg}
            style:--chip-text-selected={colors.text}
            style:--chip-border-selected={colors.border}
            onclick={() => selectCategory(cat)}
          >
            <span class="chip-emoji" aria-hidden="true">{cat.emoji}</span>
            <span class="chip-label">{$_(cat.labelKey)}</span>
          </button>
        {/each}
      </div>
    </div>

    <div class="form-group">
      <label class="form-label" for="project-description"
        >{$_('sidebar.projectDescription')}</label
      >
      <div class="input-wrap input-wrap--area">
        <textarea
          id="project-description"
          placeholder={$_('sidebar.projectDescriptionPlaceholder')}
          bind:value={description}
          rows="3"
          maxlength="500"
        ></textarea>
      </div>
    </div>

    <div class="form-group">
      <span class="form-label" id="visibility-label"
        >{$_('sidebar.projectVisibility')}</span
      >
      <div
        class="visibility-options"
        role="radiogroup"
        aria-labelledby="visibility-label"
      >
        <button
          type="button"
          role="radio"
          aria-checked={visibility === 'private'}
          class="visibility-option"
          class:selected={visibility === 'private'}
          onclick={() => (visibility = 'private')}
        >
          <span class="visibility-icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </span>
          <span class="visibility-text">
            <span class="visibility-label"
              >{$_('sidebar.projectVisibilityPrivate')}</span
            >
            <span class="visibility-desc"
              >{$_('sidebar.projectVisibilityPrivateDesc')}</span
            >
          </span>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={visibility === 'team'}
          class="visibility-option"
          class:selected={visibility === 'team'}
          onclick={() => (visibility = 'team')}
        >
          <span class="visibility-icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </span>
          <span class="visibility-text">
            <span class="visibility-label"
              >{$_('sidebar.projectVisibilityTeam')}</span
            >
            <span class="visibility-desc"
              >{$_('sidebar.projectVisibilityTeamDesc')}</span
            >
          </span>
        </button>
      </div>
    </div>
  </form>

  {#snippet footer()}
    <span></span>
    <div class="footer-actions">
      <button
        class="btn-cancel"
        type="button"
        onclick={onclose}
        disabled={saving}
      >
        {$_('sidebar.cancel')}
      </button>
      <button
        class="btn-primary"
        type="submit"
        form="create-project-form"
        disabled={!isValid || saving}
      >
        {#if saving}
          <span class="spinner" aria-hidden="true"></span>
        {/if}
        <span>
          {saving
            ? editProject
              ? $_('sidebar.saving')
              : $_('sidebar.creating')
            : editProject
              ? $_('common.save')
              : $_('sidebar.createProject')}
        </span>
      </button>
    </div>
  {/snippet}
</Modal>

<style>
  /* The dialog renders in the shared #modal-portal, outside this component's
     tree; Svelte stamps its scope class on the markup, so these rules follow
     it there. Only global --gx-* tokens are used, so nothing needs
     re-declaring on the portal root.

     app.css paints every bare <button>/<input>/<textarea> as a glass pill, so
     that is stripped once here — every control below is flat. */
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
    cursor: pointer;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    transition: none;
  }

  button:hover,
  button:active {
    transform: none;
    box-shadow: none;
    background: none;
  }

  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  input,
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
    color: var(--gx-slate-900);
  }

  input:focus,
  textarea:focus {
    background: transparent;
    box-shadow: none;
  }

  .cp-tile {
    width: 40px;
    height: 40px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--gx-ring-soft);
    color: var(--gx-tx-chip-icon-fg);
  }

  /* The dialog body is a column flex container with `align-items: flex-start`,
     so a `width: auto` child is sized to its max-content rather than
     stretched — the form has to claim the width explicitly or its fields
     spill past the card. */
  .project-form {
    display: flex;
    flex-direction: column;
    gap: 20px;
    align-self: stretch;
    width: 100%;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: flex-start;
    align-self: stretch;
  }

  .form-label {
    font-family: var(--gx-font);
    font-weight: 700;
    font-size: 14px;
    line-height: 100%;
    color: var(--gx-org-ink);
  }

  .form-label--required::after {
    content: " *";
    color: var(--gx-org-danger);
  }

  .input-wrap {
    min-height: 42px;
    border-radius: 10px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    display: flex;
    padding: 0 14px;
    align-items: center;
    align-self: stretch;
    box-sizing: border-box;
    transition: box-shadow 120ms ease;
  }

  .input-wrap:focus-within {
    box-shadow:
      inset 0 0 0 1.5px var(--gx-tx-chip-icon-fg),
      inset 0 0 4px 0 rgba(59, 103, 189, 0.149);
  }

  .input-wrap--area {
    padding: 12px 14px;
    align-items: stretch;
  }

  .input-wrap input {
    padding-block: 12px;
    font-weight: 400;
    font-size: 14px;
    line-height: 100%;
  }

  .input-wrap textarea {
    font-weight: 400;
    font-size: 14px;
    line-height: 1.5;
    resize: vertical;
    min-height: 66px;
  }

  .input-wrap input::placeholder,
  .input-wrap textarea::placeholder {
    color: var(--gx-slate-400);
    opacity: 1;
  }

  /* ---------------- category chips ---------------- */
  .category-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-self: stretch;
  }

  .category-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    padding: 0 12px;
    border-radius: 8px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    font-family: var(--gx-font);
    font-weight: 600;
    font-size: 13px;
    line-height: 100%;
    color: var(--gx-slate-500);
    transition:
      background-color 120ms ease,
      box-shadow 120ms ease,
      color 120ms ease;
  }

  .category-chip:hover:not(:disabled) {
    background: var(--gx-ring-soft);
    color: var(--gx-org-ink);
  }

  /* The category's own colour marks the selection — it is the one place in the
     dialog where colour carries meaning rather than decoration. */
  .category-chip.selected {
    background: var(--chip-bg-selected);
    box-shadow: inset 0 0 0 1.5px var(--chip-border-selected);
    color: var(--chip-text-selected);
  }

  .category-chip:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
  }

  .chip-emoji {
    font-size: 14px;
    line-height: 1;
  }

  /* ---------------- visibility ---------------- */
  .visibility-options {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-self: stretch;
  }

  .visibility-option {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    align-self: stretch;
    padding: 12px 14px;
    border-radius: 10px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    transition:
      background-color 120ms ease,
      box-shadow 120ms ease;
  }

  .visibility-option:hover:not(:disabled) {
    background: var(--gx-ring-soft);
  }

  .visibility-option.selected {
    background: var(--gx-ring-soft);
    box-shadow: inset 0 0 0 1.5px var(--gx-tx-chip-icon-fg);
  }

  .visibility-option:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
  }

  .visibility-icon {
    display: flex;
    flex-shrink: 0;
    margin-top: 1px;
    color: var(--gx-slate-500);
  }

  .visibility-option.selected .visibility-icon {
    color: var(--gx-tx-chip-icon-fg);
  }

  .visibility-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .visibility-label {
    font-weight: 600;
    font-size: 14px;
    line-height: 1.2;
    color: var(--gx-org-ink);
  }

  .visibility-desc {
    font-weight: 400;
    font-size: 12.5px;
    line-height: 1.4;
    color: var(--gx-slate-500);
  }

  /* ---------------- footer ---------------- */
  .footer-actions {
    display: flex;
    gap: 12px;
    flex-shrink: 0;
    margin-inline-start: auto;
  }

  .btn-cancel,
  .btn-primary {
    height: 37px;
    border-radius: 10px;
    padding: 10px 16px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-family: var(--gx-font);
    font-weight: 600;
    font-size: 14px;
    line-height: 100%;
    transition: background-color 120ms ease;
  }

  .btn-cancel {
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    color: var(--gx-ac-slate-600);
  }

  .btn-cancel:hover:not(:disabled) {
    background: var(--gx-org-track);
  }

  .btn-primary {
    background: var(--gx-tx-chip-icon-fg);
    color: #fff;
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--gx-ac-cta-hover);
  }

  .btn-cancel:focus-visible,
  .btn-primary:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
  }

  .spinner {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    border: 2px solid rgba(255, 255, 255, 0.35);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .spinner {
      animation: none;
    }
  }
</style>
