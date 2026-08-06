<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { tick } from "svelte";
  import { renderMarkdown, copyToClipboard } from "../../../utils/markdown";
  import { getArtifact } from "../../../api/artifactsApi";
  import SaveToProjectModal from "./SaveToProjectModal.svelte";
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
  let isDownloading = $state(false);

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

  async function handleCopy() {
    const success = await copyToClipboard(code);
    if (success) {
      copySuccess = true;
      triggerToast("Copied to clipboard");
      setTimeout(() => { copySuccess = false; }, 2000);
    }
  }

  async function handleDownload() {
    if (isDownloading || isStreaming || code.length === 0) return;
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
    iframeKey++;
  }
</script>

<div class="artifact-panel">
  <div class="artifact-header">
    <div class="header-left">
      <div class="view-toggle">
        <button
          class="toggle-btn"
          class:active={activeView === "preview"}
          onclick={() => (activeView = "preview")}
          disabled={isStreaming}
          title="Preview"
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
          class="toggle-btn"
          class:active={activeView === "code"}
          onclick={() => (activeView = "code")}
          title="Code"
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
    <div class="header-right">
      {#if activeView === "preview" && !isStreaming && type === "html"}
        <button
          class="header-btn"
          onclick={handleReload}
          title="Reload preview"
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
      <button
        class="header-btn"
        onclick={handleDownload}
        title="Download as .{type === 'markdown' ? 'md' : 'html'}"
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
        class="header-btn"
        onclick={() => (showSaveToProject = true)}
        title="Save to project"
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
        class="header-btn"
        class:success={copySuccess}
        onclick={handleCopy}
        title={copySuccess ? "Copied!" : "Copy code"}
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
        <span>Loading artifact…</span>
      </div>
    {:else if activeView === "code"}
      <pre class="code-view" bind:this={codeContainer}><code
          >{code}{#if isStreaming}<span class="cursor-blink">|</span>{/if}</code
        ></pre>
    {:else if type === "markdown"}
      <div class="markdown-preview">{@html renderedMarkdown}</div>
    {:else}
      {#key iframeKey}
        <iframe
          title="Artifact Preview"
          class="preview-iframe"
          srcdoc={code}
          sandbox="allow-same-origin allow-scripts"
        ></iframe>
      {/key}
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
    height: 100vh;
    border-left: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
    background: var(--bg-primary);
    animation: panelSlideIn 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  }

  @keyframes panelSlideIn {
    from {
      opacity: 0;
      transform: translateX(16px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  /* ── Header ── */
  .artifact-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    border-bottom: 1px solid var(--glass-border, rgba(255, 255, 255, 0.12));
    background: rgba(var(--glass-tint, 255, 255, 255), 0.06);
    flex-shrink: 0;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 8px;
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
    gap: 2px;
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
    padding: 4px 12px;
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
    padding: 4px 10px;
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

  .header-btn.success {
    color: #22c55e;
  }

  .header-btn.close-btn {
    font-weight: 600;
    font-size: 0.85rem;
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
    overflow: hidden;
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
  .preview-iframe {
    width: 100%;
    height: 100%;
    border: none;
    background: #fff;
  }
</style>
