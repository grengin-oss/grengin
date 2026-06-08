<script lang="ts">
  import { tick } from "svelte";
  import { _ } from "svelte-i18n";
  import Modal from "../Modal.svelte";

  interface Props {
    isOpen: boolean;
    /** Modal title. */
    title: string;
    /** Disruption-warning copy shown above the typed-confirmation field. */
    warning: string;
    /**
     * The exact string the operator must type to enable the destructive
     * action (the new domain for the domain flow, `CONFIRM` for binaries).
     */
    confirmPhrase: string;
    /** Label for the typed-confirmation field. */
    typeLabel: string;
    /** Label of the destructive confirm button. */
    confirmLabel: string;
    /** True while the run is in flight: locks the modal + spins the button. */
    running?: boolean;
    onconfirm: () => void;
    oncancel: () => void;
  }

  let {
    isOpen = $bindable(),
    title,
    warning,
    confirmPhrase,
    typeLabel,
    confirmLabel,
    running = false,
    onconfirm,
    oncancel,
  }: Props = $props();

  let typed = $state("");
  let inputEl = $state<HTMLInputElement | null>(null);
  const descriptionId = "reconfigure-confirm-warning";

  // Enable the destructive button only on an exact match (trimmed).
  const matches = $derived(typed.trim() === confirmPhrase.trim());

  // Reset the typed value and focus the field each time the modal opens.
  let wasOpen = $state(false);
  $effect(() => {
    if (isOpen && !wasOpen) {
      typed = "";
      tick().then(() => inputEl?.focus());
    }
    wasOpen = isOpen;
  });

  // Modal.svelte routes both the backdrop click and Escape through `onclose`.
  // While a run is in flight the modal must be non-dismissible, so swallow it.
  function handleClose() {
    if (running) return;
    oncancel();
  }

  function handleConfirm() {
    if (!matches || running) return;
    onconfirm();
  }
</script>

<Modal {isOpen} {title} onclose={handleClose} {descriptionId}>
  <div class="confirm">
    <p id={descriptionId} class="confirm__warning" role="alert">{warning}</p>

    <div class="confirm__field">
      <label for="reconfigure-confirm-input">{typeLabel}</label>
      <p class="confirm__phrase"><code>{confirmPhrase}</code></p>
      <input
        id="reconfigure-confirm-input"
        bind:this={inputEl}
        type="text"
        bind:value={typed}
        autocomplete="off"
        autocapitalize="off"
        autocorrect="off"
        spellcheck="false"
        disabled={running}
        onkeydown={(e) => e.key === "Enter" && handleConfirm()}
      />
    </div>

    <div class="confirm__actions">
      <button
        type="button"
        class="btn-secondary"
        onclick={oncancel}
        disabled={running}
      >
        {$_("admin.maintenance.domain.confirm.cancel")}
      </button>
      <button
        type="button"
        class="btn-danger"
        onclick={handleConfirm}
        disabled={!matches || running}
      >
        {#if running}
          <span class="confirm__spinner" aria-hidden="true"></span>
        {/if}
        {confirmLabel}
      </button>
    </div>
  </div>
</Modal>

<style>
  .confirm {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .confirm__warning {
    margin: 0;
    padding: var(--space-md);
    border-radius: var(--radius-md);
    background: rgba(239, 68, 68, 0.08);
    border: 1px solid rgba(239, 68, 68, 0.2);
    color: var(--text-primary);
    font-size: 0.875rem;
    line-height: 1.5;
  }

  .confirm__field {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .confirm__field label {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text-secondary);
  }

  .confirm__phrase {
    margin: 0;
  }

  .confirm__phrase code {
    font-family: "SF Mono", "Menlo", "Consolas", monospace;
    font-size: 0.875rem;
    color: var(--text-primary);
    padding: 0.125rem 0.375rem;
    border-radius: var(--radius-sm);
    background: rgba(255, 255, 255, 0.06);
  }

  .confirm__field input {
    padding: 0.625rem 0.75rem;
    border: 1px solid var(--glass-stroke-dark);
    border-radius: var(--radius-md);
    background: var(--input-bg, rgba(0, 0, 0, 0.2));
    color: var(--text-primary);
    font-size: 0.875rem;
    font-family: "SF Mono", "Menlo", "Consolas", monospace;
  }

  .confirm__field input:focus-visible {
    outline: 2px solid var(--brand-ring);
    outline-offset: 1px;
    border-color: var(--brand);
  }

  .confirm__field input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .confirm__actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-sm);
  }

  .btn-danger {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 1.25rem;
    border: none;
    border-radius: var(--radius-md);
    background: #ef4444;
    color: #fff;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn-danger:hover:not(:disabled) {
    background: #dc2626;
  }

  .btn-danger:focus-visible {
    outline: 2px solid var(--brand-ring);
    outline-offset: 2px;
  }

  .btn-danger:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .confirm__spinner {
    width: 0.875rem;
    height: 0.875rem;
    border: 2px solid rgba(255, 255, 255, 0.4);
    border-top-color: #fff;
    border-radius: 50%;
    animation: confirm-spin 0.7s linear infinite;
  }

  @keyframes confirm-spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
