<script lang="ts">
  import { onMount } from 'svelte';
  import type { ProviderInfo, ModelInfo } from '../../../api/models';
  import { getModels } from '../../../api/models';

  interface MessageInputProps {
    onSend: (message: string, files?: File[]) => void;
    disabled?: boolean;
    placeholder?: string;
    selectedModel?: string;
    selectedProvider?: string;
    onModelSelect?: (provider: ProviderInfo, model: ModelInfo) => void;
  }

  let { onSend, disabled = false, placeholder = 'Ask anything', selectedModel, selectedProvider, onModelSelect }: MessageInputProps = $props();

  let textarea: HTMLTextAreaElement;
  let fileInput: HTMLInputElement;
  let photoInput: HTMLInputElement;
  let message = $state('');
  let attachedFiles = $state<File[]>([]);
  let filePreviews = $state<Record<string, string>>({});
  let imageThumbnails = $state<Record<string, string>>({});
  let showFilePreview = $state(false);
  let showImagePreview = $state(false);
  let currentPreviewFile = $state<File | null>(null);
  let currentPreviewImage = $state<{ file: File; url: string } | null>(null);
  let showPlusMenu = $state(false);
  let showModelDropdown = $state(false);
  let providers = $state<ProviderInfo[]>([]);
  let loadingModels = $state(true);
  let modelsError = $state<string | null>(null);

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

  function handleSend() {
    const trimmed = message.trim();
    if ((trimmed || attachedFiles.length > 0) && !disabled) {
      onSend(trimmed, attachedFiles.length > 0 ? attachedFiles : undefined);
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

  // Load models from API
  async function loadModels() {
    // try {
    //   loadingModels = true;
    //   modelsError = null;
    //   const data = await getModels();
    //   providers = data.providers;
    // } catch (error) {
    //   modelsError = error instanceof Error ? error.message : 'Failed to load models';
    //   // add this dummy json 
    providers = [{
        key: 'openai',
        name: 'OpenAI',
        icon: '<svg width="20" height="20" viewBox="0 0 41 41" fill="none" xmlns="http://www.w3.org/2000/svg" stroke-width="1.5" class="text-text-primary shrink-0 icon-md"><path d="M37.5324 16.8707C37.9808 15.5241 38.1363 14.0974 37.9886 12.6859C37.8409 11.2744 37.3934 9.91076 36.676 8.68622C35.6126 6.83404 33.9882 5.3676 32.0373 4.4985C30.0864 3.62941 27.9098 3.40259 25.8215 3.85078C24.8796 2.7893 23.7219 1.94125 22.4257 1.36341C21.1295 0.785575 19.7249 0.491269 18.3058 0.500197C16.1708 0.495044 14.0893 1.16803 12.3614 2.42214C10.6335 3.67624 9.34853 5.44666 8.6917 7.47815C7.30085 7.76286 5.98686 8.3414 4.8377 9.17505C3.68854 10.0087 2.73073 11.0782 2.02839 12.312C0.956464 14.1591 0.498905 16.2988 0.721698 18.4228C0.944492 20.5467 1.83612 22.5449 3.268 24.1293C2.81966 25.4759 2.66413 26.9026 2.81182 28.3141C2.95951 29.7256 3.40701 31.0892 4.12437 32.3138C5.18791 34.1659 6.8123 35.6322 8.76321 36.5013C10.7141 37.3704 12.8907 37.5973 14.9789 37.1492C15.9208 38.2107 17.0786 39.0587 18.3747 39.6366C19.6709 40.2144 21.0755 40.5087 22.4946 40.4998C24.6307 40.5054 26.7133 39.8321 28.4418 38.5772C30.1704 37.3223 31.4556 35.5506 32.1119 33.5179C33.5027 33.2332 34.8167 32.6547 35.9659 31.821C37.115 30.9874 38.0728 29.9178 38.7752 28.684C39.8458 26.8371 40.3023 24.6979 40.0789 22.5748C39.8556 20.4517 38.9639 18.4544 37.5324 16.8707ZM22.4978 37.8849C20.7443 37.8874 19.0459 37.2733 17.6994 36.1501C17.7601 36.117 17.8666 36.0586 17.936 36.0161L25.9004 31.4156C26.1003 31.3019 26.2663 31.137 26.3813 30.9378C26.4964 30.7386 26.5563 30.5124 26.5549 30.2825V19.0542L29.9213 20.998C29.9389 21.0068 29.9541 21.0198 29.9656 21.0359C29.977 21.052 29.9842 21.0707 29.9867 21.0902V30.3889C29.9842 32.375 29.1946 34.2791 27.7909 35.6841C26.3872 37.0892 24.4838 37.8806 22.4978 37.8849ZM6.39227 31.0064C5.51397 29.4888 5.19742 27.7107 5.49804 25.9832C5.55718 26.0187 5.66048 26.0818 5.73461 26.1244L13.699 30.7248C13.8975 30.8408 14.1233 30.902 14.3532 30.902C14.583 30.902 14.8088 30.8408 15.0073 30.7248L24.731 25.1103V28.9979C24.7321 29.0177 24.7283 29.0376 24.7199 29.0556C24.7115 29.0736 24.6988 29.0893 24.6829 29.1012L16.6317 33.7497C14.9096 34.7416 12.8643 35.0097 10.9447 34.4954C9.02506 33.9811 7.38785 32.7263 6.39227 31.0064ZM4.29707 13.6194C5.17156 12.0998 6.55279 10.9364 8.19885 10.3327C8.19885 10.4013 8.19491 10.5228 8.19491 10.6071V19.808C8.19351 20.0378 8.25334 20.2638 8.36823 20.4629C8.48312 20.6619 8.64893 20.8267 8.84863 20.9404L18.5723 26.5542L15.206 28.4979C15.1894 28.5089 15.1703 28.5155 15.1505 28.5173C15.1307 28.5191 15.1107 28.516 15.0924 28.5082L7.04046 23.8557C5.32135 22.8601 4.06716 21.2235 3.55289 19.3046C3.03862 17.3858 3.30624 15.3413 4.29707 13.6194ZM31.955 20.0556L22.2312 14.4411L25.5976 12.4981C25.6142 12.4872 25.6333 12.4805 25.6531 12.4787C25.6729 12.4769 25.6928 12.4801 25.7111 12.4879L33.7631 17.1364C34.9967 17.849 36.0017 18.8982 36.6606 20.1613C37.3194 21.4244 37.6047 22.849 37.4832 24.2684C37.3617 25.6878 36.8382 27.0432 35.9743 28.1759C35.1103 29.3086 33.9415 30.1717 32.6047 30.6641C32.6047 30.5947 32.6047 30.4733 32.6047 30.3889V21.188C32.6066 20.9586 32.5474 20.7328 32.4332 20.5338C32.319 20.3348 32.154 20.1698 31.955 20.0556ZM35.3055 15.0128C35.2464 14.9765 35.1431 14.9142 35.069 14.8717L27.1045 10.2712C26.906 10.1554 26.6803 10.0943 26.4504 10.0943C26.2206 10.0943 25.9948 10.1554 25.7963 10.2712L16.0726 15.8858V11.9982C16.0715 11.9783 16.0753 11.9585 16.0837 11.9405C16.0921 11.9225 16.1048 11.9068 16.1207 11.8949L24.1719 7.25025C25.4053 6.53903 26.8158 6.19376 28.2383 6.25482C29.6608 6.31589 31.0364 6.78077 32.2044 7.59508C33.3723 8.40939 34.2842 9.53945 34.8334 10.8531C35.3826 12.1667 35.5464 13.6095 35.3055 15.0128ZM14.2424 21.9419L10.8752 19.9981C10.8576 19.9893 10.8423 19.9763 10.8309 19.9602C10.8195 19.9441 10.8122 19.9254 10.8098 19.9058V10.6071C10.8107 9.18295 11.2173 7.78848 11.9819 6.58696C12.7466 5.38544 13.8377 4.42659 15.1275 3.82264C16.4173 3.21869 17.8524 2.99464 19.2649 3.1767C20.6775 3.35876 22.0089 3.93941 23.1034 4.85067C23.0427 4.88379 22.937 4.94215 22.8668 4.98473L14.9024 9.58517C14.7025 9.69878 14.5366 9.86356 14.4215 10.0626C14.3065 10.2616 14.2466 10.4877 14.2479 10.7175L14.2424 21.9419ZM16.071 17.9991L20.4018 15.4978L24.7325 17.9975V22.9985L20.4018 25.4983L16.071 22.9985V17.9991Z" fill="currentColor"></path></svg>',
        models: [
          {
            key: 'gpt-4o',
            name: 'GPT-4o',
            context_window: 128000,
            max_output_tokens: 16384,
            supports_streaming: true,
            supports_tools: true,
            supports_vision: true,
            pricing: { input: 0.0025, output: 0.01 },
          },
          {
            key: 'gpt-5.1',
            name: 'GPT-4 Turbo',
            context_window: 128000,
            max_output_tokens: 4096,
            supports_streaming: true,
            supports_tools: true,
            supports_vision: true,
            pricing: { input: 0.01, output: 0.03 },
          },
          {
            key: 'gpt-4',
            name: 'GPT-4',
            context_window: 8192,
            max_output_tokens: 4096,
            supports_streaming: true,
            supports_tools: true,
            supports_vision: false,
            pricing: { input: 0.03, output: 0.06 },
          },
          {
            key: 'gpt-3.5-turbo',
            name: 'GPT-3.5 Turbo',
            context_window: 16385,
            max_output_tokens: 4096,
            supports_streaming: true,
            supports_tools: true,
            supports_vision: false,
            pricing: { input: 0.0005, output: 0.0015 },
          },
        ],
      }];
      loadingModels = false;
    //   modelsError = null; // Clear error since we have fallback data 
    // } finally {
    //   loadingModels = false;
    // }
  }

  onMount(() => {
    loadModels();
    autoResize();
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
    target.value = '';
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

  onMount(() => {
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
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
              aria-label={`Preview image: ${file.name}`}
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
              aria-label={isTextFile(file) ? `Preview file: ${file.name}` : `File: ${file.name}`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
                <polyline points="14,2 14,8 20,8"></polyline>
              </svg>
            </button>
            <span class="file-name" title={file.name}>{file.name}</span>
            <span class="file-size">{formatFileSize(file.size)}</span>
          {/if}
          <button class="pill-remove-btn" onclick={() => removeFile(index)} aria-label="Remove file">
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
      {placeholder}
      {disabled}
      class="chat-input-textarea"
      aria-label="Message input"
    ></textarea>

    <!-- Floating Bottom Bar -->
    <div class="input-bottom-bar">
      <!-- Left: Plus button and Model selector -->
      <div class="bottom-bar-left">
        <div class="plus-menu-container">
          <button
            class="input-btn plus-btn"
            onclick={togglePlusMenu}
            aria-label="Add content"
            title="Add content"
            {disabled}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 5v14m-7-7h14"/>
            </svg>
          </button>

          {#if showPlusMenu}
            <div class="plus-menu">
              <button class="plus-menu-item" onclick={handlePhotoSelect}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <circle cx="8.5" cy="8.5" r="1.5"></circle>
                  <polyline points="21 15 16 10 5 21"></polyline>
                </svg>
                <span>Add photos</span>
              </button>
              <button class="plus-menu-item" onclick={handleFileSelect}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
                  <polyline points="14,2 14,8 20,8"></polyline>
                </svg>
                <span>Add files</span>
              </button>
            </div>
          {/if}
        </div>

        <div class="model-dropdown-container">
          <button
            class="toggle-btn model-selector-btn active"
            onclick={() => { showModelDropdown = !showModelDropdown; showPlusMenu = false; }}
            title="Select model"
            aria-label="Select model"
          >
            <div class="model-icon">
              {#if selectedProvider}
                {@html providers.find(p => p.key === selectedProvider)?.icon || '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>'}
              {:else}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M12 16v-4"/>
                  <path d="M12 8h.01"/>
                </svg>
              {/if}
            </div>
            <span class="toggle-label model-caption">{selectedModel || 'Select Model'}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="dropdown-arrow" class:open={showModelDropdown}>
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>

          {#if showModelDropdown}
            <div class="model-menu">
              {#if loadingModels}
                <div class="dropdown-loading">
                  <div class="loading-spinner"></div>
                  <span>Loading models...</span>
                </div>
              {:else if modelsError}
                <div class="dropdown-error">{modelsError}</div>
              {:else}
                {#each providers as provider}
                  <div class="provider-section">
                    <div class="provider-header">
                      <div class="provider-icon">
                        {@html provider.icon}
                      </div>
                      <span class="provider-name">{provider.name}</span>
                    </div>
                    <div class="provider-models">
                      {#each provider.models as model}
                        <button
                          class="model-option"
                          class:selected={selectedModel === model.name}
                          onclick={() => selectModel(provider, model)}
                        >
                          <span class="model-name">{model.name}</span>
                          <div class="model-capabilities">
                            {#if model.supports_vision}
                              <svg class="capability-icon active" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-label="Vision capable">
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
      </div>

      <!-- Center: Spacer -->
      <div class="bottom-bar-center"></div>

      <!-- Right: Mic and Send -->
      <div class="bottom-bar-right">
        <button class="input-btn mic-btn" aria-label="Voice input" title="Voice input" {disabled}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <path d="M12 19v4"/>
            <path d="M8 23h8"/>
          </svg>
        </button>

        <button
          class="input-btn send-btn"
          onclick={handleSend}
          disabled={disabled || (!message.trim() && attachedFiles.length === 0)}
          aria-label="Send message"
          title="Send message (Enter)"
        >
          {#if disabled}
            <svg class="spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" opacity="0.25"></circle>
              <path d="M12 2a10 10 0 0 1 10 10" opacity="0.75"></path>
            </svg>
          {:else}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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
        <button class="preview-close" onclick={closeFilePreview} aria-label="Close preview">
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
        <button class="preview-close" onclick={closeImagePreview} aria-label="Close preview">
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
    padding: var(--space-xs) var(--space-md);
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
    border-radius: 50%;
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

  /* ===== Toggle Button (Model Selector) ===== */
  .toggle-btn {
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

  .toggle-label {
    max-width: 8rem;
    overflow: hidden;
    text-overflow: ellipsis;
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
    background: var(--glass-bg-dark);
    backdrop-filter: blur(var(--glass-blur)) saturate(1.3);
    -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(1.3);
    border: 1px solid var(--glass-stroke-light);
    border-radius: var(--radius-md);
    box-shadow:
      var(--glass-highlight),
      var(--glass-edge-glow),
      var(--glass-shadow-emphasis);
    padding: var(--space-xs);
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
    background: linear-gradient(135deg,
      var(--glass-tint-primary) 0%,
      transparent 30%);
    border-radius: inherit;
    pointer-events: none;
  }

  .plus-menu-item {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    width: 100%;
    padding: var(--space-sm) var(--space-md);
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-primary);
    font-size: 0.875rem;
    font-weight: 400;
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: left;
  }

  .plus-menu-item:hover {
    background: var(--btn-tertiary);
    color: var(--link-color);
  }

  .plus-menu-item svg {
    flex-shrink: 0;
    color: var(--text-secondary);
    transition: color 0.2s ease;
  }

  .plus-menu-item:hover svg {
    color: var(--link-color);
  }

  .plus-menu-item span {
    flex: 1;
  }

  /* ===== Model Menu ===== */
  .model-menu {
    min-width: 14rem;
    max-height: 20rem;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--glass-stroke-light) transparent;
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
    width: 12px;
    height: 12px;
    flex-shrink: 0;
  }

  .provider-icon :global(svg) {
    width: 12px;
    height: 12px;
    opacity: 0.7;
  }

  .provider-models {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
  }

  .model-option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-md);
    width: 100%;
    padding: var(--space-sm) var(--space-md);
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-primary);
    font-size: 0.875rem;
    font-weight: 400;
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: left;
  }

  .model-option:hover {
    background: var(--btn-tertiary);
    color: var(--link-color);
  }

  .model-option.selected {
    background: var(--brand);
    color: white;
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

    .toggle-label {
      display: none;
    }

    .toggle-btn {
      padding: var(--space-xs);
      border-radius: 50%;
      gap: 0;
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
