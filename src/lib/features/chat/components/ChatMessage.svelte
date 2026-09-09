<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import type { ChatMessage, McpAuthRequest } from "../../../types/chat";
  import type { ToolResult } from "../../../types/toolCall";
  import { renderMarkdown, copyToClipboard } from "../../../utils/markdown";
  import {
    providerIconSvg,
    providerIconUrl,
  } from "../../../utils/providerIcon";
  import { onMount, onDestroy, tick } from "svelte";
  import {
    findModel,
    isImageModel,
    type ProviderInfo,
  } from "../../../api/models";

  let isDarkMode = $state(false);

  function syncThemeState() {
    isDarkMode =
      document.documentElement.classList.contains("dark") ||
      window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function getIconForTheme(provider?: ProviderInfo): string | undefined {
    if (!provider) return undefined;
    return isDarkMode ? provider.icon_dark || provider.icon : provider.icon;
  }

  // Highlight.js themes are imported statically in app.css and gated by
  // prefers-color-scheme media queries, so we only need to keep isDarkMode
  // in sync for provider-icon swapping below.
  onMount(() => {
    syncThemeState();
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaQuery.addEventListener("change", syncThemeState);
    return () => mediaQuery.removeEventListener("change", syncThemeState);
  });
  import {
    speechSynthesisSupported,
    subscribeTTSState,
    toggleSpeaking,
    stopSpeaking,
    type TTSState,
  } from "../../../utils/tts";
  import { downloadFile } from "../../../api/fileApi";
  import { _ } from "svelte-i18n";
  import { get } from "svelte/store";
  import WebSearch from "./WebSearch.svelte";
  import ToolCallTimeline from "./ToolCallTimeline.svelte";
  import McpOAuthPrompt from "./McpOAuthPrompt.svelte";
  import {
    extractMessageArtifacts,
    stripArtifactTags,
    type ArtifactItem,
  } from "../artifacts";

  interface Props {
    message: ChatMessage & {
      files?: Array<{ id: string; name?: string; type?: string }>;
    };
    onEdit?: (id: string, newContent: string) => void;
    selectedModelInfo?: ProviderInfo;
    providers?: ProviderInfo[];
    onMcpAuthConnected?: (serverId: string) => void;
    onMcpAuthError?: (serverId: string, error: string) => void;
    onMcpAuthStatusChange?: (
      serverId: string,
      status: McpAuthRequest["status"],
    ) => void;
    onShowArtifact?: (artifacts: ArtifactItem[], index: number) => void;
  }

  let {
    message,
    onEdit,
    selectedModelInfo,
    providers,
    onMcpAuthConnected,
    onMcpAuthError,
    onMcpAuthStatusChange,
    onShowArtifact,
  }: Props = $props();
  let isEditing = $state(false);
  let editContent = $state(message.content);
  let showActions = $state(false);
  let messageContainer: HTMLDivElement;
  let editTextarea: HTMLTextAreaElement | undefined;

  // TTS state
  let ttsState = $state<TTSState>({
    messageId: null,
    isSpeaking: false,
    isPaused: false,
    utterance: null,
  });
  let unsubscribeTTS: (() => void) | null = null;

  const isSpeaking = $derived(
    ttsState.messageId === message.id &&
      ttsState.isSpeaking &&
      !ttsState.isPaused,
  );
  const isPaused = $derived(
    ttsState.messageId === message.id &&
      ttsState.isSpeaking &&
      ttsState.isPaused,
  );
  const isActive = $derived(
    ttsState.messageId === message.id && ttsState.isSpeaking,
  );

  /**
   * True when this turn ran on an image-generation model — the design tints the
   * user bubble navy instead of green for image turns. Resolved from the
   * registry, so an unknown/absent model simply keeps the default green.
   */
  const isImageTurn = $derived(
    isImageModel(findModel(providers ?? [], message.model)?.model),
  );

  // Find the provider that matches the message's model
  const messageProvider = $derived(
    providers?.find((provider) =>
      provider.models.some(
        (model) => model.key === message.model || model.key === message.model,
      ),
    ),
  );

  function handleTTSToggle() {
    toggleSpeaking(message.id, message.content);
  }

  function handleTTSStop() {
    stopSpeaking();
  }

  /**
   * ".conv-ai-logo" letter fallback: the provider's initial, shown only when the
   * registry has no icon for this message's provider.
   */
  const providerLetter = $derived(
    (messageProvider?.name || messageProvider?.key || "?")
      .charAt(0)
      .toUpperCase(),
  );

  let renderedContent = $state("");
  let isRenderingMarkdown = $state(false);
  // Every artifact belonging to this message, taken ONLY from the backend's
  // structured `parts.artifacts` metadata (ENGG-387). The client never parses
  // <artifact> tags or code fences to *derive* artifacts — content is fetched
  // by id in the panel.
  let artifactContents = $derived<ArtifactItem[]>(
    extractMessageArtifacts(message.artifacts),
  );

  let hasPreviewableContent = $derived(artifactContents.length > 0);

  // Strip the server-delimited <artifact> block from the shown text so the chat
  // renders clean prose (the artifact itself is surfaced via its card/panel).
  let displayContent = $derived(stripArtifactTags(message.content));

  // Async markdown rendering with copy button addition
  $effect(() => {
    const contentToRender =
      message.role === "assistant" ? displayContent : message.content;
    const render = async () => {
      if (message.role === "assistant") {
        isRenderingMarkdown = true;
        try {
          renderedContent = await renderMarkdown(contentToRender);
          await tick();
          addCopyButtonsToCodeBlocks();
        } catch {
          renderedContent = `<p>${contentToRender}</p>`;
        } finally {
          isRenderingMarkdown = false;
        }
      } else {
        renderedContent = contentToRender;
      }
    };

    render();
  });

  // Toggle actions visibility on tap (for touch devices)
  function handleMessageTap(e: MouseEvent) {
    // Don't toggle if clicking on action buttons or links
    const target = e.target as HTMLElement;
    if (
      target.closest(".message-actions") ||
      target.closest("a") ||
      target.closest("button")
    ) {
      return;
    }
    showActions = !showActions;
  }

  function handleMessageKeydown(e: KeyboardEvent) {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      showActions = !showActions;
    }
  }

  // Close actions when clicking outside (for touch devices)
  function handleClickOutside(e: MouseEvent) {
    if (messageContainer && !messageContainer.contains(e.target as Node)) {
      showActions = false;
    }
  }

  onMount(() => {
    document.addEventListener("click", handleClickOutside);

    // Subscribe to TTS state changes
    if (speechSynthesisSupported) {
      unsubscribeTTS = subscribeTTSState((newState) => {
        ttsState = newState;
      });
    }

    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  });

  onDestroy(() => {
    // Clean up TTS subscription
    if (unsubscribeTTS) {
      unsubscribeTTS();
    }
    // Stop TTS if this message was speaking
    if (ttsState.messageId === message.id && ttsState.isSpeaking) {
      stopSpeaking();
    }
  });

  function startEdit() {
    if (message.role !== "user" || message.isStreaming) return;
    isEditing = true;
    editContent = message.content;
    tick().then(() => {
      if (editTextarea) {
        editTextarea.focus();
        editTextarea.style.height = "auto";
        editTextarea.style.height = editTextarea.scrollHeight + "px";
      }
    });
  }

  function cancelEdit() {
    isEditing = false;
    editContent = message.content;
  }

  function saveEdit() {
    if (editContent.trim() && onEdit) {
      onEdit(message.id, editContent.trim());
      isEditing = false;
    }
  }

  let copySuccess = $state(false);

  // File blob URLs state
  let fileBlobUrls = $state<Map<string, string>>(new Map());
  let fileLoadingStates = $state<Map<string, boolean>>(new Map());

  // Image preview modal state
  let previewImage = $state<{ url: string; name: string } | null>(null);

  function openImagePreview(blobUrl: string, fileName: string) {
    previewImage = { url: blobUrl, name: fileName };
  }

  function closeImagePreview() {
    previewImage = null;
  }

  // Middle slot of the ".image-card__overlay" pill: copy the rendered image to
  // the clipboard. Silently no-ops where the async clipboard image API is
  // unavailable, so the other two actions keep working.
  let imageCopied = $state(false);

  async function copyImageToClipboard(blobUrl: string) {
    try {
      const blob = await (await fetch(blobUrl)).blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob }),
      ]);
      imageCopied = true;
      setTimeout(() => {
        imageCopied = false;
      }, 2000);
    } catch (err) {
      console.error("Failed to copy image:", err);
    }
  }

  // Download a rendered image (generated or attached) to the user's device,
  // reusing the authenticated file download. Falls back to fetching if the
  // blob URL isn't cached yet.
  async function downloadImageFile(fileId: string, fileName: string) {
    let blobUrl = fileBlobUrls.get(fileId);
    if (!blobUrl) {
      const fetched = await downloadFile(fileId);
      if (!fetched) return;
      blobUrl = fetched;
    }
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = sanitizeDownloadName(fileName);
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // Turn a prompt-derived alt/name into a safe, readable download filename.
  function sanitizeDownloadName(name: string): string {
    const base =
      (name || "image")
        .replace(/[\\/:*?"<>|]+/g, " ")
        .trim()
        .slice(0, 80) || "image";
    return /\.[a-z0-9]+$/i.test(base) ? base : `${base}.png`;
  }

  async function handleFileClick(fileId: string, fileName: string) {
    try {
      // Download file with authentication
      const blobUrl = await downloadFile(fileId);
      if (blobUrl) {
        // Open blob URL in new tab
        window.open(blobUrl, "_blank");
      } else {
        console.error("Failed to download file");
      }
    } catch (err) {
      console.error("Error downloading file:", err);
    }
  }

  // Derived image count for dynamic grid sizing
  const imageFiles = $derived(
    message.files?.filter((f) => f.type?.startsWith("image/")) ?? [],
  );
  const imageCount = $derived(imageFiles.length);
  const nonImageFiles = $derived(
    message.files?.filter((f) => !f.type?.startsWith("image/")) ?? [],
  );

  // Helper functions for file handling
  function isImage(type?: string): boolean {
    return type?.startsWith("image/") || false;
  }

  function isVideo(type?: string): boolean {
    return type?.startsWith("video/") || false;
  }

  /**
   * Transcript attachment layouts (chat-empty-state.html round 4). The design
   * draws two of them and the file list decides which one a turn gets:
   *   - a lone image  → ".image-card", the 500px card with the filename/size
   *     meta bar, stacked above the green ".bubble--user"
   *   - anything else → ".attachment-grid" of 130px image/video tiles and
   *     220px file cards, stacked above the light ".msg-bubble-sent"
   */
  const attachedFiles = $derived(message.files ?? []);
  const soleImageFile = $derived(
    attachedFiles.length === 1 && isImage(attachedFiles[0].type)
      ? attachedFiles[0]
      : null,
  );
  const useImageCard = $derived(
    message.role === "user" && soleImageFile !== null,
  );
  const useAttachmentGrid = $derived(
    message.role === "user" && attachedFiles.length > 0 && !useImageCard,
  );

  /** Assistant image output — the design's ".msg-stack" (logo + borderless card + caption). */
  const generatedImages = $derived(message.role !== "user" ? imageFiles : []);
  const assistantOtherFiles = $derived(
    message.role !== "user" ? nonImageFiles : [],
  );

  /**
   * ".image-card__tag" — the design prints "Image/PNG", which is just the real
   * MIME type with each half capitalised. No mapping table, no guessing.
   */
  function mimeTag(type?: string): string {
    if (!type) return "";
    return type
      .split("/")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("/");
  }

  /** ".att-video__time" — real duration, read off the loaded video metadata. */
  let videoDurations = $state(new Map<string, string>());

  function formatDuration(seconds: number): string {
    if (!Number.isFinite(seconds)) return "";
    const total = Math.round(seconds);
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  function handleVideoMetadata(fileId: string, event: Event) {
    const el = event.currentTarget as HTMLVideoElement;
    const label = formatDuration(el.duration);
    if (!label) return;
    videoDurations.set(fileId, label);
    videoDurations = new Map(videoDurations);
  }

  function formatFileSize(bytes?: number): string {
    if (!bytes || bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  }

  // Load file binary data only for image files
  let loadedFileIds = new Set<string>();

  $effect(() => {
    const files = message.files;

    if (files && files.length > 0) {
      files.forEach((file) => {
        // Fetch blob URLs for images (inline render) and videos (poster frame
        // plus the real duration in ".att-video__time"), once each.
        if (
          (isImage(file.type) || isVideo(file.type)) &&
          !loadedFileIds.has(file.id)
        ) {
          loadedFileIds.add(file.id);

          // Set loading state immediately
          fileLoadingStates.set(file.id, true);
          fileLoadingStates = new Map(fileLoadingStates);

          // Load image asynchronously without blocking
          downloadFile(file.id)
            .then((blobUrl) => {
              if (blobUrl) {
                fileBlobUrls.set(file.id, blobUrl);
                fileBlobUrls = new Map(fileBlobUrls);
              }
              // Clear loading state
              fileLoadingStates.set(file.id, false);
              fileLoadingStates = new Map(fileLoadingStates);
            })
            .catch((err) => {
              console.error("Failed to load image:", err);
              fileLoadingStates.set(file.id, false);
              fileLoadingStates = new Map(fileLoadingStates);
            });
        }
      });
    }

    // Cleanup blob URLs when component unmounts
    return () => {
      fileBlobUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  });

  // Function to add copy buttons to code blocks
  function addCopyButtonsToCodeBlocks() {
    if (messageContainer && message.role === "assistant") {
      const codeBlocks = messageContainer.querySelectorAll("pre");
      codeBlocks.forEach((pre, index) => {
        if (!pre.querySelector(".copy-code-btn")) {
          const code = pre.querySelector("code");
          if (code) {
            const button = document.createElement("button");
            button.className = "copy-code-btn";
            const copyText = get(_)("chat.message.copy");
            const copiedText = get(_)("chat.message.copied");
            button.innerHTML = `
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="m5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              <span>${copyText}</span>
            `;
            button.onclick = async () => {
              const codeText = code.textContent || "";
              const success = await copyToClipboard(codeText);
              if (success) {
                button.innerHTML = `
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20,6 9,17 4,12"></polyline>
                  </svg>
                  <span>${copiedText}</span>
                `;
                setTimeout(() => {
                  button.innerHTML = `
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                      <path d="m5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                  `;
                }, 2000);
              }
            };
            pre.style.position = "relative";
            pre.appendChild(button);
          }
        }
      });
    }
  }

  async function copyMessageContent() {
    const success = await copyToClipboard(message.content);
    if (success) {
      copySuccess = true;
      setTimeout(() => {
        copySuccess = false;
      }, 2000);
    }
  }
</script>

<!--
  Assistant avatar — chat-empty-state.html ".conv-ai-logo": a 36px near-black
  rounded square holding the provider mark, falling back to the provider's
  initial (the design draws "O"). Rendered as a snippet because ".msg-stack-row"
  needs the same tile beside a generated image card.
-->
{#snippet aiLogo()}
  <div class="conv-ai-logo">
    {#if messageProvider?.icon}
      {@const avatarIcon = getIconForTheme(messageProvider)}
      {@const avatarSvg = providerIconSvg(avatarIcon)}
      {@const avatarUrl = providerIconUrl(avatarIcon)}
      {#if avatarSvg}
        <span class="provider-icon-img" aria-hidden="true"
          >{@html avatarSvg}</span
        >
      {:else if avatarUrl}
        <img src={avatarUrl} alt="" class="provider-icon-img" />
      {:else}
        {providerLetter}
      {/if}
    {:else}
      {providerLetter}
    {/if}
  </div>
{/snippet}

<!--
  ".image-card" — the 500px card. `withMeta` draws the filename/size/MIME bar
  the design puts under a user's image; the assistant's generated image uses
  ".image-card--noMeta". The ".image-card__overlay" action pill is hover/focus
  only, which is how the design renders (the mockup pins it open because it is
  a static page).
-->
{#snippet imageCard(
  file: { id: string; name?: string; type?: string; size?: number },
  blobUrl: string,
  withMeta: boolean,
)}
  <div class="image-card" class:image-card--noMeta={!withMeta}>
    <img
      class="image-card__img"
      src={blobUrl}
      alt={file.name || $_("chat.message.imageAlt")}
    />
    <div class="image-card__overlay">
      <button
        type="button"
        class="image-card__dlbtn"
        onclick={() =>
          openImagePreview(blobUrl, file.name || $_("chat.message.imageAlt"))}
        aria-label={$_("chat.message.viewImage", {
          values: { name: file.name || $_("chat.message.imageAlt") },
        })}
        title={$_("chat.message.viewImage", {
          values: { name: file.name || $_("chat.message.imageAlt") },
        })}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
      <button
        type="button"
        class="image-card__dlbtn"
        onclick={() => copyImageToClipboard(blobUrl)}
        aria-label={$_("chat.message.copyImage")}
        title={$_("chat.message.copyImage")}
      >
        {#if imageCopied}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M20 6L9 17l-5-5"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        {:else}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <rect
              x="9"
              y="9"
              width="13"
              height="13"
              rx="2"
              stroke="currentColor"
              stroke-width="2"
            />
            <path
              d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"
              stroke="currentColor"
              stroke-width="2"
            />
          </svg>
        {/if}
      </button>
      <button
        type="button"
        class="image-card__dlbtn"
        onclick={() =>
          downloadImageFile(file.id, file.name || $_("chat.message.imageAlt"))}
        aria-label={$_("chat.message.downloadImage")}
        title={$_("chat.message.downloadImage")}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </div>
    {#if withMeta}
      <div class="image-card__meta">
        <div class="image-card__meta-left">
          <svg
            width="16"
            height="13"
            viewBox="0 0 16 13"
            fill="none"
            aria-hidden="true"
          >
            <rect
              x="1"
              y="3"
              width="14"
              height="9"
              rx="2"
              stroke="currentColor"
              stroke-width="1.2"
            />
            <circle
              cx="8"
              cy="7.5"
              r="2.5"
              stroke="currentColor"
              stroke-width="1.2"
            />
            <path
              d="M5 3l1-1.5h4L11 3"
              stroke="currentColor"
              stroke-width="1.2"
            />
          </svg>
          <span class="image-card__filename"
            >{file.name || $_("chat.message.imageAlt")}</span
          >
          {#if file.size}
            <span class="image-card__filesize"
              >&bull; {formatFileSize(file.size)}</span
            >
          {/if}
        </div>
        {#if file.type}
          <span class="image-card__tag">{mimeTag(file.type)}</span>
        {/if}
      </div>
    {/if}
  </div>
{/snippet}

<!--
  ".attachment-grid" — 130px image/video tiles and 220px file cards. Videos get
  a real poster frame and their real duration from the loaded metadata.
-->
{#snippet attachmentGrid(
  files: Array<{ id: string; name?: string; type?: string; size?: number }>,
)}
  <div class="attachment-grid">
    {#each files as file (file.id)}
      {#if isImage(file.type)}
        {@const blobUrl = fileBlobUrls.get(file.id)}
        {#if blobUrl}
          <button
            type="button"
            class="att-image"
            onclick={() =>
              openImagePreview(
                blobUrl,
                file.name || $_("chat.message.imageAlt"),
              )}
            aria-label={file.name || $_("chat.message.imageAlt")}
            title={file.name || $_("chat.message.imageAlt")}
          >
            <img src={blobUrl} alt={file.name || $_("chat.message.imageAlt")} />
          </button>
        {:else}
          <div
            class="att-image att-image--pending"
            aria-label={file.name}
          ></div>
        {/if}
      {:else if isVideo(file.type)}
        {@const blobUrl = fileBlobUrls.get(file.id)}
        <div class="att-video">
          {#if blobUrl}
            <!-- svelte-ignore a11y_media_has_caption -->
            <video
              src={blobUrl}
              preload="metadata"
              muted
              onloadedmetadata={(event) => handleVideoMetadata(file.id, event)}
            ></video>
          {/if}
          <button
            type="button"
            class="att-video__play"
            onclick={() =>
              handleFileClick(
                file.id,
                file.name || $_("chat.message.fileFallback"),
              )}
            aria-label={file.name || $_("chat.message.fileFallback")}
            title={file.name || $_("chat.message.fileFallback")}
          >
            <svg
              width="10"
              height="12"
              viewBox="0 0 10 12"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M0 0l10 6-10 6z" />
            </svg>
          </button>
          {#if videoDurations.get(file.id)}
            <span class="att-video__time">{videoDurations.get(file.id)}</span>
          {/if}
        </div>
      {:else}
        <div class="att-file">
          <span class="att-file__icon" aria-hidden="true">
            <svg width="14" height="17" viewBox="0 0 14 17" fill="none">
              <path
                d="M2 1h7l4 4v10a1 1 0 01-1 1H2a1 1 0 01-1-1V2a1 1 0 011-1z"
                stroke="currentColor"
                stroke-width="1.3"
                stroke-linejoin="round"
              />
            </svg>
          </span>
          <span class="att-file__text">
            <span class="att-file__name"
              >{file.name || $_("chat.message.fileFallback")}</span
            >
            {#if file.size}
              <span class="att-file__size">{formatFileSize(file.size)}</span>
            {/if}
          </span>
          <button
            type="button"
            class="att-file__dl"
            onclick={() =>
              handleFileClick(
                file.id,
                file.name || $_("chat.message.fileFallback"),
              )}
            aria-label={$_("chat.message.downloadFile")}
            title={$_("chat.message.downloadFile")}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
        </div>
      {/if}
    {/each}
  </div>
{/snippet}

<!--
  Shared assistant content — the actions rail and the rendered markdown/
  artifacts. Rendered as a snippet because a generated-image turn wraps the same
  body in a caption bubble under the ".msg-stack" image card.
-->
{#snippet assistantInner()}
  {#if !message.isStreaming}
    <div class="message-actions" class:tts-active={isActive}>
      <!-- TTS Toggle Button -->
      {#if speechSynthesisSupported}
        <button
          class="action-btn"
          onclick={handleTTSToggle}
          aria-label={isSpeaking
            ? $_("chat.message.pause")
            : isPaused
              ? $_("chat.message.resume")
              : $_("chat.message.listen")}
          title={isSpeaking
            ? $_("chat.message.pause")
            : isPaused
              ? $_("chat.message.resume")
              : $_("chat.message.listen")}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            {#if isSpeaking}
              <!-- Pause icon -->
              <rect x="6" y="4" width="4" height="16"></rect>
              <rect x="14" y="4" width="4" height="16"></rect>
            {:else if isPaused}
              <!-- Play icon -->
              <polygon points="5,3 19,12 5,21"></polygon>
            {:else}
              <!-- Speaker icon -->
              <polygon points="11,5 6,9 2,9 2,15 6,15 11,19"></polygon>
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
            {/if}
          </svg>
        </button>
        <!-- Stop Button (only shown when active) -->
        {#if isActive}
          <button
            class="action-btn"
            onclick={handleTTSStop}
            aria-label={$_("chat.message.stop")}
            title={$_("chat.message.stop")}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <rect x="4" y="4" width="16" height="16" rx="2"></rect>
            </svg>
          </button>
        {/if}
      {/if}
      <!-- Copy Button -->
      <button
        class="action-btn"
        class:success={copySuccess}
        onclick={copyMessageContent}
        aria-label={$_("chat.message.copyContent")}
        title={$_("chat.message.copyContent")}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          {#if copySuccess}
            <polyline points="20,6 9,17 4,12"></polyline>
          {:else}
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
            ></path>
          {/if}
        </svg>
      </button>
      <!-- HTML Preview Button (opens side panel) -->
    </div>
  {/if}
  <div class="message-body">
    {@html renderedContent}

    {#if hasPreviewableContent}
      {#each artifactContents as artifact, i}
        <button
          class="artifact-card"
          onclick={() => onShowArtifact?.(artifactContents, i)}
        >
          <div class="artifact-card-icon">
            {#if artifact.type === "markdown"}
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
                />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            {:else}
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
            {/if}
          </div>
          <div class="artifact-card-info">
            <span class="artifact-card-title"
              >{artifact.title ||
                (artifact.type === "html"
                  ? "HTML Artifact"
                  : "Markdown Document")}</span
            >
            <span class="artifact-card-hint">Click to open preview</span>
          </div>
          <svg
            class="artifact-card-arrow"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
      {/each}
    {/if}

    <!--
      Generated images are lifted out into the design's ".msg-stack" above;
      anything else the model returns keeps the ".attachment-grid" cards.
    -->
    {#if assistantOtherFiles.length > 0}
      {@render attachmentGrid(assistantOtherFiles)}
    {/if}
  </div>
{/snippet}

<div
  class="message"
  class:user={message.role === "user"}
  class:assistant={message.role !== "user"}
  class:streaming={message.isStreaming}
  class:actions-visible={showActions}
  class:has-images={message.role === "user" && imageCount > 0}
  class:message--stacked={useImageCard ||
    useAttachmentGrid ||
    generatedImages.length > 0}
  bind:this={messageContainer}
  onclick={handleMessageTap}
  onkeydown={handleMessageKeydown}
  role="button"
  tabindex="-1"
  aria-pressed={showActions}
>
  <!--
    Avatar only for assistant messages, and only in the plain-bubble case: a
    generated-image turn tucks the same avatar inside ".msg-stack-row" instead.
  -->
  {#if message.role !== "user" && generatedImages.length === 0}
    <div class="message-avatar">
      {@render aiLogo()}
    </div>
  {/if}

  <div class="message-content">
    <!-- Tool calls display (if any) -->
    {#if message.mergedWebSearch}
      <div class="tool-calls-container">
        <WebSearch mergedWebSearch={message.mergedWebSearch} />
      </div>
    {/if}

    <!-- MCP tool call timeline (non-web-search, non-artifact tools) -->
    {#if message.toolCalls && message.toolCalls.some((tc) => tc.kind !== "web_search" && tc.tool_name !== "create_artifact")}
      <div class="tool-calls-container">
        <ToolCallTimeline
          toolCalls={message.toolCalls.filter(
            (tc) => tc.tool_name !== "create_artifact",
          )}
          toolResults={((message.toolsResults as ToolResult[]) || []).filter(
            (tr) => tr.tool_name !== "create_artifact",
          )}
        />
      </div>
    {/if}

    {#if message.role === "user"}
      <!-- Edit mode UI hidden for now
      {#if isEditing}
        <div class="edit-container">
          <textarea
            bind:this={editTextarea}
            bind:value={editContent}
            class="edit-textarea"
            oninput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = 'auto';
              target.style.height = target.scrollHeight + 'px';
            }}
            onkeydown={(e) => {
              if (e.key === 'Escape') cancelEdit();
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                saveEdit();
              }
            }}
          ></textarea>
          <div class="edit-actions">
            <button class="btn-save" onclick={saveEdit}>Save</button>
            <button class="btn-cancel" onclick={cancelEdit}>Cancel</button>
          </div>
        </div>
      {:else}
      -->
      <!--
          Attachments sit ABOVE the bubble, not inside it (design ".msg-stack--user"
          for a lone image, ".thread-aligner" for everything else).
        -->
      {#if useImageCard && soleImageFile}
        <div class="msg-stack msg-stack--user">
          {#if fileLoadingStates.get(soleImageFile.id)}
            <div class="image-loader image-loader--card">
              <div class="spinner"></div>
              <div class="loader-text">{$_("chat.message.loadingImage")}</div>
            </div>
          {:else}
            {@const cardUrl = fileBlobUrls.get(soleImageFile.id)}
            {#if cardUrl}
              {@render imageCard(soleImageFile, cardUrl, true)}
            {/if}
          {/if}
        </div>
      {:else if useAttachmentGrid}
        {@render attachmentGrid(attachedFiles)}
      {/if}
      <div
        class="user-message"
        class:user-message--image={isImageTurn}
        class:user-message--sent={useAttachmentGrid}
        class:user-message--wide={useImageCard}
      >
        {#if !message.isStreaming}
          <div class="message-actions">
            <button
              class="action-btn user-copy-btn"
              class:success={copySuccess}
              onclick={copyMessageContent}
              title={$_("chat.message.copyContent")}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                {#if copySuccess}
                  <polyline points="20,6 9,17 4,12"></polyline>
                {:else}
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path
                    d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                  ></path>
                {/if}
              </svg>
            </button>
            <!-- Edit button hidden for now
              <button class="action-btn" onclick={startEdit} title="Edit message">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </button>
              -->
          </div>
        {/if}
        <div class="message-body">
          <p>{message.content}</p>
        </div>
      </div>
      <!-- {/if} end of edit mode conditional -->
    {:else if message.content || (message.files && message.files.length > 0) || hasPreviewableContent}
      {#if generatedImages.length > 0}
        <!-- ".msg-stack": logo + borderless image card, caption bubble below. -->
        <div class="msg-stack">
          <div class="msg-stack-row">
            {@render aiLogo()}
            <div class="msg-stack-images">
              {#each generatedImages as file (file.id)}
                {#if fileLoadingStates.get(file.id)}
                  <div class="image-loader image-loader--card">
                    <div class="spinner"></div>
                    <div class="loader-text">
                      {$_("chat.message.generatingImage")}
                    </div>
                  </div>
                {:else}
                  {@const genUrl = fileBlobUrls.get(file.id)}
                  {#if genUrl}
                    {@render imageCard(file, genUrl, false)}
                  {/if}
                {/if}
              {/each}
            </div>
          </div>
          <!-- The caption bubble only exists when the model actually returned
               text alongside the image; an image-only turn has no bubble. -->
          {#if message.content.trim() || hasPreviewableContent || assistantOtherFiles.length > 0}
            <div class="assistant-message">
              {@render assistantInner()}
            </div>
          {/if}
        </div>
      {:else}
        <div class="assistant-message">
          {@render assistantInner()}
        </div>
      {/if}
    {/if}

    {#if message.mcpAuthRequests && message.mcpAuthRequests.length > 0}
      <div class="mcp-auth-container">
        {#each message.mcpAuthRequests as authRequest (authRequest.server_id)}
          <McpOAuthPrompt
            {authRequest}
            onConnected={(serverId) => onMcpAuthConnected?.(serverId)}
            onError={(serverId, err) => onMcpAuthError?.(serverId, err)}
            onStatusChange={(serverId, status) =>
              onMcpAuthStatusChange?.(serverId, status)}
          />
        {/each}
      </div>
    {/if}

    {#if message.error}
      <div class="error-message">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <span>{message.error}</span>
      </div>
    {/if}
  </div>
</div>

<!-- Image Preview Modal -->
{#if previewImage}
  <div
    class="modal-backdrop"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    aria-label={$_("chat.message.imagePreview") || "Image preview"}
    onclick={closeImagePreview}
    onkeydown={(e) => {
      if (e.key === "Escape") closeImagePreview();
    }}
  >
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="modal-content"
      role="document"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.key === "Escape" && closeImagePreview()}
    >
      <button
        class="modal-close"
        onclick={closeImagePreview}
        aria-label={$_("chat.message.closePreview")}
      >
        ✕
      </button>
      <img
        src={previewImage.url}
        alt={previewImage.name}
        class="preview-image"
      />
      <div class="preview-toolbar">
        <span class="preview-filename">{previewImage.name}</span>
        <a
          class="preview-download-btn"
          href={previewImage.url}
          download={sanitizeDownloadName(previewImage.name)}
          aria-label={$_("chat.message.downloadImage")}
          title={$_("chat.message.downloadImage")}
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
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          <span>{$_("chat.message.download")}</span>
        </a>
      </div>
    </div>
  </div>
{/if}

<style>
  .message {
    display: flex;
    gap: var(--space-md);
    align-items: flex-start;
    max-width: 90%;
    animation: fadeInUp 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(var(--space-md));
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .message.user {
    flex-direction: row-reverse;
    align-self: flex-end;
    max-width: 75%;
  }

  .message.user.has-images {
    max-width: 90%;
  }

  .message.assistant {
    align-self: flex-start;
  }

  /* Avatar container */
  .message-avatar {
    flex-shrink: 0;
    display: flex;
    align-items: flex-start;
    justify-content: center;
  }

  /* ".conv-ai-logo" — the design's 36px near-black tile.
     Dark mode: --gx-tx-logo-bg flips to a translucent white film over the dark
     page, which still resolves DARK (~rgb(38,40,44)). That is deliberate: the
     tile stays dark in both themes, so one white glyph colour works for both and
     no theme-conditional filter is needed. */
  .conv-ai-logo {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    font-family: var(--gx-font-display);
    font-weight: 800;
    font-size: 14px;
    line-height: 1;
    color: #fff;
  }

  /* Registry marks arrive with arbitrary ink: some paint with
     fill="currentColor" (which `color: #fff` above whitens), some ship fixed
     brand hex, and some are dark-inked SVGs authored for a LIGHT background.
     That last kind is the problem: this tile is dark in BOTH themes, so a
     dark-inked mark disappears on it — and it disappears only in light mode,
     because in dark mode `getIconForTheme` swaps in the registry's light
     `icon_dark` variant instead.

     Forcing the glyph to a white silhouette makes every kind legible in both
     themes, with no theme-conditional rule: brightness(0) collapses whatever
     ink the mark uses down to black while preserving its alpha shape, and
     invert(1) then lifts that to white. Note this renders multi-colour marks
     (Google's four-colour G) monochrome, which is consistent with the design's
     monochrome tile and its white letter fallback. */
  .conv-ai-logo :global(svg) {
    width: 36px;
    height: 36px;
    display: block;
  }

  .conv-ai-logo .provider-icon-img {
    width: 36px;
    height: 36px;
    display: block;
    object-fit: contain;
  }

  .message-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    flex: 1;
    min-width: 0;
  }

  /* User bubble — chat-empty-state.html ".bubble--user": 12px radius,
     14/18 padding, the brand-alt green fill and a 480px measure. */
  .user-message {
    position: relative;
    background: var(--gx-org-brand-alt);
    color: #fff;
    border-radius: 12px;
    padding: 14px 18px;
    width: fit-content;
    max-width: min(480px, 100%);
    margin-inline-start: auto;
    font-family: var(--gx-font-display);
    font-size: 14px;
    line-height: 20px;
    box-shadow: 0 4px 14px 0 rgba(13, 148, 136, 0.149);
    transition:
      transform 0.2s ease,
      box-shadow 0.2s ease;
  }

  /* Image turns get the design's navy fill instead of the green. */
  .user-message--image {
    background: var(--gx-org-primary-500);
    box-shadow: 0 4px 14px 0 rgba(66, 122, 198, 0.18);
  }

  .user-message:hover {
    transform: translateY(-1px);
    box-shadow: 0 8px 22px 0 rgba(13, 148, 136, 0.2);
  }

  .user-message--image:hover {
    box-shadow: 0 8px 22px 0 rgba(66, 122, 198, 0.24);
  }

  .user-message p {
    margin: 0;
    line-height: 1.6;
    white-space: pre-wrap;
    word-wrap: break-word;
  }

  .user-message p:empty {
    display: none;
  }

  /* ".msg-bubble-sent" — the user turn that carries an attachment grid drops the
     green for the cool tint and the design's asymmetric tail radius. */
  .user-message--sent,
  .user-message--sent.user-message--image {
    background: var(--gx-ring-soft);
    color: var(--gx-tx-ink);
    border-radius: 16px 16px 4px 16px;
    box-shadow: none;
  }

  .user-message--sent:hover,
  .user-message--sent.user-message--image:hover {
    box-shadow: none;
  }

  /* The design widens the caption under an ".image-card" past the 480px measure. */
  .user-message--wide {
    max-width: min(652px, 100%);
  }

  /* Assistant message bubble - frosted glass effect */
  .assistant-message {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    background: rgba(var(--glass-tint), 0.12);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    color: var(--text-primary);
    border-radius: var(--glass-radius);
    border-bottom-left-radius: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.15),
      0 2px 12px rgba(0, 0, 0, 0.06),
      0 1px 2px rgba(0, 0, 0, 0.04);
    transition: all 0.25s ease;
  }

  .assistant-message:hover {
    background: rgba(var(--glass-tint), 0.18);
    transform: translateY(-1px);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.2),
      0 4px 20px rgba(0, 0, 0, 0.1),
      0 2px 4px rgba(0, 0, 0, 0.06);
  }

  @media (prefers-color-scheme: dark) {
    .assistant-message {
      background: rgba(var(--glass-tint), 0.08);
    }

    .assistant-message:hover {
      background: rgba(var(--glass-tint), 0.12);
    }
  }

  /* ==========================================================================
     Transcript attachments — chat-empty-state.html round 4.
     ".msg-stack" / ".thread-aligner" put the attachment ABOVE the bubble, so a
     stacked turn needs its own column gap and alignment.
     ========================================================================== */
  .message--stacked .message-content {
    gap: 16px;
  }

  .message.user .message-content {
    align-items: flex-end;
  }

  .msg-stack {
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: 100%;
    min-width: 0;
  }

  .msg-stack--user {
    align-items: flex-end;
  }

  .msg-stack-row {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    min-width: 0;
  }

  /* A DEFINITE width, not `min(500px, 100%)`: ".message.assistant" is
     `align-self: flex-start`, so it is shrink-to-fit and a percentage here
     would resolve against an indefinite parent and collapse the card. */
  .msg-stack-images {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 500px;
    max-width: 100%;
    flex-shrink: 1;
  }

  /* ---- ".image-card": the 500px card with a hover action pill ---- */
  .image-card {
    position: relative;
    width: 500px;
    max-width: 100%;
    border-radius: 12px;
    background: var(--gx-card);
    box-shadow:
      inset 0 0 0 1px var(--gx-tx-card-ring),
      var(--gx-tx-card-shadow);
    overflow: hidden;
  }

  .image-card__img {
    display: block;
    width: 100%;
    height: 260px;
    object-fit: cover;
  }

  /* The mockup pins the pill open because it is a static page; here it is a
     hover/focus affordance, which is how the design renders. */
  .image-card__overlay {
    position: absolute;
    left: 50%;
    bottom: 44px;
    transform: translateX(-50%);
    width: 122px;
    height: 46px;
    border-radius: 30px;
    background: var(--gx-tx-overlay-bg);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    display: flex;
    gap: 8px;
    padding: 8px;
    box-sizing: border-box;
    opacity: 0;
    transition: opacity 140ms ease;
    pointer-events: none;
  }

  .image-card--noMeta .image-card__overlay {
    bottom: 0;
  }

  .image-card:hover .image-card__overlay,
  .image-card:focus-within .image-card__overlay {
    opacity: 1;
    pointer-events: auto;
  }

  .image-card__dlbtn {
    width: 30px;
    height: 30px;
    padding: 0;
    border: none;
    border-radius: 15px;
    background: var(--gx-tx-overlay-btn-bg);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    flex-shrink: 0;
    cursor: pointer;
    transition: background-color 120ms ease;
  }

  .image-card__dlbtn:hover {
    background: rgba(255, 255, 255, 0.3);
  }

  .image-card__meta {
    height: 44px;
    background: var(--gx-tx-meta-bg);
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    padding: 12px;
    box-sizing: border-box;
  }

  .image-card__meta-left {
    display: flex;
    gap: 6px;
    align-items: center;
    min-width: 0;
    color: var(--gx-tx-accent);
  }

  .image-card__meta-left svg {
    flex-shrink: 0;
  }

  .image-card__filename {
    font-family: var(--gx-font);
    font-weight: 600;
    font-size: 13px;
    line-height: 16px;
    color: var(--gx-tx-meta-name);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .image-card__filesize {
    font-family: var(--gx-font);
    font-size: 11px;
    line-height: 14px;
    color: var(--gx-tx-meta-size);
    flex-shrink: 0;
  }

  .image-card__tag {
    background: var(--gx-ring-soft);
    border-radius: 6px;
    padding: 4px 8px;
    font-family: var(--gx-font);
    font-weight: 700;
    font-size: 10px;
    line-height: 12px;
    color: var(--gx-tx-accent);
    text-transform: uppercase;
    flex-shrink: 0;
  }

  /* Card-sized loader so the layout does not jump while the blob downloads. */
  .image-loader--card {
    width: 500px;
    max-width: 100%;
    height: 260px;
    aspect-ratio: auto;
    border-radius: 12px;
  }

  /* ---- ".attachment-grid": 130px tiles and 220px file cards ---- */
  .attachment-grid {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .message.user .attachment-grid {
    justify-content: flex-end;
  }

  .att-image {
    width: 130px;
    height: 100px;
    padding: 0;
    border: none;
    border-radius: 12px;
    background: linear-gradient(
      127.6deg,
      var(--gx-tx-att-img-from) 0%,
      var(--gx-tx-att-img-to) 100%
    );
    overflow: hidden;
    flex-shrink: 0;
    cursor: pointer;
  }

  .att-image img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .att-image--pending {
    cursor: default;
  }

  .att-video {
    position: relative;
    width: 130px;
    height: 100px;
    border-radius: 12px;
    background: linear-gradient(
      127.6deg,
      var(--gx-tx-att-vid-from) 0%,
      var(--gx-tx-att-vid-to) 100%
    );
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    flex-shrink: 0;
  }

  .att-video video {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .att-video__play {
    position: relative;
    z-index: 1;
    width: 34px;
    height: 34px;
    padding: 0;
    border: none;
    border-radius: 17px;
    background: #fff;
    box-shadow: 0 2px 6px 0 rgba(0, 0, 0, 0.149);
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgb(28, 41, 56);
    cursor: pointer;
  }

  .att-video__time {
    position: absolute;
    z-index: 1;
    right: 6px;
    bottom: 6px;
    background: rgba(0, 0, 0, 0.702);
    border-radius: 4px;
    padding: 2px 4px;
    font-family: var(--gx-font);
    font-weight: 700;
    font-size: 10px;
    line-height: 12px;
    color: #fff;
  }

  .att-file {
    width: 220px;
    height: 60px;
    border-radius: 12px;
    background: var(--gx-card);
    box-shadow:
      inset 0 0 0 1px var(--gx-tx-chip-ring),
      0 2px 8px 0 rgba(0, 0, 0, 0.0392);
    display: flex;
    gap: 12px;
    align-items: center;
    padding: 12px 16px 12px 12px;
    box-sizing: border-box;
    flex-shrink: 0;
  }

  .att-file__icon {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    background: var(--gx-tx-file-icon-bg);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--gx-danger);
    flex-shrink: 0;
  }

  .att-file__text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .att-file__name {
    font-family: var(--gx-font);
    font-weight: 700;
    font-size: 12px;
    line-height: 15px;
    color: var(--gx-tx-ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .att-file__size {
    font-family: var(--gx-font);
    font-size: 11px;
    line-height: 14px;
    color: var(--gx-org-slate-350);
  }

  .att-file__dl {
    margin-inline-start: auto;
    padding: 0;
    border: none;
    background: none;
    color: var(--gx-org-slate-350);
    display: flex;
    align-items: center;
    flex-shrink: 0;
    cursor: pointer;
    transition: color 120ms ease;
  }

  .att-file__dl:hover {
    color: var(--gx-tx-ink);
  }

  .assistant-message :global(p) {
    margin: 0 0 var(--space-md) 0;
    line-height: 1.6;
    /* Break long unbroken tokens (URLs, hashes) so prose wraps instead of
       forcing the whole message to overflow horizontally. Code and tables keep
       their own scroll containers below. */
    overflow-wrap: anywhere;
  }

  .assistant-message :global(p:last-child) {
    margin-bottom: 0;
  }

  .assistant-message :global(h1),
  .assistant-message :global(h2),
  .assistant-message :global(h3),
  .assistant-message :global(h4),
  .assistant-message :global(h5),
  .assistant-message :global(h6) {
    margin: var(--space-lg) 0 var(--space-md) 0;
  }

  .assistant-message :global(h1:first-child),
  .assistant-message :global(h2:first-child),
  .assistant-message :global(h3:first-child),
  .assistant-message :global(h4:first-child),
  .assistant-message :global(h5:first-child),
  .assistant-message :global(h6:first-child) {
    margin-top: 0;
  }

  .assistant-message :global(ul),
  .assistant-message :global(ol) {
    margin: var(--space-md) 0;
    padding-inline-start: var(--space-2xl);
  }

  .assistant-message :global(li) {
    margin: var(--space-sm) 0;
    line-height: 1.6;
    overflow-wrap: anywhere;
  }

  .assistant-message :global(code) {
    font-family: "SF Mono", Monaco, Menlo, "Ubuntu Mono", monospace;
    font-size: 0.875em;
    background: color-mix(
      in oklab,
      var(--glass-bg-dark) 30%,
      var(--btn-tertiary)
    );
    padding: var(--space-xs) var(--space-sm);
    border-radius: var(--radius-sm);
  }

  @media (prefers-color-scheme: light) {
    .assistant-message :global(code) {
      background: #e2e8f0;
    }
  }

  .assistant-message :global(pre) {
    position: relative;
    margin: var(--space-md) 0;
    padding: var(--space-xl);
    border-radius: var(--radius-md);
    overflow-x: auto;
  }

  .assistant-message :global(pre code) {
    background: transparent;
    padding: 0;
    border-radius: 0;
    font-size: 0.875rem;
    line-height: 1.6;
    /* Size the code to its content (min the full width) so the parent <pre>'s
       overflow-x can actually scroll wide, unbroken code lines instead of
       clipping them. Without an explicit width the inline default leaves the
       pre unable to scroll. */
    display: block;
    width: max-content;
    min-width: 100%;
    box-shadow: none;
  }

  .assistant-message :global(blockquote) {
    margin: var(--space-md) 0;
    padding-inline-start: var(--space-xl);
    border-inline-start: 3px solid var(--brand);
    color: var(--text-secondary);
    font-style: italic;
  }

  .assistant-message :global(a) {
    color: var(--link-color);
    text-decoration: underline;
    transition: color 0.2s ease;
    /* Long links break to wrap rather than overflow the message column. */
    overflow-wrap: anywhere;
  }

  .assistant-message :global(a:hover) {
    color: var(--link-hover);
  }

  .assistant-message :global(table) {
    border-collapse: collapse;
    margin: var(--space-md) 0;
    width: max-content;
  }

  .assistant-message :global(th),
  .assistant-message :global(td) {
    padding: var(--space-sm) var(--space-md);
    border: 1px solid var(--glass-stroke-dark);
    text-align: start;
    word-wrap: break-word;
    overflow-wrap: break-word;
    white-space: normal;
    max-width: max(300px, 30vw);
  }

  /* Single column tables: allow full width */
  .assistant-message :global(th:only-child),
  .assistant-message :global(td:only-child) {
    max-width: none;
  }

  .assistant-message :global(th) {
    background: color-mix(
      in oklab,
      var(--glass-bg-dark) 40%,
      var(--btn-secondary)
    );
    font-weight: 600;
  }

  .streaming .assistant-message::after {
    content: "▊";
    animation: blink 1s infinite;
    margin-inline-start: 2px;
  }

  @keyframes blink {
    0%,
    50% {
      opacity: 1;
    }
    51%,
    100% {
      opacity: 0;
    }
  }

  .mcp-auth-container {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    margin-top: var(--space-md);
  }

  .error-message {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin-top: var(--space-md);
    padding: var(--space-md) var(--space-lg);
    background: var(--danger-surface);
    color: var(--brand-red);
    border-radius: var(--radius-md);
    font-size: 0.875rem;
  }

  .message-actions {
    position: absolute;
    top: var(--space-sm);
    inset-inline-end: var(--space-md);
    z-index: 10;
    display: flex;
    flex-direction: row;
    gap: 0.375rem;
    opacity: 0;
    transform: scale(0.9);
    transition: all 0.2s ease;
    pointer-events: none;
  }

  /* Desktop: show on hover */
  .user-message:hover .message-actions,
  .assistant-message:hover .message-actions {
    opacity: 1;
    transform: scale(1);
    pointer-events: auto;
  }

  /* Keyboard: show on focus-within */
  .user-message .message-actions:focus-within,
  .assistant-message .message-actions:focus-within {
    opacity: 1;
    transform: scale(1);
    pointer-events: auto;
  }

  /* Mobile: show on tap via actions-visible class */
  .message.actions-visible .user-message .message-actions,
  .message.actions-visible .assistant-message .message-actions {
    opacity: 1;
    transform: scale(1);
    pointer-events: auto;
  }

  /* Action button - glass style */
  .action-btn {
    background: var(--btn-secondary);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border: 1px solid var(--glass-stroke-dark);
    border-radius: 0.375rem;
    padding: 0.375rem;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .action-btn:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }

  .action-btn:hover:not(:disabled) {
    background: var(--brand);
    color: white;
    border-color: var(--brand);
    transform: scale(1.05);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .action-btn:active:not(:disabled) {
    transform: scale(0.95);
  }

  /* User bubble copy button needs stronger contrast than the bubble fill */
  .user-message .action-btn.user-copy-btn {
    background: rgba(17, 24, 39, 0.45);
    border-color: rgba(255, 255, 255, 0.35);
    color: rgba(255, 255, 255, 0.98);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.28);
  }

  .user-message .action-btn.user-copy-btn:hover:not(:disabled) {
    background: rgba(17, 24, 39, 0.62);
    border-color: rgba(255, 255, 255, 0.52);
    color: white;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.32);
  }

  /* Success state for action buttons */
  .action-btn.success {
    background: rgba(var(--brand-green-rgb), 0.2);
    color: var(--brand-green);
    border-color: color-mix(in oklab, var(--brand-green) 25%, transparent);
  }

  .user-message .action-btn.user-copy-btn.success {
    background: rgba(var(--brand-green-rgb, 34, 197, 94), 0.32);
    border-color: rgba(var(--brand-green-rgb, 34, 197, 94), 0.65);
    color: #f0fdf4;
  }

  /* TTS active state - always visible when speaking */
  .message-actions.tts-active {
    opacity: 1;
    transform: scale(1);
  }

  /* Copy button for code blocks */
  :global(.copy-code-btn) {
    position: absolute;
    top: var(--space-sm);
    inset-inline-end: var(--space-sm);
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-xs) var(--space-sm);
    background: var(--btn-secondary);
    border: 1px solid var(--glass-stroke-dark);
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    opacity: 0;
  }

  :global(pre:hover .copy-code-btn) {
    opacity: 1;
  }

  :global(.copy-code-btn:hover) {
    background: var(--btn-tertiary);
    border-color: var(--brand);
    color: var(--brand);
    transform: translateY(-1px);
  }

  :global(.copy-code-btn svg) {
    flex-shrink: 0;
  }

  @media (max-width: 768px) {
    .message {
      max-width: 92%;
      gap: var(--space-sm);
      /* Add cursor pointer to indicate tappability */
      cursor: pointer;
    }

    .message-avatar {
      display: none;
    }

    /* On mobile, disable hover and only show via tap (actions-visible class) */
    .user-message:hover .message-actions,
    .assistant-message:hover .message-actions {
      opacity: 0;
      transform: scale(0.9);
    }

    .message.actions-visible .user-message .message-actions,
    .message.actions-visible .assistant-message .message-actions {
      opacity: 1;
      transform: scale(1);
    }

    :global(.copy-code-btn span) {
      display: none;
    }

    .action-btn {
      padding: 0.25rem;
    }
  }

  @media (max-width: 480px) {
    .message {
      max-width: 95%;
      gap: var(--space-xs);
    }

    .action-btn {
      padding: 0.2rem;
    }
  }

  .message-body {
    width: 100%;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  /* Artifact card (replaces inline code block) */
  .artifact-card {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    width: 100%;
    margin-top: var(--space-md);
    padding: var(--space-sm) var(--space-md);
    border: 1px solid rgba(139, 92, 246, 0.2);
    border-radius: var(--glass-radius, 12px);
    background: rgba(139, 92, 246, 0.06);
    cursor: pointer;
    transition: all 0.2s;
    text-align: left;
    color: inherit;
  }

  .artifact-card:hover {
    background: rgba(139, 92, 246, 0.12);
    border-color: rgba(139, 92, 246, 0.35);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(139, 92, 246, 0.1);
  }

  .artifact-card-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 8px;
    background: rgba(139, 92, 246, 0.12);
    color: #8b5cf6;
    flex-shrink: 0;
  }

  .artifact-card-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .artifact-card-title {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .artifact-card-hint {
    font-size: 0.72rem;
    color: var(--text-tertiary);
  }

  .artifact-card-arrow {
    color: #8b5cf6;
    flex-shrink: 0;
    opacity: 0.6;
    transition: opacity 0.15s;
  }

  .artifact-card:hover .artifact-card-arrow {
    opacity: 1;
  }

  /* Generated image: image + hover/focus download action */
  /* ── User message: dynamic flex-wrap image grid ── */
  .image-loader {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-sm);
    background: rgba(255, 255, 255, 0.03);
    border-radius: var(--radius-md);
    aspect-ratio: 1 / 1;
    width: 100%;
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid rgba(255, 255, 255, 0.1);
    border-top-color: rgba(255, 255, 255, 0.6);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .loader-text {
    font-size: 13px;
    opacity: 0.6;
  }

  /* Image Preview Modal */
  .modal-backdrop {
    position: fixed;
    top: 0;
    inset-inline: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.9);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    padding: var(--space-xl);
    animation: fadeIn 0.2s ease;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .modal-content {
    position: relative;
    max-width: 90vw;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-md);
  }

  .modal-close {
    position: fixed;
    top: 20px;
    inset-inline-end: 20px;
    background: rgba(255, 255, 255, 0.15);
    border: none;
    border-radius: 50%;
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s;
    z-index: 10000;
    color: white;
    font-size: 28px;
    font-weight: 300;
    line-height: 1;
  }

  .modal-close:hover {
    background: rgba(255, 255, 255, 0.3);
    transform: scale(1.1);
  }

  .preview-image {
    max-width: 100%;
    max-height: calc(90vh - 60px);
    object-fit: contain;
    border-radius: var(--radius-md);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  }

  .preview-toolbar {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    max-width: 100%;
  }

  .preview-filename {
    color: white;
    font-size: 14px;
    text-align: center;
    padding: var(--space-sm) var(--space-md);
    background: rgba(0, 0, 0, 0.5);
    border-radius: var(--radius-md);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .preview-download-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-sm) var(--space-md);
    background: var(--brand);
    color: white;
    border-radius: var(--radius-md);
    font-size: 14px;
    font-weight: 600;
    text-decoration: none;
    flex-shrink: 0;
    transition:
      background 0.18s ease,
      transform 0.18s ease;
  }

  .preview-download-btn:hover {
    background: var(--brand-hover);
    transform: translateY(-1px);
  }

  .preview-download-btn:focus-visible {
    outline: 2px solid white;
    outline-offset: 2px;
  }

  .tool-calls-container {
    max-width: 100%;
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    margin-bottom: var(--space-sm);
  }

  @media (max-width: 768px) {
    .tool-calls-container {
      max-width: 92%;
    }
  }

  @media (max-width: 480px) {
    .tool-calls-container {
      max-width: 95%;
    }
  }
</style>
