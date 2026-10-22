<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { _ } from "svelte-i18n";

  // Presentational: tracks this conversation's spend and context window usage.
  let {
    conversationCost = 0,
    conversationTokens = 0,
    contextWindow = 0,
    modelName = "",
  }: {
    conversationCost?: number;
    conversationTokens?: number;
    contextWindow?: number;
    modelName?: string;
  } = $props();

  let open = $state(false);
  let wrapperEl: HTMLDivElement | undefined = $state(undefined);

  // Circumference of the trigger's progress ring (r = 8.5)
  const RING_R = 8.5;
  const RING_C = 2 * Math.PI * RING_R;

  function money(n: number): string {
    if (!n || n <= 0) return "$0.00";
    if (n < 0.001) return "<$0.001";
    if (n < 0.01) return `$${n.toFixed(3)}`;
    return `$${n.toFixed(2)}`;
  }

  function formatTokens(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 10_000) return `${Math.round(n / 1_000)}k`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return `${n}`;
  }

  // Context-window usage for this chat: how full the selected model's context
  // window is getting. Shown when the model reports a window and tokens are spent.
  const ctxPct = $derived.by(() => {
    if (!contextWindow || contextWindow <= 0 || conversationTokens <= 0)
      return null;
    return Math.min(100, (conversationTokens / contextWindow) * 100);
  });

  const remainingTokens = $derived(
    contextWindow > conversationTokens ? contextWindow - conversationTokens : 0,
  );

  const ctxLevel = $derived.by<"healthy" | "warning" | "critical">(() => {
    if (ctxPct === null) return "healthy";
    if (ctxPct >= 90) return "critical";
    if (ctxPct >= 75) return "warning";
    return "healthy";
  });

  const showConv = $derived(conversationCost > 0 || conversationTokens > 0);

  // Close on outside click / Escape while open.
  $effect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapperEl && !wrapperEl.contains(e.target as Node)) open = false;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") open = false;
    };
    document.addEventListener("click", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  });
</script>

{#if showConv}
  <div class="usage" bind:this={wrapperEl}>
    <button
      class="usage-trigger"
      class:active={open}
      class:warning={ctxLevel === "warning"}
      class:critical={ctxLevel === "critical"}
      type="button"
      aria-expanded={open}
      aria-label={$_("chat.usage.title")}
      title={$_("chat.usage.title")}
      onclick={(e) => {
        e.stopPropagation();
        open = !open;
      }}
    >
      {#if ctxPct !== null}
        <!-- Radial progress ring -->
        <svg
          class="usage-ring"
          width="18"
          height="18"
          viewBox="0 0 22 22"
          aria-hidden="true"
        >
          <circle
            class="usage-ring-track"
            cx="11"
            cy="11"
            r={RING_R}
            fill="none"
            stroke-width="2.6"
          />
          <circle
            class="usage-ring-fill"
            class:warn={ctxLevel === "warning"}
            class:over={ctxLevel === "critical"}
            cx="11"
            cy="11"
            r={RING_R}
            fill="none"
            stroke-width="2.6"
            stroke-linecap="round"
            stroke-dasharray={RING_C}
            stroke-dashoffset={RING_C * (1 - (ctxPct ?? 0) / 100)}
            transform="rotate(-90 11 11)"
          />
        </svg>
        <span class="trigger-label">{$_("chat.usage.contextWindow")}</span>
        <span
          class="trigger-val"
          class:warn={ctxLevel === "warning"}
          class:over={ctxLevel === "critical"}
        >
          {Math.round(ctxPct)}%
        </span>
        {#if conversationCost > 0}
          <span class="trigger-sep">·</span>
          <span class="trigger-cost">{money(conversationCost)}</span>
        {/if}
      {:else}
        <!-- No context window reported: show spend and token pill -->
        <svg
          class="usage-coin"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" />
          <path
            d="M12 7.5v9M9.7 9.2c0-1 1-1.7 2.3-1.7s2.3.7 2.3 1.6c0 2.3-4.6 1.2-4.6 3.6 0 1 1 1.7 2.3 1.7s2.3-.7 2.3-1.6"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
          />
        </svg>
        <span class="trigger-cost">{money(conversationCost)}</span>
        {#if conversationTokens > 0}
          <span class="trigger-sep">·</span>
          <span class="trigger-tokens">{formatTokens(conversationTokens)}</span>
        {/if}
      {/if}
    </button>

    {#if open}
      <div
        class="usage-pop"
        role="dialog"
        aria-modal="false"
        aria-label={$_("chat.usage.title")}
      >
        <!-- Header -->
        <div class="pop-header">
          <div class="pop-header-title-group">
            <div class="pop-icon-badge" aria-hidden="true">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                />
                <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2" />
              </svg>
            </div>
            <div class="pop-title-wrap">
              <h4 class="pop-title">{$_("chat.usage.title")}</h4>
            </div>
          </div>
          <button
            class="pop-close-btn"
            type="button"
            aria-label="Close"
            onclick={() => (open = false)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path
                d="M18 6L6 18M6 6l12 12"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
        </div>

        {#if ctxPct !== null}
          <!-- Context Window (Model Memory) Section -->
          <div class="pop-section">
            <div class="section-header">
              <span class="section-title">{$_("chat.usage.modelMemory")}</span>
              <span class="status-badge status-badge--{ctxLevel}">
                <span class="status-dot"></span>
                {#if ctxLevel === "critical"}
                  {$_("chat.usage.nearLimit")} ({Math.round(ctxPct)}%)
                {:else if ctxLevel === "warning"}
                  {$_("chat.usage.fillingUp")} ({Math.round(ctxPct)}%)
                {:else}
                  {$_("chat.usage.optimal")} ({Math.round(ctxPct)}%)
                {/if}
              </span>
            </div>

            <!-- Progress bar -->
            <div class="context-bar-wrap">
              <div class="context-bar-track">
                <div
                  class="context-bar-fill context-bar-fill--{ctxLevel}"
                  style:width="{Math.min(100, Math.max(ctxPct, 3))}%"
                ></div>
              </div>
            </div>

            <!-- 3 Stat Tiles -->
            <div class="stat-pills-row">
              <div class="stat-pill">
                <span class="stat-pill-label">{$_("chat.usage.used")}</span>
                <span class="stat-pill-val">{formatTokens(conversationTokens)}</span>
              </div>
              <div class="stat-pill">
                <span class="stat-pill-label">{$_("chat.usage.remaining")}</span>
                <span class="stat-pill-val stat-pill-val--accent">
                  {formatTokens(remainingTokens)}
                </span>
              </div>
              <div class="stat-pill">
                <span class="stat-pill-label">{$_("chat.usage.capacity")}</span>
                <span class="stat-pill-val">{formatTokens(contextWindow)}</span>
              </div>
            </div>
          </div>
        {/if}

        <!-- Spend & Tokens Metrics Grid -->
        <div class="metrics-grid">
          <div class="metric-card">
            <div class="metric-icon metric-icon--cost" aria-hidden="true">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" />
                <path
                  d="M12 6.5v11M9.5 8.7c0-1.2 1.1-2.2 2.5-2.2s2.5 1 2.5 2.1c0 2.8-5 1.5-5 4.3 0 1.1 1.1 2.1 2.5 2.1s2.5-1 2.5-2.1"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                />
              </svg>
            </div>
            <div class="metric-content">
              <span class="metric-label">{$_("chat.usage.sessionCost")}</span>
              <span class="metric-val">{money(conversationCost)}</span>
            </div>
          </div>

          <div class="metric-card">
            <div class="metric-icon metric-icon--tokens" aria-hidden="true">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </div>
            <div class="metric-content">
              <span class="metric-label">{$_("chat.usage.totalTokens")}</span>
              <span class="metric-val">{conversationTokens.toLocaleString()}</span>
            </div>
          </div>
        </div>

        <!-- Educational / Informative Guidance Note -->
        <div class="info-callout info-callout--{ctxLevel}">
          <span class="callout-icon" aria-hidden="true">
            {#if ctxLevel === "critical"}
              ⚠️
            {:else if ctxLevel === "warning"}
              ℹ️
            {:else}
              💡
            {/if}
          </span>
          <p class="callout-text">
            {#if ctxLevel === "critical"}
              {$_("chat.usage.criticalDesc")}
            {:else if ctxLevel === "warning"}
              {$_("chat.usage.warningDesc")}
            {:else if ctxPct !== null}
              {$_("chat.usage.optimalDesc")}
            {:else}
              {$_("chat.usage.unspecifiedDesc")}
            {/if}
          </p>
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .usage {
    position: relative;
    display: inline-flex;
  }

  /* ── Sleek Trigger Pill ── */
  .usage-trigger {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 10px;
    border: 1px solid var(--surface-border, rgba(0, 0, 0, 0.08));
    border-radius: 9999px;
    background: var(--surface-card-interactive, var(--surface-card, #ffffff));
    color: var(--text-secondary, #64748b);
    font-size: 11.5px;
    font-weight: 600;
    line-height: 1;
    cursor: pointer;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
    transition:
      background-color 0.15s ease,
      border-color 0.15s ease,
      color 0.15s ease,
      box-shadow 0.15s ease,
      transform 0.1s ease;
  }

  .usage-trigger:hover {
    color: var(--text-primary, #0f172a);
    border-color: var(--text-secondary, #94a3b8);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
  }

  .usage-trigger:active {
    transform: scale(0.98);
  }

  .usage-trigger.active {
    color: var(--text-primary, #0f172a);
    border-color: var(--brand, #4079c5);
    background: var(--surface-card-interactive, #ffffff);
    box-shadow: 0 0 0 2px rgba(64, 121, 197, 0.15);
  }

  .usage-trigger.warning {
    border-color: rgba(245, 158, 11, 0.4);
  }

  .usage-trigger.critical {
    border-color: rgba(239, 68, 68, 0.5);
    animation: triggerPulse 2s infinite ease-in-out;
  }

  @keyframes triggerPulse {
    0%,
    100% {
      box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.2);
    }
    50% {
      box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.2);
    }
  }

  .usage-ring {
    display: block;
    flex-shrink: 0;
    width: 18px;
    height: 18px;
  }

  .usage-ring-track {
    stroke: var(--surface-border, rgba(0, 0, 0, 0.1));
  }

  .usage-ring-fill {
    stroke: #10b981;
    transition:
      stroke-dashoffset 0.35s ease,
      stroke 0.2s ease;
  }

  .usage-ring-fill.warn {
    stroke: #f59e0b;
  }

  .usage-ring-fill.over {
    stroke: #ef4444;
  }

  .usage-coin {
    display: block;
    flex-shrink: 0;
    color: var(--brand, #4079c5);
    opacity: 0.9;
  }

  .trigger-label {
    font-size: 11px;
    font-weight: 500;
    color: var(--text-secondary, #64748b);
  }

  .trigger-val {
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    color: var(--text-primary, #0f172a);
  }

  .trigger-val.warn {
    color: #d97706;
  }

  .trigger-val.over {
    color: #dc2626;
  }

  .trigger-sep {
    color: var(--text-secondary, #94a3b8);
    opacity: 0.6;
    margin: 0 -1px;
  }

  .trigger-cost,
  .trigger-tokens {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    color: var(--text-secondary, #64748b);
  }

  /* ── Popover Dialog ── */
  .usage-pop {
    position: absolute;
    bottom: calc(100% + 10px);
    right: 0;
    z-index: 70;
    width: 326px;
    max-width: calc(100vw - 32px);
    padding: 16px;
    border: 1px solid var(--surface-border, rgba(0, 0, 0, 0.1));
    border-radius: 16px;
    background: var(--surface-card-interactive, var(--surface-card, #ffffff));
    box-shadow:
      0 16px 40px -8px rgba(0, 0, 0, 0.2),
      0 4px 12px rgba(0, 0, 0, 0.06);
    backdrop-filter: blur(16px);
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 14px;
    box-sizing: border-box;
    animation: usagePopIn 0.16s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes usagePopIn {
    from {
      opacity: 0;
      transform: translateY(6px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  /* Popover Header */
  .pop-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .pop-header-title-group {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .pop-icon-badge {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    background: rgba(64, 121, 197, 0.12);
    color: var(--brand, #4079c5);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .pop-title-wrap {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .pop-title {
    margin: 0;
    font-size: 13px;
    font-weight: 700;
    line-height: 1.2;
    color: var(--text-primary, #0f172a);
    letter-spacing: -0.01em;
  }

  .pop-close-btn {
    width: 26px;
    height: 26px;
    border-radius: 6px;
    border: none;
    background: transparent;
    color: var(--text-secondary, #64748b);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition:
      background-color 0.12s ease,
      color 0.12s ease;
    flex-shrink: 0;
  }

  .pop-close-btn:hover {
    background: rgba(0, 0, 0, 0.05);
    color: var(--text-primary, #0f172a);
  }

  /* Context Section */
  .pop-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .section-title {
    font-size: 11.5px;
    font-weight: 600;
    color: var(--text-secondary, #64748b);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 7px;
    border-radius: 9999px;
    font-size: 11px;
    font-weight: 600;
    line-height: 1.2;
    font-variant-numeric: tabular-nums;
  }

  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
  }

  .status-badge--healthy {
    background: rgba(16, 185, 129, 0.12);
    color: #059669;
  }

  .status-badge--warning {
    background: rgba(245, 158, 11, 0.14);
    color: #d97706;
  }

  .status-badge--critical {
    background: rgba(239, 68, 68, 0.14);
    color: #dc2626;
  }

  /* Progress Bar */
  .context-bar-wrap {
    width: 100%;
    padding: 2px 0;
  }

  .context-bar-track {
    width: 100%;
    height: 8px;
    border-radius: 9999px;
    background: var(--surface-border, rgba(0, 0, 0, 0.08));
    overflow: hidden;
  }

  .context-bar-fill {
    height: 100%;
    border-radius: 9999px;
    transition: width 0.35s ease;
  }

  .context-bar-fill--healthy {
    background: linear-gradient(90deg, #10b981 0%, #06b6d4 100%);
  }

  .context-bar-fill--warning {
    background: linear-gradient(90deg, #f59e0b 0%, #ea580c 100%);
  }

  .context-bar-fill--critical {
    background: linear-gradient(90deg, #ef4444 0%, #be123c 100%);
  }

  /* Stat Pills Row */
  .stat-pills-row {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
    margin-top: 2px;
  }

  .stat-pill {
    display: flex;
    flex-direction: column;
    padding: 6px 8px;
    background: rgba(0, 0, 0, 0.025);
    border: 1px solid var(--surface-border, rgba(0, 0, 0, 0.06));
    border-radius: 8px;
  }

  .stat-pill-label {
    font-size: 10px;
    font-weight: 500;
    color: var(--text-secondary, #64748b);
    line-height: 1;
    margin-bottom: 4px;
  }

  .stat-pill-val {
    font-size: 12.5px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--text-primary, #0f172a);
    line-height: 1.1;
  }

  .stat-pill-val--accent {
    color: var(--brand, #4079c5);
  }

  /* Metrics Grid (Cost & Tokens) */
  .metrics-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .metric-card {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 10px;
    background: rgba(0, 0, 0, 0.025);
    border: 1px solid var(--surface-border, rgba(0, 0, 0, 0.06));
  }

  .metric-icon {
    width: 30px;
    height: 30px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .metric-icon--cost {
    background: rgba(16, 185, 129, 0.12);
    color: #10b981;
  }

  .metric-icon--tokens {
    background: rgba(99, 102, 241, 0.12);
    color: #6366f1;
  }

  .metric-content {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .metric-label {
    font-size: 10.5px;
    font-weight: 500;
    color: var(--text-secondary, #64748b);
    line-height: 1.1;
    margin-bottom: 2px;
  }

  .metric-val {
    font-size: 14px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--text-primary, #0f172a);
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Info Callout */
  .info-callout {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 8px;
    font-size: 11px;
    line-height: 1.45;
  }

  .info-callout--healthy {
    background: rgba(16, 185, 129, 0.07);
    color: var(--text-secondary, #475569);
    border: 1px solid rgba(16, 185, 129, 0.15);
  }

  .info-callout--warning {
    background: rgba(245, 158, 11, 0.08);
    color: #92400e;
    border: 1px solid rgba(245, 158, 11, 0.2);
  }

  .info-callout--critical {
    background: rgba(239, 68, 68, 0.08);
    color: #991b1b;
    border: 1px solid rgba(239, 68, 68, 0.2);
  }

  .callout-icon {
    flex-shrink: 0;
    font-size: 12px;
    line-height: 1.2;
    margin-top: 1px;
  }

  .callout-text {
    margin: 0;
    font-weight: 450;
  }

  /* ── Dark Theme Refinements ── */
  :global(.dark) .usage-trigger,
  :global([data-theme="dark"]) .usage-trigger {
    background: var(--surface-card, #12141a);
    border-color: rgba(255, 255, 255, 0.1);
    color: var(--text-secondary, #94a3b8);
  }

  :global(.dark) .usage-trigger:hover,
  :global([data-theme="dark"]) .usage-trigger:hover {
    background: var(--surface-card-interactive, #181b22);
    border-color: rgba(255, 255, 255, 0.2);
    color: #ffffff;
  }

  :global(.dark) .usage-trigger.active,
  :global([data-theme="dark"]) .usage-trigger.active {
    border-color: var(--brand, #60a5fa);
    box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.2);
  }

  :global(.dark) .usage-pop,
  :global([data-theme="dark"]) .usage-pop {
    background: var(--surface-card-interactive, #181b22);
    border-color: rgba(255, 255, 255, 0.12);
    box-shadow: 0 20px 48px -8px rgba(0, 0, 0, 0.6);
  }

  :global(.dark) .pop-close-btn:hover,
  :global([data-theme="dark"]) .pop-close-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #ffffff;
  }

  :global(.dark) .stat-pill,
  :global([data-theme="dark"]) .stat-pill,
  :global(.dark) .metric-card,
  :global([data-theme="dark"]) .metric-card {
    background: rgba(255, 255, 255, 0.04);
    border-color: rgba(255, 255, 255, 0.08);
  }

  :global(.dark) .status-badge--healthy,
  :global([data-theme="dark"]) .status-badge--healthy {
    background: rgba(16, 185, 129, 0.18);
    color: #34d399;
  }

  :global(.dark) .status-badge--warning,
  :global([data-theme="dark"]) .status-badge--warning {
    background: rgba(245, 158, 11, 0.2);
    color: #fbbf24;
  }

  :global(.dark) .status-badge--critical,
  :global([data-theme="dark"]) .status-badge--critical {
    background: rgba(239, 68, 68, 0.2);
    color: #f87171;
  }

  :global(.dark) .info-callout--healthy,
  :global([data-theme="dark"]) .info-callout--healthy {
    background: rgba(16, 185, 129, 0.1);
    color: #a7f3d0;
    border-color: rgba(16, 185, 129, 0.2);
  }

  :global(.dark) .info-callout--warning,
  :global([data-theme="dark"]) .info-callout--warning {
    background: rgba(245, 158, 11, 0.1);
    color: #fde68a;
    border-color: rgba(245, 158, 11, 0.22);
  }

  :global(.dark) .info-callout--critical,
  :global([data-theme="dark"]) .info-callout--critical {
    background: rgba(239, 68, 68, 0.1);
    color: #fecdd3;
    border-color: rgba(239, 68, 68, 0.22);
  }
</style>
