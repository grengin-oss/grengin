<script lang="ts">
  import { onMount } from 'svelte';
  import type { ProviderInfo, ModelInfo, SpeechRecognition, SpeechRecognitionEvent, SpeechRecognitionErrorEvent } from '../../../api/models';
  import { uploadDocument, type UploadedFile } from '../../../api/chatApi';
  import { _ } from 'svelte-i18n';

  interface MessageInputProps {
    onSend: (message: string, uploadedFiles?: UploadedFile[], webSearch?: boolean) => void;
    disabled?: boolean;
    placeholder?: string;
    selectedModel?: string;
    selectedProvider?: string;
    onModelSelect?: (provider: ProviderInfo, model: ModelInfo) => void;
    onRemoveModel?: () => void;
    providers?: ProviderInfo[];
    loadingModels?: boolean;
    modelsError?: string | null;
    webSearchEnabled?: boolean;
    onWebSearchToggle?: () => void;
  }

  let { onSend, disabled = false, placeholder, selectedModel, selectedProvider, onModelSelect, onRemoveModel, providers = [], loadingModels = false, modelsError = null, webSearchEnabled = false, onWebSearchToggle }: MessageInputProps = $props();
  let isDarkMode = $state(false);

  function syncThemeState() {
    isDarkMode = document.documentElement.classList.contains('dark')
      || window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function getIconForTheme(provider?: ProviderInfo): string | undefined {
    if (!provider) return undefined;
    return isDarkMode ? (provider.icon_dark || provider.icon) : provider.icon;
  }

  let textarea: HTMLTextAreaElement;
  let fileInput: HTMLInputElement;
  let photoInput: HTMLInputElement;
  let message = $state('');
  let attachedFiles = $state<File[]>([]);
  let uploadingFiles = $state<Set<string>>(new Set());
  let filePreviews = $state<Record<string, string>>({});
  let imageThumbnails = $state<Record<string, string>>({});
  let showFilePreview = $state(false);
  let showImagePreview = $state(false);
  let currentPreviewFile = $state<File | null>(null);
  let currentPreviewImage = $state<{ file: File; url: string } | null>(null);
  let showPlusMenu = $state(false);
  let showModelDropdown = $state(false);

  // Voice input state
  let isRecording = $state(false);
  let recognition: SpeechRecognition | null = null;
  let microphoneError = $state<string | null>(null);

  // Dynamic placeholder based on recording state
  let currentPlaceholder = $derived(
    isRecording 
      ? $_('chat.messageInput.recordingPlaceholder') 
      : (placeholder || $_('chat.messageInput.placeholder'))
  );

  function autoResize() {
    if (!textarea) return;
    textarea.style.height = 'auto';
    const maxHeight = window.innerHeight * 0.4;
    const scrollHeight = textarea.scrollHeight;
    const newHeight = Math.max(24, Math.min(scrollHeight, maxHeight));
    textarea.style.height = newHeight + 'px';
    textarea.style.overflowY = scrollHeight > maxHeight ? 'auto' : 'hidden';
  }

  function handleInput() {
    autoResize();
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  }

  async function handleSend() {
    const trimmed = message.trim();
    if ((trimmed || attachedFiles.length > 0) && !disabled) {
      // Upload files first if there are any
      let uploadedFiles: UploadedFile[] = [];
      if (attachedFiles.length > 0) {
        const filesToUpload = [...attachedFiles];
        
        // Upload each file individually - upload API handles one file at a time
        for (const file of filesToUpload) {
          uploadingFiles.add(file.name);
          try {
            const uploaded = await uploadDocument({
              file,
              provider: selectedProvider || 'openai'
            });
            uploadedFiles.push(uploaded);
          } catch (error) {
            console.error(`Failed to upload file: ${file.name}`, error);
            // Remove failed file from attached files
            attachedFiles = attachedFiles.filter(f => f !== file);
            // Continue with other files instead of stopping completely
            continue;
          } finally {
            uploadingFiles.delete(file.name);
          }
        }
        
        // If no files were successfully uploaded, don't send message
        if (uploadedFiles.length === 0 && attachedFiles.length > 0) {
          console.error('No files were successfully uploaded');
          return;
        }
      }
      
      // Send message with successfully uploaded file metadata
      onSend(trimmed, uploadedFiles.length > 0 ? uploadedFiles : undefined, webSearchEnabled);
      message = '';
      attachedFiles = [];
      
      if (textarea) {
        textarea.style.height = 'auto';
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

  onMount(() => {
    syncThemeState();
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', syncThemeState);
    autoResize();

    // Cleanup speech recognition on unmount
    return () => {
      mediaQuery.removeEventListener('change', syncThemeState);
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
      const provider = providers.find(p => p.key === selectedProvider);
      if (provider) {
        const model = provider.models.find(m => m.key === selectedModel || m.name === selectedModel);
        if (model) {
          // The props are already being used in the template, so no need to update internal state
        }
      }
    }
  });

  function handlePhotoSelect() {
    photoInput?.click();
    showPlusMenu = false;
  }

  function handleFileSelect() {
    fileInput?.click();
    showPlusMenu = false;
  }

  function handleFileChange(event: Event) {
    const target = event.target as HTMLInputElement;
    if (target.files) {
      const newFiles = Array.from(target.files);
      attachedFiles = [...attachedFiles, ...newFiles];

      // Generate previews for text and image files
      for (const file of newFiles) {
        if (isTextFile(file)) {
          readFileContent(file).then(content => {
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
    showPlusMenu = false;
    target.value = '';
  }

  function removeFile(index: number) {
    const file = attachedFiles[index];
    attachedFiles = attachedFiles.filter((_, i) => i !== index);

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
    const textTypes = ['text/', 'application/json', 'application/xml', 'application/javascript', 'application/typescript', 'application/x-yaml', 'application/yaml'];
    const textExtensions = ['.txt', '.md', '.json', '.xml', '.js', '.ts', '.yaml', '.yml', '.csv', '.log', '.html', '.css', '.py', '.java', '.cpp', '.c', '.h', '.rs', '.go', '.php', '.rb', '.swift', '.kt', '.scala', '.r', '.sql', '.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat', '.cmd'];
    return textTypes.some(type => file.type.startsWith(type)) || textExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
  }

  function isImageFile(file: File): boolean {
    const imageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp', 'image/tiff'];
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.tiff', '.tif'];
    return imageTypes.includes(file.type) || imageExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
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
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // ===== Speech Recognition =====
  function initializeSpeechRecognition(): SpeechRecognition | null {
    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      microphoneError = $_('chat.messageInput.speechRecognitionNotSupported');
      return null;
    }

    const recognitionInstance = new SpeechRecognitionAPI();
    recognitionInstance.continuous = true;
    recognitionInstance.interimResults = true;
    recognitionInstance.lang = 'en-US';

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
      let fullTranscript = '';

      for (let i = 0; i < event.results.length; i++) {
        fullTranscript += event.results[i][0].transcript;
      }

      // Combine pre-existing text with new transcription
      message = textBeforeRecording
        ? textBeforeRecording + ' ' + fullTranscript
        : fullTranscript;

      // Trigger auto-resize for growing textarea
      requestAnimationFrame(autoResize);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'not-allowed') {
        microphoneError = $_('chat.messageInput.microphoneAccessDenied');
      } else if (event.error === 'no-speech') {
        // User didn't speak - silently stop
      } else if (event.error !== 'aborted') {
        microphoneError = $_('chat.messageInput.voiceInputError', { values: { error: event.error } });
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
      console.error('Failed to start speech recognition:', error);
      microphoneError = $_('chat.messageInput.failedToStartVoiceInput');
      isRecording = false;
    }
  }

  // Close dropdowns when clicking outside
  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.plus-menu-container') && !target.closest('.plus-btn')) {
      showPlusMenu = false;
    }
    if (!target.closest('.model-dropdown-container') && !target.closest('.model-selector-btn')) {
      showModelDropdown = false;
    }
  }

  // Close dropdowns on Escape key
  function handleKeyboardEscape(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      if (showPlusMenu) {
        showPlusMenu = false;
        event.preventDefault();
      }
      if (showModelDropdown) {
        showModelDropdown = false;
        event.preventDefault();
      }
    }
  }

  onMount(() => {
    document.addEventListener('click', handleClickOutside);
    document.addEventListener('keydown', handleKeyboardEscape);
    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleKeyboardEscape);
    };
  });
</script>

<!-- Hidden file inputs -->
<input
  type="file"
  bind:this={photoInput}
  onchange={handleFileChange}
  multiple
  style="display: none"
  accept="image/*"
/>
<input
  type="file"
  bind:this={fileInput}
  onchange={handleFileChange}
  multiple
  style="display: none"
  accept="*/*"
/>

<div class="input-area-wrapper">
  <!-- File Attachments Display -->
  {#if attachedFiles.length > 0}
    <div class="file-attachments">
      {#each attachedFiles as file, index}
        <div class="file-pill" class:file-pill-image={isImageFile(file)}>
          {#if isImageFile(file)}
            <button
              class="thumbnail-button"
              onclick={() => openImagePreview(file)}
              aria-label={$_('chat.messageInput.previewImage', { values: { name: file.name } })}
            >
              {#if imageThumbnails[file.name]}
                <img src={imageThumbnails[file.name]} alt={file.name} class="file-thumbnail" />
              {:else}
                <div class="thumbnail-placeholder">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <circle cx="8.5" cy="8.5" r="1.5"></circle>
                    <polyline points="21 15 16 10 5 21"></polyline>
                  </svg>
                </div>
              {/if}
            </button>
          {:else}
            <button
              class="thumbnail-button file-icon-button"
              onclick={() => isTextFile(file) ? openFilePreview(file) : null}
              aria-label={isTextFile(file) ? $_('chat.messageInput.previewFile', { values: { name: file.name } }) : $_('chat.messageInput.fileLabel', { values: { name: file.name } })}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
                <polyline points="14,2 14,8 20,8"></polyline>
              </svg>
            </button>
            <span class="file-name" title={file.name}>{file.name}</span>
            <span class="file-size">{formatFileSize(file.size)}</span>
          {/if}
          <button class="pill-remove-btn" onclick={() => removeFile(index)} aria-label={$_('chat.messageInput.removeFile')}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Main Input Container -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="input-container-main" onclick={(e) => { if (e.target === e.currentTarget || (e.target as HTMLElement).closest('.input-container-main') && !(e.target as HTMLElement).closest('button')) textarea?.focus(); }}>
    <!-- Full-area Textarea -->
    <textarea
      bind:this={textarea}
      bind:value={message}
      oninput={handleInput}
      onkeydown={handleKeyDown}
      placeholder={currentPlaceholder}
      {disabled}
      class="chat-input-textarea"
      class:recording={isRecording}
      aria-label={$_('chat.messageInput.messageInput')}
    ></textarea>

    <!-- Floating Bottom Bar -->
    <div class="input-bottom-bar">
      <!-- Left: Plus button and Model selector -->
      <div class="bottom-bar-left">
        <div class="plus-menu-container">
          <button
            class="input-btn plus-btn"
            onclick={togglePlusMenu}
            aria-label={$_('chat.messageInput.addContent')}
            title={$_('chat.messageInput.addContent')}
            {disabled}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M12 5v14m-7-7h14"/>
            </svg>
          </button>

          {#if showPlusMenu}
            <div class="plus-menu" role="menu" tabindex="-1">
              <button class="menu-item" role="menuitem" onclick={handlePhotoSelect} aria-label={$_('chat.messageInput.addPhotos')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <circle cx="8.5" cy="8.5" r="1.5"></circle>
                  <polyline points="21 15 16 10 5 21"></polyline>
                </svg>
                <span>{$_('chat.messageInput.addPhotos')}</span>
              </button>
              <button class="menu-item" role="menuitem" onclick={handleFileSelect} aria-label={$_('chat.messageInput.addFiles')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
                  <polyline points="14,2 14,8 20,8"></polyline>
                </svg>
                <span>{$_('chat.messageInput.addFiles')}</span>
              </button>
            </div>
          {/if}
        </div>

        <div class="model-dropdown-container">
          <button
            class="selector-btn model-selector-btn"
            onclick={() => { showModelDropdown = !showModelDropdown; showPlusMenu = false; }}
            title={$_('chat.messageInput.selectModel')}
            aria-label={$_('chat.messageInput.selectModel')}
            aria-expanded={showModelDropdown}
          >
            <div class="model-icon">
              {#if selectedProvider}
                {@const providerIcon = getIconForTheme(providers.find(p => p.key === selectedProvider))}
                {#if providerIcon}
                  <img src={providerIcon} alt="" aria-hidden="true" class="provider-icon-img" />
                {:else}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <circle cx="12" cy="12" r="10"/>
                  </svg>
                {/if}
              {:else}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M12 16v-4"/>
                  <path d="M12 8h.01"/>
                </svg>
              {/if}
            </div>
            <span class="selector-label model-caption">{selectedModel || $_('chat.messageInput.selectModelFallback')}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="dropdown-arrow" class:open={showModelDropdown} aria-hidden="true">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>

          {#if showModelDropdown}
            <div class="model-menu" role="menu" tabindex="-1">
              {#if loadingModels}
                <div class="dropdown-loading">
                  <div class="loading-spinner"></div>
                  <span>{$_('chat.messageInput.loadingModels')}</span>
                </div>
              {:else if modelsError}
                <div class="dropdown-error">{modelsError}</div>
              {:else}
                {#each providers as provider}
                  <div class="provider-section">
                    <div class="provider-header">
                      <div class="provider-icon">
                        <img src={getIconForTheme(provider)} alt={provider.name} aria-hidden="true" class="provider-icon-img" />
                      </div>
                      <span class="provider-name">{provider.name}</span>
                    </div>
                    <div class="provider-models">
                      {#each provider.models as model}
                        <button
                          class="menu-item model-option"
                          role="menuitem"
                          class:selected={selectedModel === model.name}
                          onclick={() => selectModel(provider, model)}
                          aria-label={model.name}
                        >
                          <span class="model-name">{model.name}</span>
                          <div class="model-capabilities">
                            {#if model.supports_vision}
                                <svg class="capability-icon active" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                                  <circle cx="12" cy="12" r="3"/>
                                </svg>
                            {/if}
                          </div>
                        </button>
                      {/each}
                    </div>
                  </div>
                {/each}
              {/if}
            </div>
          {/if}
        </div>

        <button
          class="toggle-btn"
          class:active={webSearchEnabled}
          onclick={onWebSearchToggle}
          title={webSearchEnabled ? $_('chat.messageInput.disableWebSearch') : $_('chat.messageInput.enableWebSearch')}
          aria-label={webSearchEnabled ? $_('chat.messageInput.disableWebSearch') : $_('chat.messageInput.enableWebSearch')}
          aria-pressed={webSearchEnabled}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/>
            <path d="M2 12h20"/>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
          </svg>
          {#if webSearchEnabled}
            <span class="toggle-label">{$_('chat.messageInput.search')}</span>
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
          aria-label={isRecording ? $_('chat.messageInput.stopRecording') : $_('chat.messageInput.voiceInput')}
          title={isRecording ? $_('chat.messageInput.stopRecording') : $_('chat.messageInput.voiceInput')}
          aria-pressed={isRecording}
          {disabled}
        >
          {#if isRecording}
            <!-- Filled circle during recording -->
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
              <circle cx="12" cy="12" r="8"/>
            </svg>
          {:else}
            <!-- Microphone icon when idle -->
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <path d="M12 19v4"/>
              <path d="M8 23h8"/>
            </svg>
          {/if}
        </button>

        <button
          class="input-btn send-btn"
          onclick={handleSend}
          disabled={disabled || (!message.trim() && attachedFiles.length === 0)}
          aria-label={$_('chat.messageInput.sendMessage')}
          title={$_('chat.messageInput.sendMessageTitle')}
        >
          {#if disabled}
            <svg class="spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <circle cx="12" cy="12" r="10" opacity="0.25"></circle>
              <path d="M12 2a10 10 0 0 1 10 10" opacity="0.75"></path>
            </svg>
          {:else}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M22 2L11 13"/>
              <path d="M22 2L15 22L11 13L2 9L22 2Z"/>
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
    onkeydown={(e) => e.key === 'Escape' && closeFilePreview()}
    tabindex="-1"
  >
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="preview-modal" role="document" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
      <div class="preview-header">
        <div class="preview-info">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
            <polyline points="14,2 14,8 20,8"></polyline>
          </svg>
          <span class="preview-name">{currentPreviewFile.name}</span>
          <span class="preview-size">{formatFileSize(currentPreviewFile.size)}</span>
        </div>
        <button class="preview-close" onclick={closeFilePreview} aria-label={$_('chat.messageInput.closePreview')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="preview-content">
        <textarea class="preview-textarea" readonly value={filePreviews[currentPreviewFile.name] || ''}></textarea>
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
    onkeydown={(e) => e.key === 'Escape' && closeImagePreview()}
    tabindex="-1"
  >
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="preview-modal image-preview-modal" role="document" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
      <div class="preview-header">
        <div class="preview-info">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <circle cx="8.5" cy="8.5" r="1.5"></circle>
            <polyline points="21 15 16 10 5 21"></polyline>
          </svg>
          <span class="preview-name">{currentPreviewImage.file.name}</span>
          <span class="preview-size">{formatFileSize(currentPreviewImage.file.size)}</span>
        </div>
        <button class="preview-close" onclick={closeImagePreview} aria-label={$_('chat.messageInput.closePreview')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="preview-content image-content">
        <img src={currentPreviewImage.url} alt={currentPreviewImage.file.name} class="preview-image" />
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
    max-width: 900px;
    margin: 0 auto;
  }

  /* ===== Main Input Container - Liquid Glass ===== */
  .input-container-main {
    display: flex;
    flex-direction: column;
    position: relative;
    border-radius: var(--radius-lg);
    background: var(--glass-bg-dark);
    backdrop-filter: blur(var(--glass-blur)) saturate(1.3);
    -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(1.3);
    border: 1px solid var(--glass-stroke-dark);
    box-shadow:
      var(--glass-highlight),
      var(--glass-edge-glow),
      var(--glass-shadow-dark);
    min-height: 2.5rem;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    cursor: text;
  }

  .input-container-main::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(135deg,
      var(--glass-tint-primary) 0%,
      transparent 25%,
      transparent 75%,
      rgba(var(--brand-rgb), 0.03) 100%);
    border-radius: inherit;
    pointer-events: none;
    opacity: 0.5;
    transition: opacity 0.3s ease;
  }

  .input-container-main:focus-within {
    background: color-mix(in oklab, var(--glass-bg-dark) 85%, var(--glass-tint-emphasis));
    border-color: var(--glass-stroke-light);
    box-shadow:
      var(--glass-highlight),
      var(--glass-edge-glow),
      var(--glass-shadow-emphasis);
    transform: translateY(-1px);
  }

  .input-container-main:focus-within::before {
    opacity: 1;
  }

  /* ===== Textarea ===== */
  .chat-input-textarea {
    width: 100%;
    min-height: 1.6rem;
    max-height: 30vh;
    padding: var(--space-sm) var(--space-md);
    padding-bottom: calc(2rem + var(--space-xs));
    border: none !important;
    outline: none !important;
    background: transparent !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
    box-shadow: none !important;
    color: var(--text-primary);
    font-size: 1rem;
    line-height: 1.6;
    resize: none;
    font-family: inherit;
    font-weight: 400;
    overflow-y: hidden;
    transition: color 0.2s ease;
    border-radius: var(--radius-lg);
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
    color: var(--text-secondary);
    opacity: 0.7;
  }

  .chat-input-textarea:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* ===== Floating Bottom Bar ===== */
  .input-bottom-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-xs) var(--space-sm);
    background: transparent;
    border-radius: 0 0 var(--radius-lg) var(--radius-lg);
    gap: var(--space-sm);
    min-height: 2rem;
    z-index: 2;
    pointer-events: none;
  }

  .bottom-bar-left,
  .bottom-bar-right {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
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
    width: 1.75rem;
    height: 1.75rem;
    padding: 0;
    border: none;
    border-radius: var(--radius-full);
    background: var(--btn-tertiary);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    flex-shrink: 0;
    box-shadow: var(--glass-edge-glow);
  }

  .input-btn svg {
    width: 14px;
    height: 14px;
  }

  .input-btn:hover:not(:disabled) {
    background: var(--btn-quaternary);
    color: var(--link-color);
    transform: scale(1.05);
    box-shadow: var(--glass-shadow-light);
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
    background: var(--brand);
    color: white;
    box-shadow:
      0 var(--space-xs) var(--space-lg) rgba(var(--brand-rgb), 0.25),
      inset 0 1px 0 rgba(255, 255, 255, 0.18);
  }

  .input-btn.send-btn:hover:not(:disabled) {
    background: var(--brand-hover);
    color: white;
    transform: scale(1.08);
    box-shadow:
      0 var(--space-sm) var(--space-xl) rgba(var(--brand-rgb), 0.35),
      inset 0 1px 0 rgba(255, 255, 255, 0.22);
  }

  .input-btn.send-btn:disabled {
    background: var(--btn-quaternary);
    color: var(--text-secondary);
    opacity: 0.5;
    box-shadow: none;
  }

  /* Microphone Recording State */
  .input-btn.mic-btn.recording {
    background: linear-gradient(135deg, rgba(220, 38, 38, 0.15) 0%, rgba(185, 28, 28, 0.15) 100%);
    color: rgb(220, 38, 38);
    animation: pulse 1.5s ease-in-out infinite;
    box-shadow:
      0 0 0 0 rgba(220, 38, 38, 0.4),
      0 2px 8px rgba(220, 38, 38, 0.25),
      inset 0 1px 0 rgba(255, 255, 255, 0.15);
  }

  .input-btn.mic-btn.recording:hover {
    background: linear-gradient(135deg, rgba(220, 38, 38, 0.25) 0%, rgba(185, 28, 28, 0.25) 100%);
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
  .selector-btn {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-xs) var(--space-sm);
    border: 1px solid var(--glass-stroke-dark);
    border-radius: var(--radius-md);
    background: var(--btn-secondary);
    color: var(--text-primary);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    white-space: nowrap;
    box-shadow: var(--glass-edge-glow);
  }

  .selector-btn:hover:not(:disabled) {
    background: var(--btn-tertiary);
    border-color: color-mix(in oklab, var(--brand) 30%, transparent);
    color: var(--link-color);
    transform: translateY(-1px);
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
    gap: var(--space-xs);
    min-width: 1.75rem;
    height: 1.75rem;
    padding: 0 var(--space-sm);
    border: 1px solid var(--glass-stroke-dark);
    border-radius: var(--radius-full);
    background: var(--btn-secondary);
    color: var(--text-secondary);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    white-space: nowrap;
    box-shadow: var(--glass-edge-glow);
  }

  .toggle-btn:not(.active) {
    padding: 0;
    width: 1.75rem;
  }

  .toggle-btn svg {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
  }

  .toggle-btn:hover:not(:disabled) {
    background: var(--btn-tertiary);
    border-color: color-mix(in oklab, var(--brand) 30%, transparent);
    color: var(--link-color);
    transform: translateY(-1px);
  }

  .toggle-btn.active {
    background: color-mix(in oklab, var(--glass-bg-dark) 90%, var(--glass-tint-primary));
    border-color: var(--brand);
    color: var(--brand);
    box-shadow: var(--glass-shadow-light);
  }

  .toggle-label {
    font-size: 0.8125rem;
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
  .model-dropdown-container {
    position: relative;
  }

  .plus-menu,
  .model-menu {
    position: absolute;
    bottom: calc(100% + var(--space-sm));
    left: 0;
    z-index: 100;
    min-width: 11rem;
    background: color-mix(in oklab, var(--bg-primary) 85%, var(--btn-secondary));
    backdrop-filter: blur(calc(var(--glass-blur) * 1.5)) saturate(1.5);
    -webkit-backdrop-filter: blur(calc(var(--glass-blur) * 1.5)) saturate(1.5);
    border: 1px solid var(--glass-stroke-light);
    border-radius: var(--radius-lg);
    box-shadow:
      /* Outer glow for floating effect */
      0 0 0 1px var(--glass-edge-glow),
      /* Layered depth shadows */
      0 4px 12px rgba(0, 0, 0, 0.15),
      0 12px 28px rgba(0, 0, 0, 0.2),
      0 20px 48px rgba(0, 0, 0, 0.15),
      /* Inner highlight for glass edge */
      var(--glass-highlight),
      inset 0 0 20px rgba(255, 255, 255, 0.02);
    padding: var(--space-sm);
    overflow: hidden;
  }

  .plus-menu::before,
  .model-menu::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background:
      /* Top highlight edge - liquid refraction */
      linear-gradient(180deg,
        rgba(255, 255, 255, 0.08) 0%,
        transparent 20%),
      /* Subtle brand tint */
      linear-gradient(135deg,
        var(--glass-tint-primary) 0%,
        transparent 40%,
        transparent 60%,
        rgba(var(--brand-rgb), 0.02) 100%);
    border-radius: inherit;
    pointer-events: none;
  }

  .plus-menu::after,
  .model-menu::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(90deg,
      transparent 0%,
      rgba(255, 255, 255, 0.15) 20%,
      rgba(255, 255, 255, 0.2) 50%,
      rgba(255, 255, 255, 0.15) 80%,
      transparent 100%);
    border-radius: inherit;
    pointer-events: none;
  }


  /* ===== Model Menu ===== */
  .model-menu {
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
  }

  .provider-models {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .model-option {
    justify-content: space-between;
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
  }

  .capability-icon.active {
    opacity: 1;
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
    gap: var(--space-sm);
    width: 100%;
  }

  .file-pill {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-xs) var(--space-sm);
    border-radius: var(--radius-md);
    background: var(--glass-bg-dark);
    backdrop-filter: blur(var(--glass-blur));
    -webkit-backdrop-filter: blur(var(--glass-blur));
    border: 1px solid var(--glass-stroke-dark);
    font-size: 0.875rem;
    color: var(--text-primary);
    transition: all 0.2s ease;
    box-shadow: var(--glass-highlight), var(--glass-edge-glow);
  }

  .file-pill-image {
    padding: var(--space-xs);
  }

  .thumbnail-button {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: none;
    background: transparent;
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition: transform 0.15s ease;
  }

  .thumbnail-button:hover {
    transform: scale(1.02);
  }

  .file-thumbnail {
    width: 40px;
    height: 40px;
    object-fit: cover;
    border-radius: var(--radius-sm);
    border: 1px solid var(--glass-stroke-dark);
  }

  .thumbnail-placeholder,
  .file-icon-button {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--btn-tertiary);
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
  }

  .file-name {
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 500;
  }

  .file-size {
    font-size: 0.75rem;
    color: var(--text-secondary);
    flex-shrink: 0;
  }

  .pill-remove-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.125rem;
    height: 1.125rem;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: var(--btn-tertiary);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s ease;
    flex-shrink: 0;
  }

  .pill-remove-btn:hover {
    background: var(--danger-surface);
    color: var(--brand-red);
    transform: scale(1.1);
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
    font-family: 'SF Mono', Monaco, Menlo, monospace;
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
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
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
    .toggle-label {
      display: none;
    }

    .selector-btn {
      padding: var(--space-xs);
      border-radius: 50%;
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
