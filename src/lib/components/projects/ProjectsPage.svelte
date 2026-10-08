<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { navigate } from "svelte-routing";
  import { _ } from "svelte-i18n";
  import {
    listProjects,
    deleteProject,
    shareProject,
  } from "../../api/projectsApi";
  import type { Project, ProjectCategory } from "../../types/project";
  import { toast } from "../Toaster.svelte";
  import CreateProjectModal from "./CreateProjectModal.svelte";
  import DeleteConfirmDialog from "../DeleteConfirmDialog.svelte";
  import { setPageTitle } from "../../utils/pageTitle";

  $effect(() => {
    setPageTitle($_("sidebar.projects"));
  });

  let projects = $state<Project[]>([]);
  let loading = $state(true);
  let searchQuery = $state("");
  let showCreateModal = $state(false);
  let editingProject = $state<Project | null>(null);
  let showDeleteConfirm = $state(false);
  let projectToDelete = $state<Project | null>(null);
  let deleting = $state(false);

  // Grid / list layout, remembered per browser so the page reopens as left.
  type ProjectsView = "grid" | "list";
  const VIEW_STORAGE_KEY = "grengin:projectsView";
  function readStoredView(): ProjectsView {
    try {
      return localStorage.getItem(VIEW_STORAGE_KEY) === "list"
        ? "list"
        : "grid";
    } catch {
      return "grid";
    }
  }
  let view = $state<ProjectsView>(readStoredView());
  function setView(next: ProjectsView) {
    view = next;
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      /* storage blocked — the choice just won't persist */
    }
  }

  let filteredProjects = $derived(
    searchQuery.trim()
      ? projects.filter(
          (p) =>
            p.name.toLowerCase().includes(searchQuery.trim().toLowerCase()) ||
            p.description
              .toLowerCase()
              .includes(searchQuery.trim().toLowerCase()),
        )
      : projects,
  );

  const categoryEmoji: Record<ProjectCategory, string> = {
    research: "🔍",
    planning: "📋",
    code: "{ }",
    meetings: "📅",
    onboarding: "💼",
    brainstorms: "🧠",
    writing: "✏️",
    design: "🎨",
  };

  const categoryColors: Record<
    ProjectCategory,
    { bg: string; text: string; border: string }
  > = {
    research: {
      bg: "rgba(59, 130, 246, 0.12)",
      text: "#3b82f6",
      border: "rgba(59, 130, 246, 0.25)",
    },
    planning: {
      bg: "rgba(249, 115, 22, 0.12)",
      text: "#f97316",
      border: "rgba(249, 115, 22, 0.25)",
    },
    code: {
      bg: "rgba(139, 92, 246, 0.12)",
      text: "#8b5cf6",
      border: "rgba(139, 92, 246, 0.25)",
    },
    meetings: {
      bg: "rgba(16, 185, 129, 0.12)",
      text: "#10b981",
      border: "rgba(16, 185, 129, 0.25)",
    },
    onboarding: {
      bg: "rgba(99, 102, 241, 0.12)",
      text: "#6366f1",
      border: "rgba(99, 102, 241, 0.25)",
    },
    brainstorms: {
      bg: "rgba(236, 72, 153, 0.12)",
      text: "#ec4899",
      border: "rgba(236, 72, 153, 0.25)",
    },
    writing: {
      bg: "rgba(234, 179, 8, 0.12)",
      text: "#eab308",
      border: "rgba(234, 179, 8, 0.25)",
    },
    design: {
      bg: "rgba(6, 182, 212, 0.12)",
      text: "#06b6d4",
      border: "rgba(6, 182, 212, 0.25)",
    },
  };

  async function fetchProjects() {
    loading = true;
    try {
      const response = await listProjects();
      projects = response.projects;
    } catch {
      console.error("Failed to fetch projects");
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
      toast.success(
        $_("sidebar.projectDeleted", {
          values: { name: projectToDelete.name },
        }),
      );
      projects = projects.filter((p) => p.id !== projectToDelete!.id);
      showDeleteConfirm = false;
      projectToDelete = null;
    } catch {
      toast.error($_("sidebar.deleteProjectError"));
    } finally {
      deleting = false;
    }
  }

  async function handleShare(project: Project) {
    try {
      const { shareUrl } = await shareProject(project.id);
      await navigator.clipboard.writeText(shareUrl);
      toast.success($_("sidebar.shareLinkCopied"));
    } catch {
      toast.error($_("sidebar.shareProjectError"));
    }
  }

  function openProject(project: Project) {
    navigate(`/projects/${project.id}`);
  }

  /* A missing or unparseable timestamp renders as an em dash. `new Date()`
     answers "Invalid Date" for both, which is what a user saw whenever a
     field did not reach the UI. */
  function formatDate(dateStr: string | null | undefined): string {
    if (!dateStr) return "\u2014";
    const parsed = new Date(dateStr);
    if (Number.isNaN(parsed.getTime())) return "\u2014";
    return parsed.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  $effect(() => {
    fetchProjects();
  });
</script>

<div class="projects-page">
  <div class="page-header">
    <div class="header-left">
      <h1 class="page-title">{$_("sidebar.allProjects")}</h1>
      {#if projects.length > 0}
        <span class="project-total">{projects.length}</span>
      {/if}
    </div>
    <button class="new-project-btn" type="button" onclick={openCreateModal}>
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        aria-hidden="true"
      >
        <path d="M7 1v12M1 7h12" stroke="currentColor" stroke-width="1.6" />
      </svg>
      <span>{$_("sidebar.newProject")}</span>
    </button>
  </div>

  {#if !loading && projects.length > 0}
    <div class="projects-toolbar">
      {#if projects.length > 3}
        <div class="search-bar">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="search-icon"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            class="search-input"
            placeholder={$_("sidebar.searchPlaceholder")}
            bind:value={searchQuery}
          />
          {#if searchQuery}
            <button
              class="clear-search"
              onclick={() => (searchQuery = "")}
              aria-label={$_("sidebar.clearSearch")}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          {/if}
        </div>
      {/if}

      <div
        class="view-switcher"
        role="group"
        aria-label={$_("projects.viewModeLabel")}
      >
        <button
          class="view-opt"
          type="button"
          aria-pressed={view === "grid"}
          onclick={() => setView("grid")}
        >
          <span aria-hidden="true">⊞</span>
          {$_("projects.viewGrid")}
        </button>
        <button
          class="view-opt"
          type="button"
          aria-pressed={view === "list"}
          onclick={() => setView("list")}
        >
          <span aria-hidden="true">☰</span>
          {$_("projects.viewList")}
        </button>
      </div>
    </div>
  {/if}

  <div class="projects-grid">
    {#if loading}
      <div class="loading-state">
        <div class="loading-spinner"></div>
        <span>{$_("sidebar.loadingProjects")}</span>
      </div>
    {:else if filteredProjects.length === 0 && searchQuery}
      <div class="empty-state">
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          class="empty-icon"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <p>{$_("sidebar.noChatsFound")}</p>
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
        <h3 class="empty-title">{$_("sidebar.noProjectsYet")}</h3>
        <p class="empty-description">{$_("projects.emptyStateDesc")}</p>
        <button class="empty-create-btn premium-btn" onclick={openCreateModal}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {$_("sidebar.createProject")}
        </button>
      </div>
    {:else if view === "list"}
      <!-- List view: the Control Hub table pattern (AI Engines / Connectors) —
           one bordered card, a tinted header row, hairline-separated rows. -->
      <div class="projects-table">
        <div class="pt-head" aria-hidden="true">
          <span class="pt-label">{$_("projects.colProject")}</span>
          <span class="pt-label pt-col-category"
            >{$_("projects.colCategory")}</span
          >
          <span class="pt-label pt-col-updated"
            >{$_("projects.colUpdated")}</span
          >
          <span class="pt-label pt-col-chats">{$_("projects.tabChats")}</span>
          <span class="pt-label pt-col-visibility"
            >{$_("projects.colVisibility")}</span
          >
          <span class="pt-label pt-col-actions"
            >{$_("projects.colActions")}</span
          >
        </div>
        <ul class="pt-rows">
          {#each filteredProjects as project (project.id)}
            {@const colors = categoryColors[project.category]}
            <li class="pt-row">
              <button
                class="pt-open"
                type="button"
                onclick={() => openProject(project)}
              >
                <span class="pt-project">
                  <span
                    class="card-emoji pt-emoji"
                    style:--emoji-bg={colors?.bg || "var(--btn-tertiary)"}
                    style:--emoji-color={colors?.text || "inherit"}
                    aria-hidden="true"
                    >{categoryEmoji[project.category] || "📁"}</span
                  >
                  <span class="pt-text">
                    <span class="pt-name" title={project.name}
                      >{project.name}</span
                    >
                    {#if project.description}
                      <span class="pt-desc">{project.description}</span>
                    {:else}
                      <span class="pt-desc pt-desc--empty"
                        >{$_("sidebar.projectDescriptionPlaceholder") ||
                          "No description"}</span
                      >
                    {/if}
                  </span>
                </span>
                <span class="pt-col-category">
                  <span
                    class="card-badge"
                    style:--badge-bg={colors?.bg}
                    style:--badge-text={colors?.text}
                    style:--badge-border={colors?.border}
                  >
                    {$_(
                      `sidebar.cat${project.category.charAt(0).toUpperCase() + project.category.slice(1)}`,
                    )}
                  </span>
                </span>
                <span class="pt-cell pt-col-updated"
                  >{formatDate(project.updatedAt)}</span
                >
                <span class="pt-cell pt-col-chats">
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    aria-hidden="true"
                  >
                    <path
                      d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
                    />
                  </svg>
                  {project.chatCount ?? 0}
                </span>
                <span
                  class="pt-cell pt-col-visibility"
                  class:pt-team={project.visibility === "team"}
                >
                  {#if project.visibility === "team"}
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      aria-hidden="true"
                    >
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                    </svg>
                    {$_("projects.team")}
                  {:else}
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      aria-hidden="true"
                    >
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    {$_("projects.private")}
                  {/if}
                </span>
              </button>
              <span class="pt-actions pt-col-actions">
                <button
                  class="action-btn"
                  type="button"
                  onclick={() => openEditModal(project)}
                  title={$_("sidebar.editProject")}
                  aria-label={$_("sidebar.editProject")}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path
                      d="M4 17.25V21h3.75L17.81 10.94l-3.75-3.75L4 17.25z"
                    />
                    <path
                      d="M20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z"
                    />
                  </svg>
                </button>
                <button
                  class="action-btn"
                  type="button"
                  onclick={() => handleShare(project)}
                  title={$_("sidebar.share")}
                  aria-label={$_("sidebar.share")}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <circle cx="18" cy="5" r="3" /><circle
                      cx="6"
                      cy="12"
                      r="3"
                    /><circle cx="18" cy="19" r="3" />
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                  </svg>
                </button>
                <button
                  class="action-btn action-btn--danger"
                  type="button"
                  onclick={() => confirmDelete(project)}
                  title={$_("sidebar.delete")}
                  aria-label={$_("sidebar.delete")}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <polyline points="3,6 5,6 21,6" />
                    <path
                      d="m19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"
                    />
                  </svg>
                </button>
              </span>
            </li>
          {/each}
        </ul>
      </div>
    {:else}
      {#each filteredProjects as project (project.id)}
        {@const colors = categoryColors[project.category]}
        <div
          class="project-card"
          style:--cat-bg={colors?.bg || "var(--gx-fill-soft)"}
          style:--cat-text={colors?.text || "var(--gx-org-primary-500)"}
          style:--cat-border={colors?.border || "var(--gx-hair)"}
        >
          <button
            class="card-main"
            type="button"
            onclick={() => openProject(project)}
          >
            <div class="card-header">
              <span
                class="card-emoji"
                style:--emoji-bg={colors?.bg || "var(--btn-tertiary)"}
                style:--emoji-color={colors?.text || "inherit"}
                aria-hidden="true"
              >
                {categoryEmoji[project.category] || "📁"}
              </span>
            </div>

            <div class="card-body">
              <h3 class="card-title" title={project.name}>{project.name}</h3>
              {#if project.description}
                <p class="card-description">{project.description}</p>
              {:else}
                <p class="card-description card-description--empty">
                  {$_("sidebar.projectDescriptionPlaceholder") ||
                    "No description"}
                </p>
              {/if}
            </div>

            <div class="card-tags">
              <span
                class="card-badge"
                style:--badge-bg={colors?.bg}
                style:--badge-text={colors?.text}
                style:--badge-border={colors?.border}
              >
                {$_(
                  `sidebar.cat${project.category.charAt(0).toUpperCase() + project.category.slice(1)}`,
                )}
              </span>
              <span
                class="card-chip"
                class:card-chip--team={project.visibility === "team"}
              >
                {#if project.visibility === "team"}
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    aria-hidden="true"
                  >
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                  </svg>
                  {$_("projects.team")}
                {:else}
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    aria-hidden="true"
                  >
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  {$_("projects.private")}
                {/if}
              </span>
            </div>

            <div class="card-footer">
              <span class="card-date">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </svg>
                {formatDate(project.updatedAt)}
              </span>
              <span class="card-footer-end">
                <span class="card-chats" title={$_("projects.tabChats")}>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    aria-hidden="true"
                  >
                    <path
                      d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
                    />
                  </svg>
                  {project.chatCount ?? 0}
                </span>
                <svg
                  class="card-open"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </span>
            </div>
          </button>

          <div class="card-actions-wrapper">
            <button
              class="action-btn"
              onclick={() => openEditModal(project)}
              title={$_("sidebar.editProject")}
              aria-label={$_("sidebar.editProject")}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M4 17.25V21h3.75L17.81 10.94l-3.75-3.75L4 17.25z" />
                <path
                  d="M20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z"
                />
              </svg>
            </button>
            <button
              class="action-btn"
              onclick={() => handleShare(project)}
              title={$_("sidebar.share")}
              aria-label={$_("sidebar.share")}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <circle cx="18" cy="5" r="3" /><circle
                  cx="6"
                  cy="12"
                  r="3"
                /><circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
            </button>
            <button
              class="action-btn action-btn--danger"
              onclick={() => confirmDelete(project)}
              title={$_("sidebar.delete")}
              aria-label={$_("sidebar.delete")}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <polyline points="3,6 5,6 21,6" />
                <path
                  d="m19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"
                />
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
  onclose={() => {
    showCreateModal = false;
    editingProject = null;
  }}
  onCreated={handleProjectCreated}
  editProject={editingProject}
/>

{#if showDeleteConfirm}
  <DeleteConfirmDialog
    title={$_("sidebar.deleteProject")}
    subtitle={projectToDelete?.name}
    message={$_("sidebar.deleteProjectConfirm")}
    confirmLabel={$_("sidebar.delete")}
    busyLabel={$_("sidebar.deleting")}
    cancelLabel={$_("sidebar.cancel")}
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
    display: flex;
    flex-direction: column;
    padding: 32px;
    font-family: var(--gx-font);
  }

  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-xl);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }

  .page-title {
    font-family: "Outfit", sans-serif;
    font-size: 2.1rem;
    font-weight: 800;
    color: var(--text-primary);
    margin: 0;
    letter-spacing: -0.035em;
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

  /* Same 37px primary action as the Control Hub headers (".cta-btn"). */
  .new-project-btn {
    height: 37px;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
    padding: 10px 16px;
    border: none;
    border-radius: 8px;
    background: var(--gx-org-primary-500);
    color: #fff;
    font-family: inherit;
    font-weight: 600;
    font-size: 14px;
    line-height: 100%;
    white-space: nowrap;
    cursor: pointer;
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    transition: background-color 120ms ease;
  }

  .new-project-btn:hover {
    background: var(--gx-ac-cta-hover);
    transform: none;
    box-shadow: none;
    filter: none;
  }

  .new-project-btn:active {
    transform: none;
  }

  .new-project-btn:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
  }

  .new-project-btn svg {
    display: block;
    flex-shrink: 0;
  }

  /* Search (when shown) on the left, the grid / list switcher on the right. */
  .projects-toolbar {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
    margin-bottom: var(--space-2xl);
  }

  .search-bar {
    position: relative;
    display: flex;
    align-items: center;
    flex: 1 1 auto;
    min-width: 0;
  }

  /* Same control as the Control Hub's grid / list switchers (AI Engines). */
  .view-switcher {
    height: 37px;
    border-radius: 12px;
    background: var(--gx-rule-cool);
    display: flex;
    gap: 2px;
    padding: 4px;
    flex-shrink: 0;
    box-sizing: border-box;
  }

  .view-opt {
    border: 0;
    border-radius: 8px;
    padding: 7px 10px;
    display: flex;
    gap: 4px;
    align-items: center;
    justify-content: center;
    background: none;
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    font: inherit;
    font-weight: 400;
    font-size: 12px;
    line-height: 100%;
    color: var(--gx-an-sub);
    white-space: nowrap;
    cursor: pointer;
    transition:
      background-color 120ms ease,
      color 120ms ease,
      box-shadow 120ms ease;
  }

  .view-opt:hover {
    transform: none;
    box-shadow: none;
    background: none;
  }

  .view-opt[aria-pressed="true"] {
    background: var(--gx-card);
    font-weight: 600;
    color: var(--gx-org-primary-500);
    box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.06);
  }

  .view-opt:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 1px;
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

  /* ===== ".project-card" (grid view) =====
     Flat --gx-* card: an even hairline border, a 14px corner and a restrained
     hover (border tint, soft shadow, 1px lift). Tile and actions share the top
     row; name and description below; category + visibility as tags; date and
     chat count in the footer. */
  .project-card {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    border: 1px solid var(--gx-hair);
    border-radius: 14px;
    /* A soft wash of the category colour across the top of the card. */
    background: linear-gradient(180deg, var(--cat-bg) 0%, transparent 96px),
      var(--gx-card);
    overflow: hidden;
    transition:
      border-color 160ms ease,
      box-shadow 160ms ease,
      transform 160ms ease;
  }

  .project-card:hover,
  .project-card:focus-within {
    border-color: color-mix(in oklch, var(--cat-text) 45%, var(--gx-hair));
    box-shadow:
      0 1px 2px rgba(15, 23, 42, 0.04),
      0 10px 28px rgba(15, 23, 42, 0.08);
    transform: translateY(-2px);
  }

  .card-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 14px;
    height: 100%;
    min-width: 0;
    padding: 18px;
    border: none;
    border-radius: 0;
    background: transparent;
    color: inherit;
    text-align: start;
    /* The global button style is nowrap, which cut the description off on
       one line instead of letting it wrap to its two-line clamp. */
    white-space: normal;
    cursor: pointer;
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
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
    border-radius: 14px;
  }

  /* The top row holds the tile; the actions are laid over its right side. */
  .card-header {
    display: flex;
    align-items: center;
    min-height: 44px;
  }

  .project-card .card-emoji {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    font-size: 21px;
    background: var(--gx-card);
    box-shadow:
      inset 0 0 0 1px var(--cat-border),
      0 1px 2px rgba(15, 23, 42, 0.05);
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

  .card-body {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
    flex: 1 1 auto;
  }

  .card-title {
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 700;
    font-size: 16px;
    line-height: 1.3;
    letter-spacing: -0.01em;
    color: var(--gx-org-ink);
  }

  .card-description {
    margin: 0;
    min-height: calc(13px * 1.5 * 2);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    font-weight: 400;
    font-size: 13px;
    line-height: 1.5;
    color: var(--gx-slate-500);
  }

  .card-description--empty {
    font-style: italic;
    color: var(--gx-slate-400);
  }

  .card-tags {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
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

  .card-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 9px;
    border-radius: 6px;
    background: var(--gx-fill-soft);
    color: var(--gx-slate-500);
    font-weight: 500;
    font-size: 11.5px;
    line-height: 100%;
    white-space: nowrap;
  }

  .card-chip--team {
    background: color-mix(in oklch, var(--gx-tx-chip-icon-fg) 10%, transparent);
    color: var(--gx-tx-chip-icon-fg);
  }

  .card-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding-top: 12px;
    border-top: 1px solid var(--gx-hair);
  }

  .card-date,
  .card-chats {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-weight: 500;
    font-size: 12px;
    line-height: 100%;
    color: var(--gx-slate-400);
    white-space: nowrap;
  }

  .card-chats {
    font-variant-numeric: tabular-nums;
    color: var(--gx-slate-500);
  }

  .card-footer-end {
    display: inline-flex;
    align-items: center;
    gap: 12px;
  }

  /* "Open" cue: slides and takes the primary colour on hover. */
  .card-open {
    color: var(--gx-slate-400);
    transition:
      transform 160ms ease,
      color 160ms ease;
  }

  .project-card:hover .card-open,
  .project-card:focus-within .card-open {
    color: var(--gx-org-primary-500);
    transform: translateX(3px);
  }

  /* Edit / share / delete: always visible, as quiet icons on the top row. */
  .card-actions-wrapper {
    position: absolute;
    top: 24px;
    inset-inline-end: 16px;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 2px;
    border-radius: 9px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    z-index: 1;
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

  /* ===== List view: ".projects-table" =====
     Mirrors the Control Hub tables (".engines-table"): one card with a hairline
     ring, a tinted header row, 60px rows split by hairlines. The row's columns
     live on the shared grid template so the header lines up with every row. */
  .projects-table {
    grid-column: 1 / -1;
    --pt-cols: minmax(0, 1fr) 128px 132px 72px 104px 104px;
    border: 1px solid var(--gx-hair-strong);
    border-radius: 12px;
    background: var(--gx-card);
    overflow: hidden;
  }

  .pt-head,
  .pt-row {
    display: grid;
    grid-template-columns: var(--pt-cols);
    column-gap: 16px;
    align-items: center;
    padding: 0 18px;
  }

  .pt-head {
    min-height: 30px;
    background: color-mix(
      in oklch,
      var(--gx-org-primary-500) 8%,
      var(--gx-card)
    );
  }

  .pt-label {
    font-weight: 700;
    font-size: 10px;
    line-height: 14px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--gx-an-sub);
    white-space: nowrap;
  }

  .pt-rows {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .pt-row {
    min-height: 60px;
    border-top: 1px solid var(--gx-hair);
    transition: background-color 120ms ease;
  }

  .pt-row:hover,
  .pt-row:focus-within {
    background: var(--gx-row-hover);
  }

  /* The clickable part of the row spans every column but the actions, and
     shares the row's grid so its cells sit under the header labels. */
  .pt-open {
    grid-column: 1 / 6;
    display: grid;
    grid-template-columns: subgrid;
    align-items: center;
    min-width: 0;
    padding: 10px 0;
    border: 0;
    border-radius: 0;
    background: none;
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
  }

  .pt-open:hover,
  .pt-open:active {
    transform: none;
    box-shadow: none;
    background: none;
  }

  .pt-open:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: -2px;
    border-radius: 6px;
  }

  .pt-project {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  .pt-emoji {
    width: 36px;
    height: 36px;
    font-size: 17px;
  }

  .pt-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .pt-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
    font-size: 14px;
    line-height: 1.3;
    color: var(--gx-org-ink);
  }

  .pt-desc {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12.5px;
    line-height: 1.4;
    color: var(--gx-slate-500);
  }

  .pt-desc--empty {
    font-style: italic;
    color: var(--gx-slate-400);
  }

  .pt-cell {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    font-size: 13px;
    line-height: 1.3;
    color: var(--gx-slate-500);
    white-space: nowrap;
  }

  .pt-col-chats {
    font-variant-numeric: tabular-nums;
  }

  .pt-team {
    color: var(--gx-tx-chip-icon-fg);
  }

  .pt-actions {
    display: flex;
    justify-content: flex-end;
    gap: 2px;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
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

    /* One card per row: no neighbour to line up with, so drop the reserved
       second description line. */
    .card-description {
      min-height: 0;
    }

    /* Phones: the table keeps the project and its actions only. */
    .projects-table {
      --pt-cols: minmax(0, 1fr) auto;
    }

    .pt-head {
      display: none;
    }

    .pt-row {
      padding: 0 12px;
    }

    .pt-open {
      grid-column: 1 / 2;
      grid-template-columns: minmax(0, 1fr);
    }

    .pt-open .pt-col-category,
    .pt-open .pt-col-updated,
    .pt-open .pt-col-chats,
    .pt-open .pt-col-visibility {
      display: none;
    }
  }
</style>
