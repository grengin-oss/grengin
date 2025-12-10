<script lang="ts">
  import { onMount } from 'svelte';
  import type { ProviderInfo, ModelInfo } from '../../../api/models';
  import { getModels } from '../../../api/models';

  interface MessageInputProps {
    onSend: (message: string, files?: File[]) => void;
    disabled?: boolean;
    placeholder?: string;
    rows?: number;
    selectedModel?: string;
    selectedProvider?: string;
    onRemoveModel?: () => void;
    onModelSelect?: (provider: ProviderInfo, model: ModelInfo) => void;
  }

  let { onSend, disabled = false, placeholder = 'Type a message...', rows = 1, selectedModel, selectedProvider, onRemoveModel, onModelSelect }: MessageInputProps = $props();
  
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
  let showFileDropdown = $state(false);
  let showModelDropdown = $state(false);
  let providers = $state<ProviderInfo[]>([]);
  let loadingModels = $state(true);
  let modelsError = $state<string | null>(null);
  const maxRows = 10;
  const minRows = 1;

  function adjustHeight() {
    if (!textarea) return;
    
    // Reset height to auto to get the correct scrollHeight
    textarea.style.height = 'auto';
    
    // Calculate the number of rows based on scrollHeight
    const lineHeight = parseInt(getComputedStyle(textarea).lineHeight);
    const newRows = Math.min(
      Math.max(Math.ceil(textarea.scrollHeight / lineHeight), minRows),
      maxRows
    );
    
    rows = newRows;
    textarea.style.height = `${textarea.scrollHeight}px`;
  }

  function handleInput() {
    adjustHeight();
  }

  function handleKeyDown(event: KeyboardEvent) {
    // Send on Enter (without Shift), allow Shift+Enter for new line
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
    // Allow Shift+Enter to create a new line (default behavior)
  }

  function handleSend() {
    const trimmed = message.trim();
    if ((trimmed || attachedFiles.length > 0) && !disabled) {
      onSend(trimmed, attachedFiles.length > 0 ? attachedFiles : undefined);
      message = '';
      attachedFiles = [];
      rows = minRows;
      if (textarea) {
        textarea.style.height = 'auto';
      }
    }
  }

  function toggleFileDropdown() {
    showFileDropdown = !showFileDropdown;
  }

  // Handle model selection
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

  // Load models on mount
  onMount(() => {
    loadModels();
  });

  function handlePhotoSelect() {
    photoInput?.click();
    showFileDropdown = false;
  }

  function handleFileSelect() {
    fileInput?.click();
    showFileDropdown = false;
  }

  function handleFileChange(event: Event) {
    const target = event.target as HTMLInputElement;
    if (target.files) {
      const newFiles = Array.from(target.files);
      attachedFiles = [...attachedFiles, ...newFiles];
      
      // Generate previews for text files and thumbnails for images
      for (const file of newFiles) {
        
        // Test basic detection
        const isImage = isImageFile(file);
        const isText = isTextFile(file);
       
        if (isTextFile(file)) {
          readFileContent(file).then(content => {
            filePreviews[file.name] = content;
          });
        } else if (isImageFile(file)) {
          
          // Try to load real image immediately
          const reader = new FileReader();
          reader.onload = (e) => {
            const result = e.target?.result as string;
            if (result) {
              imageThumbnails[file.name] = result;
              imageThumbnails = { ...imageThumbnails };
              attachedFiles = [...attachedFiles];
            } 
          };
          reader.onerror = (e) => {
            console.error('❌ FileReader error for:', file.name, e);
          };
          reader.readAsDataURL(file);
        }
      }
    }
    // Reset the input so the same files can be selected again if needed
    target.value = '';
  }

  function isTextFile(file: File): boolean {
    const textTypes = [
      'text/',
      'application/json',
      'application/xml',
      'application/javascript',
      'application/typescript',
      'application/x-yaml',
      'application/yaml'
    ];
    const textExtensions = ['.txt', '.md', '.json', '.xml', '.js', '.ts', '.yaml', '.yml', '.csv', '.log', '.html', '.css', '.py', '.java', '.cpp', '.c', '.h', '.rs', '.go', '.php', '.rb', '.swift', '.kt', '.scala', '.r', '.sql', '.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat', '.cmd'];
    
    return textTypes.some(type => file.type.startsWith(type)) || 
           textExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
  }

  function isImageFile(file: File): boolean {
    const imageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp', 'image/tiff'];
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.tiff', '.tif'];
    
    return imageTypes.includes(file.type) || 
           imageExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
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
    
    // Remove preview if exists
    if (file && filePreviews[file.name]) {
      delete filePreviews[file.name];
      
      // Close preview if this was the current file
      if (currentPreviewFile?.name === file.name) {
        showFilePreview = false;
        currentPreviewFile = null;
      }
    }
    
    // Remove thumbnail if exists
    if (file && imageThumbnails[file.name]) {
      delete imageThumbnails[file.name];
      
      // Close image preview if this was the current image
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

  onMount(() => {
    adjustHeight();
  });
</script>

<div class="message-input-container">
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
  
  <div class="input-wrapper">
    <div class="input-content">
      <!-- File attachments display -->
      {#if attachedFiles.length > 0}
        <div class="file-attachments">
          {#each attachedFiles as file, index}
            <div class="file-attachment-wrapper" class:file-attachment-image={isImageFile(file)}>
              {#if isImageFile(file)}
                <button
                  class="thumbnail-button"
                  onclick={() => openImagePreview(file)}
                  onkeydown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openImagePreview(file);
                    }
                  }}
                  aria-label={`Preview image: ${file.name}`}
                  title="Click to preview image"
                >
                  {#if imageThumbnails[file.name]}
                    <img
                      src={imageThumbnails[file.name]}
                      alt={file.name}
                      class="file-thumbnail"
                    />
                  {:else}
                    <div class="thumbnail-placeholder">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                        <circle cx="8.5" cy="8.5" r="1.5"></circle>
                        <polyline points="21 15 16 10 5 21"></polyline>
                      </svg>
                    </div>
                  {/if}
                </button>
                <button class="remove-file-btn" onclick={() => removeFile(index)} aria-label="Remove file">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              {:else}
                <button
                  class="thumbnail-button"
                  onclick={() => isTextFile(file) ? openFilePreview(file) : null}
                  onkeydown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (isTextFile(file)) openFilePreview(file);
                    }
                  }}
                  aria-label={isTextFile(file) ? `Preview file: ${file.name}` : `File: ${file.name}`}
                  title={isTextFile(file) ? "Click to preview file" : "File attached"}
                >
                  <div class="file-icon-wrapper">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
                      <polyline points="14,2 14,8 20,8"></polyline>
                      <line x1="12" y1="12" x2="12" y2="16"></line>
                      <line x1="10" y1="14" x2="14" y2="14"></line>
                    </svg>
                  </div>
                </button>
                <button class="remove-file-btn" onclick={() => removeFile(index)} aria-label="Remove file">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
      <textarea
        bind:this={textarea}
        bind:value={message}
        oninput={handleInput}
        onkeydown={handleKeyDown}
        {placeholder}
        {disabled}
        {rows}
        class="message-textarea"
        aria-label="Message input"
      ></textarea>
      
      <div class="input-actions">
        <div class="input-left">
          <div style="position: relative;">
            <button class="icon-button attachment-button" onclick={toggleFileDropdown} aria-label="Attach file" title="Attach file (photos or files)">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
              </svg>
            </button>
            
            <!-- File Attachment Dropdown -->
            {#if showFileDropdown}
              <div class="file-dropdown">
                <button class="file-dropdown-item" onclick={handlePhotoSelect}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <circle cx="8.5" cy="8.5" r="1.5"></circle>
                    <polyline points="21 15 16 10 5 21"></polyline>
                  </svg>
                  Add photos
                </button>
                <button class="file-dropdown-item" onclick={handleFileSelect}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
                    <polyline points="14,2 14,8 20,8"></polyline>
                  </svg>
                  Add files
                </button>
              </div>
            {/if}
          </div>
          <div class="input-divider"></div>
          <div class="dropdown">
            <button class="dropdown-button" class:open={showModelDropdown} onclick={() => showModelDropdown = !showModelDropdown}>
              <div class="model-logo">
                {@html selectedProvider ? providers.find(p => p.key === selectedProvider)?.icon || '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7L12 12L22 7L12 2Z"></path><path d="M2 17L12 22L22 17"></path><path d="M2 12L12 17L22 12"></path></svg>' : '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7L12 12L22 7L12 2Z"></path><path d="M2 17L12 22L22 17"></path><path d="M2 12L12 17L22 12"></path></svg>'}
              </div>
              <span class="model-name">{selectedModel || 'Baichuan-M2'}</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="dropdown-arrow">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>
            {#if showModelDropdown}
              <div class="dropdown-menu">
                {#if loadingModels}
                  <div class="dropdown-loading">
                    <div class="loading-spinner"></div>
                    Loading models...
                  </div>
                {:else if modelsError}
                  <div class="dropdown-error">
                    {modelsError}
                  </div>
                {:else}
                  {#each providers as provider}
                    <div class="provider-section">
                      <div class="provider-header">
                        <div class="provider-icon">
                          {@html provider.icon}
                        </div>
                        <span class="provider-name">{provider.name}</span>
                      </div>
                      {#each provider.models as model}
                        <button 
                          class="model-item"
                          class:selected={selectedModel === model.name}
                          onclick={() => selectModel(provider, model)}
                        >
                          {model.name}
                        </button>
                      {/each}
                    </div>
                  {/each}
                {/if}
              </div>
            {/if}
          </div>
        </div>
        
        <div class="input-right">
          <button class="icon-button" aria-label="Voice input" title="Voice input">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
              <line x1="12" y1="19" x2="12" y2="23"></line>
              <line x1="8" y1="23" x2="16" y2="23"></line>
            </svg>
          </button>
          <button 
            class="send-button" 
            onclick={handleSend}
            disabled={disabled || !message.trim()}
            aria-label="Send message"
            title="Send message (Enter)"
          >
            {#if disabled}
              <svg class="spinner" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10" opacity="0.25"></circle>
                <path d="M12 2a10 10 0 0 1 10 10" opacity="0.75"></path>
              </svg>
            {:else}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="19" x2="12" y2="5"></line>
                <polyline points="5 12 12 5 19 12"></polyline>
              </svg>
            {/if}
          </button>
        </div>
      </div>
    </div>
  </div>
  
  <!-- File Preview Modal -->
  {#if showFilePreview && currentPreviewFile}
    <div 
      class="file-preview-overlay" 
      role="dialog"
      aria-modal="true"
      aria-labelledby="file-preview-title"
      onclick={closeFilePreview}
      onkeydown={(e) => {
        if (e.key === 'Escape') {
          closeFilePreview();
        }
      }}
      tabindex="-1"
    >
      <div 
        class="file-preview-modal" 
        role="document"
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => e.stopPropagation()}
      >
        <div class="file-preview-header">
          <div class="file-preview-info">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
              <polyline points="14,2 14,8 20,8"></polyline>
            </svg>
            <span id="file-preview-title" class="file-preview-name">{currentPreviewFile.name}</span>
            <span class="file-preview-size">{formatFileSize(currentPreviewFile.size)}</span>
          </div>
          <button class="file-preview-close" onclick={closeFilePreview} aria-label="Close preview">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div class="file-preview-content">
          <textarea 
            class="file-preview-textarea" 
            readonly 
            value={filePreviews[currentPreviewFile.name] || ''}
            aria-label="File content preview"
          ></textarea>
        </div>
      </div>
    </div>
  {/if}
  
  <!-- Image Preview Modal -->
  {#if showImagePreview && currentPreviewImage}
    <div 
      class="file-preview-overlay" 
      role="dialog"
      aria-modal="true"
      aria-labelledby="image-preview-title"
      onclick={closeImagePreview}
      onkeydown={(e) => {
        if (e.key === 'Escape') {
          closeImagePreview();
        }
      }}
      tabindex="-1"
    >
      <div 
        class="image-preview-modal" 
        role="document"
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => e.stopPropagation()}
      >
        <div class="image-preview-header">
          <div class="image-preview-info">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <circle cx="8.5" cy="8.5" r="1.5"></circle>
              <polyline points="21 15 16 10 5 21"></polyline>
            </svg>
            <span id="image-preview-title" class="image-preview-name">{currentPreviewImage.file.name}</span>
            <span class="image-preview-size">{formatFileSize(currentPreviewImage.file.size)}</span>
          </div>
          <button class="image-preview-close" onclick={closeImagePreview} aria-label="Close image preview">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div class="image-preview-content">
          <img 
            src={currentPreviewImage.url} 
            alt={currentPreviewImage.file.name}
            class="image-preview-img"
          />
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .message-input-container {
    width: 100%;
    max-width: 900px;
    margin: 0 auto;
  }

  .input-wrapper {
    background: var(--btn-secondary);
    border: 1px solid var(--glass-stroke-dark);
    border-radius: 1.5rem;
    transition: all 0.2s ease;
  }

  .input-wrapper:focus-within {
    border-color: var(--glass-stroke-light);
  }

  .input-content {
    padding: 1rem 1.25rem;
  }

  .message-textarea {
    width: 100%;
    min-height: 24px;
    max-height: 200px;
    padding: 0.5rem 0;
    margin-bottom: 0.75rem;
    background: transparent;
    border: none;
    outline: none;
    box-shadow: none;
    color: var(--text-primary);
    font-size: 0.9375rem;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    line-height: 1.5;
    resize: none;
    overflow-y: auto;
    scrollbar-width: none;
  }

  .message-textarea::-webkit-scrollbar {
    display: none;
  }

  .message-textarea::placeholder {
    color: var(--text-secondary);
  }

  .message-textarea:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .file-attachments {
    margin-bottom: 0.75rem;
    display: flex;
    flex-wrap: nowrap;
    gap: 0.5rem;
    overflow-x: auto;
    padding-bottom: 0.25rem;
  }

  .file-attachment-wrapper {
    position: relative;
  }

  .file-attachment-image {
    padding: 0;
    background: transparent;
    border: none;
    gap: 0.5rem;
    align-items: flex-start;
  }

  .file-thumbnail {
    display: block;
    width: 50px;
    height: 50px;
    object-fit: cover;
    border-radius: 0.375rem;
    border: 1px solid var(--glass-stroke-dark);
    cursor: pointer;
    transition: all 0.15s ease;
    flex-shrink: 0;
  }

  .file-thumbnail:hover {
    transform: scale(1.02);
    box-shadow: var(--glass-shadow-light);
  }

  .thumbnail-placeholder {
    width: 50px;
    height: 50px;
    background: var(--btn-tertiary);
    border: 1px solid var(--glass-stroke-dark);
    border-radius: 0.375rem;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
  }

  .file-icon-wrapper {
    width: 50px;
    height: 50px;
    background: var(--btn-tertiary);
    border: 1px solid var(--glass-stroke-dark);
    border-radius: 0.375rem;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
    transition: all 0.15s ease;
  }

  .file-icon-wrapper:hover {
    transform: scale(1.02);
    box-shadow: var(--glass-shadow-light);
  }

  .thumbnail-button {
    padding: 0;
    border: none;
    background: transparent;
    cursor: pointer;
    border-radius: 0.5rem;
    transition: all 0.15s ease;
    flex-shrink: 0;
    display: inline-block;
  }

  .thumbnail-button:hover {
    transform: scale(1.02);
  }

  .thumbnail-button:focus {
    outline: 2px solid var(--brand-ring);
    outline-offset: 2px;
  }

  .remove-file-btn {
    position: absolute;
    top: -6px;
    right: -6px;
    background: var(--bg-primary);
    color: var(--text-secondary);
    border-radius: 50%;
    width: 20px;
    height: 20px;
    padding: 0;
    border: 1px solid var(--glass-stroke-dark);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s ease;
    z-index: 10;
    box-shadow: var(--glass-shadow-light);
  }

  .remove-file-btn:hover {
    background: var(--btn-tertiary);
    color: var(--text-primary);
    transform: scale(1.1);
  }

  .remove-file {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: 50%;
    transition: all 0.15s ease;
    flex-shrink: 0;
  }

  .remove-file:hover {
    background: var(--btn-tertiary);
    color: var(--text-primary);
  }

  .remove-file svg {
    width: 12px;
    height: 12px;
  }

  .loading-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid var(--glass-stroke-dark);
    border-top: 2px solid var(--brand);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto 0.5rem;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  /* Dropdown Styles */
  .file-preview-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    backdrop-filter: blur(4px);
  }

  .file-preview-modal {
    background: var(--bg-primary);
    border: 1px solid var(--glass-stroke-dark);
    border-radius: 1rem;
    box-shadow: var(--glass-shadow-emphasis);
    width: 90vw;
    max-width: 800px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .file-preview-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid var(--glass-stroke-dark);
    background: var(--btn-secondary);
  }

  .file-preview-info {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex: 1;
    color: var(--text-secondary);
  }

  .file-preview-name {
    font-weight: 600;
    color: var(--text-primary);
    font-size: 0.875rem;
  }

  .file-preview-size {
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .file-preview-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: 0.5rem;
    transition: all 0.15s ease;
  }

  .file-preview-close:hover {
    background: var(--btn-tertiary);
    color: var(--text-primary);
  }

  .file-preview-content {
    flex: 1;
    padding: 1rem;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .file-preview-textarea {
    flex: 1;
    width: 100%;
    min-height: 300px;
    padding: 1rem;
    border: 1px solid var(--glass-stroke-dark);
    border-radius: 0.5rem;
    background: var(--btn-secondary);
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
    font-size: 0.875rem;
    line-height: 1.5;
    resize: none;
    outline: none;
    color: var(--text-primary);
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--glass-stroke-light) var(--btn-secondary);
  }

  .file-preview-textarea::-webkit-scrollbar {
    width: 8px;
  }

  .file-preview-textarea::-webkit-scrollbar-track {
    background: var(--btn-secondary);
  }

  .file-preview-textarea::-webkit-scrollbar-thumb {
    background: var(--glass-stroke-light);
    border-radius: 4px;
  }

  .file-preview-textarea::-webkit-scrollbar-thumb:hover {
    background: var(--text-secondary);
  }

  /* Image Preview Modal */
  .image-preview-modal {
    background: var(--bg-primary);
    border: 1px solid var(--glass-stroke-dark);
    border-radius: 1rem;
    box-shadow: var(--glass-shadow-emphasis);
    width: 90vw;
    max-width: 900px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .image-preview-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid var(--glass-stroke-dark);
    background: var(--btn-secondary);
  }

  .image-preview-info {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex: 1;
    color: var(--text-secondary);
  }

  .image-preview-name {
    font-weight: 600;
    color: var(--text-primary);
    font-size: 0.875rem;
  }

  .image-preview-size {
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .image-preview-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: 0.5rem;
    transition: all 0.15s ease;
  }

  .image-preview-close:hover {
    background: var(--btn-tertiary);
    color: var(--text-primary);
  }

  .image-preview-content {
    flex: 1;
    padding: 1rem;
    overflow: auto;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--btn-secondary);
  }

  .image-preview-img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    border-radius: 0.5rem;
    box-shadow: var(--glass-shadow-dark);
  }

  .input-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .input-left,
  .input-right {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .model-name {
    font-weight: 500;
  }

  .input-divider {
    width: 1px;
    height: 24px;
    background: var(--glass-stroke-dark);
    margin: 0 0.25rem;
  }

  .file-dropdown {
    position: absolute;
    bottom: 100%;
    left: 0;
    margin-bottom: 0.5rem;
    background: var(--bg-primary);
    border: 1px solid var(--glass-stroke-dark);
    border-radius: 0.5rem;
    box-shadow: var(--glass-shadow-emphasis);
    z-index: 50;
    min-width: 160px;
    padding: 0.25rem;
  }

  .file-dropdown-item {
    width: 100%;
    padding: 0.75rem 1rem;
    border: none;
    background: transparent;
    text-align: left;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    cursor: pointer;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    color: var(--text-primary);
    transition: background 0.15s ease;
  }

  .file-dropdown-item:hover {
    background: var(--btn-tertiary);
  }

  /* Dropdown Styles */
  .dropdown {
    position: relative;
  }

  .dropdown-button {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--glass-stroke-dark);
    background: var(--btn-secondary);
    border-radius: 0.5rem;
    cursor: pointer;
    transition: all 0.3s ease;
    font-size: 0.875rem;
    color: var(--text-primary);
  }

  .dropdown-button:hover {
    border-color: var(--glass-stroke-light);
    transform: translateY(-1px);
    box-shadow: var(--glass-shadow-light);
  }

  .dropdown-button:active {
    transform: translateY(0);
    box-shadow: none;
  }

  .model-logo {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    color: var(--text-primary);
  }

  .dropdown-arrow {
    color: var(--text-secondary);
    transition: transform 0.2s ease;
  }

  .dropdown-button:hover .dropdown-arrow {
    color: var(--text-primary);
  }

  .dropdown-button.open .dropdown-arrow {
    transform: rotate(180deg);
  }

  .dropdown-menu {
    position: absolute;
    bottom: calc(100% + 0.5rem);
    left: 0;
    background: var(--bg-primary);
    border: 1px solid var(--glass-stroke-dark);
    border-radius: 0.375rem;
    box-shadow: var(--glass-shadow-emphasis);
    z-index: 1000;
    min-width: 100px;
    max-height: 150px;
    overflow-y: auto;
    animation: slideUp 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: scale(0.95) translateY(10px);
    }
    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }

  .dropdown-loading,
  .dropdown-error {
    padding: 1.5rem;
    text-align: center;
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .dropdown-error {
    color: var(--brand-red);
  }

  .loading-spinner {
    width: 20px;
    height: 20px;
    border: 2px solid var(--glass-stroke-dark);
    border-top: 2px solid var(--brand);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto 0.5rem;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  .provider-section {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.25rem;
  }

  .provider-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.5rem;
    background: var(--btn-tertiary);
    border-radius: 0.25rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 0.25rem;
  }

  .provider-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 12px;
    height: 12px;
    flex-shrink: 0;
    color: var(--text-primary);
  }

  .provider-name {
    font-weight: 600;
  }

  .model-item {
    padding: 0.25rem 0.75rem;
    border: none;
    background: transparent;
    text-align: left;
    font-size: 0.7rem;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: 0.25rem;
    transition: all 0.15s ease;
    margin-left: 0.5rem;
  }

  .model-item:hover {
    background: var(--btn-tertiary);
    color: var(--text-primary);
  }

  .model-item.selected {
    background: var(--glass-tint-primary);
    color: var(--brand);
    font-weight: 500;
  }

  .icon-button {
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    padding: 0;
    border: none;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s ease;
    background: transparent;
    color: var(--text-secondary);
  }

  .icon-button:hover {
    background: var(--btn-tertiary);
    color: var(--text-primary);
  }

  .icon-button:active {
    background: var(--btn-quaternary);
  }

  .attachment-button {
    color: var(--brand);
  }

  .attachment-button:hover {
    background: var(--glass-tint-primary);
    color: var(--brand-hover);
  }

  .send-button {
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    padding: 0;
    border: none;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s ease;
    background: var(--btn-tertiary);
    color: var(--text-secondary);
  }

  .send-button:not(:disabled) {
    background: var(--brand);
    color: white;
  }

  .send-button:hover:not(:disabled) {
    background: var(--brand-hover);
    color: white;
  }

  .send-button:active:not(:disabled) {
    background: var(--brand-active);
  }

  .send-button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    color: var(--text-secondary);
  }

  .spinner {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  @media (max-width: 768px) {
    .message-input-container {
      max-width: 100%;
    }

    .input-wrapper {
      padding: 0.5rem 0.875rem;
    }

    .icon-button,
    .send-button {
      width: 28px;
      height: 28px;
    }
  }

  @media (max-width: 480px) {
    .input-wrapper {
      padding: 0.5rem 0.75rem;
    }

    .message-textarea {
      padding: 0.375rem 0.5rem;
      font-size: 0.9375rem;
    }

    .icon-button,
    .send-button {
      width: 26px;
      height: 26px;
    }
  }
</style>
