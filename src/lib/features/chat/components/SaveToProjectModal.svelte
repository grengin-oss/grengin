<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { onMount } from 'svelte';
  import { _ } from 'svelte-i18n';
  import Modal from '$lib/admin/components/Modal.svelte';
  import { listProjects, contributeArtifact } from '../../../api/projectsApi';
  import type { Project, ProjectCategory } from '../../../types/project';
  import { toast } from '../../../components/Toaster.svelte';

  interface Props {
    messageContent: string;
    onclose: () => void;
  }

  let { messageContent, onclose }: Props = $props();

  let isOpen = $state(true);
  let projects = $state<Project[]>([]);
  let loading = $state(true);
  let saving = $state(false);
  let selectedProjectId = $state<string | null>(null);
  let artifactTitle = $state('');
  let contentType = $state<'text/markdown' | 'text/html'>('text/markdown');
  let searchQuery = $state('');

  const categoryEmoji: Record<ProjectCategory, string> = {
    research: '🔍',
    planning: '📋',
    code: '{ }',
    meetings: '📅',
    onboarding: '💼',
    brainstorms: '🧠',
    writing: '✏️',
    design: '🎨',
  };

  let filteredProjects = $derived(
    searchQuery.trim()
      ? projects.filter(
          (p) =>
            p.name.toLowerCase().includes(searchQuery.trim().toLowerCase()) ||
            p.description?.toLowerCase().includes(searchQuery.trim().toLowerCase())
        )
      : projects
  );

  let canSave = $derived(
    selectedProjectId !== null && artifactTitle.trim().length > 0
  );

  onMount(async () => {
    detectContentType();
    try {
      const res = await listProjects();
      projects = res.projects;
    } catch {
      toast.error($_('chat.saveToProject.loadError'));
    } finally {
      loading = false;
    }
  });

  async function handleSave() {
    if (!selectedProjectId || !artifactTitle.trim()) return;
    saving = true;
    try {
      await contributeArtifact(selectedProjectId, {
        title: artifactTitle.trim(),
        content: messageContent,
        contentType,
      });
      const projectName = projects.find((p) => p.id === selectedProjectId)?.name;
      toast.success($_('chat.saveToProject.saved', { values: { name: projectName ?? '' } }));
      isOpen = false;
      onclose();
    } catch {
      toast.error($_('chat.saveToProject.saveError'));
    } finally {
      saving = false;
    }
  }

  function handleClose() {
    isOpen = false;
    onclose();
  }

  function detectContentType() {
    const trimmed = messageContent.trim();
    if (
      trimmed.startsWith('<!DOCTYPE') ||
      trimmed.startsWith('<html') ||
      trimmed.startsWith('<div') ||
      trimmed.startsWith('<section') ||
      /<[a-z][\s\S]*>/i.test(trimmed.slice(0, 200))
    ) {
      contentType = 'text/html';
    } else {
      contentType = 'text/markdown';
    }
  }
</script>

<!--
  The dialog wears the redesigned family the Configure and Delete dialogs use:
  a 6px gradient rule, a tile beside a title-and-subtitle heading, 14px
  sentence-case field labels over hairline-ringed inputs, and a pinned footer
  whose actions sit on the end edge. The old glass-and-indigo styling predated
  the design system and matched nothing else in the app.
-->
<Modal
  {isOpen}
  title={$_('chat.saveToProject.title')}
  subtitle={$_('chat.saveToProject.subtitle')}
  onclose={handleClose}
  variant="access-control"
>
  {#snippet headerIcon()}
    <span class="stp-tile" aria-hidden="true">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        <line x1="12" y1="11" x2="12" y2="17" />
        <line x1="9" y1="14" x2="15" y2="14" />
      </svg>
    </span>
  {/snippet}

  <div class="stp-form">
    <div class="field">
      <label class="field-label field-label--required" for="artifact-title"
        >{$_('chat.saveToProject.titleLabel')}</label
      >
      <div class="input-wrap">
        <input
          id="artifact-title"
          type="text"
          bind:value={artifactTitle}
          placeholder={$_('chat.saveToProject.titlePlaceholder')}
          maxlength="100"
        />
      </div>
    </div>

    <div class="field">
      <label class="field-label field-label--required" for="project-search"
        >{$_('chat.saveToProject.projectLabel')}</label
      >
      <div class="input-wrap input-wrap--search">
        <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          id="project-search"
          type="text"
          bind:value={searchQuery}
          placeholder={$_('chat.saveToProject.searchPlaceholder')}
        />
      </div>

      {#if loading}
        <div class="list-note" role="status">
          <span class="spinner" aria-hidden="true"></span>
          <span>{$_('chat.saveToProject.loading')}</span>
        </div>
      {:else if filteredProjects.length === 0}
        <div class="list-note" role="status">
          <span
            >{projects.length === 0
              ? $_('chat.saveToProject.emptyNone')
              : $_('chat.saveToProject.emptyNoMatch')}</span
          >
        </div>
      {:else}
        <div class="project-list">
          {#each filteredProjects as proj (proj.id)}
            <button
              class="project-option"
              type="button"
              aria-pressed={selectedProjectId === proj.id}
              class:project-option--on={selectedProjectId === proj.id}
              onclick={() => (selectedProjectId = proj.id)}
            >
              <span class="project-option__icon" aria-hidden="true"
                >{categoryEmoji[proj.category] || '📁'}</span
              >
              <span class="project-option__info">
                <span class="project-option__name">{proj.name}</span>
                {#if proj.description}
                  <span class="project-option__desc">{proj.description}</span>
                {/if}
              </span>
              {#if selectedProjectId === proj.id}
                <svg class="project-option__check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              {/if}
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <div class="field">
      <span class="field-label">{$_('chat.saveToProject.previewLabel')}</span>
      <div class="preview">
        {messageContent.slice(0, 300)}{messageContent.length > 300 ? '...' : ''}
      </div>
    </div>
  </div>

  {#snippet footer()}
    <span></span>
    <div class="footer-actions">
      <button class="btn-cancel" type="button" onclick={handleClose} disabled={saving}>
        {$_('common.cancel')}
      </button>
      <button
        class="btn-primary"
        type="button"
        onclick={handleSave}
        disabled={!canSave || saving}
      >
        {#if saving}
          <span class="spinner spinner--on-brand" aria-hidden="true"></span>
        {/if}
        <span>{saving ? $_('chat.saveToProject.saving') : $_('chat.saveToProject.save')}</span>
      </button>
    </div>
  {/snippet}
</Modal>

<style>
  /* The dialog renders in the shared #modal-portal, outside this component's
     tree, but Svelte stamps its scope class on the markup itself, so these
     rules follow the elements there. Only global --gx-* tokens are used, so
     nothing has to be re-declared on the portal root.

     app.css paints every bare <button>/<input> as a glass pill — padding, a
     fill, a radius, an inset shadow, a lift on hover. Every control below is
     flat, so that is stripped once here. */
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
    line-height: 100%;
  }

  input:focus {
    background: transparent;
    box-shadow: none;
  }

  /* ---------------- header tile ---------------- */
  .stp-tile {
    width: 40px;
    height: 40px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--gx-ring-soft);
    color: var(--gx-tx-chip-icon-fg);
  }

  /* ---------------- body ---------------- */
  /* The dialog body is a column flex container with `align-items: flex-start`,
     so an item with `width: auto` is sized to its MAX-content, not stretched.
     Left alone this form measured 529px inside a 322px body and every field
     spilled past the card. Stretching it explicitly is what binds it to the
     dialog's width. */
  .stp-form {
    display: flex;
    flex-direction: column;
    gap: 20px;
    align-self: stretch;
    width: 100%;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: flex-start;
    align-self: stretch;
  }

  .field-label {
    font-family: var(--gx-font);
    font-weight: 700;
    font-size: 14px;
    line-height: 100%;
    color: var(--gx-org-ink);
  }

  .field-label--required::after {
    content: " *";
    color: var(--gx-org-danger);
  }

  .input-wrap {
    position: relative;
    min-height: 42px;
    border-radius: 10px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    display: flex;
    gap: 8px;
    padding-inline: 14px;
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

  .input-wrap input {
    flex-grow: 1;
    min-width: 0;
    padding-block: 12px;
    font-weight: 400;
    font-size: 14px;
    color: var(--gx-slate-900);
  }

  .input-wrap input::placeholder {
    color: var(--gx-slate-400);
    opacity: 1;
  }

  .search-icon {
    flex-shrink: 0;
    color: var(--gx-slate-400);
  }

  /* ---------------- project picker ---------------- */
  .project-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-self: stretch;
    max-height: 220px;
    overflow-y: auto;
  }

  .list-note {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    align-self: stretch;
    padding: 24px;
    border-radius: 10px;
    background: var(--gx-ring-soft);
    font-size: 13px;
    color: var(--gx-slate-500);
  }

  .project-option {
    display: flex;
    align-items: center;
    gap: 10px;
    align-self: stretch;
    padding: 10px 12px;
    border-radius: 10px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    transition:
      background-color 120ms ease,
      box-shadow 120ms ease;
  }

  .project-option:hover:not(:disabled) {
    background: var(--gx-ring-soft);
  }

  .project-option--on {
    background: var(--gx-ring-soft);
    box-shadow: inset 0 0 0 1.5px var(--gx-tx-chip-icon-fg);
  }

  .project-option:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
  }

  .project-option__icon {
    font-size: 18px;
    line-height: 1;
    flex-shrink: 0;
  }

  .project-option__info {
    flex-grow: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .project-option__name {
    font-weight: 600;
    font-size: 14px;
    line-height: 1.2;
    color: var(--gx-org-ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .project-option__desc {
    font-size: 12px;
    line-height: 1.35;
    color: var(--gx-slate-500);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .project-option__check {
    flex-shrink: 0;
    color: var(--gx-tx-chip-icon-fg);
  }

  /* ---------------- preview ---------------- */
  .preview {
    align-self: stretch;
    box-sizing: border-box;
    padding: 12px 14px;
    border-radius: 10px;
    background: var(--gx-ring-soft);
    font-size: 12.5px;
    line-height: 1.55;
    color: var(--gx-ac-slate-600);
    max-height: 100px;
    overflow-y: auto;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
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

  /* ---------------- spinner ---------------- */
  .spinner {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    border: 2px solid var(--gx-hair);
    border-top-color: var(--gx-tx-chip-icon-fg);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  .spinner--on-brand {
    border-color: rgba(255, 255, 255, 0.35);
    border-top-color: #fff;
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
