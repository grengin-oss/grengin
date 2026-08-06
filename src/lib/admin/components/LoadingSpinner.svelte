<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  interface Props {
    size?: 'sm' | 'md' | 'lg';
    text?: string;
  }

  let { size = 'md', text }: Props = $props();
</script>

<div class="loading-spinner" role="status" aria-live="polite">
  <div class="spinner spinner-{size}"></div>
  {#if text}
    <p class="loading-text">{text}</p>
  {/if}
</div>

<style>
  .loading-spinner {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-lg);
    padding: var(--space-3xl);
  }

  .spinner {
    display: block;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    flex-shrink: 0;
    border-style: solid;
    border-color: rgba(64, 121, 197, 0.2);
    border-top-color: #4079c5;
  }

  .spinner-sm {
    width: 1rem;
    height: 1rem;
    border-width: 2px;
  }

  .spinner-md {
    width: 2.5rem;
    height: 2.5rem;
    border-width: 3px;
  }

  .spinner-lg {
    width: 3.5rem;
    height: 3.5rem;
    border-width: 4px;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .loading-text {
    font-size: 0.875rem;
    color: var(--text-secondary);
    margin: 0;
  }
</style>

