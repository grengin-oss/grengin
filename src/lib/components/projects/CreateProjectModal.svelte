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

<Modal
  {isOpen}
  title={editProject ? $_('sidebar.editProject') : $_('sidebar.newProject')}
  {onclose}
>
  {#snippet children()}
    <form class="project-form" onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
      <div class="form-group">
        <label class="form-label" for="project-name">{$_('sidebar.projectName')}</label>
        <input
          id="project-name"
          type="text"
          class="form-input"
          placeholder={$_('sidebar.projectNamePlaceholder')}
          bind:value={name}
          bind:this={nameInputEl}
          maxlength="100"
        />
      </div>

      <div class="category-chips">
        {#each categories as cat}
          {@const colors = categoryColors[cat.id]}
          <button
            type="button"
            class="category-chip"
            class:selected={selectedCategory === cat.id}
            style:--chip-bg-selected={colors.bg}
            style:--chip-text-selected={colors.text}
            style:--chip-border-selected={colors.border}
            onclick={() => selectCategory(cat)}
          >
            <span class="chip-emoji">{cat.emoji}</span>
            <span class="chip-label">{$_(cat.labelKey)}</span>
          </button>
        {/each}
      </div>

      <div class="form-group">
        <label class="form-label" for="project-description">{$_('sidebar.projectDescription')}</label>
        <textarea
          id="project-description"
          class="form-textarea"
          placeholder={$_('sidebar.projectDescriptionPlaceholder')}
          bind:value={description}
          rows="3"
          maxlength="500"
        ></textarea>
      </div>

      <div class="form-group">
        <span class="form-label" id="visibility-label">{$_('sidebar.projectVisibility')}</span>
        <div class="visibility-options" role="radiogroup" aria-labelledby="visibility-label">
          <button
            type="button"
            class="visibility-option"
            class:selected={visibility === 'private'}
            onclick={() => visibility = 'private'}
          >
            <div class="visibility-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <div class="visibility-text">
              <span class="visibility-label">{$_('sidebar.projectVisibilityPrivate')}</span>
              <span class="visibility-desc">{$_('sidebar.projectVisibilityPrivateDesc')}</span>
            </div>
          </button>
          <button
            type="button"
            class="visibility-option"
            class:selected={visibility === 'team'}
            onclick={() => visibility = 'team'}
          >
            <div class="visibility-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </div>
            <div class="visibility-text">
              <span class="visibility-label">{$_('sidebar.projectVisibilityTeam')}</span>
              <span class="visibility-desc">{$_('sidebar.projectVisibilityTeamDesc')}</span>
            </div>
          </button>
        </div>
      </div>

      <div class="form-actions">
        <button type="button" class="cancel-btn" onclick={onclose} disabled={saving}>
          {$_('sidebar.cancel')}
        </button>
        <button type="submit" class="submit-btn" disabled={!isValid || saving}>
          {#if saving}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spinner" aria-hidden="true">
              <circle cx="12" cy="12" r="10" opacity="0.25"/>
              <path d="M12 2a10 10 0 0 1 10 10" opacity="0.75"/>
            </svg>
            {editProject ? $_('sidebar.saving') : $_('sidebar.creating')}
          {:else}
            {$_('sidebar.createProject')}
          {/if}
        </button>
      </div>
    </form>
  {/snippet}
</Modal>

<style>
  .project-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .form-label {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text-secondary);
  }

  .form-input,
  .form-textarea {
    width: 100%;
    padding: var(--space-md) var(--space-lg);
    border: 1px solid var(--glass-stroke-dark);
    border-radius: var(--radius-md);
    background: var(--btn-secondary);
    color: var(--text-primary);
    font-size: 0.9375rem;
    font-family: inherit;
    transition: all 0.2s ease;
  }

  .form-input:focus,
  .form-textarea:focus {
    outline: none;
    border-color: var(--brand);
    box-shadow: 0 0 0 3px rgba(var(--brand-rgb), 0.15);
    background: var(--bg-primary);
  }

  .form-input::placeholder,
  .form-textarea::placeholder {
    color: var(--text-secondary);
    opacity: 0.6;
  }

  .form-textarea {
    resize: vertical;
    min-height: 80px;
  }

  /* ===== Category Chips ===== */
  .category-chips {
    display: flex;
    gap: var(--space-sm);
    flex-wrap: wrap;
  }

  .category-chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 6px 14px;
    border: 1.5px solid var(--glass-stroke-dark);
    border-radius: var(--radius-full);
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .category-chip:hover {
    border-color: var(--glass-stroke-light);
    background: var(--btn-tertiary);
    color: var(--text-primary);
    transform: none;
    box-shadow: none;
  }

  .category-chip.selected {
    border-color: var(--chip-border-selected, var(--brand));
    background: var(--chip-bg-selected, rgba(var(--brand-rgb), 0.08));
    color: var(--chip-text-selected, var(--brand));
    font-weight: 600;
    box-shadow: none;
  }

  .chip-emoji {
    font-size: 0.875rem;
    line-height: 1;
  }

  .chip-label {
    line-height: 1;
  }

  /* ===== Visibility ===== */
  .visibility-options {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .visibility-option {
    display: flex;
    align-items: flex-start;
    justify-content: flex-start;
    gap: var(--space-md);
    padding: var(--space-md) var(--space-lg);
    border: 2px solid var(--glass-stroke-dark);
    border-radius: var(--radius-md);
    background: transparent;
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: start;
    width: 100%;
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .visibility-option:hover {
    border-color: var(--glass-stroke-light);
    background: var(--btn-tertiary);
    transform: none;
    box-shadow: none;
  }

  .visibility-option.selected {
    border-color: var(--brand);
    background: rgba(var(--brand-rgb), 0.06);
    box-shadow: none;
  }

  .visibility-icon {
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    background: var(--btn-tertiary);
    color: var(--text-secondary);
  }

  .visibility-option.selected .visibility-icon {
    background: rgba(var(--brand-rgb), 0.12);
    color: var(--brand);
  }

  .visibility-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .visibility-label {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .visibility-desc {
    font-size: 0.75rem;
    color: var(--text-secondary);
    line-height: 1.4;
  }

  /* ===== Actions ===== */
  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-md);
    padding-top: var(--space-md);
    border-top: 1px solid var(--glass-stroke-dark);
  }

  .cancel-btn {
    padding: var(--space-sm) var(--space-xl);
    border: 1px solid var(--glass-stroke-dark);
    background: transparent;
    color: var(--text-primary);
    border-radius: var(--radius-md);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .cancel-btn:hover:not(:disabled) {
    background: var(--btn-secondary);
    border-color: var(--glass-stroke-light);
    transform: none;
    box-shadow: none;
  }

  .cancel-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .submit-btn {
    padding: var(--space-sm) var(--space-xl);
    border: none;
    background: var(--brand);
    color: white;
    border-radius: var(--radius-md);
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .submit-btn:hover:not(:disabled) {
    filter: brightness(1.1);
    transform: translateY(-1px);
    box-shadow: none;
  }

  .submit-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .spinner {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  @media (max-width: 480px) {
    .form-actions {
      flex-direction: column-reverse;
    }

    .cancel-btn,
    .submit-btn {
      width: 100%;
      justify-content: center;
    }
  }
</style>
