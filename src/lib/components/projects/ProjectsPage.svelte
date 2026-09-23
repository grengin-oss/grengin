<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { navigate } from 'svelte-routing';
  import { _ } from 'svelte-i18n';
  import { listProjects, deleteProject, shareProject } from '../../api/projectsApi';
  import type { Project, ProjectCategory } from '../../types/project';
  import { toast } from '../Toaster.svelte';
  import CreateProjectModal from './CreateProjectModal.svelte';
  import DeleteConfirmDialog from '../DeleteConfirmDialog.svelte';
  import { setPageTitle } from '../../utils/pageTitle';

  $effect(() => {
    setPageTitle($_('sidebar.projects'));
  });

  let projects = $state<Project[]>([]);
  let loading = $state(true);
  let searchQuery = $state('');
  let showCreateModal = $state(false);
  let editingProject = $state<Project | null>(null);
  let showDeleteConfirm = $state(false);
  let projectToDelete = $state<Project | null>(null);
  let deleting = $state(false);

  let filteredProjects = $derived(
    searchQuery.trim()
      ? projects.filter((p) =>
          p.name.toLowerCase().includes(searchQuery.trim().toLowerCase()) ||
          p.description.toLowerCase().includes(searchQuery.trim().toLowerCase())
        )
      : projects
  );

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

  const categoryColors: Record<ProjectCategory, { bg: string, text: string, border: string }> = {
    research: { bg: 'rgba(59, 130, 246, 0.12)', text: '#3b82f6', border: 'rgba(59, 130, 246, 0.25)' },
    planning: { bg: 'rgba(249, 115, 22, 0.12)', text: '#f97316', border: 'rgba(249, 115, 22, 0.25)' },
    code: { bg: 'rgba(139, 92, 246, 0.12)', text: '#8b5cf6', border: 'rgba(139, 92, 246, 0.25)' },
    meetings: { bg: 'rgba(16, 185, 129, 0.12)', text: '#10b981', border: 'rgba(16, 185, 129, 0.25)' },
    onboarding: { bg: 'rgba(99, 102, 241, 0.12)', text: '#6366f1', border: 'rgba(99, 102, 241, 0.25)' },
    brainstorms: { bg: 'rgba(236, 72, 153, 0.12)', text: '#ec4899', border: 'rgba(236, 72, 153, 0.25)' },
    writing: { bg: 'rgba(234, 179, 8, 0.12)', text: '#eab308', border: 'rgba(234, 179, 8, 0.25)' },
    design: { bg: 'rgba(6, 182, 212, 0.12)', text: '#06b6d4', border: 'rgba(6, 182, 212, 0.25)' },
  };

  async function fetchProjects() {
    loading = true;
    try {
      const response = await listProjects();
      projects = response.projects;
    } catch {
      console.error('Failed to fetch projects');
    } finally {
      loading = false;
    }
  }

  function openCreateModal() {
    editingProject = null;
    showCreateModal = true;
  }

  function openEditModal(project: Project) {
    editingProject = project;
    showCreateModal = true;
  }

  function handleProjectCreated() {
    fetchProjects();
  }

  function confirmDelete(project: Project) {
    projectToDelete = project;
    showDeleteConfirm = true;
  }

  async function handleDelete() {
    if (!projectToDelete) return;
    deleting = true;
    try {
      await deleteProject(projectToDelete.id);
      toast.success($_('sidebar.projectDeleted', { values: { name: projectToDelete.name } }));
      projects = projects.filter((p) => p.id !== projectToDelete!.id);
      showDeleteConfirm = false;
      projectToDelete = null;
    } catch {
      toast.error($_('sidebar.deleteProjectError'));
    } finally {
      deleting = false;
    }
  }

  async function handleShare(project: Project) {
    try {
      const { shareUrl } = await shareProject(project.id);
      await navigator.clipboard.writeText(shareUrl);
      toast.success($_('sidebar.shareLinkCopied'));
    } catch {
      toast.error($_('sidebar.shareProjectError'));
    }
  }

  function openProject(project: Project) {
    navigate(`/projects/${project.id}`);
  }

  /* A missing or unparseable timestamp renders as an em dash. `new Date()`
     answers "Invalid Date" for both, which is what a user saw whenever a
     field did not reach the UI. */
  function formatDate(dateStr: string | null | undefined): string {
    if (!dateStr) return '\u2014';
    const parsed = new Date(dateStr);
    if (Number.isNaN(parsed.getTime())) return '\u2014';
    return parsed.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  $effect(() => {
    fetchProjects();
  });
</script>

<div class="projects-page">
  <div class="page-header">
    <div class="header-left">
      <h1 class="page-title">{$_('sidebar.allProjects')}</h1>
      {#if projects.length > 0}
        <span class="project-total">{projects.length}</span>
      {/if}
    </div>
    <button class="new-project-btn" onclick={openCreateModal}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="12" y1="5" x2="12" y2="19"/>
        <line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
      {$_('sidebar.newProject')}
    </button>
  </div>

  {#if projects.length > 3}
    <div class="search-bar">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="search-icon" aria-hidden="true">
        <circle cx="11" cy="11" r="8"/>
        <path d="m21 21-4.35-4.35"/>
      </svg>
      <input
        type="text"
        class="search-input"
        placeholder={$_('sidebar.searchPlaceholder')}
        bind:value={searchQuery}
      />
      {#if searchQuery}
        <button class="clear-search" onclick={() => searchQuery = ''} aria-label={$_('sidebar.clearSearch')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      {/if}
    </div>
  {/if}

  <div class="projects-grid">
    {#if loading}
      <div class="loading-state">
        <div class="loading-spinner"></div>
        <span>{$_('sidebar.loadingProjects')}</span>
      </div>
    {:else if filteredProjects.length === 0 && searchQuery}
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="empty-icon">
          <circle cx="11" cy="11" r="8"/>
          <path d="m21 21-4.35-4.35"/>
        </svg>
        <p>{$_('sidebar.noChatsFound')}</p>
      </div>
    {:else if projects.length === 0}
      <div class="glass-empty-card">
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          class="empty-icon"
          aria-hidden="true"
        >
          <path
            d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
          />
        </svg>
        <h3 class="empty-title">{$_('sidebar.noProjectsYet')}</h3>
        <p class="empty-description">{$_('projects.emptyStateDesc')}</p>
        <button class="empty-create-btn premium-btn" onclick={openCreateModal}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          {$_('sidebar.createProject')}
        </button>
      </div>
    {:else}
      {#each filteredProjects as project (project.id)}
        {@const colors = categoryColors[project.category]}
        <div class="project-card">
          <button class="card-main" onclick={() => openProject(project)}>
            <div class="card-header">
              <div 
                class="card-emoji"
                style:--emoji-bg={colors?.bg || 'var(--btn-tertiary)'}
                style:--emoji-color={colors?.text || 'inherit'}
              >
                {categoryEmoji[project.category] || '📁'}
              </div>
              
              <span 
                class="card-badge"
                style:--badge-bg={colors?.bg}
                style:--badge-text={colors?.text}
                style:--badge-border={colors?.border}
              >
                {$_(`sidebar.cat${project.category.charAt(0).toUpperCase() + project.category.slice(1)}`)}
              </span>
            </div>
            
            <div class="card-body">
              <h3 class="card-title" title={project.name}>{project.name}</h3>
              {#if project.description}
                <p class="card-description">{project.description}</p>
              {:else}
                <p class="card-description card-description--empty">{$_('sidebar.projectDescriptionPlaceholder') || 'No description'}</p>
              {/if}
            </div>

            <div class="card-footer">
              <span class="card-date">{formatDate(project.updatedAt)}</span>
              
              <div class="card-meta">
                {#if project.chatCount > 0}
                  <span class="meta-indicator" title={$_('projects.chatsCount')}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    </svg>
                    <span class="indicator-count">{project.chatCount}</span>
                  </span>
                {/if}
                
                {#if project.visibility === 'team'}
                  <span class="meta-indicator meta-indicator--team" title={$_('projects.teamVisibility')}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                      <circle cx="9" cy="7" r="4"/>
                    </svg>
                  </span>
                {:else}
                  <span class="meta-indicator meta-indicator--private" title={$_('projects.privateVisibility')}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                  </span>
                {/if}
              </div>
            </div>
          </button>
          
          <div class="card-actions-wrapper">
            <button class="action-btn" onclick={() => openEditModal(project)} title={$_('sidebar.editProject')} aria-label={$_('sidebar.editProject')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 17.25V21h3.75L17.81 10.94l-3.75-3.75L4 17.25z"/>
                <path d="M20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z"/>
              </svg>
            </button>
            <button class="action-btn" onclick={() => handleShare(project)} title={$_('sidebar.share')} aria-label={$_('sidebar.share')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg>
            </button>
            <button class="action-btn action-btn--danger" onclick={() => confirmDelete(project)} title={$_('sidebar.delete')} aria-label={$_('sidebar.delete')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3,6 5,6 21,6"/>
                <path d="m19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"/>
              </svg>
            </button>
          </div>
        </div>
      {/each}
    {/if}
  </div>
</div>

<CreateProjectModal
  isOpen={showCreateModal}
  onclose={() => { showCreateModal = false; editingProject = null; }}
  onCreated={handleProjectCreated}
  editProject={editingProject}
/>

{#if showDeleteConfirm}
  <DeleteConfirmDialog
    title={$_('sidebar.deleteProject')}
    subtitle={projectToDelete?.name}
    message={$_('sidebar.deleteProjectConfirm')}
    confirmLabel={$_('sidebar.delete')}
    busyLabel={$_('sidebar.deleting')}
    cancelLabel={$_('sidebar.cancel')}
    isBusy={deleting}
    onCancel={() => {
      showDeleteConfirm = false;
      projectToDelete = null;
    }}
    onConfirm={handleDelete}
  />
{/if}

<style>
  .projects-page {
    max-width: 1040px;
    margin: 0 auto;
    padding: var(--space-2xl) var(--space-xl);
    height: 100%;
    overflow-y: auto;
  }

  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-2xl);
    border-bottom: 1px solid var(--glass-stroke-dark);
    padding-bottom: var(--space-lg);
    position: relative;
  }

  .page-header::after {
    content: '';
    position: absolute;
    bottom: -1px;
    left: 0;
    width: 80px;
    height: 1px;
    background: linear-gradient(90deg, var(--brand), transparent);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }

  .page-title {
    font-family: 'Outfit', sans-serif;
    font-size: 2.1rem;
    font-weight: 800;
    color: var(--text-primary);
    margin: 0;
    letter-spacing: -0.035em;
    background: linear-gradient(135deg, var(--text-primary) 30%, rgba(255, 255, 255, 0.7) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .project-total {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 28px;
    height: 28px;
    padding: 0 var(--space-sm);
    border-radius: var(--radius-full);
    background: rgba(var(--brand-rgb), 0.08);
    color: var(--brand);
    font-size: 0.75rem;
    font-weight: 700;
    border: 1px solid color-mix(in oklab, var(--brand) 25%, transparent);
    box-shadow: 0 0 12px rgba(var(--brand-rgb), 0.1);
  }

  .new-project-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-sm);
    padding: 0.75rem 1.6rem;
    border: none;
    background: linear-gradient(135deg, var(--brand) 0%, var(--brand-green-accent) 100%);
    color: white;
    border-radius: var(--radius-md);
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 
      0 4px 15px rgba(var(--brand-rgb), 0.2), 
      inset 0 1px 0 rgba(255, 255, 255, 0.2);
  }

  .new-project-btn:hover {
    transform: translateY(-2px);
    box-shadow: 
      0 8px 24px rgba(var(--brand-rgb), 0.35),
      inset 0 1px 0 rgba(255, 255, 255, 0.25);
    filter: brightness(1.08);
  }

  .new-project-btn:active {
    transform: translateY(0);
  }

  .search-bar {
    position: relative;
    display: flex;
    align-items: center;
    margin-bottom: var(--space-2xl);
  }

  .search-icon {
    position: absolute;
    inset-inline-start: var(--space-md);
    color: var(--text-secondary);
    pointer-events: none;
  }

  .search-input {
    width: 100%;
    padding: 0.75rem 1rem 0.75rem 2.5rem;
    border: 1px solid var(--glass-stroke-dark);
    border-radius: var(--radius-md);
    background: rgba(255, 255, 255, 0.02);
    color: var(--text-primary);
    font-size: 0.9rem;
    transition: all 0.2s ease;
    box-shadow: none;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }

  .search-input:focus {
    outline: none;
    border-color: var(--brand);
    box-shadow: 0 0 0 3px rgba(var(--brand-rgb), 0.15);
    background: rgba(255, 255, 255, 0.04);
  }

  .search-input::placeholder {
    color: var(--text-secondary);
    opacity: 0.6;
  }

  .clear-search {
    position: absolute;
    inset-inline-end: var(--space-sm);
    padding: var(--space-xs);
    background: transparent;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
  }

  .clear-search:hover {
    color: var(--text-primary);
    background: var(--btn-tertiary);
  }

  .projects-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: var(--space-lg);
  }

  .loading-state {
    grid-column: 1 / -1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-md);
    padding: 6rem 2rem;
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .loading-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--glass-stroke-dark);
    border-top: 3px solid var(--brand);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  /* Matches the empty states on the project detail page and the cards above
     it: a flat surface with a hairline ring and a 12px corner. */
  .glass-empty-card {
    grid-column: 1 / -1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 48px 24px;
    text-align: center;
    background: var(--gx-card);
    border: 1px solid var(--gx-hair);
    border-radius: 12px;
    width: 100%;
    margin: 24px 0;
  }

  .empty-icon {
    box-sizing: border-box;
    width: 48px;
    height: 48px;
    padding: 12px;
    border-radius: 12px;
    background: var(--gx-ring-soft);
    color: var(--gx-tx-chip-icon-fg);
    flex-shrink: 0;
  }
















  .empty-title {
    margin: 0;
    font-family: var(--gx-font);
    font-weight: 700;
    font-size: 16px;
    line-height: 1.3;
    color: var(--gx-org-ink);
  }

  .empty-description {
    margin: 0;
    max-width: 460px;
    font-size: 13px;
    line-height: 1.5;
    color: var(--gx-slate-500);
  }

  /* The gradient-and-lift CTA belonged to the old glass era; this matches the
     primary action in every redesigned dialog on the page. */
  .empty-create-btn.premium-btn {
    margin-top: 4px;
    height: 37px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    border: none;
    border-radius: 10px;
    background: var(--gx-tx-chip-icon-fg);
    color: #fff;
    font-family: var(--gx-font);
    font-size: 14px;
    font-weight: 600;
    line-height: 100%;
    cursor: pointer;
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    transition: background-color 120ms ease;
  }

  .empty-create-btn.premium-btn:hover {
    transform: none;
    filter: none;
    box-shadow: none;
    background: var(--gx-ac-cta-hover);
  }

  .empty-create-btn.premium-btn:active {
    transform: none;
  }

  .empty-create-btn.premium-btn:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
  }

  /* ===== ".project-card" =====
     Brought onto the --gx-* card language the rest of the redesign uses: a
     flat surface with a hairline ring, a 12px corner and a restrained hover.
     The old treatment — a blurred glass fill, a gradient bar across the top
     and a translate-and-scale lift — predated the design system and matched
     nothing else in the app. The --gx-* tokens carry their own dark values, so
     the hand-written light-scheme overrides are gone too. */
  .project-card {
    position: relative;
    display: flex;
    flex-direction: column;
    border-radius: 12px;
    background: var(--gx-card);
    overflow: hidden;
    min-height: 186px;
    height: 100%;
    /* Same treatment ".mcp-card" uses for a connected server: a real border so
       the leading edge can thicken, and the same edge colour it uses. One
       colour across every card — the category is already carried by the tile
       and the badge, so repeating it on the edge made the grid read as eight
       competing accents. */
    border: 1px solid var(--gx-hair);
    border-inline-start-width: 4px;
    border-inline-start-color: var(--gx-mcp-edge-ok);
    transition:
      border-color 140ms ease,
      box-shadow 140ms ease;
  }

  .project-card:hover,
  .project-card:focus-within {
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06);
  }

  .card-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: space-between;
    gap: 12px;
    padding: 20px;
    border: none;
    border-radius: 0;
    background: transparent;
    cursor: pointer;
    text-align: start;
    min-width: 0;
    color: inherit;
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    height: 100%;
  }

  .card-main:hover,
  .card-main:active {
    transform: none;
    box-shadow: none;
    background: transparent;
  }

  .card-main:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: -2px;
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  /* The category's colour lives on the tile and the badge — the two places it
     actually tells you something. */
  .card-emoji {
    flex-shrink: 0;
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
    background: var(--emoji-bg);
    color: var(--emoji-color);
    font-size: 19px;
    line-height: 1;
  }

  .card-badge {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    padding: 4px 10px;
    border-radius: 6px;
    background: var(--badge-bg);
    box-shadow: inset 0 0 0 1px var(--badge-border);
    color: var(--badge-text);
    font-weight: 600;
    font-size: 11.5px;
    line-height: 100%;
    white-space: nowrap;
  }

  .card-body {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .card-title {
    margin: 0;
    font-weight: 700;
    font-size: 15px;
    line-height: 1.3;
    color: var(--gx-org-ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .card-description {
    margin: 0;
    font-weight: 400;
    font-size: 13px;
    line-height: 1.45;
    color: var(--gx-slate-500);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .card-description--empty {
    font-style: italic;
    color: var(--gx-slate-400);
  }

  .card-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding-top: 12px;
    border-top: 1px solid var(--gx-hair);
  }

  .card-date {
    font-weight: 500;
    font-size: 12px;
    line-height: 100%;
    color: var(--gx-slate-400);
    white-space: nowrap;
  }

  .card-meta {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }

  .meta-indicator {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--gx-slate-400);
  }

  .meta-indicator--team {
    color: var(--gx-tx-chip-icon-fg);
  }

  .indicator-count {
    font-weight: 600;
    font-size: 12px;
    line-height: 100%;
  }

  /* The row actions were revealed on hover alone, so a keyboard user could
     never reach edit, share or delete. They now also appear on focus-within,
     and stay reachable because only their opacity is animated. */
  .card-actions-wrapper {
    position: absolute;
    top: 10px;
    inset-inline-end: 10px;
    display: flex;
    gap: 2px;
    padding: 3px;
    border-radius: 8px;
    background: var(--gx-card);
    box-shadow:
      inset 0 0 0 1px var(--gx-hair),
      0 4px 12px rgba(0, 0, 0, 0.08);
    opacity: 0;
    transition: opacity 140ms ease;
    z-index: 10;
  }

  .project-card:hover .card-actions-wrapper,
  .project-card:focus-within .card-actions-wrapper {
    opacity: 1;
  }

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--gx-slate-500);
    cursor: pointer;
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    transition:
      background-color 120ms ease,
      color 120ms ease;
  }

  .action-btn:hover {
    transform: none;
    background: var(--gx-ring-soft);
    color: var(--gx-org-ink);
  }

  .action-btn:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 1px;
  }

  .action-btn--danger:hover {
    background: var(--gx-org-danger-bg);
    color: var(--gx-org-danger);
  }











  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  @media (max-width: 768px) {
    .projects-page {
      padding: var(--space-lg);
    }

    .page-header {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-md);
    }

    .new-project-btn {
      width: 100%;
      justify-content: center;
    }

    .card-actions-wrapper {
      opacity: 1;
      transform: translateY(0);
      position: static;
      margin-top: var(--space-sm);
      width: 100%;
      justify-content: flex-end;
      background: transparent;
      border: none;
      padding: 0;
    }
  }
</style>
