<!--
  Shared demo state screen — the single visual shell for every full-page demo
  state (entry gate, busy, failure). Interactive Demo spec (ENGG-379).

  Presentational only: brand + a tone-tinted status badge (icon or spinner) +
  eyebrow/title/message, then caller-provided `body` (forms, notes) and `actions`
  (buttons). On mount it moves focus to the title so each state change is
  announced to assistive tech.

  ADDITIVE FILE.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { Snippet } from 'svelte';

  interface Props {
    /** Small uppercase label above the title. */
    eyebrow?: string;
    title: string;
    message?: string;
    /** Accent + default icon of the status badge. */
    tone?: 'brand' | 'busy' | 'error';
    /** Show a spinner in the badge instead of an icon (loading). */
    spinner?: boolean;
    /** Override the badge icon. Falls back to a tone-based default. */
    icon?: Snippet;
    /** Main content under the message (form fields, extra copy). */
    body?: Snippet;
    /** Action buttons row at the bottom. */
    actions?: Snippet;
  }
  let {
    eyebrow,
    title,
    message,
    tone = 'brand',
    spinner = false,
    icon,
    body,
    actions,
  }: Props = $props();

  let titleEl = $state<HTMLHeadingElement>();
  onMount(() => titleEl?.focus());
</script>

<main class="screen">
  <section class="card" data-tone={tone}>
    <div class="brand">
      <img src="/grengin-icon.svg" alt="" class="logo" aria-hidden="true" />
      <span class="wordmark">grengin</span>
    </div>

    <div class="badge" data-tone={tone} aria-hidden="true">
      {#if spinner}
        <span class="spinner"></span>
      {:else if icon}
        {@render icon()}
      {:else if tone === 'busy'}
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M6 3h12M6 21h12M8 3c0 5 8 5 8 9s-8 4-8 9" /><path d="M16 3c0 5-8 5-8 9s8 4 8 9" />
        </svg>
      {:else if tone === 'error'}
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      {:else}
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m12 3 1.9 5.5L19.5 10l-4.6 3 1.7 5.6L12 15.3 7.4 18.6 9.1 13 4.5 10l5.6-1.5L12 3Z" />
        </svg>
      {/if}
    </div>

    {#if eyebrow}<p class="eyebrow">{eyebrow}</p>{/if}
    <h1 class="title" bind:this={titleEl} tabindex="-1">{title}</h1>
    {#if message}<p class="subtitle" aria-live="polite">{message}</p>{/if}

    {#if body}{@render body()}{/if}
    {#if actions}<div class="actions">{@render actions()}</div>{/if}
  </section>
</main>

<style>
  .screen {
    min-height: 100vh;
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: var(--bg-primary);
    box-sizing: border-box;
  }
  .card {
    width: 100%;
    max-width: 440px;
    padding: 34px 32px 28px;
    background: var(--surface-card);
    border: 1px solid var(--surface-border);
    border-radius: 22px;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.4);
    box-sizing: border-box;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 22px;
  }
  .logo {
    width: 26px;
    height: 26px;
  }
  .wordmark {
    font-size: 20px;
    font-weight: 700;
    color: var(--brand);
    letter-spacing: -0.01em;
  }
  .badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 46px;
    height: 46px;
    margin-bottom: 18px;
    border-radius: 14px;
    color: var(--brand);
    background: rgba(var(--brand-rgb), 0.14);
  }
  .badge[data-tone='busy'] {
    color: #eab04a;
    background: rgba(234, 176, 74, 0.14);
  }
  .badge[data-tone='error'] {
    color: #ef6a6a;
    background: rgba(239, 106, 106, 0.14);
  }
  .eyebrow {
    margin: 0 0 6px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.14em;
    color: var(--brand);
  }
  .title {
    margin: 0 0 10px;
    font-size: 24px;
    font-weight: 700;
    color: var(--text-primary);
    outline: none;
  }
  .subtitle {
    margin: 0 0 22px;
    font-size: 14.5px;
    line-height: 1.6;
    color: var(--text-secondary);
  }
  .actions {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 6px;
  }
  .spinner {
    width: 22px;
    height: 22px;
    border: 2.5px solid rgba(var(--brand-rgb), 0.3);
    border-top-color: var(--brand);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
