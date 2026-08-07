<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { tick } from "svelte";
  import { renderMarkdown, highlightCode, copyToClipboard } from "../../../utils/markdown";
  import { getArtifact } from "../../../api/artifactsApi";
  import {
    attachDesktopPreviewPinch,
    clampDesktopPreviewZoom,
    DESKTOP_PREVIEW_ZOOM_MAX,
    DESKTOP_PREVIEW_ZOOM_MIN,
    DESKTOP_PREVIEW_ZOOM_STEP,
  } from "../utils/desktopPreviewPinch";
  import SaveToProjectModal from "./SaveToProjectModal.svelte";
  import {
    attachNativeArtifactPreview,
    isNativeArtifactPreviewAvailable,
    resetNativeArtifactPreviewZoom,
  } from "$lib/platform/nativeArtifactPreview";
  import type { ArtifactItem } from "../artifacts";

  interface Props {
    /** All artifacts to show. More than one renders a tab bar to switch between
     *  them — a single response can produce several (ENGG-387). */
    artifacts: ArtifactItem[];
    /** Index of the artifact to show. */
    activeIndex?: number;
    onselect?: (index: number) => void;
    onclose: () => void;
  }

  let { artifacts, activeIndex = 0, onselect, onclose }: Props = $props();

  // Clamp to a valid entry and fall back to a harmless empty artifact so the
  // template never dereferences undefined while the list settles.
  const EMPTY: ArtifactItem = { code: "", type: "html", title: "" };
  let clampedIndex = $derived(Math.min(Math.max(activeIndex, 0), Math.max(artifacts.length - 1, 0)));
  let current = $derived<ArtifactItem>(artifacts[clampedIndex] ?? EMPTY);
  let artifactId = $derived(current.id);
  let title = $derived(current.title ?? "");
  let type = $derived<"html" | "markdown">(current.type);
  // Streaming state follows the ACTIVE artifact — so a finished artifact stays
  // downloadable even while another one is still streaming in another tab.
  let isStreaming = $derived(current.streaming ?? false);

  // Content cache for persisted artifacts (reload / card click): those arrive as
  // metadata only, so we fetch content from the backend by id — the client never
  // reads it out of the message text (ENGG-387, server-driven).
  let contentById = $state<Record<string, string>>({});
  let isLoadingContent = $state(false);
  // Effective content: in-memory (streaming) if present, else the fetched copy.
  let code = $derived(current.code || (current.id ? contentById[current.id] ?? "" : ""));

  $effect(() => {
    const id = current.id;
    // Fetch once per id when we have no in-memory content yet.
    if (id && current.code.length === 0 && contentById[id] === undefined && !isLoadingContent) {
      isLoadingContent = true;
      getArtifact(id)
        .then((a) => { contentById = { ...contentById, [id]: a.content ?? "" }; })
        .catch(() => { contentById = { ...contentById, [id]: "" }; })
        .finally(() => { isLoadingContent = false; });
    }
  });

  let renderedMarkdown = $state("");
  let copySuccess = $state(false);
  let showSaveToProject = $state(false);
  let toastMessage = $state("");
  let showToast = $state(false);
  let isFullscreen = $state(false);
  let previewMode = $state<"responsive" | "desktop">("responsive");

  const DESKTOP_VIEWPORT_WIDTH = 1440;
  const DESKTOP_VIEWPORT_HEIGHT = 900;
  const NATIVE_DESKTOP_VIEWPORT_WIDTH = 1024;

  let previewViewport: HTMLDivElement | undefined = $state(undefined);
  let desktopIframe: HTMLIFrameElement | undefined = $state(undefined);
  let desktopPreviewFrame: HTMLDivElement | undefined = $state(undefined);
  let desktopPreviewInner: HTMLDivElement | undefined = $state(undefined);
  let nativePreviewSurface: HTMLDivElement | undefined = $state(undefined);
  let desktopFitScale = $state(1);
  let desktopZoom = $state(1);
  /** True only while a pinch is in flight — see `attachDesktopPreviewPinch`. */
  let isPinchZooming = $state(false);
  let isDownloading = $state(false);

  // Android renders the desktop preview in a real WebView layered over the app,
  // which zooms on the GPU instead of re-rasterising a CSS-scaled iframe.
  const useNativePreview = isNativeArtifactPreviewAvailable();

  function triggerToast(message: string) {
    toastMessage = message;
    showToast = true;
    setTimeout(() => { showToast = false; }, 2200);
  }

  $effect(() => {
    if (type === "markdown" && !isStreaming && code.length > 0) {
      renderedMarkdown = renderMarkdown(code);
    }
  });

  let activeView = $state<"code" | "preview">("code");
  let codeContainer: HTMLPreElement | undefined = $state(undefined);
  let iframeKey = $state(0);
  let desktopScale = $derived(Number((desktopFitScale * desktopZoom).toFixed(3)));
  let desktopFrameWidth = $derived(`${Math.round(DESKTOP_VIEWPORT_WIDTH * desktopScale)}px`);
  let desktopFrameHeight = $derived(`${Math.round(DESKTOP_VIEWPORT_HEIGHT * desktopScale)}px`);
  let desktopPreviewTransform = $derived(`scale(${desktopScale})`);
  let desktopZoomPercent = $derived(`${Math.round(desktopScale * 100)}%`);
  let highlightedCode = $derived(highlightCode(code, type));

  $effect(() => {
    if (!isStreaming && code.length > 0) {
      activeView = "preview";
    }
  });

  $effect(() => {
    if (activeView === "code" && isStreaming && codeContainer) {
      tick().then(() => {
        if (codeContainer) {
          codeContainer.scrollTop = codeContainer.scrollHeight;
        }
      });
    }
  });

  $effect(() => {
    if (
      previewMode !== "desktop" ||
      activeView !== "preview" ||
      type !== "html" ||
      !previewViewport ||
      useNativePreview
    ) {
      desktopFitScale = 1;
      return;
    }

    let animationFrame = 0;
    let lastFitScale = 0;

    const updateScale = () => {
      if (!previewViewport) return;

      const bounds = previewViewport.getBoundingClientRect();

      const availableWidth = Math.max(bounds.width - 32, 320);
      const availableHeight = Math.max(bounds.height - 32, 240);
      const nextScale = Math.min(
        1,
        availableWidth / DESKTOP_VIEWPORT_WIDTH,
        availableHeight / DESKTOP_VIEWPORT_HEIGHT,
      );

      const roundedScale = Number(nextScale.toFixed(3));
      if (Math.abs(roundedScale - lastFitScale) < 0.001) return;

      lastFitScale = roundedScale;
      desktopFitScale = roundedScale;
    };

    const queueScaleUpdate = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(updateScale);
    };

    queueScaleUpdate();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", queueScaleUpdate);
      return () => {
        cancelAnimationFrame(animationFrame);
        window.removeEventListener("resize", queueScaleUpdate);
      };
    }

    const observer = new ResizeObserver(queueScaleUpdate);
    observer.observe(previewViewport);
    return () => {
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
    };
  });

  async function handleCopy() {
    const success = await copyToClipboard(code);
    if (success) {
      copySuccess = true;
      triggerToast("Copied to clipboard");
      setTimeout(() => { copySuccess = false; }, 2000);
    }
  }

  async function handleDownload() {
    if (isDownloading || isStreaming || (code.length === 0 && !artifactId)) return;
    isDownloading = true;
    try {
      // Prefer the backend copy (source of truth) when we have a persisted id,
      // but fall back to the in-memory content so download always works once the
      // artifact has finished generating — even if the backend didn't return an
      // id (ENGG-387: download must not be blocked on a missing id).
      let downloadContent = code;
      let downloadType = type;
      let downloadTitle = title;
      if (artifactId) {
        try {
          const artifact = await getArtifact(artifactId);
          downloadContent = artifact.content;
          downloadType = artifact.content_type === "text/markdown" ? "markdown" : "html";
          downloadTitle = artifact.title || title;
        } catch {
          // Backend fetch failed — fall through to the in-memory content.
        }
      }
      const isMarkdown = downloadType === "markdown";
      const ext = isMarkdown ? "md" : "html";
      const mimeType = isMarkdown ? "text/markdown" : "text/html";
      const fileName =
        (downloadTitle || title).replace(/[^a-zA-Z0-9\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase() ||
        "artifact";
      const blob = new Blob([downloadContent], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fileName}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
      triggerToast(`Downloaded ${fileName}.${ext}`);
    } catch {
      triggerToast("Download failed");
    } finally {
      isDownloading = false;
    }
  }

  function handleReload() {
    if (useNativePreview && previewMode === "desktop") {
      resetNativeArtifactPreviewZoom();
      return;
    }

    iframeKey++;
  }

  function adjustDesktopZoom(delta: number) {
    desktopZoom = Number(clampDesktopPreviewZoom(desktopZoom + delta).toFixed(2));
  }

  $effect(() => {
    const surface = nativePreviewSurface;
    const active =
      useNativePreview &&
      previewMode === "desktop" &&
      activeView === "preview" &&
      type === "html" &&
      !showSaveToProject;

    if (!active || !surface || code.length === 0) return;

    return attachNativeArtifactPreview(surface, code, NATIVE_DESKTOP_VIEWPORT_WIDTH);
  });

  $effect(() => {
    const viewport = previewViewport;
    // The native preview owns its own gesture handling.
    if (!viewport || useNativePreview) return;

    return attachDesktopPreviewPinch({
      viewport,
      iframe: desktopIframe,
      isEnabled: () => previewMode === "desktop" && activeView === "preview" && type === "html",
      getZoom: () => desktopZoom,
      getFitScale: () => desktopFitScale,
      getScale: () => desktopScale,
      // Written straight to the DOM during the gesture. Going through
      // `desktopZoom` here would re-run the derived chain on every frame; the
      // same values are re-rendered declaratively by `commitZoom` at the end.
      previewScale: (scale) => {
        if (desktopPreviewFrame) {
          desktopPreviewFrame.style.width = `${Math.round(DESKTOP_VIEWPORT_WIDTH * scale)}px`;
          desktopPreviewFrame.style.height = `${Math.round(DESKTOP_VIEWPORT_HEIGHT * scale)}px`;
        }
        if (desktopPreviewInner) {
          desktopPreviewInner.style.transform = `scale(${scale})`;
        }
      },
      commitZoom: (zoom) => {
        desktopZoom = zoom;
      },
      setGestureActive: (active) => {
        isPinchZooming = active;
      },
    });
  });

  function togglePreviewMode() {
    previewMode = previewMode === "desktop" ? "responsive" : "desktop";
  }

  function toggleFullscreen() {
    isFullscreen = !isFullscreen;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape" && !showSaveToProject) {
      if (isFullscreen) {
        isFullscreen = false;
        return;
      }

      onclose();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="artifact-panel" class:fullscreen={isFullscreen}>
  <div class="artifact-header">
    <div class="header-left">
      <div class="view-toggle">
        <button
          type="button"
          class="toggle-btn"
          class:active={activeView === "preview"}
          onclick={() => (activeView = "preview")}
          disabled={isStreaming}
          title="Preview"
          aria-label="Preview"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
        <button
          type="button"
          class="toggle-btn"
          class:active={activeView === "code"}
          onclick={() => (activeView = "code")}
          title="Code"
          aria-label="Code"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
          </svg>
        </button>
      </div>
      {#if isStreaming}
        <span class="streaming-indicator">
          <span class="streaming-dot"></span>
        </span>
      {/if}
    </div>
    <div class="artifact-title" title={title}>
      {title}
    </div>
    <div class="header-right">
      {#if activeView === "preview" && !isStreaming && type === "html"}
        <button
          type="button"
          class="header-btn"
          class:active={previewMode === "desktop"}
          onclick={togglePreviewMode}
          title={previewMode === "desktop" ? "Switch to mobile preview" : "Preview at desktop size"}
          aria-label={previewMode === "desktop" ? "Switch to mobile preview" : "Preview at desktop size"}
        >
          {#if previewMode === "desktop"}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <rect x="7" y="2" width="10" height="20" rx="2" />
              <path d="M11 18h2" />
            </svg>
          {:else}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <rect x="3" y="4" width="18" height="12" rx="2" />
              <path d="M8 20h8" />
              <path d="M12 16v4" />
            </svg>
          {/if}
        </button>
        <button
          type="button"
          class="header-btn"
          onclick={handleReload}
          title="Reload preview"
          aria-label="Reload preview"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <polyline points="21 3 21 9 15 9" />
          </svg>
        </button>
      {/if}
      {#if !isStreaming}
        <button
          type="button"
          class="header-btn"
          class:active={isFullscreen}
          onclick={toggleFullscreen}
          title={isFullscreen ? "Exit fullscreen" : "Fullscreen preview"}
          aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen preview"}
        >
          {#if isFullscreen}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M8 3v3a2 2 0 0 1-2 2H3" />
              <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
              <path d="M3 16h3a2 2 0 0 1 2 2v3" />
              <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
            </svg>
          {:else}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M8 3H5a2 2 0 0 0-2 2v3" />
              <path d="M16 3h3a2 2 0 0 1 2 2v3" />
              <path d="M21 16v3a2 2 0 0 1-2 2h-3" />
              <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
            </svg>
          {/if}
        </button>
      {/if}
      <button
        type="button"
        class="header-btn"
        onclick={handleDownload}
        title="Download as .{type === 'markdown' ? 'md' : 'html'}"
        aria-label="Download artifact"
        disabled={isStreaming || isDownloading || (code.length === 0 && !artifactId)}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      </button>
      <button
        type="button"
        class="header-btn"
        onclick={() => (showSaveToProject = true)}
        title="Save to project"
        aria-label="Save to project"
        disabled={isStreaming}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
          <polyline points="17 21 17 13 7 13 7 21" />
          <polyline points="7 3 7 8 15 8" />
        </svg>
      </button>
      <button
        type="button"
        class="header-btn"
        class:success={copySuccess}
        onclick={handleCopy}
        title={copySuccess ? "Copied!" : "Copy code"}
        aria-label={copySuccess ? "Copied" : "Copy code"}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      </button>
      <button
        type="button"
        class="header-btn close-btn"
        onclick={onclose}
        title="Close"
        aria-label="Close panel"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  </div>

  {#if artifacts.length > 1}
    <div class="artifact-tabs" role="tablist">
      {#each artifacts as artifact, i}
        {@const label = artifact.title || (artifact.type === "markdown" ? "Markdown Document" : "HTML Artifact")}
        <button
          class="artifact-tab"
          class:active={i === clampedIndex}
          role="tab"
          aria-selected={i === clampedIndex}
          onclick={() => onselect?.(i)}
          title={label}
        >
          <span class="artifact-tab-index">{i + 1}</span>
          <span class="artifact-tab-label">{label}</span>
        </button>
      {/each}
    </div>
  {/if}

  {#if showToast}
    <div class="toast">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
      <span>{toastMessage}</span>
    </div>
  {/if}

  <div class="artifact-body">
    {#if isLoadingContent && code.length === 0}
      <div class="artifact-loading">
        <span class="artifact-spinner"></span>
        <span>Loading artifact...</span>
      </div>
    {:else if activeView === "code"}
      <pre class="code-view" bind:this={codeContainer}><code class="hljs language-{type}"
          >{@html highlightedCode}{#if isStreaming}<span class="cursor-blink">|</span>{/if}</code
        ></pre>
    {:else if type === "markdown"}
      <div class="markdown-preview">{@html renderedMarkdown}</div>
    {:else}
      <div class="preview-shell">
        <div
          class="preview-viewport"
          class:desktop={previewMode === "desktop"}
          class:native={previewMode === "desktop" && useNativePreview}
          bind:this={previewViewport}
        >
          {#key iframeKey}
            {#if previewMode === "desktop" && useNativePreview}
              <div class="native-preview-surface" bind:this={nativePreviewSurface}></div>
            {:else if previewMode === "desktop"}
              <div
                class="desktop-preview-frame"
                class:zooming={isPinchZooming}
                bind:this={desktopPreviewFrame}
                style:width={desktopFrameWidth}
                style:height={desktopFrameHeight}
              >
                <div
                  class="desktop-preview-inner"
                  class:zooming={isPinchZooming}
                  bind:this={desktopPreviewInner}
                  style:transform={desktopPreviewTransform}
                >
                  <iframe
                    bind:this={desktopIframe}
                    title="Artifact Preview"
                    class="preview-iframe desktop-preview-iframe"
                    srcdoc={code}
                    sandbox="allow-same-origin allow-scripts"
                  ></iframe>
                </div>
              </div>
            {:else}
              <iframe
                title="Artifact Preview"
                class="preview-iframe"
                srcdoc={code}
                sandbox="allow-same-origin allow-scripts"
              ></iframe>
            {/if}
          {/key}
        </div>
        {#if previewMode === "desktop" && !useNativePreview}
          <div
            class="zoom-controls preview-zoom-controls"
            role="group"
            aria-label="Desktop preview zoom"
          >
            <button
              type="button"
              class="zoom-btn"
              onclick={() => adjustDesktopZoom(-DESKTOP_PREVIEW_ZOOM_STEP)}
              disabled={desktopZoom <= DESKTOP_PREVIEW_ZOOM_MIN}
              title="Zoom out"
              aria-label="Zoom out"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.4"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M5 12h14" />
              </svg>
            </button>
            <span class="zoom-value" aria-live="polite">{desktopZoomPercent}</span>
            <button
              type="button"
              class="zoom-btn"
              onclick={() => adjustDesktopZoom(DESKTOP_PREVIEW_ZOOM_STEP)}
              disabled={desktopZoom >= DESKTOP_PREVIEW_ZOOM_MAX}
              title="Zoom in"
              aria-label="Zoom in"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.4"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M12 5v14" />
                <path d="M5 12h14" />
              </svg>
            </button>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>

{#if showSaveToProject}
  <SaveToProjectModal
    messageContent={code}
    onclose={() => (showSaveToProject = false)}
  />
{/if}

<style>
  .artifact-panel {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    border-left: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
    background: var(--bg-primary);
    isolation: isolate;
  }

  .artifact-panel.fullscreen {
    position: fixed;
    inset: 0;
    z-index: 1400;
    width: 100vw;
    height: var(--app-viewport-height, 100vh);
    border-left: 0;
    animation: none;
    box-shadow: none;
  }

  /* ── Header ── */
  .artifact-header {
    position: sticky;
    top: 0;
    z-index: 5;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-height: 52px;
    padding: 8px 10px 8px 12px;
    border-bottom: 1px solid var(--glass-border, rgba(255, 255, 255, 0.12));
    background: color-mix(in srgb, var(--bg-primary) 88%, transparent);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    flex-shrink: 0;
  }

  .artifact-panel.fullscreen .artifact-header {
    min-height: calc(52px + var(--app-safe-area-top, 0px));
    padding-top: calc(8px + var(--app-safe-area-top, 0px));
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    flex-shrink: 0;
  }

  /* ── Loading state (fetching persisted content) ── */
  .artifact-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    height: 100%;
    color: #888;
    font-size: 13px;
  }

  .artifact-spinner {
    width: 22px;
    height: 22px;
    border: 2px solid rgba(255, 255, 255, 0.15);
    border-top-color: rgba(255, 255, 255, 0.6);
    border-radius: 50%;
    animation: artifactSpin 0.7s linear infinite;
  }

  @keyframes artifactSpin {
    to { transform: rotate(360deg); }
  }

  /* ── Multi-artifact tabs ── */
  .artifact-tabs {
    display: flex;
    gap: 6px;
    padding: 8px 12px;
    overflow-x: auto;
    border-bottom: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
    background: rgba(var(--glass-tint, 255, 255, 255), 0.03);
    flex-shrink: 0;
    scrollbar-width: thin;
  }

  .artifact-tab {
    /* Share the row evenly, shrink to fit, but stay readable. min-width:0 is
       required so the label can ellipsize inside a flex item. */
    flex: 1 1 0;
    min-width: 96px;
    max-width: 220px;
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 5px 10px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    background: transparent;
    color: #aaa;
    font-size: 12px;
    text-align: left;
    cursor: pointer;
    transition: color 0.15s, background 0.15s, border-color 0.15s;
  }

  .artifact-tab-index {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border-radius: 5px;
    background: rgba(255, 255, 255, 0.1);
    font-size: 10px;
    font-weight: 600;
    line-height: 1;
  }

  .artifact-tab-label {
    flex: 1 1 auto;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .artifact-tab:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.16);
  }

  .artifact-tab.active {
    color: #fff;
    background: rgba(255, 255, 255, 0.16);
    border-color: rgba(255, 255, 255, 0.22);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
  }

  .artifact-tab.active .artifact-tab-index {
    background: rgba(255, 255, 255, 0.28);
    color: #fff;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .artifact-title {
    min-width: 0;
    flex: 1;
    color: var(--text-primary);
    font-size: 0.88rem;
    font-weight: 650;
    line-height: 1.25;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* ── View toggle (icon-only pill) ── */
  .view-toggle {
    display: flex;
    background: rgba(var(--glass-tint, 255, 255, 255), 0.1);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    padding: 3px;
    gap: 2px;
  }

  .toggle-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    padding: 0;
    border: none;
    border-radius: 7px;
    background: transparent;
    color: #aaa;
    cursor: pointer;
    transition: all 0.15s;
  }

  .toggle-btn:hover:not(:disabled) {
    color: #fff;
    background: rgba(255, 255, 255, 0.1);
  }

  .toggle-btn.active {
    background: rgba(255, 255, 255, 0.18);
    color: #fff;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
  }

  .toggle-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  /* ── Streaming dot ── */
  .streaming-indicator {
    display: flex;
    align-items: center;
  }

  .streaming-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--brand-green, #22c55e);
    animation: pulse 1.4s ease-in-out infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.35;
      transform: scale(0.75);
    }
  }

  /* ── Header buttons ── */
  .header-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    padding: 0;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: #aaa;
    cursor: pointer;
    transition: all 0.15s;
  }

  .header-btn:hover {
    background: rgba(255, 255, 255, 0.12);
    color: #fff;
  }

  .header-btn:disabled {
    cursor: not-allowed;
    opacity: 0.38;
  }

  .header-btn:focus-visible,
  .toggle-btn:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }

  .header-btn.success {
    color: #22c55e;
  }

  .header-btn.active {
    background: rgba(255, 255, 255, 0.18);
    color: #fff;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
  }

  .zoom-controls {
    display: flex;
    align-items: center;
    height: 36px;
    padding: 0 4px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 9px;
    background: rgba(var(--glass-tint, 255, 255, 255), 0.08);
    color: #d8d8d8;
    flex-shrink: 0;
  }

  .zoom-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: none;
    border-radius: 7px;
    background: transparent;
    color: inherit;
    cursor: pointer;
    transition: all 0.15s;
  }

  .zoom-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.12);
    color: #fff;
  }

  .zoom-btn:disabled {
    cursor: not-allowed;
    opacity: 0.38;
  }

  .zoom-btn:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }

  .zoom-value {
    min-width: 42px;
    padding: 0 2px;
    color: var(--text-secondary, #b8b8b8);
    font-size: 0.76rem;
    font-weight: 650;
    line-height: 1;
    text-align: center;
    font-variant-numeric: tabular-nums;
    user-select: none;
  }

  .header-btn.close-btn {
    background: rgba(239, 68, 68, 0.1);
    color: #f87171;
  }

  .header-btn.close-btn:hover {
    background: rgba(239, 68, 68, 0.18);
    color: #fff;
  }

  /* ── Toast ── */
  .toast {
    position: absolute;
    top: 56px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    background: rgba(20, 20, 20, 0.92);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(34, 197, 94, 0.25);
    border-radius: 12px;
    color: #fff;
    font-size: 0.84rem;
    font-weight: 500;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
    z-index: 100;
    animation: toastIn 0.3s cubic-bezier(0.16, 1, 0.3, 1), toastOut 0.25s 1.9s ease-in forwards;
    pointer-events: none;
  }

  @keyframes toastIn {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(-8px) scale(0.95);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0) scale(1);
    }
  }

  @keyframes toastOut {
    from {
      opacity: 1;
      transform: translateX(-50%) translateY(0) scale(1);
    }
    to {
      opacity: 0;
      transform: translateX(-50%) translateY(-8px) scale(0.95);
    }
  }

  /* ── Body ── */
  .artifact-body {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    position: relative;
    z-index: 1;
  }

  /* ── Code view ── */
  .code-view {
    margin: 0;
    padding: 14px;
    height: 100%;
    overflow: auto;
    background: rgba(var(--glass-tint, 255, 255, 255), 0.02);
    font-family: "SF Mono", Monaco, Menlo, "Ubuntu Mono", monospace;
    font-size: 0.82rem;
    line-height: 1.65;
    color: var(--text-primary, #e0e0e0);
    white-space: pre-wrap;
    word-break: break-word;
    tab-size: 2;
  }

  .code-view code {
    display: block;
    min-width: 100%;
    background: transparent;
    color: inherit;
  }

  .code-view :global(.hljs) {
    padding: 0;
    background: transparent;
  }

  .cursor-blink {
    animation: blink 0.8s step-end infinite;
    color: var(--brand, #6366f1);
    font-weight: bold;
  }

  @keyframes blink {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0;
    }
  }

  /* ── Markdown preview ── */
  .markdown-preview {
    padding: 14px 20px;
    height: 100%;
    overflow: auto;
    color: var(--text-primary, #e0e0e0);
    font-size: 0.9rem;
    line-height: 1.7;
  }

  .markdown-preview :global(h1),
  .markdown-preview :global(h2),
  .markdown-preview :global(h3) {
    margin: 1em 0 0.5em;
    color: var(--text-primary, #fff);
  }

  .markdown-preview :global(h1:first-child),
  .markdown-preview :global(h2:first-child),
  .markdown-preview :global(h3:first-child) {
    margin-top: 0;
  }

  .markdown-preview :global(p) {
    margin: 0 0 0.75em;
  }

  .markdown-preview :global(ul),
  .markdown-preview :global(ol) {
    margin: 0.5em 0;
    padding-left: 1.5em;
  }

  .markdown-preview :global(code) {
    font-family: "SF Mono", Monaco, Menlo, monospace;
    font-size: 0.85em;
    background: rgba(var(--glass-tint, 255, 255, 255), 0.08);
    padding: 2px 6px;
    border-radius: 4px;
  }

  .markdown-preview :global(pre) {
    margin: 0.75em 0;
    padding: 14px;
    border-radius: 8px;
    background: rgba(var(--glass-tint, 255, 255, 255), 0.04);
    overflow-x: auto;
  }

  .markdown-preview :global(pre code) {
    background: transparent;
    padding: 0;
  }

  .markdown-preview :global(blockquote) {
    border-left: 3px solid var(--brand, #6366f1);
    margin: 0.75em 0;
    padding-left: 1em;
    color: var(--text-secondary, #aaa);
  }

  .markdown-preview :global(table) {
    border-collapse: collapse;
    margin: 0.75em 0;
    width: 100%;
  }

  .markdown-preview :global(th),
  .markdown-preview :global(td) {
    padding: 6px 12px;
    border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.1));
    text-align: left;
  }

  .markdown-preview :global(th) {
    background: rgba(var(--glass-tint, 255, 255, 255), 0.06);
    font-weight: 600;
  }

  /* ── Preview iframe ── */
  .preview-shell {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  .preview-viewport {
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #fff;
  }

  .preview-viewport.desktop {
    display: flex;
    align-items: flex-start;
    justify-content: flex-start;
    overflow: auto;
    touch-action: pan-x pan-y;
    overscroll-behavior: contain;
    padding: 16px 16px 72px;
    background:
      linear-gradient(45deg, rgba(255, 255, 255, 0.045) 25%, transparent 25%),
      linear-gradient(-45deg, rgba(255, 255, 255, 0.045) 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, rgba(255, 255, 255, 0.045) 75%),
      linear-gradient(-45deg, transparent 75%, rgba(255, 255, 255, 0.045) 75%),
      #121417;
    background-position:
      0 0,
      0 8px,
      8px -8px,
      -8px 0;
    background-size: 16px 16px;
  }

  .desktop-preview-frame {
    position: relative;
    flex: 0 0 auto;
    margin-inline: auto;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 10px;
    overflow: hidden;
    background: #fff;
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.35);
  }

  .preview-zoom-controls {
    position: absolute;
    bottom: calc(14px + var(--app-safe-area-bottom, 0px));
    left: 50%;
    z-index: 6;
    transform: translateX(-50%);
    background: rgba(18, 20, 23, 0.88);
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.34);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
  }

  .desktop-preview-inner {
    width: 1440px;
    height: 900px;
    transform-origin: top left;
    backface-visibility: hidden;
  }

  /* Only while pinching. `will-change: transform` pins the layer's raster scale,
     so mid-gesture frames composite instead of re-rasterizing the iframe — that
     re-raster is what flickers on artifacts heavy enough to miss a frame (SVG in
     particular, which has no bitmap to interpolate). Dropping the hint at the end
     of the gesture triggers a single crisp re-raster. It is not applied
     permanently because a pinned layer this large costs real GPU memory. */
  .desktop-preview-inner.zooming {
    will-change: transform;
  }

  /* Both of these are recomputed every frame while the box resizes: a 50px-blur
     shadow, and a rounded `overflow: hidden` clip — which needs a mask layer,
     whereas a square clip is a cheap compositor rect. Restore them on release.
     Purely cosmetic during the gesture; drop this rule to keep the chrome. */
  .desktop-preview-frame.zooming {
    box-shadow: none;
    border-radius: 0;
  }

  .preview-iframe {
    width: 100%;
    height: 100%;
    border: none;
    background: #fff;
    display: block;
  }

  .desktop-preview-iframe {
    width: 1440px;
    height: 900px;
  }

  .preview-viewport.desktop.native {
    display: block;
    overflow: hidden;
    padding: 0;
    background: #fff;
    touch-action: auto;
  }

  .native-preview-surface {
    width: 100%;
    height: 100%;
    background: #fff;
  }

  @media (max-width: 640px) {
    .artifact-header {
      min-height: 56px;
      padding: 9px 10px;
    }

    .artifact-panel.fullscreen .artifact-header {
      min-height: calc(56px + var(--app-safe-area-top, 0px));
      padding-top: calc(9px + var(--app-safe-area-top, 0px));
    }

    .artifact-title {
      font-size: 0.82rem;
    }

    .header-right {
      gap: 2px;
    }

    .header-btn {
      width: 34px;
      height: 34px;
    }

    .zoom-controls {
      height: 34px;
      padding: 0 3px;
    }

    .zoom-btn {
      width: 26px;
      height: 26px;
    }

    .zoom-value {
      min-width: 38px;
      font-size: 0.72rem;
    }

    .preview-viewport.desktop {
      padding: 12px 12px calc(64px + var(--app-safe-area-bottom, 0px));
    }

    .preview-zoom-controls {
      bottom: calc(10px + var(--app-safe-area-bottom, 0px));
    }

    .header-right {
      overflow-x: auto;
      scrollbar-width: none;
    }

    .header-right::-webkit-scrollbar {
      display: none;
    }

    .toggle-btn {
      width: 32px;
      height: 32px;
    }

    .markdown-preview {
      padding: 12px 14px;
    }

    .code-view {
      padding: 12px;
      font-size: 0.78rem;
    }
  }

  @media (orientation: landscape) and (max-height: 640px) {
    .artifact-header {
      min-height: 40px;
      gap: 6px;
      padding: 4px 6px 4px 8px;
    }

    .artifact-panel.fullscreen .artifact-header {
      min-height: calc(40px + var(--app-safe-area-top, 0px));
      padding-top: calc(4px + var(--app-safe-area-top, 0px));
    }

    .artifact-title {
      font-size: 0.78rem;
    }

    .view-toggle {
      gap: 0;
      padding: 1px;
      border-radius: 8px;
    }

    .toggle-btn {
      width: 28px;
      height: 28px;
      border-radius: 6px;
    }

    .header-right {
      gap: 0;
    }

    .header-btn {
      width: 30px;
      height: 30px;
      border-radius: 6px;
    }

    .artifact-tabs {
      gap: 4px;
      padding: 4px 8px;
    }

    .artifact-tab {
      min-height: 28px;
      padding: 3px 8px;
    }

    .toast {
      top: 44px;
    }
  }
</style>
