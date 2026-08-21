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
  import Modal from '$lib/admin/components/Modal.svelte';

  interface Props {
    isCollapsed: boolean;
    currentPath: string;
    onCollapseSidebar: () => void;
  }

  let { isCollapsed, currentPath, onCollapseSidebar }: Props = $props();

  let selectedProjectId = $state<string | null>(null);

  function updateSelectedProjectFromUrl() {
    const params = new URLSearchParams(window.location.search);
    selectedProjectId = params.get('projectId');
  }

  $effect(() => {
    currentPath;
    updateSelectedProjectFromUrl();
  });

  $effect(() => {
    updateSelectedProjectFromUrl();

    const handlePopState = () => {
      updateSelectedProjectFromUrl();
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  });

  const categoryColors: Record<ProjectCategory, { bg: string, text: string }> = {
    research: { bg: 'rgba(59, 130, 246, 0.12)', text: '#3b82f6' },
    planning: { bg: 'rgba(249, 115, 22, 0.12)', text: '#f97316' },
    code: { bg: 'rgba(139, 92, 246, 0.12)', text: '#8b5cf6' },
    meetings: { bg: 'rgba(16, 185, 129, 0.12)', text: '#10b981' },
    onboarding: { bg: 'rgba(99, 102, 241, 0.12)', text: '#6366f1' },
    brainstorms: { bg: 'rgba(236, 72, 153, 0.12)', text: '#ec4899' },
    writing: { bg: 'rgba(234, 179, 8, 0.12)', text: '#eab308' },
    design: { bg: 'rgba(6, 182, 212, 0.12)', text: '#06b6d4' },
  };

  let projects = $state<Project[]>([]);
  let loading = $state(true);
  let showCreateModal = $state(false);
  let editingProject = $state<Project | null>(null);
  let activeProjectMenu = $state<string | null>(null);
  let showDeleteConfirm = $state(false);
  let projectToDelete = $state<Project | null>(null);
  let deleting = $state(false);
  let showAllProjects = $state(false);
  let showProjects = $state(true);

  let projectCountLabel = $derived(String(projects.length).padStart(2, '0'));

  const MAX_SIDEBAR_PROJECTS = 3;
  let visibleProjects = $derived(showAllProjects ? projects : projects.slice(0, MAX_SIDEBAR_PROJECTS));
  let hasMore = $derived(projects.length > MAX_SIDEBAR_PROJECTS);
  const MAX_RAIL_PROJECTS = 4;
  let railProjects = $derived(projects.slice(0, MAX_RAIL_PROJECTS));
  let remainingCount = $derived(projects.length - MAX_SIDEBAR_PROJECTS);

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

  async function fetchProjects() {
    try {
      loading = true;
      const response = await listProjects();
      projects = response.projects;
    } catch {
      console.error('Failed to fetch projects');
    } finally {
      loading = false;
    }
  }

  function handleProjectClick(project: Project) {
    navigate(`/projects/${project.id}`);
    onCollapseSidebar();
  }

  function openEditModal(project: Project) {
    editingProject = project;
    showCreateModal = true;
    activeProjectMenu = null;
  }

  function handleProjectCreated(_project: Project) {
    fetchProjects();
  }

  function confirmDelete(project: Project) {
    projectToDelete = project;
    showDeleteConfirm = true;
    activeProjectMenu = null;
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
    activeProjectMenu = null;
    try {
      const { shareUrl } = await shareProject(project.id);
      await navigator.clipboard.writeText(shareUrl);
      toast.success($_('sidebar.shareLinkCopied'));
    } catch {
      toast.error($_('sidebar.shareProjectError'));
    }
  }

  function handleWindowClick() {
    if (activeProjectMenu) activeProjectMenu = null;
  }

  function goToProjectsPage() {
    navigate('/projects');
    onCollapseSidebar();
  }

  $effect(() => {
    fetchProjects();
  });
</script>

<svelte:window onclick={handleWindowClick} />

{#if !isCollapsed}
  <div class="projects-section">
    <div class="projects-header">
      <button
        class="projects-title-btn"
        class:active={currentPath === '/projects'}
        onclick={goToProjectsPage}
        title={$_('sidebar.allProjects')}
      >
        <span class="section-icon" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="6" y="9" width="12" height="8" rx="2"/>
            <path d="M9 9C9 7.89543 9.89543 7 11 7H13C14.1046 7 15 7.89543 15 9H9Z"/>
            <path d="M6 13H18"/>
          </svg>
        </span>
        <span class="projects-title-text">{$_('sidebar.projects')}</span>
      </button>
      <div class="projects-header-actions">
        {#if projects.length > 0}
          <span class="projects-count">{projectCountLabel}</span>
        {/if}
        <button
          class="section-collapse-btn"
          onclick={() => (showProjects = !showProjects)}
          aria-expanded={showProjects}
          aria-label={$_('sidebar.projects')}
        >
          <svg class="section-chevron" class:collapsed={!showProjects} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="6,9 12,15 18,9"/>
          </svg>
        </button>
      </div>
    </div>

    {#if showProjects}
    <div class="projects-list">
      {#if loading}
        <div class="projects-loading">
          <div class="loading-spinner-small"></div>
          <span>{$_('sidebar.loadingProjects')}</span>
        </div>
      {:else if projects.length === 0}
        <div class="projects-empty">
          <span>{$_('sidebar.noProjectsYet')}</span>
        </div>
      {:else}
        {#each visibleProjects as project (project.id)}
          <div class="project-item">
            <button
              class="menu-item project-item-btn"
              class:selected={selectedProjectId === project.id}
              onclick={() => handleProjectClick(project)}
              title={project.name}
            >
              <span class="project-hash" aria-hidden="true">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="4" y1="9" x2="20" y2="9"/>
                  <line x1="4" y1="15" x2="20" y2="15"/>
                  <line x1="10" y1="3" x2="8" y2="21"/>
                  <line x1="16" y1="3" x2="14" y2="21"/>
                </svg>
              </span>
              <span class="project-name">{project.name}</span>
            </button>
            <button
              class="project-menu-btn"
              onclick={(e) => { e.stopPropagation(); activeProjectMenu = activeProjectMenu === project.id ? null : project.id; }}
              title={$_('sidebar.projectOptions')}
              aria-label={$_('sidebar.projectOptions')}
              aria-expanded={activeProjectMenu === project.id}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="1"/>
                <circle cx="12" cy="5" r="1"/>
                <circle cx="12" cy="19" r="1"/>
              </svg>
            </button>
            {#if activeProjectMenu === project.id}
              <div class="project-dropdown" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="menu" tabindex="-1">
                <button class="dropdown-item" onclick={() => openEditModal(project)} role="menuitem">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <path d="M4 17.25V21h3.75L17.81 10.94l-3.75-3.75L4 17.25z"/>
                    <path d="M20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z"/>
                  </svg>
                  {$_('sidebar.editProject')}
                </button>
                <button class="dropdown-item" onclick={() => handleShare(project)} role="menuitem">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                  </svg>
                  {$_('sidebar.share')}
                </button>
                <button class="dropdown-item dropdown-item--danger" onclick={() => confirmDelete(project)} role="menuitem">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <polyline points="3,6 5,6 21,6"/>
                    <path d="m19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"/>
                  </svg>
                  {$_('sidebar.delete')}
                </button>
              </div>
            {/if}
          </div>
        {/each}
        {#if hasMore}
          <button class="expand-projects-btn" onclick={() => showAllProjects = !showAllProjects} aria-expanded={showAllProjects}>
            <svg class="expand-chevron" class:expanded={showAllProjects} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="6,9 12,15 18,9"/>
            </svg>
            <span>{showAllProjects ? $_('sidebar.showLess') : $_('sidebar.showMore', { values: { count: remainingCount } })}</span>
          </button>
        {/if}
      {/if}
    </div>
    {/if}
  </div>
{:else}
  <div class="collapsed-projects">
    {#if projects.length === 0}
      <button
        class="rail-btn rail-btn--folder"
        class:active={currentPath === '/projects'}
        onclick={goToProjectsPage}
        title={$_('sidebar.allProjects')}
        aria-label={$_('sidebar.allProjects')}
      >
        {@render folderIcon()}
      </button>
    {:else}
      {#each railProjects as project (project.id)}
        <button
          class="rail-btn rail-btn--folder"
          class:active={selectedProjectId === project.id}
          onclick={() => handleProjectClick(project)}
          title={project.name}
          aria-label={project.name}
        >
          {@render folderIcon()}
        </button>
      {/each}
    {/if}
  </div>
{/if}

{#snippet folderIcon()}
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
  </svg>
{/snippet}

<CreateProjectModal
  isOpen={showCreateModal}
  onclose={() => { showCreateModal = false; editingProject = null; }}
  onCreated={handleProjectCreated}
  editProject={editingProject}
/>

{#if showDeleteConfirm}
  <Modal
    isOpen={showDeleteConfirm}
    title={$_('sidebar.deleteProject')}
    onclose={() => { showDeleteConfirm = false; projectToDelete = null; }}
  >
    {#snippet children()}
      <div class="confirm-content">
        <p>{$_('sidebar.deleteProjectConfirm')}</p>
      </div>
      <div class="confirm-actions">
        <button class="cancel-btn" onclick={() => { showDeleteConfirm = false; projectToDelete = null; }} disabled={deleting}>
          {$_('sidebar.cancel')}
        </button>
        <button class="delete-btn" onclick={handleDelete} disabled={deleting}>
          {#if deleting}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spinner" aria-hidden="true">
              <circle cx="12" cy="12" r="10" opacity="0.25"/>
              <path d="M12 2a10 10 0 0 1 10 10" opacity="0.75"/>
            </svg>
            {$_('sidebar.deleting')}
          {:else}
            {$_('sidebar.delete')}
          {/if}
        </button>
      </div>
    {/snippet}
  </Modal>
{/if}

<style>
  /* Figma "Section - Projects": 24px header, 4px gap to the row list */
  .projects-section {
    display: flex;
    flex-direction: column;
    gap: 4px;
    align-self: stretch;
  }

  .projects-header {
    display: flex;
    height: 24px;
    align-items: center;
    justify-content: space-between;
    align-self: stretch;
  }

  .projects-title-btn {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 6px;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    color: var(--gx-dim);
    transition: color 120ms ease;
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .projects-title-btn:hover {
    color: var(--gx-muted);
    transform: none;
    box-shadow: none;
  }

  .projects-title-btn.active {
    color: var(--gx-blue);
  }

  .projects-title-btn:focus-visible {
    outline: 2px solid var(--gx-blue);
    outline-offset: 2px;
  }

  .section-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 12px;
    height: 12px;
    flex-shrink: 0;
    color: currentcolor;
  }

  /* section labels: 10px / 700 / 14px line, per the Figma text style */
  .projects-title-text {
    font-size: 10px;
    font-weight: 700;
    line-height: 14px;
    letter-spacing: 0;
    text-transform: uppercase;
    white-space: nowrap;
    color: currentcolor;
  }

  .projects-header-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--gx-dim);
  }

  .projects-count {
    font-size: 10px;
    font-weight: 700;
    line-height: 14px;
    letter-spacing: 0;
    color: var(--gx-dim);
  }

  .section-collapse-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--gx-dim);
    cursor: pointer;
    border-radius: 4px;
    transition: color 120ms ease;
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .section-collapse-btn:hover {
    color: var(--gx-muted);
    background: transparent;
    transform: none;
    box-shadow: none;
  }

  .section-collapse-btn:focus-visible {
    outline: 2px solid var(--gx-blue);
    outline-offset: 1px;
  }

  .section-chevron {
    transition: transform 140ms ease;
  }

  .section-chevron.collapsed {
    transform: rotate(-90deg);
  }

  .project-hash {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 12px;
    height: 12px;
    flex-shrink: 0;
    color: var(--gx-dim);
  }

  .projects-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    align-self: stretch;
  }

  .projects-loading,
  .projects-empty {
    padding: 6px 8px;
    text-align: center;
    color: var(--gx-dim);
    font-size: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-sm);
  }

  .loading-spinner-small {
    width: 14px;
    height: 14px;
    border: 2px solid var(--glass-stroke-dark);
    border-top: 2px solid var(--brand);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  .project-item {
    position: relative;
    display: flex;
    align-items: center;
  }

  /* Figma project row: 28px tall, 6px radius, 8px gap, 6/8 padding */
  .project-item-btn {
    flex: 1;
    min-width: 0;
    display: flex;
    height: 28px;
    align-items: center;
    justify-content: flex-start;
    gap: 8px;
    padding: 6px 8px;
    border: none;
    background: transparent;
    color: var(--gx-muted);
    font-size: 12px;
    line-height: 16px;
    cursor: pointer;
    transition: background-color 120ms ease;
    text-align: start;
    border-radius: 6px;
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .project-item-btn:hover {
    background: var(--gx-fill-soft);
    color: var(--gx-muted);
    transform: none;
    box-shadow: none;
  }

  .project-item-btn:focus-visible {
    outline: 2px solid var(--gx-blue);
    outline-offset: -2px;
  }

  /* selected row uses the "current" treatment from the pinned rows */
  .project-item-btn.selected {
    background: var(--gx-blue-soft);
    color: var(--gx-blue);
    box-shadow: none;
  }

  .project-item-btn.selected:hover {
    background: var(--gx-blue-soft-hover);
  }

  .project-item-btn.selected .project-hash {
    color: var(--gx-blue);
  }

  .project-name {
    flex-grow: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 12px;
    font-weight: 500;
    line-height: 16px;
  }

  .project-menu-btn {
    position: absolute;
    inset-inline-end: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: var(--radius-full);
    opacity: 0;
    pointer-events: none;
    transition: all 0.2s ease;
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .project-item:hover .project-menu-btn,
  .project-menu-btn[aria-expanded='true'],
  .project-menu-btn:focus-visible {
    opacity: 1;
    pointer-events: auto;
  }

  .project-menu-btn:hover {
    background: var(--btn-quaternary);
    color: var(--brand);
    transform: none;
    box-shadow: none;
  }

  .project-dropdown {
    position: absolute;
    top: 100%;
    inset-inline-end: var(--space-sm);
    margin-top: var(--space-xs);
    background: var(--bg-primary);
    border: 1px solid var(--glass-stroke-dark);
    border-radius: var(--radius-md);
    box-shadow: var(--glass-shadow-emphasis);
    z-index: 1000;
    min-width: 140px;
    animation: slideUp 0.15s ease;
    padding: var(--space-xs);
  }

  .dropdown-item {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    width: 100%;
    padding: var(--space-sm) var(--space-md);
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-size: 0.8125rem;
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition: all 0.15s ease;
    text-align: start;
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .dropdown-item:hover {
    background: var(--btn-tertiary);
    transform: none;
    box-shadow: none;
  }

  .dropdown-item--danger {
    color: var(--color-danger, #ef4444);
  }

  .dropdown-item--danger:hover {
    background: rgba(239, 68, 68, 0.1);
  }

  .expand-projects-btn {
    display: flex;
    height: 28px;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border: none;
    background: transparent;
    color: var(--gx-dim);
    font-size: 12px;
    font-weight: 500;
    line-height: 16px;
    cursor: pointer;
    text-align: start;
    transition: background-color 120ms ease;
    border-radius: 6px;
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    width: 100%;
  }

  .expand-projects-btn:hover {
    background: var(--gx-fill-soft);
    color: var(--gx-muted);
    transform: none;
    box-shadow: none;
  }

  .expand-projects-btn:focus-visible {
    outline: 2px solid var(--gx-blue);
    outline-offset: -2px;
  }

  .expand-chevron {
    transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    flex-shrink: 0;
  }

  .expand-chevron.expanded {
    transform: rotate(180deg);
  }

  /* State=Collapsed: one folder button per project in the 60px rail */
  .collapsed-projects {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .rail-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--gx-muted);
    cursor: pointer;
    border-radius: 8px;
    overflow: hidden;
    flex-shrink: 0;
    transition: background-color 120ms ease;
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .rail-btn--folder {
    color: var(--gx-slate);
  }

  .rail-btn:hover {
    background: var(--gx-fill-soft);
    color: var(--gx-slate);
    transform: none;
    box-shadow: none;
  }

  .rail-btn:active {
    background: var(--gx-line);
    transform: none;
  }

  .rail-btn:focus-visible {
    outline: 2px solid var(--gx-blue);
    outline-offset: 2px;
  }

  .rail-btn.active {
    background: var(--gx-blue-soft);
    color: var(--gx-blue);
  }

  .confirm-content p {
    margin: 0;
    color: var(--text-secondary);
    font-size: 0.875rem;
    line-height: 1.6;
  }

  .confirm-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-md);
    padding: var(--space-lg) var(--space-xl);
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

  .delete-btn {
    padding: var(--space-sm) var(--space-xl);
    border: none;
    background: var(--brand-red);
    color: white;
    border-radius: var(--radius-md);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .delete-btn:hover:not(:disabled) {
    background: color-mix(in oklab, var(--brand-red) 85%, black);
    transform: none;
    box-shadow: none;
  }

  .delete-btn:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .spinner {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  @keyframes slideUp {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
