<script lang="ts">
  import { onMount } from 'svelte';
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
      toast.error('Failed to load projects');
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
      toast.success(`Artifact saved to "${projectName}"`);
      isOpen = false;
      onclose();
    } catch {
      toast.error('Failed to save artifact');
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

<Modal {isOpen} title="Save to Project" onclose={handleClose}>
  <div class="save-to-project">
    <div class="field">
      <label class="field-label" for="artifact-title">Artifact title</label>
      <input
        id="artifact-title"
        type="text"
        class="field-input"
        bind:value={artifactTitle}
        placeholder="e.g. Q3 Campaign Draft"
        maxlength="100"
      />
    </div>

    <div class="field">
      <label class="field-label">Content type</label>
      <div class="content-type-toggle">
        <button
          class="type-btn"
          class:active={contentType === 'text/markdown'}
          onclick={() => (contentType = 'text/markdown')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          Markdown
        </button>
        <button
          class="type-btn"
          class:active={contentType === 'text/html'}
          onclick={() => (contentType = 'text/html')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
          </svg>
          HTML
        </button>
      </div>
    </div>

    <div class="field">
      <label class="field-label">Select project</label>
      <div class="search-box">
        <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          class="search-input"
          bind:value={searchQuery}
          placeholder="Search projects..."
        />
      </div>

      {#if loading}
        <div class="project-list-loading">
          <div class="loading-spinner small"></div>
          <span>Loading projects...</span>
        </div>
      {:else if filteredProjects.length === 0}
        <div class="project-list-empty">
          {#if projects.length === 0}
            <p>No projects yet. Create one first.</p>
          {:else}
            <p>No projects match your search.</p>
          {/if}
        </div>
      {:else}
        <div class="project-list">
          {#each filteredProjects as proj (proj.id)}
            <button
              class="project-option"
              class:selected={selectedProjectId === proj.id}
              onclick={() => (selectedProjectId = proj.id)}
            >
              <span class="project-option-icon">{categoryEmoji[proj.category] || '📁'}</span>
              <div class="project-option-info">
                <span class="project-option-name">{proj.name}</span>
                {#if proj.description}
                  <span class="project-option-desc">{proj.description}</span>
                {/if}
              </div>
              {#if selectedProjectId === proj.id}
                <svg class="check-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              {/if}
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <div class="preview-section">
      <label class="field-label">Content preview</label>
      <div class="content-preview">
        {messageContent.slice(0, 300)}{messageContent.length > 300 ? '...' : ''}
      </div>
    </div>

    <div class="modal-actions">
      <button class="btn-cancel" onclick={handleClose}>Cancel</button>
      <button
        class="btn-save"
        onclick={handleSave}
        disabled={!canSave || saving}
      >
        {#if saving}
          <div class="loading-spinner tiny"></div>
          Saving...
        {:else}
          Save Artifact
        {/if}
      </button>
    </div>
  </div>
</Modal>

<style>
  .save-to-project {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg, 16px);
    padding: var(--space-md, 12px) 0;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs, 6px);
  }

  .field-label {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-secondary, #888);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .field-input {
    padding: var(--space-sm, 8px) var(--space-md, 12px);
    border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.1));
    border-radius: var(--glass-radius, 12px);
    background: rgba(var(--glass-tint, 255, 255, 255), 0.06);
    color: var(--text-primary, #fff);
    font-size: 0.9rem;
    outline: none;
    transition: border-color 0.2s;
  }

  .field-input:focus {
    border-color: var(--brand, #6366f1);
  }

  .content-type-toggle {
    display: flex;
    gap: var(--space-xs, 6px);
  }

  .type-btn {
    display: flex;
    align-items: center;
    gap: var(--space-xs, 6px);
    padding: var(--space-xs, 6px) var(--space-md, 12px);
    border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.1));
    border-radius: var(--glass-radius, 12px);
    background: rgba(var(--glass-tint, 255, 255, 255), 0.04);
    color: var(--text-secondary, #888);
    font-size: 0.82rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .type-btn.active {
    border-color: var(--brand, #6366f1);
    background: rgba(99, 102, 241, 0.12);
    color: var(--brand, #6366f1);
  }

  .search-box {
    position: relative;
  }

  .search-icon {
    position: absolute;
    left: var(--space-sm, 10px);
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-tertiary, #666);
    pointer-events: none;
  }

  .search-input {
    width: 100%;
    padding: var(--space-sm, 8px) var(--space-sm, 8px) var(--space-sm, 8px) var(--space-2xl, 34px);
    border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.1));
    border-radius: var(--glass-radius, 12px);
    background: rgba(var(--glass-tint, 255, 255, 255), 0.06);
    color: var(--text-primary, #fff);
    font-size: 0.85rem;
    outline: none;
    box-sizing: border-box;
  }

  .search-input:focus {
    border-color: var(--brand, #6366f1);
  }

  .project-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs, 4px);
    max-height: 220px;
    overflow-y: auto;
    margin-top: var(--space-xs, 4px);
  }

  .project-list-loading,
  .project-list-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-sm, 8px);
    padding: var(--space-xl, 24px);
    color: var(--text-tertiary, #666);
    font-size: 0.85rem;
  }

  .project-option {
    display: flex;
    align-items: center;
    gap: var(--space-sm, 10px);
    padding: var(--space-sm, 10px) var(--space-md, 12px);
    border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
    border-radius: var(--glass-radius, 12px);
    background: rgba(var(--glass-tint, 255, 255, 255), 0.03);
    cursor: pointer;
    transition: all 0.2s;
    text-align: left;
    width: 100%;
    color: inherit;
  }

  .project-option:hover {
    background: rgba(var(--glass-tint, 255, 255, 255), 0.08);
  }

  .project-option.selected {
    border-color: var(--brand, #6366f1);
    background: rgba(99, 102, 241, 0.1);
  }

  .project-option-icon {
    font-size: 1.2rem;
    flex-shrink: 0;
  }

  .project-option-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .project-option-name {
    font-size: 0.88rem;
    font-weight: 500;
    color: var(--text-primary, #fff);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .project-option-desc {
    font-size: 0.76rem;
    color: var(--text-tertiary, #666);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .check-icon {
    flex-shrink: 0;
    color: var(--brand, #6366f1);
  }

  .preview-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs, 6px);
  }

  .content-preview {
    padding: var(--space-sm, 10px) var(--space-md, 12px);
    border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
    border-radius: var(--glass-radius, 12px);
    background: rgba(var(--glass-tint, 255, 255, 255), 0.03);
    font-size: 0.8rem;
    color: var(--text-secondary, #888);
    max-height: 100px;
    overflow-y: auto;
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.5;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-sm, 8px);
    padding-top: var(--space-sm, 8px);
    border-top: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
  }

  .btn-cancel {
    padding: var(--space-sm, 8px) var(--space-lg, 16px);
    border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.12));
    border-radius: var(--glass-radius, 12px);
    background: transparent;
    color: var(--text-secondary, #888);
    font-size: 0.85rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-cancel:hover {
    background: rgba(var(--glass-tint, 255, 255, 255), 0.06);
  }

  .btn-save {
    display: flex;
    align-items: center;
    gap: var(--space-xs, 6px);
    padding: var(--space-sm, 8px) var(--space-lg, 20px);
    border: none;
    border-radius: var(--glass-radius, 12px);
    background: var(--brand, #6366f1);
    color: white;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-save:hover:not(:disabled) {
    background: var(--brand-hover, #4f46e5);
  }

  .btn-save:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .loading-spinner {
    width: 20px;
    height: 20px;
    border: 2px solid rgba(255, 255, 255, 0.2);
    border-top-color: currentColor;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  .loading-spinner.small {
    width: 16px;
    height: 16px;
  }

  .loading-spinner.tiny {
    width: 12px;
    height: 12px;
    border-width: 1.5px;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
