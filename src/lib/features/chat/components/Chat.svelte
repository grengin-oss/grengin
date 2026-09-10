<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { onMount, tick } from "svelte";
  import ChatMessage from "./ChatMessage.svelte";
  import MessageInput from "./MessageInput.svelte";
  import TypingIndicator from "./TypingIndicator.svelte";
  import ArtifactPanel from "./ArtifactPanel.svelte";
  import MessageScrollNavigator from "./MessageScrollNavigator.svelte";
  import type { ArtifactItem, StreamedArtifact } from "../artifacts";
  import type {
    MergedToolResult,
    ToolCall,
    ToolResult,
    WebSearchResult,
  } from "../../../types/toolCall";
  import type {
    BudgetWarningMessage,
    ChatMessage as ChatMessageType,
    McpAuthRequest,
  } from "../../../types/chat";
  import {
    sendMessage,
    getConversation,
    getChatMcpServers,
    type UploadedFile,
  } from "../../../api/chatApi";
  import type { ProviderInfo, ModelInfo } from "../../../api/models";
  import { getModels, isImageModel, findModel } from "../../../api/models";
  import {
    persistLastUsedModel,
    resolveDefaultModel,
  } from "../modelPreferences";
  import type { MCPServer } from "../../../admin/types.js";
  import { getMcpServers } from "../../../api/admin/mcpServers.js";
  import { setPageTitle } from "../../../utils/pageTitle";
  import {
    linkProjectToConversation,
    getProjectDetail,
  } from "../../../api/projectsApi";
  import { linkSkill } from "../../../api/skills.js";
  import { _ } from "svelte-i18n";
  import { ApiError } from "../../../api/client";
  import { getLocalizedError } from "../../../utils/errorLocalization";
  import {
    setChatTopBar,
    clearChatTopBar,
  } from "../../../components/layout/index.js";

  // The top bar renders the conversation title and a status badge; both are
  // facts this page already holds, so they are published rather than refetched.
  let chatVisibility = $state<"team" | "private" | null>(null);

  $effect(() => {
    setChatTopBar({
      title: conversationTitle,
      // A model is "approved" when it resolves in the permitted model list the
      // org exposes; while that list is still loading we assert nothing.
      approvedModel: loadingModels
        ? null
        : providers.length > 0
          ? !!findModel(providers, selectedModel)
          : null,
      visibility: chatVisibility,
    });
  });

  // Leave the bar with nothing to show once the chat page goes away.
  $effect(() => {
    return () => clearChatTopBar();
  });

  // Suggestion cards from the empty-state design. Clicking one drops its prompt
  // into the composer instead of sending, so the user can edit before sending.
  // Empty-state card glyphs: bar chart, spark, verified check. All three are
  // 18x18 with a 1.5 round stroke, so only the path data differs — the shared
  // svg/stroke attributes live in the markup and the tile supplies the colour
  // through `currentColor` (".sug-card__icon" sets --gx-org-brand-alt).
  const SUGGESTION_ICONS = {
    synthesize: "M3.74951 15.75V11.25M9.00011 15.75V2.25M14.2507 15.75V6.75",
    brainstorm:
      "M2.59928 10.3853C2.71948 10.4607 2.85861 10.5005 3.00052 10.5H8.24993C8.37123 10.4997 8.49082 10.5287 8.59844 10.5847C8.70605 10.6407 8.79848 10.7219 8.86779 10.8215C8.93711 10.9211 8.98124 11.036 8.9964 11.1563C9.01157 11.2767 8.99731 11.399 8.95485 11.5126L7.51501 16.0279C7.49246 16.1099 7.49845 16.1971 7.53201 16.2753C7.56557 16.3535 7.6247 16.4179 7.6997 16.458C7.77469 16.4981 7.8611 16.5116 7.94473 16.4961C8.02836 16.4806 8.10425 16.4372 8.15994 16.3729L15.5841 8.72244C15.6735 8.61222 15.7298 8.47888 15.7465 8.33793C15.7631 8.19697 15.7394 8.05418 15.6782 7.92615C15.6169 7.79812 15.5206 7.6901 15.4004 7.61464C15.2802 7.53918 15.1411 7.49939 14.9992 7.49987H9.74976C9.62846 7.50026 9.50887 7.47122 9.40126 7.41523C9.29364 7.35925 9.20122 7.27799 9.1319 7.17842C9.06259 7.07885 9.01845 6.96396 9.00329 6.84359C8.98813 6.72321 9.00239 6.60096 9.04484 6.48731L10.4847 1.97204C10.5072 1.89002 10.5012 1.80277 10.4677 1.72461C10.4341 1.64644 10.375 1.58201 10.3 1.54189C10.225 1.50177 10.1386 1.48834 10.055 1.50381C9.97133 1.51928 9.89544 1.56273 9.83975 1.62702L2.41559 9.27747C2.32618 9.3877 2.26988 9.52104 2.25323 9.66199C2.23658 9.80295 2.26025 9.94573 2.32151 10.0738C2.38276 10.2018 2.47909 10.3098 2.59928 10.3853Z",
    facts:
      "M16.35 7.50011C16.6925 9.18109 16.4484 10.9287 15.6584 12.4515C14.8683 13.9742 13.5801 15.1802 12.0086 15.8681C10.4371 16.5561 8.67719 16.6845 7.02244 16.2319C5.3677 15.7793 3.91811 14.7732 2.91543 13.3812C1.91274 11.9892 1.41756 10.2955 1.51247 8.58265C1.60737 6.86977 2.28663 5.24118 3.43696 3.96849C4.58729 2.6958 6.13916 1.85594 7.83377 1.58895C9.52838 1.32197 11.2633 1.64401 12.7492 2.50136M6.74951 8.24976L8.99951 10.4998L16.4995 2.99976",
  } as const;

  let suggestionCards = $derived(
    (["synthesize", "brainstorm", "facts"] as const).map((id) => ({
      id,
      icon: SUGGESTION_ICONS[id],
      title: $_(`chat.emptyState.suggestions.${id}.title`),
      body: $_(`chat.emptyState.suggestions.${id}.body`),
      prompt: $_(`chat.emptyState.suggestions.${id}.prompt`),
    })),
  );

  let messages = $state<ChatMessageType[]>([]);
  let isLoading = $state(false);
  let isTyping = $state(false);
  let error = $state<ApiError | null>(null);
  let conversationId = $state<string | null>(null);
  // Title of the open conversation — mirrored into the browser tab title.
  let conversationTitle = $state<string | null>(null);
  // Track if we're still loading the initial conversation
  let isLoadingConversation = $state(
    typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).has("chatId"),
  );
  let messagesContainer = $state<HTMLDivElement | undefined>(undefined);
  let messageInput = $state<MessageInput | undefined>(undefined);
  let currentStreamingMessage = $state<ChatMessageType | null>(null);
  let autoScrollEnabled = true;
  let selectedModel = $state("gpt-5.2");
  let selectedProvider = $state("openai");
  let selectedModelInfo = $state<ProviderInfo | undefined>(undefined);
  let webSearchEnabled = $state(false);
  let mcpServers = $state<MCPServer[]>([]);
  let selectedMcpServers = $state<string[]>([]);
  let loadingMcpServers = $state(false);
  let mcpServersError = $state<string | null>(null);
  // Project to link once a new conversation is created (chat started from a project workspace).
  let pendingProjectId = $state<string | null>(null);
  // Skills selected in the composer before the conversation exists; linked on first send.
  let pendingSkillIds = $state<string[]>([]);

  // Link a freshly-created conversation to the originating project (many-to-many). Runs once.
  async function linkPendingProject(newConversationId: string) {
    if (!pendingProjectId) return;
    const projectId = pendingProjectId;
    pendingProjectId = null;
    try {
      await linkProjectToConversation(newConversationId, projectId);
      window.dispatchEvent(new CustomEvent("refreshChatHistory"));
    } catch (err) {
      console.error("Failed to link conversation to project:", err);
    }
  }

  // Link skills chosen before the conversation existed. Runs once per new conversation.
  async function linkPendingSkills(newConversationId: string) {
    if (pendingSkillIds.length === 0) return;
    const ids = pendingSkillIds;
    pendingSkillIds = [];
    await Promise.all(
      ids.map((skillId) =>
        linkSkill(newConversationId, skillId).catch((err) =>
          console.error("Failed to link skill to conversation:", err),
        ),
      ),
    );
  }

  // Artifact panel state. Several artifacts can exist at once (a response may
  // produce more than one), reachable via tabs — but only ONE is ever shown
  // automatically; the rest are opened by clicking their card/tab (ENGG-387).
  let panelArtifacts = $state<ArtifactItem[]>([]);
  let panelActiveIndex = $state(0);
  let showArtifactPanel = $state(false);
  // Ids of artifacts the user has closed ("viewed"). A viewed artifact never
  // auto-reopens — only an explicit click brings it back (ENGG-387 Bug 1).
  let viewedArtifactIds = new Set<string>();
  // Whether we've already auto-opened the panel this generation. Enforces
  // "auto-show only one artifact in automatic loading".
  let autoShownArtifact = false;
  // All artifacts streaming in via artifact_* SSE events, keyed by id in arrival
  // order, so the panel can offer tabs across them.
  let streamingArtifacts = new Map<string, StreamedArtifact>();

  // Reset all per-generation artifact accumulation/UI state. Called at the start
  // of every send/regenerate so a fresh generation starts clean.
  function resetArtifactState() {
    streamingArtifacts = new Map();
    panelArtifacts = [];
    panelActiveIndex = 0;
    viewedArtifactIds = new Set();
    autoShownArtifact = false;
  }

  // Feed a streamed artifact into the side panel live.
  function applyStreamingArtifact(artifact: {
    id?: string;
    title: string;
    contentType: string;
    content: string;
    streaming?: boolean;
  }) {
    const key = artifact.id ?? `__artifact_${streamingArtifacts.size}`;
    const isNew = !streamingArtifacts.has(key);
    streamingArtifacts.set(key, {
      id: artifact.id ?? key,
      title: artifact.title,
      contentType: artifact.contentType,
      content: artifact.content,
      streaming: artifact.streaming ?? false,
    });

    panelArtifacts = [...streamingArtifacts.values()].map((a) => {
      const type =
        a.contentType === "text/markdown"
          ? ("markdown" as const)
          : ("html" as const);
      return {
        id: a.id,
        title:
          a.title || (type === "html" ? "HTML Artifact" : "Markdown Document"),
        code: a.content,
        type,
        streaming: a.streaming,
      };
    });

    // Auto-open the panel for the FIRST artifact only, once per generation, and
    // never for one the user already closed. Subsequent artifacts stay in the
    // tab list but do not steal focus or force the panel back open.
    if (isNew && !autoShownArtifact && !viewedArtifactIds.has(key)) {
      autoShownArtifact = true;
      panelActiveIndex = panelArtifacts.length - 1;
      showArtifactPanel = true;
    }
  }

  function activePanelArtifact(): ArtifactItem | undefined {
    if (panelArtifacts.length === 0) return undefined;
    const i = Math.min(
      Math.max(panelActiveIndex, 0),
      panelArtifacts.length - 1,
    );
    return panelArtifacts[i];
  }

  function handleShowArtifact(artifacts: ArtifactItem[], index: number) {
    panelArtifacts = artifacts;
    panelActiveIndex = index;
    // Explicit open clears any "viewed" mark for that artifact.
    const opened = artifacts[index];
    if (opened?.id) viewedArtifactIds.delete(opened.id);
    showArtifactPanel = true;
  }

  function handleSelectArtifact(index: number) {
    panelActiveIndex = index;
  }

  function handleCloseArtifact() {
    showArtifactPanel = false;
    // Mark the shown artifact as viewed so it won't auto-reopen (Bug 1).
    const current = activePanelArtifact();
    if (current?.id) viewedArtifactIds.add(current.id);
  }

  // Models state
  let providers = $state<ProviderInfo[]>([]);
  let loadingModels = $state(true);
  let modelsError = $state<string | null>(null);

  // Whether the currently selected model generates images (vs. text). Drives the
  // "generating image" progress state and the composer hint. Loaded from the
  // registry — never hardcoded.
  let selectedIsImageModel = $derived(
    isImageModel(findModel(providers, selectedModel)?.model),
  );

  // Browser-tab title. Reflects the open conversation's title, falling back to
  // the app name when no conversation is selected. Updates reactively on rename.
  $effect(() => {
    setPageTitle(conversationTitle);
    return () => setPageTitle(null);
  });

  // Build a meaningful, accessible name/alt for a generated image from the prompt.
  function generatedImageName(prompt: string, index: number): string {
    const base = prompt.trim();
    const label =
      base.length > 0
        ? base.length > 120
          ? base.slice(0, 117) + "…"
          : base
        : $_("chat.message.generatedImageAlt");
    return index > 0 ? `${label} (${index + 1})` : label;
  }

  async function loadModels() {
    loadingModels = true;
    modelsError = null;
    try {
      const response = await getModels();
      providers = response.providers;

      // A brand-new chat may have mounted before the registry finished loading,
      // leaving the composer on the compile-time placeholder. Now that the real
      // models are known, resolve its default (last used → latest available).
      // Keyed off the URL (race-free) rather than conversationId, which is set
      // asynchronously by loadConversationFromUrl().
      const params = new URLSearchParams(window.location.search);
      if (!params.get("chatId") && !params.get("model")) {
        applyDefaultModel();
      }
    } catch (error) {
      console.error("Failed to load models:", error);
      modelsError = $_("chat.errors.failedToLoadModels");
    } finally {
      loadingModels = false;
    }
  }

  // Set the composer to the default model for a new chat: the last-used model
  // if it is still offered, otherwise the latest available model. No-op until
  // the registry has loaded (loadModels re-runs this once providers arrive).
  function applyDefaultModel() {
    const resolved = resolveDefaultModel(providers);
    if (resolved) {
      selectedProvider = resolved.provider.key;
      selectedModel = resolved.model.key;
      selectedModelInfo = resolved.provider;
    }
  }

  async function loadMcpServers() {
    loadingMcpServers = true;
    mcpServersError = null;
    try {
      const response = await getChatMcpServers();
      mcpServers = response.servers;
    } catch (error) {
      console.error("Failed to load connectors:", error);
      mcpServersError = $_("chat.errors.failedToLoadConnectors");
    } finally {
      loadingMcpServers = false;
    }
  }

  async function loadProjectMcpServers(projectId: string) {
    try {
      const detail = await getProjectDetail(projectId);
      if (detail.visibility === "team" || detail.visibility === "private") {
        chatVisibility = detail.visibility;
      }
      if (detail.mcpServers && detail.mcpServers.length > 0) {
        const projectServerIds = detail.mcpServers.map((s) => s.serverId);
        const merged = new Set([...selectedMcpServers, ...projectServerIds]);
        selectedMcpServers = Array.from(merged);
      }
    } catch (err) {
      console.error("Failed to load project MCP servers:", err);
    }
  }

  // Listen for URL changes
  function handleUrlChange() {
    const urlParams = new URLSearchParams(window.location.search);
    const chatId = urlParams.get("chatId");

    if (chatId !== conversationId) {
      loadConversationFromUrl();
    }
  }

  // Update URL with conversation ID
  function updateUrlWithConversationId(id: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("chatId", id);
    window.history.pushState({}, "", url.toString());
  }

  // Handle model selection
  function selectModel(provider: ProviderInfo, model: ModelInfo) {
    selectedProvider = provider.key;
    selectedModel = model.key;
    selectedModelInfo = provider;
    // Remember the choice so future new chats default to it.
    persistLastUsedModel(model.key, provider.key);
  }

  // Handle model removal
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

  function handleBudgetWarning(data: BudgetWarningMessage) {
    let budgetAvailable = parseInt(data.budget_available, 10);
    let description_key = "";
    let solution_key = "";

    if (budgetAvailable > 0) {
      description_key = "chat.errors.budgetAboutToExhaust";
    } else if (data.action === "block") {
      description_key = "chat.errors.budgetExhaustedBlock";
      solution_key = "chat.errors.budgetExhaustedBlockSolution";
    } else {
      description_key = "chat.errors.budgetExhaustedWarn";
    }

    error = new ApiError(200, {
      type: "rich",
      code: 200,
      description: data.message,
      solution: "",
      description_key: description_key,
      solution_key: solution_key,
      params: {},
      external_code: "budget_warning",
    });
  }

  // Auto-scroll to bottom when new messages arrive
  async function scrollToBottom(smooth = true) {
    await tick();
    if (messagesContainer) {
      messagesContainer.scrollTo({
        top: messagesContainer.scrollHeight,
        behavior: smooth ? "auto" : "auto",
      });
    }
  }

  // Handle manual scrolling to detect if user wants to stop auto-scroll
  function handleScroll() {
    if (!messagesContainer || isTyping) return;

    // Check if user is near the bottom (within 100px)
    const isNearBottom =
      messagesContainer.scrollHeight -
        messagesContainer.scrollTop -
        messagesContainer.clientHeight <
      80;
    if (!isNearBottom) {
      autoScrollEnabled = false;
    }
  }

  // Scroll to show the top of the streaming message
  async function scrollToStreamingMessageTop(streamingMessageId: string) {
    await tick();

    if (!messagesContainer || !autoScrollEnabled) return;

    const messageIndex = messages.findIndex((m) => m.id === streamingMessageId);
    const messageElement =
      messagesContainer.querySelectorAll(".message")[messageIndex];

    requestAnimationFrame(async () => {
      await tick();
      if (messageElement && messagesContainer) {
        // Check if the current message height is smaller than visible container height
        const messageHeight = (messageElement as HTMLElement).offsetHeight;
        const containerHeight = messagesContainer.clientHeight;

        if (messageHeight < containerHeight) {
          // Small message: scroll to bottom to show entire message
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
        } else {
          // Large message: use current implementation to keep at top
          const offset = 8;
          const scrollTop =
            messagesContainer.scrollTop +
            (messageElement.getBoundingClientRect().top -
              messagesContainer.getBoundingClientRect().top) -
            offset;
          messagesContainer.scrollTop = Math.max(0, scrollTop);
        }
      }
    });
  }

  async function handleSendMessage(
    content: string,
    uploadedFiles?: UploadedFile[],
    webSearch?: boolean,
  ) {
    if (isLoading) return;

    error = null;
    isLoading = true;
    autoScrollEnabled = true; // Reset auto-scroll when starting new message

    // Add user message
    const userMessage: ChatMessageType = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      timestamp: new Date().toISOString(),
      files:
        uploadedFiles?.map((file) => ({
          id: file.id,
          name: file.name,
          size: file.size,
          type: file.type,
        })) || [],
    };
    messages = [...messages, userMessage];

    // Prepare streaming message
    let pendingStreamingMessage: ChatMessageType | null = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      timestamp: new Date().toISOString(),
      isStreaming: true,
      model: selectedModel,
      toolCalls: [] as ToolCall[],
      toolsResults: [] as ToolResult[],
      mergedWebSearch: null as MergedToolResult | null,
    };

    let messageAddedToArray = $state(false);
    let pendingConversationId = conversationId;
    // How many generated images have arrived for this assistant message (an
    // image model may return more than one — cap is a model property).
    let generatedImageIndex = 0;
    resetArtifactState();
    isTyping = true;
    scrollToBottom();

    // Update ui with a copy of the pending streaming message
    currentStreamingMessage = { ...pendingStreamingMessage };

    // Disables switching conversation while initializing new conversation
    window.dispatchEvent(new CustomEvent("initializingConversation"));

    try {
      await sendMessage({
        message: content,
        conversationId: conversationId || undefined,
        provider: selectedProvider,
        modelName: selectedModel,
        uploadedFiles: uploadedFiles,
        webSearch: webSearch,
        selectedMcpServers,

        onConversationInitialized: ({ newConversationId }) => {
          // Update conversation ID and URL
          if (newConversationId && newConversationId !== conversationId) {
            conversationId = newConversationId;
            pendingConversationId = newConversationId;
            updateUrlWithConversationId(newConversationId);
          }
          if (newConversationId) void linkPendingProject(newConversationId);
          if (newConversationId) void linkPendingSkills(newConversationId);

          // Update loading and typing states
          isLoading = true;
          isTyping = true;

          // Refresh chats list
          window.dispatchEvent(new CustomEvent("refreshChatHistory"));
        },
        onStreamingStart: (messageId) => {
          if (pendingStreamingMessage) {
            messageAddedToArray = true;
            pendingStreamingMessage = {
              ...pendingStreamingMessage,
              id: messageId,
            };
            currentStreamingMessage = { ...pendingStreamingMessage };
            messages = [
              ...messages,
              currentStreamingMessage as ChatMessageType,
            ];

            // Update loading and typing states. For image models there may be no
            // text deltas — keep the existing typing indicator visible until the
            // image_generated event arrives (reuses the standard stream state,
            // no bespoke image spinner).
            isTyping = selectedIsImageModel;
            isLoading = true;

            scrollToStreamingMessageTop(pendingStreamingMessage.id);
          }
        },
        onResponseDelta: (token) => {
          if (pendingStreamingMessage) {
            // Add message to array on first token if not already added
            if (!messageAddedToArray && token.trim()) {
              messages = [...messages, pendingStreamingMessage];
              messageAddedToArray = true;
            }
            if (token.trim()) isTyping = false;

            // Create a new message object with updated content
            pendingStreamingMessage = {
              ...pendingStreamingMessage,
              content: pendingStreamingMessage.content + token,
            };

            // Update the current streaming message
            currentStreamingMessage = { ...pendingStreamingMessage };

            // Update the message in the array
            messages = messages.map((m) =>
              m.id === pendingStreamingMessage?.id
                ? (currentStreamingMessage as ChatMessageType)
                : m,
            );

            isLoading = true;
            scrollToStreamingMessageTop(pendingStreamingMessage.id);
          }
        },
        onBudgetWarning: (data) => {
          if (pendingStreamingMessage) {
            handleBudgetWarning(data);
            isLoading = true;
          }
        },
        onToolCall: (toolCall) => {
          if (pendingStreamingMessage) {
            // Some providers (e.g. Gemini) skip message_start and emit tool_call
            // directly. Ensure the assistant placeholder is in the array so the
            // tool call UI (and any subsequent OAuth prompt) becomes visible.
            if (!messageAddedToArray) {
              messages = [...messages, pendingStreamingMessage];
              messageAddedToArray = true;
            }
            // Merge by tool_id: update existing entry or add new one
            const existingCalls = pendingStreamingMessage.toolCalls || [];
            const existingIndex = existingCalls.findIndex(
              (tc) => tc.tool_id === toolCall.tool_id,
            );
            let updatedToolCalls;
            if (existingIndex >= 0) {
              updatedToolCalls = [...existingCalls];
              updatedToolCalls[existingIndex] = toolCall;
            } else {
              updatedToolCalls = [...existingCalls, toolCall];
            }
            const mergedWebSearch = mergeWebSearchResults(
              updatedToolCalls,
              pendingStreamingMessage.toolsResults || [],
              "running",
            );

            pendingStreamingMessage = {
              ...pendingStreamingMessage,
              toolCalls: updatedToolCalls,
              mergedWebSearch: mergedWebSearch,
            };

            currentStreamingMessage = { ...pendingStreamingMessage };

            // Update the message in the array
            messages = messages.map((m) =>
              m.id === pendingStreamingMessage?.id
                ? (currentStreamingMessage as ChatMessageType)
                : m,
            );

            isLoading = true;
            scrollToStreamingMessageTop(pendingStreamingMessage.id);
          }
        },
        onToolResult: (toolResult) => {
          if (pendingStreamingMessage) {
            // Update tool result
            const updatedToolResults = [
              ...(pendingStreamingMessage.toolsResults || []),
              toolResult,
            ];

            // Mark corresponding tool call as completed/error
            const updatedToolCalls = (
              pendingStreamingMessage.toolCalls || []
            ).map((tc) =>
              tc.tool_id === toolResult.tool_id
                ? {
                    ...tc,
                    status: (toolResult.status === "error"
                      ? "error"
                      : "completed") as import("../../../types/toolCall").ToolCallStatus,
                  }
                : tc,
            );

            const mergedWebSearch = mergeWebSearchResults(
              updatedToolCalls,
              updatedToolResults || [],
              "running",
            );

            pendingStreamingMessage = {
              ...pendingStreamingMessage,
              toolCalls: updatedToolCalls,
              toolsResults: updatedToolResults,
              mergedWebSearch,
            };

            currentStreamingMessage = { ...pendingStreamingMessage };

            // Update the message in the array
            messages = messages.map((m) =>
              m.id === pendingStreamingMessage?.id
                ? (currentStreamingMessage as ChatMessageType)
                : m,
            );

            isLoading = true;
            scrollToStreamingMessageTop(pendingStreamingMessage.id);
          }
        },
        onArtifact: (artifact) => {
          applyStreamingArtifact(artifact);
        },
        onImageGenerated: (image) => {
          if (pendingStreamingMessage) {
            // Ensure the assistant placeholder is in the array (image models may
            // emit no text deltas before the image arrives).
            if (!messageAddedToArray) {
              messages = [...messages, pendingStreamingMessage];
              messageAddedToArray = true;
            }

            // Append the generated image as a regular file so it renders inline
            // via the existing file rendering. A new image never replaces a
            // previous one — each result is appended.
            const generatedFile = {
              id: image.file_id,
              name: generatedImageName(content, generatedImageIndex),
              type: image.content_type || "image/png",
              size: 0,
            };
            generatedImageIndex += 1;

            pendingStreamingMessage = {
              ...pendingStreamingMessage,
              files: [...(pendingStreamingMessage.files || []), generatedFile],
            };

            currentStreamingMessage = { ...pendingStreamingMessage };
            messages = messages.map((m) =>
              m.id === pendingStreamingMessage?.id
                ? (currentStreamingMessage as ChatMessageType)
                : m,
            );

            // Image has arrived — stop the "generating" typing indicator.
            isTyping = false;
            isLoading = true;
            scrollToStreamingMessageTop(pendingStreamingMessage.id);
          }
        },
        onMcpAuthRequired: (authRequest: McpAuthRequest) => {
          if (pendingStreamingMessage) {
            // Some providers (e.g. Gemini) skip message_start and may emit
            // mcp_oauth_required without any prior delta. Ensure the assistant
            // placeholder is in the array so the OAuth connect prompt renders.
            if (!messageAddedToArray) {
              messages = [...messages, pendingStreamingMessage];
              messageAddedToArray = true;
            }
            const existingRequests =
              pendingStreamingMessage.mcpAuthRequests || [];
            const alreadyExists = existingRequests.some(
              (r) => r.server_id === authRequest.server_id,
            );
            if (!alreadyExists) {
              pendingStreamingMessage = {
                ...pendingStreamingMessage,
                mcpAuthRequests: [...existingRequests, authRequest],
              };

              currentStreamingMessage = { ...pendingStreamingMessage };

              messages = messages.map((m) =>
                m.id === pendingStreamingMessage?.id
                  ? (currentStreamingMessage as ChatMessageType)
                  : m,
              );

              isLoading = true;
              scrollToStreamingMessageTop(pendingStreamingMessage.id);
            }
          }
        },
        onDone: async (_data) => {
          if (pendingStreamingMessage) {
            let updatedMergedWebSearch = null;
            if (pendingStreamingMessage.mergedWebSearch) {
              updatedMergedWebSearch = {
                ...pendingStreamingMessage.mergedWebSearch,
                status: "completed",
              };
            }

            // Finalize any tool call that never received a tool_result so the
            // in-progress loader stops spinning after the stream ends.
            const resultIds = new Set(
              (pendingStreamingMessage.toolsResults || []).map(
                (tr) => tr.tool_id,
              ),
            );
            const finalizedToolCalls = (
              pendingStreamingMessage.toolCalls || []
            ).map((tc) =>
              tc.status === "completed" ||
              tc.status === "error" ||
              resultIds.has(tc.tool_id)
                ? tc
                : {
                    ...tc,
                    status:
                      "error" as import("../../../types/toolCall").ToolCallStatus,
                  },
            );

            // Mark all tool calls as completed when the stream ends. Artifacts are
            // NOT inlined/parsed into the message text (ENGG-387). We attach the
            // streamed artifacts as structured metadata so the message renders a
            // card afterwards, mirroring how the backend returns parts.artifacts
            // on reload; the content is fetched by id when opened.
            pendingStreamingMessage = {
              ...pendingStreamingMessage,
              isStreaming: false,
              toolCalls: finalizedToolCalls,
              mergedWebSearch: updatedMergedWebSearch as MergedToolResult,
              artifacts: [...streamingArtifacts.values()].map((a) => ({
                id: a.id,
                title: a.title,
                content_type: a.contentType,
              })),
            };

            currentStreamingMessage = { ...pendingStreamingMessage };

            // Update the message in the array
            messages = messages.map((m) =>
              m.id === pendingStreamingMessage?.id
                ? (currentStreamingMessage as ChatMessageType)
                : m,
            );

            // Streaming finished — clear the per-artifact streaming flag so the
            // panel enables download/save.
            panelArtifacts = panelArtifacts.map((a) => ({
              ...a,
              streaming: false,
            }));
            streamingArtifacts = new Map();
          }
        },
        onError: (errorMessage) => {
          // Store the error - it should be an ApiError instance
          const apiError =
            errorMessage instanceof ApiError
              ? errorMessage
              : new ApiError(
                  500,
                  errorMessage instanceof Error
                    ? errorMessage.message
                    : String(errorMessage),
                );

          error = apiError;
          if (pendingStreamingMessage) {
            // Update the error in the message
            pendingStreamingMessage = {
              ...pendingStreamingMessage,
              error:
                getLocalizedError(apiError, "description", $_) ||
                apiError.description,
              isStreaming: false,
            };

            // Update the message in the array
            currentStreamingMessage = { ...pendingStreamingMessage };
            messages = messages.map((m) =>
              m.id === pendingStreamingMessage?.id
                ? (currentStreamingMessage as ChatMessageType)
                : m,
            );

            isLoading = true;
            scrollToStreamingMessageTop(pendingStreamingMessage.id);
          }
        },
      });
    } catch (err) {
      // Convert all errors to ApiError for consistent handling
      const apiError =
        err instanceof ApiError
          ? err
          : new ApiError(
              500,
              err instanceof Error
                ? err.message
                : $_("chat.errors.failedToSendMessage"),
            );

      error = apiError;
    } finally {
      // Reset states
      isTyping = false;
      isLoading = false;
      currentStreamingMessage = null;
      pendingStreamingMessage = null;

      // Refocus input after exception
      await tick();
      messageInput?.focus();
    }
  }

  function handleEditMessage(id: string, newContent: string) {
    messages = messages.map((msg) =>
      msg.id === id ? { ...msg, content: newContent } : msg,
    );
  }

  function handleMcpAuthStatusChange(
    messageId: string,
    serverId: string,
    status: McpAuthRequest["status"],
  ) {
    messages = messages.map((msg) => {
      if (msg.id !== messageId || !msg.mcpAuthRequests) return msg;
      return {
        ...msg,
        mcpAuthRequests: msg.mcpAuthRequests.map((r) =>
          r.server_id === serverId ? { ...r, status } : r,
        ),
      };
    });
  }

  function handleMcpAuthConnected(messageId: string, serverId: string) {
    messages = messages.map((msg) => {
      if (msg.id !== messageId || !msg.mcpAuthRequests) return msg;
      return {
        ...msg,
        mcpAuthRequests: msg.mcpAuthRequests.map((r) =>
          r.server_id === serverId ? { ...r, status: "connected" as const } : r,
        ),
      };
    });

    // Check if all auth requests for this message are now connected
    const msg = messages.find((m) => m.id === messageId);
    if (msg?.mcpAuthRequests?.every((r) => r.status === "connected")) {
      continueProcessingRequest(messageId);
    }
  }

  function handleMcpAuthError(
    messageId: string,
    serverId: string,
    errorMsg: string,
  ) {
    messages = messages.map((msg) => {
      if (msg.id !== messageId || !msg.mcpAuthRequests) return msg;
      return {
        ...msg,
        mcpAuthRequests: msg.mcpAuthRequests.map((r) =>
          r.server_id === serverId
            ? { ...r, status: "error" as const, error: errorMsg }
            : r,
        ),
      };
    });
  }

  async function continueProcessingRequest(assistantMessageId: string) {
    // Find the user message that preceded this assistant message
    const msgIndex = messages.findIndex((m) => m.id === assistantMessageId);
    if (msgIndex <= 0) return;

    const userMessage = messages[msgIndex - 1];
    if (userMessage?.role !== "user") return;

    let generatedImageIndex = 0;

    // Set up pending streaming message for the existing assistant message
    let pendingStreamingMessage: ChatMessageType | null = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      timestamp: new Date().toISOString(),
      isStreaming: true,
      model: selectedModel,
      toolCalls: [] as ToolCall[],
      toolsResults: [] as ToolResult[],
      mergedWebSearch: null as MergedToolResult | null,
    };

    // Update the assistant message to show processing state
    messages = messages.map((msg) => {
      if (msg.id === assistantMessageId) {
        return { ...pendingStreamingMessage! };
      }
      return msg;
    });

    // Process the original request without creating a new message
    resetArtifactState();
    isLoading = true;
    isTyping = true;
    autoScrollEnabled = true;

    try {
      await sendMessage({
        message: userMessage.content,
        conversationId: conversationId || undefined,
        provider: selectedProvider,
        modelName: selectedModel,
        uploadedFiles: userMessage.files?.map((f) => ({
          id: f.id,
          name: f.name || "",
          size: f.size || 0,
          type: f.type || "",
        })),
        webSearch: webSearchEnabled,
        selectedMcpServers,

        onConversationInitialized: ({ newConversationId }) => {
          if (newConversationId && newConversationId !== conversationId) {
            conversationId = newConversationId;
            updateUrlWithConversationId(newConversationId);
          }
          if (newConversationId) void linkPendingProject(newConversationId);
          if (newConversationId) void linkPendingSkills(newConversationId);
          window.dispatchEvent(new CustomEvent("refreshChatHistory"));
        },
        onStreamingStart: (messageId) => {
          if (pendingStreamingMessage) {
            pendingStreamingMessage = {
              ...pendingStreamingMessage,
              id: messageId,
            };

            // Update the existing assistant message with the real message ID
            messages = messages.map((msg) => {
              if (msg.id === assistantMessageId) {
                return pendingStreamingMessage as ChatMessageType;
              }
              return msg;
            });
          }
          isTyping = false;
          isLoading = true;
        },
        onResponseDelta: (token) => {
          if (pendingStreamingMessage) {
            // Update the pending streaming message content
            pendingStreamingMessage = {
              ...pendingStreamingMessage,
              content: pendingStreamingMessage.content + token,
            };

            // Update the message in the array
            messages = messages.map((m) =>
              m.id === pendingStreamingMessage?.id
                ? (pendingStreamingMessage as ChatMessageType)
                : m,
            );
          }
        },
        onToolCall: (toolCall) => {
          if (pendingStreamingMessage) {
            // Merge by tool_id: update existing entry or add new one
            const existingCalls = pendingStreamingMessage.toolCalls || [];
            const existingIndex = existingCalls.findIndex(
              (tc) => tc.tool_id === toolCall.tool_id,
            );
            let updatedToolCalls;
            if (existingIndex >= 0) {
              updatedToolCalls = [...existingCalls];
              updatedToolCalls[existingIndex] = toolCall;
            } else {
              updatedToolCalls = [...existingCalls, toolCall];
            }
            const mergedWebSearch = mergeWebSearchResults(
              updatedToolCalls,
              pendingStreamingMessage.toolsResults || [],
              "running",
            );

            pendingStreamingMessage = {
              ...pendingStreamingMessage,
              toolCalls: updatedToolCalls,
              mergedWebSearch: mergedWebSearch,
            };

            // Update the message in the array
            messages = messages.map((m) =>
              m.id === pendingStreamingMessage?.id
                ? (pendingStreamingMessage as ChatMessageType)
                : m,
            );
          }
        },
        onToolResult: (toolResult) => {
          if (pendingStreamingMessage) {
            const updatedToolResults = [
              ...(pendingStreamingMessage.toolsResults || []),
              toolResult,
            ];

            // Mark corresponding tool call as completed/error
            const updatedToolCalls = (
              pendingStreamingMessage.toolCalls || []
            ).map((tc) =>
              tc.tool_id === toolResult.tool_id
                ? {
                    ...tc,
                    status: (toolResult.status === "error"
                      ? "error"
                      : "completed") as import("../../../types/toolCall").ToolCallStatus,
                  }
                : tc,
            );

            const mergedWebSearch = mergeWebSearchResults(
              updatedToolCalls,
              updatedToolResults || [],
              "running",
            );

            pendingStreamingMessage = {
              ...pendingStreamingMessage,
              toolCalls: updatedToolCalls,
              toolsResults: updatedToolResults,
              mergedWebSearch,
            };

            // Update the message in the array
            messages = messages.map((m) =>
              m.id === pendingStreamingMessage?.id
                ? (pendingStreamingMessage as ChatMessageType)
                : m,
            );
          }
        },
        onArtifact: (artifact) => {
          applyStreamingArtifact(artifact);
        },
        onImageGenerated: (image) => {
          if (pendingStreamingMessage) {
            const generatedFile = {
              id: image.file_id,
              name: generatedImageName(
                userMessage.content,
                generatedImageIndex,
              ),
              type: image.content_type || "image/png",
              size: 0,
            };
            generatedImageIndex += 1;

            pendingStreamingMessage = {
              ...pendingStreamingMessage,
              files: [...(pendingStreamingMessage.files || []), generatedFile],
            };

            messages = messages.map((m) =>
              m.id === pendingStreamingMessage?.id
                ? (pendingStreamingMessage as ChatMessageType)
                : m,
            );
            isTyping = false;
            isLoading = true;
          }
        },
        onDone: async (_data) => {
          if (pendingStreamingMessage) {
            let updatedMergedWebSearch = null;
            if (pendingStreamingMessage.mergedWebSearch) {
              updatedMergedWebSearch = {
                ...pendingStreamingMessage.mergedWebSearch,
                status: "completed",
              };
            }

            // Finalize any tool call that never received a tool_result so the
            // in-progress loader stops spinning after the stream ends.
            const resultIds = new Set(
              (pendingStreamingMessage.toolsResults || []).map(
                (tr) => tr.tool_id,
              ),
            );
            const finalizedToolCalls = (
              pendingStreamingMessage.toolCalls || []
            ).map((tc) =>
              tc.status === "completed" ||
              tc.status === "error" ||
              resultIds.has(tc.tool_id)
                ? tc
                : {
                    ...tc,
                    status:
                      "error" as import("../../../types/toolCall").ToolCallStatus,
                  },
            );

            // Mark all tool calls as completed when the stream ends. Artifacts are
            // NOT inlined into the message text (ENGG-387) — see the send() path.
            pendingStreamingMessage = {
              ...pendingStreamingMessage,
              isStreaming: false,
              toolCalls: finalizedToolCalls,
              mergedWebSearch: updatedMergedWebSearch as MergedToolResult,
              artifacts: [...streamingArtifacts.values()].map((a) => ({
                id: a.id,
                title: a.title,
                content_type: a.contentType,
              })),
            };

            // Update the message in the array
            messages = messages.map((m) =>
              m.id === pendingStreamingMessage?.id
                ? (pendingStreamingMessage as ChatMessageType)
                : m,
            );

            // Streaming finished — clear the per-artifact streaming flag so the
            // panel enables download/save.
            panelArtifacts = panelArtifacts.map((a) => ({
              ...a,
              streaming: false,
            }));
            streamingArtifacts = new Map();
          }
          isLoading = false;
          isTyping = false;
        },
        onError: (err) => {
          if (err instanceof ApiError) {
            error = err;
          } else {
            error = new ApiError(500, err.message);
          }
          if (pendingStreamingMessage) {
            const errorMessage =
              getLocalizedError(error, "description", $_) ||
              (typeof error.detail === "string"
                ? error.detail
                : error.detail?.description || "Unknown error");
            pendingStreamingMessage = {
              ...pendingStreamingMessage,
              error: errorMessage,
              isStreaming: false,
            };

            // Update the message in the array
            messages = messages.map((m) =>
              m.id === pendingStreamingMessage?.id
                ? (pendingStreamingMessage as ChatMessageType)
                : m,
            );
          }
          isLoading = false;
          isTyping = false;
        },
      });
    } catch (err) {
      if (err instanceof ApiError) {
        error = err;
      } else {
        error = new ApiError(
          500,
          err instanceof Error ? err.message : "Failed to process request",
        );
      }
      isLoading = false;
      isTyping = false;
    }
  }

  function filterLatestById<T extends { tool_id: string }>(
    arr?: T[] | null,
  ): T[] {
    if (!arr || !arr.length) {
      return arr || [];
    }

    const uniqueIds = new Set<string>();
    const result: T[] = [];

    for (let i = arr.length - 1; i >= 0; i--) {
      if (!uniqueIds.has(arr[i].tool_id)) {
        uniqueIds.add(arr[i].tool_id);
        result.push(arr[i]);
      }
    }

    return result.reverse();
  }

  function mergeWebSearchResults(
    toolCalls: ToolCall[],
    toolsResults: ToolResult[],
    status: "completed" | "running" = "completed",
  ): MergedToolResult | null {
    // Get only web search tools
    const webSearchToolCalls = toolCalls.filter(
      (tc) => tc.kind === "web_search",
    );
    const webSearchToolResults = toolsResults.filter(
      (tr) => tr.kind === "web_search",
    );

    // If no web calls, return null
    if (!webSearchToolCalls || !webSearchToolCalls.length) {
      return null;
    }

    // If no results, return the last tool call
    if (!webSearchToolResults || !webSearchToolResults.length) {
      return {
        tool_name: toolCalls[toolCalls.length - 1].tool_name,
        kind: toolCalls[toolCalls.length - 1].kind,
        status,
      };
    }

    // Remove duplicates having same tool_id
    const latestResultsByToolId = filterLatestById(webSearchToolResults);

    // Merge results
    const tool_name = latestResultsByToolId[0].tool_name;
    const kind = latestResultsByToolId[0].kind;
    let query = latestResultsByToolId[0].web_search?.query || "";
    const queries = new Set<string>([]);
    const results = new Set<WebSearchResult>([]);

    latestResultsByToolId.forEach((curr) => {
      // Update query
      if (curr.web_search?.query) {
        query = curr.web_search?.query;
      }

      // Add new queries
      curr.web_search?.queries?.forEach((query) => {
        queries.add(query);
      });

      // Add new results
      curr.web_search?.results?.forEach((result) => {
        results.add(result);
      });
    });

    return {
      tool_name,
      kind,
      web_search: {
        query,
        queries: Array.from(queries),
        results: Array.from(results),
      },
      status,
    };
  }

  async function loadConversationFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const chatId = urlParams.get("chatId");

    if (chatId) {
      try {
        isLoadingConversation = true;
        isLoading = true;
        error = null;
        showArtifactPanel = false;

        const conversation = await getConversation(chatId);
        conversationId = chatId;
        // Reflect the conversation's title in the browser tab.
        conversationTitle = conversation.title || null;

        // Convert messages to ChatMessageType format
        messages = (conversation.messages || []).map((msg: any) => {
          const toolResults = msg.tool_results || msg.tools_results || [];
          const toolCalls = msg.tool_calls || [];

          // Reconstruct pending MCP OAuth requests from persisted tool_results.
          // The backend stores OAuth-required failures as tool_results with
          // status === 'error' and an authorization_url in the output payload.
          const mcpAuthRequests: McpAuthRequest[] = [];
          const seenServerIds = new Set<string>();
          for (const tr of toolResults) {
            const out = tr?.output;
            const authUrl = out?.authorization_url;
            const serverId = out?.server_id;
            if (
              tr?.status === "error" &&
              authUrl &&
              serverId &&
              !seenServerIds.has(serverId)
            ) {
              seenServerIds.add(serverId);
              const matchingCall = toolCalls.find(
                (tc: any) => tc.tool_id === tr.tool_id,
              );
              mcpAuthRequests.push({
                server_id: serverId,
                server_name: out.server_name || serverId,
                tool_name: matchingCall?.tool_name || tr.tool_name || "",
                authorization_url: authUrl,
                scopes: out.scopes,
                status: "pending",
              });
            }
          }

          return {
            id: msg.id,
            role: msg.role,
            content: msg.parts.text || "",
            timestamp: msg.created_at || new Date().toISOString(),
            model: msg.model,
            usage: msg.usage,
            files: msg.parts.files || [],
            toolCalls,
            toolsResults: toolResults,
            mergedWebSearch: mergeWebSearchResults(
              toolCalls,
              toolResults,
              "completed",
            ),
            mcpAuthRequests:
              mcpAuthRequests.length > 0 ? mcpAuthRequests : undefined,
            // Server-declared artifacts (metadata only — content fetched by id).
            artifacts: msg.parts.artifacts || [],
          };
        });

        // Web search enabled
        webSearchEnabled = conversation.web_search_enabled || false;

        // Extract model and provider from conversation
        // Use last message model if messages exist, otherwise use conversation model
        let modelToUse = conversation.model;
        if (conversation.messages && conversation.messages.length > 0) {
          const lastMessage =
            conversation.messages[conversation.messages.length - 1];
          if (lastMessage.model) {
            modelToUse = lastMessage.model;
          }
        }

        if (modelToUse) {
          selectedModel = modelToUse;
          // Find the provider that contains this model
          const providerWithModel = providers.find((p) =>
            p.models.some((m) => m.key === modelToUse || m.name === modelToUse),
          );

          if (providerWithModel) {
            selectedProvider = providerWithModel.key;
            selectedModelInfo = providerWithModel;
          } else {
            // Fallback to default provider
            selectedProvider = "openai";
            selectedModelInfo =
              providers.find((p) => p.key === "openai") || providers[0];
          }
        }
      } catch (err) {
        // Convert all errors to ApiError for consistent handling
        const apiError =
          err instanceof ApiError
            ? err
            : new ApiError(
                500,
                err instanceof Error
                  ? err.message
                  : $_("chat.errors.failedToLoadConversation"),
              );

        error = apiError;
        console.error("Failed to load conversation:", err);
        messages = []; // Clear messages on error
      } finally {
        isLoading = false;
        isLoadingConversation = false;

        // Wait for Svelte to finish updating the DOM with the new messages.
        await tick();

        if (messagesContainer) {
          // Save the original scroll behavior (likely 'smooth' from CSS).
          // We'll temporarily change it to 'auto' to prevent smooth scrolling animation.
          const container = messagesContainer;
          const originalScrollBehavior = container.style.scrollBehavior;
          container.style.scrollBehavior = "auto";

          requestAnimationFrame(() => {
            void container.offsetHeight;
            container.scrollTop = container.scrollHeight;
            container.style.scrollBehavior = originalScrollBehavior;
          });
        }

        // Focus the input field
        messageInput?.focus();
      }
    } else {
      // No chatId in URL, clear everything
      conversationId = null;
      conversationTitle = null;
      messages = [];
      error = null;
      isLoadingConversation = false;
      showArtifactPanel = false;

      // Set model and provider from query params, or default to the last-used
      // model (falling back to the latest available). An explicit ?model= param
      // always wins; otherwise applyDefaultModel() picks the right default once
      // the registry is available (loadModels re-applies it on first mount).
      const urlModel = urlParams.get("model");
      if (urlModel) {
        selectedModel = urlModel;
        selectedProvider = urlParams.get("provider") || "openai";
        selectedModelInfo =
          providers.find((p) => p.key === selectedProvider) || providers[0];
      } else {
        applyDefaultModel();
      }
      webSearchEnabled = urlParams.get("webSearch") === "true";

      const mcpServersParam = urlParams.get("mcpServers");
      selectedMcpServers = mcpServersParam ? mcpServersParam.split(",") : [];

      // Chat started from a project workspace: remember it so the new conversation gets linked.
      // Keep projectId in the URL so the association survives a reload before the first message
      // and stays visible while chatting; linking runs once (pendingProjectId is cleared after).
      pendingProjectId = urlParams.get("projectId");

      if (pendingProjectId) {
        loadProjectMcpServers(pendingProjectId);
      } else {
        // Not in a project workspace, so the conversation is the owner's alone.
        chatVisibility = "private";
      }

      // Check for an initial message in URL
      const initialMessage = urlParams.get("message");
      if (initialMessage) {
        // Clear the message and configuration params from URL
        const url = new URL(window.location.href);
        url.searchParams.delete("message");
        url.searchParams.delete("model");
        url.searchParams.delete("provider");
        url.searchParams.delete("webSearch");
        url.searchParams.delete("mcpServers");
        window.history.replaceState({}, "", url.toString());

        // Send the message after a microtask tick
        tick().then(() => {
          handleSendMessage(initialMessage);
        });
      }
    }
  }

  // Focus the chat input when requested (e.g., when "New Chat" is clicked)
  function handleFocusChatInput() {
    messageInput?.focus();
  }

  // Keep the tab title fresh when the open conversation is renamed or gets its
  // server-generated title (dispatched by the sidebar).
  function handleConversationTitleChanged(event: Event) {
    const detail = (event as CustomEvent<{ id?: string; title?: string }>)
      .detail;
    if (
      detail &&
      detail.id === conversationId &&
      typeof detail.title === "string"
    ) {
      conversationTitle = detail.title;
    }
  }

  onMount(() => {
    scrollToBottom(false);
    loadConversationFromUrl();
    loadModels();
    loadMcpServers();

    // Focus the chat input if nothing else is focused
    if (!document.activeElement || document.activeElement === document.body) {
      messageInput?.focus();
    }

    // Listen for URL changes (when using history.pushState)
    window.addEventListener("popstate", handleUrlChange);

    // Listen for focus chat input event (from Sidebar "New Chat" button)
    window.addEventListener("focusChatInput", handleFocusChatInput);

    // Keep the browser-tab title in sync with sidebar renames / auto-titles.
    window.addEventListener(
      "conversationTitleChanged",
      handleConversationTitleChanged,
    );

    // Also listen for custom pushstate events
    const originalPushState = history.pushState;
    history.pushState = function (...args) {
      originalPushState.apply(history, args);
      setTimeout(handleUrlChange, 0); // Small delay to ensure URL is updated
    };

    return () => {
      window.removeEventListener("popstate", handleUrlChange);
      window.removeEventListener("focusChatInput", handleFocusChatInput);
      window.removeEventListener(
        "conversationTitleChanged",
        handleConversationTitleChanged,
      );
      history.pushState = originalPushState;
    };
  });
</script>

{#if isLoadingConversation}
  <!-- Loading state: wait until we know if there are messages -->
  <div
    class="chat-container chat-container--loading"
    role="status"
    aria-label={$_("chat.messageInput.loadingModels")}
    aria-busy="true"
  ></div>
{:else if messages.length === 0}
  <!-- Empty state — Figma "chat/empty-state" (159:15193, round 2) -->
  <div class="chat-container chat-container--empty">
    <div class="chat-scroll-area">
      <div class="welcome-hero">
        <div class="sticker-ring" aria-hidden="true">
          <div class="sticker-inner">
            <div class="chat-bubble-block">
              <svg
                class="bubble-icon"
                viewBox="0 0 21.668 21.668"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M 1.074 15.538 L 2.004 15.169 L 1.991 15.136 L 1.975 15.104 L 1.074 15.538 Z M 1.176 16.802 L 2.128 17.11 L 2.143 17.064 L 2.153 17.017 L 1.176 16.802 Z M 0.022 20.367 L -0.929 20.059 L -0.946 20.111 L -0.957 20.165 L 0.022 20.367 Z M 1.362 21.632 L 1.618 22.599 L 1.63 22.595 L 1.642 22.592 L 1.362 21.632 Z M 5.059 20.551 L 4.865 19.57 L 4.821 19.579 L 4.779 19.591 L 5.059 20.551 Z M 6.25 20.651 L 6.673 19.745 L 6.639 19.729 L 6.605 19.716 L 6.25 20.651 Z M 1.074 15.538 L 0.145 15.906 C 0.231 16.123 0.25 16.36 0.2 16.587 L 1.176 16.802 L 2.153 17.017 C 2.289 16.4 2.237 15.757 2.004 15.169 L 1.074 15.538 Z M 1.176 16.802 L 0.225 16.494 L -0.929 20.059 L 0.022 20.367 L 0.974 20.675 L 2.128 17.11 L 1.176 16.802 Z M 0.022 20.367 L -0.957 20.165 C -1.029 20.513 -1.01 20.873 -0.903 21.211 L 0.05 20.911 L 1.004 20.61 C 1 20.597 0.999 20.582 1.002 20.568 L 0.022 20.367 Z M 0.05 20.911 L -0.903 21.211 C -0.797 21.55 -0.605 21.856 -0.347 22.099 L 0.339 21.372 L 1.026 20.646 C 1.016 20.636 1.008 20.624 1.004 20.61 L 0.05 20.911 Z M 0.339 21.372 L -0.347 22.099 C -0.089 22.343 0.227 22.517 0.57 22.604 L 0.817 21.635 L 1.063 20.666 C 1.049 20.662 1.037 20.655 1.026 20.646 L 0.339 21.372 Z M 0.817 21.635 L 0.57 22.604 C 0.914 22.692 1.275 22.69 1.618 22.599 L 1.362 21.632 L 1.105 20.666 C 1.091 20.669 1.077 20.669 1.063 20.666 L 0.817 21.635 Z M 1.362 21.632 L 1.642 22.592 L 5.34 21.511 L 5.059 20.551 L 4.779 19.591 L 1.081 20.672 L 1.362 21.632 Z M 5.059 20.551 L 5.254 21.532 C 5.468 21.489 5.69 21.508 5.895 21.585 L 6.25 20.651 L 6.605 19.716 C 6.05 19.505 5.447 19.455 4.865 19.57 L 5.059 20.551 Z M 6.25 20.651 L 5.827 21.557 C 8.354 22.737 11.216 22.986 13.91 22.262 L 13.65 21.296 L 13.39 20.33 C 11.152 20.933 8.773 20.725 6.673 19.745 L 6.25 20.651 Z M 13.65 21.296 L 13.91 22.262 C 16.603 21.537 18.954 19.884 20.547 17.595 L 19.726 17.024 L 18.905 16.452 C 17.581 18.355 15.628 19.728 13.39 20.33 L 13.65 21.296 Z M 19.726 17.024 L 20.547 17.595 C 22.14 15.306 22.874 12.528 22.619 9.75 L 21.623 9.842 L 20.627 9.934 C 20.839 12.241 20.23 14.55 18.905 16.452 L 19.726 17.024 Z M 21.623 9.842 L 22.619 9.75 C 22.363 6.973 21.135 4.375 19.151 2.415 L 18.448 3.127 L 17.745 3.838 C 19.394 5.467 20.415 7.626 20.627 9.934 L 21.623 9.842 Z M 18.448 3.127 L 19.151 2.415 C 17.167 0.455 14.554 -0.741 11.774 -0.963 L 11.694 0.034 L 11.615 1.031 C 13.925 1.215 16.097 2.209 17.745 3.838 L 18.448 3.127 Z M 11.694 0.034 L 11.774 -0.963 C 8.994 -1.184 6.225 -0.416 3.955 1.205 L 4.536 2.018 L 5.118 2.832 C 7.004 1.485 9.305 0.847 11.615 1.031 L 11.694 0.034 Z M 4.536 2.018 L 3.955 1.205 C 1.686 2.826 0.062 5.197 -0.63 7.898 L 0.339 8.147 L 1.307 8.395 C 1.882 6.149 3.232 4.179 5.118 2.832 L 4.536 2.018 Z M 0.339 8.147 L -0.63 7.898 C -1.322 10.6 -1.037 13.46 0.174 15.972 L 1.074 15.538 L 1.975 15.104 C 0.969 13.016 0.732 10.64 1.307 8.395 L 0.339 8.147 Z"
                  fill="currentColor"
                  fill-rule="nonzero"
                ></path>
              </svg>
            </div>
          </div>
        </div>
        <h2 class="main-title">{$_("chat.emptyState.title")}</h2>
        <div class="greeting">
          <p class="greeting__sub">{$_("chat.emptyState.description")}</p>
        </div>
      </div>

      <div class="spacer-40" aria-hidden="true"></div>

      <div class="input-section">
        <MessageInput
          bind:this={messageInput}
          onSend={handleSendMessage}
          disabled={isLoading}
          placeholder={selectedIsImageModel
            ? $_("chat.messageInput.placeholderImage")
            : $_("chat.messageInput.placeholderWithModel", {
                values: { model: selectedModel },
              })}
          imageModelSelected={selectedIsImageModel}
          {selectedModel}
          {selectedProvider}
          {mcpServers}
          {selectedMcpServers}
          {loadingMcpServers}
          {mcpServersError}
          {webSearchEnabled}
          onWebSearchToggle={() => (webSearchEnabled = !webSearchEnabled)}
          onMcpToggle={toggleMcpServer}
          onRemoveModel={handleRemoveModel}
          onModelSelect={selectModel}
          {providers}
          {loadingModels}
          {modelsError}
          {conversationId}
          bind:pendingSkillIds
        />
        <span class="disclaimer">{$_("chat.emptyState.aiDisclaimer")}</span>
      </div>

      <div class="spacer-32" aria-hidden="true"></div>

      <div class="cards-row">
        {#each suggestionCards as card (card.id)}
          <button
            class="sug-card"
            type="button"
            onclick={() => messageInput?.setMessage(card.prompt)}
          >
            <span class="sug-card__icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path
                  d={card.icon}
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                />
              </svg>
            </span>
            <span class="sug-card__copy">
              <span class="sug-card__title">{card.title}</span>
              <span class="sug-card__body">{card.body}</span>
            </span>
          </button>
        {/each}
      </div>
    </div>

    {#if error && !currentStreamingMessage}
      <div
        class="error-banner error-banner--centered"
        role="alert"
        aria-live="assertive"
        class:error-banner--warning={error.externalCode === "budget_warning"}
      >
        <div class="error-icon" aria-hidden="true">
          {#if error.externalCode === "budget_warning"}
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <path
                d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3.05h16.94a2 2 0 0 0 1.71-3.05l-8.47-14.14a2 2 0 0 0-3.42 0z"
              ></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
          {:else}
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
          {/if}
        </div>
        <div class="error-content">
          <span class="error-title">
            {getLocalizedError(error, "description", $_) ||
              $_("error.fallback.description")}
          </span>
          {#if getLocalizedError(error, "solution", $_)}
            <span class="error-message">
              {getLocalizedError(error, "solution", $_)}
            </span>
          {/if}
        </div>
        <button
          class="dismiss-btn"
          onclick={() => (error = null)}
          aria-label={$_("chat.errors.dismissError")}
          title={$_("chat.errors.dismissError")}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    {/if}
  </div>
{:else}
  <!-- Active chat: bottom-anchored input -->
  <div class="chat-layout" class:chat-layout--with-artifact={showArtifactPanel}>
    <div class="chat-container">
      <div
        class="messages-container"
        bind:this={messagesContainer}
        onscroll={handleScroll}
        role="log"
        aria-live="polite"
        aria-label={$_("chat.messageInput.messageInput")}
      >
        <div class="messages-inner">
          {#each messages as message, index (message.id)}
            <!-- Chat message -->
            <ChatMessage
              {message}
              onEdit={handleEditMessage}
              {selectedModelInfo}
              {providers}
              onMcpAuthConnected={(serverId) =>
                handleMcpAuthConnected(message.id, serverId)}
              onMcpAuthError={(serverId, err) =>
                handleMcpAuthError(message.id, serverId, err)}
              onMcpAuthStatusChange={(serverId, status) =>
                handleMcpAuthStatusChange(message.id, serverId, status)}
              onShowArtifact={handleShowArtifact}
            />
          {/each}

          {#if isTyping}
            <div
              role="status"
              aria-label={$_("chat.messageInput.loadingModels")}
              aria-live="polite"
            >
              <TypingIndicator generatingImage={selectedIsImageModel} />
            </div>
          {/if}

          {#if error && !currentStreamingMessage}
            <div
              class="error-banner"
              role="alert"
              aria-live="assertive"
              class:error-banner--warning={error.externalCode ===
                "budget_warning"}
            >
              <div class="error-icon" aria-hidden="true">
                {#if error.externalCode === "budget_warning"}
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    aria-hidden="true"
                  >
                    <path
                      d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3.05h16.94a2 2 0 0 0 1.71-3.05l-8.47-14.14a2 2 0 0 0-3.42 0z"
                    ></path>
                    <line x1="12" y1="9" x2="12" y2="13"></line>
                    <line x1="12" y1="17" x2="12.01" y2="17"></line>
                  </svg>
                {:else}
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                  </svg>
                {/if}
              </div>
              <div class="error-content">
                <span class="error-title">
                  {getLocalizedError(error, "description", $_) ||
                    $_("error.fallback.description")}
                </span>
                {#if getLocalizedError(error, "solution", $_)}
                  <span class="error-message">
                    {getLocalizedError(error, "solution", $_)}
                  </span>
                {/if}
              </div>
              <button
                class="dismiss-btn"
                onclick={() => (error = null)}
                aria-label={$_("chat.errors.dismissError")}
                title={$_("chat.errors.dismissError")}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  aria-hidden="true"
                >
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          {/if}
        </div>
      </div>

      <MessageScrollNavigator {messages} scrollContainer={messagesContainer} />

      <div class="input-container">
        <MessageInput
          bind:this={messageInput}
          onSend={handleSendMessage}
          disabled={isLoading}
          placeholder={selectedIsImageModel
            ? $_("chat.messageInput.placeholderImage")
            : $_("chat.messageInput.placeholderWithModel", {
                values: { model: selectedModel },
              })}
          imageModelSelected={selectedIsImageModel}
          {selectedModel}
          {selectedProvider}
          {mcpServers}
          {selectedMcpServers}
          {loadingMcpServers}
          {mcpServersError}
          {webSearchEnabled}
          onWebSearchToggle={() => (webSearchEnabled = !webSearchEnabled)}
          onMcpToggle={toggleMcpServer}
          onRemoveModel={handleRemoveModel}
          onModelSelect={selectModel}
          {providers}
          {loadingModels}
          {modelsError}
          {conversationId}
          bind:pendingSkillIds
        />
        <p class="ai-disclaimer">{$_("chat.emptyState.aiDisclaimer")}</p>
      </div>
    </div>

    {#if showArtifactPanel}
      <div class="artifact-panel-wrapper">
        <ArtifactPanel
          artifacts={panelArtifacts}
          activeIndex={panelActiveIndex}
          onselect={handleSelectArtifact}
          onclose={handleCloseArtifact}
        />
      </div>
    {/if}
  </div>
{/if}

<style>
  .chat-layout {
    display: flex;
    height: 100vh;
    width: 100%;
  }

  .chat-layout .chat-container {
    flex: 1;
    min-width: 0;
    transition: flex 0.3s ease;
  }

  .chat-layout--with-artifact .chat-container {
    flex: 1;
  }

  .artifact-panel-wrapper {
    width: 50%;
    max-width: 50%;
    flex-shrink: 0;
    animation: artifactPanelIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  @keyframes artifactPanelIn {
    from {
      width: 0;
      opacity: 0;
    }
    to {
      width: 50%;
      opacity: 1;
    }
  }

  .chat-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100%;
    background: var(--gx-page);
  }

  .chat-container--loading {
    display: flex;
  }

  .messages-container {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    scroll-behavior: smooth;
    position: relative;
  }

  /* Transcript column — chat-empty-state.html ".conv-scroll" / ".msg-row":
     a 720px measure that lines up with the composer below it, 60px of lead-in
     and 32px between turns. 768px = 720px + the 24px gutters. */
  .messages-inner {
    max-width: 1048px;
    margin: 0 auto;
    width: 100%;
    box-sizing: border-box;
    padding: 60px 24px 32px;
    display: flex;
    flex-direction: column;
    gap: 32px;
  }

  /* ===== Empty state (Figma "chat/empty-state" 159:15193) ===== */
  .chat-container--empty {
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    background: var(--gx-page);
  }

  .chat-scroll-area {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex-grow: 1;
    align-self: stretch;
    padding: 60px 40px 40px;
    overflow-y: auto;
    /* A flex item defaults to min-width:auto, which pinned this column to its
       content's min-content width — the 720px measure plus 80px of padding — so
       the empty state overflowed any viewport narrower than 800px and pushed the
       third card off-screen. */
    min-width: 0;
    width: 100%;
    box-sizing: border-box;
  }

  .welcome-hero {
    display: flex;
    flex-direction: column;
    gap: 16px;
    align-items: center;
    align-self: stretch;
    flex-shrink: 0;
  }

  /* Three-layer sticker (round 2): a conic-gradient ring around a soft
     off-white disc around the brand-blue chat-bubble tile.
     Motion (Figma): the whole sticker breathes on a 6.4s scale loop. Switched
     off by the global prefers-reduced-motion rule in app.css. */
  .sticker-ring {
    position: relative;
    width: 104px;
    height: 104px;
    border-radius: 52px;
    background: conic-gradient(
      from 90deg at 50% 50%,
      rgb(79, 114, 210) 0deg,
      rgb(76, 169, 122) 126deg,
      rgb(147, 174, 234) 252deg,
      rgb(79, 114, 210) 360deg
    );
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    animation: sticker-breathe 6.4s linear infinite;
  }

  @keyframes sticker-breathe {
    0% {
      animation-timing-function: ease-in-out;
      scale: 1 1;
    }
    25% {
      animation-timing-function: ease-in-out;
      scale: 1.06 1.06;
    }
    50% {
      animation-timing-function: ease-in-out;
      scale: 1 1;
    }
    75% {
      animation-timing-function: ease-in-out;
      scale: 1.06 1.06;
    }
    100% {
      scale: 1 1;
    }
  }

  .sticker-inner {
    position: relative;
    width: 96px;
    height: 98px;
    border-radius: 49px;
    background: var(--gx-sticker-disc);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .chat-bubble-block {
    width: 64px;
    height: 64px;
    border-radius: 18px;
    background: rgb(63, 92, 184);
    box-shadow: 0 6px 16px 0 rgba(63, 92, 184, 0.251);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .bubble-icon {
    width: 26px;
    height: 26px;
    color: #fff;
  }

  /* Design specifies Sora, not loaded elsewhere in the app; Montserrat is
     the existing display face and the design's own fallback after Sora. */
  .main-title {
    margin: 0;
    font-family: var(--gx-font-display);
    font-weight: 700;
    font-size: 26px;
    line-height: 100%;
    text-align: center;
    background: linear-gradient(90deg, #3F5CB8 0%, #3D8C64 100%);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .greeting {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: center;
    align-self: stretch;
  }

  .greeting__sub {
    margin: 0;
    font-family: var(--gx-font);
    font-weight: 600;
    font-size: 20px;
    line-height: 100%;
    text-align: center;
    color: var(--gx-slate-900);
    text-wrap: pretty;
  }

  .spacer-40 {
    height: 40px;
    flex-shrink: 0;
    align-self: stretch;
  }

  .spacer-32 {
    height: 32px;
    flex-shrink: 0;
    align-self: stretch;
  }

  /* Composer column and cards row share the design's 720px measure. Expressed as
     `width:100%; max-width:720px` rather than the reverse so neither can demand
     more width than the column actually has. */
  .input-section {
    width: 100%;
    max-width: 720px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: center;
    flex-shrink: 0;
  }

  .disclaimer {
    align-self: stretch;
    font-family: var(--gx-font-display);
    font-weight: 400;
    font-size: 11px;
    line-height: 14px;
    text-align: center;
    color: var(--gx-slate-400);
  }

  .cards-row {
    width: 100%;
    max-width: 720px;
    /* auto-fit + minmax reflows 3 -> 2 -> 1 at whatever width the column has,
       keeping every card the same size (a wrapping flex row would stretch a lone
       card on the last line) and equal height per row. */
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    align-items: stretch;
  }

  .sug-card {
    min-width: 0;
    min-height: 143px;
    display: flex;
    flex-direction: column;
    /* app.css sets `align-items: center; justify-content: center` on every
       `button`, which centres the 36px icon and floats the whole stack
       vertically. The design leaves both at their initial value: icon, title
       and body all flush left, content top-aligned. */
    align-items: stretch;
    justify-content: flex-start;
    gap: 12px;
    padding: 20px;
    border: none;
    border-radius: 16px;
    background: var(--gx-card);
    box-shadow:
      inset 0 0 0 1px var(--gx-ring-soft),
      0 4px 16px 0 rgba(15, 23, 42, 0.0235);
    text-align: left;
    cursor: pointer;
    backdrop-filter: none;
    transition:
      box-shadow 120ms ease,
      transform 120ms ease;
  }

  .sug-card:hover {
    background: var(--gx-card);
    box-shadow:
      inset 0 0 0 1px rgb(203, 213, 225),
      0 8px 22px 0 rgba(15, 23, 42, 0.055);
    transform: translateY(-1px);
  }

  .sug-card:focus-visible {
    outline: 2px solid var(--gx-teal);
    outline-offset: 2px;
  }

  .sug-card__icon {
    display: flex;
    width: 36px;
    height: 36px;
    border-radius: 10px;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    background: var(--gx-org-brand-alt-tint);
    color: var(--gx-org-brand-alt);
  }

  .sug-card__copy {
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-self: stretch;
  }

  .sug-card__title {
    font-family: var(--gx-font);
    font-weight: 600;
    font-size: 14px;
    line-height: 100%;
    color: var(--gx-card-title-ink);
  }

  .sug-card__body {
    font-family: var(--gx-font-display);
    font-weight: 400;
    font-size: 12px;
    line-height: 16px;
    color: var(--gx-an-sub);
    text-wrap: pretty;
  }

  .ai-disclaimer {
    margin: 0.5rem 0 0 0;
    font-size: 0.75rem;
    color: var(--text-tertiary, rgba(128, 128, 128, 0.6));
    text-align: center;
  }

  .input-container .ai-disclaimer {
    margin: 0;
    width: min(720px, 100%);
    font-family: var(--gx-font-display);
    font-weight: 400;
    font-size: 11px;
    line-height: 14px;
    text-align: center;
    color: var(--gx-slate-400);
  }

  .error-banner--centered {
    position: absolute;
    bottom: 2rem;
    left: 50%;
    transform: translateX(-50%);
    max-width: 500px;
    width: calc(100% - 2rem);
  }

  .error-banner {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem 1.25rem;
    margin: 1rem 0;
    background: linear-gradient(
      135deg,
      rgba(239, 68, 68, 0.1) 0%,
      rgba(239, 68, 68, 0.05) 100%
    );
    border: 1px solid rgba(239, 68, 68, 0.2);
    border-radius: 12px;
    color: #ef4444;
    backdrop-filter: blur(10px);
    animation: slideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;
    overflow: hidden;
  }

  .error-banner::before {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: linear-gradient(90deg, #ef4444 0%, #f87171 100%);
  }

  .error-banner--warning {
    background: linear-gradient(
      135deg,
      rgba(245, 158, 11, 0.1) 0%,
      rgba(245, 158, 11, 0.05) 100%
    );
    border: 1px solid rgba(245, 158, 11, 0.2);
    color: #f59e0b;
  }

  .error-banner--warning::before {
    background: linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%);
  }

  .error-banner--warning .error-icon {
    background: rgba(245, 158, 11, 0.1);
  }

  .error-banner--warning .error-title {
    color: #f59e0b;
  }

  .error-banner--warning .error-message {
    color: rgba(245, 158, 11, 0.8);
  }

  .error-banner--warning .dismiss-btn {
    color: rgba(245, 158, 11, 0.6);
  }

  .error-banner--warning .dismiss-btn:hover {
    background: rgba(245, 158, 11, 0.1);
    color: #f59e0b;
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .error-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: rgba(239, 68, 68, 0.1);
    border-radius: 8px;
    flex-shrink: 0;
  }

  .error-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .error-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: #ef4444;
  }

  .error-message {
    font-size: 0.875rem;
    color: rgba(239, 68, 68, 0.8);
    line-height: 1.5;
  }

  .dismiss-btn {
    padding: 0.5rem;
    background: transparent;
    border: none;
    color: rgba(239, 68, 68, 0.6);
    cursor: pointer;
    border-radius: 8px;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .dismiss-btn:hover {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
    transform: scale(1.1);
  }

  .dismiss-btn:focus-visible {
    outline: 2px solid #ef4444;
    outline-offset: 2px;
  }

  /* Bottom composer bar — chat-empty-state.html ".conv-bottom-area": the page
     surface, a hairline rule against the transcript and the same 720px
     composer column the empty state uses. */
  .input-container {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 16px 60px 20px;
    background: var(--gx-page);
    position: relative;
    width: 100%;
    box-sizing: border-box;
  }

  /* The composer itself keeps the design's fixed measure. */
  .input-container :global(.input-area-wrapper) {
    width: min(1048px, 100%);
  }

  /* Custom scrollbar */
  .messages-container::-webkit-scrollbar {
    width: 8px;
  }

  .messages-container::-webkit-scrollbar-track {
    background: transparent;
  }

  .messages-container::-webkit-scrollbar-thumb {
    background: var(--glass-stroke-light);
    border-radius: 4px;
    transition: background 0.2s ease;
  }

  .messages-container::-webkit-scrollbar-thumb:hover {
    background: var(--text-secondary);
  }

  @media (max-width: 768px) {
    /* Fill the shell's content box rather than the viewport: on mobile the
       app renders a ~45px header above this, so a hardcoded 100vh overflows
       its parent by exactly the header's height. */
    .chat-layout {
      height: 100%;
    }

    .chat-container {
      height: 100%;
    }

    .messages-inner {
      padding: 24px 16px 20px;
      gap: 20px;
    }

    .messages-container {
      min-height: 0;
    }

    .chat-scroll-area {
      padding: 32px 16px 24px;
      justify-content: flex-start;
    }

    .sticker-ring {
      width: 84px;
      height: 84px;
      border-radius: 42px;
    }

    .sticker-inner {
      width: 78px;
      height: 79px;
      border-radius: 40px;
    }

    .chat-bubble-block {
      width: 52px;
      height: 52px;
      border-radius: 15px;
    }

    .bubble-icon {
      width: 21px;
      height: 21px;
    }

    .main-title {
      font-size: 22px;
    }

    .greeting__sub {
      font-size: 17px;
      line-height: 130%;
    }

    .spacer-40 {
      height: 24px;
    }

    .spacer-32 {
      height: 24px;
    }

    /* The grid already reflows; on small screens just let the cards shrink to
       their content instead of holding the design's 143px card height. */
    .sug-card {
      min-height: 0;
    }

    .input-container {
      padding: 12px 16px 16px;
    }

    .ai-disclaimer {
      margin: 0.25rem 0 0 0;
      font-size: 0.75rem;
    }

    .input-container .ai-disclaimer {
      margin: 0;
    }
  }

  @media (max-width: 480px) {
    .sticker-ring {
      width: 72px;
      height: 72px;
      border-radius: 36px;
    }

    .sticker-inner {
      width: 66px;
      height: 67px;
      border-radius: 34px;
    }

    .chat-bubble-block {
      width: 44px;
      height: 44px;
      border-radius: 13px;
    }

    .bubble-icon {
      width: 18px;
      height: 18px;
    }

    .main-title {
      font-size: 20px;
    }

    .greeting__sub {
      font-size: 15px;
      line-height: 130%;
    }
  }
</style>
