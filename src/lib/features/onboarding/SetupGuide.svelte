<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<!--
  Setup guide (ENGG-447) — the Replay-tour control. Figma "Setup guide pill"
  (1678:24091) and its "Setup checklist" panel (1687:24402 / 1677:23156).

  Pinned (position: fixed) top-right on every Chat and Control Hub page while
  the first Super Admin has no API key or no teammate yet. On pages whose
  header already has actions at the top-right it sits just before them, so it
  never covers a button; with no room there it drops below them.
-->
<script lang="ts">
  import { onMount, tick } from "svelte";
  import { navigate } from "svelte-routing";
  import { _ } from "svelte-i18n";
  import { onboarding } from "./onboardingState.svelte.js";

  let root = $state<HTMLDivElement | null>(null);
  let pill = $state<HTMLDivElement | null>(null);
  let toggle = $state<HTMLButtonElement | null>(null);
  let pos = $state<{ top: number; right: number | null; left: number | null }>({
    top: 16,
    right: 24,
    left: null,
  });

  const done = $derived(
    (onboarding.apiKeyConnected ? 1 : 0) + (onboarding.teammateAdded ? 1 : 0),
  );
  const open = $derived(onboarding.guideOpen);

  const HEADER_ACTIONS =
    ".main-content-body .page-header-actions, .main-content-body .page-header > .cta";
  const HEADER_TEXT =
    ".main-content-body .page-header-content, .main-content-body .page-header .header-text";

  /** Right edge (or left edge in RTL) of the text drawn inside `node`. */
  function inkEdge(node: Element | null, rtl: boolean): number | null {
    if (!node) return null;
    let edge: number | null = null;
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    while (walker.nextNode()) {
      if (!walker.currentNode.nodeValue?.trim()) continue;
      range.selectNodeContents(walker.currentNode);
      const r = range.getBoundingClientRect();
      edge = edge === null ? (rtl ? r.left : r.right) : rtl ? Math.min(edge, r.left) : Math.max(edge, r.right);
    }
    return edge;
  }

  function place() {
    if (!pill) return;
    const rtl = document.documentElement.dir === "rtl";
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const m = 16, gap = 12;
    const pw = pill.offsetWidth, ph = pill.offsetHeight;
    // Phones: the drawer shell has its own top bar; sit just under it.
    if (vw <= 768) {
      const bar = document.querySelector(".mobile-header");
      const top = bar ? bar.getBoundingClientRect().bottom + 8 : m;
      pos = rtl ? { top, left: 12, right: null } : { top, right: 12, left: null };
      return;
    }
    const actions = Array.from(document.querySelectorAll<HTMLElement>(HEADER_ACTIONS)).filter(
      (n) => n.getClientRects().length > 0 && n.offsetWidth > 0,
    );
    if (!actions.length) {
      pos = rtl ? { top: m, left: m + sidebarOffset(), right: null } : { top: m, right: 24, left: null };
      return;
    }
    const rects = actions.map((a) => a.getBoundingClientRect());
    const a = {
      left: Math.min(...rects.map((r) => r.left)),
      right: Math.max(...rects.map((r) => r.right)),
      top: Math.min(...rects.map((r) => r.top)),
      bottom: Math.max(...rects.map((r) => r.bottom)),
    };
    // Scrolled away: keep the last position rather than chase the header.
    if (a.bottom < 0 || a.top > vh) return;
    const text = inkEdge(document.querySelector(HEADER_TEXT), rtl);
    let top = a.top + (a.bottom - a.top - ph) / 2;
    if (!rtl) {
      let right = vw - a.left + gap;
      if (text !== null && vw - right - pw < text + gap) {
        right = vw - a.right;
        top = a.bottom + gap;
      }
      pos = { top: Math.max(4, Math.round(top)), right: Math.max(m, Math.round(right)), left: null };
    } else {
      let left = a.right + gap;
      if (text !== null && left + pw > text - gap) {
        left = a.left;
        top = a.bottom + gap;
      }
      pos = { top: Math.max(4, Math.round(top)), left: Math.max(m, Math.round(left)), right: null };
    }
  }

  function sidebarOffset(): number {
    const sidebar = document.querySelector("aside.sidebar");
    return sidebar ? sidebar.getBoundingClientRect().width : 0;
  }

  let frame = 0;
  function schedule() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      place();
    });
  }

  onMount(() => {
    // Route changes swap the page under the header; lazy pages mount late.
    const body = document.querySelector(".main-content-body") ?? document.body;
    const observer = new MutationObserver(schedule);
    observer.observe(body, { childList: true, subtree: true });
    window.addEventListener("resize", schedule);
    document.fonts?.ready.then(schedule);
    schedule();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(frame);
    };
  });

  function setOpen(value: boolean) {
    onboarding.setGuideOpen(value);
  }

  function collapseAndFocus() {
    setOpen(false);
    tick().then(() => toggle?.focus());
  }

  function goTo(path: string) {
    setOpen(false);
    if (window.location.pathname !== path.split("?")[0]) navigate(path);
  }

  function onWindowClick(event: MouseEvent) {
    if (open && root && !root.contains(event.target as Node)) setOpen(false);
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === "Escape" && open) {
      event.stopPropagation();
      collapseAndFocus();
    }
  }
</script>

<svelte:window onclick={onWindowClick} />

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  bind:this={root}
  class="guide"
  class:is-open={open}
  role="region"
  aria-label={$_("onboarding.guide.label")}
  style:top="{pos.top}px"
  style:right={pos.right === null ? null : `${pos.right}px`}
  style:left={pos.left === null ? null : `${pos.left}px`}
  onkeydown={onKeydown}
>
  <div class="guide-pill" bind:this={pill}>
    <button
      bind:this={toggle}
      class="guide-toggle"
      type="button"
      aria-expanded={open}
      aria-controls="setup-guide-panel"
      aria-label="{$_('onboarding.guide.label')} {done}/2 — {open
        ? $_('onboarding.guide.hideChecklist')
        : $_('onboarding.guide.showChecklist')}"
      onclick={() => setOpen(!open)}
    >
      <span class="guide-icon" aria-hidden="true"><i></i></span>
      <span class="guide-label">{$_("onboarding.guide.label")}</span>
      <span class="guide-badge" class:is-progress={done > 0}>{done}/2</span>
      <span class="guide-chevron" aria-hidden="true">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </span>
    </button>
    <button
      class="guide-close"
      type="button"
      aria-label={$_("onboarding.guide.close")}
      title={$_("onboarding.guide.close")}
      onclick={() => onboarding.dismissGuide()}
    >
      {@render closeIcon()}
    </button>
  </div>

  {#if open}
    <div class="guide-panel" id="setup-guide-panel">
      <div class="guide-content">
        <div class="guide-top">
          <div>
            <h2 class="guide-title">{$_("onboarding.guide.title")}</h2>
            <p class="guide-sub">
              {done === 1 ? $_("onboarding.guide.oneLeft") : $_("onboarding.guide.twoLeft")}
            </p>
          </div>
          <button
            class="guide-close guide-close--panel"
            type="button"
            aria-label={$_("onboarding.guide.hideChecklist")}
            onclick={collapseAndFocus}
          >
            {@render closeIcon()}
          </button>
        </div>

        <div class="guide-progress">
          <div class="guide-progress-labels">
            <span>{$_("onboarding.guide.progress")}</span>
            <span>{done * 50}%</span>
          </div>
          <div
            class="guide-track"
            role="progressbar"
            aria-label={$_("onboarding.guide.progress")}
            aria-valuemin="0"
            aria-valuemax="2"
            aria-valuenow={done}
          >
            <div class="guide-fill" style:width="{done * 50}%"></div>
          </div>
        </div>

        {@render item(
          onboarding.apiKeyConnected,
          $_("onboarding.guide.apiKey.title"),
          onboarding.apiKeyConnected
            ? onboarding.apiKeyProvider
              ? $_("onboarding.guide.apiKey.done", { values: { provider: onboarding.apiKeyProvider } })
              : $_("onboarding.guide.apiKey.doneGeneric")
            : $_("onboarding.guide.apiKey.description"),
          $_("onboarding.guide.apiKey.action"),
          "/admin/ai-engines",
        )}
        <div class="guide-divider"></div>
        {@render item(
          onboarding.teammateAdded,
          $_("onboarding.guide.teammate.title"),
          onboarding.teammateAdded
            ? $_("onboarding.guide.teammate.done")
            : $_("onboarding.guide.teammate.description"),
          $_("onboarding.guide.teammate.action"),
          "/admin/departments?tab=users",
        )}
      </div>

      <div class="guide-footer">
        <button class="guide-resume" type="button" onclick={() => onboarding.start()}>
          <span>{$_("onboarding.guide.resume")}</span>
          <svg class="guide-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
        <button class="guide-later" type="button" onclick={() => onboarding.dismissGuide()}>
          {$_("onboarding.guide.later")}
        </button>
      </div>
    </div>
  {/if}
</div>

{#snippet closeIcon()}
  <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
    <path d="M1 1l8 8M9 1L1 9" />
  </svg>
{/snippet}

{#snippet item(isDone: boolean, title: string, description: string, action: string, path: string)}
  <div class="guide-item" class:is-done={isDone}>
    <span class="guide-status">
      {#if isDone}
        <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M2.5 6.2l2.3 2.3 4.7-5" />
        </svg>
        <span class="sr-only">{$_("onboarding.guide.done")}</span>
      {/if}
    </span>
    <div class="guide-item-copy">
      <span class="guide-item-title">{title}</span>
      <span class="guide-item-desc">{description}</span>
      {#if !isDone}
        <button class="guide-link" type="button" onclick={() => goTo(path)}>
          <span>{action}</span>
          <svg class="guide-arrow" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      {/if}
    </div>
  </div>
{/snippet}

<style>
  /* Light values are the Figma pill/checklist's; dark maps them onto the
     app's dark surfaces. */
  .guide {
    --guide-surface: #fff;
    --guide-ring: #e2e8f0;
    --guide-ink: #172033;
    --guide-muted: #64748b;
    --guide-faint: #94a3b8;
    --guide-badge-bg: #f1f3f5;
    --guide-badge-ink: #64748b;
    --guide-badge-done-bg: #e7f5ef;
    --guide-badge-done-ink: #29966f;
    --guide-accent: #536fd1;
    --guide-accent-hover: #4560c2;
    --guide-accent-soft: #eef1fc;
    --guide-track: #e9edf3;
    --guide-check: #29966f;
    --guide-shadow: 0 4px 14px 0 rgba(15, 23, 42, 0.07);
    --guide-panel-shadow: 0 18px 46px -8px rgba(15, 23, 42, 0.14);

    position: fixed;
    z-index: 900;
    font-family: var(--gx-font);
    color: var(--guide-ink);
  }

  @media (prefers-color-scheme: dark) {
    .guide {
      --guide-surface: #171a21;
      --guide-ring: rgba(255, 255, 255, 0.1);
      --guide-ink: var(--gx-ink);
      --guide-muted: var(--gx-muted);
      --guide-faint: var(--gx-dim);
      --guide-badge-bg: rgba(255, 255, 255, 0.08);
      --guide-badge-ink: var(--gx-muted);
      --guide-badge-done-bg: rgba(41, 150, 111, 0.2);
      --guide-badge-done-ink: #6fd6ad;
      --guide-accent: #6f88e0;
      --guide-accent-hover: #8198e6;
      --guide-accent-soft: rgba(83, 111, 209, 0.22);
      --guide-track: rgba(255, 255, 255, 0.1);
      --guide-check: #3fb488;
      --guide-shadow: 0 4px 14px 0 rgba(0, 0, 0, 0.4);
      --guide-panel-shadow: 0 18px 46px -8px rgba(0, 0, 0, 0.6);
    }
  }

  .guide button {
    backdrop-filter: none;
  }

  .guide-pill {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 56px;
    padding: 0 10px;
    min-width: 280px;
    background: var(--guide-surface);
    border-radius: 28px;
    box-shadow: inset 0 0 0 1px var(--guide-ring), var(--guide-shadow);
  }

  .guide-toggle {
    all: unset;
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1 1 auto;
    min-width: 0;
    height: 100%;
    cursor: pointer;
    border-radius: 22px;
  }

  .guide-icon {
    width: 36px;
    height: 36px;
    border-radius: 18px;
    background: var(--guide-accent-soft);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .guide-icon i {
    width: 12px;
    height: 12px;
    border-radius: 6px;
    border: 2px solid var(--guide-accent);
    box-sizing: border-box;
  }

  .guide-label {
    flex: 1 1 auto;
    min-width: 0;
    font-size: 13.5px;
    font-weight: 600;
    color: var(--guide-ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .guide-badge {
    flex-shrink: 0;
    padding: 4px 9px;
    border-radius: 12px;
    font-size: 11.5px;
    font-weight: 600;
    line-height: 15px;
    background: var(--guide-badge-bg);
    color: var(--guide-badge-ink);
  }

  .guide-badge.is-progress {
    background: var(--guide-badge-done-bg);
    color: var(--guide-badge-done-ink);
  }

  .guide-chevron {
    flex-shrink: 0;
    display: flex;
    color: var(--guide-muted);
    transition: transform 0.18s ease;
  }

  .is-open .guide-chevron {
    transform: rotate(180deg);
  }

  .guide-close {
    all: unset;
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--guide-muted);
    background: var(--guide-badge-bg);
    cursor: pointer;
  }

  .guide-close:hover {
    color: var(--guide-ink);
  }

  .guide-close--panel {
    width: 26px;
    height: 26px;
    border-radius: 13px;
    background: none;
    box-shadow: inset 0 0 0 1px var(--guide-ring);
  }

  .guide-toggle:focus-visible,
  .guide-close:focus-visible,
  .guide-link:focus-visible,
  .guide-resume:focus-visible,
  .guide-later:focus-visible {
    outline: 2px solid var(--guide-accent);
    outline-offset: 2px;
  }

  .guide-panel {
    position: absolute;
    top: calc(100% + 16px);
    inset-inline-end: 0;
    width: 414px;
    max-width: calc(100vw - 24px);
    background: var(--guide-surface);
    border-radius: 20px;
    box-shadow: inset 0 0 0 1px var(--guide-ring), var(--guide-panel-shadow);
    overflow: hidden;
  }

  .guide-content {
    padding: 22px 22px 20px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .guide-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .guide-title {
    margin: 0;
    font-family: Sora, var(--gx-font-display);
    font-size: 18px;
    line-height: 24px;
    font-weight: 600;
    letter-spacing: -0.25px;
    color: var(--guide-ink);
  }

  .guide-sub {
    margin: 5px 0 0;
    font-size: 12.5px;
    line-height: 18px;
    color: var(--guide-muted);
  }

  .guide-progress {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  .guide-progress-labels {
    display: flex;
    justify-content: space-between;
    font-size: 10.5px;
    font-weight: 600;
    color: var(--guide-muted);
  }

  .guide-track {
    height: 6px;
    border-radius: 3px;
    background: var(--guide-track);
    overflow: hidden;
  }

  .guide-fill {
    height: 100%;
    border-radius: 3px;
    background: var(--guide-accent);
    transition: width 0.3s ease;
  }

  .guide-item {
    display: flex;
    gap: 12px;
    align-items: flex-start;
  }

  .guide-status {
    width: 16px;
    height: 16px;
    border-radius: 8px;
    border: 2px solid var(--guide-faint);
    box-sizing: border-box;
    flex-shrink: 0;
    margin-top: 1px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .is-done .guide-status {
    border: 0;
    background: var(--guide-check);
    color: #fff;
  }

  .guide-item-copy {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  .guide-item-title {
    font-size: 13.5px;
    line-height: 19px;
    font-weight: 600;
    color: var(--guide-ink);
  }

  .is-done .guide-item-title {
    text-decoration: line-through;
    color: var(--guide-muted);
  }

  .guide-item-desc {
    font-size: 12px;
    line-height: 17px;
    color: var(--guide-muted);
  }

  .guide-link {
    all: unset;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 12.5px;
    line-height: 18px;
    font-weight: 600;
    color: var(--guide-accent);
    cursor: pointer;
    border-radius: 4px;
    align-self: flex-start;
  }

  .guide-link:hover {
    text-decoration: underline;
  }

  :global([dir="rtl"]) .guide-arrow {
    transform: scaleX(-1);
  }

  .guide-divider {
    height: 1px;
    background: var(--guide-ring);
  }

  .guide-footer {
    border-top: 1px solid var(--guide-ring);
    padding: 16px 22px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 11px;
  }

  .guide-resume {
    all: unset;
    box-sizing: border-box;
    width: 100%;
    height: 42px;
    border-radius: 8px;
    background: var(--guide-accent);
    color: #fff;
    font-size: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    cursor: pointer;
  }

  .guide-resume:hover {
    background: var(--guide-accent-hover);
  }

  .guide-later {
    all: unset;
    font-size: 12px;
    line-height: 18px;
    font-weight: 500;
    color: var(--guide-faint);
    cursor: pointer;
    border-radius: 4px;
  }

  .guide-later:hover {
    color: var(--guide-muted);
    text-decoration: underline;
  }

  /* Phones: icon, badge and controls only. */
  @media (max-width: 480px) {
    .guide-pill {
      min-width: 0;
      height: 48px;
    }

    .guide-label {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .guide-chevron,
    .guide-fill {
      transition: none;
    }
  }
</style>
