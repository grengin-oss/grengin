<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { onMount, tick } from 'svelte';
  import ChatMessage from './ChatMessage.svelte';
  import MessageInput from './MessageInput.svelte';
  import TypingIndicator from './TypingIndicator.svelte';
  import ArtifactPanel from './ArtifactPanel.svelte';
  import MessageScrollNavigator from './MessageScrollNavigator.svelte';
  import type { ArtifactItem, StreamedArtifact } from '../artifacts';
  import type { MergedToolResult, ToolCall, ToolResult, WebSearchResult } from '../../../types/toolCall';
  import type { BudgetWarningMessage, ChatMessage as ChatMessageType, McpAuthRequest } from '../../../types/chat';
  import { cancelChatStream, sendMessage, getConversation, getChatMcpServers, type UploadedFile } from '../../../api/chatApi';
  import type { ProviderInfo, ModelInfo } from '../../../api/models';
  import { getModels, isImageModel, findModel } from '../../../api/models';
  import type { MCPServer } from '../../../admin/types.js';
  import { linkProjectToConversation, getProjectDetail } from '../../../api/projectsApi';
  import { linkSkill } from '../../../api/skills.js';
  import { _ } from 'svelte-i18n';
  import { ApiError } from '../../../api/client';
  import { getLocalizedError } from '../../../utils/errorLocalization';

  let messages = $state<ChatMessageType[]>([]);
  let isLoading = $state(false);
  let isTyping = $state(false);
  let error = $state<ApiError | null>(null);
  let conversationId = $state<string | null>(null);
  // Track if we're still loading the initial conversation
  let isLoadingConversation = $state(typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('chatId'));
  let chatLayoutElement = $state<HTMLDivElement | undefined>(undefined);
  let messagesContainer = $state<HTMLDivElement | undefined>(undefined);
  let messageInput = $state<MessageInput | undefined>(undefined);
  let currentStreamingMessage = $state<ChatMessageType | null>(null);
  let autoScrollEnabled = true;
  let selectedModel = $state('gpt-5.2');
  let selectedProvider = $state('openai');
  let selectedModelInfo = $state<ProviderInfo | undefined>(undefined);
  let webSearchEnabled = $state(false);
  let mcpServers = $state<MCPServer[]>([]);
  let selectedMcpServers = $state<string[]>([]);
  let loadingMcpServers = $state(false);
  let mcpServersError = $state<string | null>(null);
  let conversationLoadToken = 0;
  let activeStreamAbortController = $state<AbortController | null>(null);
  let activeStreamMessageId = $state<string | null>(null);
  let activeStreamBackendMessageId = $state<string | null>(null);
  let isCancellingStream = $state(false);
  let canCancelStream = $derived(
    Boolean(isCancellingStream || activeStreamAbortController || activeStreamMessageId),
  );

  // Project to link once a new conversation is created (chat started from a project workspace).
  let pendingProjectId = $state<string | null>(null);
  // Skills selected in the composer before the conversation exists; linked on first send.
  let pendingSkillIds = $state<string[]>([]);

  function finalizeStoppedMessage(messageId: string | null) {
    if (!messageId) return;

    messages = messages
      .map((message) =>
        message.id === messageId ? { ...message, isStreaming: false } : message,
      )
      .filter((message) => {
        if (message.id !== messageId || message.role !== 'assistant') return true;
        return Boolean(
          message.content.trim() ||
          message.toolCalls?.length ||
          message.toolsResults?.length ||
          message.mcpAuthRequests?.length,
        );
      });
  }

  async function handleCancelStream() {
    if (isCancellingStream || (!activeStreamAbortController && !activeStreamMessageId && !isLoading && !isTyping)) {
      return;
    }

    isCancellingStream = true;
    const backendMessageId = activeStreamBackendMessageId;
    const uiMessageId = activeStreamMessageId;
    const cancelRequest = backendMessageId
      ? cancelChatStream(backendMessageId).catch((err) => {
          console.warn('Failed to cancel chat stream on backend:', err);
        })
      : Promise.resolve();

    activeStreamAbortController?.abort();
    finalizeStoppedMessage(uiMessageId);
    currentStreamingMessage = null;
    isTyping = false;
    isLoading = false;

    await cancelRequest;
    isCancellingStream = false;
    activeStreamAbortController = null;
    activeStreamMessageId = null;
    activeStreamBackendMessageId = null;
    window.dispatchEvent(new CustomEvent('refreshChatHistory'));
  }

  // Link a freshly-created conversation to the originating project (many-to-many). Runs once.
  async function linkPendingProject(newConversationId: string) {
    if (!pendingProjectId) return;
    const projectId = pendingProjectId;
    pendingProjectId = null;
    try {
      await linkProjectToConversation(newConversationId, projectId);
      window.dispatchEvent(new CustomEvent('refreshChatHistory'));
    } catch (err) {
      console.error('Failed to link conversation to project:', err);
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
          console.error('Failed to link skill to conversation:', err),
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
  function applyStreamingArtifact(artifact: { id?: string; title: string; contentType: string; content: string; streaming?: boolean }) {
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
      const type = a.contentType === 'text/markdown' ? 'markdown' as const : 'html' as const;
      return {
        id: a.id,
        title: a.title || (type === 'html' ? 'HTML Artifact' : 'Markdown Document'),
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
    const i = Math.min(Math.max(panelActiveIndex, 0), panelArtifacts.length - 1);
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
  let selectedIsImageModel = $derived(isImageModel(findModel(providers, selectedModel)?.model));

  // Build a meaningful, accessible name/alt for a generated image from the prompt.
  function generatedImageName(prompt: string, index: number): string {
    const base = prompt.trim();
    const label = base.length > 0
      ? (base.length > 120 ? base.slice(0, 117) + '…' : base)
      : $_('chat.message.generatedImageAlt');
    return index > 0 ? `${label} (${index + 1})` : label;
  }

  async function loadModels() {
    loadingModels = true;
    modelsError = null;
    try {
      const response = await getModels();
      providers = response.providers;
    } catch (error) {
      console.error('Failed to load models:', error);
      modelsError = $_('chat.errors.failedToLoadModels');
    } finally {
      loadingModels = false;
    }
  }

  async function loadMcpServers() {
    loadingMcpServers = true;
    mcpServersError = null;
    try {
      const response = await getChatMcpServers();
      mcpServers = response.servers;
    } catch (error) {
      console.error('Failed to load connectors:', error);
      mcpServersError = $_('chat.errors.failedToLoadConnectors');
    } finally {
      loadingMcpServers = false;
    }
  }

  async function loadProjectMcpServers(projectId: string) {
    try {
      const detail = await getProjectDetail(projectId);
      if (detail.mcpServers && detail.mcpServers.length > 0) {
        const projectServerIds = detail.mcpServers.map(s => s.serverId);
        const merged = new Set([...selectedMcpServers, ...projectServerIds]);
        selectedMcpServers = Array.from(merged);
      }
    } catch (err) {
      console.error('Failed to load project MCP servers:', err);
    }
  }

  // Listen for URL changes
  function handleUrlChange() {
    const urlParams = new URLSearchParams(window.location.search);
    const chatId = urlParams.get('chatId');
    
    
    if (chatId !== conversationId) {
      loadConversationFromUrl();
    }
  }

  // Update URL with conversation ID
  function updateUrlWithConversationId(id: string) {
    const url = new URL(window.location.href);
    url.searchParams.set('chatId', id);
    window.history.pushState({}, '', url.toString());
  }

  // Handle model selection
  function selectModel(provider: ProviderInfo, model: ModelInfo) {
    selectedProvider = provider.key;
    selectedModel = model.key;
    selectedModelInfo = provider;
  }

  // Handle model removal
  function handleRemoveModel() {
    selectedModel = '';
    selectedProvider = '';
  }

  function toggleMcpServer(serverId: string) {
    if (selectedMcpServers.includes(serverId)) {
      selectedMcpServers = selectedMcpServers.filter(id => id !== serverId);
    } else {
      selectedMcpServers = [...selectedMcpServers, serverId];
    }
  }

  function handleBudgetWarning(data: BudgetWarningMessage) {
    let budgetAvailable = parseInt(data.budget_available, 10);
    let description_key = '';
    let solution_key = '';

    if (budgetAvailable > 0) {
      description_key = 'chat.errors.budgetAboutToExhaust';
    } else if (data.action === 'block') {
      description_key = 'chat.errors.budgetExhaustedBlock';
      solution_key = 'chat.errors.budgetExhaustedBlockSolution';
    } else {
      description_key = 'chat.errors.budgetExhaustedWarn';
    }

    error = new ApiError(200, {
      type: 'rich',
      code: 200,
      description: data.message,
      solution: '',
      description_key: description_key,
      solution_key: solution_key,
      params: {},
      external_code: 'budget_warning',
    });
  }

  // Auto-scroll to bottom when new messages arrive
  async function scrollToBottom(smooth = true) {
    await tick();
    if (messagesContainer) {
      messagesContainer.scrollTo({
        top: messagesContainer.scrollHeight,
        behavior: smooth ? 'auto' : 'auto',
      });
    }
  }

  function isNearMessageBottom(threshold = 120): boolean {
    if (!messagesContainer) return false;

    return (
      messagesContainer.scrollHeight -
        messagesContainer.scrollTop -
        messagesContainer.clientHeight <
      threshold
    );
  }

  function preserveBottomAfterViewportChange(): void {
    if (!messagesContainer || (!autoScrollEnabled && !isNearMessageBottom(160))) {
      return;
    }

    requestAnimationFrame(() => {
      if (!messagesContainer) return;
      messagesContainer.scrollTop = messagesContainer.scrollHeight;

      requestAnimationFrame(() => {
        if (!messagesContainer) return;
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      });
    });
  }

  function syncChatViewportHeight(): void {
    if (!chatLayoutElement) {
      return;
    }

    const viewport = window.visualViewport;
    const viewportHeight = viewport?.height ?? window.innerHeight;
    const viewportOffsetTop = viewport?.offsetTop ?? 0;
    const layoutTop = chatLayoutElement.getBoundingClientRect().top - viewportOffsetTop;
    const visibleHeight = Math.max(240, Math.floor(viewportHeight - Math.max(0, layoutTop)));

    chatLayoutElement.style.setProperty('--chat-visible-height', `${visibleHeight}px`);
    preserveBottomAfterViewportChange();
  }

  // Handle manual scrolling to detect if user wants to stop auto-scroll
  function handleScroll() {
    if (!messagesContainer || isTyping) return;

    // Check if user is near the bottom (within 100px)
    const isNearBottom = isNearMessageBottom(80);
    if (!isNearBottom) {
      autoScrollEnabled = false;
    } else {
      autoScrollEnabled = true;
    }
  }

  // Scroll to show the top of the streaming message
  async function scrollToStreamingMessageTop(streamingMessageId: string) {
    await tick();

    if (!messagesContainer || !autoScrollEnabled) return;

    const messageIndex = messages.findIndex(m => m.id === streamingMessageId);
    const messageElement = messagesContainer.querySelectorAll('.message')[messageIndex];

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
          const scrollTop = messagesContainer.scrollTop +
            (messageElement.getBoundingClientRect().top - messagesContainer.getBoundingClientRect().top) - offset;
          messagesContainer.scrollTop = Math.max(0, scrollTop);
        }
      }
    });
  }

  async function handleSendMessage(content: string, uploadedFiles?: UploadedFile[], webSearch?: boolean) {
    if (isLoading) return;

    error = null;
    isLoading = true;
    autoScrollEnabled = true; // Reset auto-scroll when starting new message

    // Add user message
    const userMessage: ChatMessageType = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
      files: uploadedFiles?.map(file => ({
        id: file.id,
        name: file.name,
        size: file.size,
        type: file.type
      })) || []
    };
    messages = [...messages, userMessage];

    // Prepare streaming message
    let pendingStreamingMessage: ChatMessageType | null = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      isStreaming: true,
      model: selectedModel,
      toolCalls: [] as ToolCall[],
      toolsResults: [] as ToolResult[],
      mergedWebSearch: null as MergedToolResult | null,
    };

    let messageAddedToArray = $state(false);
    let pendingConversationId = conversationId;
    const streamAbortController = new AbortController();
    activeStreamAbortController = streamAbortController;
    activeStreamMessageId = pendingStreamingMessage.id;
    activeStreamBackendMessageId = null;
    isCancellingStream = false;
    // How many generated images have arrived for this assistant message (an
    // image model may return more than one — cap is a model property).
    let generatedImageIndex = 0;
    resetArtifactState();
    isTyping = true;
    scrollToBottom();

    // Update ui with a copy of the pending streaming message
    currentStreamingMessage = {...pendingStreamingMessage};

    // Disables switching conversation while initializing new conversation
    window.dispatchEvent(new CustomEvent('initializingConversation'));

    try {
      await sendMessage({
        message: content,
        conversationId: conversationId || undefined,
        provider: selectedProvider,
        modelName: selectedModel,
        uploadedFiles: uploadedFiles,
        webSearch: webSearch,
        selectedMcpServers,
        signal: streamAbortController.signal,

        onConversationInitialized: ({newConversationId}) => {
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
          window.dispatchEvent(new CustomEvent('refreshChatHistory'));
        },
        onStreamingStart: (messageId) => {              
          if (pendingStreamingMessage) {
            messageAddedToArray = true;
            pendingStreamingMessage = {...pendingStreamingMessage, id: messageId};
            activeStreamMessageId = messageId;
            activeStreamBackendMessageId = messageId;
            currentStreamingMessage = {...pendingStreamingMessage};
            messages = [...messages, currentStreamingMessage as ChatMessageType];

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
              activeStreamMessageId = pendingStreamingMessage.id;
            }
            if (token.trim()) isTyping = false;
            
            // Create a new message object with updated content
            pendingStreamingMessage = {
              ...pendingStreamingMessage,
              content: pendingStreamingMessage.content + token
            };

            // Update the current streaming message
            currentStreamingMessage = {...pendingStreamingMessage};

            // Update the message in the array
            messages = messages.map(m =>
              m.id === pendingStreamingMessage?.id ? currentStreamingMessage as ChatMessageType : m
            );

            isLoading = true;
            scrollToStreamingMessageTop(pendingStreamingMessage.id);
          }
        },
        onBudgetWarning: (data) => {
          if(pendingStreamingMessage){
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
              activeStreamMessageId = pendingStreamingMessage.id;
            }
            // Merge by tool_id: update existing entry or add new one
            const existingCalls = pendingStreamingMessage.toolCalls || [];
            const existingIndex = existingCalls.findIndex(tc => tc.tool_id === toolCall.tool_id);
            let updatedToolCalls;
            if (existingIndex >= 0) {
              updatedToolCalls = [...existingCalls];
              updatedToolCalls[existingIndex] = toolCall;
            } else {
              updatedToolCalls = [...existingCalls, toolCall];
            }
            const mergedWebSearch = mergeWebSearchResults(updatedToolCalls, pendingStreamingMessage.toolsResults || [], 'running');

            pendingStreamingMessage = {
              ...pendingStreamingMessage,
              toolCalls: updatedToolCalls,
              mergedWebSearch: mergedWebSearch,
            };

            currentStreamingMessage = {...pendingStreamingMessage};

            // Update the message in the array
            messages = messages.map(m => 
              m.id === pendingStreamingMessage?.id ? currentStreamingMessage as ChatMessageType : m
            );

            isLoading = true;
            scrollToStreamingMessageTop(pendingStreamingMessage.id);
          }
        },
        onToolResult: (toolResult) => {
          if (pendingStreamingMessage) {
            // Update tool result
            const updatedToolResults = [...pendingStreamingMessage.toolsResults || [], toolResult];

            // Mark corresponding tool call as completed/error
            const updatedToolCalls = (pendingStreamingMessage.toolCalls || []).map(tc =>
              tc.tool_id === toolResult.tool_id
                ? { ...tc, status: (toolResult.status === 'error' ? 'error' : 'completed') as import('../../../types/toolCall').ToolCallStatus }
                : tc
            );

            const mergedWebSearch = mergeWebSearchResults(updatedToolCalls, updatedToolResults || [], 'running');

            pendingStreamingMessage = {
              ...pendingStreamingMessage,
              toolCalls: updatedToolCalls,
              toolsResults: updatedToolResults,
              mergedWebSearch
            };

            currentStreamingMessage = {...pendingStreamingMessage};

            // Update the message in the array
            messages = messages.map(m =>
              m.id === pendingStreamingMessage?.id ? currentStreamingMessage as ChatMessageType : m
            );

            isLoading = true;
            scrollToStreamingMessageTop(pendingStreamingMessage.id);
          }
        },
        onArtifact: (artifact) => {
          if (pendingStreamingMessage && !messageAddedToArray) {
            messages = [...messages, pendingStreamingMessage];
            messageAddedToArray = true;
            activeStreamMessageId = pendingStreamingMessage.id;
          }
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
              type: image.content_type || 'image/png',
              size: 0,
            };
            generatedImageIndex += 1;

            pendingStreamingMessage = {
              ...pendingStreamingMessage,
              files: [...(pendingStreamingMessage.files || []), generatedFile],
            };

            currentStreamingMessage = { ...pendingStreamingMessage };
            messages = messages.map(m =>
              m.id === pendingStreamingMessage?.id ? currentStreamingMessage as ChatMessageType : m
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
              activeStreamMessageId = pendingStreamingMessage.id;
            }
            const existingRequests = pendingStreamingMessage.mcpAuthRequests || [];
            const alreadyExists = existingRequests.some(r => r.server_id === authRequest.server_id);
            if (!alreadyExists) {
              pendingStreamingMessage = {
                ...pendingStreamingMessage,
                mcpAuthRequests: [...existingRequests, authRequest],
              };

              currentStreamingMessage = {...pendingStreamingMessage};

              messages = messages.map(m =>
                m.id === pendingStreamingMessage?.id ? currentStreamingMessage as ChatMessageType : m
              );

              isLoading = true;
              scrollToStreamingMessageTop(pendingStreamingMessage.id);
            }
          }
        },
        onDone: async (_data) => {
          if (pendingStreamingMessage) {
            let updatedMergedWebSearch = null;
            if(pendingStreamingMessage.mergedWebSearch) {
              updatedMergedWebSearch = {...pendingStreamingMessage.mergedWebSearch, status: 'completed'};
            }

            // Finalize any tool call that never received a tool_result so the
            // in-progress loader stops spinning after the stream ends.
            const resultIds = new Set((pendingStreamingMessage.toolsResults || []).map(tr => tr.tool_id));
            const finalizedToolCalls = (pendingStreamingMessage.toolCalls || []).map(tc =>
              tc.status === 'completed' || tc.status === 'error' || resultIds.has(tc.tool_id)
                ? tc
                : { ...tc, status: 'error' as import('../../../types/toolCall').ToolCallStatus }
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
              artifacts: [...streamingArtifacts.values()].map(a => ({
                id: a.id,
                title: a.title,
                content_type: a.contentType,
              })),
            };

            currentStreamingMessage = {...pendingStreamingMessage};

            // Update the message in the array
            messages = messages.map(m =>
              m.id === pendingStreamingMessage?.id ? currentStreamingMessage as ChatMessageType : m
            );

            // Streaming finished — clear the per-artifact streaming flag so the
            // panel enables download/save.
            panelArtifacts = panelArtifacts.map(a => ({ ...a, streaming: false }));
            streamingArtifacts = new Map();
          }
        },
        onError: (errorMessage) => {
          // Store the error - it should be an ApiError instance
          const apiError = errorMessage instanceof ApiError 
            ? errorMessage 
            : new ApiError(500, errorMessage instanceof Error ? errorMessage.message : String(errorMessage));
          
          error = apiError;
          if (pendingStreamingMessage) {
            // Update the error in the message
            pendingStreamingMessage = {
              ...pendingStreamingMessage,
              error: getLocalizedError(apiError, 'description', $_) || apiError.description,
              isStreaming: false,
            };
            
            // Update the message in the array
            currentStreamingMessage = {...pendingStreamingMessage};
            messages = messages.map(m => 
              m.id === pendingStreamingMessage?.id ? currentStreamingMessage as ChatMessageType : m
            );

            isLoading = true;
            scrollToStreamingMessageTop(pendingStreamingMessage.id);
          }
          resetArtifactState();
        },
      });
    } catch (err) {
      // Convert all errors to ApiError for consistent handling
      const apiError = err instanceof ApiError 
        ? err 
        : new ApiError(500, err instanceof Error ? err.message : $_('chat.errors.failedToSendMessage'));
      
      error = apiError;
    } finally {
      // Reset states      
      isTyping = false;
      isLoading = false;
      currentStreamingMessage = null;
      pendingStreamingMessage = null;
      if (activeStreamAbortController === streamAbortController) {
        activeStreamAbortController = null;
        activeStreamMessageId = null;
        activeStreamBackendMessageId = null;
        isCancellingStream = false;
      }

      // Refocus input after exception
      await tick();
      messageInput?.focus();
    }
  }

  function handleEditMessage(id: string, newContent: string) {
    messages = messages.map(msg => 
      msg.id === id ? { ...msg, content: newContent } : msg
    );
  }

  function handleMcpAuthStatusChange(messageId: string, serverId: string, status: McpAuthRequest['status']) {
    messages = messages.map(msg => {
      if (msg.id !== messageId || !msg.mcpAuthRequests) return msg;
      return {
        ...msg,
        mcpAuthRequests: msg.mcpAuthRequests.map(r =>
          r.server_id === serverId ? { ...r, status } : r
        ),
      };
    });
  }

  function handleMcpAuthConnected(messageId: string, serverId: string) {
    messages = messages.map(msg => {
      if (msg.id !== messageId || !msg.mcpAuthRequests) return msg;
      return {
        ...msg,
        mcpAuthRequests: msg.mcpAuthRequests.map(r =>
          r.server_id === serverId ? { ...r, status: 'connected' as const } : r
        ),
      };
    });

    // Check if all auth requests for this message are now connected
    const msg = messages.find(m => m.id === messageId);
    if (msg?.mcpAuthRequests?.every(r => r.status === 'connected')) {
      continueProcessingRequest(messageId);
    }
  }

  function handleMcpAuthError(messageId: string, serverId: string, errorMsg: string) {
    messages = messages.map(msg => {
      if (msg.id !== messageId || !msg.mcpAuthRequests) return msg;
      return {
        ...msg,
        mcpAuthRequests: msg.mcpAuthRequests.map(r =>
          r.server_id === serverId ? { ...r, status: 'error' as const, error: errorMsg } : r
        ),
      };
    });
  }

  async function continueProcessingRequest(assistantMessageId: string) {
    // Find the user message that preceded this assistant message
    const msgIndex = messages.findIndex(m => m.id === assistantMessageId);
    if (msgIndex <= 0) return;

    const userMessage = messages[msgIndex - 1];
    if (userMessage?.role !== 'user') return;

    let generatedImageIndex = 0;

    // Set up pending streaming message for the existing assistant message
    let pendingStreamingMessage: ChatMessageType | null = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      isStreaming: true,
      model: selectedModel,
      toolCalls: [] as ToolCall[],
      toolsResults: [] as ToolResult[],
      mergedWebSearch: null as MergedToolResult | null,
    };
    const streamAbortController = new AbortController();
    activeStreamAbortController = streamAbortController;
    activeStreamMessageId = assistantMessageId;
    activeStreamBackendMessageId = assistantMessageId;
    isCancellingStream = false;

    // Update the assistant message to show processing state
    messages = messages.map(msg => {
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
        uploadedFiles: userMessage.files?.map(f => ({ 
          id: f.id, 
          name: f.name || '', 
          size: f.size || 0, 
          type: f.type || '' 
        })),
        webSearch: webSearchEnabled,
        selectedMcpServers,
        signal: streamAbortController.signal,

        onConversationInitialized: ({newConversationId}) => {
          if (newConversationId && newConversationId !== conversationId) {
            conversationId = newConversationId;
            updateUrlWithConversationId(newConversationId);
          }
          if (newConversationId) void linkPendingProject(newConversationId);
          if (newConversationId) void linkPendingSkills(newConversationId);
          window.dispatchEvent(new CustomEvent('refreshChatHistory'));
        },
        onStreamingStart: (messageId) => {
          if (pendingStreamingMessage) {
            pendingStreamingMessage = { ...pendingStreamingMessage, id: messageId };
            activeStreamMessageId = messageId;
            activeStreamBackendMessageId = messageId;
            
            // Update the existing assistant message with the real message ID
            messages = messages.map(msg => {
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
              content: pendingStreamingMessage.content + token
            };

            // Update the message in the array
            messages = messages.map(m => 
              m.id === pendingStreamingMessage?.id ? pendingStreamingMessage as ChatMessageType : m
            );
          }
        },
        onToolCall: (toolCall) => {
          if (pendingStreamingMessage) {
            // Merge by tool_id: update existing entry or add new one
            const existingCalls = pendingStreamingMessage.toolCalls || [];
            const existingIndex = existingCalls.findIndex(tc => tc.tool_id === toolCall.tool_id);
            let updatedToolCalls;
            if (existingIndex >= 0) {
              updatedToolCalls = [...existingCalls];
              updatedToolCalls[existingIndex] = toolCall;
            } else {
              updatedToolCalls = [...existingCalls, toolCall];
            }
            const mergedWebSearch = mergeWebSearchResults(updatedToolCalls, pendingStreamingMessage.toolsResults || [], 'running');

            pendingStreamingMessage = {
              ...pendingStreamingMessage,
              toolCalls: updatedToolCalls,
              mergedWebSearch: mergedWebSearch,
            };

            // Update the message in the array
            messages = messages.map(m => 
              m.id === pendingStreamingMessage?.id ? pendingStreamingMessage as ChatMessageType : m
            );
          }
        },
        onToolResult: (toolResult) => {
          if (pendingStreamingMessage) {
            const updatedToolResults = [...pendingStreamingMessage.toolsResults || [], toolResult];

            // Mark corresponding tool call as completed/error
            const updatedToolCalls = (pendingStreamingMessage.toolCalls || []).map(tc =>
              tc.tool_id === toolResult.tool_id
                ? { ...tc, status: (toolResult.status === 'error' ? 'error' : 'completed') as import('../../../types/toolCall').ToolCallStatus }
                : tc
            );

            const mergedWebSearch = mergeWebSearchResults(updatedToolCalls, updatedToolResults || [], 'running');

            pendingStreamingMessage = {
              ...pendingStreamingMessage,
              toolCalls: updatedToolCalls,
              toolsResults: updatedToolResults,
              mergedWebSearch
            };

            // Update the message in the array
            messages = messages.map(m =>
              m.id === pendingStreamingMessage?.id ? pendingStreamingMessage as ChatMessageType : m
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
              name: generatedImageName(userMessage.content, generatedImageIndex),
              type: image.content_type || 'image/png',
              size: 0,
            };
            generatedImageIndex += 1;

            pendingStreamingMessage = {
              ...pendingStreamingMessage,
              files: [...(pendingStreamingMessage.files || []), generatedFile],
            };

            messages = messages.map(m =>
              m.id === pendingStreamingMessage?.id ? pendingStreamingMessage as ChatMessageType : m
            );
            isTyping = false;
            isLoading = true;
          }
        },
        onDone: async (_data) => {
          if (pendingStreamingMessage) {
            let updatedMergedWebSearch = null;
            if(pendingStreamingMessage.mergedWebSearch) {
              updatedMergedWebSearch = {...pendingStreamingMessage.mergedWebSearch, status: 'completed'};
            }

            // Finalize any tool call that never received a tool_result so the
            // in-progress loader stops spinning after the stream ends.
            const resultIds = new Set((pendingStreamingMessage.toolsResults || []).map(tr => tr.tool_id));
            const finalizedToolCalls = (pendingStreamingMessage.toolCalls || []).map(tc =>
              tc.status === 'completed' || tc.status === 'error' || resultIds.has(tc.tool_id)
                ? tc
                : { ...tc, status: 'error' as import('../../../types/toolCall').ToolCallStatus }
            );

            // Mark all tool calls as completed when the stream ends. Artifacts are
            // NOT inlined into the message text (ENGG-387) — see the send() path.
            pendingStreamingMessage = {
              ...pendingStreamingMessage,
              isStreaming: false,
              toolCalls: finalizedToolCalls,
              mergedWebSearch: updatedMergedWebSearch as MergedToolResult,
              artifacts: [...streamingArtifacts.values()].map(a => ({
                id: a.id,
                title: a.title,
                content_type: a.contentType,
              })),
            };

            // Update the message in the array
            messages = messages.map(m =>
              m.id === pendingStreamingMessage?.id ? pendingStreamingMessage as ChatMessageType : m
            );

            // Streaming finished — clear the per-artifact streaming flag so the
            // panel enables download/save.
            panelArtifacts = panelArtifacts.map(a => ({ ...a, streaming: false }));
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
            const errorMessage = getLocalizedError(error, 'description', $_) || (typeof error.detail === 'string' ? error.detail : error.detail?.description || 'Unknown error');
            pendingStreamingMessage = {
              ...pendingStreamingMessage,
              error: errorMessage,
              isStreaming: false,
            };
            
            // Update the message in the array
            messages = messages.map(m => 
              m.id === pendingStreamingMessage?.id ? pendingStreamingMessage as ChatMessageType : m
            );
          }
          resetArtifactState();
          isLoading = false;
          isTyping = false;
        }
      });
    } catch (err) {
      if (err instanceof ApiError) {
        error = err;
      } else {
        error = new ApiError(
          500,
          err instanceof Error ? err.message : 'Failed to process request'
        );
      }
      isLoading = false;
      isTyping = false;
    } finally {
      if (activeStreamAbortController === streamAbortController) {
        activeStreamAbortController = null;
        activeStreamMessageId = null;
        activeStreamBackendMessageId = null;
        isCancellingStream = false;
      }
    }
  }

  function filterLatestById<T extends { tool_id: string }>(arr?: T[] | null): T[] {
    if(!arr || !arr.length){
      return arr || [];
    }

    const uniqueIds = new Set<string>();
    const result: T[] = [];

    for(let i = arr.length - 1; i >= 0; i--) {
      if(!uniqueIds.has(arr[i].tool_id)) {
        uniqueIds.add(arr[i].tool_id);
        result.push(arr[i]);
      }
    }

    return result.reverse();
  }

  function mergeWebSearchResults(toolCalls: ToolCall[], toolsResults: ToolResult[], status: 'completed' | 'running' = 'completed'): MergedToolResult | null {
    // Get only web search tools
    const webSearchToolCalls = toolCalls.filter(tc => tc.kind === 'web_search');
    const webSearchToolResults = toolsResults.filter(tr => tr.kind === 'web_search');

    // If no web calls, return null
    if(!webSearchToolCalls || !webSearchToolCalls.length) {
      return null;
    }

    // If no results, return the last tool call
    if(!webSearchToolResults || !webSearchToolResults.length) {
      return {
        tool_name: toolCalls[toolCalls.length - 1].tool_name,
        kind: toolCalls[toolCalls.length - 1].kind,
        status
      }
    }

    // Remove duplicates having same tool_id
    const latestResultsByToolId = filterLatestById(webSearchToolResults);

    // Merge results
    const tool_name = latestResultsByToolId[0].tool_name; 
    const kind = latestResultsByToolId[0].kind;
    let query = latestResultsByToolId[0].web_search?.query || '';
    const queries = new Set<string>([]);
    const results = new Set<WebSearchResult>([]);

    latestResultsByToolId.forEach(curr => {
      // Update query
      if(curr.web_search?.query) {
        query = curr.web_search?.query;
      }

      // Add new queries
      curr.web_search?.queries?.forEach(query => {
        queries.add(query);
      });
      
      // Add new results
      curr.web_search?.results?.forEach(result => {
        results.add(result);
      });
    });

    return {
      tool_name,
      kind,
      web_search: {
        query,
        queries: Array.from(queries),
        results: Array.from(results)
      },
      status
    };
  }

  async function loadConversationFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const chatId = urlParams.get('chatId');
    const loadToken = ++conversationLoadToken;

    if (chatId) {
      try {
        isLoadingConversation = messages.length === 0;
        isLoading = true;
        error = null;
        showArtifactPanel = false;
        resetArtifactState();

        const conversation = await getConversation(chatId);
        if (loadToken !== conversationLoadToken) return;

        conversationId = chatId;

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
            if (tr?.status === 'error' && authUrl && serverId && !seenServerIds.has(serverId)) {
              seenServerIds.add(serverId);
              const matchingCall = toolCalls.find((tc: any) => tc.tool_id === tr.tool_id);
              mcpAuthRequests.push({
                server_id: serverId,
                server_name: out.server_name || serverId,
                tool_name: matchingCall?.tool_name || tr.tool_name || '',
                authorization_url: authUrl,
                scopes: out.scopes,
                status: 'pending',
              });
            }
          }

          return {
            id: msg.id,
            role: msg.role,
            content: msg.parts.text || '',
            timestamp: msg.created_at || new Date().toISOString(),
            model: msg.model,
            usage: msg.usage,
            files: msg.parts.files || [],
            toolCalls,
            toolsResults: toolResults,
            mergedWebSearch: mergeWebSearchResults(toolCalls, toolResults, 'completed'),
            mcpAuthRequests: mcpAuthRequests.length > 0 ? mcpAuthRequests : undefined,
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
          const lastMessage = conversation.messages[conversation.messages.length - 1];
          if (lastMessage.model) {
            modelToUse = lastMessage.model;
          }
        }

        if (modelToUse) {
          selectedModel = modelToUse;
          // Find the provider that contains this model
          const providerWithModel = providers.find(p => 
            p.models.some(m => m.key === modelToUse || m.name === modelToUse)
          );
          
          if (providerWithModel) {
            selectedProvider = providerWithModel.key;
            selectedModelInfo = providerWithModel;
          } else {
            // Fallback to default provider
            selectedProvider = 'openai';
            selectedModelInfo = providers.find(p => p.key === 'openai') || providers[0];
          }
        }
      } catch (err) {
        if (loadToken !== conversationLoadToken) return;

        // Convert all errors to ApiError for consistent handling
        const apiError = err instanceof ApiError 
          ? err 
          : new ApiError(500, err instanceof Error ? err.message : $_('chat.errors.failedToLoadConversation'));
        
        error = apiError;
        console.error('Failed to load conversation:', err);
        messages = []; // Clear messages on error
      } finally {
        if (loadToken !== conversationLoadToken) return;

        isLoading = false;
        isLoadingConversation = false;
        
        // Wait for Svelte to finish updating the DOM with the new messages.
        await tick();
        
        if (messagesContainer) {
          // Save the original scroll behavior (likely 'smooth' from CSS).
          // We'll temporarily change it to 'auto' to prevent smooth scrolling animation.
          const container = messagesContainer;
          const originalScrollBehavior = container.style.scrollBehavior;
          container.style.scrollBehavior = 'auto';
          
          requestAnimationFrame(() => {
            void container.offsetHeight;
            container.scrollTop = container.scrollHeight;
            container.style.scrollBehavior = originalScrollBehavior;
          });
        }

        if (window.matchMedia('(pointer: fine)').matches) {
          messageInput?.focus();
        }
      }
    } else {
      // No chatId in URL, clear everything
      conversationId = null;
      messages = [];
      error = null;
      isLoading = false;
      isLoadingConversation = false;
      showArtifactPanel = false;
      resetArtifactState();

      // Set model and provider from query params or defaults
      selectedModel = urlParams.get('model') || 'gpt-5.2';
      selectedProvider = urlParams.get('provider') || 'openai';
      selectedModelInfo = providers.find(p => p.key === selectedProvider) || providers[0];
      webSearchEnabled = urlParams.get('webSearch') === 'true';

      const mcpServersParam = urlParams.get('mcpServers');
      selectedMcpServers = mcpServersParam ? mcpServersParam.split(',') : [];

      // Chat started from a project workspace: remember it so the new conversation gets linked.
      // Keep projectId in the URL so the association survives a reload before the first message
      // and stays visible while chatting; linking runs once (pendingProjectId is cleared after).
      pendingProjectId = urlParams.get('projectId');

      if (pendingProjectId) {
        loadProjectMcpServers(pendingProjectId);
      }

      // Check for an initial message in URL
      const initialMessage = urlParams.get('message');
      if (initialMessage) {
        // Clear the message and configuration params from URL
        const url = new URL(window.location.href);
        url.searchParams.delete('message');
        url.searchParams.delete('model');
        url.searchParams.delete('provider');
        url.searchParams.delete('webSearch');
        url.searchParams.delete('mcpServers');
        window.history.replaceState({}, '', url.toString());

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

  $effect(() => {
    messages.length;
    showArtifactPanel;

    if (!chatLayoutElement) {
      return;
    }

    requestAnimationFrame(syncChatViewportHeight);
  });

  onMount(() => {
    scrollToBottom(false);
    loadConversationFromUrl();
    loadModels();
    loadMcpServers();
    syncChatViewportHeight();

    // Focus the chat input if nothing else is focused
    if (!document.activeElement || document.activeElement === document.body) {
      messageInput?.focus();
    }

    // Listen for URL changes (when using history.pushState)
    window.addEventListener('popstate', handleUrlChange);
    window.visualViewport?.addEventListener('resize', syncChatViewportHeight);
    window.visualViewport?.addEventListener('scroll', syncChatViewportHeight);
    window.addEventListener('resize', syncChatViewportHeight);

    // Listen for focus chat input event (from Sidebar "New Chat" button)
    window.addEventListener('focusChatInput', handleFocusChatInput);

    // Also listen for custom pushstate events
    const originalPushState = history.pushState;
    history.pushState = function(...args) {
      originalPushState.apply(history, args);
      setTimeout(handleUrlChange, 0); // Small delay to ensure URL is updated
    };

    return () => {
      window.removeEventListener('popstate', handleUrlChange);
      window.visualViewport?.removeEventListener('resize', syncChatViewportHeight);
      window.visualViewport?.removeEventListener('scroll', syncChatViewportHeight);
      window.removeEventListener('resize', syncChatViewportHeight);
      window.removeEventListener('focusChatInput', handleFocusChatInput);
      history.pushState = originalPushState;
    };
  });
</script>

{#if isLoadingConversation && messages.length === 0}
  <!-- Loading state: wait until we know if there are messages -->
  <div class="chat-container chat-container--loading" role="status" aria-label={$_('chat.messageInput.loadingModels')} aria-busy="true"></div>
{:else if messages.length === 0}
  <!-- Empty state: centered layout with input included -->
  <div class="chat-container chat-container--empty">
    <div class="empty-state-container">
      <div class="empty-icon-wrapper">
        <div class="empty-icon" aria-hidden="true">
          <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
        </div>
      </div>
      <div class="empty-content">
        <h1>{$_('chat.emptyState.title')}</h1>
        <p>{$_('chat.emptyState.description')}</p>
      </div>
      <div class="empty-state-input">
        <MessageInput
          bind:this={messageInput}
          onSend={handleSendMessage}
          onCancel={handleCancelStream}
          canCancel={canCancelStream}
          disabled={isLoading}
          cancelling={isCancellingStream}
          placeholder={selectedIsImageModel
            ? $_('chat.messageInput.placeholderImage')
            : $_('chat.messageInput.placeholderWithModel', { values: { model: selectedModel } })}
          imageModelSelected={selectedIsImageModel}
          {selectedModel}
          {selectedProvider}
          {mcpServers}
          {selectedMcpServers}
          {loadingMcpServers}
          {mcpServersError}
          {webSearchEnabled}
          onWebSearchToggle={() => webSearchEnabled = !webSearchEnabled}
          onMcpToggle={toggleMcpServer}
          onRemoveModel={handleRemoveModel}
          onModelSelect={selectModel}
          {providers}
          {loadingModels}
          {modelsError}
          {conversationId}
          bind:pendingSkillIds
        />
        <p class="ai-disclaimer">{$_('chat.emptyState.aiDisclaimer')}</p>
      </div>
    </div>

    {#if error && !currentStreamingMessage}
      <div class="error-banner error-banner--centered" role="alert" aria-live="assertive" class:error-banner--warning={error.externalCode === 'budget_warning'}>
        <div class="error-icon" aria-hidden="true">
          {#if error.externalCode === 'budget_warning'}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3.05h16.94a2 2 0 0 0 1.71-3.05l-8.47-14.14a2 2 0 0 0-3.42 0z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
          {:else}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
          {/if}
        </div>
        <div class="error-content">
          <span class="error-title">
            {getLocalizedError(error, 'description', $_) || $_('error.fallback.description')}
          </span>
          {#if getLocalizedError(error, 'solution', $_)}
            <span class="error-message">
              {getLocalizedError(error, 'solution', $_)}
            </span>
          {/if}
        </div>
        <button class="dismiss-btn" onclick={() => error = null} aria-label={$_('chat.errors.dismissError')} title={$_('chat.errors.dismissError')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    {/if}
  </div>
{:else}
  <!-- Active chat: bottom-anchored input -->
  <div class="chat-layout" bind:this={chatLayoutElement} class:chat-layout--with-artifact={showArtifactPanel}>
  <div class="chat-container">
    <div class="messages-container" bind:this={messagesContainer} onscroll={handleScroll} role="log" aria-live="polite" aria-label={$_('chat.messageInput.messageInput')}>
      <div class="messages-inner">
        {#each messages as message (message.id)}          
          <!-- Chat message -->
          <ChatMessage
            {message}
            streamingArtifacts={activeStreamMessageId === message.id ? panelArtifacts : []}
            onEdit={handleEditMessage}
            selectedModelInfo={selectedModelInfo}
            providers={providers}
            onMcpAuthConnected={(serverId) => handleMcpAuthConnected(message.id, serverId)}
            onMcpAuthError={(serverId, err) => handleMcpAuthError(message.id, serverId, err)}
            onMcpAuthStatusChange={(serverId, status) => handleMcpAuthStatusChange(message.id, serverId, status)}
            onShowArtifact={handleShowArtifact}
          />
        {/each}

        {#if isTyping}
          <div role="status" aria-label={$_('chat.messageInput.loadingModels')} aria-live="polite">
            <TypingIndicator />
          </div>
        {/if}

        {#if error && !currentStreamingMessage}
          <div class="error-banner" role="alert" aria-live="assertive" class:error-banner--warning={error.externalCode === 'budget_warning'}>
            <div class="error-icon" aria-hidden="true">
              {#if error.externalCode === 'budget_warning'}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3.05h16.94a2 2 0 0 0 1.71-3.05l-8.47-14.14a2 2 0 0 0-3.42 0z"></path>
                  <line x1="12" y1="9" x2="12" y2="13"></line>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
              {:else}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
              {/if}
            </div>
            <div class="error-content">
              <span class="error-title">
                {getLocalizedError(error, 'description', $_) || $_('error.fallback.description')}
              </span>
              {#if getLocalizedError(error, 'solution', $_)}
                <span class="error-message">
                  {getLocalizedError(error, 'solution', $_)}
                </span>
              {/if}
            </div>
            <button class="dismiss-btn" onclick={() => error = null} aria-label={$_('chat.errors.dismissError')} title={$_('chat.errors.dismissError')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
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
        onCancel={handleCancelStream}
        canCancel={canCancelStream}
        disabled={isLoading}
        cancelling={isCancellingStream}
        placeholder={$_('chat.messageInput.placeholderWithModel', { values: { model: selectedModel } })}
        {selectedModel}
        {selectedProvider}
        {mcpServers}
        {selectedMcpServers}
        {loadingMcpServers}
        {mcpServersError}
        {webSearchEnabled}
        onWebSearchToggle={() => webSearchEnabled = !webSearchEnabled}
        onMcpToggle={toggleMcpServer}
        onRemoveModel={handleRemoveModel}
        onModelSelect={selectModel}
        {providers}
        {loadingModels}
        {modelsError}
        {conversationId}
        bind:pendingSkillIds
      />
      <p class="ai-disclaimer">{$_('chat.emptyState.aiDisclaimer')}</p>
    </div>
  </div>

  {#if showArtifactPanel}
    <button
      type="button"
      class="artifact-panel-backdrop"
      onclick={handleCloseArtifact}
      aria-label="Close artifact preview"
    ></button>
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
    height: 100%;
    width: 100%;
    min-height: 0;
    position: relative;
    overflow: hidden;
  }

  .chat-layout .chat-container {
    flex: 1;
    min-width: 0;
    transition: min-width 0.24s ease;
  }

  .chat-layout--with-artifact {
    display: grid;
    grid-template-columns: minmax(420px, 1fr) clamp(420px, 42vw, 760px);
  }

  .artifact-panel-wrapper {
    min-width: 0;
    height: 100%;
    position: relative;
    z-index: 2;
    border-left: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
    background: var(--bg-primary);
    box-shadow: -16px 0 40px rgba(0, 0, 0, 0.18);
  }

  .artifact-panel-backdrop {
    display: none;
  }

  .chat-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    width: 100%;
    background: var(--bg-primary);
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
    min-height: 0;
  }

  .messages-inner {
    /* Dynamic max-width: 90ch for readability, clamped between 600px and 65vw */
    max-width: clamp(600px, 90ch, 65vw);
    margin: 0 auto;
    width: 100%;
    padding: var(--space-2xl);
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .chat-container--empty {
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
  }

  .empty-state-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 2rem;
    gap: 1.5rem;
    width: 100%;
    max-width: 600px;
  }

  .empty-state-input {
    width: 100%;
    max-width: 100%;
  }

  .ai-disclaimer {
    margin: 0.5rem 0 0 0;
    font-size: 0.75rem;
    color: var(--text-tertiary, rgba(128, 128, 128, 0.6));
    text-align: center;
  }

  .input-container .ai-disclaimer {
    margin: 0.5rem 0 -0.5rem 0;
  }

  @media (max-width: 1180px), (hover: none) and (pointer: coarse) {
    .chat-layout--with-artifact {
      display: block;
    }

    .artifact-panel-backdrop {
      display: block;
      position: fixed;
      inset: 0;
      z-index: 1190;
      border: 0;
      padding: 0;
      background: rgba(0, 0, 0, 0.38);
      cursor: pointer;
    }

    .artifact-panel-wrapper {
      position: fixed;
      inset: auto 0 0 0;
      z-index: 1200;
      width: 100%;
      height: min(78vh, calc(var(--app-viewport-height, 100vh) - 56px));
      border-top: 1px solid var(--glass-border, rgba(255, 255, 255, 0.14));
      border-left: 0;
      border-radius: 0;
      overflow: visible;
      box-shadow: 0 -18px 50px rgba(0, 0, 0, 0.32);
    }
  }

  :global(html[data-app-layout='mobile']) .chat-layout--with-artifact {
    display: block;
  }

  :global(html[data-app-layout='mobile']) .artifact-panel-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 1190;
    border: 0;
    padding: 0;
    background: rgba(0, 0, 0, 0.38);
  }

  :global(html[data-app-layout='mobile']) .artifact-panel-wrapper {
    position: fixed;
    inset: auto 0 0 0;
    z-index: 1200;
    width: 100%;
    height: min(78vh, calc(var(--app-viewport-height, 100vh) - 56px));
    border-top: 1px solid var(--glass-border, rgba(255, 255, 255, 0.14));
    border-left: 0;
    border-radius: 0;
    overflow: visible;
    box-shadow: 0 -18px 50px rgba(0, 0, 0, 0.32);
  }

  @media (orientation: landscape) and (max-height: 640px) {
    .artifact-panel-wrapper,
    :global(html[data-app-layout='mobile']) .artifact-panel-wrapper {
      height: min(84vh, calc(var(--app-viewport-height, 100vh) - 24px));
    }
  }

  .error-banner--centered {
    position: absolute;
    bottom: 2rem;
    left: 50%;
    transform: translateX(-50%);
    max-width: 500px;
    width: calc(100% - 2rem);
  }

  .empty-icon-wrapper {
    position: relative;
  }

  .empty-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 120px;
    height: 120px;
    background: linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%);
    border-radius: 24px;
    color: var(--text-secondary);
    position: relative;
    animation: float 3s ease-in-out infinite;
  }

  @keyframes float {
    0%, 100% { transform: translateY(0px); }
    50% { transform: translateY(-10px); }
  }

  .empty-content h1 {
    margin: 0 0 0.5rem 0;
    font-size: 1.75rem;
    font-weight: 700;
    color: var(--text-primary);
    background: linear-gradient(135deg, var(--text-primary) 0%, #8b5cf6 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .empty-content p {
    margin: 0;
    font-size: 1rem;
    color: var(--text-secondary);
    max-width: 480px;
    line-height: 1.6;
  }

  .error-banner {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem 1.25rem;
    margin: 1rem 0;
    background: linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(239, 68, 68, 0.05) 100%);
    border: 1px solid rgba(239, 68, 68, 0.2);
    border-radius: 12px;
    color: #ef4444;
    backdrop-filter: blur(10px);
    animation: slideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;
    overflow: hidden;
  }

  .error-banner::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: linear-gradient(90deg, #ef4444 0%, #f87171 100%);
  }

  .error-banner--warning {
    background: linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, rgba(245, 158, 11, 0.05) 100%);
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

  .input-container {
    flex-shrink: 0;
    padding: 1.25rem 1.5rem calc(1rem + var(--app-safe-area-bottom));
    padding-top: 0;
    background: var(--bg-primary);
    position: relative;
    max-width: clamp(600px, 90ch, 65vw);
    margin: 0 auto;
    width: 100%;
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
    .chat-layout {
      height: var(--chat-visible-height, 100%);
      max-height: var(--chat-visible-height, 100%);
    }

    .chat-container {
      height: 100%;
      min-height: 0;
    }

    .messages-inner {
      padding: var(--space-md);
    }

    .messages-container {
      min-height: 0;
    }

    .empty-state-container {
      padding: 1.5rem 1rem;
      gap: 1rem;
    }

    .empty-icon {
      width: 100px;
      height: 100px;
    }

    .empty-content h1 {
      font-size: 1.5rem;
    }

    .input-container {
      padding: 0.75rem 1rem;
      padding-top: 0;
      padding-bottom: calc(0.75rem + var(--app-safe-area-bottom));
      max-width: 100%;
    }

    .ai-disclaimer {
      margin: 0.25rem 0 0 0;
      font-size: 0.75rem;
    }

    .input-container .ai-disclaimer {
      margin: 0.25rem 0 -0.25rem 0;
    }
  }

  @media (hover: none) and (pointer: coarse) {
    .chat-layout {
      height: var(--chat-visible-height, 100%);
      max-height: var(--chat-visible-height, 100%);
    }

    .chat-container {
      height: 100%;
      min-height: 0;
    }
  }

  :global(html[data-app-layout='mobile']) .chat-container {
    height: 100%;
    min-height: 0;
  }

  :global(html[data-app-layout='mobile']) .chat-layout {
    height: var(--chat-visible-height, 100%);
    max-height: var(--chat-visible-height, 100%);
  }

  :global(html[data-app-layout='mobile']) .messages-inner {
    max-width: 100%;
    padding: var(--space-md);
  }

  :global(html[data-app-layout='mobile']) .messages-container {
    min-height: 0;
  }

  :global(html[data-app-layout='mobile']) .input-container {
    padding: 0.75rem 1rem;
    padding-top: 0;
    padding-bottom: calc(0.75rem + var(--app-safe-area-bottom));
    max-width: 100%;
  }

  :global(html[data-app-layout='mobile']) .input-container .ai-disclaimer {
    margin: 0.25rem 0 -0.25rem 0;
  }

  @media (orientation: landscape) and (max-height: 600px) {
    :global(html[data-app-layout='mobile']) .messages-inner {
      padding: var(--space-sm) var(--space-md);
      gap: var(--space-xs);
    }

    :global(html[data-app-layout='mobile']) .input-container {
      padding: 0.35rem 0.75rem;
      padding-top: 0;
      padding-bottom: calc(0.4rem + var(--app-safe-area-bottom));
    }

    :global(html[data-app-layout='mobile']) .ai-disclaimer {
      display: none;
    }

    :global(html[data-app-layout='mobile']) .empty-state-container {
      padding: var(--space-sm);
      gap: var(--space-sm);
    }

    :global(html[data-app-layout='mobile']) .empty-content p {
      display: none;
    }

    :global(html[data-app-layout='mobile']) .empty-icon {
      width: 44px;
      height: 44px;
      border-radius: 12px;
      animation: none;
    }

    :global(html[data-app-layout='mobile']) .empty-icon svg {
      width: 28px;
      height: 28px;
    }

    :global(html[data-app-layout='mobile']) .empty-content h1 {
      font-size: 1.15rem;
      margin-bottom: 0;
    }
  }

  @media (max-width: 480px) {
    .empty-icon {
      width: 80px;
      height: 80px;
    }

    .empty-content h1 {
      font-size: 1.25rem;
    }

    .empty-content p {
      font-size: 0.875rem;
    }
  }
</style>
