<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import { _ } from "svelte-i18n";

  interface Props {
    isOpen: boolean;
    title: string;
    onclose: () => void;
    children?: any;
  }

  let { isOpen = $bindable(), title, onclose, children }: Props = $props();

  let modalContainer = $state<HTMLDivElement | null>(null);
  let modalBackdrop = $state<HTMLDivElement | null>(null);

  // Track number of open modals globally
  const getModalCount = () =>
    parseInt(document.body.getAttribute("data-modal-count") || "0", 10);
  const setModalCount = (count: number) =>
    document.body.setAttribute("data-modal-count", count.toString());
  const updateBodyScrollLock = (count: number) => {
    document.body.style.overflow = count > 0 ? "hidden" : "";
  };

  function handleEscape(event: KeyboardEvent) {
    if (event.key === "Escape" && isOpen) {
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
    const count = getModalCount() + 1;
    setModalCount(count);
    updateBodyScrollLock(count);
  }

  function decrementModalCount() {
    const count = Math.max(0, getModalCount() - 1);
    setModalCount(count);
    updateBodyScrollLock(count);
  }

  // Move modal to portal when open
  $effect(() => {
    const portal = getOrCreatePortal();

    if (isOpen && modalContainer) {
      // Check if not already in portal
      if (!portal.contains(modalContainer)) {
        portal.appendChild(modalContainer);

        // Increment modal count and lock body scroll
        if (!wasOpen) {
          incrementModalCount();
          wasOpen = true;
        }
      }

      // Focus the modal for keyboard accessibility
      if (modalBackdrop) {
        tick().then(() => {
          modalBackdrop?.focus();
        });
      }
    } else if (!isOpen && wasOpen) {
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
      onclick={handleBackdropClick}
      onkeydown={(e) => e.key === "Enter" && handleBackdropClick(e as any)}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      tabindex="0"
    >
      <div class="modal-content">
        <div class="modal-header">
          <h2 id="modal-title" class="modal-title">{title}</h2>
          <button
            class="modal-close"
            onclick={onclose}
            aria-label={$_("admin.common.closeModal")}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
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

  @media (max-width: 768px) {
    .modal-content {
      max-width: 100%;
      max-height: 100vh;
      border-radius: 0;
    }

    .modal-backdrop {
      padding: 0;
    }
  }
</style>
