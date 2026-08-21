<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { onMount, tick } from "svelte";
  import type {
    ProviderInfo,
    ModelInfo,
    SpeechRecognition,
    SpeechRecognitionEvent,
    SpeechRecognitionErrorEvent,
  } from "../../../api/models";
  import { isImageModel, isSelectableChatModel } from "../../../api/models";
  import { uploadDocument, type UploadedFile } from "../../../api/chatApi";
  import type { MCPServer } from "../../../admin/types.js";
  import { _ } from "svelte-i18n";
  import SkillPicker from "./SkillPicker.svelte";
  import {
    providerIconSvg,
    providerIconUrl,
  } from "../../../utils/providerIcon";

  interface MessageInputProps {
    onSend: (
      message: string,
      uploadedFiles?: UploadedFile[],
      webSearch?: boolean,
    ) => void;
    disabled?: boolean;
    placeholder?: string;
    selectedModel?: string;
    selectedProvider?: string;
    onModelSelect?: (provider: ProviderInfo, model: ModelInfo) => void;
    onRemoveModel?: () => void;
    providers?: ProviderInfo[];
    loadingModels?: boolean;
    modelsError?: string | null;
    mcpServers?: MCPServer[];
    selectedMcpServers?: string[];
    loadingMcpServers?: boolean;
    mcpServersError?: string | null;
    onMcpToggle?: (serverId: string) => void;
    webSearchEnabled?: boolean;
    onWebSearchToggle?: () => void;
    conversationId?: string | null;
    pendingSkillIds?: string[];
    /** True when the selected model generates images (drives the composer hint & badge). */
    imageModelSelected?: boolean;
  }

  let {
    onSend,
    disabled = false,
    placeholder,
    selectedModel,
    selectedProvider,
    onModelSelect,
    onRemoveModel,
    providers = [],
    loadingModels = false,
    modelsError = null,
    mcpServers = [],
    selectedMcpServers = [],
    loadingMcpServers = false,
    mcpServersError = null,
    onMcpToggle,
    webSearchEnabled = false,
    onWebSearchToggle,
    conversationId = null,
    pendingSkillIds = $bindable([]),
    imageModelSelected = false,
  }: MessageInputProps = $props();

  // Split a provider's models into selectable text and image groups (embedding
  // models are never selectable in chat). Loaded from the registry — not hardcoded.
  function splitModels(models: ModelInfo[]) {
    const selectable = models.filter(isSelectableChatModel);
    return {
      text: selectable.filter((m) => !isImageModel(m)),
      image: selectable.filter(isImageModel),
    };
  }
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

  let textarea: HTMLTextAreaElement;
  let fileInput: HTMLInputElement;
  let message = $state("");
  let attachedFiles = $state<File[]>([]);
  let uploadingFiles = $state<Set<string>>(new Set());
  let uploadedFileResults = $state<Map<string, UploadedFile>>(new Map());
  let failedUploads = $state<Set<string>>(new Set());
  let filePreviews = $state<Record<string, string>>({});
  let imageThumbnails = $state<Record<string, string>>({});
  let showFilePreview = $state(false);
  let showImagePreview = $state(false);
  let currentPreviewFile = $state<File | null>(null);
  let currentPreviewImage = $state<{ file: File; url: string } | null>(null);
  let showPlusMenu = $state(false);
  let skillPickerOpen = $state(false);
  let showModelDropdown = $state(false);
  let showConnectorsDropdown = $state(false);

  // Voice input state
  let isRecording = $state(false);
  let recognition: SpeechRecognition | null = null;
  let microphoneError = $state<string | null>(null);

  // Dynamic placeholder based on recording state
  let currentPlaceholder = $derived(
    isRecording
      ? $_("chat.messageInput.recordingPlaceholder")
      : placeholder || $_("chat.messageInput.placeholder"),
  );

  const connectorsLabel = $derived($_("chat.messageInput.tools"));

  function autoResize() {
    if (!textarea) return;
    textarea.style.height = "auto";
    const maxHeight = window.innerHeight * 0.4;
    const scrollHeight = textarea.scrollHeight;
    const newHeight = Math.max(20, Math.min(scrollHeight, maxHeight));
    textarea.style.height = newHeight + "px";
    textarea.style.overflowY = scrollHeight > maxHeight ? "auto" : "hidden";
  }

  function handleInput() {
    autoResize();
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  }

  let isUploading = $derived(uploadingFiles.size > 0);

  // ===== File validation & drag-and-drop =====
  // Max upload size per file, enforced identically for the picker and drag & drop.
  const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

  let isDraggingFiles = $state(false);
  // dragenter/dragleave also fire when moving between child elements, so we count
  // enters vs leaves to know when the pointer has truly left the drop zone.
  let dragDepth = 0;
  let fileError = $state<string | null>(null);

  // Validate a file against the shared size constraint. Returns a localized error
  // message, or null when the file is acceptable. Types are unrestricted to match
  // the picker (no accept attribute, so photos and any file type are allowed).
  function validateFile(file: File): string | null {
    if (file.size > MAX_FILE_SIZE) {
      return $_("chat.messageInput.fileTooLarge", {
        values: { name: file.name, max: formatFileSize(MAX_FILE_SIZE) },
      });
    }
    return null;
  }

  // Shared entry point for adding files from either the picker or a drop: it
  // validates, reports rejected files, and uploads/previews the accepted ones.
  function addFiles(files: File[]) {
    if (files.length === 0) return;

    const accepted: File[] = [];
    const rejected: string[] = [];
    for (const file of files) {
      if (validateFile(file)) rejected.push(file.name);
      else accepted.push(file);
    }

    fileError =
      rejected.length > 0
        ? $_("chat.messageInput.filesRejected", {
            values: { names: rejected.join(", ") },
          })
        : null;

    if (accepted.length === 0) return;

    attachedFiles = [...attachedFiles, ...accepted];

    // Generate previews and start uploading immediately (same flow as the picker).
    for (const file of accepted) {
      uploadFileImmediately(file);

      if (isTextFile(file)) {
        readFileContent(file).then((content) => {
          filePreviews[file.name] = content;
        });
      } else if (isImageFile(file)) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const result = e.target?.result as string;
          if (result) {
            imageThumbnails[file.name] = result;
            imageThumbnails = { ...imageThumbnails };
            attachedFiles = [...attachedFiles];
          }
        };
        reader.readAsDataURL(file);
      }
    }
  }

  // True when the drag payload contains OS files (vs. text/element drags).
  function dragHasFiles(e: DragEvent): boolean {
    const types = e.dataTransfer?.types;
    return !!types && Array.from(types).includes("Files");
  }

  function handleDragEnter(e: DragEvent) {
    if (disabled || !dragHasFiles(e)) return;
    e.preventDefault();
    dragDepth++;
    isDraggingFiles = true;
  }

  function handleDragOver(e: DragEvent) {
    if (disabled || !dragHasFiles(e)) return;
    // Must preventDefault on dragover for the element to be a valid drop target.
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    isDraggingFiles = true;
  }

  function handleDragLeave(_e: DragEvent) {
    if (!isDraggingFiles) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) isDraggingFiles = false;
  }

  function handleDrop(e: DragEvent) {
    dragDepth = 0;
    isDraggingFiles = false;
    if (disabled || !dragHasFiles(e)) return;
    e.preventDefault();
    const dropped = e.dataTransfer?.files
      ? Array.from(e.dataTransfer.files)
      : [];
    addFiles(dropped);
  }

  async function uploadFileImmediately(file: File) {
    uploadingFiles.add(file.name);
    uploadingFiles = new Set(uploadingFiles);
    try {
      const uploaded = await uploadDocument({
        file,
        provider: selectedProvider || "openai",
      });
      uploadedFileResults.set(file.name, uploaded);
      uploadedFileResults = new Map(uploadedFileResults);
      failedUploads.delete(file.name);
      failedUploads = new Set(failedUploads);
    } catch (error) {
      console.error(`Failed to upload file: ${file.name}`, error);
      failedUploads.add(file.name);
      failedUploads = new Set(failedUploads);
    } finally {
      uploadingFiles.delete(file.name);
      uploadingFiles = new Set(uploadingFiles);
    }
  }

  async function handleSend() {
    const trimmed = message.trim();
    if ((trimmed || attachedFiles.length > 0) && !disabled && !isUploading) {
      // Collect already-uploaded file results
      const uploadedFiles: UploadedFile[] = [];
      for (const file of attachedFiles) {
        const result = uploadedFileResults.get(file.name);
        if (result) {
          uploadedFiles.push(result);
        }
      }

      // Send message with successfully uploaded file metadata
      onSend(
        trimmed,
        uploadedFiles.length > 0 ? uploadedFiles : undefined,
        webSearchEnabled,
      );
      message = "";
      attachedFiles = [];
      uploadedFileResults = new Map();
      failedUploads = new Set();
      fileError = null;

      if (textarea) {
        textarea.style.height = "auto";
      }
    }
  }

  function togglePlusMenu() {
    showPlusMenu = !showPlusMenu;
    if (showPlusMenu) showModelDropdown = false;
  }

  function selectModel(provider: ProviderInfo, model: ModelInfo) {
    onModelSelect?.(provider, model);
    showModelDropdown = false;
  }

  // Expose focus method for external callers
  export function focus() {
    textarea?.focus();
  }

  // Lets the empty-state suggestion cards drop a prompt into the composer.
  export function setMessage(text: string) {
    message = text;
    tick().then(() => {
      autoResize();
      textarea?.focus();
      const end = textarea?.value.length ?? 0;
      textarea?.setSelectionRange(end, end);
    });
  }

  onMount(() => {
    syncThemeState();
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaQuery.addEventListener("change", syncThemeState);
    autoResize();

    // Cleanup speech recognition on unmount
    return () => {
      mediaQuery.removeEventListener("change", syncThemeState);
      if (recognition) {
        try {
          recognition.stop();
        } catch (error) {
          // Ignore errors during cleanup
        }
      }
    };
  });

  // Sync model selection with props from parent component
  $effect(() => {
    if (selectedModel && selectedProvider && providers.length > 0) {
      // Find the provider and model in the loaded providers
      const provider = providers.find((p) => p.key === selectedProvider);
      if (provider) {
        const model = provider.models.find(
          (m) => m.key === selectedModel || m.name === selectedModel,
        );
        if (model) {
          // The props are already being used in the template, so no need to update internal state
        }
      }
    }
  });

  function handleFileSelect() {
    fileInput?.click();
    showPlusMenu = false;
  }

  function handleFileChange(event: Event) {
    const target = event.target as HTMLInputElement;
    if (target.files) {
      addFiles(Array.from(target.files));
    }
    showPlusMenu = false;
    target.value = "";
  }

  function removeFile(index: number) {
    const file = attachedFiles[index];
    attachedFiles = attachedFiles.filter((_, i) => i !== index);

    if (file) {
      uploadedFileResults.delete(file.name);
      uploadedFileResults = new Map(uploadedFileResults);
      failedUploads.delete(file.name);
      failedUploads = new Set(failedUploads);
    }

    if (file && filePreviews[file.name]) {
      delete filePreviews[file.name];
      if (currentPreviewFile?.name === file.name) {
        showFilePreview = false;
        currentPreviewFile = null;
      }
    }
    if (file && imageThumbnails[file.name]) {
      delete imageThumbnails[file.name];
      if (currentPreviewImage?.file.name === file.name) {
        showImagePreview = false;
        currentPreviewImage = null;
      }
    }
  }

  function isTextFile(file: File): boolean {
    const textTypes = [
      "text/",
      "application/json",
      "application/xml",
      "application/javascript",
      "application/typescript",
      "application/x-yaml",
      "application/yaml",
    ];
    const textExtensions = [
      ".txt",
      ".md",
      ".json",
      ".xml",
      ".js",
      ".ts",
      ".yaml",
      ".yml",
      ".csv",
      ".log",
      ".html",
      ".css",
      ".py",
      ".java",
      ".cpp",
      ".c",
      ".h",
      ".rs",
      ".go",
      ".php",
      ".rb",
      ".swift",
      ".kt",
      ".scala",
      ".r",
      ".sql",
      ".sh",
      ".bash",
      ".zsh",
      ".fish",
      ".ps1",
      ".bat",
      ".cmd",
    ];
    return (
      textTypes.some((type) => file.type.startsWith(type)) ||
      textExtensions.some((ext) => file.name.toLowerCase().endsWith(ext))
    );
  }

  function isImageFile(file: File): boolean {
    const imageTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
      "image/svg+xml",
      "image/bmp",
      "image/tiff",
      "image/heic",
      "image/heif",
      "image/avif",
    ];
    const imageExtensions = [
      ".jpg",
      ".jpeg",
      ".png",
      ".gif",
      ".webp",
      ".svg",
      ".bmp",
      ".tiff",
      ".tif",
      ".heic",
      ".heif",
      ".avif",
    ];
    return (
      imageTypes.includes(file.type) ||
      imageExtensions.some((ext) => file.name.toLowerCase().endsWith(ext))
    );
  }

  function readFileContent(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = (e) => reject(e);
      reader.readAsText(file);
    });
  }

  function openFilePreview(file: File) {
    if (filePreviews[file.name]) {
      currentPreviewFile = file;
      showFilePreview = true;
    }
  }

  function openImagePreview(file: File) {
    if (imageThumbnails[file.name]) {
      currentPreviewImage = { file, url: imageThumbnails[file.name] };
      showImagePreview = true;
    }
  }

  function closeFilePreview() {
    showFilePreview = false;
    currentPreviewFile = null;
  }

  function closeImagePreview() {
    showImagePreview = false;
    currentPreviewImage = null;
  }

  function formatFileSize(bytes: number): string {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  // ===== Speech Recognition =====
  function initializeSpeechRecognition(): SpeechRecognition | null {
    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      microphoneError = $_("chat.messageInput.speechRecognitionNotSupported");
      return null;
    }

    const recognitionInstance = new SpeechRecognitionAPI();
    recognitionInstance.continuous = true;
    recognitionInstance.interimResults = true;
    recognitionInstance.lang = "en-US";

    return recognitionInstance;
  }

  function toggleVoiceInput() {
    if (disabled) return;

    if (isRecording && recognition) {
      // Stop recording
      recognition.stop();
      isRecording = false;
      return;
    }

    // Start recording
    if (!recognition) {
      recognition = initializeSpeechRecognition();
      if (!recognition) return;
    }

    microphoneError = null;

    // Store the text that existed before we started recording
    const textBeforeRecording = message.trim();

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      // Build the full transcript from all results
      let fullTranscript = "";

      for (let i = 0; i < event.results.length; i++) {
        fullTranscript += event.results[i][0].transcript;
      }

      // Combine pre-existing text with new transcription
      message = textBeforeRecording
        ? textBeforeRecording + " " + fullTranscript
        : fullTranscript;

      // Trigger auto-resize for growing textarea
      requestAnimationFrame(autoResize);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === "not-allowed") {
        microphoneError = $_("chat.messageInput.microphoneAccessDenied");
      } else if (event.error === "no-speech") {
        // User didn't speak - silently stop
      } else if (event.error !== "aborted") {
        microphoneError = $_("chat.messageInput.voiceInputError", {
          values: { error: event.error },
        });
      }
      isRecording = false;
    };

    recognition.onend = () => {
      isRecording = false;
    };

    try {
      recognition.start();
      isRecording = true;
    } catch (error) {
      console.error("Failed to start speech recognition:", error);
      microphoneError = $_("chat.messageInput.failedToStartVoiceInput");
      isRecording = false;
    }
  }

  // Close dropdowns when clicking outside
  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (
      !target.closest(".plus-menu-container") &&
      !target.closest(".plus-btn")
    ) {
      showPlusMenu = false;
    }
    if (
      !target.closest(".model-dropdown-container") &&
      !target.closest(".model-selector-btn")
    ) {
      showModelDropdown = false;
    }
    if (
      !target.closest(".connectors-dropdown-container") &&
      !target.closest(".connectors-selector-btn")
    ) {
      showConnectorsDropdown = false;
    }
  }

  onMount(() => {
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  });
</script>

<!-- Hidden file input: no accept so mobile can reach Photo Library and Browse -->
<input
  type="file"
  bind:this={fileInput}
  onchange={handleFileChange}
  multiple
  style="display: none"
/>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="input-area-wrapper"
  class:dragging={isDraggingFiles}
  ondragenter={handleDragEnter}
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
>
  <!-- Drag & drop overlay: shown while files are dragged over the composer -->
  {#if isDraggingFiles}
    <div class="drop-overlay" aria-hidden="true">
      <div class="drop-overlay-inner">
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          aria-hidden="true"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 5 17 10"></polyline>
          <line x1="12" y1="5" x2="12" y2="15"></line>
        </svg>
        <span class="drop-overlay-title"
          >{$_("chat.messageInput.dropFilesHere")}</span
        >
      </div>
    </div>
  {/if}

  <!-- Invalid-file error (size/type validation) -->
  {#if fileError}
    <div class="file-error" role="alert">
      <svg
        width="16"
        height="16"
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
      <span class="file-error-text">{fileError}</span>
      <button
        class="file-error-dismiss"
        onclick={() => (fileError = null)}
        aria-label={$_("chat.errors.dismissError")}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          aria-hidden="true"
        >
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
  {/if}

  <!-- File Attachments Display -->
  {#if attachedFiles.length > 0}
    <div class="file-attachments">
      {#each attachedFiles as file, index}
        <div
          class="file-pill"
          class:file-pill-image={isImageFile(file)}
          class:file-pill-uploading={uploadingFiles.has(file.name)}
          class:file-pill-failed={failedUploads.has(file.name)}
        >
          {#if isImageFile(file)}
            <button
              class="thumbnail-button"
              onclick={() => openImagePreview(file)}
              aria-label={$_("chat.messageInput.previewImage", {
                values: { name: file.name },
              })}
            >
              {#if imageThumbnails[file.name]}
                <img
                  src={imageThumbnails[file.name]}
                  alt={file.name}
                  class="file-thumbnail"
                />
              {:else}
                <div class="thumbnail-placeholder">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"
                    ></rect>
                    <circle cx="8.5" cy="8.5" r="1.5"></circle>
                    <polyline points="21 15 16 10 5 21"></polyline>
                  </svg>
                </div>
              {/if}
            </button>
          {:else}
            <button
              class="thumbnail-button file-icon-button"
              onclick={() => (isTextFile(file) ? openFilePreview(file) : null)}
              aria-label={isTextFile(file)
                ? $_("chat.messageInput.previewFile", {
                    values: { name: file.name },
                  })
                : $_("chat.messageInput.fileLabel", {
                    values: { name: file.name },
                  })}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
              >
                <path
                  d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"
                ></path>
                <polyline points="14,2 14,8 20,8"></polyline>
              </svg>
            </button>
            <span class="file-name" title={file.name}>{file.name}</span>
            <span class="file-size">{formatFileSize(file.size)}</span>
          {/if}
          {#if uploadingFiles.has(file.name)}
            <span class="pill-upload-status uploading">
              <span class="pill-spinner"></span>
              <span class="pill-status-text"
                >{$_("chat.messageInput.uploading")}</span
              >
            </span>
          {:else if failedUploads.has(file.name)}
            <span class="pill-upload-status failed"
              >✕ {$_("chat.messageInput.uploadFailed")}</span
            >
          {:else if uploadedFileResults.has(file.name)}
            <span class="pill-upload-status success">✓</span>
          {/if}
          <button
            class="pill-remove-btn"
            onclick={() => removeFile(index)}
            aria-label={$_("chat.messageInput.removeFile")}
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
            >
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Image-generation hint: shown when an image model is selected. Reuses the
       standard composer; describes the generate + edit-by-attachment flows. -->
  {#if imageModelSelected}
    <div class="image-mode-hint" role="note">
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        aria-hidden="true"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
        <circle cx="8.5" cy="8.5" r="1.5"></circle>
        <polyline points="21 15 16 10 5 21"></polyline>
      </svg>
      <span>{$_("chat.messageInput.imageModeHint")}</span>
    </div>
  {/if}

  <!-- Main Input Container -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="input-container-main"
    onclick={(e) => {
      if (
        e.target === e.currentTarget ||
        ((e.target as HTMLElement).closest(".input-container-main") &&
          !(e.target as HTMLElement).closest("button"))
      )
        textarea?.focus();
    }}
  >
    <!-- Full-area Textarea -->
    <textarea
      bind:this={textarea}
      bind:value={message}
      oninput={handleInput}
      onkeydown={handleKeyDown}
      placeholder={currentPlaceholder}
      {disabled}
      rows="1"
      class="chat-input-textarea"
      class:recording={isRecording}
      aria-label={$_("chat.messageInput.messageInput")}
    ></textarea>

    <!-- Floating Bottom Bar -->
    <div class="input-bottom-bar">
      <!-- Left: Plus button and Model selector -->
      <div class="bottom-bar-left">
        <div class="plus-menu-container">
          <button
            class="input-btn plus-btn"
            onclick={togglePlusMenu}
            aria-label={$_("chat.messageInput.addContent")}
            title={$_("chat.messageInput.addContent")}
            {disabled}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M12 5v14m-7-7h14" />
            </svg>
          </button>

          {#if showPlusMenu}
            <div class="plus-menu">
              <button class="menu-item" onclick={handleFileSelect}>
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
                  <path
                    d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"
                  ></path>
                </svg>
                <span>{$_("chat.messageInput.addPhotosAndFiles")}</span>
              </button>
              <button
                class="menu-item"
                onclick={(e) => {
                  e.stopPropagation();
                  showPlusMenu = false;
                  skillPickerOpen = true;
                }}
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
                  <path d="M12 2l2.4 5.5L20 8l-4 4 1 6-5-3-5 3 1-6-4-4 5.6-.5z"
                  ></path>
                </svg>
                <span>{$_("chat.skills.label")}</span>
              </button>
            </div>
          {/if}

          <SkillPicker
            {conversationId}
            bind:pendingSkillIds
            bind:open={skillPickerOpen}
            showTrigger={false}
          />
        </div>

        <div class="model-dropdown-container">
          <button
            class="selector-btn model-selector-btn"
            onclick={() => {
              showModelDropdown = !showModelDropdown;
              showPlusMenu = false;
            }}
            title={$_("chat.messageInput.selectModel")}
            aria-label={$_("chat.messageInput.selectModel")}
          >
            <div class="model-icon">
              {#if selectedProvider}
                {@const providerIcon = getIconForTheme(
                  providers.find((p) => p.key === selectedProvider),
                )}
                {@const iconSvg = providerIconSvg(providerIcon)}
                {@const iconUrl = providerIconUrl(providerIcon)}
                {#if iconSvg}
                  <span class="provider-icon-img" aria-hidden="true"
                    >{@html iconSvg}</span
                  >
                {:else if iconUrl}
                  <img src={iconUrl} alt="" class="provider-icon-img" />
                {:else}
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <circle cx="12" cy="12" r="10" />
                  </svg>
                {/if}
              {:else}
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4" />
                  <path d="M12 8h.01" />
                </svg>
              {/if}
            </div>
            <span class="selector-label model-caption"
              >{selectedModel ||
                $_("chat.messageInput.selectModelFallback")}</span
            >
            {#if imageModelSelected}
              <svg
                class="trigger-type-icon"
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                role="img"
                aria-label={$_("chat.messageInput.imageModel")}
              >
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                <polyline points="21 15 16 10 5 21"></polyline>
              </svg>
            {/if}
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              class="dropdown-arrow"
              class:open={showModelDropdown}
            >
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>

          {#snippet modelOption(
            provider: ProviderInfo,
            model: ModelInfo,
            isImage: boolean,
          )}
            <button
              class="menu-item model-option"
              class:selected={selectedModel === model.key ||
                selectedModel === model.name}
              onclick={() => selectModel(provider, model)}
              title={model.comment || model.name}
            >
              <span class="model-name">{model.name}</span>
              <div class="model-capabilities">
                {#if isImage}
                  <!-- Image model: picture icon (replaces the old text badge) -->
                  <svg
                    class="capability-icon type-icon type-image active"
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    role="img"
                    aria-label={$_("chat.messageInput.imageModel")}
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"
                    ></rect>
                    <circle cx="8.5" cy="8.5" r="1.5"></circle>
                    <polyline points="21 15 16 10 5 21"></polyline>
                  </svg>
                {:else}
                  <!-- Text model: text/type icon -->
                  <svg
                    class="capability-icon type-icon type-text active"
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    role="img"
                    aria-label={$_("chat.messageInput.textModel")}
                  >
                    <polyline points="4 7 4 4 20 4 20 7"></polyline>
                    <line x1="9" y1="20" x2="15" y2="20"></line>
                    <line x1="12" y1="4" x2="12" y2="20"></line>
                  </svg>
                  {#if model.supports_vision}
                    <svg
                      class="capability-icon active"
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      role="img"
                      aria-label={$_("chat.messageInput.visionCapable")}
                    >
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  {/if}
                {/if}
              </div>
            </button>
          {/snippet}

          {#if showModelDropdown}
            <div class="model-menu">
              {#if loadingModels}
                <div class="dropdown-loading">
                  <div class="loading-spinner"></div>
                  <span>{$_("chat.messageInput.loadingModels")}</span>
                </div>
              {:else if modelsError}
                <div class="dropdown-error">{modelsError}</div>
              {:else}
                {#each providers as provider}
                  {@const grouped = splitModels(provider.models)}
                  {#if grouped.text.length > 0 || grouped.image.length > 0}
                    {@const providerIcon = getIconForTheme(provider)}
                    {@const iconSvg = providerIconSvg(providerIcon)}
                    {@const iconUrl = providerIconUrl(providerIcon)}
                    <div class="provider-section">
                      <div class="provider-header">
                        <div class="provider-icon">
                          {#if iconSvg}
                            <span class="provider-icon-img" aria-hidden="true"
                              >{@html iconSvg}</span
                            >
                          {:else if iconUrl}
                            <img
                              src={iconUrl}
                              alt=""
                              class="provider-icon-img"
                            />
                          {/if}
                        </div>
                        <span class="provider-name">{provider.name}</span>
                      </div>
                      <div class="provider-models">
                        {#each grouped.text as model}
                          {@render modelOption(provider, model, false)}
                        {/each}
                        {#if grouped.image.length > 0}
                          <div class="model-subgroup-label" role="presentation">
                            <svg
                              width="11"
                              height="11"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              stroke-width="2"
                              aria-hidden="true"
                            >
                              <rect
                                x="3"
                                y="3"
                                width="18"
                                height="18"
                                rx="2"
                                ry="2"
                              ></rect>
                              <circle cx="8.5" cy="8.5" r="1.5"></circle>
                              <polyline points="21 15 16 10 5 21"></polyline>
                            </svg>
                            <span
                              >{$_("chat.messageInput.imageModelsGroup")}</span
                            >
                          </div>
                          {#each grouped.image as model}
                            {@render modelOption(provider, model, true)}
                          {/each}
                        {/if}
                      </div>
                    </div>
                  {/if}
                {/each}
              {/if}
            </div>
          {/if}
        </div>

        <div class="connectors-row">
          <div class="connectors-dropdown-container">
            <button
              class="connectors-trigger connectors-selector-btn"
              onclick={() => {
                showConnectorsDropdown = !showConnectorsDropdown;
              }}
              title={$_("chat.messageInput.selectConnectors")}
              aria-label={$_("chat.messageInput.selectConnectors")}
            >
              <div class="connectors-icon">
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
                  ></path>
                </svg>
              </div>
              <span class="connectors-label">{connectorsLabel}</span>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                class="dropdown-arrow"
                class:open={showConnectorsDropdown}
              >
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>

            {#if showConnectorsDropdown}
              <div class="connectors-menu">
                {#if loadingMcpServers}
                  <div class="dropdown-loading">
                    <div class="loading-spinner"></div>
                    <span>{$_("chat.messageInput.loadingConnectors")}</span>
                  </div>
                {:else if mcpServersError}
                  <div class="dropdown-error">{mcpServersError}</div>
                {:else if mcpServers.length === 0}
                  <div class="dropdown-empty">
                    {$_("chat.messageInput.noConnectors")}
                  </div>
                {:else}
                  <div class="connectors-list">
                    {#each mcpServers as server (server.id)}
                      <div
                        class="connectors-row-item"
                        class:selected={selectedMcpServers.includes(server.id)}
                      >
                        <div class="connectors-info">
                          <span class="connectors-name">{server.name}</span>
                        </div>
                        <button
                          type="button"
                          class="connectors-switch"
                          class:active={selectedMcpServers.includes(server.id)}
                          onclick={() => onMcpToggle?.(server.id)}
                          aria-label={selectedMcpServers.includes(server.id)
                            ? $_("admin.mcpServers.enabled")
                            : $_("admin.mcpServers.disabled")}
                        >
                          <span class="switch-thumb"></span>
                        </button>
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        </div>

        <button
          class="toggle-btn"
          class:active={webSearchEnabled}
          onclick={onWebSearchToggle}
          title={webSearchEnabled
            ? $_("chat.messageInput.disableWebSearch")
            : $_("chat.messageInput.enableWebSearch")}
          aria-label={webSearchEnabled
            ? $_("chat.messageInput.disableWebSearch")
            : $_("chat.messageInput.enableWebSearch")}
          aria-pressed={webSearchEnabled}
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
            <path d="M2 12h20" />
            <path
              d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
            />
          </svg>
          {#if webSearchEnabled}
            <span class="toggle-label">{$_("chat.messageInput.search")}</span>
          {/if}
        </button>
      </div>

      <!-- Center: Spacer -->
      <div class="bottom-bar-center"></div>

      <!-- Right: Mic and Send -->
      <div class="bottom-bar-right">
        <button
          class="input-btn mic-btn"
          class:recording={isRecording}
          onclick={toggleVoiceInput}
          aria-label={isRecording
            ? $_("chat.messageInput.stopRecording")
            : $_("chat.messageInput.voiceInput")}
          title={isRecording
            ? $_("chat.messageInput.stopRecording")
            : $_("chat.messageInput.voiceInput")}
          {disabled}
        >
          {#if isRecording}
            <!-- Filled circle during recording -->
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="currentColor"
              stroke="none"
            >
              <circle cx="12" cy="12" r="8" />
            </svg>
          {:else}
            <!-- Microphone icon when idle -->
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <path d="M12 19v4" />
              <path d="M8 23h8" />
            </svg>
          {/if}
        </button>

        <button
          class="input-btn send-btn"
          onclick={handleSend}
          disabled={disabled ||
            isUploading ||
            (!message.trim() && attachedFiles.length === 0)}
          aria-label={isUploading
            ? $_("chat.messageInput.uploading")
            : $_("chat.messageInput.sendMessage")}
          title={isUploading
            ? $_("chat.messageInput.uploading")
            : $_("chat.messageInput.sendMessageTitle")}
        >
          {#if disabled || isUploading}
            <svg
              class="spinner"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <circle cx="12" cy="12" r="10" opacity="0.25"></circle>
              <path d="M12 2a10 10 0 0 1 10 10" opacity="0.75"></path>
            </svg>
          {:else}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="11"
              height="11"
              viewBox="0 0 11 11"
              fill="none"
            >
              <path
                d="M5.08368 9.1676L9.16748 5.0838L5.08368 1M9.16748 5.0838L0.999879 5.0838"
                stroke="white"
                stroke-width="2"
                stroke-linecap="round"
              />
            </svg>
          {/if}
        </button>
      </div>
    </div>
  </div>
</div>

<!-- File Preview Modal -->
{#if showFilePreview && currentPreviewFile}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="preview-overlay"
    role="dialog"
    aria-modal="true"
    onclick={closeFilePreview}
    onkeydown={(e) => e.key === "Escape" && closeFilePreview()}
    tabindex="-1"
  >
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="preview-modal"
      role="document"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <div class="preview-header">
        <div class="preview-info">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"
            ></path>
            <polyline points="14,2 14,8 20,8"></polyline>
          </svg>
          <span class="preview-name">{currentPreviewFile.name}</span>
          <span class="preview-size"
            >{formatFileSize(currentPreviewFile.size)}</span
          >
        </div>
        <button
          class="preview-close"
          onclick={closeFilePreview}
          aria-label={$_("chat.messageInput.closePreview")}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="preview-content">
        <textarea
          class="preview-textarea"
          readonly
          value={filePreviews[currentPreviewFile.name] || ""}
        ></textarea>
      </div>
    </div>
  </div>
{/if}

<!-- Image Preview Modal -->
{#if showImagePreview && currentPreviewImage}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="preview-overlay"
    role="dialog"
    aria-modal="true"
    onclick={closeImagePreview}
    onkeydown={(e) => e.key === "Escape" && closeImagePreview()}
    tabindex="-1"
  >
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="preview-modal image-preview-modal"
      role="document"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <div class="preview-header">
        <div class="preview-info">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <circle cx="8.5" cy="8.5" r="1.5"></circle>
            <polyline points="21 15 16 10 5 21"></polyline>
          </svg>
          <span class="preview-name">{currentPreviewImage.file.name}</span>
          <span class="preview-size"
            >{formatFileSize(currentPreviewImage.file.size)}</span
          >
        </div>
        <button
          class="preview-close"
          onclick={closeImagePreview}
          aria-label={$_("chat.messageInput.closePreview")}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="preview-content image-content">
        <img
          src={currentPreviewImage.url}
          alt={currentPreviewImage.file.name}
          class="preview-image"
        />
      </div>
    </div>
  </div>
{/if}

<style>
  /* ===== Input Area Wrapper ===== */
  .input-area-wrapper {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    width: 100%;
    margin: 0 auto;
    position: relative;
  }

  /* Drag & drop overlay */
  .drop-overlay {
    position: absolute;
    inset: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--glass-radius, 16px);
    border: 2px dashed var(--brand);
    background: color-mix(in oklab, var(--brand) 12%, var(--bg-primary));
    /* Let drag events pass through to the wrapper so enter/leave don't flicker. */
    pointer-events: none;
    animation: dropFadeIn 0.12s ease-out;
  }

  @keyframes dropFadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .drop-overlay-inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-sm);
    color: var(--brand);
    font-weight: 600;
    text-align: center;
    padding: var(--space-lg);
  }

  .drop-overlay-title {
    font-size: 0.95rem;
  }

  /* Invalid-file error banner */
  .file-error {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--radius-md, 10px);
    background: color-mix(
      in oklab,
      var(--error, #dc2626) 12%,
      var(--bg-primary)
    );
    border: 1px solid
      color-mix(in oklab, var(--error, #dc2626) 40%, transparent);
    color: var(--error, #dc2626);
    font-size: 0.85rem;
  }

  .file-error-text {
    flex: 1;
    min-width: 0;
    word-break: break-word;
  }

  .file-error-dismiss {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: inherit;
    cursor: pointer;
    padding: 2px;
    border-radius: var(--radius-sm, 6px);
    opacity: 0.8;
  }

  .file-error-dismiss:hover {
    opacity: 1;
    background: color-mix(in oklab, var(--error, #dc2626) 18%, transparent);
  }

  /* ===== Main Input Container - Liquid Glass ===== */
  .input-container-main {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 32px;
    position: relative;
    min-height: 112px;
    padding: 16px 20px 12px;
    border: none;
    border-radius: 16px;
    background: var(--gx-card);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    box-shadow:
      inset 0 0 0 1px var(--gx-hair),
      0 4px 20px 0 rgba(15, 23, 42, 0.0392);
    transition: box-shadow 160ms ease;
    cursor: text;
  }

  .input-container-main:focus-within {
    box-shadow:
      inset 0 0 0 1px var(--gx-hair-strong),
      0 6px 24px 0 rgba(15, 23, 42, 0.06);
  }

  /* ===== Textarea ===== */
  .chat-input-textarea {
    width: 100%;
    min-height: 20px;
    max-height: 30vh;
    padding: 0;
    border: none !important;
    outline: none !important;
    background: transparent !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
    box-shadow: none !important;
    color: var(--gx-slate-900);
    font-family: var(--gx-font-display);
    font-size: 15px;
    line-height: 20px;
    font-weight: 400;
    resize: none;
    overflow-y: hidden;
    transition: color 0.2s ease;
    border-radius: 0;
    position: relative;
    z-index: 1;
  }

  .chat-input-textarea:focus {
    outline: none !important;
    border: none !important;
    box-shadow: none !important;
    background: transparent !important;
  }

  .chat-input-textarea::placeholder {
    color: var(--gx-slate-500);
    opacity: 1;
  }

  .chat-input-textarea:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* ===== Floating Bottom Bar ===== */
  .input-bottom-bar {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 32px;
    padding: 0;
    background: transparent;
    gap: var(--space-sm);
    z-index: 2;
    pointer-events: none;
  }

  .bottom-bar-left,
  .bottom-bar-right {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    pointer-events: auto;
  }

  .bottom-bar-center {
    flex: 1;
    min-width: 0;
  }

  /* ===== Input Buttons ===== */
  .input-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: none;
    border-radius: 14px;
    background: transparent;
    color: var(--gx-slate-500);
    cursor: pointer;
    transition: background-color 120ms ease;
    flex-shrink: 0;
    box-shadow: none;
  }

  .input-btn svg {
    width: 15px;
    height: 15px;
  }

  /* the attach button is the only outlined circle in the design */
  .input-btn.plus-btn {
    box-shadow: inset 0 0 0 1px var(--gx-hair-strong);
  }

  .input-btn:hover:not(:disabled) {
    background: var(--gx-hover-soft);
    color: var(--gx-slate-500);
    transform: none;
    box-shadow: none;
  }

  .input-btn.plus-btn:hover:not(:disabled) {
    box-shadow: inset 0 0 0 1px var(--gx-hair-strong);
  }

  .input-btn:active:not(:disabled) {
    transform: scale(0.95);
  }

  .input-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* Send Button */
  .input-btn.send-btn {
    width: 32px;
    height: 32px;
    border-radius: 16px;
    background: var(--gx-send);
    color: #fff;
    box-shadow: none;
  }

  .input-btn.send-btn svg {
    width: 16px;
    height: 16px;
  }

  .input-btn.send-btn:hover:not(:disabled) {
    background: var(--gx-send-hover);
    color: #fff;
    transform: none;
    box-shadow: none;
  }

  .input-btn.send-btn:active:not(:disabled) {
    transform: scale(0.96);
  }

  .input-btn.send-btn:disabled {
    background: var(--gx-hair-strong);
    color: #fff;
    opacity: 0.6;
    box-shadow: none;
  }

  /* Microphone Recording State */
  .input-btn.mic-btn.recording {
    background: linear-gradient(
      135deg,
      rgba(220, 38, 38, 0.15) 0%,
      rgba(185, 28, 28, 0.15) 100%
    );
    color: rgb(220, 38, 38);
    animation: pulse 1.5s ease-in-out infinite;
    box-shadow:
      0 0 0 0 rgba(220, 38, 38, 0.4),
      0 2px 8px rgba(220, 38, 38, 0.25),
      inset 0 1px 0 rgba(255, 255, 255, 0.15);
  }

  .input-btn.mic-btn.recording:hover {
    background: linear-gradient(
      135deg,
      rgba(220, 38, 38, 0.25) 0%,
      rgba(185, 28, 28, 0.25) 100%
    );
    color: rgb(185, 28, 28);
  }

  @keyframes pulse {
    0% {
      box-shadow:
        0 0 0 0 rgba(220, 38, 38, 0.4),
        0 2px 8px rgba(220, 38, 38, 0.25),
        inset 0 1px 0 rgba(255, 255, 255, 0.15);
    }
    50% {
      box-shadow:
        0 0 0 8px rgba(220, 38, 38, 0),
        0 2px 8px rgba(220, 38, 38, 0.35),
        inset 0 1px 0 rgba(255, 255, 255, 0.15);
    }
    100% {
      box-shadow:
        0 0 0 0 rgba(220, 38, 38, 0),
        0 2px 8px rgba(220, 38, 38, 0.25),
        inset 0 1px 0 rgba(255, 255, 255, 0.15);
    }
  }

  /* Recording placeholder style */
  .chat-input-textarea.recording::placeholder {
    color: rgb(220, 38, 38);
    opacity: 0.8;
  }

  /* ===== Selector Button (Dropdowns) ===== */
  /* Figma chip: 26px pill, hairline ring, 5/8/5/10 padding */
  .selector-btn {
    display: flex;
    align-items: center;
    height: 26px;
    gap: 5px;
    padding: 5px 8px 5px 10px;
    border: none;
    border-radius: 100px;
    background: transparent;
    color: var(--gx-slate-700);
    font-family: var(--gx-font-display);
    font-size: 12px;
    font-weight: 500;
    line-height: 16px;
    cursor: pointer;
    transition: background-color 120ms ease;
    white-space: nowrap;
    box-shadow: inset 0 0 0 1px var(--gx-hair-strong);
  }

  .selector-btn:hover:not(:disabled) {
    background: var(--gx-hover-soft);
    color: var(--gx-slate-700);
    transform: none;
    box-shadow: inset 0 0 0 1px var(--gx-hair-strong);
  }

  .selector-label {
    max-width: 8rem;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ===== Toggle Button (On/Off) ===== */
  .toggle-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    min-width: 28px;
    height: 26px;
    padding: 5px 10px;
    border: none;
    border-radius: 100px;
    background: transparent;
    color: var(--gx-slate-500);
    font-family: var(--gx-font-display);
    font-size: 12px;
    font-weight: 500;
    line-height: 16px;
    cursor: pointer;
    transition: background-color 120ms ease;
    white-space: nowrap;
    box-shadow: inset 0 0 0 1px var(--gx-hair-strong);
  }

  /* off state is the bare 28px circle from the design, not a pill */
  .toggle-btn:not(.active) {
    width: 28px;
    height: 28px;
    padding: 0;
    border-radius: 14px;
    box-shadow: none;
  }

  .toggle-btn svg {
    width: 15px;
    height: 15px;
    flex-shrink: 0;
  }

  .toggle-btn:hover:not(:disabled) {
    background: var(--gx-hover-soft);
    color: var(--gx-slate-500);
    transform: none;
  }

  .toggle-btn.active {
    background: var(--gx-teal-soft);
    color: var(--gx-teal);
    box-shadow: none;
  }

  .toggle-label {
    font-size: 12px;
    line-height: 16px;
  }

  .model-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 12px;
    height: 12px;
    flex-shrink: 0;
  }

  .model-icon :global(svg) {
    width: 12px;
    height: 12px;
  }

  .connectors-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 12px;
    height: 12px;
    flex-shrink: 0;
  }

  .connectors-icon :global(svg) {
    width: 12px;
    height: 12px;
  }

  .model-icon .provider-icon-img {
    width: 16px;
    height: 16px;
    object-fit: contain;
  }

  .dropdown-arrow {
    color: var(--text-secondary);
    transition: transform 0.2s ease;
    flex-shrink: 0;
  }

  .dropdown-arrow.open {
    transform: rotate(180deg);
  }

  /* ===== Plus Menu ===== */
  .plus-menu-container,
  .model-dropdown-container,
  .connectors-dropdown-container {
    position: relative;
    display: flex;
    align-items: center;
  }

  .plus-menu,
  .model-menu,
  .connectors-menu {
    position: absolute;
    bottom: calc(100% + var(--space-sm));
    left: 0;
    z-index: 100;
    min-width: 11rem;
    background: color-mix(
      in oklab,
      var(--bg-primary) 85%,
      var(--btn-secondary)
    );
    backdrop-filter: blur(calc(var(--glass-blur) * 1.5)) saturate(1.5);
    -webkit-backdrop-filter: blur(calc(var(--glass-blur) * 1.5)) saturate(1.5);
    border: 1px solid var(--glass-stroke-light);
    border-radius: var(--radius-lg);
    box-shadow:
      /* Outer glow for floating effect */
      0 0 0 1px var(--glass-edge-glow),
      /* Layered depth shadows */ 0 4px 12px rgba(0, 0, 0, 0.15),
      0 12px 28px rgba(0, 0, 0, 0.2),
      0 20px 48px rgba(0, 0, 0, 0.15),
      /* Inner highlight for glass edge */ var(--glass-highlight),
      inset 0 0 20px rgba(255, 255, 255, 0.02);
    padding: var(--space-sm);
    overflow: hidden;
  }

  .plus-menu::before,
  .model-menu::before,
  .connectors-menu::before {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background:
      /* Top highlight edge - liquid refraction */
      linear-gradient(180deg, rgba(255, 255, 255, 0.08) 0%, transparent 20%),
      /* Subtle brand tint */
        linear-gradient(
          135deg,
          var(--glass-tint-primary) 0%,
          transparent 40%,
          transparent 60%,
          rgba(var(--brand-rgb), 0.02) 100%
        );
    border-radius: inherit;
    pointer-events: none;
  }

  .plus-menu::after,
  .model-menu::after,
  .connectors-menu::after {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(255, 255, 255, 0.15) 20%,
      rgba(255, 255, 255, 0.2) 50%,
      rgba(255, 255, 255, 0.15) 80%,
      transparent 100%
    );
    border-radius: inherit;
    pointer-events: none;
  }

  /* ===== Model Menu ===== */
  .model-menu,
  .connectors-menu {
    min-width: 14rem;
    max-height: 20rem;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.15) transparent;
  }

  .model-menu::-webkit-scrollbar {
    width: 6px;
  }

  .model-menu::-webkit-scrollbar-track {
    background: transparent;
  }

  .model-menu::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.12);
    border-radius: 3px;
  }

  .model-menu::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  .dropdown-empty {
    padding: var(--space-lg);
    text-align: center;
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .provider-section {
    position: relative;
  }

  .provider-section:not(:last-child) {
    border-bottom: 1px solid var(--glass-stroke-dark);
    margin-bottom: var(--space-xs);
    padding-bottom: var(--space-xs);
  }

  .provider-header {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    background: var(--btn-secondary);
    border-radius: var(--radius-sm);
    margin-bottom: var(--space-xs);
  }

  .provider-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }

  .provider-icon :global(svg) {
    width: 12px;
    height: 12px;
    opacity: 0.7;
  }

  .provider-icon-img {
    width: 16px;
    height: 16px;
    object-fit: contain;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .provider-models {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .model-option {
    justify-content: space-between;
  }

  .connectors-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .connectors-row {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    padding: 0;
  }

  .connectors-trigger {
    display: inline-flex;
    align-items: center;
    height: 26px;
    gap: 5px;
    padding: 5px 8px 5px 10px;
    border: none;
    border-radius: 100px;
    background: transparent;
    color: var(--gx-slate-700);
    font-family: var(--gx-font-display);
    font-size: 12px;
    font-weight: 500;
    line-height: 16px;
    cursor: pointer;
    transition: background-color 120ms ease;
    box-shadow: inset 0 0 0 1px var(--gx-hair-strong);
  }

  .connectors-trigger:hover {
    background: var(--gx-hover-soft);
    color: var(--gx-slate-700);
    transform: none;
    box-shadow: inset 0 0 0 1px var(--gx-hair-strong);
  }

  .connectors-label {
    max-width: 10rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .connectors-menu {
    min-width: 16rem;
  }

  .connectors-list {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .connectors-row-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm);
    padding: 0.5rem 0.75rem;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--text-secondary);
    border: 1px solid transparent;
    transition: all 0.2s ease;
    text-align: left;
    width: 100%;
  }

  .connectors-row-item:hover {
    background: var(--glass-stroke-light);
    color: var(--text-primary);
  }

  .connectors-row-item.selected {
    background: rgba(var(--brand-rgb), 0.12);
    color: var(--text-primary);
  }

  .connectors-info {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    min-width: 0;
    flex: 1;
  }

  .connectors-switch {
    position: relative;
    width: 2rem;
    height: 1.25rem;
    background: rgba(88 88 88 / 0.3);
    border-radius: 0.75rem;
    cursor: pointer;
    transition: background 0.2s ease;
    flex-shrink: 0;
  }

  .connectors-switch:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .connectors-switch.active {
    background: var(--brand-teal);
  }

  .switch-thumb {
    position: absolute;
    top: 0.125rem;
    left: 0.125rem;
    width: 1rem;
    height: 1rem;
    background: white;
    border-radius: 50%;
    transition: transform 0.2s ease;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .connectors-switch.active .switch-thumb {
    transform: translateX(1.25rem);
  }

  .model-option .model-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .model-capabilities {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
  }

  .capability-icon {
    opacity: 0.6;
    flex-shrink: 0;
  }

  .capability-icon.active {
    opacity: 1;
  }

  /* Model-type icons in the dropdown rows */
  .capability-icon.type-image {
    color: #8b5cf6;
  }

  .capability-icon.type-text {
    color: var(--text-secondary);
    opacity: 0.75;
  }

  /* Image-model indicator on the selected-model trigger */
  .trigger-type-icon {
    flex-shrink: 0;
    color: #8b5cf6;
  }

  /* Sub-group heading inside a provider section ("Image generation") */
  .model-subgroup-label {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-xs) var(--space-md) var(--space-2xs);
    margin-top: var(--space-xs);
    font-size: 0.6875rem;
    font-weight: 600;
    color: #8b5cf6;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .model-subgroup-label svg {
    flex-shrink: 0;
    opacity: 0.85;
  }

  /* Image-mode hint above the composer */
  .image-mode-hint {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-xs) var(--space-md);
    border-radius: var(--radius-md);
    background: rgba(139, 92, 246, 0.08);
    border: 1px solid rgba(139, 92, 246, 0.2);
    color: var(--text-secondary);
    font-size: 0.8125rem;
    line-height: 1.4;
    animation: hintSlideIn 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .image-mode-hint svg {
    flex-shrink: 0;
    color: #8b5cf6;
  }

  @keyframes hintSlideIn {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .dropdown-loading,
  .dropdown-error {
    padding: var(--space-lg);
    text-align: center;
    color: var(--text-secondary);
    font-size: 0.875rem;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-sm);
  }

  .dropdown-error {
    color: var(--brand-red);
  }

  .loading-spinner {
    width: 1rem;
    height: 1rem;
    border: 2px solid var(--glass-stroke-dark);
    border-top-color: var(--brand);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  /* ===== File Attachments ===== */
  .file-attachments {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    width: 100%;
    padding: var(--space-xs) 0;
  }

  .file-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border-radius: 10px;
    background: var(--glass-bg-dark);
    backdrop-filter: blur(var(--glass-blur));
    -webkit-backdrop-filter: blur(var(--glass-blur));
    border: 1px solid var(--glass-stroke-dark);
    font-size: 0.8125rem;
    color: var(--text-primary);
    transition: all 0.2s ease;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
    max-width: 240px;
  }

  .file-pill:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .file-pill-image {
    padding: 4px;
  }

  .thumbnail-button {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: none;
    background: transparent;
    cursor: pointer;
    border-radius: 6px;
    transition: transform 0.15s ease;
    overflow: hidden;
  }

  .thumbnail-button:hover {
    transform: scale(1.05);
  }

  .file-thumbnail {
    width: 36px;
    height: 36px;
    object-fit: cover;
    border-radius: 6px;
  }

  .thumbnail-placeholder,
  .file-icon-button {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--btn-tertiary);
    border-radius: 6px;
    color: var(--text-secondary);
  }

  .file-name {
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 500;
    font-size: 0.8125rem;
  }

  .file-size {
    font-size: 0.6875rem;
    color: var(--text-secondary);
    flex-shrink: 0;
    opacity: 0.7;
  }

  .pill-remove-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.1);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.15s ease;
    flex-shrink: 0;
    opacity: 0.6;
  }

  .file-pill:hover .pill-remove-btn {
    opacity: 1;
  }

  .pill-remove-btn:hover {
    background: var(--brand-red, #ef4444);
    color: white;
    transform: scale(1.1);
    opacity: 1;
  }

  /* Upload status indicators */
  .pill-upload-status {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.6875rem;
    font-weight: 600;
    flex-shrink: 0;
    line-height: 1;
  }

  .pill-upload-status.uploading {
    color: var(--text-secondary);
  }

  .pill-upload-status.success {
    color: var(--brand-green, #22c55e);
    font-size: 0.75rem;
  }

  .pill-upload-status.failed {
    color: var(--brand-red, #ef4444);
  }

  .pill-status-text {
    white-space: nowrap;
  }

  .pill-spinner {
    width: 12px;
    height: 12px;
    border: 1.5px solid rgba(var(--brand-rgb), 0.15);
    border-top-color: var(--brand);
    border-radius: 50%;
    animation: pill-spin 0.7s linear infinite;
  }

  @keyframes pill-spin {
    to {
      transform: rotate(360deg);
    }
  }

  .file-pill-uploading {
    opacity: 0.75;
    border-style: dashed;
  }

  .file-pill-failed {
    border-color: rgba(239, 68, 68, 0.4);
    background: rgba(239, 68, 68, 0.05);
  }

  /* ===== Preview Modal ===== */
  .preview-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .preview-modal {
    background: var(--bg-primary);
    border: 1px solid var(--glass-stroke-dark);
    border-radius: var(--radius-lg);
    box-shadow: var(--glass-shadow-emphasis);
    width: 90vw;
    max-width: 800px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .image-preview-modal {
    max-width: 900px;
    max-height: 90vh;
  }

  .preview-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-md) var(--space-xl);
    border-bottom: 1px solid var(--glass-stroke-dark);
    background: var(--btn-secondary);
  }

  .preview-info {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    flex: 1;
    color: var(--text-secondary);
    min-width: 0;
  }

  .preview-name {
    font-weight: 600;
    color: var(--text-primary);
    font-size: 0.875rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .preview-size {
    font-size: 0.75rem;
    color: var(--text-secondary);
    flex-shrink: 0;
  }

  .preview-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition: all 0.15s ease;
  }

  .preview-close:hover {
    background: var(--btn-tertiary);
    color: var(--text-primary);
  }

  .preview-content {
    flex: 1;
    padding: var(--space-lg);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .preview-textarea {
    flex: 1;
    width: 100%;
    min-height: 300px;
    padding: var(--space-lg);
    border: 1px solid var(--glass-stroke-dark);
    border-radius: var(--radius-sm);
    background: var(--btn-secondary);
    font-family: "SF Mono", Monaco, Menlo, monospace;
    font-size: 0.8125rem;
    line-height: 1.6;
    resize: none;
    outline: none;
    color: var(--text-primary);
    overflow-y: auto;
  }

  .image-content {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--btn-secondary);
  }

  .preview-image {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    border-radius: var(--radius-sm);
  }

  /* ===== Animations ===== */
  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .spinner {
    animation: spin 1s linear infinite;
  }

  /* ===== Responsive ===== */
  @media (max-width: 768px) {
    .input-area-wrapper {
      max-width: 100%;
    }

    .input-container-main {
      border-radius: var(--radius-md);
      min-height: 2.25rem;
    }

    .chat-input-textarea {
      font-size: 1rem; /* Prevent iOS zoom */
      padding: var(--space-xs) var(--space-sm);
      padding-bottom: calc(1.75rem + var(--space-xs));
    }

    .input-bottom-bar {
      padding: var(--space-2xs) var(--space-xs);
      gap: var(--space-xs);
      min-height: 1.75rem;
    }

    .selector-label,
    .toggle-label,
    .connectors-label {
      display: none;
    }

    .selector-btn {
      padding: var(--space-xs);
      border-radius: 50%;
      gap: 0;
    }

    .connectors-trigger {
      width: 1.625rem;
      min-width: 1.625rem;
      height: 1.625rem;
      padding: 0;
      border-radius: 50%;
      justify-content: center;
      gap: 0;
    }

    .toggle-btn {
      width: 1.625rem;
      min-width: 1.625rem;
      height: 1.625rem;
      padding: 0;
    }

    .toggle-btn svg {
      width: 12px;
      height: 12px;
    }

    .dropdown-arrow {
      display: none;
    }

    .input-btn {
      width: 1.625rem;
      height: 1.625rem;
    }

    .input-btn svg {
      width: 12px;
      height: 12px;
    }
  }

  @media (max-width: 480px) {
    .input-btn {
      width: 1.5rem;
      height: 1.5rem;
    }

    .input-btn svg {
      width: 11px;
      height: 11px;
    }

    .toggle-btn {
      width: 1.5rem;
      min-width: 1.5rem;
      height: 1.5rem;
    }

    .connectors-trigger {
      width: 1.5rem;
      min-width: 1.5rem;
      height: 1.5rem;
    }

    .toggle-btn svg {
      width: 11px;
      height: 11px;
    }

    .file-pill {
      font-size: 0.8125rem;
    }

    .file-name {
      max-width: 100px;
    }

    .file-thumbnail,
    .thumbnail-placeholder,
    .file-icon-button {
      width: 28px;
      height: 28px;
    }
  }
</style>
