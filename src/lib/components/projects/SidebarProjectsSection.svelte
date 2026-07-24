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

  const MAX_SIDEBAR_PROJECTS = 3;
  let visibleProjects = $derived(showAllProjects ? projects : projects.slice(0, MAX_SIDEBAR_PROJECTS));
  let hasMore = $derived(projects.length > MAX_SIDEBAR_PROJECTS);
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

  function openCreateModal() {
    editingProject = null;
    showCreateModal = true;
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
        <span class="projects-title-text">{$_('sidebar.projects')}</span>
        {#if projects.length > 0}
          <span class="projects-count">({projects.length})</span>
        {/if}
      </button>
      <button
        class="add-project-btn"
        onclick={openCreateModal}
        title={$_('sidebar.newProject')}
        aria-label={$_('sidebar.newProject')}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>
    </div>

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
  </div>

  <div class="section-divider"></div>
{:else}
  <div class="collapsed-projects">
    <button
      class="collapsed-project-btn"
      onclick={openCreateModal}
      title={$_('sidebar.newProject')}
      aria-label={$_('sidebar.newProject')}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        <line x1="12" y1="11" x2="12" y2="17"/>
        <line x1="9" y1="14" x2="15" y2="14"/>
      </svg>
    </button>
  </div>
{/if}

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
  .projects-section {
    padding: 0 var(--space-sm);
  }

  .projects-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-sm) var(--space-md);
    margin-top: var(--space-sm);
  }

  .projects-title-btn {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: var(--space-xs);
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    color: var(--text-secondary);
    transition: color 0.2s ease;
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .projects-title-btn:hover {
    color: var(--text-primary);
    transform: none;
    box-shadow: none;
  }

  .projects-title-btn.active {
    color: var(--brand);
  }

  .projects-title-text {
    font-size: 0.6875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .projects-count {
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.08em;
  }

  .add-project-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition: all 0.2s ease;
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .add-project-btn:hover {
    background: var(--btn-tertiary);
    color: var(--brand);
    transform: scale(1.1);
    box-shadow: none;
  }

  .projects-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .projects-loading,
  .projects-empty {
    padding: var(--space-md);
    text-align: center;
    color: var(--text-secondary);
    font-size: 0.8125rem;
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

  .project-item-btn {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: var(--space-sm);
    padding: 6px var(--space-md);
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.8125rem;
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: start;
    border-radius: var(--radius-md);
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .project-item-btn:hover {
    background: var(--btn-tertiary);
    color: var(--text-primary);
    transform: none;
    box-shadow: none;
  }

  .project-item-btn.selected {
    background: rgba(var(--brand-rgb), 0.1);
    color: var(--brand);
    font-weight: 600;
    box-shadow: none;
  }

  .project-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 500;
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
    align-items: center;
    gap: var(--space-xs);
    padding: 6px var(--space-md);
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    text-align: start;
    transition: all 0.2s ease;
    border-radius: var(--radius-sm);
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    width: 100%;
  }

  .expand-projects-btn:hover {
    background: var(--btn-tertiary);
    color: var(--brand);
    transform: none;
    box-shadow: none;
  }

  .expand-chevron {
    transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    flex-shrink: 0;
  }

  .expand-chevron.expanded {
    transform: rotate(180deg);
  }

  .section-divider {
    height: 1px;
    background: var(--glass-stroke-dark);
    margin: var(--space-sm) var(--space-md);
  }

  .collapsed-projects {
    display: flex;
    justify-content: center;
    padding: var(--space-sm) 0;
  }

  .collapsed-project-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    padding: 0;
    border: none;
    background: var(--btn-tertiary);
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: var(--radius-full);
    transition: all 0.2s ease;
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .collapsed-project-btn:hover {
    background: var(--btn-quaternary);
    color: var(--brand);
    transform: scale(1.05);
    box-shadow: none;
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

  @media (orientation: landscape) and (max-height: 600px) {
    :global(html[data-app-layout='mobile']) .projects-section {
      padding: 0 0.5rem;
    }

    :global(html[data-app-layout='mobile']) .projects-header {
      padding: 0.3rem 0.75rem;
      margin-top: 0.2rem;
    }

    :global(html[data-app-layout='mobile']) .projects-list {
      display: none;
    }

    :global(html[data-app-layout='mobile']) .section-divider {
      margin: 0.25rem 0.75rem;
    }
  }
</style>
