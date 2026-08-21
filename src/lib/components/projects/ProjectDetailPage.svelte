<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { navigate } from "svelte-routing";
  import { _ } from "svelte-i18n";
  import {
    getProjectDetail,
    updateProjectInstructions,
    uploadProjectSource,
    deleteProjectSource,
    shareProject,
    getProjectMembers,
    searchProjectMembers,
    removeProjectMember,
    getProjectArtifacts,
    unlinkProjectFromConversation,
    getProjectMcpServers,
    enableProjectMcpServer,
    disableProjectMcpServer,
  } from "../../api/projectsApi";
  import CreateProjectModal from "./CreateProjectModal.svelte";
  import AddMemberModal from "./AddMemberModal.svelte";
  import { getChatMcpServers } from "../../api/chatApi";
  import MessageInput from "../../features/chat/components/MessageInput.svelte";
  import { getModels } from "../../api/models";
  import type { ProviderInfo, ModelInfo } from "../../api/models";
  import type { MCPServer } from "../../admin/types";
  import type {
    Project,
    ProjectSource,
    ProjectChat,
    ProjectCategory,
    ProjectMember,
    ProjectMemberSearchResult,
    ProjectArtifact,
  } from "../../types/project";
  import { toast } from "../Toaster.svelte";
  import { setCrumbLeaf } from "../layout/index.js";

  let { id } = $props<{ id: string }>();

  let project = $state<Project | null>(null);

  // The top bar shows this project's name as the last breadcrumb.
  $effect(() => {
    setCrumbLeaf(project?.name ?? null);
    return () => setCrumbLeaf(null);
  });
  let sources = $state<ProjectSource[]>([]);
  let chats = $state<ProjectChat[]>([]);
  let loading = $state(true);
  let activeTab = $state<"chats" | "sources" | "tools" | "instructions" | "members" | "activity">(
    "chats",
  );

  let instructions = $state("");
  let savingInstructions = $state(false);
  let instructionsChanged = $state(false);

  let uploading = $state(false);
  let dragOver = $state(false);
  let deletingSourceId = $state<string | null>(null);

  let searchChats = $state("");
  let showEditModal = $state(false);
  let showMembersModal = $state(false);
  let sharing = $state(false);

  // Members state
  let members = $state<ProjectMember[]>([]);
  let loadingMembers = $state(false);
  let memberSearchQuery = $state("");
  let memberSearchResults = $state<ProjectMemberSearchResult[]>([]);
  let searchingMembers = $state(false);
  let removingMemberId = $state<string | null>(null);
  let confirmRemoveMember = $state<ProjectMember | null>(null);
  let memberSearchTimeout: ReturnType<typeof setTimeout> | null = null;

  // Confirmation state
  let confirmDeleteSource = $state<ProjectSource | null>(null);
  let confirmRemoveChat = $state<ProjectChat | null>(null);
  let removingChatId = $state<string | null>(null);

  // Artifacts state
  let artifacts = $state<ProjectArtifact[]>([]);
  let loadingArtifacts = $state(false);

  function openEditModal() {
    showEditModal = true;
  }

  function handleProjectUpdated() {
    fetchProject();
  }

  async function handleShare() {
    if (!project) return;
    sharing = true;
    try {
      const { shareUrl } = await shareProject(project.id);
      await navigator.clipboard.writeText(shareUrl);
      toast.success($_('sidebar.shareLinkCopied'));
    } catch {
      toast.error($_('sidebar.shareProjectError'));
    } finally {
      sharing = false;
    }
  }

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

  const categoryColors: Record<ProjectCategory, { bg: string; text: string }> =
    {
      research: { bg: "rgba(59, 130, 246, 0.12)", text: "#3b82f6" },
      planning: { bg: "rgba(249, 115, 22, 0.12)", text: "#f97316" },
      code: { bg: "rgba(139, 92, 246, 0.12)", text: "#8b5cf6" },
      meetings: { bg: "rgba(16, 185, 129, 0.12)", text: "#10b981" },
      onboarding: { bg: "rgba(99, 102, 241, 0.12)", text: "#6366f1" },
      brainstorms: { bg: "rgba(236, 72, 153, 0.12)", text: "#ec4899" },
      writing: { bg: "rgba(234, 179, 8, 0.12)", text: "#eab308" },
      design: { bg: "rgba(6, 182, 212, 0.12)", text: "#06b6d4" },
    };

  interface McpTool {
    name: string;
    description: string;
  }

  type ProjectMcpServer = MCPServer & {
    icon?: string;
    connected: boolean;
    tools: McpTool[];
  };

  let mcpServers = $state<ProjectMcpServer[]>([]);
  let loadingTools = $state(false);
  let expandedServerId = $state<string | null>(null);
  let selectedMcpServers = $state<string[]>([]);
  let webSearchEnabled = $state(false);

  // Models state
  let providers = $state<ProviderInfo[]>([]);
  let loadingModels = $state(true);
  let modelsError = $state<string | null>(null);
  let selectedModel = $state("gpt-5.2");
  let selectedProvider = $state("openai");

  async function loadModels() {
    loadingModels = true;
    modelsError = null;
    try {
      const response = await getModels();
      providers = response.providers;
    } catch (error) {
      console.error("Failed to load models:", error);
      modelsError = $_("chat.errors.failedToLoadModels");
    } finally {
      loadingModels = false;
    }
  }

  function selectModel(provider: ProviderInfo, model: ModelInfo) {
    selectedProvider = provider.key;
    selectedModel = model.key;
  }

  function handleRemoveModel() {
    selectedModel = "";
    selectedProvider = "";
  }

  function toggleMcpServer(serverId: string) {
    if (selectedMcpServers.includes(serverId)) {
      selectedMcpServers = selectedMcpServers.filter((id) => id !== serverId);
    } else {
      selectedMcpServers = [...selectedMcpServers, serverId];
    }
  }

  let togglingServerId = $state<string | null>(null);

  async function fetchMcpServers() {
    loadingTools = true;
    try {
      const [{ servers }, projectServers] = await Promise.all([
        getChatMcpServers(),
        getProjectMcpServers(id),
      ]);
      const enabledIds = new Set(projectServers.map((ps) => ps.serverId));
      mcpServers = servers.map((s: any) => ({
        ...s,
        enabled: enabledIds.has(s.id),
      }));
    } catch {
      console.error("Failed to fetch MCP servers");
    } finally {
      loadingTools = false;
    }
  }

  async function toggleServer(index: number) {
    const server = mcpServers[index];
    const newEnabled = !server.enabled;
    togglingServerId = server.id;
    try {
      if (newEnabled) {
        await enableProjectMcpServer(id, server.id);
      } else {
        await disableProjectMcpServer(id, server.id);
      }
      mcpServers[index].enabled = newEnabled;
    } catch {
      toast.error(newEnabled ? $_('projects.enableServerError') : $_('projects.disableServerError'));
    } finally {
      togglingServerId = null;
    }
  }

  function toggleExpand(serverId: string) {
    expandedServerId = expandedServerId === serverId ? null : serverId;
  }

  let uploadedSources = $derived(
    sources.filter((s) => s.origin !== 'artifact'),
  );

  let artifactSourceIds = $derived(
    new Set(sources.filter((s) => s.origin === 'artifact').map((s) => s.id)),
  );

  let dedupedArtifacts = $derived(
    artifacts.filter((a) => !artifactSourceIds.has(a.id)),
  );

  let allArtifactItems = $derived([
    ...sources.filter((s) => s.origin === 'artifact'),
    ...dedupedArtifacts,
  ]);

  let filteredChats = $derived(
    chats.length
      ? searchChats.trim()
        ? chats.filter(
            (c) =>
              c.title
                .toLowerCase()
                .includes(searchChats.trim().toLowerCase()) ||
              c.lastMessage
                .toLowerCase()
                .includes(searchChats.trim().toLowerCase()),
          )
        : chats
      : [],
  );

  interface ActivityEvent {
    id: string;
    type: 'chat_created' | 'chat_updated' | 'source_uploaded' | 'artifact_added' | 'project_created' | 'project_updated' | 'instructions_updated';
    title: string;
    description: string;
    timestamp: string;
    icon: string;
  }

  let activities = $derived.by(() => {
    const events: ActivityEvent[] = [];

    // Project creation
    if (project) {
      events.push({
        id: 'proj_created',
        type: 'project_created',
        title: $_('projects.actProjectCreated'),
        description: $_('projects.actProjectCreatedDesc', { values: { name: project.name } }),
        timestamp: project.createdAt,
        icon: '🚀',
      });
      if (project.createdAt !== project.updatedAt) {
        events.push({
          id: 'proj_updated',
          type: 'project_updated',
          title: $_('projects.actProjectUpdated'),
          description: $_('projects.actProjectUpdatedDesc'),
          timestamp: project.updatedAt,
          icon: '✏️',
        });
      }
      if (instructions.trim().length > 0) {
        events.push({
          id: 'instructions_set',
          type: 'instructions_updated',
          title: $_('projects.actInstructionsConfigured'),
          description: $_('projects.actInstructionsDesc', { values: { count: instructions.length } }),
          timestamp: project.updatedAt,
          icon: '📝',
        });
      }
    }

    // Chat events
    for (const chat of chats) {
      events.push({
        id: `chat_created_${chat.id}`,
        type: 'chat_created',
        title: $_('projects.actChatStarted'),
        description: chat.title,
        timestamp: chat.createdAt,
        icon: '💬',
      });
      if (chat.createdAt !== chat.updatedAt) {
        events.push({
          id: `chat_updated_${chat.id}`,
          type: 'chat_updated',
          title: $_('projects.actChatActivity', { values: { count: chat.messageCount } }),
          description: chat.lastMessage,
          timestamp: chat.updatedAt,
          icon: '🔄',
        });
      }
    }

    // Source events
    for (const source of sources) {
      if (source.origin === 'artifact') {
        events.push({
          id: `source_${source.id}`,
          type: 'artifact_added',
          title: $_('projects.actArtifactContributed'),
          description: source.fileName,
          timestamp: source.uploadedAt,
          icon: '💾',
        });
      } else {
        events.push({
          id: `source_${source.id}`,
          type: 'source_uploaded',
          title: $_('projects.actSourceUploaded'),
          description: source.fileName,
          timestamp: source.uploadedAt,
          icon: '📎',
        });
      }
    }

    // Sort newest first
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return events;
  });

  async function fetchMembers() {
    loadingMembers = true;
    try {
      members = await getProjectMembers(id);
    } catch {
      console.error("Failed to fetch members");
    } finally {
      loadingMembers = false;
    }
  }

  function handleMemberSearchInput() {
    if (memberSearchTimeout) clearTimeout(memberSearchTimeout);
    const q = memberSearchQuery.trim();
    if (!q) {
      memberSearchResults = [];
      return;
    }
    memberSearchTimeout = setTimeout(async () => {
      searchingMembers = true;
      try {
        const response = await searchProjectMembers(id, q);
        const memberIds = new Set(members.map((m) => m.userId));
        memberSearchResults = response.users.filter((u) => !memberIds.has(u.id));
      } catch {
        memberSearchResults = [];
      } finally {
        searchingMembers = false;
      }
    }, 300);
  }

  function requestRemoveMember(member: ProjectMember) {
    confirmRemoveMember = member;
  }

  function cancelRemoveMember() {
    confirmRemoveMember = null;
  }

  async function confirmAndRemoveMember() {
    const member = confirmRemoveMember;
    if (!member) return;
    confirmRemoveMember = null;
    removingMemberId = member.id;
    try {
      await removeProjectMember(id, member.userId);
      members = members.filter((m) => m.id !== member.id);
      toast.success($_('projects.memberRemoved', { values: { name: member.name || member.email } }));
    } catch {
      toast.error($_('projects.memberRemoveError'));
    } finally {
      removingMemberId = null;
    }
  }

  async function fetchArtifacts() {
    loadingArtifacts = true;
    try {
      artifacts = await getProjectArtifacts(id);
    } catch {
      console.error("Failed to fetch artifacts");
    } finally {
      loadingArtifacts = false;
    }
  }

  async function fetchProject() {
    loading = true;
    try {
      const [proj] = await Promise.all([
        getProjectDetail(id),
        fetchMcpServers(),
        loadModels(),
        fetchMembers(),
        fetchArtifacts(),
      ]);
      project = proj;
      instructions = proj.instructions || "";
      sources = proj.sources || [];
      chats = proj.chats || [];
    } catch {
      toast.error($_('projects.loadProjectError'));
    } finally {
      loading = false;
    }
  }

  async function saveInstructions() {
    savingInstructions = true;
    try {
      await updateProjectInstructions(id, instructions);
      toast.success($_('projects.instructionsSaved'));
      instructionsChanged = false;
    } catch {
      toast.error($_('projects.instructionsSaveError'));
    } finally {
      savingInstructions = false;
    }
  }

  function handleInstructionsInput() {
    instructionsChanged = true;
  }

  async function handleFileUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    uploading = true;
    try {
      for (const file of Array.from(files)) {
        const source = await uploadProjectSource(id, file);
        sources = [...sources, source];
      }
      toast.success($_('projects.filesUploaded', { values: { count: files.length } }));
    } catch {
      toast.error($_('projects.fileUploadError'));
    } finally {
      uploading = false;
    }
  }

  function requestDeleteSource(source: ProjectSource) {
    confirmDeleteSource = source;
  }

  function cancelDeleteSource() {
    confirmDeleteSource = null;
  }

  async function confirmAndDeleteSource() {
    const source = confirmDeleteSource;
    if (!source) return;
    confirmDeleteSource = null;
    deletingSourceId = source.id;
    try {
      await deleteProjectSource(id, source.id);
      sources = sources.filter((s) => s.id !== source.id);
      artifacts = artifacts.filter((a) => a.id !== source.id);
      toast.success($_('projects.fileRemoved'));
    } catch {
      toast.error($_('projects.fileRemoveError'));
    } finally {
      deletingSourceId = null;
    }
  }

  function requestRemoveChat(chat: ProjectChat) {
    confirmRemoveChat = chat;
  }

  function cancelRemoveChat() {
    confirmRemoveChat = null;
  }

  async function confirmAndRemoveChat() {
    const chat = confirmRemoveChat;
    if (!chat) return;
    confirmRemoveChat = null;
    removingChatId = chat.id;
    try {
      await unlinkProjectFromConversation(chat.id, id);
      chats = chats.filter((c) => c.id !== chat.id);
      toast.success($_('projects.chatRemoved'));
    } catch {
      toast.error($_('projects.chatRemoveError'));
    } finally {
      removingChatId = null;
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    handleFileUpload(e.dataTransfer?.files ?? null);
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    dragOver = true;
  }

  function handleDragLeave() {
    dragOver = false;
  }

  function openChat(chat: ProjectChat) {
    navigate(`/?chatId=${chat.id}`);
  }

  function startNewChat() {
    navigate(`/?projectId=${id}`);
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function formatTime(dateStr: string): string {
    return new Date(dateStr).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }

  function getFileIcon(fileType: string): string {
    if (fileType.startsWith("image/")) return "🖼️";
    if (fileType === "application/pdf") return "📕";
    if (
      fileType.includes("spreadsheet") ||
      fileType.includes("excel") ||
      fileType.includes(".sheet")
    )
      return "📊";
    if (fileType.includes("presentation") || fileType.includes("powerpoint"))
      return "📽️";
    if (fileType.includes("word") || fileType.includes("document")) return "📝";
    if (fileType.startsWith("text/")) return "📄";
    if (fileType.includes("json") || fileType.includes("xml")) return "🔧";
    return "📎";
  }

  $effect(() => {
    fetchProject();
  });
</script>

<div class="project-detail">
  {#if loading}
    <div class="loading-state">
      <div class="loading-spinner"></div>
      <span>{$_('projects.loadingProject')}</span>
    </div>
  {:else if project}
    <!-- Back Button -->
    <div class="navigation-header">
      <button
        class="back-btn pill pill--interactive pill--sm"
        onclick={() => navigate("/projects")}
      >
        <svg
          class="back-icon"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
        >
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        <span>{$_('projects.backToProjects')}</span>
      </button>
    </div>

    <!-- Header Panel -->
    <div class="project-header glass glass--elev1">
      <div
        class="header-glow"
        style:background={categoryColors[project.category]?.text}
      ></div>
      <div class="project-info">
        <div class="project-icon-wrapper">
          <div
            class="project-icon"
            style:background={categoryColors[project.category]?.bg}
            style:color={categoryColors[project.category]?.text}
          >
            {categoryEmoji[project.category] || "📁"}
          </div>
        </div>
        <div class="project-meta">
          <div class="meta-badges">
            <span
              class="tag tag--primary"
              style:--tag-color={categoryColors[project.category]?.text}
            >
              {project.category}
            </span>
            {#if project.visibility === "team"}
              <span class="tag">
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                >
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                </svg>
                {$_('projects.team')}
              </span>
            {:else}
              <span class="tag">
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                {$_('projects.private')}
              </span>
            {/if}
          </div>
          <div class="project-name-row">
            <h1 class="project-name">{project.name}</h1>
            <div class="header-actions">
              <button class="header-action-btn" onclick={openEditModal} title={$_('sidebar.editProject')}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M4 17.25V21h3.75L17.81 10.94l-3.75-3.75L4 17.25z"/>
                  <path d="M20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z"/>
                </svg>
                {$_('projects.edit')}
              </button>
              <button class="header-action-btn" onclick={() => showMembersModal = true} title={$_('projects.addMembers')}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <line x1="19" y1="8" x2="19" y2="14"/>
                  <line x1="22" y1="11" x2="16" y2="11"/>
                </svg>
                {$_('projects.members')}
              </button>
              <button class="header-action-btn" onclick={handleShare} disabled={sharing} title={$_('sidebar.share')}>
                {#if sharing}
                  <div class="loading-spinner tiny"></div>
                {:else}
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                  </svg>
                {/if}
                {$_('projects.share')}
              </button>
            </div>
          </div>
          {#if project.description}
            <p class="project-desc">{project.description}</p>
          {/if}

          <div class="project-metadata-bar">
            <div class="metadata-item">
              <span class="metadata-label">{$_('projects.metaCreated')}</span>
              <span class="metadata-value">{formatDate(project.createdAt)} {formatTime(project.createdAt)}</span>
            </div>
            <div class="metadata-divider"></div>
            <div class="metadata-item">
              <span class="metadata-label">{$_('projects.metaLastActivity')}</span>
              <span class="metadata-value">{formatDate(project.updatedAt)} {formatTime(project.updatedAt)}</span>
            </div>
            <div class="metadata-divider"></div>
            <div class="metadata-item">
              <span class="metadata-label">{$_('projects.metaChats')}</span>
              <span class="metadata-value">{chats.length}</span>
            </div>
            <div class="metadata-divider"></div>
            <div class="metadata-item">
              <span class="metadata-label">{$_('projects.metaSources')}</span>
              <span class="metadata-value">{uploadedSources.length + allArtifactItems.length}</span>
            </div>
            <div class="metadata-divider"></div>
            <div class="metadata-item">
              <span class="metadata-label">{$_('projects.metaMembers')}</span>
              <span class="metadata-value">{members.length}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Message Input -->
    <div class="project-chat-input-wrapper">
      <MessageInput
        onSend={(message) => {
          const mcpParam = selectedMcpServers.length > 0 ? `&mcpServers=${encodeURIComponent(selectedMcpServers.join(','))}` : '';
          navigate(`/?projectId=${id}&message=${encodeURIComponent(message)}&model=${encodeURIComponent(selectedModel)}&provider=${encodeURIComponent(selectedProvider)}&webSearch=${webSearchEnabled}${mcpParam}`);
        }}
        placeholder={$_('chat.messageInput.placeholderWithModel', { values: { model: selectedModel } })}
        {selectedModel}
        {selectedProvider}
        {mcpServers}
        {selectedMcpServers}
        loadingMcpServers={loadingTools}
        {webSearchEnabled}
        onWebSearchToggle={() => webSearchEnabled = !webSearchEnabled}
        onMcpToggle={toggleMcpServer}
        onRemoveModel={handleRemoveModel}
        onModelSelect={selectModel}
        {providers}
        {loadingModels}
        {modelsError}
      />
    </div>

    <!-- Tabs Segmented Control -->
    <div class="tabs-container">
      <div class="pill-group">
        <button
          class="pill-group__item"
          class:pill-group__item--active={activeTab === "chats"}
          onclick={() => (activeTab = "chats")}
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
              d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
            />
          </svg>
          <span>{$_('projects.tabChats')}</span>
          {#if chats.length > 0}
            <span class="badge-count">{chats.length}</span>
          {/if}
        </button>
        <button
          class="pill-group__item"
          class:pill-group__item--active={activeTab === "sources"}
          onclick={() => (activeTab = "sources")}
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
              d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
            />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <span>{$_('projects.tabSources')}</span>
          {#if sources.length + artifacts.length > 0}
            <span class="badge-count">{uploadedSources.length + allArtifactItems.length}</span>
          {/if}
        </button>
        <button
          class="pill-group__item"
          class:pill-group__item--active={activeTab === "tools"}
          onclick={() => (activeTab = "tools")}
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
              d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"
            />
          </svg>
          <span>{$_('projects.tabTools')}</span>
        </button>
        <button
          class="pill-group__item"
          class:pill-group__item--active={activeTab === "instructions"}
          onclick={() => (activeTab = "instructions")}
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
              d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
            />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          <span>{$_('projects.tabInstructions')}</span>
        </button>
        <button
          class="pill-group__item"
          class:pill-group__item--active={activeTab === "members"}
          onclick={() => (activeTab = "members")}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <span>{$_('projects.tabMembers')}</span>
          {#if members.length > 0}
            <span class="badge-count">{members.length}</span>
          {/if}
        </button>
        <button
          class="pill-group__item"
          class:pill-group__item--active={activeTab === "activity"}
          onclick={() => (activeTab = "activity")}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span>{$_('projects.tabActivity')}</span>
        </button>
      </div>
    </div>

    <!-- Tab Content -->
    <div class="tab-content">
      <!-- CHATS TAB -->
      {#if activeTab === "chats"}
        <div class="chats-section">
          {#if chats.length > 3}
            <div class="search-bar">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                class="search-icon"
              >
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
              <input
                type="text"
                class="search-input"
                placeholder={$_('projects.searchProjectChats')}
                bind:value={searchChats}
              />
            </div>
          {/if}

          {#if chats.length > 0}
            <div class="chats-header-actions">
              <button class="new-chat-action-btn btn-primary" onclick={startNewChat}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                {$_('projects.newChat')}
              </button>
            </div>
          {/if}

          {#if filteredChats.length === 0 && chats.length === 0}
            <div class="glass-empty-card">
              <div class="glow-container">
                <div class="glow-effect"></div>
                <svg
                  class="animated-empty-illustration"
                  width="140"
                  height="140"
                  viewBox="0 0 160 160"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <defs>
                    <linearGradient
                      id="chat-grad"
                      x1="0"
                      y1="0"
                      x2="160"
                      y2="160"
                      gradientUnits="userSpaceOnUse"
                    >
                      <stop offset="0%" stop-color="var(--brand)" />
                      <stop
                        offset="100%"
                        stop-color="var(--brand-green-accent)"
                      />
                    </linearGradient>
                    <radialGradient
                      id="chat-glow-grad"
                      cx="50%"
                      cy="50%"
                      r="50%"
                    >
                      <stop
                        offset="0%"
                        stop-color="var(--brand)"
                        stop-opacity="0.25"
                      />
                      <stop
                        offset="100%"
                        stop-color="var(--brand)"
                        stop-opacity="0"
                      />
                    </radialGradient>
                  </defs>
                  <circle
                    cx="80"
                    cy="80"
                    r="55"
                    fill="url(#chat-glow-grad)"
                    class="pulse-glow"
                  />
                  <circle
                    cx="80"
                    cy="80"
                    r="40"
                    stroke="rgba(255, 255, 255, 0.06)"
                    stroke-width="1.5"
                    stroke-dasharray="5 3"
                    class="spin-clockwise"
                  />
                  <g class="float-animation">
                    <path
                      d="M50 85C50 68.4315 63.4315 55 80 55C96.5685 55 110 68.4315 110 85C110 93.3512 106.591 100.906 101.1 106.3L104 116L94.5 112.5C90.1 114.1 85.2 115 80 115C63.4315 115 50 101.569 50 85Z"
                      fill="url(#chat-grad)"
                      fill-opacity="0.15"
                      stroke="url(#chat-grad)"
                      stroke-width="1.5"
                    />
                    <path
                      d="M60 85C60 73.9543 68.9543 65 80 65C91.0457 65 100 73.9543 100 85C100 96.0457 91.0457 105 80 105C74.5 105 69.5 102.8 65.8 99.2L58 102L60.5 94.2C60.2 91.3 60 88.2 60 85Z"
                      fill="url(#chat-grad)"
                      fill-opacity="0.25"
                      stroke="url(#chat-grad)"
                      stroke-width="1.5"
                    />
                    <circle cx="72" cy="85" r="2" fill="white" />
                    <circle cx="80" cy="85" r="2" fill="white" />
                    <circle cx="88" cy="85" r="2" fill="white" />
                  </g>
                  <circle
                    cx="120"
                    cy="65"
                    r="3.5"
                    fill="var(--brand-green-accent)"
                    class="float-particle-1"
                  />
                  <circle
                    cx="42"
                    cy="95"
                    r="2.5"
                    fill="var(--brand)"
                    class="float-particle-2"
                  />
                  <circle
                    cx="48"
                    cy="60"
                    r="2"
                    fill="var(--brand-cyan)"
                    class="float-particle-3"
                  />
                </svg>
              </div>
              <h3 class="empty-title">{$_('projects.noChatsYet')}</h3>
              <p class="empty-description">
                {$_('projects.noChatsDesc')}
              </p>
              <button
                class="empty-action-btn btn-primary"
                onclick={startNewChat}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                >
                  <line x1="12" y1="5" x2="12" y2="19" /><line
                    x1="5"
                    y1="12"
                    x2="19"
                    y2="12"
                  />
                </svg>
                {$_('projects.startChat')}
              </button>
            </div>
          {:else if filteredChats.length === 0}
            <div class="empty-search-info glass">
              <p>{$_('projects.noChatsMatch')}</p>
            </div>
          {:else}
            <div class="chat-list">
              {#each filteredChats as chat (chat.id)}
                <div class="chat-card glass" onclick={() => openChat(chat)} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openChat(chat); } }} role="button" tabindex="0">
                  <div
                    class="chat-card-icon"
                    style:background-color="rgba(var(--brand-rgb), 0.08)"
                    style:color="var(--brand)"
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <path
                        d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
                      />
                    </svg>
                  </div>
                  <div class="chat-card-body">
                    <span class="chat-card-title">{chat.title}</span>
                    <span class="chat-card-preview">{chat.lastMessage}</span>
                  </div>
                  <div class="chat-card-meta">
                    <div class="meta-row">
                      <span class="chat-card-date"
                        >{formatDate(chat.updatedAt)}</span
                      >
                      <span class="chat-card-time"
                        >{formatTime(chat.updatedAt)}</span
                      >
                    </div>
                    <span class="chat-card-count pill pill--xs pill--primary"
                      >{$_('projects.msgCount', { values: { count: chat.messageCount } })}</span
                    >
                  </div>
                  <button
                    class="source-delete-btn"
                    onclick={(e) => { e.stopPropagation(); requestRemoveChat(chat); }}
                    disabled={removingChatId === chat.id}
                    title={$_('projects.removeChatTitle')}
                  >
                    {#if removingChatId === chat.id}
                      <div class="loading-spinner tiny"></div>
                    {:else}
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2.5"
                      >
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    {/if}
                  </button>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    class="chat-card-arrow"
                  >
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </div>
              {/each}
            </div>
          {/if}
        </div>

        <!-- SOURCES TAB -->
      {:else if activeTab === "sources"}
        <div class="sources-section">
          <div
            class="upload-zone-wrapper glass"
            class:drag-over={dragOver}
            class:uploading
            ondrop={handleDrop}
            ondragover={handleDragOver}
            ondragleave={handleDragLeave}
            role="button"
            tabindex="0"
          >
            {#if uploading}
              <div class="loading-spinner small"></div>
              <span class="uploading-text">{$_('projects.uploadingFiles')}</span>
            {:else}
              <div class="upload-icon-container">
                <svg
                  width="36"
                  height="36"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  class="upload-icon"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </div>
              <span class="upload-text">{$_('projects.dragDropFiles')}</span>
              <span class="upload-hint"
                >{$_('projects.uploadHint')}</span
              >
              <label
                class="browse-btn-label pill pill--primary pill--interactive"
              >
                {$_('projects.browseFiles')}
                <input
                  type="file"
                  multiple
                  hidden
                  onchange={(e) => handleFileUpload(e.currentTarget.files)}
                />
              </label>
            {/if}
          </div>

          {#if uploadedSources.length > 0 || allArtifactItems.length > 0}
            <div class="source-list">
              {#each uploadedSources as source (source.id)}
                <div class="source-card glass">
                  <div class="source-icon-badge">
                    <span class="source-icon"
                      >{getFileIcon(source.fileType)}</span
                    >
                  </div>
                  <div class="source-info">
                    <span class="source-name">{source.fileName}</span>
                    <div class="source-meta">
                      <span class="origin-tag tag uploaded-tag">{$_('projects.uploaded')}</span>
                      <span class="size-tag tag"
                        >{formatFileSize(source.fileSize)}</span
                      >
                      <span class="bullet">&middot;</span>
                      <span class="upload-date"
                        >{$_('projects.uploadedOn', { values: { date: formatDate(source.uploadedAt) } })}</span
                      >
                    </div>
                  </div>
                  <button
                    class="source-delete-btn"
                    onclick={() => requestDeleteSource(source)}
                    disabled={deletingSourceId === source.id}
                    title={$_('projects.removeFile')}
                  >
                    {#if deletingSourceId === source.id}
                      <div class="loading-spinner tiny"></div>
                    {:else}
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2.5"
                      >
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    {/if}
                  </button>
                </div>
              {/each}

              {#each allArtifactItems as artifact (artifact.id)}
                <div class="source-card glass">
                  <div class="source-icon-badge">
                    <span class="source-icon">{getFileIcon(artifact.fileType)}</span>
                  </div>
                  <div class="source-info">
                    <span class="source-name">{artifact.fileName}</span>
                    <div class="source-meta">
                      <span class="origin-tag tag artifact-tag">{$_('projects.artifact')}</span>
                      <span class="size-tag tag">{formatFileSize(artifact.fileSize)}</span>
                      <span class="bullet">&middot;</span>
                      <span class="upload-date">{$_('projects.contributedOn', { values: { date: formatDate(artifact.uploadedAt) } })}</span>
                    </div>
                  </div>
                  <button
                    class="source-delete-btn"
                    onclick={() => requestDeleteSource({ id: artifact.id, projectId: artifact.projectId, fileName: artifact.fileName, fileType: artifact.fileType, fileSize: artifact.fileSize, origin: 'artifact' as const, uploadedAt: artifact.uploadedAt })}
                    disabled={deletingSourceId === artifact.id}
                    title={$_('projects.removeArtifact')}
                  >
                    {#if deletingSourceId === artifact.id}
                      <div class="loading-spinner tiny"></div>
                    {:else}
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2.5"
                      >
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    {/if}
                  </button>
                </div>
              {/each}
            </div>
          {:else}
            <div class="empty-sources-info glass">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
              >
                <path
                  d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
                />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <p>
                {$_('projects.emptySourcesDesc')}
              </p>
            </div>
          {/if}
        </div>

        <!-- TOOLS TAB -->
      {:else if activeTab === "tools"}
        <div class="tools-section">
          <div class="tools-desc-wrapper glass">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              class="info-icon"
            >
              <circle cx="12" cy="12" r="10" /><line
                x1="12"
                y1="16"
                x2="12"
                y2="12"
              /><line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <span>{$_('projects.mcpDesc')}</span>
          </div>

          {#if loadingTools}
            <div class="loading-state compact">
              <div class="loading-spinner small"></div>
              <span>{$_('projects.loadingTools')}</span>
            </div>
          {:else if mcpServers.length === 0}
            <div class="glass-empty-card">
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                class="empty-icon"
              >
                <path
                  d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"
                />
              </svg>
              <h3 class="empty-title">{$_('projects.noMcpServers')}</h3>
              <p class="empty-description">
                {$_('projects.noMcpServersDesc')}
              </p>
            </div>
          {:else}
            <div class="server-list">
              {#each mcpServers as server, i (server.id)}
                <div class="server-card glass" class:enabled={server.enabled}>
                  <div class="server-header">
                    <button
                      class="server-main"
                      onclick={() => toggleExpand(server.id)}
                    >
                      {#if server.icon}
                        <img src={server.icon} alt="" class="server-icon-img" />
                      {:else}
                        <div
                          class="server-icon-fallback"
                          class:connected={server.connected}
                        >
                          <svg
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                          >
                            <rect
                              x="2"
                              y="2"
                              width="20"
                              height="8"
                              rx="2"
                              ry="2"
                            /><rect
                              x="2"
                              y="14"
                              width="20"
                              height="8"
                              rx="2"
                              ry="2"
                            />
                            <line x1="6" y1="6" x2="6.01" y2="6" /><line
                              x1="6"
                              y1="18"
                              x2="6.01"
                              y2="18"
                            />
                          </svg>
                        </div>
                      {/if}
                      <div class="server-info">
                        <span class="server-name">{server.name}</span>
                        <div class="server-meta">
                          <span
                            class="status-dot"
                            class:connected={server.connected}
                          ></span>
                          <span class="status-text"
                            >{server.connected
                              ? $_('projects.connected')
                              : $_('projects.disconnected')}</span
                          >
                          {#if server.tools.length > 0}
                            <span class="bullet">&middot;</span>
                            <span class="tools-count"
                              >{$_('projects.toolCount', { values: { count: server.tools.length } })}</span
                            >
                          {/if}
                          <span class="bullet">&middot;</span>
                          <span class="transport-tag tag"
                            >{server.transport_type}</span
                          >
                        </div>
                      </div>
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2.5"
                        class="expand-icon"
                        class:expanded={expandedServerId === server.id}
                      >
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </button>
                    <div class="server-toggle">
                      <button
                        class="toggle-btn"
                        onclick={() => toggleServer(i)}
                        disabled={togglingServerId === server.id}
                        title={server.enabled
                          ? $_('projects.disableServer')
                          : $_('projects.enableServer')}
                      >
                        {#if togglingServerId === server.id}
                          <div class="loading-spinner tiny"></div>
                        {:else}
                          <div class="toggle-track" class:on={server.enabled}>
                            <div class="toggle-thumb"></div>
                          </div>
                        {/if}
                      </button>
                    </div>
                  </div>

                  {#if server.description}
                    <p class="server-desc">{server.description}</p>
                  {/if}

                  {#if expandedServerId === server.id && server.tools.length > 0}
                    <div class="tools-list">
                      {#each server.tools as tool}
                        <div class="tool-item">
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            class="tool-item-icon"
                          >
                            <path
                              d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"
                            />
                          </svg>
                          <div class="tool-item-info">
                            <span class="tool-item-name">{tool.name}</span>
                            {#if tool.description}
                              <span class="tool-item-desc"
                                >{tool.description}</span
                              >
                            {/if}
                          </div>
                        </div>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        </div>

        <!-- INSTRUCTIONS TAB -->
      {:else if activeTab === "instructions"}
        <div class="instructions-section">
          <div class="instructions-card glass">
            <p class="instructions-info-text">
              {$_('projects.instructionsInfo')}
            </p>
            <div class="editor-wrapper">
              <textarea
                class="instructions-editor-textarea"
                placeholder={$_('projects.instructionsPlaceholder')}
                bind:value={instructions}
                oninput={handleInstructionsInput}
                rows="11"
              ></textarea>
            </div>
            <div class="instructions-action-footer">
              <span
                class="char-count-badge tag"
                class:warn={instructions.length > 4500}
              >
                {$_('projects.charCount', { values: { count: instructions.length, max: 5000 } })}
              </span>
              <button
                class="save-instructions-btn btn-primary"
                onclick={saveInstructions}
                disabled={!instructionsChanged ||
                  savingInstructions ||
                  instructions.length > 5000}
              >
                {#if savingInstructions}
                  <div class="loading-spinner tiny"></div>
                  <span>{$_('projects.saving')}</span>
                {:else}
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                  >
                    <path
                      d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"
                    />
                    <polyline points="17 21 17 13 7 13 7 21" />
                    <polyline points="7 3 7 8 15 8" />
                  </svg>
                  <span>{$_('projects.saveInstructions')}</span>
                {/if}
              </button>
            </div>
          </div>
        </div>

        <!-- MEMBERS TAB -->
      {:else if activeTab === "members"}
        <div class="members-section">
          <!-- Add member search -->
          <div class="member-search-wrapper glass">
            <div class="member-search-header">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="info-icon">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <line x1="19" y1="8" x2="19" y2="14"/>
                <line x1="22" y1="11" x2="16" y2="11"/>
              </svg>
              <span>{$_('projects.searchAddMembers')}</span>
            </div>
            <div class="member-search-bar">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="search-icon">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
              <input
                type="text"
                class="search-input"
                placeholder={$_('projects.searchByNameEmail')}
                bind:value={memberSearchQuery}
                oninput={handleMemberSearchInput}
                autocomplete="off"
              />
            </div>

            {#if searchingMembers}
              <div class="member-search-status">{$_('projects.searching')}</div>
            {:else if memberSearchQuery.trim() && memberSearchResults.length === 0}
              <div class="member-search-status">{$_('projects.noMatchingUsers')}</div>
            {:else if memberSearchResults.length > 0}
              <div class="member-search-results">
                {#each memberSearchResults as user (user.id)}
                  <div class="member-search-result-row">
                    <div class="member-avatar-sm">
                      {#if user.picture}
                        <img src={user.picture} alt="" class="avatar-img" />
                      {:else}
                        <span class="avatar-initials">{(user.name || user.email).charAt(0).toUpperCase()}</span>
                      {/if}
                    </div>
                    <div class="member-result-info">
                      <span class="member-result-name">{user.name || user.email}</span>
                      {#if user.name}
                        <span class="member-result-email">{user.email}</span>
                      {/if}
                    </div>
                    <button
                      class="member-add-btn"
                      onclick={() => {
                        showMembersModal = true;
                        memberSearchQuery = '';
                        memberSearchResults = [];
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                      {$_('projects.add')}
                    </button>
                  </div>
                {/each}
              </div>
            {/if}
          </div>

          <!-- Member list -->
          {#if loadingMembers}
            <div class="loading-state compact">
              <div class="loading-spinner small"></div>
              <span>{$_('projects.loadingMembers')}</span>
            </div>
          {:else if members.length === 0}
            <div class="glass-empty-card">
              <div class="empty-icon-large">👥</div>
              <h3 class="empty-title">{$_('projects.noMembersYet')}</h3>
              <p class="empty-description">{$_('projects.noMembersDesc')}</p>
              <button
                class="empty-action-btn btn-primary"
                onclick={() => showMembersModal = true}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                {$_('projects.addMembers')}
              </button>
            </div>
          {:else}
            <div class="member-list">
              {#each members as member (member.id)}
                <div class="member-card glass">
                  <div class="member-avatar">
                    {#if member.picture}
                      <img src={member.picture} alt="" class="avatar-img" />
                    {:else}
                      <span class="avatar-initials">{(member.name || member.email).charAt(0).toUpperCase()}</span>
                    {/if}
                  </div>
                  <div class="member-info">
                    <span class="member-name">{member.name || member.email}</span>
                    <div class="member-meta">
                      {#if member.name}
                        <span class="member-email">{member.email}</span>
                        <span class="bullet">&middot;</span>
                      {/if}
                      <span class="member-role-tag tag" class:owner-tag={member.role === 'owner'} class:member-tag={member.role !== 'owner'}>
                        {member.role}
                      </span>
                      <span class="bullet">&middot;</span>
                      <span class="member-joined">{$_('projects.joinedOn', { values: { date: formatDate(member.joinedAt) } })}</span>
                    </div>
                  </div>
                  {#if member.role !== 'owner'}
                    <button
                      class="source-delete-btn"
                      onclick={() => requestRemoveMember(member)}
                      disabled={removingMemberId === member.id}
                      title={$_('projects.removeMember')}
                    >
                      {#if removingMemberId === member.id}
                        <div class="loading-spinner tiny"></div>
                      {:else}
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                          <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                      {/if}
                    </button>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        </div>

        <!-- ACTIVITY TAB -->
      {:else if activeTab === "activity"}
        <div class="activity-section">
          {#if activities.length === 0}
            <div class="glass-empty-card">
              <div class="empty-icon-large">📋</div>
              <h3 class="empty-title">{$_('projects.noActivityYet')}</h3>
              <p class="empty-description">{$_('projects.noActivityDesc')}</p>
            </div>
          {:else}
            <div class="activity-timeline">
              {#each activities as event (event.id)}
                <div class="timeline-item">
                  <div class="timeline-marker">
                    <span class="timeline-icon">{event.icon}</span>
                    <div class="timeline-line"></div>
                  </div>
                  <div class="timeline-content glass">
                    <div class="timeline-header">
                      <span class="timeline-title">{event.title}</span>
                      <span class="timeline-time">{formatDate(event.timestamp)} · {formatTime(event.timestamp)}</span>
                    </div>
                    <p class="timeline-description">{event.description}</p>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {:else}
    <div class="glass-empty-card">
      <h3 class="empty-title">{$_('projects.projectNotFound')}</h3>
      <button
        class="empty-action-btn btn-primary"
        onclick={() => navigate("/projects")}>{$_('projects.backToProjects')}</button
      >
    </div>
  {/if}
</div>

{#if showEditModal && project}
  <CreateProjectModal
    isOpen={showEditModal}
    onclose={() => showEditModal = false}
    onCreated={handleProjectUpdated}
    editProject={project}
  />
{/if}

{#if showMembersModal && project}
  <AddMemberModal
    isOpen={showMembersModal}
    projectId={project.id}
    projectName={project.name}
    onclose={() => { showMembersModal = false; fetchMembers(); }}
  />
{/if}

{#if confirmRemoveMember}
  <div class="confirm-overlay" onclick={(e) => { if (e.target === e.currentTarget) cancelRemoveMember(); }} onkeydown={(e) => { if (e.key === 'Escape') cancelRemoveMember(); }} role="dialog" aria-modal="true" tabindex="-1">
    <div class="confirm-dialog glass glass--elev1">
      <div class="confirm-icon-wrapper">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <h3 class="confirm-title">{$_('projects.confirmRemoveMember')}</h3>
      <p class="confirm-desc">
        {@html $_('projects.confirmRemoveMemberDesc', { values: { name: confirmRemoveMember.name || confirmRemoveMember.email } })}
      </p>
      <div class="confirm-actions">
        <button class="confirm-cancel-btn" onclick={cancelRemoveMember}>{$_('projects.cancel')}</button>
        <button class="confirm-remove-btn" onclick={confirmAndRemoveMember}>{$_('projects.remove')}</button>
      </div>
    </div>
  </div>
{/if}

{#if confirmDeleteSource}
  <div class="confirm-overlay" onclick={(e) => { if (e.target === e.currentTarget) cancelDeleteSource(); }} onkeydown={(e) => { if (e.key === 'Escape') cancelDeleteSource(); }} role="dialog" aria-modal="true" tabindex="-1">
    <div class="confirm-dialog glass glass--elev1">
      <div class="confirm-icon-wrapper">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <h3 class="confirm-title">{$_('projects.confirmRemoveSource')}</h3>
      <p class="confirm-desc">
        {@html $_('projects.confirmRemoveSourceDesc', { values: { name: confirmDeleteSource.fileName } })}
      </p>
      <div class="confirm-actions">
        <button class="confirm-cancel-btn" onclick={cancelDeleteSource}>{$_('projects.cancel')}</button>
        <button class="confirm-remove-btn" onclick={confirmAndDeleteSource}>{$_('projects.remove')}</button>
      </div>
    </div>
  </div>
{/if}

{#if confirmRemoveChat}
  <div class="confirm-overlay" onclick={(e) => { if (e.target === e.currentTarget) cancelRemoveChat(); }} onkeydown={(e) => { if (e.key === 'Escape') cancelRemoveChat(); }} role="dialog" aria-modal="true" tabindex="-1">
    <div class="confirm-dialog glass glass--elev1">
      <div class="confirm-icon-wrapper">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <h3 class="confirm-title">{$_('projects.confirmRemoveChat')}</h3>
      <p class="confirm-desc">
        {@html $_('projects.confirmRemoveChatDesc', { values: { title: confirmRemoveChat.title } })}
      </p>
      <div class="confirm-actions">
        <button class="confirm-cancel-btn" onclick={cancelRemoveChat}>{$_('projects.cancel')}</button>
        <button class="confirm-remove-btn" onclick={confirmAndRemoveChat}>{$_('projects.remove')}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .project-detail {
    max-width: 960px;
    margin: 0 auto;
    padding: var(--space-xl) var(--space-lg);
    height: 100%;
    overflow-y: auto;
    scrollbar-gutter: stable;
  }

  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-md);
    padding: 8rem 2rem;
    color: var(--text-secondary);
    font-size: 0.9rem;
  }

  .loading-spinner {
    width: 36px;
    height: 36px;
    border: 3px solid var(--glass-stroke-dark);
    border-top: 3px solid var(--brand);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  .loading-spinner.small {
    width: 24px;
    height: 24px;
    border-width: 2.5px;
  }
  .loading-spinner.tiny {
    width: 14px;
    height: 14px;
    border-width: 2px;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* Navigation Back button */
  .navigation-header {
    margin-bottom: var(--space-lg);
  }

  .back-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    color: var(--text-secondary);
    text-decoration: none;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .back-btn:hover {
    color: var(--text-primary);
    transform: translateX(-3px);
  }

  .back-icon {
    transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .back-btn:hover .back-icon {
    transform: translateX(-2px);
  }

  /* Project Header Panel */
  .project-header {
    position: relative;
    padding: var(--space-xl) var(--space-2xl);
    border-radius: var(--radius-lg);
    margin-bottom: var(--space-xl);
    overflow: hidden;
  }

  .header-glow {
    position: absolute;
    top: -100px;
    right: 15%;
    width: 220px;
    height: 220px;
    border-radius: 50%;
    filter: blur(80px);
    opacity: 0.08;
    pointer-events: none;
  }

  @media (prefers-color-scheme: light) {
    .header-glow {
      opacity: 0.05;
    }
  }

  .project-info {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--space-xl);
    z-index: 1;
  }

  .project-icon-wrapper {
    flex-shrink: 0;
  }

  .project-icon {
    width: 60px;
    height: 60px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-md);
    font-size: 1.75rem;
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.15);
  }

  .project-meta {
    flex: 1;
    min-width: 0;
  }

  .meta-badges {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin-bottom: var(--space-xs);
  }

  .meta-badges .tag--primary {
    text-transform: uppercase;
    font-size: 0.6875rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    background: rgba(var(--brand-rgb), 0.1);
    border-color: rgba(var(--brand-rgb), 0.2);
    color: var(--tag-color, var(--brand));
  }

  .meta-badges .tag {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2xs);
    font-size: 0.72rem;
    font-weight: 600;
  }

  .project-name-row {
    display: flex;
    align-items: center;
    gap: var(--space-lg);
    justify-content: space-between;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    flex-shrink: 0;
  }

  .header-action-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    padding: 0.4rem 0.85rem;
    border: 1px solid var(--glass-stroke-dark);
    background: rgba(255, 255, 255, 0.04);
    color: var(--text-secondary);
    font-size: 0.75rem;
    font-weight: 600;
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
    box-shadow: none;
    backdrop-filter: none;
  }

  .header-action-btn:hover:not(:disabled) {
    color: var(--text-primary);
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.15);
    transform: none;
    box-shadow: none;
  }

  .header-action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  @media (prefers-color-scheme: light) {
    .header-action-btn {
      background: rgba(0, 0, 0, 0.03);
      border-color: rgba(0, 0, 0, 0.1);
    }
    .header-action-btn:hover:not(:disabled) {
      background: rgba(0, 0, 0, 0.06);
      border-color: rgba(0, 0, 0, 0.15);
    }
  }

  .project-name {
    font-family: "Outfit", sans-serif;
    font-size: 1.85rem;
    font-weight: 800;
    color: var(--text-primary);
    margin: 0;
    letter-spacing: -0.03em;
    line-height: 1.2;
    background: linear-gradient(
      135deg,
      var(--text-primary) 30%,
      rgba(255, 255, 255, 0.7) 100%
    );
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  @media (prefers-color-scheme: light) {
    .project-name {
      background: none;
      -webkit-text-fill-color: initial;
    }
  }

  .project-desc {
    margin: var(--space-xs) 0 0;
    color: var(--text-secondary);
    font-size: 0.9rem;
    line-height: 1.4;
    opacity: 0.8;
  }

  /* Segmented Control / Tabs Container */
  .tabs-container {
    display: flex;
    justify-content: flex-start;
    margin-bottom: var(--space-xl);
  }

  .pill-group {
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid var(--glass-stroke-dark);
    padding: var(--space-2xs);
    border-radius: var(--radius-lg);
    display: flex;
    gap: 4px;
    width: 100%;
    max-width: 640px;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
  }

  .pill-group__item {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-xs);
    padding: 0.625rem var(--space-md);
    background: transparent;
    border: none;
    border-radius: var(--radius-md);
    color: var(--text-secondary);
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
    box-shadow: none;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .pill-group__item:hover {
    color: var(--text-primary);
    background: rgba(255, 255, 255, 0.04);
  }

  .pill-group__item--active {
    color: var(--text-primary);
    background: rgba(255, 255, 255, 0.08);
    box-shadow:
      0 2px 8px rgba(0, 0, 0, 0.2),
      inset 0 1px 0 rgba(255, 255, 255, 0.08);
  }

  @media (prefers-color-scheme: light) {
    .pill-group {
      background: rgba(0, 0, 0, 0.02);
    }
    .pill-group__item--active {
      background: white;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
    }
  }

  .badge-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: var(--radius-full);
    background: rgba(var(--brand-rgb), 0.12);
    color: var(--brand);
    font-size: 0.65rem;
    font-weight: 800;
    border: 1px solid rgba(var(--brand-rgb), 0.2);
  }

  .tab-content {
    animation: tabFadeIn 0.3s ease;
  }

  @keyframes tabFadeIn {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Chats Section */
  .search-bar {
    position: relative;
    margin-bottom: var(--space-lg);
    display: flex;
    align-items: center;
  }

  .search-icon {
    position: absolute;
    left: var(--space-md);
    color: var(--text-secondary);
    opacity: 0.6;
    pointer-events: none;
  }

  .search-input {
    width: 100%;
    padding: 0.75rem 1rem 0.75rem 2.5rem;
    border: 1px solid var(--glass-stroke-dark);
    border-radius: var(--radius-md);
    background: rgba(255, 255, 255, 0.02);
    color: var(--text-primary);
    font-size: 0.875rem;
    transition: all 0.25s ease;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }

  .search-input:focus {
    outline: none;
    border-color: var(--brand);
    box-shadow: 0 0 0 3px rgba(var(--brand-rgb), 0.15);
    background: rgba(255, 255, 255, 0.04);
  }

  .chats-header-actions {
    display: flex;
    justify-content: flex-end;
    margin-bottom: var(--space-md);
  }

  .new-chat-action-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    padding: 0.5rem 1rem;
    font-size: 0.8125rem;
    font-weight: 600;
    border-radius: var(--radius-md);
    cursor: pointer;
  }

  .empty-search-info {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-xl);
    color: var(--text-secondary);
    font-size: 0.875rem;
    border-radius: var(--radius-md);
    border: 1px solid var(--glass-stroke-dark);
  }

  .empty-search-info p {
    margin: 0;
  }

  /* Chats list visual */
  .chat-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .chat-card {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-md) var(--space-lg);
    width: 100%;
    border-radius: var(--radius-md);
    border: 1px solid var(--glass-stroke-dark);
    cursor: pointer;
    text-align: left;
    color: inherit;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .chat-card:hover {
    transform: translateY(-2px);
    border-color: rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.03);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.08),
      0 8px 24px rgba(0, 0, 0, 0.2);
  }

  .chat-card-icon {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    flex-shrink: 0;
    border: 1px solid rgba(255, 255, 255, 0.04);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .chat-card-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .chat-card-title {
    font-size: 0.9375rem;
    font-weight: 700;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .chat-card-preview {
    font-size: 0.78rem;
    color: var(--text-secondary);
    opacity: 0.8;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .chat-card-meta {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
    flex-shrink: 0;
  }

  .meta-row {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    font-size: 0.72rem;
    color: var(--text-secondary);
    opacity: 0.6;
  }

  .chat-card-count.pill {
    padding: 2px 7px;
    font-weight: 700;
  }

  .chat-card-arrow {
    color: var(--text-secondary);
    opacity: 0.4;
    transition: all 0.25s ease;
    flex-shrink: 0;
  }

  .chat-card:hover .chat-card-arrow {
    opacity: 0.85;
    transform: translateX(3px);
  }

  /* Sources Tab Styling */
  .upload-zone-wrapper {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-2xl) var(--space-xl);
    border: 2.5px dashed var(--glass-stroke-dark);
    border-radius: var(--radius-lg);
    background: rgba(255, 255, 255, 0.01);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    cursor: pointer;
    text-align: center;
  }

  .upload-zone-wrapper:hover {
    border-color: rgba(255, 255, 255, 0.15);
    background: rgba(255, 255, 255, 0.02);
  }

  .upload-zone-wrapper.drag-over {
    border-color: var(--brand);
    background: rgba(var(--brand-rgb), 0.06);
    box-shadow: 0 0 24px rgba(var(--brand-rgb), 0.1);
  }

  .upload-zone-wrapper.uploading {
    pointer-events: none;
    opacity: 0.8;
  }

  .upload-icon-container {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid var(--glass-stroke-dark);
    color: var(--text-secondary);
    opacity: 0.8;
    margin-bottom: var(--space-xs);
    transition: all 0.3s ease;
  }

  .upload-zone-wrapper:hover .upload-icon-container {
    color: var(--text-primary);
    background: rgba(255, 255, 255, 0.05);
    transform: translateY(-2px);
  }

  .upload-text {
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .upload-hint {
    font-size: 0.78rem;
    color: var(--text-secondary);
    opacity: 0.7;
    max-width: 320px;
    margin-bottom: var(--space-xs);
  }

  .browse-btn-label {
    margin-top: var(--space-xs);
  }

  .source-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    margin-top: var(--space-xl);
  }

  .source-card {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-md);
    border-radius: var(--radius-md);
    border: 1px solid var(--glass-stroke-dark);
    transition: all 0.25s ease;
  }

  .source-card:hover {
    background: rgba(255, 255, 255, 0.02);
    border-color: rgba(255, 255, 255, 0.1);
  }

  .source-icon-badge {
    width: 42px;
    height: 42px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid var(--glass-stroke-dark);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
    flex-shrink: 0;
  }

  .source-icon {
    font-size: 1.35rem;
  }

  .source-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .source-name {
    font-size: 0.875rem;
    font-weight: 700;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .source-meta {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    font-size: 0.72rem;
    color: var(--text-secondary);
    opacity: 0.7;
  }

  .size-tag.tag {
    padding: 1px 6px;
    font-weight: 700;
  }

  .origin-tag.tag {
    padding: 1px 6px;
    font-weight: 600;
    font-size: 0.68rem;
    letter-spacing: 0.03em;
  }

  .artifact-tag {
    background: rgba(236, 72, 153, 0.12);
    color: #ec4899;
    border: 1px solid rgba(236, 72, 153, 0.25);
  }

  .uploaded-tag {
    background: rgba(59, 130, 246, 0.12);
    color: #3b82f6;
    border: 1px solid rgba(59, 130, 246, 0.25);
  }

  .bullet {
    opacity: 0.5;
  }

  .source-delete-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    background: transparent;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    flex-shrink: 0;
    box-shadow: none;
    backdrop-filter: none;
  }

  .source-delete-btn:hover:not(:disabled) {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
    box-shadow: none;
  }

  .source-delete-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .empty-sources-info {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-lg) var(--space-xl);
    border-radius: var(--radius-md);
    border: 1px solid var(--glass-stroke-dark);
    margin-top: var(--space-xl);
    color: var(--text-secondary);
    font-size: 0.8125rem;
  }

  .empty-sources-info svg {
    opacity: 0.4;
    flex-shrink: 0;
  }

  .empty-sources-info p {
    margin: 0;
    line-height: 1.4;
    opacity: 0.8;
  }

  /* Tools Tab Styling */
  .tools-desc-wrapper {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-md) var(--space-lg);
    border-radius: var(--radius-md);
    border: 1px solid var(--glass-stroke-dark);
    margin-bottom: var(--space-xl);
    font-size: 0.8125rem;
    color: var(--text-secondary);
  }

  .tools-desc-wrapper svg {
    color: var(--brand);
    flex-shrink: 0;
  }

  .tools-desc-wrapper span {
    line-height: 1.4;
    opacity: 0.9;
  }

  .server-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .server-card {
    border-radius: var(--radius-lg);
    border: 1px solid var(--glass-stroke-dark);
    overflow: hidden;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .server-card:hover {
    border-color: rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.02);
  }

  .server-card.enabled {
    border-color: rgba(var(--brand-rgb), 0.3);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.08),
      0 0 15px rgba(var(--brand-rgb), 0.03);
  }

  .server-header {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .server-main {
    flex: 1;
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-md) var(--space-lg);
    background: transparent;
    border: none;
    cursor: pointer;
    color: inherit;
    text-align: start;
    min-width: 0;
    box-shadow: none;
    backdrop-filter: none;
    border-radius: 0;
  }

  .server-main:hover {
    background: transparent;
    transform: none;
    box-shadow: none;
  }

  .server-icon-img {
    width: 36px;
    height: 36px;
    border-radius: var(--radius-sm);
    object-fit: contain;
    flex-shrink: 0;
    border: 1px solid rgba(255, 255, 255, 0.06);
  }

  .server-icon-fallback {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    background: var(--btn-tertiary);
    color: var(--text-secondary);
    flex-shrink: 0;
    border: 1px solid rgba(255, 255, 255, 0.04);
  }

  .server-icon-fallback.connected {
    background: rgba(var(--brand-rgb), 0.12);
    color: var(--brand);
  }

  .server-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .server-name {
    font-size: 0.9375rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .server-meta {
    font-size: 0.72rem;
    color: var(--text-secondary);
    opacity: 0.8;
    display: flex;
    align-items: center;
    gap: var(--space-xs);
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--text-secondary);
    opacity: 0.5;
    flex-shrink: 0;
  }

  .status-dot.connected {
    background: #10b981;
    opacity: 1;
    box-shadow: 0 0 8px rgba(16, 185, 129, 0.5);
    animation: statusPulse 2s infinite;
  }

  @keyframes statusPulse {
    0% {
      transform: scale(0.95);
      box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4);
    }
    70% {
      transform: scale(1.08);
      box-shadow: 0 0 0 5px rgba(16, 185, 129, 0);
    }
    100% {
      transform: scale(0.95);
      box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
    }
  }

  .status-text {
    font-weight: 500;
  }

  .transport-tag.tag {
    padding: 1px 6px;
    text-transform: uppercase;
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.02em;
  }

  .expand-icon {
    color: var(--text-secondary);
    opacity: 0.5;
    flex-shrink: 0;
    transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .expand-icon.expanded {
    transform: rotate(180deg);
  }

  .server-toggle {
    padding-right: var(--space-lg);
    flex-shrink: 0;
  }

  .toggle-btn {
    background: transparent;
    border: none;
    cursor: pointer;
    padding: var(--space-xs);
    border-radius: var(--radius-sm);
    box-shadow: none;
    backdrop-filter: none;
  }

  .toggle-btn:hover {
    background: transparent;
    transform: none;
    box-shadow: none;
  }

  .toggle-track {
    width: 38px;
    height: 22px;
    border-radius: 11px;
    background: var(--glass-stroke-dark);
    position: relative;
    transition: background 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.2);
  }

  @media (prefers-color-scheme: light) {
    .toggle-track {
      background: var(--btn-quaternary);
    }
  }

  .toggle-track.on {
    background: var(--brand);
  }

  .toggle-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: white;
    transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .toggle-track.on .toggle-thumb {
    transform: translateX(16px);
  }

  .server-desc {
    padding: 0 var(--space-lg) var(--space-md);
    margin: 0;
    font-size: 0.78rem;
    color: var(--text-secondary);
    opacity: 0.75;
    line-height: 1.45;
  }

  .tools-list {
    border-top: 1px solid var(--glass-stroke-dark);
    padding: var(--space-sm) var(--space-lg) var(--space-md);
    background: rgba(0, 0, 0, 0.08);
  }

  @media (prefers-color-scheme: light) {
    .tools-list {
      background: rgba(0, 0, 0, 0.015);
    }
  }

  .tool-item {
    display: flex;
    align-items: flex-start;
    gap: var(--space-sm);
    padding: var(--space-sm) 0;
  }

  .tool-item + .tool-item {
    border-top: 1px solid rgba(255, 255, 255, 0.03);
  }

  @media (prefers-color-scheme: light) {
    .tool-item + .tool-item {
      border-top-color: rgba(0, 0, 0, 0.03);
    }
  }

  .tool-item-icon {
    color: var(--brand-teal);
    flex-shrink: 0;
    margin-top: 2px;
  }

  .tool-item-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .tool-item-name {
    font-size: 0.8125rem;
    font-weight: 700;
    color: var(--text-primary);
    font-family: "SF Mono", "Fira Code", monospace;
  }

  .tool-item-desc {
    font-size: 0.75rem;
    color: var(--text-secondary);
    opacity: 0.7;
    line-height: 1.4;
  }

  /* Instructions Card Section */
  .instructions-card {
    padding: var(--space-xl) var(--space-2xl);
    border-radius: var(--radius-lg);
    border: 1px solid var(--glass-stroke-dark);
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .instructions-info-text {
    font-size: 0.8125rem;
    color: var(--text-secondary);
    opacity: 0.85;
    line-height: 1.5;
    margin: 0;
  }

  .editor-wrapper {
    position: relative;
    border-radius: var(--radius-md);
    border: 1px solid var(--glass-stroke-dark);
    overflow: hidden;
    background: rgba(255, 255, 255, 0.01);
    transition: border-color 0.25s ease;
  }

  .editor-wrapper:focus-within {
    border-color: var(--brand);
    box-shadow: 0 0 0 3px rgba(var(--brand-rgb), 0.12);
  }

  .instructions-editor-textarea {
    width: 100%;
    border: none;
    background: transparent;
    padding: var(--space-lg);
    color: var(--text-primary);
    font-size: 0.875rem;
    line-height: 1.6;
    resize: vertical;
    min-height: 220px;
    font-family: inherit;
  }

  .instructions-editor-textarea:focus {
    outline: none;
  }

  .instructions-editor-textarea::placeholder {
    color: var(--text-secondary);
    opacity: 0.4;
  }

  .instructions-action-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .char-count-badge.tag {
    padding: var(--space-xs) var(--space-md);
    font-weight: 700;
  }

  .char-count-badge.warn {
    color: #eab308;
    background: rgba(234, 179, 8, 0.1);
    border-color: rgba(234, 179, 8, 0.25);
  }

  .save-instructions-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-sm);
    padding: 0.625rem 1.4rem;
    font-size: 0.8125rem;
    font-weight: 700;
    cursor: pointer;
    background: var(--brand);
    color: white;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.15),
      0 4px 12px rgba(var(--brand-rgb), 0.2);
  }

  .save-instructions-btn:hover:not(:disabled) {
    background: var(--brand-hover);
    transform: translateY(-1px);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.2),
      0 6px 18px rgba(var(--brand-rgb), 0.3);
  }

  .save-instructions-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }

  /* Glass Empty Card Illustration System */
  .glass-empty-card {
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
    background: rgba(255, 255, 255, 0.035);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.12),
      0 16px 48px rgba(0, 0, 0, 0.45);
  }

  .glow-container {
    position: relative;
    width: 140px;
    height: 140px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: var(--space-sm);
  }

  .glow-effect {
    position: absolute;
    width: 90px;
    height: 90px;
    border-radius: 50%;
    background: radial-gradient(
      circle,
      rgba(var(--brand-rgb), 0.15) 0%,
      transparent 70%
    );
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
    0%,
    100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-6px);
    }
  }

  @keyframes svg-pulse {
    0%,
    100% {
      transform: scale(0.95);
      opacity: 0.7;
    }
    50% {
      transform: scale(1.05);
      opacity: 1;
    }
  }

  @keyframes svg-spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes svg-float-particle-1 {
    0%,
    100% {
      transform: translate(0, 0);
    }
    50% {
      transform: translate(4px, -8px);
      opacity: 0.8;
    }
  }

  @keyframes svg-float-particle-2 {
    0%,
    100% {
      transform: translate(0, 0);
    }
    50% {
      transform: translate(-6px, 6px);
      opacity: 0.7;
    }
  }

  @keyframes svg-float-particle-3 {
    0%,
    100% {
      transform: translate(0, 0);
    }
    50% {
      transform: translate(5px, 5px);
      opacity: 0.9;
    }
  }

  .empty-title {
    font-family: "Outfit", sans-serif;
    font-size: 1.3rem;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0;
    letter-spacing: -0.015em;
  }

  .empty-description {
    font-size: 0.85rem;
    line-height: 1.5;
    color: var(--text-secondary);
    opacity: 0.75;
    margin: 0 var(--space-md);
  }

  .empty-action-btn {
    margin-top: var(--space-xs);
    display: inline-flex;
    align-items: center;
    gap: var(--space-sm);
    padding: 0.75rem 1.6rem;
    border-radius: var(--radius-md);
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
  }

  .project-chat-input-wrapper {
    width: 100%;
    margin-top: var(--space-md);
    margin-bottom: var(--space-lg);
  }

  .project-metadata-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-md);
    margin-top: var(--space-md);
    padding-top: var(--space-md);
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    font-size: 0.8rem;
    color: var(--text-secondary);
  }

  .metadata-item {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
  }

  .metadata-label {
    font-weight: 500;
    opacity: 0.6;
  }

  .metadata-value {
    color: var(--text-primary);
    font-weight: 600;
  }

  .metadata-divider {
    width: 1px;
    height: 12px;
    background: rgba(255, 255, 255, 0.15);
  }

  /* Activity Timeline */
  .activity-section {
    display: flex;
    flex-direction: column;
  }

  .activity-timeline {
    display: flex;
    flex-direction: column;
    gap: 0;
    position: relative;
  }

  .timeline-item {
    display: flex;
    gap: var(--space-md);
    position: relative;
    min-height: 72px;
  }

  .timeline-item:last-child .timeline-line {
    display: none;
  }

  .timeline-marker {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex-shrink: 0;
    width: 36px;
  }

  .timeline-icon {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid var(--glass-stroke-dark);
    font-size: 0.9rem;
    z-index: 1;
    flex-shrink: 0;
  }

  .timeline-line {
    width: 2px;
    flex: 1;
    background: linear-gradient(to bottom, var(--glass-stroke-dark), transparent);
    margin-top: 4px;
  }

  .timeline-content {
    flex: 1;
    padding: var(--space-md);
    border-radius: var(--radius-md);
    border: 1px solid var(--glass-stroke-dark);
    margin-bottom: var(--space-md);
    transition: border-color 0.2s ease;
  }

  .timeline-content:hover {
    border-color: rgba(var(--brand-rgb), 0.25);
  }

  .timeline-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm);
    margin-bottom: var(--space-xs);
  }

  .timeline-title {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .timeline-time {
    font-size: 0.72rem;
    color: var(--text-secondary);
    opacity: 0.65;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .timeline-description {
    font-size: 0.8rem;
    color: var(--text-secondary);
    line-height: 1.45;
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .empty-icon-large {
    font-size: 2.5rem;
    margin-bottom: var(--space-sm);
  }

  /* Members Tab */
  .members-section {
    display: flex;
    flex-direction: column;
  }

  .member-search-wrapper {
    padding: var(--space-lg) var(--space-xl);
    border-radius: var(--radius-lg);
    border: 1px solid var(--glass-stroke-dark);
    margin-bottom: var(--space-xl);
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .member-search-header {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    font-size: 0.8125rem;
    color: var(--text-secondary);
  }

  .member-search-header svg {
    color: var(--brand);
    flex-shrink: 0;
  }

  .member-search-bar {
    position: relative;
    display: flex;
    align-items: center;
  }

  .member-search-status {
    padding: var(--space-md);
    font-size: 0.82rem;
    color: var(--text-secondary);
    text-align: center;
  }

  .member-search-results {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 220px;
    overflow-y: auto;
  }

  .member-search-result-row {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-sm) var(--space-md);
    border: 1px solid var(--glass-stroke-dark);
    border-radius: var(--radius-md);
    background: rgba(255, 255, 255, 0.02);
    transition: background 0.15s ease;
  }

  .member-search-result-row:hover {
    background: rgba(255, 255, 255, 0.04);
  }

  .member-result-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .member-result-name {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .member-result-email {
    font-size: 0.72rem;
    color: var(--text-secondary);
    opacity: 0.75;
  }

  .member-add-btn {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    padding: 5px 14px;
    border: none;
    border-radius: var(--radius-md);
    background: var(--brand);
    color: white;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    transition: filter 0.15s ease;
  }

  .member-add-btn:hover {
    filter: brightness(1.1);
  }

  .member-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .member-card {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-md) var(--space-lg);
    border-radius: var(--radius-md);
    border: 1px solid var(--glass-stroke-dark);
    transition: all 0.25s ease;
  }

  .member-card:hover {
    background: rgba(255, 255, 255, 0.02);
    border-color: rgba(255, 255, 255, 0.1);
  }

  .member-avatar,
  .member-avatar-sm {
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    flex-shrink: 0;
    overflow: hidden;
    border: 1px solid var(--glass-stroke-dark);
  }

  .member-avatar {
    width: 42px;
    height: 42px;
    font-size: 1.1rem;
  }

  .member-avatar-sm {
    width: 32px;
    height: 32px;
    font-size: 0.85rem;
  }

  .avatar-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .avatar-initials {
    font-weight: 700;
    color: var(--brand);
    background: rgba(var(--brand-rgb), 0.12);
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .member-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .member-name {
    font-size: 0.9375rem;
    font-weight: 700;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .member-meta {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    font-size: 0.72rem;
    color: var(--text-secondary);
    opacity: 0.8;
  }

  .member-email {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .member-role-tag.tag {
    padding: 1px 6px;
    font-weight: 600;
    font-size: 0.68rem;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }

  .owner-tag {
    background: rgba(234, 179, 8, 0.12);
    color: #eab308;
    border: 1px solid rgba(234, 179, 8, 0.25);
  }

  .member-tag {
    background: rgba(59, 130, 246, 0.12);
    color: #3b82f6;
    border: 1px solid rgba(59, 130, 246, 0.25);
  }

  .member-joined {
    white-space: nowrap;
  }

  /* Confirmation Dialog */
  .confirm-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    animation: fadeIn 0.15s ease;
  }

  .confirm-dialog {
    max-width: 380px;
    width: 90%;
    padding: var(--space-xl) var(--space-2xl);
    border-radius: var(--radius-lg);
    border: 1px solid var(--glass-stroke-dark);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-md);
    text-align: center;
    animation: scaleIn 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes scaleIn {
    from { opacity: 0; transform: scale(0.95); }
    to { opacity: 1; transform: scale(1); }
  }

  .confirm-icon-wrapper {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
    border: 1px solid rgba(239, 68, 68, 0.2);
  }

  .confirm-title {
    font-family: "Outfit", sans-serif;
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0;
  }

  .confirm-desc {
    font-size: 0.85rem;
    color: var(--text-secondary);
    line-height: 1.5;
    margin: 0;
  }

  .confirm-actions {
    display: flex;
    gap: var(--space-sm);
    width: 100%;
    margin-top: var(--space-sm);
  }

  .confirm-cancel-btn,
  .confirm-remove-btn {
    flex: 1;
    padding: 0.6rem 1rem;
    border-radius: var(--radius-md);
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .confirm-cancel-btn {
    border: 1px solid var(--glass-stroke-dark);
    background: transparent;
    color: var(--text-primary);
  }

  .confirm-cancel-btn:hover {
    background: var(--btn-secondary);
    border-color: var(--glass-stroke-light);
  }

  .confirm-remove-btn {
    border: none;
    background: #ef4444;
    color: white;
  }

  .confirm-remove-btn:hover {
    background: #dc2626;
  }

  /* Responsive styling */
  @media (max-width: 768px) {
    .metadata-divider {
      display: none;
    }

    .project-metadata-bar {
      gap: var(--space-xs) var(--space-md);
    }

    .project-detail {
      padding: var(--space-md);
    }

    .project-header {
      padding: var(--space-lg);
    }

    .project-info {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-md);
    }

    .pill-group {
      max-width: 100%;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }

    .pill-group__item {
      padding: 0.5rem var(--space-sm);
      white-space: nowrap;
    }

    .chat-card {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-sm);
      padding: var(--space-md);
    }

    .chat-card-meta {
      flex-direction: row;
      justify-content: space-between;
      width: 100%;
      align-items: center;
    }

    .chat-card-arrow {
      display: none;
    }

    .source-card {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-sm);
    }

    .source-delete-btn {
      align-self: flex-end;
    }
  }
</style>
