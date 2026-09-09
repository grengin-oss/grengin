<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import { _ } from "svelte-i18n";

  interface Props {
    isOpen: boolean;
    title: string;
    onclose: () => void;
    children?: any;
    /** Optional element id inside the modal that describes the dialog's purpose/content. */
    descriptionId?: string;
    /** When true (default), restores focus to the previously focused element on close (WCAG focus management). */
    restoreFocusOnClose?: boolean;
    /**
     * "default" is the app-wide dark dialog; "organization" is the light
     * 424px card the Organization design uses (organization.html .edit-modal);
     * "access-control" is the 560px card from access-control.html, with the
     * gradient rule across the header and a pinned footer bar;
     * "ai-engines" and "ai-connect" are the two dialogs from ai-engines.html
     * (.cfg-modal, 560px, and .cnx-modal, 680px) — same gradient rule, but a
     * tinted footer whose actions sit right;
     * "mcp-servers" is the 560px card from mcp-servers.html (.add-modal), whose
     * footer slot is unpadded so the page can stack its own error banner above
     * the action bar;
     * "prompts" is the 580px card from prompts.html (.pr-modal) — a 6px
     * gradient rule, a tile-and-subtitle header, and a plain footer whose
     * actions sit right.
     */
    variant?:
      | "default"
      | "organization"
      | "access-control"
      | "ai-engines"
      | "ai-connect"
      | "mcp-servers"
      | "prompts";
    /** Pinned footer bar, outside the scrolling body (access-control design). */
    footer?: any;
    /** Second line under the title (ai-engines design: ".cfg-subtitle"). */
    subtitle?: string;
    /** Brand mark to the left of the title (ai-engines design). */
    headerIcon?: any;
    /** Status pill beside the title (ai-connect design: ".cnx-badge"). */
    headerBadge?: any;
  }

  let {
    isOpen = $bindable(),
    title,
    onclose,
    children,
    footer,
    subtitle,
    headerIcon,
    headerBadge,
    descriptionId,
    restoreFocusOnClose = true,
    variant = "default",
  }: Props = $props();

  let modalContainer = $state<HTMLDivElement | null>(null);
  let modalBackdrop = $state<HTMLDivElement | null>(null);
  /** Element that had focus before this dialog opened (plain ref, not reactive) */
  let focusReturnTarget: HTMLElement | null = null;
  /** Unique ID for this modal instance */
  const modalId = crypto.randomUUID();
  const titleId = `modal-title-${modalId}`;

  // Track modal stack globally
  const getModalStack = (): string[] => {
    const stack = document.body.getAttribute("data-modal-stack");
    return stack ? JSON.parse(stack) : [];
  };
  const setModalStack = (stack: string[]) => {
    document.body.setAttribute("data-modal-stack", JSON.stringify(stack));
  };
  const isTopModal = (): boolean => {
    const stack = getModalStack();
    return stack[stack.length - 1] === modalId;
  };

  // Track number of open modals globally
  const getModalCount = () =>
    parseInt(document.body.getAttribute("data-modal-count") || "0", 10);
  const setModalCount = (count: number) =>
    document.body.setAttribute("data-modal-count", count.toString());
  const updateBodyScrollLock = (count: number) => {
    document.body.style.overflow = count > 0 ? "hidden" : "";
  };

  /** Main app lives in #app; modals port to #modal-portal. Hide #app from AT so SR/hover does not reach charts behind. */
  function lockMainAppFromAssistiveTech() {
    const app = document.getElementById("app");
    if (!(app instanceof HTMLElement)) return;
    app.setAttribute("aria-hidden", "true");
    app.inert = true;
  }

  function unlockMainAppFromAssistiveTech() {
    const app = document.getElementById("app");
    if (!(app instanceof HTMLElement)) return;
    app.removeAttribute("aria-hidden");
    app.inert = false;
  }

  function handleEscape(event: KeyboardEvent) {
    // Only close if this is the topmost modal
    if (event.key === "Escape" && isOpen && isTopModal()) {
      onclose();
    }
  }

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      onclose();
    }
  }

  // Ensure portal exists
  function getOrCreatePortal(): HTMLElement {
    let portal = document.getElementById("modal-portal");
    if (!portal) {
      portal = document.createElement("div");
      portal.id = "modal-portal";
      portal.style.position = "relative";
      portal.style.zIndex = "1000";
      document.body.appendChild(portal);
    }
    return portal;
  }

  onMount(() => {
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  });

  let wasOpen = $state(false);

  function incrementModalCount() {
    const prev = getModalCount();
    const count = prev + 1;
    setModalCount(count);
    updateBodyScrollLock(count);
    if (prev === 0) {
      lockMainAppFromAssistiveTech();
    }
    // Add this modal to the stack
    const stack = getModalStack();
    stack.push(modalId);
    setModalStack(stack);
  }

  function decrementModalCount() {
    const count = Math.max(0, getModalCount() - 1);
    setModalCount(count);
    updateBodyScrollLock(count);
    if (count === 0) {
      unlockMainAppFromAssistiveTech();
    }
    // Remove this modal from the stack
    const stack = getModalStack();
    const index = stack.indexOf(modalId);
    if (index !== -1) {
      stack.splice(index, 1);
      setModalStack(stack);
    }
  }

  function captureFocusReturnTarget() {
    const el = document.activeElement;
    if (
      el instanceof HTMLElement &&
      el !== document.body &&
      el !== document.documentElement
    ) {
      focusReturnTarget = el;
    } else {
      focusReturnTarget = null;
    }
  }

  function scheduleRestoreFocus() {
    if (!restoreFocusOnClose) {
      focusReturnTarget = null;
      return;
    }
    const el = focusReturnTarget;
    focusReturnTarget = null;
    tick().then(() => {
      setTimeout(() => {
        if (el?.isConnected) {
          el.focus({ preventScroll: true });
        } else {
          // If the element is no longer in the DOM, focus the next modal in the stack
          const stack = getModalStack();
          if (stack.length > 0) {
            // Find the topmost modal and focus it
            const topModalId = stack[stack.length - 1];
            const topModalElement = document.querySelector(`[data-modal-id="${topModalId}"]`);
            if (topModalElement instanceof HTMLElement) {
              topModalElement.focus({ preventScroll: true });
            }
          }
        }
      }, 0);
    });
  }

  // Move modal to portal when open
  $effect(() => {
    const portal = getOrCreatePortal();

    if (isOpen && modalContainer) {
      // Check if not already in portal
      if (!portal.contains(modalContainer)) {
        portal.appendChild(modalContainer);
      }

      if (!wasOpen) {
        captureFocusReturnTarget();
        incrementModalCount();
        wasOpen = true;
        // Focus dialog only on open — not on every effect re-run (nested modals would lose restored focus)
        tick().then(() => {
          modalBackdrop?.focus();
        });
      }
    } else if (!isOpen && wasOpen) {
      scheduleRestoreFocus();
      decrementModalCount();
      wasOpen = false;
    }

    return () => {
      // Cleanup: remove from portal when closing or unmounting
      if (modalContainer && portal.contains(modalContainer)) {
        portal.removeChild(modalContainer);
      }
    };
  });

  onDestroy(() => {
    if (wasOpen) {
      scheduleRestoreFocus();
      decrementModalCount();
      wasOpen = false;
    }
  });
</script>

{#if isOpen}
  <div bind:this={modalContainer}>
    <div
      bind:this={modalBackdrop}
      class="modal-backdrop"
      class:modal-backdrop--org={variant === "organization"}
      class:modal-backdrop--ac={variant === "access-control"}
      class:modal-backdrop--ae={variant === "ai-engines" ||
        variant === "ai-connect"}
      class:modal-backdrop--mcp={variant === "mcp-servers"}
      class:modal-backdrop--pr={variant === "prompts"}
      data-modal-id={modalId}
      onclick={handleBackdropClick}
      onkeydown={(e) => e.key === "Enter" && handleBackdropClick(e as any)}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      tabindex="0"
    >
      <div
        class="modal-content"
        class:modal-content--org={variant === "organization"}
        class:modal-content--ac={variant === "access-control"}
        class:modal-content--ae={variant === "ai-engines"}
        class:modal-content--cnx={variant === "ai-connect"}
        class:modal-content--mcp={variant === "mcp-servers"}
        class:modal-content--pr={variant === "prompts"}
      >
        <div class="modal-header">
          <div class="modal-header-left">
            {#if headerIcon}
              <span class="modal-header-icon">{@render headerIcon()}</span>
            {/if}
            <div class="modal-heading">
              <h2 id={titleId} class="modal-title">{title}</h2>
              {#if subtitle}
                <p class="modal-subtitle">{subtitle}</p>
              {/if}
            </div>
            {#if headerBadge}
              {@render headerBadge()}
            {/if}
          </div>
          <button
            type="button"
            class="modal-close"
            onclick={onclose}
            aria-label={$_("admin.common.closeModal")}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div class="modal-body">
          {@render children?.()}
        </div>
        {#if footer}
          <div class="modal-footer">
            {@render footer()}
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  /* ===== "access-control" variant (access-control.html .modal) =====
     Selectors are doubled up (.modal-content.modal-content--ac) because the base
     .modal-content rules live further down this stylesheet — at equal specificity
     they would win on source order and the card would keep the default 600px/24px. */
  .modal-backdrop.modal-backdrop--ac {
    background: var(--gx-ac-modal-scrim);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .modal-content.modal-content--ac {
    width: 560px;
    max-width: calc(100vw - 32px);
    max-height: 87vh;
    overflow: hidden;
    border: none;
    border-radius: 20px;
    background: var(--gx-card);
    box-shadow: var(--gx-ac-modal-shadow);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    display: flex;
    flex-direction: column;
  }

  /* The design rules the top of the header with a blue-to-green gradient. */
  .modal-content.modal-content--ac .modal-header {
    position: relative;
    min-height: 74px;
    padding: 20px 24px;
    border: none;
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    flex-shrink: 0;
  }

  .modal-content.modal-content--ac .modal-header::before {
    content: "";
    position: absolute;
    inset-inline: 0;
    top: 0;
    height: 5px;
    background: linear-gradient(90deg, rgb(74, 125, 212) 0%, rgb(46, 168, 117) 100%);
  }

  .modal-content.modal-content--ac .modal-title {
    font-family: var(--gx-font);
    font-weight: 700;
    font-size: 18px;
    color: var(--gx-slate-900);
  }

  .modal-content.modal-content--ac .modal-close {
    width: 34px;
    height: 34px;
    border-radius: 8px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    color: var(--gx-slate-500);
    flex-shrink: 0;
    transition: background-color 120ms ease;
  }

  .modal-content.modal-content--ac .modal-close:hover {
    background: var(--gx-org-track);
  }

  .modal-content.modal-content--ac .modal-body {
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 24px;
    align-items: flex-start;
    align-self: stretch;
    overflow-y: auto;
    flex-grow: 1;
    min-height: 0;
  }

  .modal-content.modal-content--ac .modal-footer {
    min-height: 77px;
    background: var(--gx-card);
    box-shadow:
      inset 0 0 0 1px var(--gx-hair),
      inset 0 -4px 8px 0 rgba(0, 0, 0, 0.0392);
    display: flex;
    padding: 20px 24px;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    flex-shrink: 0;
  }

  /* ===== Header pieces, shared by every variant =====
     The title — with its optional brand mark, subtitle and status pill — on the
     left, the close button on the right. Variants that pass none of the three
     render exactly what they did before: a lone <h2> beside the button. */
  .modal-header-left {
    display: flex;
    gap: 12px;
    align-items: center;
    min-width: 0;
  }

  /* ".cfg-header-left" opens up a little when a subtitle stacks under the title. */
  .modal-header-left:has(.modal-subtitle) {
    gap: 16px;
  }

  .modal-heading {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  .modal-header-icon {
    display: flex;
    flex-shrink: 0;
  }

  .modal-subtitle {
    margin: 0;
    font-family: var(--gx-font);
    font-weight: 400;
    font-size: 13px;
    line-height: 100%;
    color: var(--gx-ae-muted);
  }

  /* ===== "ai-engines" / "ai-connect" variants (ai-engines.html .cfg-modal and
     .cnx-modal) — same gradient-ruled header as access-control, but the footer
     is tinted and its actions sit right. Selectors are doubled for the same
     reason as the access-control block above. ===== */
  .modal-backdrop.modal-backdrop--ae {
    background: var(--gx-ac-modal-scrim);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .modal-content.modal-content--ae,
  .modal-content.modal-content--cnx {
    max-height: 88vh;
    overflow: hidden;
    border: none;
    background: var(--gx-card);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    display: flex;
    flex-direction: column;
    font-family: var(--gx-font);
  }

  .modal-content.modal-content--ae {
    width: 560px;
    max-width: calc(100vw - 32px);
    border-radius: 18px;
    box-shadow: var(--gx-ae-modal-shadow);
  }

  .modal-content.modal-content--cnx {
    width: 680px;
    max-width: 92vw;
    border-radius: 20px;
    box-shadow: var(--gx-ae-connect-shadow);
  }

  .modal-content.modal-content--ae .modal-header,
  .modal-content.modal-content--cnx .modal-header {
    position: relative;
    border: none;
    flex-shrink: 0;
  }

  .modal-content.modal-content--ae .modal-header {
    min-height: 79px;
    padding: 20px 24px;
    box-shadow: inset 0 0 0 1px var(--gx-ae-hair);
  }

  .modal-content.modal-content--cnx .modal-header {
    min-height: 76px;
    padding: 20px 20px 20px 24px;
    box-shadow: inset 0 0 0 1px var(--gx-line);
  }

  .modal-content.modal-content--ae .modal-header::before,
  .modal-content.modal-content--cnx .modal-header::before {
    content: "";
    position: absolute;
    inset-inline: 0;
    top: 0;
    height: 5px;
    background: linear-gradient(
      90deg,
      rgb(74, 125, 212) 0%,
      rgb(46, 168, 117) 100%
    );
  }

  .modal-content.modal-content--ae .modal-title {
    font-family: var(--gx-font);
    font-weight: 600;
    font-size: 16px;
    line-height: 100%;
    color: var(--gx-ae-ink);
  }

  .modal-content.modal-content--cnx .modal-title {
    font-family: var(--gx-font);
    font-weight: 700;
    font-size: 18px;
    line-height: 100%;
    color: var(--gx-ink);
  }

  .modal-content.modal-content--ae .modal-close,
  .modal-content.modal-content--cnx .modal-close {
    width: 34px;
    height: 34px;
    border-radius: 8px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    color: var(--gx-an-sub);
    flex-shrink: 0;
    transition: background-color 120ms ease;
  }

  .modal-content.modal-content--ae .modal-close:hover,
  .modal-content.modal-content--cnx .modal-close:hover {
    background: var(--gx-hover-soft);
    color: var(--gx-an-sub);
  }

  .modal-content.modal-content--ae .modal-close svg,
  .modal-content.modal-content--cnx .modal-close svg {
    width: 16px;
    height: 16px;
  }

  .modal-content.modal-content--ae .modal-body {
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 24px;
    align-items: flex-start;
    align-self: stretch;
    overflow-y: auto;
    flex-grow: 1;
    min-height: 0;
  }

  .modal-content.modal-content--cnx .modal-body {
    display: flex;
    flex-direction: column;
    gap: 28px;
    padding: 32px;
    align-items: center;
    align-self: stretch;
    overflow-y: auto;
    flex-grow: 1;
    min-height: 0;
  }

  .modal-content.modal-content--ae .modal-footer,
  .modal-content.modal-content--cnx .modal-footer {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    flex-shrink: 0;
  }

  .modal-content.modal-content--ae .modal-footer {
    min-height: 90px;
    padding: 16px 24px;
    background: var(--gx-ae-chip);
    border-top: 1px solid var(--gx-ae-hair);
  }

  .modal-content.modal-content--cnx .modal-footer {
    min-height: 88px;
    padding: 20px;
    background: var(--gx-surface-rail);
    border-top: 1px solid var(--gx-line);
  }

  /* ===== "mcp-servers" variant (mcp-servers.html .add-modal) =====
     560px card, a 6px gradient rule across the top, and a footer slot the page
     fills itself: the design stacks a full-bleed error banner directly on the
     action bar, so this variant hands over an unpadded, unruled footer rather
     than painting one. Selectors are doubled for the same reason as the
     variants above — the base .modal-content rules come later in this sheet. */
  .modal-backdrop.modal-backdrop--mcp {
    background: var(--gx-ac-modal-scrim);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .modal-content.modal-content--mcp {
    position: relative;
    width: 560px;
    max-width: calc(100vw - 32px);
    max-height: 90vh;
    overflow: hidden;
    border: none;
    border-radius: 20px;
    background: var(--gx-card);
    box-shadow: var(--gx-mcp-modal-shadow);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    display: flex;
    flex-direction: column;
    font-family: var(--gx-font);
  }

  .modal-content.modal-content--mcp .modal-header {
    position: relative;
    min-height: 85px;
    padding: 20px 24px;
    border: none;
    box-shadow: inset 0 0 0 1px var(--gx-mcp-m-hair);
    flex-shrink: 0;
  }

  .modal-content.modal-content--mcp .modal-header::before {
    content: "";
    position: absolute;
    inset-inline: 0;
    top: 0;
    height: 6px;
    background: linear-gradient(
      90deg,
      rgb(74, 125, 212) 0%,
      rgb(46, 168, 117) 100%
    );
  }

  .modal-content.modal-content--mcp .modal-title {
    font-family: var(--gx-font);
    font-weight: 700;
    font-size: 22px;
    line-height: 100%;
    color: var(--gx-mcp-m-ink);
  }

  .modal-content.modal-content--mcp .modal-subtitle {
    color: var(--gx-mcp-dim);
  }

  /* The design keeps the brand tile 12px from the heading even with a subtitle,
     where the shared rule opens the gap to 16px. */
  .modal-content.modal-content--mcp .modal-header-left:has(.modal-subtitle) {
    gap: 12px;
  }

  .modal-content.modal-content--mcp .modal-heading {
    gap: 4px;
  }

  .modal-content.modal-content--mcp .modal-close {
    width: 34px;
    height: 34px;
    border-radius: 8px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    color: var(--gx-an-sub);
    flex-shrink: 0;
    transition: background-color 120ms ease;
  }

  .modal-content.modal-content--mcp .modal-close:hover {
    background: var(--gx-mcp-m-hair);
    color: var(--gx-an-sub);
  }

  .modal-content.modal-content--mcp .modal-close svg {
    width: 16px;
    height: 16px;
  }

  /* Sections own their own rules and vertical rhythm, so the body only sets the
     gutters and the scroll. */
  .modal-content.modal-content--mcp .modal-body {
    display: flex;
    flex-direction: column;
    padding: 6px 24px 20px;
    align-items: stretch;
    align-self: stretch;
    overflow-y: auto;
    flex-grow: 1;
    min-height: 0;
  }

  .modal-content.modal-content--mcp .modal-footer {
    display: block;
    padding: 0;
    border: none;
    background: none;
    box-shadow: none;
    flex-shrink: 0;
  }

  /* ===== "prompts" variant (prompts.html .pr-modal) =====
     580px card, the same 6px gradient rule as mcp-servers, a 40px brand tile
     beside a title-and-subtitle heading, and a plain white footer whose actions
     sit right. Selectors are doubled for the same reason as the variants above
     — the base .modal-content rules come later in this sheet. */
  .modal-backdrop.modal-backdrop--pr {
    background: var(--gx-ac-modal-scrim);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .modal-content.modal-content--pr {
    position: relative;
    width: 580px;
    max-width: calc(100vw - 32px);
    max-height: 90vh;
    overflow: hidden;
    border: none;
    border-radius: 20px;
    background: var(--gx-card);
    box-shadow: var(--gx-pr-modal-shadow);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    display: flex;
    flex-direction: column;
    font-family: var(--gx-font);
  }

  .modal-content.modal-content--pr .modal-header {
    position: relative;
    min-height: 90px;
    padding: 24px;
    border: none;
    border-bottom: 1px solid var(--gx-hair);
    flex-shrink: 0;
  }

  .modal-content.modal-content--pr .modal-header::before {
    content: "";
    position: absolute;
    inset-inline: 0;
    top: 0;
    height: 6px;
    background: linear-gradient(
      90deg,
      rgb(74, 125, 212) 0%,
      rgb(46, 168, 117) 100%
    );
  }

  .modal-content.modal-content--pr .modal-title {
    font-family: var(--gx-font);
    font-weight: 700;
    font-size: 20px;
    line-height: 100%;
    color: var(--gx-slate-900);
  }

  .modal-content.modal-content--pr .modal-subtitle {
    font-size: 13px;
    color: var(--gx-slate-500);
  }

  .modal-content.modal-content--pr .modal-heading {
    gap: 4px;
  }

  .modal-content.modal-content--pr .modal-close {
    width: 34px;
    height: 34px;
    border-radius: 8px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-an-chip-ring);
    color: var(--gx-an-sub);
    flex-shrink: 0;
    transition: background-color 120ms ease;
  }

  .modal-content.modal-content--pr .modal-close:hover {
    background: var(--gx-an-insight-bg);
    color: var(--gx-an-sub);
  }

  .modal-content.modal-content--pr .modal-close svg {
    width: 16px;
    height: 16px;
  }

  .modal-content.modal-content--pr .modal-body {
    display: flex;
    flex-direction: column;
    gap: 24px;
    padding: 24px;
    align-items: stretch;
    align-self: stretch;
    overflow-y: auto;
    flex-grow: 1;
    min-height: 0;
  }

  .modal-content.modal-content--pr .modal-footer {
    min-height: 79px;
    display: flex;
    gap: 12px;
    padding: 20px;
    justify-content: flex-end;
    align-items: center;
    background: var(--gx-card);
    border-top: 1px solid var(--gx-hair);
    flex-shrink: 0;
  }

  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: var(--space-xl);
    animation: fadeIn 0.2s ease;
    outline: none;
  }

  .modal-backdrop:focus {
    outline: 2px solid var(--brand-blue);
    outline-offset: 2px;
  }

  .modal-backdrop:focus-visible {
    outline: 2px solid var(--brand-blue);
    outline-offset: 2px;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .modal-content {
    background: var(--bg-primary);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: var(--radius-xl);
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    max-width: 600px;
    width: 100%;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    animation: slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    overflow: hidden;
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-xl);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .modal-title {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0;
  }

  .modal-close {
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
    transition: all 0.2s ease;
  }

  .modal-close:hover {
    background: rgba(255, 255, 255, 0.08);
    color: var(--text-primary);
  }

  .modal-close:focus {
    background: var(--brand-blue);
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.5);
  }

  .modal-close:focus-visible {
    background: var(--brand-blue);
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.5);
  }

  .modal-close svg {
    width: 1.25rem;
    height: 1.25rem;
  }

  .modal-body {
    padding: var(--space-xl);
    overflow-y: auto;
    flex: 1;
    min-height: 0;
  }

  /* ---------------- Organization variant (design: .edit-modal) ---------------- */
  .modal-backdrop--org {
    background: rgba(15, 23, 42, 0.32);
    backdrop-filter: none;
    padding: 24px;
  }

  .modal-content--org {
    width: 424px;
    max-width: 100%;
    border: 0;
    border-radius: 16px;
    background: var(--gx-card);
    box-shadow:
      inset 0 0 0 1px var(--gx-hair),
      0 4px 16px 0 rgba(0, 0, 0, 0.0314);
    font-family: var(--gx-font);
  }

  .modal-content--org .modal-header {
    padding: 24px 24px 0;
    border-bottom: 0;
  }

  .modal-content--org .modal-title {
    font-weight: 700;
    font-size: 18px;
    line-height: 100%;
    color: var(--gx-slate-900);
  }

  .modal-content--org .modal-close {
    width: 24px;
    height: 24px;
    border-radius: 999px;
    background: var(--gx-org-track);
    color: var(--gx-slate-500);
    flex-shrink: 0;
  }

  .modal-content--org .modal-close:hover {
    background: var(--gx-hair);
    color: var(--gx-slate-500);
  }

  .modal-content--org .modal-close svg {
    width: 12px;
    height: 12px;
  }

  .modal-content--org .modal-body {
    padding: 24px;
  }

  @media (max-width: 768px) {
    .modal-content {
      max-width: 100%;
      max-height: 100vh;
      border-radius: 0;
    }

    .modal-backdrop {
      padding: 0;
    }

    .modal-content--org {
      max-height: 100vh;
      border-radius: 16px;
    }
  }
</style>
