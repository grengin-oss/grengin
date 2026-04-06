<script lang="ts">
  import { _ } from 'svelte-i18n';
</script>

<div class="typing-indicator" role="status" aria-label={$_('components.typingIndicator')} aria-live="polite">
  <div class="typing-content">
    <div class="typing-dots" aria-hidden="true">
      <span class="dot"></span>
      <span class="dot"></span>
      <span class="dot"></span>
    </div>
  </div>
</div>

<style>
  .typing-indicator {
    display: flex;
    align-items: flex-start;
    margin-bottom: var(--space-xl);
    animation: slideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .typing-content {
    max-width: 80%;
    width: fit-content;
    background: color-mix(in oklab, var(--glass-bg-dark) 60%, var(--btn-secondary));
    backdrop-filter: blur(0.625rem);
    -webkit-backdrop-filter: blur(0.625rem);
    padding: var(--space-lg) var(--space-xl);
    border-radius: var(--radius-lg);
    box-shadow: var(--glass-edge-glow), var(--glass-shadow-light);
  }

  .typing-dots {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .dot {
    width: 8px;
    height: 8px;
    background: var(--text-secondary);
    border-radius: 50%;
    animation: bounce 1.4s infinite ease-in-out;
  }

  .dot:nth-child(1) {
    animation-delay: -0.32s;
  }

  .dot:nth-child(2) {
    animation-delay: -0.16s;
  }

  @keyframes bounce {
    0%, 80%, 100% {
      transform: scale(0.8);
      opacity: 0.5;
    }
    40% {
      transform: scale(1.2);
      opacity: 1;
    }
  }

  @media (max-width: 768px) {
    .typing-content {
      max-width: 90%;
      padding: var(--space-md) var(--space-lg);
    }
  }
</style>
