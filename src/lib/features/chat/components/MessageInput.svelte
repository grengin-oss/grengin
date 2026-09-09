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
  import {
    findModel,
    isImageModel,
    isSelectableChatModel,
  } from "../../../api/models";
  import { uploadDocument, type UploadedFile } from "../../../api/chatApi";
  import type { MCPServer } from "../../../admin/types.js";
  import { _ } from "svelte-i18n";
  import { navigate } from "svelte-routing";
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
    /** Connectors from GET /mcp-servers. `connected` is the per-user OAuth state. */
    mcpServers?: (MCPServer & { connected?: boolean })[];
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
  // Video posters are object URLs (a data URL would inline the whole file), so
  // every one added here must be revoked when the file goes away.
  let videoPosters = $state<Record<string, string>>({});
  let videoDurations = $state<Record<string, string>>({});
  let showFilePreview = $state(false);
  let showImagePreview = $state(false);
  let currentPreviewFile = $state<File | null>(null);
  let currentPreviewImage = $state<{ file: File; url: string } | null>(null);

  // ===== Composer menus (design: chat-empty-state.html, .dropdown-anchor) =====
  // One menu at a time, exactly like the design: opening a chip closes the rest.
  type ComposerMenu = "attach" | "model" | "tools" | "image";
  let openMenu = $state<ComposerMenu | null>(null);

  let composerRoot = $state<HTMLDivElement | null>(null);

  /**
   * The panels open upward (`bottom: 100% + 8px`), so their height has to be
   * capped by the space ABOVE the trigger. Capping by viewport height instead
   * clipped them off the top whenever the composer sat high in the window — in
   * the empty state it is vertically centred, so a 700px window left only ~390px
   * above the chip while the panel still asked for 440px, putting the search
   * field out of reach.
   */
  const PANEL_GUTTER = 16;
  const PANEL_MIN_H = 180;

  function syncPanelMaxHeight() {
    const anchor = composerRoot?.querySelector<HTMLElement>(
      ".dropdown-anchor.is-open",
    );
    if (!anchor) return;
    const available = anchor.getBoundingClientRect().top - PANEL_GUTTER;
    anchor.style.setProperty(
      "--dropdown-max-h",
      `${Math.max(PANEL_MIN_H, Math.floor(available))}px`,
    );
  }

  $effect(() => {
    if (!openMenu) return;
    tick().then(syncPanelMaxHeight);
  });

  function toggleMenu(menu: ComposerMenu) {
    openMenu = openMenu === menu ? null : menu;
  }

  function closeMenus() {
    openMenu = null;
  }

  // ===== Registry-derived model groupings =====
  // The registry exposes no "latest" flag, so newest-first registry order is the
  // convention (same rule as modelPreferences.ts): a provider's first text model
  // is the one tagged LATEST, and everything past VISIBLE_MODELS_PER_BRAND is
  // what the design folds away behind the "legacy models" link.
  const VISIBLE_MODELS_PER_BRAND = 2;

  interface BrandGroup {
    provider: ProviderInfo;
    models: ModelInfo[];
  }

  interface ModelEntry {
    provider: ProviderInfo;
    model: ModelInfo;
  }

  /**
   * Group the registry into one row per BRAND, keyed by provider key rather
   * than by array position. The registry can return the same provider key more
   * than once (an org with two engines configured against one brand), and the
   * picker must still draw a single "Anthropic" row — a keyed `{#each}` over
   * raw positions throws `each_key_duplicate` on the repeat. Models are deduped
   * by key for the same reason, and the first occurrence wins so registry order
   * (newest first) still decides which model carries the LATEST tag.
   */
  function groupByBrand(
    list: ProviderInfo[],
    pick: (models: ModelInfo[]) => ModelInfo[],
  ): BrandGroup[] {
    const groups = new Map<string, BrandGroup>();
    for (const provider of list) {
      const picked = pick(provider.models ?? []);
      if (picked.length === 0) continue;

      let group = groups.get(provider.key);
      if (!group) {
        group = { provider, models: [] };
        groups.set(provider.key, group);
      }
      const seen = new Set(group.models.map((m) => m.key));
      for (const model of picked) {
        if (seen.has(model.key)) continue;
        seen.add(model.key);
        group.models.push(model);
      }
    }
    return [...groups.values()];
  }

  /** Brands offering at least one selectable text model, in registry order. */
  const textBrands = $derived<BrandGroup[]>(
    groupByBrand(providers, (models) => splitModels(models).text),
  );

  /** Every image-generation model across brands — the Image picker's list. */
  const imageEntries = $derived<ModelEntry[]>(
    groupByBrand(providers, (models) => splitModels(models).image).flatMap(
      (brand) =>
        brand.models.map((model) => ({ provider: brand.provider, model })),
    ),
  );

  /** RECOMMENDED = the model in use, then each brand's newest. Capped at 3. */
  const recommendedModels = $derived.by<ModelEntry[]>(() => {
    const out: ModelEntry[] = [];
    const seen = new Set<string>();
    const push = (provider: ProviderInfo, model: ModelInfo) => {
      if (seen.has(model.key)) return;
      seen.add(model.key);
      out.push({ provider, model });
    };
    const current = findModel(providers, selectedModel);
    if (current && !isImageModel(current.model)) {
      push(current.provider, current.model);
    }
    for (const brand of textBrands) push(brand.provider, brand.models[0]);
    return out.slice(0, 3);
  });

  let modelQuery = $state("");
  const modelQueryTerm = $derived(modelQuery.trim().toLowerCase());

  /** Flat search across model name, key and provider name. */
  const modelSearchResults = $derived.by<ModelEntry[]>(() => {
    const term = modelQueryTerm;
    if (!term) return [];
    const out: ModelEntry[] = [];
    for (const brand of textBrands) {
      for (const model of brand.models) {
        if (
          model.name.toLowerCase().includes(term) ||
          model.key.toLowerCase().includes(term) ||
          brand.provider.name.toLowerCase().includes(term)
        ) {
          out.push({ provider: brand.provider, model });
        }
      }
    }
    return out;
  });

  function isModelSelected(model: ModelInfo): boolean {
    return selectedModel === model.key || selectedModel === model.name;
  }

  // ---- brand folds ----
  let expandedBrands = $state<Set<string>>(new Set());
  let brandsInitialised = $state(false);

  // Open the brand that owns the current model the first time the registry lands.
  $effect(() => {
    if (brandsInitialised || textBrands.length === 0) return;
    const current = findModel(providers, selectedModel);
    const key =
      current && !isImageModel(current.model)
        ? current.provider.key
        : textBrands[0].provider.key;
    expandedBrands = new Set([key]);
    brandsInitialised = true;
  });

  function toggleBrand(key: string) {
    const next = new Set(expandedBrands);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    expandedBrands = next;
  }

  let expandedLegacy = $state<Set<string>>(new Set());

  function revealLegacy(key: string) {
    expandedLegacy = new Set([...expandedLegacy, key]);
  }

  function visibleBrandModels(brand: BrandGroup): ModelInfo[] {
    return expandedLegacy.has(brand.provider.key)
      ? brand.models
      : brand.models.slice(0, VISIBLE_MODELS_PER_BRAND);
  }

  function hiddenBrandCount(brand: BrandGroup): number {
    return expandedLegacy.has(brand.provider.key)
      ? 0
      : Math.max(0, brand.models.length - VISIBLE_MODELS_PER_BRAND);
  }

  // ---- image mode ----
  // The banner/lock state is driven by the model that is actually selected
  // (`imageModelSelected` from the parent), never by a separate mode flag — so
  // the composer can never claim a mode the request will not use.
  let lastTextSelection = $state<{ provider: string; model: string } | null>(
    null,
  );

  $effect(() => {
    if (!imageModelSelected && selectedModel) {
      lastTextSelection = {
        provider: selectedProvider ?? "",
        model: selectedModel,
      };
    }
  });

  /** Leave image mode by restoring the previous text model. */
  function exitImageMode() {
    const previous = lastTextSelection;
    if (previous) {
      const found = findModel(providers, previous.model);
      if (found && !isImageModel(found.model)) {
        onModelSelect?.(found.provider, found.model);
        closeMenus();
        return;
      }
    }
    const firstBrand = textBrands[0];
    if (firstBrand) onModelSelect?.(firstBrand.provider, firstBrand.models[0]);
    else onRemoveModel?.();
    closeMenus();
  }

  // ---- connectors ----
  /** Per-user connection state from GET /mcp-servers (falls back to status). */
  function isConnectorConnected(
    server: MCPServer & { connected?: boolean },
  ): boolean {
    if (typeof server.connected === "boolean") return server.connected;
    return server.status === "connected";
  }

  /** Skills currently on — reported upward by SkillPicker for the Tools badge. */
  let activeSkillCount = $state(0);
  const toolsBadgeCount = $derived(
    selectedMcpServers.length + activeSkillCount,
  );

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
      } else if (isVideoFile(file)) {
        videoPosters = {
          ...videoPosters,
          [file.name]: URL.createObjectURL(file),
        };
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
      Object.keys(videoPosters).forEach(releaseVideoPoster);
      videoPosters = {};
      videoDurations = {};
      attachedFiles = [];
      uploadedFileResults = new Map();
      failedUploads = new Set();
      fileError = null;

      if (textarea) {
        textarea.style.height = "auto";
      }
    }
  }

  function selectModel(provider: ProviderInfo, model: ModelInfo) {
    onModelSelect?.(provider, model);
    modelQuery = "";
    closeMenus();
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
    closeMenus();
  }

  function handleFileChange(event: Event) {
    const target = event.target as HTMLInputElement;
    if (target.files) {
      addFiles(Array.from(target.files));
    }
    closeMenus();
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
    if (file) releaseVideoPoster(file.name);
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

  function isVideoFile(file: File): boolean {
    return file.type.startsWith("video/");
  }

  function formatDuration(seconds: number): string {
    if (!Number.isFinite(seconds)) return "";
    const total = Math.round(seconds);
    return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, "0")}`;
  }

  // ".att-video__time" shows a real duration, read off the loaded metadata —
  // never a guess.
  function handleVideoMetadata(name: string, event: Event) {
    const label = formatDuration(
      (event.currentTarget as HTMLVideoElement).duration,
    );
    if (!label) return;
    videoDurations = { ...videoDurations, [name]: label };
  }

  function releaseVideoPoster(name: string) {
    const url = videoPosters[name];
    if (!url) return;
    URL.revokeObjectURL(url);
    delete videoPosters[name];
    delete videoDurations[name];
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

  // Close whichever menu is open when the click lands outside every anchor.
  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest(".dropdown-anchor")) closeMenus();
  }

  function handleMenuKeydown(event: KeyboardEvent) {
    if (event.key === "Escape" && openMenu) {
      event.stopPropagation();
      closeMenus();
    }
  }

  onMount(() => {
    document.addEventListener("click", handleClickOutside);
    document.addEventListener("keydown", handleMenuKeydown);
    window.addEventListener("resize", syncPanelMaxHeight);
    return () => {
      document.removeEventListener("click", handleClickOutside);
      document.removeEventListener("keydown", handleMenuKeydown);
      window.removeEventListener("resize", syncPanelMaxHeight);
      Object.keys(videoPosters).forEach(releaseVideoPoster);
    };
  });
</script>

{#snippet chevron(open: boolean)}
  <svg
    class="cx-chev"
    class:cx-chev--open={open}
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    aria-hidden="true"
  >
    <polyline points="6 9 12 15 18 9"></polyline>
  </svg>
{/snippet}

{#snippet checkMark(cls: string)}
  <svg
    class={cls}
    xmlns="http://www.w3.org/2000/svg"
    width="14"
    height="14"
    viewBox="0 0 14 14"
    fill="none"
  >
    <g clip-path="url(#clip0_855_1889)">
      <path
        d="M12.7167 5.83345C12.9831 7.14087 12.7932 8.50011 12.1788 9.6845C11.5643 10.8689 10.5624 11.8068 9.34008 12.3419C8.11778 12.877 6.74898 12.9768 5.46196 12.6248C4.17493 12.2728 3.04748 11.4903 2.26761 10.4076C1.48774 9.32496 1.1026 8.00767 1.17642 6.67542C1.25023 5.34318 1.77854 4.0765 2.67324 3.08663C3.56794 2.09676 4.77495 1.44353 6.09299 1.23588C7.41102 1.02823 8.7604 1.2787 9.91611 1.94553M5.24967 6.4165L6.99967 8.1665L12.833 2.33317"
        stroke="#4A7DD4"
        stroke-width="2"
        stroke-linecap="round"
      />
    </g>
    <defs>
      <clipPath id="clip0_855_1889">
        <rect width="14" height="14" fill="white" />
      </clipPath>
    </defs>
  </svg>
{/snippet}

{#snippet brandBadge(provider: ProviderInfo)}
  {@const providerIcon = getIconForTheme(provider)}
  {@const iconSvg = providerIconSvg(providerIcon)}
  {@const iconUrl = providerIconUrl(providerIcon)}
  {#if iconSvg}
    <span class="brand-badge brand-badge--icon" aria-hidden="true"
      >{@html iconSvg}</span
    >
  {:else if iconUrl}
    <img src={iconUrl} alt="" class="brand-badge brand-badge--icon" />
  {:else}
    <span class="brand-badge" aria-hidden="true"
      >{provider.name.charAt(0).toUpperCase()}</span
    >
  {/if}
{/snippet}

<!--
  A flat model row: the RECOMMENDED group and the search results. Both mix
  providers in one list, so each row carries its provider's badge — the same
  ".brand-badge" the brand headers use. Nested child rows deliberately omit it:
  they already sit under their brand's header.
-->
{#snippet modelRow(provider: ProviderInfo, model: ModelInfo)}
  {@const selected = isModelSelected(model)}
  <button
    class="model-row"
    class:model-row--selected={selected}
    type="button"
    onclick={() => selectModel(provider, model)}
    title={model.comment || `${provider.name} · ${model.name}`}
  >
    {@render brandBadge(provider)}
    <span class="model-row__name">{model.name}</span>
    {#if selected}
      {@render checkMark("model-row__check")}
    {/if}
  </button>
{/snippet}

<!-- A model nested under its brand row. `latest` = first in registry order. -->
{#snippet modelChildRow(
  provider: ProviderInfo,
  model: ModelInfo,
  latest: boolean,
)}
  {@const selected = isModelSelected(model)}
  <button
    class="model-row model-row--child"
    class:model-row--selected={selected}
    type="button"
    onclick={() => selectModel(provider, model)}
    title={model.comment || model.name}
  >
    <span class="model-row__name">{model.name}</span>
    {#if latest}
      <span class="model-tag">{$_("chat.messageInput.latestTag")}</span>
    {/if}
    {#if selected}
      {@render checkMark("model-row__check")}
    {/if}
  </button>
{/snippet}

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
  bind:this={composerRoot}
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

  <!-- Composer stack: in image mode a banner sits flush on top of the card and
       the two share one rounded outline (design: .composer-wrap /
       .image-mode-banner). Banner visibility is derived from the model that is
       really selected, so the composer can never advertise a mode the request
       will not use. -->
  <div class="composer-wrap">
    {#if imageModelSelected}
      <div class="image-mode-banner">
        <span class="image-mode-banner__left">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              d="M12 2l1.9 5.6L19.5 9.5 13.9 11.4 12 17l-1.9-5.6L4.5 9.5l5.6-1.9L12 2z"
            ></path>
          </svg>
          {$_("chat.messageInput.imageModeBanner")}
        </span>
        <button
          class="image-mode-banner__close"
          type="button"
          onclick={exitImageMode}
          aria-label={$_("chat.messageInput.exitImageMode")}
          title={$_("chat.messageInput.exitImageMode")}
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

    <!-- Main Input Container -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="input-container-main"
      class:input-container-main--image-mode={imageModelSelected}
      onclick={(e) => {
        if (
          e.target === e.currentTarget ||
          ((e.target as HTMLElement).closest(".input-container-main") &&
            !(e.target as HTMLElement).closest("button") &&
            !(e.target as HTMLElement).closest(".dropdown-panel"))
        )
          textarea?.focus();
      }}
    >
      <!--
        Pending attachments live INSIDE the composer card, above the textarea,
        so the preview sits within the card's rounded outline (design: the
        ".composer" column) instead of floating above it. The card's own 32px
        column gap is meant for card-to-toolbar, so the attachments and the
        textarea share a tighter sub-stack.
      -->
      <div class="composer__stack">
        <!--
        Pending attachments, drawn with the same cards the transcript uses
        (chat-empty-state.html ".attachment-grid": a 130x100 tile for an image,
        a 220x60 card for anything else) so the preview before sending matches
        the turn after it. The composer adds what a transcript has no need for:
        a remove control and per-file upload status.
      -->
        {#if attachedFiles.length > 0}
          <div class="pending-attachments">
            {#each attachedFiles as file, index}
              {@const isUploadingFile = uploadingFiles.has(file.name)}
              {@const hasFailed = failedUploads.has(file.name)}
              {@const hasUploaded = uploadedFileResults.has(file.name)}
              {#if isImageFile(file)}
                <div
                  class="pending-attachment pending-attachment--image"
                  class:pending-attachment--uploading={isUploadingFile}
                  class:pending-attachment--failed={hasFailed}
                >
                  <button
                    class="pending-attachment__thumb"
                    onclick={() => openImagePreview(file)}
                    aria-label={$_("chat.messageInput.previewImage", {
                      values: { name: file.name },
                    })}
                    title={file.name}
                  >
                    {#if imageThumbnails[file.name]}
                      <img
                        src={imageThumbnails[file.name]}
                        alt={file.name}
                        class="pending-attachment__image"
                      />
                    {:else}
                      <span class="pending-attachment__placeholder">
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="1.5"
                          aria-hidden="true"
                        >
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"
                          ></rect>
                          <circle cx="8.5" cy="8.5" r="1.5"></circle>
                          <polyline points="21 15 16 10 5 21"></polyline>
                        </svg>
                      </span>
                    {/if}
                  </button>

                  {#if isUploadingFile}
                    <span class="pending-attachment__badge">
                      <span class="pending-attachment__spinner"></span>
                    </span>
                  {:else if hasFailed}
                    <span
                      class="pending-attachment__badge pending-attachment__badge--failed"
                      title={$_("chat.messageInput.uploadFailed")}>✕</span
                    >
                  {:else if hasUploaded}
                    <span
                      class="pending-attachment__badge pending-attachment__badge--done"
                      >✓</span
                    >
                  {/if}

                  <button
                    class="pending-attachment__remove"
                    onclick={() => removeFile(index)}
                    aria-label={$_("chat.messageInput.removeFile")}
                    title={$_("chat.messageInput.removeFile")}
                  >
                    <svg
                      width="10"
                      height="10"
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
              {:else if isVideoFile(file)}
                <div
                  class="pending-attachment pending-attachment--video"
                  class:pending-attachment--uploading={isUploadingFile}
                  class:pending-attachment--failed={hasFailed}
                >
                  {#if videoPosters[file.name]}
                    <!-- Poster frame only: muted, metadata-only, never played
                       inline. Loading the metadata is also what gives us the
                       real duration below. -->
                    <!-- svelte-ignore a11y_media_has_caption -->
                    <video
                      class="pending-attachment__poster"
                      src={videoPosters[file.name]}
                      preload="metadata"
                      muted
                      onloadedmetadata={(event) =>
                        handleVideoMetadata(file.name, event)}
                    ></video>
                  {/if}

                  <span class="pending-attachment__play" aria-hidden="true">
                    <svg
                      width="10"
                      height="12"
                      viewBox="0 0 10 12"
                      fill="currentColor"
                    >
                      <path d="M0 0l10 6-10 6z" />
                    </svg>
                  </span>

                  {#if videoDurations[file.name]}
                    <span class="pending-attachment__duration"
                      >{videoDurations[file.name]}</span
                    >
                  {/if}

                  {#if isUploadingFile}
                    <span class="pending-attachment__badge">
                      <span class="pending-attachment__spinner"></span>
                    </span>
                  {:else if hasFailed}
                    <span
                      class="pending-attachment__badge pending-attachment__badge--failed"
                      title={$_("chat.messageInput.uploadFailed")}>✕</span
                    >
                  {:else if hasUploaded}
                    <span
                      class="pending-attachment__badge pending-attachment__badge--done"
                      >✓</span
                    >
                  {/if}

                  <button
                    class="pending-attachment__remove"
                    onclick={() => removeFile(index)}
                    aria-label={$_("chat.messageInput.removeFile")}
                    title={file.name}
                  >
                    <svg
                      width="10"
                      height="10"
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
              {:else}
                <div
                  class="pending-attachment pending-attachment--file"
                  class:pending-attachment--uploading={isUploadingFile}
                  class:pending-attachment--failed={hasFailed}
                >
                  <button
                    class="pending-attachment__open"
                    onclick={() =>
                      isTextFile(file) ? openFilePreview(file) : null}
                    aria-label={isTextFile(file)
                      ? $_("chat.messageInput.previewFile", {
                          values: { name: file.name },
                        })
                      : $_("chat.messageInput.fileLabel", {
                          values: { name: file.name },
                        })}
                  >
                    <span class="pending-attachment__icon" aria-hidden="true">
                      <svg
                        width="14"
                        height="17"
                        viewBox="0 0 14 17"
                        fill="none"
                      >
                        <path
                          d="M2 1h7l4 4v10a1 1 0 01-1 1H2a1 1 0 01-1-1V2a1 1 0 011-1z"
                          stroke="currentColor"
                          stroke-width="1.3"
                          stroke-linejoin="round"
                        />
                      </svg>
                    </span>
                    <span class="pending-attachment__text">
                      <span class="pending-attachment__name" title={file.name}
                        >{file.name}</span
                      >
                      <span class="pending-attachment__size">
                        {#if isUploadingFile}
                          {$_("chat.messageInput.uploading")}
                        {:else if hasFailed}
                          {$_("chat.messageInput.uploadFailed")}
                        {:else}
                          {formatFileSize(file.size)}
                        {/if}
                      </span>
                    </span>
                  </button>

                  {#if isUploadingFile}
                    <span class="pending-attachment__spinner"></span>
                  {:else if hasUploaded}
                    <span class="pending-attachment__check" aria-hidden="true"
                      >✓</span
                    >
                  {/if}

                  <button
                    class="pending-attachment__remove pending-attachment__remove--inline"
                    onclick={() => removeFile(index)}
                    aria-label={$_("chat.messageInput.removeFile")}
                    title={$_("chat.messageInput.removeFile")}
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
            {/each}
          </div>
        {/if}

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
      </div>

      <!-- Floating Bottom Bar -->
      <div class="input-bottom-bar">
        <!-- Left: attach, model, tools, image generation, web search -->
        <div class="bottom-bar-left">
          <!-- ===== Attach ===== -->
          <div class="dropdown-anchor" class:is-open={openMenu === "attach"}>
            <button
              class="attach-btn"
              type="button"
              onclick={(e) => {
                e.stopPropagation();
                toggleMenu("attach");
              }}
              aria-label={$_("chat.messageInput.addContent")}
              title={$_("chat.messageInput.addContent")}
              aria-expanded={openMenu === "attach"}
              {disabled}
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
                aria-hidden="true"
              >
                <path
                  d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"
                ></path>
              </svg>
            </button>

            {#if openMenu === "attach"}
              <div class="dropdown-panel attach-menu">
                <button
                  class="menu-row"
                  type="button"
                  onclick={handleFileSelect}
                >
                  <span class="menu-row__icon">
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.8"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path
                        d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"
                      ></path>
                    </svg>
                  </span>
                  <span class="menu-row__text">
                    <span class="menu-row__title"
                      >{$_("chat.messageInput.addPhotosAndFiles")}</span
                    >
                    <span class="menu-row__sub"
                      >{$_("chat.messageInput.attachHint")}</span
                    >
                  </span>
                </button>
              </div>
            {/if}
          </div>

          <!-- ===== Model ===== -->
          <div class="dropdown-anchor" class:is-open={openMenu === "model"}>
            <button
              class="chip"
              type="button"
              onclick={(e) => {
                e.stopPropagation();
                toggleMenu("model");
              }}
              title={$_("chat.messageInput.selectModel")}
              aria-label={$_("chat.messageInput.selectModel")}
              aria-expanded={openMenu === "model"}
            >
              <span class="chip__icon">
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
                      aria-hidden="true"
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
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 16v-4" />
                    <path d="M12 8h.01" />
                  </svg>
                {/if}
              </span>
              <span class="chip__label"
                >{selectedModel ||
                  $_("chat.messageInput.selectModelFallback")}</span
              >
              {@render chevron(openMenu === "model")}
            </button>

            {#if openMenu === "model"}
              <div class="dropdown-panel model-picker">
                <div class="model-search">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    aria-hidden="true"
                  >
                    <circle cx="11" cy="11" r="7" />
                    <path d="M21 21l-4.3-4.3" />
                  </svg>
                  <input
                    class="model-search__input"
                    type="text"
                    bind:value={modelQuery}
                    placeholder={$_("chat.messageInput.searchModels")}
                    aria-label={$_("chat.messageInput.searchModels")}
                    autocomplete="off"
                    onclick={(e) => e.stopPropagation()}
                  />
                </div>

                {#if loadingModels}
                  <div class="dropdown-loading">
                    <div class="loading-spinner"></div>
                    <span>{$_("chat.messageInput.loadingModels")}</span>
                  </div>
                {:else if modelsError}
                  <div class="dropdown-error">{modelsError}</div>
                {:else if textBrands.length === 0}
                  <div class="dropdown-empty">
                    {$_("chat.messageInput.noModels")}
                  </div>
                {:else if modelQueryTerm}
                  <div class="model-group">
                    <span class="model-group__label"
                      >{$_("chat.messageInput.resultsGroup")}</span
                    >
                    {#if modelSearchResults.length === 0}
                      <span class="cx-state"
                        >{$_("chat.messageInput.noModelMatches")}</span
                      >
                    {:else}
                      {#each modelSearchResults as entry (entry.provider.key + "/" + entry.model.key)}
                        {@render modelRow(entry.provider, entry.model)}
                      {/each}
                    {/if}
                  </div>
                {:else}
                  {#if recommendedModels.length > 0}
                    <div class="model-group">
                      <span class="model-group__label"
                        >{$_("chat.messageInput.recommendedGroup")}</span
                      >
                      {#each recommendedModels as entry (entry.provider.key + "/" + entry.model.key)}
                        {@render modelRow(entry.provider, entry.model)}
                      {/each}
                    </div>
                  {/if}

                  <div class="model-group">
                    {#each textBrands as brand (brand.provider.key)}
                      {@const brandOpen = expandedBrands.has(
                        brand.provider.key,
                      )}
                      <button
                        class="model-brand-row"
                        type="button"
                        onclick={(e) => {
                          e.stopPropagation();
                          toggleBrand(brand.provider.key);
                        }}
                        aria-expanded={brandOpen}
                      >
                        <svg
                          class="chev-toggle"
                          class:chev-toggle--collapsed={!brandOpen}
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                          aria-hidden="true"
                        >
                          <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                        {@render brandBadge(brand.provider)}
                        <span class="model-brand-row__name"
                          >{brand.provider.name}</span
                        >
                        <span class="model-brand-row__count"
                          >{$_("chat.messageInput.modelCount", {
                            values: { count: brand.models.length },
                          })}</span
                        >
                      </button>

                      {#if brandOpen}
                        <div class="model-brand-children">
                          {#each visibleBrandModels(brand) as model, index (model.key)}
                            {@render modelChildRow(
                              brand.provider,
                              model,
                              index === 0,
                            )}
                          {/each}
                          {#if hiddenBrandCount(brand) > 0}
                            <button
                              class="model-legacy-link"
                              type="button"
                              onclick={(e) => {
                                e.stopPropagation();
                                revealLegacy(brand.provider.key);
                              }}
                            >
                              {$_("chat.messageInput.showLegacyModels", {
                                values: { count: hiddenBrandCount(brand) },
                              })}
                            </button>
                          {/if}
                        </div>
                      {/if}
                    {/each}
                  </div>
                {/if}
              </div>
            {/if}
          </div>

          <!-- ===== Tools: skills + connectors ===== -->
          <div class="dropdown-anchor" class:is-open={openMenu === "tools"}>
            <button
              class="chip"
              type="button"
              onclick={(e) => {
                e.stopPropagation();
                toggleMenu("tools");
              }}
              title={$_("chat.messageInput.selectConnectors")}
              aria-label={$_("chat.messageInput.selectConnectors")}
              aria-expanded={openMenu === "tools"}
            >
              <span class="chip__icon">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M4.07475 1.72803C3.62687 2.03832 3.26098 2.45266 3.00847 2.93547C2.75595 3.41829 2.62437 3.95517 2.625 4.50003C2.625 5.69853 3.249 6.75153 4.1925 7.35153C4.581 7.59753 4.88925 8.04378 4.869 8.58153V8.58753L4.746 11.0903C4.74365 11.1649 4.72646 11.2384 4.69543 11.3063C4.6644 11.3742 4.62015 11.4353 4.56527 11.4859C4.51038 11.5366 4.44596 11.5758 4.37577 11.6013C4.30557 11.6268 4.23099 11.638 4.1564 11.6344C4.0818 11.6308 4.00868 11.6123 3.94129 11.5801C3.8739 11.5479 3.8136 11.5026 3.7639 11.4469C3.71421 11.3911 3.67611 11.3261 3.65183 11.2554C3.62755 11.1848 3.61758 11.1101 3.6225 11.0355L3.74475 8.53803C3.74625 8.47428 3.70725 8.37603 3.5895 8.30103C2.94917 7.89483 2.42187 7.33341 2.05657 6.66889C1.69127 6.00438 1.49982 5.25833 1.5 4.50003C1.5001 3.7754 1.67519 3.06151 2.01038 2.41907C2.34558 1.77663 2.83096 1.22464 3.42525 0.81003C3.60694 0.679001 3.82403 0.606013 4.04798 0.600659C4.27192 0.595305 4.49225 0.657834 4.68 0.78003C5.0265 1.00203 5.25 1.40028 5.25 1.84728V3.96228C5.25 4.02378 5.28075 4.08228 5.3325 4.11678L5.895 4.49928C5.92601 4.52024 5.96257 4.53144 6 4.53144C6.03743 4.53144 6.07399 4.52024 6.105 4.49928L6.6675 4.11678C6.69289 4.09962 6.71369 4.07649 6.72807 4.04942C6.74246 4.02236 6.74998 3.99218 6.75 3.96153V1.84728C6.75 1.40028 6.9735 1.00203 7.32 0.78003C7.50775 0.657834 7.72808 0.595305 7.95202 0.600659C8.17597 0.606013 8.39306 0.679001 8.57475 0.81003C9.16904 1.22464 9.65442 1.77663 9.98962 2.41907C10.3248 3.06151 10.4999 3.7754 10.5 4.50003C10.5002 5.25833 10.3087 6.00438 9.94343 6.66889C9.57813 7.33341 9.05083 7.89483 8.4105 8.30103C8.29275 8.37603 8.25375 8.47353 8.25525 8.53728L8.3775 11.0348C8.38345 11.1341 8.36302 11.2332 8.31828 11.3221C8.27354 11.411 8.20608 11.4864 8.12276 11.5408C8.03944 11.5952 7.94321 11.6266 7.84385 11.6317C7.74449 11.6369 7.64552 11.6157 7.557 11.5703C7.46847 11.5243 7.39376 11.4556 7.34051 11.3713C7.28727 11.287 7.25741 11.19 7.254 11.0903L7.131 8.58153C7.11075 8.04378 7.419 7.59753 7.8075 7.35153C8.28793 7.04686 8.68354 6.62569 8.95759 6.12716C9.23164 5.62863 9.37522 5.06892 9.375 4.50003C9.37563 3.95517 9.24405 3.41829 8.99154 2.93547C8.73902 2.45266 8.37313 2.03832 7.92525 1.72803C7.90725 1.74078 7.875 1.77828 7.875 1.84803V3.96153C7.87502 4.17575 7.82261 4.38672 7.72233 4.57602C7.62206 4.76532 7.47698 4.9272 7.29975 5.04753L6.73725 5.43003C6.51974 5.5777 6.2629 5.65666 6 5.65666C5.7371 5.65666 5.48026 5.5777 5.26275 5.43003L4.70025 5.04753C4.52302 4.9272 4.37794 4.76532 4.27767 4.57602C4.17739 4.38672 4.12498 4.17575 4.125 3.96153V1.84728C4.125 1.77828 4.09275 1.74078 4.07475 1.72803Z"
                    fill="currentColor"
                  ></path>
                </svg>
              </span>
              <span class="chip__label">{connectorsLabel}</span>
              {@render chevron(openMenu === "tools")}
              {#if toolsBadgeCount > 0}
                <span class="tools-badge">{toolsBadgeCount}</span>
              {/if}
            </button>

            <!-- Always mounted, hidden with display (the design's own mechanism):
               SkillPicker owns the skill catalog and the linked-skill count that
               badges this chip, so unmounting it on close would blank the badge. -->
            <div
              class="dropdown-panel tools-menu"
              class:dropdown-panel--hidden={openMenu !== "tools"}
            >
              <div class="tools-menu__head">
                <span class="tools-menu__title"
                  >{$_("chat.messageInput.tools")}</span
                >
                <span class="tools-menu__sub"
                  >{$_("chat.messageInput.toolsSubtitle")}</span
                >
              </div>

              <div class="tools-skills-box">
                <span class="tools-section-label"
                  >{$_("chat.skills.label")}</span
                >
                <SkillPicker
                  {conversationId}
                  bind:pendingSkillIds
                  bind:selectedCount={activeSkillCount}
                />
              </div>

              <!-- The design gives each section its own footer link
                   (".tools-menu__footer"): skills here, connectors at the end. -->
              <button
                class="tools-menu__footer"
                type="button"
                onclick={(e) => {
                  e.stopPropagation();
                  closeMenus();
                  navigate("/settings?tab=skills");
                }}
              >
                {$_("chat.messageInput.manageSkills")}
              </button>

              <div class="tools-connectors">
                <span class="tools-section-label"
                  >{$_("chat.messageInput.connectorsSection")}</span
                >
                {#if loadingMcpServers}
                  <span class="cx-state"
                    >{$_("chat.messageInput.loadingConnectors")}</span
                  >
                {:else if mcpServersError}
                  <span class="cx-state cx-state--error">{mcpServersError}</span
                  >
                {:else if mcpServers.length === 0}
                  <span class="cx-state"
                    >{$_("chat.messageInput.noConnectors")}</span
                  >
                {:else}
                  {#each mcpServers as server (server.id)}
                    {@const on = selectedMcpServers.includes(server.id)}
                    {@const connected = isConnectorConnected(server)}
                    <div class="connector-row">
                      <span class="connector-icon">
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="1.8"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M9 2v6" />
                          <path d="M15 2v6" />
                          <path d="M6 8h12v3a6 6 0 0 1-12 0V8z" />
                          <path d="M12 17v5" />
                        </svg>
                      </span>
                      <span class="connector-text">
                        <span class="connector-name" title={server.name}
                          >{server.name}</span
                        >
                        <span
                          class="connector-status"
                          class:connector-status--on={connected}
                          class:connector-status--off={!connected}
                        >
                          {connected
                            ? $_("chat.messageInput.connectorConnected")
                            : $_("chat.messageInput.connectorDisconnected")}
                        </span>
                      </span>
                      <button
                        type="button"
                        class="toggle"
                        class:toggle--on={on}
                        aria-pressed={on}
                        aria-label={server.name}
                        onclick={(e) => {
                          e.stopPropagation();
                          onMcpToggle?.(server.id);
                        }}
                      ></button>
                    </div>
                  {/each}
                {/if}
              </div>

              <button
                class="tools-menu__footer"
                type="button"
                onclick={(e) => {
                  e.stopPropagation();
                  closeMenus();
                  navigate("/settings?tab=integrations");
                }}
              >
                {$_("chat.messageInput.manageConnectors")}
              </button>
            </div>
          </div>

          <!-- ===== Image generation ===== -->
          {#if imageEntries.length > 0}
            <div class="dropdown-anchor" class:is-open={openMenu === "image"}>
              <button
                class="image-pill"
                class:image-pill--locked={imageModelSelected}
                type="button"
                onclick={(e) => {
                  e.stopPropagation();
                  toggleMenu("image");
                }}
                title={$_("chat.messageInput.imageModel")}
                aria-label={$_("chat.messageInput.imageModel")}
                aria-expanded={openMenu === "image"}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <path
                    d="M18.3336 1.8348V5.50132M20.1671 3.66806H16.5002M10.0985 2.58134C10.1378 2.37107 10.2494 2.18115 10.414 2.04449C10.5785 1.90782 10.7857 1.83301 10.9997 1.83301C11.2136 1.83301 11.4208 1.90782 11.5854 2.04449C11.75 2.18115 11.8616 2.37107 11.9008 2.58134L12.8643 7.67597C12.9328 8.03818 13.1088 8.37134 13.3695 8.63199C13.6302 8.89264 13.9634 9.06866 14.3256 9.13708L19.4209 10.1005C19.6312 10.1397 19.8211 10.2513 19.9578 10.4159C20.0945 10.5804 20.1693 10.7876 20.1693 11.0015C20.1693 11.2154 20.0945 11.4226 19.9578 11.5871C19.8211 11.7517 19.6312 11.8633 19.4209 11.9026L14.3256 12.8659C13.9634 12.9344 13.6302 13.1104 13.3695 13.371C13.1088 13.6317 12.9328 13.9648 12.8643 14.327L11.9008 19.4217C11.8616 19.6319 11.75 19.8219 11.5854 19.9585C11.4208 20.0952 11.2136 20.17 10.9997 20.17C10.7857 20.17 10.5785 20.0952 10.414 19.9585C10.2494 19.8219 10.1378 19.6319 10.0985 19.4217L9.13503 14.327C9.0666 13.9648 8.89056 13.6317 8.62988 13.371C8.3692 13.1104 8.03599 12.9344 7.67374 12.8659L2.5785 11.9026C2.3682 11.8633 2.17827 11.7517 2.04158 11.5871C1.9049 11.4226 1.83008 11.2154 1.83008 11.0015C1.83008 10.7876 1.9049 10.5804 2.04158 10.4159C2.17827 10.2513 2.3682 10.1397 2.5785 10.1005L7.67374 9.13708C8.03599 9.06866 8.3692 8.89264 8.62988 8.63199C8.89056 8.37134 9.0666 8.03818 9.13503 7.67597L10.0985 2.58134ZM5.49928 18.3341C5.49928 19.3466 4.6784 20.1674 3.6658 20.1674C2.65319 20.1674 1.83232 19.3466 1.83232 18.3341C1.83232 17.3217 2.65319 16.5009 3.6658 16.5009C4.6784 16.5009 5.49928 17.3217 5.49928 18.3341Z"
                    stroke="#427AC6"
                    stroke-width="2"
                    stroke-linecap="round"
                  />
                </svg>
                <span class="image-pill__label"
                  >{$_("chat.messageInput.imageChip")}</span
                >
                {@render chevron(openMenu === "image")}
              </button>

              {#if openMenu === "image"}
                <div class="dropdown-panel image-model-picker">
                  <div class="image-model-head">
                    <span class="image-model-head__icon">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="22"
                        height="22"
                        viewBox="0 0 22 22"
                        fill="none"
                      >
                        <path
                          d="M18.3336 1.8348V5.50132M20.1671 3.66806H16.5002M10.0985 2.58134C10.1378 2.37107 10.2494 2.18115 10.414 2.04449C10.5785 1.90782 10.7857 1.83301 10.9997 1.83301C11.2136 1.83301 11.4208 1.90782 11.5854 2.04449C11.75 2.18115 11.8616 2.37107 11.9008 2.58134L12.8643 7.67597C12.9328 8.03818 13.1088 8.37134 13.3695 8.63199C13.6302 8.89264 13.9634 9.06866 14.3256 9.13708L19.4209 10.1005C19.6312 10.1397 19.8211 10.2513 19.9578 10.4159C20.0945 10.5804 20.1693 10.7876 20.1693 11.0015C20.1693 11.2154 20.0945 11.4226 19.9578 11.5871C19.8211 11.7517 19.6312 11.8633 19.4209 11.9026L14.3256 12.8659C13.9634 12.9344 13.6302 13.1104 13.3695 13.371C13.1088 13.6317 12.9328 13.9648 12.8643 14.327L11.9008 19.4217C11.8616 19.6319 11.75 19.8219 11.5854 19.9585C11.4208 20.0952 11.2136 20.17 10.9997 20.17C10.7857 20.17 10.5785 20.0952 10.414 19.9585C10.2494 19.8219 10.1378 19.6319 10.0985 19.4217L9.13503 14.327C9.0666 13.9648 8.89056 13.6317 8.62988 13.371C8.3692 13.1104 8.03599 12.9344 7.67374 12.8659L2.5785 11.9026C2.3682 11.8633 2.17827 11.7517 2.04158 11.5871C1.9049 11.4226 1.83008 11.2154 1.83008 11.0015C1.83008 10.7876 1.9049 10.5804 2.04158 10.4159C2.17827 10.2513 2.3682 10.1397 2.5785 10.1005L7.67374 9.13708C8.03599 9.06866 8.3692 8.89264 8.62988 8.63199C8.89056 8.37134 9.0666 8.03818 9.13503 7.67597L10.0985 2.58134ZM5.49928 18.3341C5.49928 19.3466 4.6784 20.1674 3.6658 20.1674C2.65319 20.1674 1.83232 19.3466 1.83232 18.3341C1.83232 17.3217 2.65319 16.5009 3.6658 16.5009C4.6784 16.5009 5.49928 17.3217 5.49928 18.3341Z"
                          stroke="#427AC6"
                          stroke-width="2"
                          stroke-linecap="round"
                        />
                      </svg>
                    </span>
                    <span class="image-model-head__text">
                      <span class="image-model-head__title"
                        >{$_("chat.messageInput.imageGenTitle")}</span
                      >
                      <span class="image-model-head__sub"
                        >{$_("chat.messageInput.imageGenSubtitle")}</span
                      >
                    </span>
                  </div>

                  {#each imageEntries as entry (entry.provider.key + "/" + entry.model.key)}
                    {@const selected = isModelSelected(entry.model)}
                    <button
                      class="image-model-row"
                      class:image-model-row--selected={selected}
                      type="button"
                      onclick={() => selectModel(entry.provider, entry.model)}
                    >
                      <span class="image-model-row__text">
                        <span class="image-model-row__name"
                          >{entry.model.name}</span
                        >
                      </span>
                      {#if selected}
                        {@render checkMark("image-model-row__check")}
                      {/if}
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}

          <!-- ===== Web search ===== -->
          <button
            class="circle-btn"
            class:circle-btn--active={webSearchEnabled}
            type="button"
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
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M2 12h20" />
              <path
                d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
              />
            </svg>
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
                <path
                  d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"
                />
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
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
              >
                <path
                  d="M11.0836 7L6.99982 2.9162L2.91602 7M6.99982 2.9162V11.0838"
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

  /* Attachments + textarea share a tighter column; the card's own 32px gap
     stays where the design puts it, between this stack and the toolbar. */
  .composer__stack {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
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

  /* the attach button is the only filled circle in the design: 34px,
     rgb(249,250,251) fill, a hairline ring and a darker icon than the rest
     of the toolbar (--gx-slate-600, not --gx-slate-500). */
  .input-btn.plus-btn {
    width: 34px;
    height: 34px;
    border-radius: 17px;
    background: var(--gx-an-field-bg);
    box-shadow: inset 0 0 0 1px var(--gx-hair-strong);
    color: var(--gx-slate-600);
  }

  .input-btn:hover:not(:disabled) {
    background: var(--gx-hover-soft);
    color: var(--gx-slate-500);
    transform: none;
    box-shadow: none;
  }

  .input-btn.plus-btn:hover:not(:disabled) {
    background: var(--gx-hover-soft);
    color: var(--gx-slate-600);
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

  /* =====================================================================
     Composer chips + dropdown pickers
     Transcribed from chat-empty-state.html (figma chat/empty-state 159:15193):
     .attach-btn / .chip / .image-pill / .circle-btn and the four
     .dropdown-panel pickers. Values live on the --gx-cx-* token layer in
     app.css so the dark theme remaps in one place.

     Two global rules from app.css fight this design and are reset per element:
       - `button, .btn` sets padding + justify-content: center
       - `button, .btn` sets backdrop-filter: blur(.625rem), which repaints the
         area behind the button and erases hairlines underneath it
     ===================================================================== */

  .dropdown-anchor {
    position: relative;
    display: flex;
    align-items: center;
  }

  .dropdown-anchor button {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  /* ---- attach: the only filled circle in the design (34px) ---- */
  .attach-btn {
    width: 34px;
    height: 34px;
    padding: 0;
    border: none;
    border-radius: 17px;
    background: var(--gx-cx-row-hover);
    box-shadow: inset 0 0 0 1px var(--gx-cx-pill-ring);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--gx-slate-600);
    flex-shrink: 0;
    cursor: pointer;
    transition: background-color 120ms ease;
  }

  .attach-btn:hover:not(:disabled) {
    background: var(--gx-hover-soft);
  }

  .attach-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* ---- chip: 26px pill, hairline ring, 5/8/5/10 padding ---- */
  .chip {
    height: 26px;
    padding: 5px 8px 5px 10px;
    border: none;
    border-radius: 100px;
    background: transparent;
    box-shadow: inset 0 0 0 1px var(--gx-hair-strong);
    display: flex;
    align-items: center;
    gap: 5px;
    flex-shrink: 0;
    color: var(--gx-slate-500);
    cursor: pointer;
    transition:
      background-color 120ms ease,
      box-shadow 120ms ease;
  }

  .chip:hover {
    background: var(--gx-hover-soft);
  }

  .chip__label {
    font-family: var(--gx-font-display);
    font-weight: 500;
    font-size: 12px;
    line-height: 16px;
    color: var(--gx-slate-700);
    white-space: nowrap;
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .chip__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    flex-shrink: 0;
  }

  .chip__icon :global(svg) {
    width: 14px;
    height: 14px;
    display: block;
  }

  .provider-icon-img {
    width: 14px;
    height: 14px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    object-fit: contain;
  }

  .provider-icon-img :global(svg) {
    width: 14px;
    height: 14px;
    display: block;
  }

  /* Enabled-tools counter riding on the Tools chip. */
  .tools-badge {
    min-width: 19px;
    height: 16px;
    border-radius: 8px;
    background: var(--gx-tools-badge);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1px 6px;
    box-sizing: border-box;
    font-family: var(--gx-font);
    font-weight: 700;
    font-size: 10px;
    line-height: 100%;
    color: #fff;
    flex-shrink: 0;
  }

  /* ---- image pill: 28px, squarer ring, its own locked state ---- */
  .image-pill {
    height: 28px;
    padding: 6px 12px;
    border: none;
    border-radius: 18px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-cx-pill-ring);
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    color: var(--gx-slate-600);
    cursor: pointer;
    transition:
      background-color 120ms ease,
      box-shadow 120ms ease;
  }

  .image-pill:hover {
    background: var(--gx-hover-soft);
  }

  .image-pill__label {
    font-family: var(--gx-font);
    font-weight: 500;
    font-size: 13px;
    line-height: 100%;
    color: var(--gx-slate-600);
    white-space: nowrap;
  }

  /* Image mode is live: the pill stays lit even with the picker closed. */
  .image-pill--locked,
  .image-pill--locked:hover {
    background: var(--gx-ring-soft);
    box-shadow: inset 0 0 0 1px var(--gx-org-primary-500);
    color: var(--gx-org-primary-500);
  }

  .image-pill--locked .image-pill__label {
    color: var(--gx-org-primary-500);
  }

  /* ---- 28px bare circle: web search ---- */
  .circle-btn {
    width: 28px;
    height: 28px;
    padding: 0;
    border: none;
    border-radius: 14px;
    background: transparent;
    box-shadow: none;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--gx-slate-500);
    flex-shrink: 0;
    cursor: pointer;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    transition:
      background-color 120ms ease,
      color 120ms ease;
  }

  .circle-btn:hover {
    background: var(--gx-hover-soft);
  }

  /* The design draws no on-state for web search, but the toggle needs one. */
  .circle-btn--active,
  .circle-btn--active:hover {
    background: var(--gx-ring-soft);
    color: var(--gx-org-primary-500);
    box-shadow: inset 0 0 0 1px var(--gx-org-primary-500);
  }

  .cx-chev {
    flex-shrink: 0;
    transition: transform 150ms ease;
  }

  .cx-chev--open {
    transform: rotate(180deg);
  }

  /* ---- the open trigger, for every anchor ---- */
  .dropdown-anchor.is-open > .chip,
  .dropdown-anchor.is-open > .attach-btn,
  .dropdown-anchor.is-open > .image-pill {
    background: var(--gx-ring-soft);
    box-shadow: inset 0 0 0 1px var(--gx-org-primary-500);
    color: var(--gx-org-primary-500);
  }

  .dropdown-anchor.is-open > .chip .chip__label,
  .dropdown-anchor.is-open > .image-pill .image-pill__label {
    color: var(--gx-org-primary-500);
  }

  .dropdown-anchor.is-open > .chip .tools-badge {
    background: var(--gx-org-primary-500);
  }

  /* =================== panels =================== */
  /* The composer sits at the bottom of the viewport, so every panel opens
     upward. Unlike the static mock these hold real registries, so they get a
     height cap and their own scroll. */
  .dropdown-panel {
    position: absolute;
    bottom: calc(100% + 8px);
    left: 0;
    z-index: 40;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    border-radius: 12px;
    background: var(--gx-card);
    box-shadow:
      inset 0 0 0 1px var(--gx-cx-panel-ring),
      var(--gx-cx-panel-shadow);
    box-sizing: border-box;
    /* --dropdown-max-h is the measured space above the trigger (see
       syncPanelMaxHeight); the calc() is only the pre-measurement fallback. */
    max-height: min(440px, var(--dropdown-max-h, calc(100vh - 160px)));
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .cx-state {
    font-family: var(--gx-font);
    font-size: 12px;
    color: var(--gx-cx-sub);
    padding: 2px 0;
  }

  .cx-state--error {
    color: var(--gx-danger);
  }

  /* ---- attach menu ---- */
  .attach-menu {
    width: 254px;
  }

  .menu-row {
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 8px 6px;
    border: none;
    border-radius: 6px;
    background: transparent;
    box-shadow: none;
    width: 100%;
    box-sizing: border-box;
    text-align: left;
    cursor: pointer;
    transition: background-color 120ms ease;
  }

  .menu-row:hover {
    background: var(--gx-cx-row-hover);
  }

  .menu-row__icon {
    display: inline-flex;
    color: var(--gx-slate-600);
    flex-shrink: 0;
  }

  .menu-row__text {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .menu-row__title {
    font-family: var(--gx-font);
    font-weight: 600;
    font-size: 13px;
    color: var(--gx-cx-ink);
  }

  .menu-row__sub {
    font-family: var(--gx-font);
    font-size: 11px;
    color: var(--gx-cx-sub);
  }

  /* ---- model picker ---- */
  .model-picker {
    width: 360px;
  }

  .model-search {
    height: 36px;
    border-radius: 6px;
    background: var(--gx-cx-row-hover);
    box-shadow: inset 0 0 0 1px var(--gx-cx-panel-ring);
    display: flex;
    gap: 8px;
    padding: 0 10px;
    align-items: center;
    color: var(--gx-cx-sub);
    box-sizing: border-box;
    flex-shrink: 0;
  }

  /* app.css gives every input a glass fill, an inner shadow, a blur and a 2px
     focus ring — inside this field wrapper that reads as a doubled ring. */
  .model-search__input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: none;
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    padding: 0;
    font-family: var(--gx-font);
    font-size: 13px;
    color: var(--gx-cx-ink);
  }

  .model-search__input:focus {
    background: none;
    box-shadow: none;
    outline: none;
    border: none;
  }

  .model-search__input::placeholder {
    color: var(--gx-cx-sub);
    opacity: 1;
  }

  .model-group {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px 0;
  }

  .model-group__label {
    font-family: var(--gx-font);
    font-weight: 700;
    font-size: 11px;
    letter-spacing: 1px;
    color: var(--gx-cx-sub);
    text-transform: uppercase;
    padding: 0 4px 2px;
  }

  .model-row {
    min-height: 32px;
    border: none;
    border-radius: 6px;
    background: transparent;
    box-shadow: none;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 6px;
    padding: 8px;
    box-sizing: border-box;
    text-align: left;
    width: 100%;
    cursor: pointer;
    transition: background-color 120ms ease;
  }

  .model-row:hover {
    background: var(--gx-cx-row-hover);
  }

  .model-row--selected {
    background: var(--gx-org-primary-tint);
  }

  .model-row__name {
    flex: 1;
    min-width: 0;
    font-family: var(--gx-font);
    font-weight: 400;
    font-size: 13px;
    color: var(--gx-cx-ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .model-row--selected .model-row__name {
    font-weight: 600;
  }

  .model-row__check {
    color: var(--gx-tools-badge);
    flex-shrink: 0;
  }

  .model-brand-row {
    min-height: 34px;
    display: flex;
    gap: 8px;
    padding: 6px 4px;
    align-items: center;
    width: 100%;
    box-sizing: border-box;
    border: none;
    border-radius: 6px;
    background: transparent;
    box-shadow: none;
    cursor: pointer;
    transition: background-color 120ms ease;
  }

  .model-brand-row:hover {
    background: var(--gx-cx-row-hover);
  }

  .chev-toggle {
    color: var(--gx-cx-sub);
    flex-shrink: 0;
    transition: transform 150ms ease;
  }

  .chev-toggle--collapsed {
    transform: rotate(-90deg);
  }

  /* Real provider icons stand in for the design's letter tiles; the letter
     tile is the fallback when the registry ships no icon. */
  .brand-badge {
    width: 18px;
    height: 18px;
    border-radius: 3px;
    background: var(--gx-cx-ink);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-family: var(--gx-font);
    font-weight: 800;
    font-size: 10px;
    flex-shrink: 0;
  }

  /* Registry icons paint with `fill="currentColor"`, so the icon variant has to
     drop the letter tile's white ink or the logo disappears on the white tile. */
  .brand-badge--icon {
    background: transparent;
    color: var(--gx-cx-ink);
    object-fit: contain;
  }

  .brand-badge--icon :global(svg) {
    width: 18px;
    height: 18px;
    display: block;
  }

  .model-brand-row__name {
    flex-grow: 1;
    font-family: var(--gx-font);
    font-weight: 600;
    font-size: 13px;
    color: var(--gx-cx-ink);
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .model-brand-row__count {
    font-family: var(--gx-font);
    font-size: 12px;
    color: var(--gx-cx-sub);
    flex-shrink: 0;
  }

  .model-brand-children {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-left: 40px;
  }

  .model-row--child {
    min-height: 24px;
    padding: 4px 6px;
    justify-content: flex-start;
    gap: 6px;
  }

  .model-row--child .model-row__name {
    font-weight: 400;
    font-size: 13px;
    color: var(--gx-slate-600);
  }

  .model-row--child.model-row--selected .model-row__name {
    font-weight: 600;
    color: var(--gx-cx-ink);
  }

  .model-tag {
    height: 16px;
    border-radius: 4px;
    background: var(--gx-cx-tag-bg);
    padding: 2px 6px;
    font-family: var(--gx-font);
    font-weight: 600;
    font-size: 10px;
    line-height: 12px;
    color: var(--gx-slate-600);
    flex-shrink: 0;
  }

  .model-legacy-link {
    align-self: flex-start;
    border: none;
    background: none;
    box-shadow: none;
    padding: 4px 0;
    font-family: var(--gx-font);
    font-size: 12px;
    color: var(--gx-tools-badge);
    text-decoration: underline;
    cursor: pointer;
  }

  /* ---- tools menu ---- */
  /* Real orgs can have many skills and connectors, so each list scrolls inside
     its own box: the head and the "Manage connectors" footer stay put instead
     of scrolling out of the panel. */
  .tools-menu {
    width: 300px;
    max-height: min(560px, calc(100vh - 140px));
  }

  .tools-menu__head {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-bottom: 4px;
  }

  .tools-menu__title {
    font-family: var(--gx-font);
    font-weight: 700;
    font-size: 14px;
    color: var(--gx-cx-ink);
  }

  .tools-menu__sub {
    font-family: var(--gx-font);
    font-size: 12px;
    color: var(--gx-cx-sub);
  }

  .tools-skills-box {
    max-height: 160px;
    overflow-y: auto;
    overscroll-behavior: contain;
    border-radius: 12px;
    box-shadow: inset 0 0 0 1px var(--gx-cx-panel-ring);
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 6px 8px;
  }

  .tools-section-label {
    font-family: var(--gx-font);
    font-weight: 700;
    font-size: 11px;
    letter-spacing: 1px;
    color: var(--gx-cx-sub);
    text-transform: uppercase;
  }

  .tools-connectors {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 6px 0;
    max-height: 190px;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .connector-row {
    display: flex;
    gap: 10px;
    align-items: center;
  }

  .connector-icon {
    display: inline-flex;
    color: var(--gx-slate-600);
    flex-shrink: 0;
  }

  .connector-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex-grow: 1;
    min-width: 0;
  }

  .connector-name {
    font-family: var(--gx-font);
    font-weight: 600;
    font-size: 13px;
    color: var(--gx-cx-ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .connector-status {
    font-family: var(--gx-font);
    font-size: 11px;
  }

  .connector-status--on {
    color: var(--gx-cx-toggle-on);
  }

  .connector-status--off {
    color: var(--gx-cx-sub);
  }

  /* 36x20 track / 16px thumb — same switch the skills rows use. */
  .toggle {
    width: 36px;
    height: 20px;
    min-width: 36px;
    border-radius: 10px;
    border: none;
    background: var(--gx-cx-toggle-off);
    display: flex;
    align-items: center;
    justify-content: flex-start;
    padding: 2px;
    box-sizing: border-box;
    flex-shrink: 0;
    cursor: pointer;
    box-shadow: none;
    transition: background-color 120ms ease;
  }

  .toggle::after {
    content: "";
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #fff;
  }

  .toggle--on {
    background: var(--gx-cx-toggle-on);
    justify-content: flex-end;
  }

  .tools-menu__footer {
    flex-shrink: 0;
    text-align: center;
    padding: 6px 0;
    border: none;
    background: none;
    box-shadow: none;
    font-family: var(--gx-font);
    font-weight: 600;
    font-size: 13px;
    color: var(--gx-tools-badge);
    cursor: pointer;
  }

  /* ---- image model picker ---- */
  .image-model-picker {
    width: 290px;
  }

  .image-model-head {
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 8px 8px 6px;
    border-radius: 8px;
    box-shadow: inset 0 0 0 1px var(--gx-cx-panel-ring);
  }

  .image-model-head__icon {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--gx-cx-img-accent);
    flex-shrink: 0;
  }

  .image-model-head__text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .image-model-head__title {
    font-family: var(--gx-font);
    font-weight: 700;
    font-size: 14px;
    color: var(--gx-cx-ink);
  }

  .image-model-head__sub {
    font-family: var(--gx-font);
    font-size: 12px;
    color: var(--gx-cx-sub);
  }

  .image-model-row {
    border: none;
    border-radius: 6px;
    background: transparent;
    box-shadow: none;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px;
    gap: 10px;
    box-sizing: border-box;
    text-align: left;
    width: 100%;
    cursor: pointer;
    transition: background-color 120ms ease;
  }

  .image-model-row:hover {
    background: var(--gx-cx-row-hover);
  }

  .image-model-row--selected {
    background: var(--gx-cx-img-tint);
  }

  .image-model-row__text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }

  .image-model-row__name {
    font-family: var(--gx-font);
    font-weight: 400;
    font-size: 13px;
    color: var(--gx-cx-ink);
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .image-model-row--selected .image-model-row__name {
    font-weight: 600;
  }

  .image-model-row__check {
    color: var(--gx-cx-img-accent);
    flex-shrink: 0;
  }

  /* =================== image mode =================== */
  /* The design writes `align-items: flex-start` here and then puts
     `align-self: stretch` on the composer itself; stretching from the parent is
     the same result and stops the card shrink-wrapping to its toolbar when the
     text is short (which clipped it on narrow viewports). */
  .composer-wrap {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    align-self: stretch;
    width: 100%;
    min-width: 0;
  }

  .image-mode-banner {
    height: 32px;
    border-radius: 16px 16px 0 0;
    background: var(--gx-an-blue-label);
    padding: 8px 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    align-self: stretch;
    box-sizing: border-box;
  }

  .image-mode-banner__left {
    display: flex;
    gap: 8px;
    align-items: center;
    color: #fff;
    font-family: var(--gx-font);
    font-weight: 600;
    font-size: 12px;
  }

  .image-mode-banner__close {
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: 0;
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    color: #fff;
    cursor: pointer;
    line-height: 1;
    padding: 0;
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }

  /* The banner owns the top corners while it is up. */
  .input-container-main--image-mode {
    border-radius: 0 0 16px 16px;
  }

  .dropdown-panel--hidden {
    display: none;
  }

  .dropdown-empty {
    padding: 8px 4px;
    font-family: var(--gx-font);
    font-size: 12px;
    color: var(--gx-cx-sub);
    text-align: center;
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
  /* ===== Pending attachments =====
     The design draws one attachment vocabulary (chat-empty-state.html
     ".attachment-grid"): a 130x100 tile at 12px radius for an image, a 220x60
     card for anything else. The composer reuses those exact metrics so the
     preview and the sent turn are the same object. */
  .pending-attachments {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    width: 100%;
    min-width: 0;
  }

  .pending-attachment {
    position: relative;
    flex-shrink: 0;
    transition:
      opacity 160ms ease,
      box-shadow 160ms ease;
  }

  .pending-attachment--uploading {
    opacity: 0.7;
  }

  /* ---- image: the design's ".att-image" tile ---- */
  .pending-attachment--image {
    width: 130px;
    height: 100px;
    border-radius: 12px;
    overflow: hidden;
    background: linear-gradient(
      127.6deg,
      var(--gx-tx-att-img-from) 0%,
      var(--gx-tx-att-img-to) 100%
    );
  }

  .pending-attachment__thumb {
    display: block;
    width: 100%;
    height: 100%;
    padding: 0;
    border: none;
    background: transparent;
    cursor: pointer;
  }

  .pending-attachment__thumb:focus-visible {
    outline: 2px solid var(--gx-nav-accent);
    outline-offset: -2px;
  }

  .pending-attachment__image {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .pending-attachment__placeholder {
    display: flex;
    width: 100%;
    height: 100%;
    align-items: center;
    justify-content: center;
    color: rgba(255, 255, 255, 0.85);
  }

  /* ---- video: the design's ".att-video" tile ---- */
  .pending-attachment--video {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 130px;
    height: 100px;
    border-radius: 12px;
    overflow: hidden;
    background: linear-gradient(
      127.6deg,
      var(--gx-tx-att-vid-from) 0%,
      var(--gx-tx-att-vid-to) 100%
    );
  }

  .pending-attachment__poster {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .pending-attachment__play {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 17px;
    background: #fff;
    box-shadow: 0 2px 6px 0 rgba(0, 0, 0, 0.149);
    color: rgb(28, 41, 56);
    flex-shrink: 0;
  }

  .pending-attachment__duration {
    position: absolute;
    z-index: 1;
    inset-inline-end: 6px;
    bottom: 6px;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.702);
    padding: 2px 4px;
    font-family: var(--gx-font);
    font-weight: 700;
    font-size: 10px;
    line-height: 12px;
    color: #fff;
  }

  /* ---- file: the design's ".att-file" card ---- */
  .pending-attachment--file {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 220px;
    height: 60px;
    box-sizing: border-box;
    padding: 12px 12px 12px 12px;
    border-radius: 12px;
    background: var(--gx-card);
    box-shadow:
      inset 0 0 0 1px var(--gx-tx-chip-ring),
      0 2px 8px 0 rgba(0, 0, 0, 0.0392);
  }

  .pending-attachment--file.pending-attachment--failed {
    box-shadow: inset 0 0 0 1px var(--gx-danger);
  }

  .pending-attachment__open {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1;
    min-width: 0;
    padding: 0;
    border: none;
    background: transparent;
    cursor: pointer;
    text-align: start;
  }

  .pending-attachment__open:focus-visible {
    outline: 2px solid var(--gx-nav-accent);
    outline-offset: 2px;
    border-radius: 8px;
  }

  .pending-attachment__icon {
    display: flex;
    width: 36px;
    height: 36px;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    background: var(--gx-tx-file-icon-bg);
    color: var(--gx-danger);
    flex-shrink: 0;
  }

  .pending-attachment__text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .pending-attachment__name {
    font-family: var(--gx-font);
    font-weight: 700;
    font-size: 12px;
    line-height: 15px;
    color: var(--gx-tx-ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Doubles as the status line: size normally, "Uploading…"/"Failed" while the
     upload is in flight, so a file card never needs a second row. */
  .pending-attachment__size {
    font-family: var(--gx-font);
    font-size: 11px;
    line-height: 14px;
    color: var(--gx-org-slate-350);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pending-attachment--failed .pending-attachment__size {
    color: var(--gx-danger);
  }

  /* ---- remove: the design's ".att-file__dl" slot on a card, a floating
     control over a tile ---- */
  .pending-attachment__remove {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: none;
    cursor: pointer;
    flex-shrink: 0;
    transition:
      background-color 120ms ease,
      color 120ms ease,
      opacity 120ms ease;
  }

  .pending-attachment__remove--inline {
    margin-inline-start: auto;
    width: 20px;
    height: 20px;
    border-radius: 10px;
    background: transparent;
    color: var(--gx-org-slate-350);
  }

  .pending-attachment__remove--inline:hover {
    background: var(--gx-danger-soft);
    color: var(--gx-danger);
  }

  /* Over an image there is no card edge to sit on, so the control carries its
     own scrim. Always visible on touch, where there is no hover. */
  .pending-attachment--image .pending-attachment__remove,
  .pending-attachment--video .pending-attachment__remove {
    position: absolute;
    top: 6px;
    inset-inline-end: 6px;
    width: 20px;
    height: 20px;
    border-radius: 10px;
    background: rgba(14, 24, 40, 0.72);
    color: #fff;
    opacity: 0;
  }

  .pending-attachment--image:hover .pending-attachment__remove,
  .pending-attachment--image .pending-attachment__remove:focus-visible,
  .pending-attachment--video:hover .pending-attachment__remove,
  .pending-attachment--video .pending-attachment__remove:focus-visible {
    opacity: 1;
  }

  @media (hover: none) {
    .pending-attachment--image .pending-attachment__remove,
    .pending-attachment--video .pending-attachment__remove {
      opacity: 1;
    }
  }

  .pending-attachment__remove:focus-visible {
    outline: 2px solid var(--gx-nav-accent);
    outline-offset: 2px;
  }

  /* ---- upload status ---- */
  .pending-attachment__badge {
    position: absolute;
    left: 6px;
    bottom: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 10px;
    background: rgba(14, 24, 40, 0.72);
    font-size: 11px;
    line-height: 1;
    color: #fff;
  }

  .pending-attachment__badge--done {
    background: var(--gx-send);
  }

  .pending-attachment__badge--failed {
    background: var(--gx-danger);
  }

  .pending-attachment__check {
    flex-shrink: 0;
    font-size: 12px;
    line-height: 1;
    color: var(--gx-send);
  }

  .pending-attachment__spinner {
    flex-shrink: 0;
    width: 12px;
    height: 12px;
    border: 1.5px solid rgba(var(--brand-rgb), 0.15);
    border-top-color: var(--brand);
    border-radius: 50%;
    animation: pill-spin 0.7s linear infinite;
  }

  .pending-attachment__badge .pending-attachment__spinner {
    border-color: rgba(255, 255, 255, 0.3);
    border-top-color: #fff;
  }

  @keyframes pill-spin {
    to {
      transform: rotate(360deg);
    }
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

    .chat-input-textarea {
      font-size: 1rem; /* Prevent iOS zoom */
    }

    /* Below the design width the toolbar runs out of room, so the chips shed
       their labels and the panels stop being 360px wide. */
    .chip__label,
    .image-pill__label {
      display: none;
    }

    .chip {
      padding: 5px 8px;
      gap: 4px;
    }

    .image-pill {
      padding: 6px 8px;
      gap: 4px;
    }

    .cx-chev {
      display: none;
    }

    .dropdown-panel {
      max-height: min(360px, var(--dropdown-max-h, calc(100vh - 200px)));
    }

    .model-picker,
    .tools-menu,
    .image-model-picker,
    .attach-menu {
      width: min(320px, calc(100vw - 48px));
    }

    .attach-btn {
      width: 30px;
      height: 30px;
      border-radius: 15px;
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

    /* Narrow viewports: shrink the tile and let a file card take the row. */
    .pending-attachment--image,
    .pending-attachment--video {
      width: 104px;
      height: 80px;
    }

    .pending-attachment--file {
      width: 100%;
      max-width: 220px;
    }
  }
</style>
