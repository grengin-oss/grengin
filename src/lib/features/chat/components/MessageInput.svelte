<script lang="ts">
  import { onMount } from 'svelte';

  interface MessageInputProps {
    onSend: (message: string, files?: File[]) => void;
    disabled?: boolean;
    placeholder?: string;
    rows?: number;
    selectedModel?: string;
    onRemoveModel?: () => void;
  }

  let { onSend, disabled = false, placeholder = 'Type a message...', rows = 1, selectedModel, onRemoveModel }: MessageInputProps = $props();
  
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
  let showDropdown = $state(false);
  let rowsState = $state(rows);
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

  function toggleDropdown() {
    showDropdown = !showDropdown;
  }

  function handlePhotoSelect() {
    photoInput?.click();
    showDropdown = false;
  }

  function handleFileSelect() {
    fileInput?.click();
    showDropdown = false;
  }

  function handleFileChange(event: Event) {
    const target = event.target as HTMLInputElement;
    if (target.files) {
      const newFiles = Array.from(target.files);
      attachedFiles = [...attachedFiles, ...newFiles];
      console.log('📁 Files added:', newFiles.length, 'Total files:', attachedFiles.length);
      
      // Generate previews for text files and thumbnails for images
      for (const file of newFiles) {
        console.log('🔍 Processing file:', file.name, file.type, 'Size:', file.size);
        
        // Test basic detection
        const isImage = isImageFile(file);
        const isText = isTextFile(file);
        console.log('📊 File type detection - Image:', isImage, 'Text:', isText);
        
        if (isTextFile(file)) {
          console.log('📄 Processing text file:', file.name);
          readFileContent(file).then(content => {
            filePreviews[file.name] = content;
            console.log('✅ Text content loaded for:', file.name);
          });
        } else if (isImageFile(file)) {
          console.log('🖼️ Image file detected:', file.name);
          
          // Try to load real image immediately
          console.log('🔄 Starting FileReader for:', file.name);
          const reader = new FileReader();
          reader.onload = (e) => {
            const result = e.target?.result as string;
            console.log('✅ FileReader completed for:', file.name, 'Length:', result?.length);
            console.log('📸 Data URL starts with:', result?.substring(0, 100));
            if (result) {
              imageThumbnails[file.name] = result;
              imageThumbnails = { ...imageThumbnails };
              console.log('✅ Real image stored for:', file.name);
              console.log('🗺️ Object now has keys:', Object.keys(imageThumbnails));
              attachedFiles = [...attachedFiles];
              console.log('🔄 UI updated with real image');
            } else {
              console.error('❌ No result from FileReader for:', file.name);
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

  function createImageThumbnail(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      console.log('Creating thumbnail for:', file.name, 'Size:', file.size, 'Type:', file.type);
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        console.log('FileReader completed for:', file.name, 'Result length:', result?.length);
        console.log('Result starts with:', result?.substring(0, 50));
        if (result && result.startsWith('data:image/')) {
          resolve(result);
        } else {
          console.error('Invalid image data for:', file.name);
          reject(new Error('Invalid image data'));
        }
      };
      reader.onerror = (e) => {
        console.error('FileReader error for:', file.name, e);
        reject(e);
      };
      console.log('Starting FileReader for:', file.name);
      reader.readAsDataURL(file);
    });
  }

  function removeFile(index: number) {
    const file = attachedFiles[index];
    attachedFiles = attachedFiles.filter((_, i) => i !== index);
    
    // Remove preview if exists
    if (file && filePreviews.has(file.name)) {
      filePreviews.delete(file.name);
      
      // Close preview if this was the current file
      if (currentPreviewFile?.name === file.name) {
        showFilePreview = false;
        currentPreviewFile = null;
      }
    }
    
    // Remove thumbnail if exists
    if (file && imageThumbnails.has(file.name)) {
      imageThumbnails.delete(file.name);
      
      // Close image preview if this was the current image
      if (currentPreviewImage?.file.name === file.name) {
        showImagePreview = false;
        currentPreviewImage = null;
      }
    }
  }

  function openFilePreview(file: File) {
    if (filePreviews.has(file.name)) {
      currentPreviewFile = file;
      showFilePreview = true;
    }
  }

  function openImagePreview(file: File) {
    if (imageThumbnails.has(file.name)) {
      currentPreviewImage = { file, url: imageThumbnails.get(file.name)! };
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
            <div class:file-attachment-image={isImageFile(file)}>
              {#if isImageFile(file)}
                <div style="position: relative;">
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
                        style="display: block !important; width: 50px; height: 50px; object-fit: cover; border-radius: 0.375rem; border: 1px solid #e5e7eb;"
                        onerror={(e) => {
                          console.error('Image failed to load:', file.name, 'Src:', imageThumbnails[file.name]?.substring(0, 50));
                        }}
                        onload={() => {
                          console.log('✅ Image loaded successfully:', file.name);
                        }}
                      />
                    {:else}
                      <div style="width: 50px; height: 50px; background: #ff0000; border: 2px solid #000; border-radius: 0.375rem; display: flex; flex-direction: column; align-items: center; justify-content: center; color: white; font-size: 8px; text-align: center; padding: 2px; font-weight: bold;">
                        NO THUMB
                        <div style="font-size: 6px; margin-top: 1px;">
                          {Object.keys(imageThumbnails).length}
                        </div>
                      </div>
                    {/if}
                  </button>
                  <button class="remove-file" style="position: absolute; top: -6px; right: -6px; background: white; border: 1px solid #e5e7eb; border-radius: 50%; width: 20px; height: 20px; padding: 2px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); z-index: 10;" onclick={() => removeFile(index)} aria-label="Remove file">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#374151" stroke-width="2">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </button>
                </div>
              {:else}
                <div style="position: relative;">
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
                    <div style="width: 50px; height: 50px; background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); border: 1px solid #e2e8f0; border-radius: 0.375rem; display: flex; align-items: center; justify-content: center; transition: all 0.15s ease; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);"
                         onmouseover={(e) => { e.currentTarget.style.transform = 'scale(1.02)'; e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.1)'; }}
                         onmouseout={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.05)'; }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="1.5">
                        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
                        <polyline points="14,2 14,8 20,8"></polyline>
                        <line x1="12" y1="12" x2="12" y2="16"></line>
                        <line x1="10" y1="14" x2="14" y2="14"></line>
                      </svg>
                    </div>
                  </button>
                  <button class="remove-file" style="position: absolute; top: -6px; right: -6px; background: white; border: 1px solid #e5e7eb; border-radius: 50%; width: 20px; height: 20px; padding: 2px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); z-index: 10;" onclick={() => removeFile(index)} aria-label="Remove file">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#374151" stroke-width="2">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </button>
                </div>
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
            <button class="icon-button" onclick={toggleDropdown} aria-label="Attach file" title="Attach file">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
              </svg>
            </button>
            
            <!-- Dropdown Menu -->
            {#if showDropdown}
              <div style="position: absolute; bottom: 100%; left: 0; margin-bottom: 0.5rem; background: white; border: 1px solid #e5e7eb; border-radius: 0.5rem; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1); z-index: 50; min-width: 160px; padding: 0.25rem;">
                <button 
                  onclick={handlePhotoSelect}
                  style="width: 100%; padding: 0.75rem 1rem; border: none; background: none; text-align: left; display: flex; align-items: center; gap: 0.75rem; cursor: pointer; border-radius: 0.375rem; font-size: 0.875rem; color: #374151; transition: background 0.15s;"
                  onmouseover={(e) => { e.currentTarget.style.background = '#f9fafb'; }}
                  onmouseout={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <circle cx="8.5" cy="8.5" r="1.5"></circle>
                    <polyline points="21 15 16 10 5 21"></polyline>
                  </svg>
                  Add photos
                </button>
                <button 
                  onclick={handleFileSelect}
                  style="width: 100%; padding: 0.75rem 1rem; border: none; background: none; text-align: left; display: flex; align-items: center; gap: 0.75rem; cursor: pointer; border-radius: 0.375rem; font-size: 0.875rem; color: #374151; transition: background 0.15s;"
                  onmouseover={(e) => { e.currentTarget.style.background = '#f9fafb'; }}
                  onmouseout={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
                    <polyline points="14,2 14,8 20,8"></polyline>
                  </svg>
                  Add files
                </button>
              </div>
            {/if}
          </div>
          <button class="icon-button" aria-label="Add link" title="Add link">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
            </svg>
          </button>
          <div class="model-tile">
            <span class="model-name">{selectedModel || 'Baichuan-M2'}</span>
            <button class="remove-model" onclick={onRemoveModel} title="Remove model">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
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
            value={filePreviews.get(currentPreviewFile.name) || ''}
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
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 1.5rem;
    transition: all 0.2s ease;
  }

  .input-wrapper:focus-within {
    border-color: #d1d5db;
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
    color: #374151;
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
    color: #9ca3af;
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

  .file-attachment {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    color: #374151;
    flex-shrink: 0;
    max-width: 200px;
  }

  .file-attachment-image {
    padding: 0;
    background: transparent;
    border: none;
    gap: 0.5rem;
    align-items: flex-start;
  }

  .file-thumbnail {
    width: 50px;
    height: 50px;
    object-fit: cover;
    border-radius: 0.375rem;
    cursor: pointer;
    transition: all 0.15s ease;
    flex-shrink: 0;
  }

  .file-thumbnail:hover {
    transform: scale(1.02);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .thumbnail-button {
    padding: 0;
    border: none;
    background: transparent;
    cursor: pointer;
    border-radius: 0.5rem;
    transition: all 0.15s ease;
    flex-shrink: 0;
    position: relative;
    display: inline-block;
  }

  .thumbnail-button:hover {
    transform: scale(1.02);
  }

  .thumbnail-button:focus {
    outline: 2px solid #3b82f6;
    outline-offset: 2px;
  }

  .file-attachment-image .remove-file {
    position: absolute;
    top: -6px;
    right: -6px;
    background: #1f2937;
    color: white;
    border-radius: 50%;
    width: 20px;
    height: 20px;
    padding: 0;
    border: 2px solid white;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s ease;
    z-index: 10;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .file-attachment-image .remove-file:hover {
    background: #374151;
    transform: scale(1.1);
  }

  .file-name {
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }

  .file-size {
    font-size: 0.75rem;
    color: #6b7280;
    flex-shrink: 0;
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
    color: #6b7280;
    cursor: pointer;
    border-radius: 50%;
    transition: all 0.15s ease;
    flex-shrink: 0;
  }

  .remove-file:hover {
    background: #d1d5db;
    color: #374151;
  }

  .remove-file svg {
    width: 12px;
    height: 12px;
  }

  .preview-file {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    padding: 0;
    border: none;
    background: transparent;
    color: #3b82f6;
    cursor: pointer;
    border-radius: 50%;
    transition: all 0.15s ease;
    flex-shrink: 0;
  }

  .preview-file:hover {
    background: #dbeafe;
    color: #1d4ed8;
  }

  /* File Preview Modal */
  .file-preview-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    backdrop-filter: blur(4px);
  }

  .file-preview-modal {
    background: white;
    border-radius: 1rem;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
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
    border-bottom: 1px solid #e5e7eb;
    background: #f9fafb;
  }

  .file-preview-info {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex: 1;
  }

  .file-preview-name {
    font-weight: 600;
    color: #111827;
    font-size: 0.875rem;
  }

  .file-preview-size {
    font-size: 0.75rem;
    color: #6b7280;
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
    color: #6b7280;
    cursor: pointer;
    border-radius: 0.5rem;
    transition: all 0.15s ease;
  }

  .file-preview-close:hover {
    background: #e5e7eb;
    color: #374151;
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
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    background: #f9fafb;
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
    font-size: 0.875rem;
    line-height: 1.5;
    resize: none;
    outline: none;
    color: #374151;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: #d1d5db #f9fafb;
  }

  .file-preview-textarea::-webkit-scrollbar {
    width: 8px;
  }

  .file-preview-textarea::-webkit-scrollbar-track {
    background: #f9fafb;
  }

  .file-preview-textarea::-webkit-scrollbar-thumb {
    background: #d1d5db;
    border-radius: 4px;
  }

  .file-preview-textarea::-webkit-scrollbar-thumb:hover {
    background: #9ca3af;
  }

  /* Image Preview Modal */
  .image-preview-modal {
    background: white;
    border-radius: 1rem;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
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
    border-bottom: 1px solid #e5e7eb;
    background: #f9fafb;
  }

  .image-preview-info {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex: 1;
  }

  .image-preview-name {
    font-weight: 600;
    color: #111827;
    font-size: 0.875rem;
  }

  .image-preview-size {
    font-size: 0.75rem;
    color: #6b7280;
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
    color: #6b7280;
    cursor: pointer;
    border-radius: 0.5rem;
    transition: all 0.15s ease;
  }

  .image-preview-close:hover {
    background: #e5e7eb;
    color: #374151;
  }

  .image-preview-content {
    flex: 1;
    padding: 1rem;
    overflow: auto;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f9fafb;
  }

  .image-preview-img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    border-radius: 0.5rem;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
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

  .model-tile {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    background: #e5e7eb;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    color: #374151;
  }

  .model-name {
    font-weight: 500;
  }

  .remove-model {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    padding: 0;
    border: none;
    background: transparent;
    color: #6b7280;
    cursor: pointer;
    border-radius: 50%;
    transition: all 0.15s ease;
  }

  .remove-model:hover {
    background: #d1d5db;
    color: #374151;
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
    color: #6b7280;
  }

  .icon-button:hover {
    background: #e5e7eb;
    color: #374151;
  }

  .icon-button:active {
    background: #d1d5db;
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
    background: #e5e7eb;
    color: #6b7280;
  }

  .send-button:not(:disabled) {
    background: #000000;
    color: #ffffff;
  }

  .send-button:hover:not(:disabled) {
    background: #1a1a1a;
    color: #ffffff;
  }

  .send-button:active:not(:disabled) {
    background: #333333;
  }

  .send-button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    color: #6b7280;
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
