<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<!--
  First-launch guided tour (ENGG-447) — Figma "Guide" page (1601:11378).

  Six steps across Chat and Control Hub. The page is dimmed except for a
  spotlight on the step's target (marked with `data-tour="…"` in the page
  components); the target stays clickable through the hole. The overlay is
  mounted on <body>, outside #app, because an open admin dialog makes #app
  inert and Step 4 has to work with the Create Users dialog open.
-->
<script lang="ts">
  import { tick } from "svelte";
  import { _ } from "svelte-i18n";
  import { onboarding, TOUR_STEPS, type TourStepId } from "./onboardingState.svelte.js";

  type Side = "top" | "bottom" | "left" | "right";

  interface StepConfig {
    /** Centered welcome card with no spotlight. */
    modal?: boolean;
    title: string;
    body: string;
    cta: () => string;
    ctaArrow?: boolean;
    target?: () => HTMLElement[] | null;
    /** What the arrow points at, when it isn't the whole spotlit area. */
    aim?: () => HTMLElement | null;
    /** Glow ring around the spotlight (default on). */
    ring?: boolean;
    side?: (target: HTMLElement) => Side;
    align?: "center" | "end";
    pad?: number;
    /** Steps that ask for typing leave focus in the page. */
    keepPageFocus?: boolean;
  }

  function one(selector: string): HTMLElement[] | null {
    const el = document.querySelector<HTMLElement>(selector);
    return el ? [el] : null;
  }

  /** The open Create Users dialog, else the button that opens it. */
  function inviteTarget(): HTMLElement[] | null {
    const form = document.querySelector("#modal-portal .user-form");
    const dialog = form?.closest<HTMLElement>(".modal-content");
    return dialog ? [dialog] : one('[data-tour="create-users"]');
  }

  const STEPS: Record<TourStepId, StepConfig> = {
    welcome: {
      modal: true,
      title: "onboarding.tour.welcome.title",
      body: "onboarding.tour.welcome.body",
      cta: () => "onboarding.tour.welcome.cta",
      ctaArrow: true,
    },
    controlHub: {
      title: "onboarding.tour.controlHub.title",
      body: "onboarding.tour.controlHub.body",
      cta: () => "onboarding.tour.controlHub.cta",
      // Figma: the whole profile section (menu + user row) is lit, Control
      // Hub is tinted in it, and the arrow points at Control Hub.
      target: () => one('[data-tour="user-menu"]'),
      aim: () => document.querySelector<HTMLElement>('[data-tour="control-hub"]'),
      ring: false,
      side: () => "right",
      pad: 0,
    },
    apiKey: {
      title: "onboarding.tour.apiKey.title",
      body: "onboarding.tour.apiKey.body",
      cta: () => "onboarding.tour.apiKey.cta",
      // The empty state's button; once a key exists, the engines it connected.
      target: () =>
        one('[data-tour="add-api-key"]') ?? one('[data-tour="engines-list"]'),
      side: () => "bottom",
      pad: 6,
    },
    invite: {
      title: "onboarding.tour.invite.title",
      body: "onboarding.tour.invite.body",
      cta: () =>
        onboarding.teammateAdded
          ? "onboarding.tour.invite.cta"
          : "onboarding.tour.invite.skip",
      target: inviteTarget,
      side: (t) => (t.classList.contains("modal-content") ? "right" : "bottom"),
      pad: 0,
      keepPageFocus: true,
    },
    signIn: {
      title: "onboarding.tour.signIn.title",
      body: "onboarding.tour.signIn.body",
      cta: () => "onboarding.tour.signIn.cta",
      target: () => {
        const cards = document.querySelectorAll<HTMLElement>(
          '[data-tour="sso-providers"] > .provider-card',
        );
        return cards.length ? Array.from(cards).slice(0, 2) : null;
      },
      side: () => "bottom",
      align: "end",
      pad: 6,
    },
    prompt: {
      title: "onboarding.tour.prompt.title",
      body: "onboarding.tour.prompt.body",
      cta: () => "onboarding.tour.prompt.cta",
      target: () => one('[data-tour="composer"]'),
      side: () => "bottom",
      pad: 6,
      keepPageFocus: true,
    },
  };

  interface Hole { x: number; y: number; w: number; h: number; r: number }
  interface Layout {
    /** Nothing to show yet (target still loading) or a page dialog is on top. */
    hidden: boolean;
    hole: Hole | null;
    left: number;
    top: number;
    arrowSide: Side | null;
    arrowOffset: number;
    ring: boolean;
    /** The target is an app dialog, whose own backdrop already dims the page. */
    inDialog: boolean;
  }

  const current = $derived(onboarding.currentStep);
  const config = $derived(current ? STEPS[current] : null);
  const index = $derived(onboarding.stepIndex);

  let card = $state<HTMLDivElement | null>(null);
  let primary = $state<HTMLButtonElement | null>(null);
  let layout = $state<Layout>({
    hidden: true, hole: null, left: 0, top: 0, arrowSide: null, arrowOffset: 0,
    ring: true, inDialog: false,
  });
  let viewport = $state({ w: window.innerWidth, h: window.innerHeight });

  /** Mount on <body>, outside #app. */
  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return { destroy: () => node.remove() };
  }

  function unionRect(nodes: HTMLElement[]) {
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    for (const n of nodes) {
      const rect = n.getBoundingClientRect();
      l = Math.min(l, rect.left); t = Math.min(t, rect.top);
      r = Math.max(r, rect.right); b = Math.max(b, rect.bottom);
    }
    return { left: l, top: t, right: r, bottom: b, width: r - l, height: b - t };
  }

  function visible(nodes: HTMLElement[] | null): HTMLElement[] | null {
    const list = (nodes ?? []).filter((n) => n.getClientRects().length > 0);
    return list.length ? list : null;
  }

  /** An admin dialog is open over the page and it isn't what the step points at. */
  function dialogOnTop(targets: HTMLElement[] | null): boolean {
    const open = parseInt(document.body.getAttribute("data-modal-count") || "0", 10) > 0;
    if (!open) return false;
    return !targets?.some((t) => t.closest("#modal-portal"));
  }

  // Put the card on `side` of the target, flip when it doesn't fit, keep it on
  // screen and aim the arrow at the target's centre.
  type Box = { left: number; top: number; right: number; bottom: number };
  function place(T: Box, preferred: Side, align: "center" | "end", aim: Box = T) {
    const vw = window.innerWidth, vh = window.innerHeight;
    const W = card?.offsetWidth ?? 340, H = card?.offsetHeight ?? 260;
    const gap = 16, m = 12;
    const cx = (aim.left + aim.right) / 2, cy = (aim.top + aim.bottom) / 2;
    const order: Record<Side, Side[]> = {
      right: ["right", "left", "bottom", "top"],
      left: ["left", "right", "bottom", "top"],
      bottom: ["bottom", "top", "right", "left"],
      top: ["top", "bottom", "right", "left"],
    };
    const at = (s: Side) => {
      if (s === "right" || s === "left") {
        return { left: s === "right" ? T.right + gap : T.left - gap - W, top: cy - H / 2 };
      }
      return {
        top: s === "bottom" ? T.bottom + gap : T.top - gap - H,
        left: align === "end" ? T.right - W : cx - W / 2,
      };
    };
    const fits = (s: Side, p: { left: number; top: number }) =>
      s === "right" ? p.left + W <= vw - m
      : s === "left" ? p.left >= m
      : s === "bottom" ? p.top + H <= vh - m
      : p.top >= m;

    let side = order[preferred][0];
    let pos = at(side);
    for (const s of order[preferred]) {
      const p = at(s);
      if (fits(s, p)) { side = s; pos = p; break; }
    }
    const left = Math.max(m, Math.min(pos.left, vw - W - m));
    const top = Math.max(m, Math.min(pos.top, vh - H - m));
    const edge = 22;
    const arrowOffset = side === "left" || side === "right"
      ? Math.max(edge, Math.min(cy - top, H - edge))
      : Math.max(edge, Math.min(cx - left, W - edge));
    return { left, top, side, arrowOffset };
  }

  let stepStartedAt = 0;
  let scrolledFor = -1;

  /** Only touch reactive state when something moved. */
  function setLayout(next: Layout) {
    const a = layout, b = next;
    const same =
      a.hidden === b.hidden && a.left === b.left && a.top === b.top &&
      a.arrowSide === b.arrowSide && a.arrowOffset === b.arrowOffset &&
      a.inDialog === b.inDialog && a.ring === b.ring &&
      (a.hole === b.hole ||
        (!!a.hole && !!b.hole && a.hole.x === b.hole.x && a.hole.y === b.hole.y &&
          a.hole.w === b.hole.w && a.hole.h === b.hole.h && a.hole.r === b.hole.r));
    if (!same) layout = next;
  }

  function measure() {
    if (viewport.w !== window.innerWidth || viewport.h !== window.innerHeight) {
      viewport = { w: window.innerWidth, h: window.innerHeight };
    }
    if (!config) return;
    const vw = viewport.w, vh = viewport.h;

    if (config.modal) {
      const W = card?.offsetWidth ?? 400, H = card?.offsetHeight ?? 320;
      setLayout({
        hidden: false, hole: null,
        left: Math.round((vw - W) / 2), top: Math.round(Math.max(12, (vh - H) / 2)),
        arrowSide: null, arrowOffset: 0, ring: true, inDialog: false,
      });
      return;
    }

    const targets = visible(config.target?.() ?? null);
    if (dialogOnTop(targets)) {
      setLayout({ ...layout, hidden: true });
      return;
    }
    if (!targets) {
      // Route chunks load lazily: give the target a moment before falling back
      // to a centred card over the dimmed page.
      if (performance.now() - stepStartedAt < 1500) {
        setLayout({ ...layout, hidden: true });
        return;
      }
      const W = card?.offsetWidth ?? 340, H = card?.offsetHeight ?? 260;
      setLayout({
        hidden: false, hole: null,
        left: Math.round((vw - W) / 2), top: Math.round(Math.max(12, (vh - H) / 2)),
        arrowSide: null, arrowOffset: 0, ring: true, inDialog: false,
      });
      return;
    }

    if (scrolledFor !== index) {
      scrolledFor = index;
      const r = unionRect(targets);
      if (r.top < 0 || r.bottom > vh) targets[0].scrollIntoView({ block: "center", inline: "nearest" });
    }

    const r = unionRect(targets);
    const pad = config.pad ?? 6;
    const radius = parseFloat(getComputedStyle(targets[0]).borderTopLeftRadius) || 8;
    const hole: Hole = {
      x: r.left - pad, y: r.top - pad, w: r.width + pad * 2, h: r.height + pad * 2,
      r: Math.min(radius + pad, 24),
    };
    const aimEl = config.aim?.();
    const aimRect = aimEl?.getClientRects().length ? aimEl.getBoundingClientRect() : undefined;
    const p = place(
      { left: hole.x, top: hole.y, right: hole.x + hole.w, bottom: hole.y + hole.h },
      config.side?.(targets[0]) ?? "bottom",
      config.align ?? "center",
      aimRect,
    );
    setLayout({
      hidden: false, hole,
      left: Math.round(p.left), top: Math.round(p.top),
      arrowSide: p.side, arrowOffset: Math.round(p.arrowOffset),
      ring: config.ring ?? true,
      inDialog: targets.some((t) => !!t.closest("#modal-portal")),
    });
  }

  // While the tour runs, track the target every frame: routes change, lazy
  // chunks mount, dialogs open and pages scroll under it.
  $effect(() => {
    if (!current) return;
    let frame = 0;
    const loop = () => {
      measure();
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  });

  // New step: restart the target wait and move focus to the card.
  $effect(() => {
    const step = index;
    if (step < 0 || !config) return;
    stepStartedAt = performance.now();
    if (config.keepPageFocus) return;
    tick().then(() => primary?.focus({ preventScroll: true }));
  });

  // Step 2: the highlighted Control Hub menu entry is also a way forward.
  $effect(() => {
    if (current !== "controlHub") return;
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.('[data-tour="control-hub"]');
      if (!link) return;
      event.preventDefault();
      event.stopPropagation();
      onboarding.next();
    };
    window.addEventListener("click", onClick, true);
    return () => window.removeEventListener("click", onClick, true);
  });

  function swallow(event: Event) {
    event.preventDefault();
    event.stopPropagation();
  }

  function onCardKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.stopPropagation();
      onboarding.finish();
    }
  }

  function roundedRect(h: Hole): string {
    const r = Math.max(0, Math.min(h.r, h.w / 2, h.h / 2));
    const { x, y, w } = h;
    const hh = h.h;
    return `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + hh - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + hh}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + hh - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
  }

  const scrimPath = $derived(
    `M0 0H${viewport.w}V${viewport.h}H0Z` + (layout.hole ? roundedRect(layout.hole) : ""),
  );

  const stepLabel = $derived(
    $_("onboarding.tour.stepOf", { values: { current: index + 1, total: TOUR_STEPS.length } }),
  );
</script>

{#if current && config}
  <div class="tour" use:portal>
    {#if !layout.hidden}
      <!-- Dimmed page; clicks on it are swallowed, the spotlight hole passes them through. -->
      <svg
        class="tour-scrim"
        class:tour-scrim--clear={layout.inDialog}
        aria-hidden="true"
        width={viewport.w}
        height={viewport.h}
      >
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <path d={scrimPath} onmousedown={swallow} onclick={swallow} />
      </svg>
      {#if layout.hole && layout.ring}
        <div
          class="tour-spot"
          aria-hidden="true"
          style:left="{layout.hole.x}px"
          style:top="{layout.hole.y}px"
          style:width="{layout.hole.w}px"
          style:height="{layout.hole.h}px"
          style:border-radius="{layout.hole.r}px"
        ></div>
      {/if}
    {/if}

    <div
      bind:this={card}
      class="tour-card"
      class:tour-card--modal={config.modal}
      class:tour-card--hidden={layout.hidden}
      style:left="{layout.left}px"
      style:top="{layout.top}px"
      role="dialog"
      aria-modal={config.modal ? "true" : "false"}
      aria-labelledby="onboarding-tour-title"
      aria-describedby="onboarding-tour-body"
      tabindex="-1"
      onkeydown={onCardKeydown}
    >
      <div class="tour-head">
        <span class="tour-step">{stepLabel}</span>
        <button class="tour-skip" type="button" onclick={() => onboarding.finish()}>
          {$_("onboarding.tour.skip")}
        </button>
      </div>

      <div class="tour-body">
        {#if config.modal}
          <span class="tour-icon" aria-hidden="true">
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="7" height="9" rx="1.5" />
              <rect x="14" y="3" width="7" height="5" rx="1.5" />
              <rect x="14" y="12" width="7" height="9" rx="1.5" />
              <rect x="3" y="16" width="7" height="5" rx="1.5" />
            </svg>
          </span>
        {/if}
        <div class="tour-copy">
          <h2 class="tour-title" id="onboarding-tour-title">{$_(config.title)}</h2>
          <p class="tour-text" id="onboarding-tour-body">{$_(config.body)}</p>
        </div>
      </div>

      <div class="tour-foot">
        <span class="tour-dots" role="img" aria-label={stepLabel}>
          {#each TOUR_STEPS as id, i (id)}
            <span class="tour-dot" class:is-done={i < index} class:is-current={i === index}></span>
          {/each}
        </span>
        <div class="tour-actions">
          {#if index > 0}
            <button class="tour-btn tour-btn--secondary" type="button" onclick={() => onboarding.back()}>
              {$_("onboarding.tour.back")}
            </button>
          {/if}
          <button
            bind:this={primary}
            class="tour-btn tour-btn--primary"
            type="button"
            onclick={() => onboarding.next()}
          >
            {$_(config.cta())}
            {#if config.ctaArrow}
              <svg class="tour-btn__arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            {/if}
          </button>
        </div>
      </div>

      {#if layout.arrowSide}
        <span
          class="tour-arrow tour-arrow--{layout.arrowSide}"
          style={layout.arrowSide === "left" || layout.arrowSide === "right"
            ? `top: ${layout.arrowOffset - 7}px`
            : `left: ${layout.arrowOffset - 7}px`}
          aria-hidden="true"
        ></span>
      {/if}
    </div>
  </div>
{/if}

<style>
  /* Light values are the Figma tooltip's; dark maps them onto the app's
     dark surfaces. */
  .tour {
    --tour-surface: #fff;
    --tour-ink: var(--gx-ink);
    --tour-muted: var(--gx-muted);
    --tour-label: #0e7c66;
    --tour-primary: #0e7c66;
    --tour-primary-hover: #0b6857;
    --tour-secondary-bg: #fff;
    --tour-secondary-ring: #e2e8f0;
    --tour-secondary-ink: #0f172a;
    --tour-secondary-hover: #f8fafc;
    --tour-dot: #d9dfdc;
    --tour-scrim: rgba(0, 0, 0, 0.37);
    --tour-glow: 0 0 18px 4px rgba(56, 185, 150, 0.4);
    --tour-ring: rgba(56, 185, 150, 0.9);
    --tour-shadow: 0 22px 52px -10px rgba(7, 17, 13, 0.26);
    --tour-modal-shadow: 0 24px 64px -12px rgba(9, 11, 18, 0.38);
  }

  @media (prefers-color-scheme: dark) {
    .tour {
      --tour-surface: #171a21;
      --tour-label: #5fd3b0;
      --tour-primary: #12906f;
      --tour-primary-hover: #15a07c;
      --tour-secondary-bg: rgba(255, 255, 255, 0.04);
      --tour-secondary-ring: rgba(255, 255, 255, 0.16);
      --tour-secondary-ink: var(--gx-ink);
      --tour-secondary-hover: rgba(255, 255, 255, 0.08);
      --tour-dot: rgba(255, 255, 255, 0.18);
      --tour-scrim: rgba(0, 0, 0, 0.6);
      --tour-shadow: 0 22px 52px -10px rgba(0, 0, 0, 0.6);
      --tour-modal-shadow: 0 24px 64px -12px rgba(0, 0, 0, 0.7);
    }
  }

  .tour-scrim {
    position: fixed;
    inset: 0;
    z-index: 3000;
    pointer-events: none;
  }

  .tour-scrim path {
    fill: var(--tour-scrim);
    fill-rule: evenodd;
    pointer-events: auto;
  }

  .tour-scrim--clear path {
    fill: transparent;
  }

  .tour-spot {
    position: fixed;
    z-index: 3001;
    pointer-events: none;
    box-shadow: 0 0 0 2px var(--tour-ring), var(--tour-glow);
  }

  .tour-card {
    position: fixed;
    z-index: 3002;
    box-sizing: border-box;
    /* Figma's 340px, wider only when the footer needs it (long button labels,
       longer languages) so the actions never run into the right padding. */
    width: max-content;
    min-width: min(340px, calc(100vw - 24px));
    max-width: calc(100vw - 24px);
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 20px;
    background: var(--tour-surface);
    color: var(--tour-ink);
    border-radius: 16px;
    box-shadow: var(--tour-glow), var(--tour-shadow);
    font-family: var(--gx-font);
    outline: none;
  }

  .tour-card--modal {
    min-width: min(400px, calc(100vw - 24px));
    padding: 28px;
    gap: 24px;
    border-radius: 20px;
    box-shadow: var(--tour-modal-shadow);
  }

  .tour-card--hidden {
    visibility: hidden;
  }

  /* app.css paints every bare <button> as a lifting glass pill; these are
     flat, per the design. */
  .tour-card button,
  .tour-card button:hover,
  .tour-card button:active {
    transform: none;
    box-shadow: none;
    backdrop-filter: none;
  }

  .tour-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .tour-step {
    font-size: 11px;
    line-height: 15px;
    font-weight: 700;
    letter-spacing: 0.9px;
    text-transform: uppercase;
    color: var(--tour-label);
  }

  .tour-skip {
    font: inherit;
    font-size: 13px;
    line-height: 18px;
    font-weight: 500;
    color: var(--tour-muted);
    background: none;
    border: 0;
    padding: 2px 0;
    margin: 0;
    cursor: pointer;
    border-radius: 4px;
    backdrop-filter: none;
  }

  .tour-skip:hover {
    background: none;
    color: var(--tour-ink);
    text-decoration: underline;
  }

  /* The copy fills the card but never sets its width — the header and footer
     do — so long paragraphs wrap at the card's width instead of widening it. */
  .tour-body {
    display: flex;
    flex-direction: column;
    gap: 18px;
    width: 0;
    min-width: 100%;
  }

  .tour-copy {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .tour-icon {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    background: #2e8b68;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Design specifies Sora, not loaded in the app; Montserrat is the existing
     display face (as in Chat's empty state). */
  .tour-title {
    margin: 0;
    font-family: Sora, var(--gx-font-display);
    font-weight: 700;
    font-size: 23px;
    line-height: 30px;
    letter-spacing: -0.5px;
    color: var(--tour-ink);
  }

  .tour-card--modal .tour-title {
    font-size: 24px;
    line-height: 31px;
  }

  .tour-text {
    margin: 0;
    font-size: 14px;
    line-height: 21px;
    font-weight: 400;
    color: var(--tour-muted);
  }

  .tour-card--modal .tour-text {
    line-height: 22px;
  }

  .tour-foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .tour-dots {
    display: flex;
    align-items: center;
    gap: 7px;
    flex-shrink: 0;
  }

  .tour-dot {
    width: 6px;
    height: 6px;
    border-radius: 3px;
    background: var(--tour-dot);
    transition: width 0.2s ease, background-color 0.2s ease;
  }

  .tour-dot.is-done {
    background: var(--tour-primary);
  }

  .tour-dot.is-current {
    width: 18px;
    background: var(--tour-primary);
  }

  .tour-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .tour-btn {
    font-family: var(--gx-font);
    font-size: 14px;
    font-weight: 600;
    line-height: 1;
    height: 38px;
    padding: 0 16px;
    border-radius: 8px;
    border: 0;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    white-space: nowrap;
    backdrop-filter: none;
    transition: background-color 0.12s ease;
  }

  .tour-card--modal .tour-btn--primary {
    height: 40px;
  }

  .tour-btn--primary {
    background: var(--tour-primary);
    color: #fff;
  }

  .tour-btn--primary:hover {
    background: var(--tour-primary-hover);
  }

  .tour-card .tour-btn--secondary,
  .tour-card .tour-btn--secondary:hover,
  .tour-card .tour-btn--secondary:active {
    background: var(--tour-secondary-bg);
    color: var(--tour-secondary-ink);
    box-shadow: inset 0 0 0 1px var(--tour-secondary-ring);
  }

  .tour-card .tour-btn--secondary:hover {
    background: var(--tour-secondary-hover);
  }

  .tour-btn:focus-visible,
  .tour-skip:focus-visible {
    outline: 2px solid var(--tour-label);
    outline-offset: 2px;
  }

  :global([dir="rtl"]) .tour-btn__arrow {
    transform: scaleX(-1);
  }

  .tour-arrow {
    position: absolute;
    width: 14px;
    height: 14px;
    background: var(--tour-surface);
    transform: rotate(45deg);
    border-radius: 2px;
  }

  .tour-arrow--right { left: -7px; }
  .tour-arrow--left { right: -7px; }
  .tour-arrow--bottom { top: -7px; }
  .tour-arrow--top { bottom: -7px; }

  @media (prefers-reduced-motion: reduce) {
    .tour-dot {
      transition: none;
    }
  }
</style>
