<script lang="ts">
  import { _ } from "svelte-i18n";

  interface Props {
    /** Whether the reconfigure run succeeded. */
    success: boolean;
    /** Human-readable summary message from the API. */
    message: string;
    /** Absolute path of the host script that ran. */
    scriptPath?: string | null;
    /**
     * Captured stdout lines. OPTIONAL on the API — may be absent; we render
     * `output ?? []` and show an explicit "no output captured" state when empty.
     */
    output?: string[];
  }

  let { success, message, scriptPath = null, output }: Props = $props();

  // Per the PRD: render `output ?? []`, never as HTML.
  const lines = $derived(output ?? []);
  const hasOutput = $derived(lines.length > 0);

  let showDetails = $state(false);
  let copied = $state(false);
  let copyResetTimer: ReturnType<typeof setTimeout> | null = null;

  async function copyLog() {
    const text = lines.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
      if (copyResetTimer) clearTimeout(copyResetTimer);
      copyResetTimer = setTimeout(() => (copied = false), 2000);
    } catch (err) {
      console.error("Failed to copy reconfigure log:", err);
    }
  }
</script>

<div class="console" role="status" aria-live="polite">
  <header class="console__header">
    <span
      class="console__status"
      class:console__status--ok={success}
      class:console__status--fail={!success}
    >
      {#if success}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        {$_("admin.maintenance.console.success")}
      {:else}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
        {$_("admin.maintenance.console.failure")}
      {/if}
    </span>
    <p class="console__message">{message}</p>
    {#if hasOutput}
      <button type="button" class="console__copy" onclick={copyLog}>
        {copied
          ? $_("admin.maintenance.console.copied")
          : $_("admin.maintenance.console.copy")}
      </button>
    {/if}
  </header>

  {#if hasOutput}
    <!-- Intentionally focusable so the captured log is keyboard-scrollable
         (PRD §13); labelled for screen readers. The a11y rule flags tabindex on
         a noninteractive element, but a scrollable region is the exception. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <pre
      class="console__log"
      tabindex="0"
      aria-label={$_("admin.maintenance.console.title")}>{lines.join("\n")}</pre>
  {:else}
    <p class="console__no-output">{$_("admin.maintenance.console.noOutput")}</p>
  {/if}

  {#if scriptPath}
    <button
      type="button"
      class="console__details-toggle"
      aria-expanded={showDetails}
      onclick={() => (showDetails = !showDetails)}
    >
      {$_("admin.maintenance.console.scriptDetails")}
    </button>
    {#if showDetails}
      <dl class="console__details">
        <dt>{$_("admin.maintenance.console.scriptPath")}</dt>
        <dd><code>{scriptPath}</code></dd>
      </dl>
    {/if}
  {/if}
</div>

<style>
  .console {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    margin-top: var(--space-md);
  }

  .console__header {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    flex-wrap: wrap;
  }

  .console__status {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    font-weight: 700;
    font-size: 0.875rem;
  }

  .console__status svg {
    width: 1rem;
    height: 1rem;
  }

  .console__status--ok {
    color: #34d399;
  }

  .console__status--fail {
    color: #ef4444;
  }

  .console__message {
    margin: 0;
    font-size: 0.875rem;
    color: var(--text-secondary);
    flex: 1;
    min-width: 0;
  }

  .console__copy {
    margin-inline-start: auto;
    padding: 0.25rem 0.625rem;
    border: 1px solid var(--glass-stroke-dark);
    border-radius: var(--radius-sm);
    background: var(--btn-secondary);
    color: var(--text-secondary);
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .console__copy:hover {
    color: var(--brand);
    border-color: var(--brand);
  }

  .console__copy:focus-visible {
    outline: 2px solid var(--brand-ring);
    outline-offset: 2px;
  }

  /* Mirrors the detail-json styling from AuditLogs.svelte. */
  .console__log {
    margin: 0;
    max-height: 320px;
    overflow: auto;
    padding: var(--space-md);
    border-radius: var(--radius-md);
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid rgba(255, 255, 255, 0.08);
    font-family: "SF Mono", "Menlo", "Consolas", monospace;
    font-size: 0.75rem;
    line-height: 1.6;
    color: var(--text-secondary);
    white-space: pre-wrap;
    word-break: break-word;
  }

  .console__log:focus-visible {
    outline: 2px solid var(--brand-ring);
    outline-offset: 2px;
  }

  .console__no-output {
    margin: 0;
    padding: var(--space-md);
    border-radius: var(--radius-md);
    background: rgba(255, 255, 255, 0.03);
    border: 1px dashed rgba(255, 255, 255, 0.12);
    font-size: 0.8125rem;
    font-style: italic;
    color: var(--text-secondary);
  }

  .console__details-toggle {
    align-self: flex-start;
    background: none;
    border: none;
    padding: 0;
    color: var(--brand);
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
  }

  .console__details-toggle:focus-visible {
    outline: 2px solid var(--brand-ring);
    outline-offset: 2px;
  }

  .console__details {
    margin: 0;
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--space-xs) var(--space-md);
  }

  .console__details dt {
    font-weight: 600;
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .console__details dd {
    margin: 0;
  }

  .console__details code {
    font-family: "SF Mono", "Menlo", "Consolas", monospace;
    font-size: 0.75rem;
    color: var(--text-primary);
  }
</style>
