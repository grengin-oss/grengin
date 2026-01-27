<script lang="ts">
  import { onMount } from "svelte";
  import { _ } from "svelte-i18n";

  interface Props {
    isOpen: boolean;
    title: string;
    onclose: () => void;
    children?: any;
  }

  let { isOpen = $bindable(), title, onclose, children }: Props = $props();

  let modalContainer = $state<HTMLDivElement | null>(null);

  // Track number of open modals globally
  const getModalCount = () =>
    parseInt(document.body.getAttribute("data-modal-count") || "0", 10);
  const setModalCount = (count: number) =>
    document.body.setAttribute("data-modal-count", count.toString());

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
      portal.style.zIndex = "9999";
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

  // Move modal to portal when open
  $effect(() => {
    const portal = getOrCreatePortal();

    if (isOpen && modalContainer) {
      // Check if not already in portal
      if (!portal.contains(modalContainer)) {
        portal.appendChild(modalContainer);

        // Increment modal count and lock body scroll
        const count = getModalCount() + 1;
        setModalCount(count);
        if (count === 1) {
          document.body.style.overflow = "hidden";
        }
      }
    }

    return () => {
      // Cleanup: remove from portal when closing or unmounting
      if (modalContainer && portal.contains(modalContainer)) {
        portal.removeChild(modalContainer);

        // Decrement modal count and restore scroll only if no modals left
        const count = Math.max(0, getModalCount() - 1);
        setModalCount(count);
        if (count === 0) {
          document.body.style.overflow = "";
        }
      }
    };
  });
</script>

{#if isOpen}
  <div bind:this={modalContainer}>
    <div
      class="modal-backdrop"
      onclick={handleBackdropClick}
      onkeydown={(e) => e.key === "Enter" && handleBackdropClick(e as any)}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      tabindex="-1"
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
    z-index: 9999;
    padding: var(--space-xl);
    animation: fadeIn 0.2s ease;
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
