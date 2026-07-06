<script lang="ts">
  import { navigate } from 'svelte-routing';
  import { _ } from 'svelte-i18n';
  import { listProjects, deleteProject, shareProject } from '../../api/projectsApi';
  import type { Project, ProjectCategory } from '../../types/project';
  import { toast } from '../Toaster.svelte';
  import CreateProjectModal from './CreateProjectModal.svelte';
  import Modal from '$lib/admin/components/Modal.svelte';

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

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString(undefined, {
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
        <div class="glow-container">
          <div class="glow-effect"></div>
          <svg class="animated-empty-illustration" width="160" height="160" viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="primary-grad" x1="0" y1="0" x2="160" y2="160" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stop-color="var(--brand)" />
                <stop offset="100%" stop-color="var(--brand-green-accent)" />
              </linearGradient>
              <radialGradient id="glow-grad" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stop-color="var(--brand)" stop-opacity="0.3" />
                <stop offset="100%" stop-color="var(--brand)" stop-opacity="0" />
              </radialGradient>
            </defs>

            <circle cx="80" cy="80" r="60" fill="url(#glow-grad)" class="pulse-glow" />
            <circle cx="80" cy="80" r="45" stroke="rgba(255, 255, 255, 0.08)" stroke-width="1.5" stroke-dasharray="6 4" class="spin-clockwise" />
            <circle cx="80" cy="80" r="30" stroke="rgba(255, 255, 255, 0.04)" stroke-width="1" />

            <g class="float-animation">
              <path d="M55 58C55 55.7909 56.7909 54 59 54H74.5858C75.6467 54 76.6641 54.4214 77.4142 55.1716L81.5858 59.3431C82.3359 60.0933 83.3533 60.5147 84.4142 60.5147H97C99.2091 60.5147 101 62.3239 101 64.533V94C101 96.2091 99.2091 98 97 98H59C56.7909 98 55 96.2091 55 94V58Z" fill="url(#primary-grad)" fill-opacity="0.15" stroke="url(#primary-grad)" stroke-width="1.5"/>
              <path d="M55 64C55 61.7909 56.7909 60 59 60H97C99.2091 60 101 61.7909 101 64V94C101 96.2091 99.2091 98 97 98H59C56.7909 98 55 96.2091 55 94V64Z" fill="url(#primary-grad)" fill-opacity="0.3" stroke="url(#primary-grad)" stroke-width="1.5"/>
              <path d="M74 79H86M80 73V85" stroke="white" stroke-width="2" stroke-linecap="round" />
            </g>

            <circle cx="110" cy="55" r="4" fill="var(--brand-green-accent)" class="float-particle-1" />
            <circle cx="50" cy="105" r="3" fill="var(--brand)" class="float-particle-2" />
            <circle cx="45" cy="65" r="2.5" fill="var(--brand-cyan)" class="float-particle-3" />
          </svg>
        </div>
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
        <div class="project-card" style:--accent-color={colors?.text}>
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

  .glass-empty-card {
    grid-column: 1 / -1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-md);
    padding: var(--space-3xl) var(--space-2xl);
    color: var(--text-secondary);
    text-align: center;
    background: rgba(255, 255, 255, 0.015);
    backdrop-filter: blur(24px) saturate(1.2);
    -webkit-backdrop-filter: blur(24px) saturate(1.2);
    border: 1px solid var(--glass-stroke-dark);
    border-radius: var(--radius-xl);
    max-width: 520px;
    margin: 3rem auto;
    position: relative;
    box-shadow: 
      inset 0 1px 0 rgba(255, 255, 255, 0.08),
      0 12px 40px rgba(0, 0, 0, 0.35);
    transition: all 0.4s ease;
  }

  .glass-empty-card:hover {
    border-color: rgba(255, 255, 255, 0.15);
    background: rgba(255, 255, 255, 0.03);
    box-shadow: 
      inset 0 1px 0 rgba(255, 255, 255, 0.12),
      0 16px 48px rgba(0, 0, 0, 0.45);
  }

  .glow-container {
    position: relative;
    width: 160px;
    height: 160px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: var(--space-sm);
  }

  .glow-effect {
    position: absolute;
    width: 100px;
    height: 100px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(var(--brand-rgb), 0.12) 0%, transparent 70%);
    filter: blur(15px);
    pointer-events: none;
  }

  .animated-empty-illustration {
    overflow: visible;
  }

  .float-animation {
    animation: svg-float 6s ease-in-out infinite;
  }

  .pulse-glow {
    animation: svg-pulse 4s ease-in-out infinite;
    transform-origin: center;
  }

  .spin-clockwise {
    animation: svg-spin 25s linear infinite;
    transform-origin: center;
  }

  .float-particle-1 {
    animation: svg-float-particle-1 5s ease-in-out infinite;
  }

  .float-particle-2 {
    animation: svg-float-particle-2 7s ease-in-out infinite;
  }

  .float-particle-3 {
    animation: svg-float-particle-3 6s ease-in-out infinite;
  }

  @keyframes svg-float {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-6px); }
  }

  @keyframes svg-pulse {
    0%, 100% { transform: scale(0.95); opacity: 0.7; }
    50% { transform: scale(1.05); opacity: 1; }
  }

  @keyframes svg-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  @keyframes svg-float-particle-1 {
    0%, 100% { transform: translate(0, 0); }
    50% { transform: translate(4px, -8px); opacity: 0.8; }
  }

  @keyframes svg-float-particle-2 {
    0%, 100% { transform: translate(0, 0); }
    50% { transform: translate(-6px, 6px); opacity: 0.7; }
  }

  @keyframes svg-float-particle-3 {
    0%, 100% { transform: translate(0, 0); }
    50% { transform: translate(5px, 5px); opacity: 0.9; }
  }

  .empty-title {
    font-family: 'Outfit', sans-serif;
    font-size: 1.35rem;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0;
    letter-spacing: -0.015em;
  }

  .empty-description {
    font-size: 0.875rem;
    line-height: 1.5;
    color: var(--text-secondary);
    opacity: 0.75;
    margin: 0 var(--space-md);
  }

  .empty-create-btn.premium-btn {
    margin-top: var(--space-sm);
    display: inline-flex;
    align-items: center;
    gap: var(--space-sm);
    padding: 0.75rem 1.75rem;
    background: linear-gradient(135deg, var(--brand) 0%, var(--brand-green-accent) 100%);
    border: none;
    border-radius: var(--radius-md);
    color: white;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 
      0 4px 15px rgba(var(--brand-rgb), 0.25),
      inset 0 1px 0 rgba(255, 255, 255, 0.2);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .empty-create-btn.premium-btn:hover {
    transform: translateY(-2px);
    box-shadow: 
      0 8px 24px rgba(var(--brand-rgb), 0.4),
      inset 0 1px 0 rgba(255, 255, 255, 0.25);
    filter: brightness(1.08);
  }

  .empty-create-btn.premium-btn:active {
    transform: translateY(0);
  }

  .project-card {
    position: relative;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--glass-stroke-dark);
    border-radius: var(--radius-xl);
    background: rgba(255, 255, 255, 0.015);
    backdrop-filter: blur(16px) saturate(1.2);
    -webkit-backdrop-filter: blur(16px) saturate(1.2);
    transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
    overflow: hidden;
    min-height: 195px;
    height: 100%;
    box-shadow: 
      inset 0 1px 0 rgba(255, 255, 255, 0.05),
      0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .project-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: linear-gradient(90deg, var(--accent-color, var(--brand)), color-mix(in oklab, var(--accent-color, var(--brand)) 50%, white));
    opacity: 0.4;
    transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
    z-index: 2;
  }

  .project-card:hover {
    border-color: rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.035);
    transform: translateY(-6px) scale(1.015);
    box-shadow: 
      inset 0 1px 0 rgba(255, 255, 255, 0.1),
      0 12px 28px rgba(0, 0, 0, 0.35),
      0 0 20px rgba(var(--brand-rgb), 0.05);
  }

  .project-card:hover::before {
    opacity: 1;
    height: 5px;
  }

  @media (prefers-color-scheme: light) {
    .project-card {
      background: rgba(0, 0, 0, 0.012);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);
    }
    .project-card:hover {
      background: rgba(0, 0, 0, 0.025);
      border-color: rgba(0, 0, 0, 0.08);
      box-shadow: 
        0 12px 28px rgba(0, 0, 0, 0.1),
        0 0 16px rgba(var(--brand-rgb), 0.05);
    }
  }

  .card-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: space-between;
    padding: var(--space-lg);
    border: none;
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

  .card-main:hover {
    transform: none;
    box-shadow: none;
    background: transparent;
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-md);
  }

  .card-emoji {
    flex-shrink: 0;
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    background: var(--emoji-bg);
    color: var(--emoji-color);
    font-size: 1.3rem;
    line-height: 1;
    transition: all 0.25s ease;
    border: 1px solid rgba(255, 255, 255, 0.06);
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
  }

  .project-card:hover .card-emoji {
    transform: scale(1.08) rotate(4deg);
    box-shadow: 0 6px 14px rgba(0, 0, 0, 0.15);
  }

  .card-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    margin-bottom: var(--space-md);
  }

  .card-title {
    font-family: 'Outfit', sans-serif;
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    letter-spacing: -0.01em;
  }

  .card-description {
    font-size: 0.8125rem;
    color: var(--text-secondary);
    opacity: 0.8;
    margin: 0;
    line-height: 1.45;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    height: 2.4rem;
  }

  .card-description--empty {
    opacity: 0.45;
    font-style: italic;
  }

  .card-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: var(--space-sm);
    border-top: 1px solid rgba(255, 255, 255, 0.04);
  }

  @media (prefers-color-scheme: light) {
    .card-footer {
      border-top-color: rgba(0, 0, 0, 0.04);
    }
  }

  .card-date {
    font-size: 0.75rem;
    color: var(--text-secondary);
    opacity: 0.65;
  }

  .card-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.6875rem;
    font-weight: 700;
    color: var(--badge-text, var(--text-secondary));
    padding: 3px 11px;
    border-radius: var(--radius-full);
    background: var(--badge-bg, var(--btn-tertiary));
    border: 1px solid var(--badge-border, transparent);
    line-height: 1.4;
    letter-spacing: 0.02em;
  }

  .card-meta {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .meta-indicator {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.75rem;
    color: var(--text-secondary);
    opacity: 0.7;
    background: var(--btn-secondary);
    padding: 2px var(--space-sm);
    border-radius: var(--radius-sm);
    border: 1px solid var(--glass-stroke-dark);
  }

  .meta-indicator--team {
    color: var(--brand);
    border-color: rgba(var(--brand-rgb), 0.15);
  }

  .indicator-count {
    font-weight: 600;
  }

  .card-actions-wrapper {
    position: absolute;
    top: var(--space-md);
    inset-inline-end: var(--space-md);
    display: flex;
    align-items: center;
    gap: 2px;
    opacity: 0;
    transform: translateY(-8px);
    transition: all 0.28s cubic-bezier(0.4, 0, 0.2, 1);
    background: rgba(18, 18, 22, 0.7);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border: 1px solid var(--glass-stroke-dark);
    border-radius: var(--radius-sm);
    padding: 3px;
    z-index: 10;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  }

  @media (prefers-color-scheme: light) {
    .card-actions-wrapper {
      background: rgba(255, 255, 255, 0.7);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
    }
  }

  .project-card:hover .card-actions-wrapper {
    opacity: 1;
    transform: translateY(0);
  }

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition: all 0.15s ease;
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .action-btn:hover {
    background: var(--btn-tertiary);
    color: var(--text-primary);
    transform: none;
    box-shadow: none;
  }

  .action-btn--danger:hover {
    background: rgba(239, 68, 68, 0.1);
    color: var(--color-danger, #ef4444);
    transform: none;
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
