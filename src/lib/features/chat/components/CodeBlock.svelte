<script lang="ts">
  import { copyToClipboard } from '../../../utils/markdown';

  interface Props {
    code: string;
    language?: string;
  }

  let { code, language = 'plaintext' }: Props = $props();
  let copied = $state(false);

  async function handleCopy() {
    const success = await copyToClipboard(code);
    if (success) {
      copied = true;
      setTimeout(() => {
        copied = false;
      }, 2000);
    }
  }
</script>

<div class="code-block-wrapper">
  <div class="code-header">
    <span class="language-label">{language}</span>
    <button class="copy-button" onclick={handleCopy} aria-label="Copy code">
      {#if copied}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <span>Copied!</span>
      {:else}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
        <span>Copy</span>
      {/if}
    </button>
  </div>
  <pre><code class="hljs language-{language}">{code}</code></pre>
</div>

<style>
  .code-block-wrapper {
    position: relative;
    margin: var(--space-md) 0;
    border-radius: var(--radius-md);
    overflow: hidden;
    background: color-mix(in oklab, var(--glass-bg-dark) 25%, var(--btn-tertiary));
    box-shadow: var(--glass-edge-glow), inset 0 1px 2px rgba(0, 0, 0, 0.04);
  }

  .code-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-sm) var(--space-lg);
    background: color-mix(in oklab, var(--glass-bg-dark) 35%, var(--btn-tertiary));
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }

  .language-label {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    color: var(--text-secondary);
    letter-spacing: 0.05em;
    font-family: 'SF Mono', Monaco, Menlo, monospace;
  }

  .copy-button {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-xs) var(--space-sm);
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .copy-button:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: var(--brand);
    color: var(--brand);
    transform: translateY(-1px);
  }

  .copy-button:active {
    transform: translateY(0);
  }

  .copy-button svg {
    flex-shrink: 0;
  }

  pre {
    margin: 0;
    padding: var(--space-xl);
    overflow-x: auto;
  }

  pre code {
    font-family: 'SF Mono', Monaco, Menlo, 'Ubuntu Mono', monospace;
    font-size: 0.875rem;
    line-height: 1.6;
    background: transparent;
  }

  @media (max-width: 768px) {
    .code-header {
      padding: var(--space-sm) var(--space-md);
    }

    pre {
      padding: var(--space-lg);
    }

    .copy-button span {
      display: none;
    }
  }
</style>
