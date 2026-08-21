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
     * 424px card the Organization design uses (organization.html .edit-modal).
     */
    variant?: "default" | "organization";
  }

  let {
    isOpen = $bindable(),
    title,
    onclose,
    children,
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
      data-modal-id={modalId}
      onclick={handleBackdropClick}
      onkeydown={(e) => e.key === "Enter" && handleBackdropClick(e as any)}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      tabindex="0"
    >
      <div class="modal-content" class:modal-content--org={variant === "organization"}>
        <div class="modal-header">
          <h2 id={titleId} class="modal-title">{title}</h2>
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
      </div>
    </div>
  </div>
{/if}

<style>
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
