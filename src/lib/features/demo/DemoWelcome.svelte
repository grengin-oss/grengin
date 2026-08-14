<script lang="ts">
  /**
   * Interactive Demo — welcome card (spec §2).
   *
   * ADDITIVE FILE — new to the demo layer; does not modify any existing webapp
   * component. Mounted once (next to GlobalTopBar) while the demo is active.
   *
   * A branded, self-contained notification card that slides in a couple of
   * seconds after load: sparkle badge + eyebrow, title, body, a Deploy CTA and a
   * dismiss. Auto-dismisses on a timer (with a progress bar) and is dismissible
   * by the close button, the "Got it" action, or Escape. Fires once per page
   * load. Copy comes from the `demo` i18n namespace, so it follows the visitor's
   * language; the card mirrors on RTL via logical positioning.
   *
   * Self-styled rather than routed through the shared Toaster so it can carry the
   * brand treatment the plain toast can't.
   */
  import { onMount } from 'svelte';
  import { _ } from 'svelte-i18n';

  interface Props {
    /** Delay before the card appears, ms. */
    showAfter?: number;
    /** Auto-dismiss timeout once shown, ms. */
    duration?: number;
    /** Where the Deploy CTA points. */
    deployHref?: string;
  }
  let {
    showAfter = 2000,
    duration = 12000,
    deployHref = 'https://grengin.com/deploy',
  }: Props = $props();

  // 'pending' → not shown yet; 'in' → visible; 'out' → playing exit animation.
  let phase = $state<'pending' | 'in' | 'out'>('pending');
  let dismissTimer: ReturnType<typeof setTimeout> | undefined;

  function dismiss() {
    if (phase !== 'in') return;
    clearTimeout(dismissTimer);
    phase = 'out';
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && phase === 'in') {
      e.preventDefault();
      dismiss();
    }
  }

  onMount(() => {
    const showTimer = setTimeout(() => {
      phase = 'in';
      dismissTimer = setTimeout(dismiss, duration);
    }, showAfter);
    window.addEventListener('keydown', onKeydown);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(dismissTimer);
      window.removeEventListener('keydown', onKeydown);
    };
  });
</script>

{#if phase !== 'pending'}
  <div class="demo-welcome-wrap" class:out={phase === 'out'} role="status" aria-live="polite">
    <section
      class="card"
      onanimationend={() => {
        if (phase === 'out') phase = 'pending';
      }}
    >
      <div class="accent" aria-hidden="true"></div>

      <button class="close" type="button" aria-label={$_('demo.welcome.dismiss')} onclick={dismiss}>
        <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
        </svg>
      </button>

      <div class="head">
        <span class="spark" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m12 3 1.9 5.5L19.5 10l-4.6 3 1.7 5.6L12 15.3 7.4 18.6 9.1 13 4.5 10l5.6-1.5L12 3Z" />
          </svg>
        </span>
        <p class="eyebrow">{$_('demo.welcome.badge')}</p>
      </div>

      <h2 class="title">{$_('demo.welcome.title')}</h2>
      <p class="body">{$_('demo.welcome.body')}</p>

      <div class="actions">
        <a class="cta" href={deployHref} target="_blank" rel="noopener">
          {$_('demo.welcome.cta')}
          <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </a>
        <button class="ghost" type="button" onclick={dismiss}>{$_('demo.welcome.dismiss')}</button>
      </div>

      {#if phase === 'in'}
        <div class="timer" aria-hidden="true">
          <span class="timer-fill" style="animation-duration: {duration}ms"></span>
        </div>
      {/if}
    </section>
  </div>
{/if}

<style>
  .demo-welcome-wrap {
    position: fixed;
    bottom: 20px;
    inset-inline-end: 20px;
    z-index: 1001; /* above GlobalTopBar (1000) */
    width: min(360px, calc(100vw - 32px));
    pointer-events: none;
  }
  .card {
    position: relative;
    pointer-events: auto;
    overflow: hidden;
    padding: 18px 18px 16px;
    border-radius: 18px;
    background: var(--surface-card, #16181f);
    border: 1px solid var(--surface-border, rgba(255, 255, 255, 0.1));
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.45), 0 2px 8px rgba(0, 0, 0, 0.25);
    outline: none;
    animation: welcome-in 0.42s cubic-bezier(0.21, 1.02, 0.73, 1) both;
  }
  .demo-welcome-wrap.out .card {
    animation: welcome-out 0.28s cubic-bezier(0.4, 0, 1, 1) both;
  }

  /* Brand gradient glow strip along the top edge. */
  .accent {
    position: absolute;
    inset: 0 0 auto 0;
    height: 3px;
    background: linear-gradient(90deg, var(--brand-green-accent, #2d906b) 0%, var(--brand, #4079c5) 100%);
  }

  .close {
    position: absolute;
    top: 12px;
    inset-inline-end: 12px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--text-secondary, rgba(255, 255, 255, 0.55));
    cursor: pointer;
    transition: background 150ms, color 150ms;
  }
  .close:hover {
    background: rgba(255, 255, 255, 0.08);
    color: var(--text-primary, #fff);
  }

  .head {
    display: flex;
    align-items: center;
    gap: 9px;
    margin-bottom: 12px;
  }
  .spark {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 11px;
    color: #fff;
    background: linear-gradient(135deg, var(--brand-green-accent, #2d906b) 0%, var(--brand, #4079c5) 100%);
    box-shadow: 0 4px 14px rgba(var(--brand-rgb, 64, 121, 197), 0.35);
    flex-shrink: 0;
  }
  .eyebrow {
    margin: 0;
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.13em;
    color: var(--brand, #7cb0ff);
  }

  .title {
    margin: 0 0 6px;
    font-size: 17px;
    font-weight: 700;
    line-height: 1.25;
    color: var(--text-primary, #fff);
  }
  .body {
    margin: 0 0 16px;
    font-size: 13.5px;
    line-height: 1.5;
    color: var(--text-secondary, rgba(255, 255, 255, 0.7));
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .cta {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 38px;
    padding: 0 15px;
    border-radius: 12px;
    background: linear-gradient(135deg, var(--brand-green-accent, #2d906b) 0%, var(--brand, #4079c5) 100%);
    color: #fff;
    font-size: 13.5px;
    font-weight: 700;
    text-decoration: none;
    white-space: nowrap;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2), 0 6px 18px rgba(var(--brand-rgb, 64, 121, 197), 0.3);
    transition: transform 120ms ease, box-shadow 120ms ease;
  }
  .cta:hover {
    transform: translateY(-1px);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.25), 0 8px 22px rgba(var(--brand-rgb, 64, 121, 197), 0.42);
  }
  .cta svg {
    transition: transform 150ms ease;
  }
  .cta:hover svg {
    transform: translateX(2px);
  }
  .ghost {
    height: 38px;
    padding: 0 12px;
    border: none;
    border-radius: 12px;
    background: transparent;
    color: var(--text-secondary, rgba(255, 255, 255, 0.6));
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: color 150ms, background 150ms;
  }
  .ghost:hover {
    color: var(--text-primary, #fff);
    background: rgba(255, 255, 255, 0.06);
  }

  .cta:focus-visible,
  .ghost:focus-visible,
  .close:focus-visible {
    outline: 2px solid var(--brand, #7cb0ff);
    outline-offset: 2px;
  }

  /* Auto-dismiss countdown bar. */
  .timer {
    position: absolute;
    inset: auto 0 0 0;
    height: 3px;
    background: rgba(255, 255, 255, 0.06);
  }
  .timer-fill {
    display: block;
    height: 100%;
    transform-origin: left center;
    background: linear-gradient(90deg, var(--brand-green-accent, #2d906b) 0%, var(--brand, #4079c5) 100%);
    animation: welcome-timer linear forwards;
  }
  :global([dir='rtl']) .timer-fill {
    transform-origin: right center;
  }

  @keyframes welcome-in {
    from {
      opacity: 0;
      transform: translateY(16px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
  @keyframes welcome-out {
    from {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
    to {
      opacity: 0;
      transform: translateY(12px) scale(0.98);
    }
  }
  @keyframes welcome-timer {
    from {
      transform: scaleX(1);
    }
    to {
      transform: scaleX(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .card,
    .demo-welcome-wrap.out .card {
      animation: none;
    }
    .timer {
      display: none;
    }
  }
</style>
